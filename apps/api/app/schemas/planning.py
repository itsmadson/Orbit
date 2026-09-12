"""Contracts for capacity planning."""

import uuid
from datetime import date

from pydantic import BaseModel, Field


class AutoAssignIn(BaseModel):
    project_id: uuid.UUID | None = None
    sprint_id: uuid.UUID | None = None
    start: date | None = None
    end: date | None = None
    limit: int = Field(default=50, ge=1, le=200)
    #: Assign past someone's capacity when nobody has room. Off by default,
    #: so an impossible plan reports itself instead of hiding.
    allow_overflow: bool = False
    #: Dry run unless set: see the plan before it happens.
    commit: bool = False


class SprintPlanIn(BaseModel):
    project_id: uuid.UUID
    name: str | None = None
    goal: str | None = None
    start: date | None = None
    end: date | None = None
    length_days: int = Field(default=14, ge=3, le=60)
    #: Share of raw hours a team actually converts into planned work.
    focus_factor: float = Field(default=0.7, ge=0.1, le=1.0)
    allow_parallel: bool = False
    commit: bool = False
