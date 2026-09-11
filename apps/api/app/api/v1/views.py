"""Saved views: the handful of queries a person actually runs all week."""

import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import or_, select

from app.api.helpers import get_or_404
from app.core.deps import DbSession, require
from app.core.errors import Forbidden
from app.models.identity import User
from app.models.system import SavedView
from app.schemas.common import Message
from app.schemas.system import SavedViewIn, SavedViewOut, SavedViewUpdate
from app.services.registry import REGISTRY

router = APIRouter(tags=["views"])


def view_out(view: SavedView, user: User) -> dict:
    return {
        "id": view.id, "entity": view.entity, "name": view.name,
        "filters": view.filters or {}, "is_shared": view.is_shared,
        "is_default": view.is_default, "icon": view.icon,
        "order_index": view.order_index, "use_count": view.use_count,
        "owner_id": view.owner_id, "is_mine": view.owner_id == user.id,
        "created_at": view.created_at,
    }


@router.get("/views", response_model=list[SavedViewOut])
def list_views(db: DbSession, user: Annotated[User, Depends(require("projects.read"))],
               entity: str | None = None):
    """Your own views plus any the company shares."""
    stmt = select(SavedView).where(
        SavedView.company_id == user.company_id,
        or_(SavedView.owner_id == user.id, SavedView.is_shared.is_(True)),
    )
    if entity:
        stmt = stmt.where(SavedView.entity == entity)
    rows = db.scalars(
        stmt.order_by(SavedView.order_index, SavedView.use_count.desc(), SavedView.name)
    ).all()
    return [view_out(row, user) for row in rows]


@router.post("/views", response_model=SavedViewOut, status_code=201)
def create_view(payload: SavedViewIn, db: DbSession,
                user: Annotated[User, Depends(require("projects.read"))]):
    if payload.entity not in REGISTRY and payload.entity not in ("task", "deal", "letter"):
        raise Forbidden(f"Unknown entity: {payload.entity}")
    if payload.is_default:
        db.query(SavedView).filter(
            SavedView.owner_id == user.id, SavedView.entity == payload.entity
        ).update({"is_default": False})
    view = SavedView(company_id=user.company_id, owner_id=user.id, **payload.model_dump())
    db.add(view)
    db.flush()
    return view_out(view, user)


@router.patch("/views/{view_id}", response_model=SavedViewOut)
def update_view(view_id: uuid.UUID, payload: SavedViewUpdate, db: DbSession,
                user: Annotated[User, Depends(require("projects.read"))]):
    view = get_or_404(db, SavedView, view_id, user.company_id, "View")
    if view.owner_id != user.id:
        raise Forbidden("This view belongs to someone else.")
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("is_default"):
        db.query(SavedView).filter(
            SavedView.owner_id == user.id, SavedView.entity == view.entity,
            SavedView.id != view.id,
        ).update({"is_default": False})
    for key, value in changes.items():
        setattr(view, key, value)
    db.flush()
    return view_out(view, user)


@router.post("/views/{view_id}/use", response_model=SavedViewOut)
def record_use(view_id: uuid.UUID, db: DbSession,
               user: Annotated[User, Depends(require("projects.read"))]):
    """Counts a use, so the views someone leans on float to the front."""
    view = get_or_404(db, SavedView, view_id, user.company_id, "View")
    view.use_count += 1
    db.flush()
    return view_out(view, user)


@router.delete("/views/{view_id}", response_model=Message)
def delete_view(view_id: uuid.UUID, db: DbSession,
                user: Annotated[User, Depends(require("projects.read"))]):
    view = get_or_404(db, SavedView, view_id, user.company_id, "View")
    if view.owner_id != user.id:
        raise Forbidden("This view belongs to someone else.")
    db.delete(view)
    return Message(message="View deleted")
