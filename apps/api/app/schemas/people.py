import uuid
from datetime import date, datetime

from pydantic import BaseModel

from app.schemas.common import ORMModel, UserRef


class LeaveIn(BaseModel):
    type: str = "vacation"
    start_date: date
    end_date: date
    reason: str | None = None
    user_id: uuid.UUID | None = None


class LeaveDecision(BaseModel):
    status: str  # approved | rejected
    note: str | None = None


class LeaveOut(ORMModel):
    id: uuid.UUID
    user: UserRef | None = None
    type: str
    start_date: date
    end_date: date
    days: float
    reason: str | None = None
    status: str
    approver: UserRef | None = None
    decided_at: datetime | None = None
    created_at: datetime


class AttendanceOut(ORMModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_name: str | None = None
    work_date: date
    check_in: datetime | None = None
    check_out: datetime | None = None
    hours: float
    status: str


class AttendanceIn(BaseModel):
    work_date: date
    status: str = "present"
    hours: float = 8
    user_id: uuid.UUID | None = None


class OnboardingIn(BaseModel):
    user_id: uuid.UUID
    kind: str = "onboarding"
    title: str
    owner_id: uuid.UUID | None = None
    due_date: date | None = None


class OnboardingOut(ORMModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_name: str | None = None
    kind: str
    title: str
    owner: UserRef | None = None
    due_date: date | None = None
    status: str
    order_index: int


class SkillIn(BaseModel):
    name: str
    category: str | None = None


class SkillOut(ORMModel):
    id: uuid.UUID
    name: str
    category: str | None = None
    people_count: int = 0


class UserSkillIn(BaseModel):
    skill_id: uuid.UUID | None = None
    name: str | None = None
    level: int = 3


class UserSkillOut(ORMModel):
    id: uuid.UUID
    skill_id: uuid.UUID
    name: str
    category: str | None = None
    level: int


class HrSummary(BaseModel):
    headcount: int = 0
    departments: int = 0
    on_leave_today: int = 0
    pending_leave: int = 0
    new_hires_90d: int = 0
    open_onboarding: int = 0
    by_department: list[dict] = []
    by_employment_type: list[dict] = []


class KeyResultIn(BaseModel):
    title: str
    metric: str | None = None
    start_value: float = 0
    current_value: float = 0
    target_value: float = 100
    unit: str | None = None
    owner_id: uuid.UUID | None = None
    task_id: uuid.UUID | None = None


class KeyResultUpdate(BaseModel):
    title: str | None = None
    current_value: float | None = None
    target_value: float | None = None
    owner_id: uuid.UUID | None = None


class KeyResultOut(ORMModel):
    id: uuid.UUID
    goal_id: uuid.UUID
    title: str
    metric: str | None = None
    start_value: float
    current_value: float
    target_value: float
    unit: str | None = None
    owner: UserRef | None = None
    task_id: uuid.UUID | None = None
    progress: int = 0


class GoalIn(BaseModel):
    objective: str
    description: str | None = None
    level: str = "company"
    parent_id: uuid.UUID | None = None
    owner_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    period: str = "Q1"
    due_date: date | None = None
    key_results: list[KeyResultIn] = []


class GoalUpdate(BaseModel):
    objective: str | None = None
    description: str | None = None
    level: str | None = None
    parent_id: uuid.UUID | None = None
    owner_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    period: str | None = None
    status: str | None = None
    due_date: date | None = None


class GoalOut(ORMModel):
    id: uuid.UUID
    objective: str
    description: str | None = None
    level: str
    parent_id: uuid.UUID | None = None
    owner: UserRef | None = None
    department_id: uuid.UUID | None = None
    department_name: str | None = None
    project_id: uuid.UUID | None = None
    project_name: str | None = None
    period: str
    status: str
    progress: int
    due_date: date | None = None
    key_results: list[KeyResultOut] = []
    child_count: int = 0
    created_at: datetime
