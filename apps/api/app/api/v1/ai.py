import logging
import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.orm.attributes import flag_modified

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession, require
from app.core.errors import BadRequest, NotFound, OrbitError
from app.core.i18n import request_locale, tr
from app.models.identity import User
from app.models.system import AiConversation, AuditLog
from app.schemas.system import AiActionDecision, AiAnswer, AiAskIn, AiStatus
from app.services import ai as ai_service
from app.services import assistant, audit, insights
from app.services.integrations import sync as integration_sync

router = APIRouter(prefix="/ai", tags=["ai"])
logger = logging.getLogger("orbit.assistant")

SUGGESTED = {
    "en": [
        "What is at risk this week?",
        "Create a task “Review the Q4 budget” for me, due Friday",
        "Summarise the Atlas project status",
        "Which of my tasks are overdue? Move them to In progress",
        "Which ideas are ready for R&D?",
        "Who has the heaviest workload?",
    ],
    "fa": [
        "این هفته چه چیزهایی در معرض خطر است؟",
        "یک وظیفه با عنوان «بازبینی بودجهٔ فصل چهارم» برای من بساز، موعد جمعه",
        "وضعیت پروژهٔ Atlas را خلاصه کن",
        "کدام وظایف من عقب افتاده‌اند؟ آن‌ها را به «در حال انجام» ببر",
        "کدام ایده‌ها برای تحقیق و توسعه آماده‌اند؟",
        "چه کسی بیشترین حجم کار را دارد؟",
    ],
}


class LimitReached(OrbitError):
    code = "ai_limit"

    def __init__(self, detail: str):
        super().__init__(detail, 429)


def _used_today(db, user: User) -> int:
    start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    return db.scalar(select(func.count(AuditLog.id)).where(
        AuditLog.actor_id == user.id, AuditLog.action == "ai_message",
        AuditLog.created_at >= start)) or 0


def _token(request: Request) -> str:
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:]
    return request.cookies.get("orbit_access", "")


def _run_for(request: Request, user: User) -> assistant.Run:
    return assistant.Run(
        user=user, token=_token(request), locale=request_locale(request, user.locale),
        forwarded_for=request.headers.get("x-forwarded-for"),
    )


@router.get("/status", response_model=AiStatus)
def status(request: Request, db: DbSession, user: CurrentUser):
    locale = request_locale(request, user.locale)
    agent = assistant.status()
    if agent["agent"]:
        return {
            "provider": agent["provider"], "configured": "assistant", "model": agent["model"],
            "generative": True, "agent": True, "engine": agent["engine"],
            "daily_limit": agent["daily_limit"], "used_today": _used_today(db, user),
            "suggested_prompts": SUGGESTED[locale],
        }
    return {**ai_service.provider_status(), "agent": False,
            "suggested_prompts": [p for p in SUGGESTED[locale] if "«" not in p and "“" not in p]}


@router.get("/conversations")
def list_conversations(db: DbSession, user: CurrentUser):
    rows = db.scalars(
        select(AiConversation).where(AiConversation.user_id == user.id)
        .order_by(AiConversation.updated_at.desc()).limit(30)
    ).all()
    return [
        {"id": str(c.id), "title": c.title, "message_count": len(c.messages or []),
         "updated_at": c.updated_at.isoformat()}
        for c in rows
    ]


@router.get("/conversations/{conversation_id}")
def get_conversation(conversation_id: uuid.UUID, db: DbSession, user: CurrentUser):
    conversation = db.get(AiConversation, conversation_id)
    if conversation is None or conversation.user_id != user.id:
        raise NotFound("Conversation")
    return {"id": str(conversation.id), "title": conversation.title,
            "messages": conversation.messages or []}


@router.delete("/conversations/{conversation_id}")
def delete_conversation(conversation_id: uuid.UUID, db: DbSession, user: CurrentUser):
    conversation = db.get(AiConversation, conversation_id)
    if conversation is None or conversation.user_id != user.id:
        raise NotFound("Conversation")
    db.delete(conversation)
    return {"message": "Conversation deleted"}


def _load(db, user: User, conversation_id: uuid.UUID | None) -> AiConversation | None:
    if not conversation_id:
        return None
    conversation = db.get(AiConversation, conversation_id)
    if conversation is None or conversation.user_id != user.id:
        raise NotFound("Conversation")
    return conversation


def _history(conversation: AiConversation | None) -> list[dict]:
    return [{"role": m["role"], "content": m.get("content", ""),
             "steps": m.get("steps") or [], "actions": m.get("actions") or []}
            for m in ((conversation.messages or []) if conversation else [])]


async def _agent_reply(db, run: assistant.Run, question: str, history: list[dict]) -> dict:
    """One agent turn, with the provider's failures turned into a readable answer."""
    connected = integration_sync.connected_providers(db, run.user.company_id)
    # The agent's own API calls run in other sessions; do not sit on a transaction.
    db.commit()
    try:
        text = await assistant.answer(run, question, history, connected)
    except Exception as exc:  # a provider outage must not break the product
        logger.warning("assistant failed: %s", exc)
        reason = type(exc).__name__ if not isinstance(exc, assistant.ModelError) else str(exc)[:160]
        text = tr(run.locale, "ai.provider_down", reason=reason)
    if not text and run.actions:
        text = tr(run.locale, "ai.needs_confirmation")
    agent = assistant.status()
    return {
        "answer": text or "…", "provider": agent["provider"], "model": agent["model"],
        "sources": run.sources, "steps": run.steps,
        "actions": [a.as_dict() for a in run.actions], "changed": run.changed,
    }


@router.post("/ask", response_model=AiAnswer)
async def ask(payload: AiAskIn, request: Request, db: DbSession,
              user: Annotated[User, Depends(require("ai.read"))]):
    question = payload.question.strip()
    if not question:
        raise BadRequest("Ask a question first")
    locale = request_locale(request, user.locale)
    conversation = _load(db, user, payload.conversation_id)
    history = _history(conversation)

    if assistant.enabled():
        if len(question) > settings.ASSISTANT_MAX_INPUT:
            raise BadRequest(tr(locale, "ai.too_long", limit=settings.ASSISTANT_MAX_INPUT))
        if _used_today(db, user) >= settings.ASSISTANT_DAILY_LIMIT:
            raise LimitReached(tr(locale, "ai.daily_limit", limit=settings.ASSISTANT_DAILY_LIMIT))
        audit.record(db, actor=user, action="ai_message", entity_type="ai",
                     summary=question[:200])
        result = await _agent_reply(db, _run_for(request, user), question, history)
    else:
        result = {**ai_service.ask(db, user, question, history),
                  "steps": [], "actions": [], "changed": False}

    if conversation is None:
        conversation = AiConversation(
            company_id=user.company_id, user_id=user.id, title=question[:80], messages=[])
        db.add(conversation)
        db.flush()
    conversation.messages = (conversation.messages or []) + [
        {"role": "user", "content": question},
        {"role": "assistant", "content": result["answer"], "sources": result["sources"],
         "steps": result["steps"], "actions": result["actions"]},
    ]
    return {**result, "conversation_id": conversation.id}


@router.post("/conversations/{conversation_id}/actions/{action_id}", response_model=AiAnswer)
async def decide_action(conversation_id: uuid.UUID, action_id: str, payload: AiActionDecision,
                        request: Request, db: DbSession,
                        user: Annotated[User, Depends(require("ai.read"))]):
    """Approve or reject a write the assistant proposed.

    The action runs with the approving user's own token, so approval can never
    grant more than the user could do by hand.
    """
    if payload.decision not in ("approve", "reject"):
        raise BadRequest("Decision must be approve or reject")
    conversation = _load(db, user, conversation_id)
    messages = list(conversation.messages or [])
    found = next(
        ((message, action) for message in messages for action in message.get("actions", [])
         if action.get("id") == action_id), None)
    if found is None:
        raise NotFound("Action")
    message, stored = found
    if stored.get("status") != "pending":
        raise BadRequest("This action was already decided")

    run = _run_for(request, user)
    if payload.decision == "reject":
        stored["status"] = "rejected"
        answer = tr(run.locale, "ai.cancelled")
        result = {"answer": answer, "steps": [], "actions": [], "sources": [], "changed": False}
    else:
        # Claim it before running, so a double click cannot execute it twice.
        stored["status"] = "running"
        conversation.messages = messages
        flag_modified(conversation, "messages")
        db.commit()
        action = assistant.PendingAction(
            id=stored["id"], method=stored["method"], path=stored["path"],
            query=stored.get("query"), body=stored.get("body"), summary=stored.get("summary", ""))
        if assistant.is_blocked(action.path):
            raise BadRequest("That endpoint is not available to the assistant")
        await assistant.execute_action(run, action)
        audit.record(db, actor=user, action="ai_action", entity_type="ai",
                     summary=f"Approved: {action.summary[:200]}",
                     changes={"status": action.status})
        stored["status"], stored["result"] = action.status, action.result
        follow_up = (
            f"[The user approved the pending action `{action.method} {action.path}`. "
            f"Result: {action.result}] Tell the user the outcome in one or two sentences. "
            "Do not repeat the action.")
        result = await _agent_reply(db, run, follow_up, _history(conversation))
        result["changed"] = result["changed"] or action.status == "done"

    agent = assistant.status()
    conversation = db.get(AiConversation, conversation_id)
    conversation.messages = messages + [
        {"role": "assistant", "content": result["answer"], "sources": result.get("sources", []),
         "steps": result.get("steps", []), "actions": result.get("actions", [])},
    ]
    flag_modified(conversation, "messages")
    return {"provider": agent["provider"], "model": agent["model"], **result,
            "conversation_id": conversation.id}


@router.get("/insights")
def ai_insights(request: Request, db: DbSession,
                user: Annotated[User, Depends(require("ai.read"))]):
    metrics = insights.company_metrics(db, user.company_id, user)
    return {
        "insights": insights.localized(
            insights.generate_insights(db, user.company_id, metrics),
            request_locale(request, user.locale)),
        "provider": ai_service.provider_status(),
    }
