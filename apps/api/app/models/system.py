import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import OrbitBase, SoftDeleteMixin

# Entity types participating in the company graph.
ENTITY_TYPES = [
    "user", "project", "task", "idea", "research", "experiment", "document",
    "decision", "meeting", "crm_company", "contract", "invoice", "transaction",
    "asset", "goal", "request", "brainstorm_board", "purchase_order",
]


class Comment(OrbitBase, SoftDeleteMixin):
    """Polymorphic comment attached to any entity in the graph."""

    __tablename__ = "comments"
    __table_args__ = (Index("ix_comments_entity", "entity_type", "entity_id"),)

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    entity_type: Mapped[str] = mapped_column(String(40), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    mentions: Mapped[list] = mapped_column(JSONB, default=list)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("comments.id", ondelete="CASCADE")
    )


class Attachment(OrbitBase, SoftDeleteMixin):
    __tablename__ = "attachments"
    __table_args__ = (Index("ix_attachments_entity", "entity_type", "entity_id"),)

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    entity_type: Mapped[str] = mapped_column(String(40), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    filename: Mapped[str] = mapped_column(String(300), nullable=False)
    content_type: Mapped[str] = mapped_column(String(160), default="application/octet-stream")
    size: Mapped[int] = mapped_column(BigInteger, default=0)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    uploaded_by_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )


class Notification(OrbitBase):
    """One row per thing needing a user's attention; powers the universal inbox."""

    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notifications_user_read", "user_id", "read_at"),)

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[str] = mapped_column(String(48), nullable=False)
    # task_assigned|approval_request|mention|comment|document_review|leave_request|
    # expense_approval|meeting_invite|rd_result|customer_response|system_alert|deadline
    category: Mapped[str] = mapped_column(String(24), default="general", index=True)
    # tasks|approvals|finance|hr|projects|mentions|system
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    body: Mapped[str | None] = mapped_column(Text)
    entity_type: Mapped[str | None] = mapped_column(String(40))
    entity_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))
    url: Mapped[str | None] = mapped_column(String(400))
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    priority: Mapped[str] = mapped_column(String(16), default="normal")
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuditLog(OrbitBase):
    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_entity", "entity_type", "entity_id"),)

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    action: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    # created|updated|deleted|approved|rejected|assigned|status_changed|login|permission_changed
    entity_type: Mapped[str] = mapped_column(String(40), nullable=False)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))
    summary: Mapped[str | None] = mapped_column(String(500))
    changes: Mapped[dict] = mapped_column(JSONB, default=dict)  # {field: {from, to}}
    ip_address: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(400))


class Relation(OrbitBase):
    """Generic typed edge of the company graph."""

    __tablename__ = "relations"
    __table_args__ = (
        UniqueConstraint(
            "from_type", "from_id", "rel_type", "to_type", "to_id", name="uq_relation"
        ),
        Index("ix_relation_from", "from_type", "from_id"),
        Index("ix_relation_to", "to_type", "to_id"),
    )

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    from_type: Mapped[str] = mapped_column(String(40), nullable=False)
    from_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    rel_type: Mapped[str] = mapped_column(String(40), nullable=False)
    to_type: Mapped[str] = mapped_column(String(40), nullable=False)
    to_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    meta: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )


class Integration(OrbitBase):
    __tablename__ = "integrations"
    __table_args__ = (UniqueConstraint("company_id", "provider", name="uq_integration_provider"),)

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    provider: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="available")
    # available|connected|error|coming_soon
    config: Mapped[dict] = mapped_column(JSONB, default=dict)  # never returned raw to clients
    connected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AiConversation(OrbitBase):
    __tablename__ = "ai_conversations"

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(240), default="New conversation")
    messages: Mapped[list] = mapped_column(JSONB, default=list)
    # [{role, content, sources: [{type,id,label}], at}]
