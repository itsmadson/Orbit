"""Orbit AI.

Layering (see README):

    AI provider  ->  AI service  ->  Orbit AI  ->  company context

Providers are pluggable: the default ``deterministic`` provider ships with the
product and answers from retrieved company records only — it never claims to be
a language model. Point ``AI_PROVIDER`` at ``openai`` (any OpenAI-compatible
endpoint) or ``ollama`` to plug a real model in.

Retrieval always runs as the asking user: only entities whose permission the
user holds are retrieved, so the model can never surface data the user could
not open in the UI.
"""

import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date

import httpx
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.rbac import has_permission, role_permissions
from app.models.identity import User
from app.models.work import Project, Task
from app.services import search as search_service
from app.services.registry import REGISTRY


@dataclass
class AiMessage:
    role: str
    content: str


@dataclass
class AiReply:
    content: str
    provider: str
    model: str | None = None
    grounded: bool = True


class AiProvider(ABC):
    name: str

    @abstractmethod
    def complete(self, messages: list[AiMessage], context: str) -> AiReply: ...

    @property
    def available(self) -> bool:
        return True


class DeterministicProvider(AiProvider):
    """No external model. Summarises the retrieved records and says so."""

    name = "deterministic"

    def complete(self, messages: list[AiMessage], context: str) -> AiReply:
        question = messages[-1].content if messages else ""
        if not context.strip():
            body = (
                f"I could not find anything in the company workspace matching “{question}”.\n\n"
                "No language model is configured, so I answer only from records you have "
                "permission to see. Set AI_PROVIDER (openai or ollama) in .env to enable "
                "generative answers."
            )
            return AiReply(body, self.name, grounded=True)
        body = (
            f"Here is what the workspace holds for “{question}”:\n\n{context}\n\n"
            "No language model is configured, so this is a direct extract of the matching "
            "records rather than a generated answer. Configure AI_PROVIDER in .env to enable "
            "generative responses."
        )
        return AiReply(body, self.name, grounded=True)


class OpenAICompatibleProvider(AiProvider):
    name = "openai"

    @property
    def available(self) -> bool:
        return bool(settings.AI_API_KEY or settings.AI_BASE_URL)

    def complete(self, messages: list[AiMessage], context: str) -> AiReply:
        base = settings.AI_BASE_URL or "https://api.openai.com/v1"
        payload = {
            "model": settings.AI_MODEL or "gpt-4o-mini",
            "messages": [{"role": "system", "content": _system_prompt(context)}]
            + [{"role": m.role, "content": m.content} for m in messages],
            "temperature": 0.2,
        }
        headers = {"Authorization": f"Bearer {settings.AI_API_KEY}"} if settings.AI_API_KEY else {}
        with httpx.Client(timeout=60) as client:
            response = client.post(f"{base.rstrip('/')}/chat/completions", json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
        return AiReply(data["choices"][0]["message"]["content"], self.name, payload["model"])


class OllamaProvider(AiProvider):
    name = "ollama"

    @property
    def available(self) -> bool:
        return bool(settings.AI_BASE_URL)

    def complete(self, messages: list[AiMessage], context: str) -> AiReply:
        base = settings.AI_BASE_URL or "http://localhost:11434"
        payload = {
            "model": settings.AI_MODEL or "llama3.1",
            "stream": False,
            "messages": [{"role": "system", "content": _system_prompt(context)}]
            + [{"role": m.role, "content": m.content} for m in messages],
        }
        with httpx.Client(timeout=120) as client:
            response = client.post(f"{base.rstrip('/')}/api/chat", json=payload)
            response.raise_for_status()
            data = response.json()
        return AiReply(data["message"]["content"], self.name, payload["model"])


PROVIDERS: dict[str, type[AiProvider]] = {
    "deterministic": DeterministicProvider,
    "openai": OpenAICompatibleProvider,
    "ollama": OllamaProvider,
}


def _system_prompt(context: str) -> str:
    return (
        "You are Orbit AI, the assistant inside a company operating system. "
        "Answer only from the company context provided below. If the context does not "
        "contain the answer, say so plainly. Never invent projects, people, numbers or "
        "decisions. Be concise and specific.\n\n"
        f"--- COMPANY CONTEXT ---\n{context}\n--- END CONTEXT ---"
    )


def get_provider() -> AiProvider:
    provider = PROVIDERS.get(settings.AI_PROVIDER, DeterministicProvider)()
    if not provider.available:
        return DeterministicProvider()
    return provider


def provider_status() -> dict:
    provider = get_provider()
    return {
        "provider": provider.name,
        "configured": settings.AI_PROVIDER,
        "model": settings.AI_MODEL or None,
        "generative": provider.name != "deterministic",
    }


def allowed_permissions(user: User) -> set[str]:
    perms = role_permissions(user.role)
    return {
        spec.permission
        for spec in REGISTRY.values()
        if spec.permission in perms or has_permission(user.role, spec.permission)
    }


def build_context(db: Session, user: User, question: str) -> tuple[str, list[dict]]:
    """Retrieve company records the user is allowed to see, as grounding context."""
    hits = search_service.search(
        db, user=user, query=question, limit_per_type=4, allowed=allowed_permissions(user)
    )[:12]
    lines: list[str] = []
    sources: list[dict] = []
    for hit in hits:
        line = f"[{hit['label']}] {hit['title']}"
        if hit.get("status"):
            line += f" (status: {hit['status']})"
        if hit.get("subtitle"):
            line += f" — {hit['subtitle']}"
        lines.append(line)
        sources.append(
            {"type": hit["type"], "id": hit["id"], "label": hit["title"], "url": hit["url"]}
        )
    summary = _company_summary(db, user)
    if summary:
        lines.insert(0, summary)
    return "\n".join(lines), sources


def _company_summary(db: Session, user: User) -> str:
    if not has_permission(user.role, "projects.read"):
        return ""
    active = db.scalar(
        select(func.count(Project.id)).where(
            Project.company_id == user.company_id,
            Project.status == "active",
            Project.deleted_at.is_(None),
        )
    ) or 0
    overdue = db.scalar(
        select(func.count(Task.id)).where(
            Task.company_id == user.company_id,
            Task.due_date < date.today(),
            Task.status.notin_(["done", "cancelled"]),
            Task.deleted_at.is_(None),
        )
    ) or 0
    return f"[Company] {active} active projects, {overdue} overdue tasks, today is {date.today().isoformat()}."


def ask(db: Session, user: User, question: str, history: list[dict] | None = None) -> dict:
    context, sources = build_context(db, user, question)
    messages = [AiMessage(m["role"], m["content"]) for m in (history or [])[-6:]]
    messages.append(AiMessage("user", question))
    provider = get_provider()
    try:
        reply = provider.complete(messages, context)
    except Exception as exc:  # provider outage must not break the product
        reply = AiReply(
            "The configured AI provider could not be reached "
            f"({type(exc).__name__}). Showing retrieved company records instead:\n\n"
            + (context or "No matching records."),
            provider.name,
            grounded=True,
        )
    return {
        "answer": reply.content,
        "provider": reply.provider,
        "model": reply.model,
        "sources": sources,
    }


SUGGESTED_PROMPTS = [
    "What is at risk this week?",
    "Summarise the Atlas project status",
    "Which ideas are ready for R&D?",
    "How much did we spend on infrastructure?",
    "What decisions were made this month?",
    "Who has the heaviest workload?",
]
