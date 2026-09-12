"""Customer-facing support: tickets, their conversation, and uptime monitoring.

Two things a customer is entitled to see about you: whether their requests are
moving, and whether the thing you run for them is up. Both live here, and both
are readable by a login scoped to a single CRM company.
"""

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import OrbitBase, SoftDeleteMixin

TICKET_STATUSES = [
    "new",                # nobody has looked yet
    "open",               # being worked
    "pending_customer",   # waiting on them, so the clock should not count
    "resolved",           # fixed, awaiting confirmation
    "closed",
]
TICKET_PRIORITIES = ["urgent", "high", "normal", "low"]
TICKET_SOURCES = ["portal", "email", "phone", "internal", "monitor"]

#: Hours to first response / resolution, by priority. The pair a customer
#: actually experiences: how long until a human replied, and until it was fixed.
SLA_TARGETS = {
    "urgent": (1, 8),
    "high": (4, 24),
    "normal": (8, 72),
    "low": (24, 168),
}


class Ticket(OrbitBase, SoftDeleteMixin):
    __tablename__ = "tickets"
    __table_args__ = (
        Index("ix_tickets_company_status", "company_id", "status"),
        UniqueConstraint("company_id", "number", name="uq_tickets_company_id"),
    )

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    number: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    subject: Mapped[str] = mapped_column(String(300), nullable=False)
    body: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(24), default="new", index=True)
    priority: Mapped[str] = mapped_column(String(16), default="normal", index=True)
    category: Mapped[str | None] = mapped_column(String(60))
    source: Mapped[str] = mapped_column(String(16), default="portal")

    crm_company_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("crm_companies.id", ondelete="SET NULL"), index=True
    )
    #: The customer login that raised it, when it came through the portal.
    requester_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    contact_email: Mapped[str | None] = mapped_column(String(200))
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )

    # The SLA clock, recorded rather than recomputed, so history stays honest
    # even when the policy changes later.
    response_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolution_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    first_response_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reopened_count: Mapped[int] = mapped_column(Integer, default=0)

    project_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), index=True
    )
    #: Set when the ticket was turned into internal work.
    task_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("tasks.id", ondelete="SET NULL")
    )
    monitor_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("monitors.id", ondelete="SET NULL")
    )
    tags: Mapped[list] = mapped_column(JSONB, default=list)
    satisfaction: Mapped[int | None] = mapped_column(Integer)


class TicketMessage(OrbitBase):
    """One turn in the conversation. Internal notes never reach the portal."""

    __tablename__ = "ticket_messages"

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    ticket_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("tickets.id", ondelete="CASCADE"), index=True
    )
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    #: An internal note is visible to staff only; the filter is applied on the
    #: server, never by hiding it in the client.
    is_internal: Mapped[bool] = mapped_column(Boolean, default=False)
    is_from_customer: Mapped[bool] = mapped_column(Boolean, default=False)


class Monitor(OrbitBase, SoftDeleteMixin):
    """An HTTP endpoint we watch on a customer's behalf."""

    __tablename__ = "monitors"

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    crm_company_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("crm_companies.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    url: Mapped[str] = mapped_column(String(600), nullable=False)
    method: Mapped[str] = mapped_column(String(8), default="GET")
    expected_status: Mapped[int] = mapped_column(Integer, default=200)
    #: Substring that must appear in the body; a 200 that renders an error page
    #: is still an outage.
    expected_body: Mapped[str | None] = mapped_column(String(300))
    interval_seconds: Mapped[int] = mapped_column(Integer, default=300)
    timeout_seconds: Mapped[int] = mapped_column(Integer, default=10)
    #: How many consecutive failures before it counts as down, so one dropped
    #: packet does not page anybody.
    failure_threshold: Mapped[int] = mapped_column(Integer, default=2)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_public: Mapped[bool] = mapped_column(Boolean, default=True)   # visible in the portal

    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    next_check_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    status: Mapped[str] = mapped_column(String(16), default="unknown")  # up|down|degraded|unknown
    consecutive_failures: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str | None] = mapped_column(String(400))
    last_response_ms: Mapped[int | None] = mapped_column(Integer)
    #: Rolling counters, so uptime does not require scanning every check ever run.
    total_checks: Mapped[int] = mapped_column(Integer, default=0)
    failed_checks: Mapped[int] = mapped_column(Integer, default=0)


class MonitorCheck(OrbitBase):
    """One probe. Kept for the response-time graph and the incident timeline."""

    __tablename__ = "monitor_checks"
    __table_args__ = (Index("ix_monitor_checks_monitor_time", "monitor_id", "created_at"),)

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    monitor_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("monitors.id", ondelete="CASCADE"), index=True
    )
    ok: Mapped[bool] = mapped_column(Boolean, default=True)
    status_code: Mapped[int | None] = mapped_column(Integer)
    response_ms: Mapped[int | None] = mapped_column(Integer)
    error: Mapped[str | None] = mapped_column(String(400))


class MonitorIncident(OrbitBase):
    """A period a monitor was down, opened and closed by the checker itself."""

    __tablename__ = "monitor_incidents"

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    monitor_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("monitors.id", ondelete="CASCADE"), index=True
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    cause: Mapped[str | None] = mapped_column(String(400))
    ticket_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("tickets.id", ondelete="SET NULL")
    )
