import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import OrbitBase, SoftDeleteMixin


class Meeting(OrbitBase, SoftDeleteMixin):
    __tablename__ = "meetings"

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    agenda: Mapped[list] = mapped_column(JSONB, default=list)  # [{title, owner, minutes}]
    notes: Mapped[str | None] = mapped_column(Text)
    location: Mapped[str | None] = mapped_column(String(200))
    meeting_url: Mapped[str | None] = mapped_column(String(400))
    status: Mapped[str] = mapped_column(String(24), default="scheduled", index=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), index=True
    )
    organizer_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )


class MeetingParticipant(OrbitBase):
    __tablename__ = "meeting_participants"
    __table_args__ = (UniqueConstraint("meeting_id", "user_id", name="uq_meeting_participant"),)

    meeting_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("meetings.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    response: Mapped[str] = mapped_column(String(16), default="pending")  # pending|yes|no|maybe
    attended: Mapped[bool] = mapped_column(Boolean, default=False)


class ActionItem(OrbitBase):
    __tablename__ = "action_items"

    meeting_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("meetings.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    due_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(24), default="open")
    task_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("tasks.id", ondelete="SET NULL")
    )


class WorkflowDefinition(OrbitBase, SoftDeleteMixin):
    """Declarative workflow: states, transitions, approval steps and a form schema."""

    __tablename__ = "workflow_definitions"
    __table_args__ = (UniqueConstraint("company_id", "key", name="uq_workflow_key"),)

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    key: Mapped[str] = mapped_column(String(60), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    icon: Mapped[str] = mapped_column(String(16), default="📋")
    category: Mapped[str] = mapped_column(String(40), default="general")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    form_schema: Mapped[list] = mapped_column(JSONB, default=list)
    # [{key,label,type,required,options,help}]
    states: Mapped[list] = mapped_column(JSONB, default=list)
    # [{key,label,type: start|approval|action|terminal,approver_role,approver_id}]
    transitions: Mapped[list] = mapped_column(JSONB, default=list)
    # [{from,to,action,label}]


class WorkflowRequest(OrbitBase, SoftDeleteMixin):
    __tablename__ = "workflow_requests"

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    definition_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("workflow_definitions.id", ondelete="CASCADE"), index=True
    )
    number: Mapped[int] = mapped_column(Integer, default=1)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    state: Mapped[str] = mapped_column(String(60), default="submitted", index=True)
    status: Mapped[str] = mapped_column(String(24), default="open", index=True)  # open|approved|rejected|cancelled
    data: Mapped[dict] = mapped_column(JSONB, default=dict)
    requester_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL")
    )
    amount: Mapped[float | None] = mapped_column(Numeric(14, 2))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Approval(OrbitBase):
    __tablename__ = "approvals"

    request_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("workflow_requests.id", ondelete="CASCADE"), index=True
    )
    state_key: Mapped[str] = mapped_column(String(60))
    step: Mapped[int] = mapped_column(Integer, default=1)
    approver_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    approver_role: Mapped[str | None] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(24), default="pending", index=True)
    comment: Mapped[str | None] = mapped_column(Text)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
