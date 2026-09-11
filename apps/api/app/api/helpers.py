"""Serialization helpers shared by the routers."""

import uuid
from typing import Any, Iterable

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import NotFound
from app.models.identity import User
from app.models.system import Comment


def user_ref(user: User | None) -> dict | None:
    if user is None:
        return None
    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "title": user.title,
        "avatar_color": user.avatar_color,
        "role": user.role,
    }


def refs(db: Session, ids: Iterable[Any]) -> list[dict]:
    out = []
    for raw in ids or []:
        try:
            uid = raw if isinstance(raw, uuid.UUID) else uuid.UUID(str(raw))
        except (ValueError, AttributeError):
            continue
        user = db.get(User, uid)
        if user:
            out.append(user_ref(user))
    return out


def get_or_404(db: Session, model, entity_id: uuid.UUID, company_id: uuid.UUID | None = None, what: str = "Resource"):
    obj = db.get(model, entity_id)
    if obj is None:
        raise NotFound(what)
    if getattr(obj, "deleted_at", None) is not None:
        raise NotFound(what)
    if company_id and getattr(obj, "company_id", company_id) != company_id:
        raise NotFound(what)
    return obj


def comment_count(db: Session, entity_type: str, entity_id: uuid.UUID) -> int:
    return db.scalar(
        select(func.count(Comment.id)).where(
            Comment.entity_type == entity_type,
            Comment.entity_id == entity_id,
            Comment.deleted_at.is_(None),
        )
    ) or 0


def apply_updates(obj, payload: dict) -> dict:
    """Apply a partial update and return the field-level before/after values."""
    before = {}
    for field, value in payload.items():
        if not hasattr(obj, field):
            continue
        current = getattr(obj, field)
        if current != value:
            before[field] = current
            setattr(obj, field, value)
    return before


def snapshot(obj, fields: list[str]) -> dict:
    return {f: getattr(obj, f, None) for f in fields}


def to_float(value) -> float:
    return float(value or 0)
