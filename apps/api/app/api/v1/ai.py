import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession, require
from app.core.errors import NotFound
from app.models.identity import User
from app.models.system import AiConversation
from app.schemas.system import AiAnswer, AiAskIn, AiStatus
from app.services import ai as ai_service
from app.services import insights

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/status", response_model=AiStatus)
def status(user: CurrentUser):
    return {**ai_service.provider_status(), "suggested_prompts": ai_service.SUGGESTED_PROMPTS}


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


@router.post("/ask", response_model=AiAnswer)
def ask(payload: AiAskIn, db: DbSession, user: Annotated[User, Depends(require("ai.read"))]):
    conversation = None
    history: list[dict] = []
    if payload.conversation_id:
        conversation = db.get(AiConversation, payload.conversation_id)
        if conversation is None or conversation.user_id != user.id:
            raise NotFound("Conversation")
        history = [
            {"role": m["role"], "content": m["content"]} for m in (conversation.messages or [])
        ]
    result = ai_service.ask(db, user, payload.question, history)
    if conversation is None:
        conversation = AiConversation(
            company_id=user.company_id, user_id=user.id,
            title=payload.question[:80], messages=[],
        )
        db.add(conversation)
        db.flush()
    conversation.messages = (conversation.messages or []) + [
        {"role": "user", "content": payload.question},
        {"role": "assistant", "content": result["answer"], "sources": result["sources"]},
    ]
    return {**result, "conversation_id": conversation.id}


@router.get("/insights")
def ai_insights(db: DbSession, user: Annotated[User, Depends(require("ai.read"))]):
    metrics = insights.company_metrics(db, user.company_id, user)
    return {
        "insights": insights.generate_insights(db, user.company_id, metrics),
        "provider": ai_service.provider_status(),
    }
