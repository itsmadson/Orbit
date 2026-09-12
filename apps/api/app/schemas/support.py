"""Contracts for tickets, their messages, and uptime monitors."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class TicketIn(BaseModel):
    subject: str = Field(min_length=1, max_length=300)
    body: str | None = None
    priority: str = "normal"
    category: str | None = None
    source: str = "internal"
    crm_company_id: uuid.UUID | None = None
    requester_id: uuid.UUID | None = None
    contact_email: str | None = None
    assignee_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    tags: list[str] = Field(default_factory=list)


class TicketUpdate(BaseModel):
    subject: str | None = None
    status: str | None = None
    priority: str | None = None
    category: str | None = None
    assignee_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    tags: list[str] | None = None
    satisfaction: int | None = Field(default=None, ge=1, le=5)


class TicketMessageIn(BaseModel):
    body: str = Field(min_length=1)
    #: Internal notes never reach the portal; ignored for customer logins.
    is_internal: bool = False


class MonitorIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    url: str = Field(min_length=1, max_length=600)
    method: str = "GET"
    expected_status: int = Field(default=200, ge=100, le=599)
    expected_body: str | None = None
    interval_seconds: int = Field(default=300, ge=30, le=86_400)
    timeout_seconds: int = Field(default=10, ge=1, le=120)
    failure_threshold: int = Field(default=2, ge=1, le=10)
    crm_company_id: uuid.UUID | None = None
    is_active: bool = True
    is_public: bool = True


class MonitorUpdate(BaseModel):
    name: str | None = None
    url: str | None = None
    expected_status: int | None = None
    expected_body: str | None = None
    interval_seconds: int | None = Field(default=None, ge=30, le=86_400)
    timeout_seconds: int | None = Field(default=None, ge=1, le=120)
    failure_threshold: int | None = Field(default=None, ge=1, le=10)
    is_active: bool | None = None
    is_public: bool | None = None
