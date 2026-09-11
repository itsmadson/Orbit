"""Notification service abstraction.

In-app notifications are written to Postgres and power the universal inbox.
Outbound channels (email, Slack, ...) implement ``NotificationChannel`` and are
registered here; the default deployment only enables the in-app channel.
"""

import uuid
from abc import ABC, abstractmethod
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.identity import User
from app.models.system import Notification

CATEGORY_BY_TYPE = {
    "task_assigned": "tasks",
    "task_status": "tasks",
    "task_comment": "tasks",
    "mention": "mentions",
    "comment": "mentions",
    "approval_request": "approvals",
    "approval_result": "approvals",
    "expense_approval": "finance",
    "invoice_due": "finance",
    "leave_request": "hr",
    "leave_result": "hr",
    "document_review": "projects",
    "meeting_invite": "projects",
    "project_update": "projects",
    "rd_result": "projects",
    "customer_response": "projects",
    "deadline": "tasks",
    "system_alert": "system",
}


class NotificationChannel(ABC):
    name: str

    @abstractmethod
    def send(self, notification: Notification, recipient: User) -> None: ...


class InAppChannel(NotificationChannel):
    name = "in_app"

    def send(self, notification: Notification, recipient: User) -> None:
        # Persisted by the caller's session; nothing else to do.
        return None


class EmailChannel(NotificationChannel):
    """Placeholder: wire an SMTP/provider client here to enable email delivery."""

    name = "email"
    enabled = False

    def send(self, notification: Notification, recipient: User) -> None:
        return None


_CHANNELS: list[NotificationChannel] = [InAppChannel()]


def notify(
    db: Session,
    *,
    user_id: uuid.UUID,
    company_id: uuid.UUID,
    type: str,
    title: str,
    body: str | None = None,
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
    url: str | None = None,
    actor_id: uuid.UUID | None = None,
    priority: str = "normal",
) -> Notification | None:
    if actor_id and actor_id == user_id:
        return None  # never notify someone about their own action
    notification = Notification(
        company_id=company_id,
        user_id=user_id,
        type=type,
        category=CATEGORY_BY_TYPE.get(type, "general"),
        title=title,
        body=body,
        entity_type=entity_type,
        entity_id=entity_id,
        url=url,
        actor_id=actor_id,
        priority=priority,
    )
    db.add(notification)
    db.flush()
    recipient = db.get(User, user_id)
    if recipient:
        for channel in _CHANNELS:
            channel.send(notification, recipient)
    return notification


def notify_many(db: Session, user_ids: list[uuid.UUID], **kwargs) -> None:
    for uid in {u for u in user_ids if u}:
        notify(db, user_id=uid, **kwargs)


def unread_count(db: Session, user_id: uuid.UUID) -> int:
    stmt = select(Notification).where(
        Notification.user_id == user_id,
        Notification.read_at.is_(None),
        Notification.archived_at.is_(None),
    )
    return len(db.scalars(stmt).all())


def mark_read(db: Session, notification: Notification) -> Notification:
    if notification.read_at is None:
        notification.read_at = datetime.now(UTC)
    return notification
