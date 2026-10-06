"""Task statuses are data, not a constant.

Every query that used to say ``status == "done"`` asks this module instead, by
*category*: a company that adds a "QA" column still gets a correct velocity
chart, because "QA" is a ``started`` state and reports only read categories.

The helpers return SQL subqueries so callers keep a single round-trip.
"""

import re
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.work import DEFAULT_TASK_STATUSES, STATUS_CATEGORIES, Task, TaskStatus

#: Categories that mean "nobody needs to work on this any more".
CLOSED = ("done", "cancelled")
ACTIVE = ("open", "started")


def ensure_defaults(db: Session, company_id: uuid.UUID) -> None:
    """Give a company the six built-in columns the first time it is asked."""
    exists = db.scalar(
        select(func.count(TaskStatus.id)).where(TaskStatus.company_id == company_id)
    )
    if exists:
        return
    for index, (key, name, name_fa, category, color) in enumerate(DEFAULT_TASK_STATUSES):
        db.add(TaskStatus(
            company_id=company_id, key=key, name=name, name_fa=name_fa,
            category=category, color=color, order_index=index, is_system=True,
        ))
    db.flush()


def all_statuses(db: Session, company_id: uuid.UUID) -> list[TaskStatus]:
    ensure_defaults(db, company_id)
    return list(db.scalars(
        select(TaskStatus).where(TaskStatus.company_id == company_id)
        .order_by(TaskStatus.order_index, TaskStatus.created_at)
    ).all())


def get(db: Session, company_id: uuid.UUID, key: str) -> TaskStatus | None:
    ensure_defaults(db, company_id)
    return db.scalar(select(TaskStatus).where(
        TaskStatus.company_id == company_id, TaskStatus.key == key))


def keys_in(company_id, *categories: str):
    """Subquery of status keys in the given categories, for ``Task.status.in_()``."""
    return select(TaskStatus.key).where(
        TaskStatus.company_id == company_id, TaskStatus.category.in_(categories)
    ).scalar_subquery()


def is_open(company_id=None):
    """Tasks still owed work. Correlates on the task's own company by default."""
    return Task.status.notin_(keys_in(Task.company_id if company_id is None else company_id, *CLOSED))


def is_done(company_id=None):
    return Task.status.in_(keys_in(Task.company_id if company_id is None else company_id, "done"))


def is_cancelled(company_id=None):
    return Task.status.in_(
        keys_in(Task.company_id if company_id is None else company_id, "cancelled"))


def in_category(*categories: str, company_id=None):
    return Task.status.in_(
        keys_in(Task.company_id if company_id is None else company_id, *categories))


def category_map(db: Session, company_id: uuid.UUID) -> dict[str, str]:
    return {s.key: s.category for s in all_statuses(db, company_id)}


def category_of(db: Session, company_id: uuid.UUID, key: str) -> str:
    return category_map(db, company_id).get(key, "open")


def first_key(db: Session, company_id: uuid.UUID, category: str, fallback: str = "todo") -> str:
    """The leftmost column of a category — where "start this" or "close this" lands."""
    for status in all_statuses(db, company_id):
        if status.category == category:
            return status.key
    return fallback


def label(db: Session, company_id: uuid.UUID, key: str, locale: str = "en") -> str:
    status = get(db, company_id, key)
    if status is None:
        return key.replace("_", " ").capitalize()
    return (status.name_fa if locale == "fa" and status.name_fa else status.name)


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
    return slug[:20]


def unique_key(db: Session, company_id: uuid.UUID, name: str) -> str:
    base = slugify(name) or "status"
    taken = {s.key for s in all_statuses(db, company_id)}
    candidate, counter = base, 2
    while candidate in taken:
        candidate = f"{base[:20]}_{counter}"
        counter += 1
    return candidate


__all__ = [
    "ACTIVE", "CLOSED", "STATUS_CATEGORIES", "all_statuses", "category_map", "category_of",
    "ensure_defaults", "first_key", "get", "in_category", "is_cancelled", "is_done", "is_open",
    "keys_in", "label", "slugify", "unique_key",
]
