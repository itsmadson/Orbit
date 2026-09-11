import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import OrbitBase, SoftDeleteMixin


class Company(OrbitBase, SoftDeleteMixin):
    __tablename__ = "companies"

    name: Mapped[str] = mapped_column(String(160), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    logo_emoji: Mapped[str] = mapped_column(String(16), default="🪐")
    default_locale: Mapped[str] = mapped_column(String(8), default="en")
    currency: Mapped[str] = mapped_column(String(8), default="USD")
    settings: Mapped[dict] = mapped_column(JSONB, default=dict)

    departments: Mapped[list["Department"]] = relationship(back_populates="company")


class Department(OrbitBase, SoftDeleteMixin):
    __tablename__ = "departments"
    __table_args__ = (UniqueConstraint("company_id", "name", name="uq_department_name"),)

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    color: Mapped[str] = mapped_column(String(16), default="#6366f1")
    lead_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("departments.id", ondelete="SET NULL")
    )

    company: Mapped[Company] = relationship(back_populates="departments")
    lead: Mapped["User | None"] = relationship(foreign_keys=[lead_id])


class User(OrbitBase, SoftDeleteMixin):
    """A person in the company. Identity + HR profile live together."""

    __tablename__ = "users"
    __table_args__ = (Index("ix_users_company_email", "company_id", "email", unique=True),)

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    email: Mapped[str] = mapped_column(String(200), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(160), nullable=False)
    role: Mapped[str] = mapped_column(String(40), default="employee", index=True)
    title: Mapped[str | None] = mapped_column(String(160))
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("departments.id", ondelete="SET NULL"), index=True
    )
    manager_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    avatar_color: Mapped[str] = mapped_column(String(16), default="#4f46e5")
    locale: Mapped[str] = mapped_column(String(8), default="en")
    theme: Mapped[str] = mapped_column(String(16), default="dark")
    phone: Mapped[str | None] = mapped_column(String(40))
    location: Mapped[str | None] = mapped_column(String(120))
    timezone: Mapped[str] = mapped_column(String(64), default="UTC")
    employment_type: Mapped[str] = mapped_column(String(40), default="full_time")
    hired_at: Mapped[date | None] = mapped_column(Date)
    terminated_at: Mapped[date | None] = mapped_column(Date)
    salary: Mapped[float | None] = mapped_column(Numeric(14, 2))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    bio: Mapped[str | None] = mapped_column(Text)

    department: Mapped[Department | None] = relationship(foreign_keys=[department_id])
    manager: Mapped["User | None"] = relationship(remote_side="User.id", foreign_keys=[manager_id])


class UserSession(OrbitBase):
    """Refresh-token session, revocable server-side."""

    __tablename__ = "user_sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_agent: Mapped[str | None] = mapped_column(String(400))
    ip_address: Mapped[str | None] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PermissionGrant(OrbitBase):
    """Scoped permission on top of the coarse role, e.g. finance.write on a project."""

    __tablename__ = "permission_grants"
    __table_args__ = (
        Index("ix_grant_lookup", "user_id", "scope_type", "scope_id"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    permission: Mapped[str] = mapped_column(String(80), nullable=False)
    scope_type: Mapped[str] = mapped_column(String(40), default="company")
    scope_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))
