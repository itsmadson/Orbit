import uuid
from datetime import date, datetime

from pydantic import BaseModel

from app.schemas.common import ORMModel, UserRef


class MilestoneIn(BaseModel):
    name: str
    description: str | None = None
    due_date: date | None = None
    status: str = "planned"
    progress: int = 0


class MilestoneOut(ORMModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    description: str | None = None
    due_date: date | None = None
    status: str
    progress: int


class ProjectMemberIn(BaseModel):
    user_id: uuid.UUID
    role: str = "member"


class ProjectMemberOut(ORMModel):
    id: uuid.UUID
    role: str
    user: UserRef


class ProjectIn(BaseModel):
    name: str
    key: str | None = None
    description: str | None = None
    status: str = "planning"
    priority: str = "medium"
    health: str = "on_track"
    color: str = "#6366f1"
    icon: str = "🚀"
    start_date: date | None = None
    end_date: date | None = None
    progress: int = 0
    budget: float | None = None
    lead_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None
    member_ids: list[uuid.UUID] = []


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: str | None = None
    priority: str | None = None
    health: str | None = None
    color: str | None = None
    icon: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    progress: int | None = None
    budget: float | None = None
    lead_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None


class ProjectStats(BaseModel):
    total_tasks: int = 0
    done_tasks: int = 0
    overdue_tasks: int = 0
    open_tasks: int = 0
    spent: float = 0
    budget: float = 0
    remaining: float = 0
    documents: int = 0
    meetings: int = 0
    decisions: int = 0
    members: int = 0


class ProjectOut(ORMModel):
    id: uuid.UUID
    key: str
    name: str
    description: str | None = None
    status: str
    priority: str
    health: str
    color: str
    icon: str
    start_date: date | None = None
    end_date: date | None = None
    progress: int
    budget: float | None = None
    lead: UserRef | None = None
    department_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime
    members: list[ProjectMemberOut] = []
    milestones: list[MilestoneOut] = []
    stats: ProjectStats | None = None


class ProjectListOut(ORMModel):
    id: uuid.UUID
    key: str
    name: str
    status: str
    priority: str
    health: str
    color: str
    icon: str
    progress: int
    end_date: date | None = None
    budget: float | None = None
    lead: UserRef | None = None
    open_tasks: int = 0
    total_tasks: int = 0
    member_count: int = 0


class SprintIn(BaseModel):
    name: str
    goal: str | None = None
    project_id: uuid.UUID | None = None
    status: str = "planned"
    start_date: date | None = None
    end_date: date | None = None


class SprintOut(ORMModel):
    id: uuid.UUID
    name: str
    goal: str | None = None
    project_id: uuid.UUID | None = None
    status: str
    start_date: date | None = None
    end_date: date | None = None
    task_count: int = 0


class TaskIn(BaseModel):
    title: str
    description: str | None = None
    project_id: uuid.UUID | None = None
    type: str = "task"
    status: str = "todo"
    priority: str = "medium"
    assignee_id: uuid.UUID | None = None
    epic_id: uuid.UUID | None = None
    parent_id: uuid.UUID | None = None
    sprint_id: uuid.UUID | None = None
    milestone_id: uuid.UUID | None = None
    estimate: float | None = None
    due_date: date | None = None
    labels: list[str] = []
    depends_on: list[uuid.UUID] = []


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    project_id: uuid.UUID | None = None
    type: str | None = None
    status: str | None = None
    priority: str | None = None
    assignee_id: uuid.UUID | None = None
    epic_id: uuid.UUID | None = None
    sprint_id: uuid.UUID | None = None
    milestone_id: uuid.UUID | None = None
    estimate: float | None = None
    spent: float | None = None
    due_date: date | None = None
    labels: list[str] | None = None
    order_index: int | None = None
    is_blocked: bool | None = None


class TaskMove(BaseModel):
    status: str
    order_index: int = 0


class ProjectRef(BaseModel):
    id: uuid.UUID
    key: str
    name: str
    color: str
    icon: str


class TaskOut(ORMModel):
    id: uuid.UUID
    key: str
    title: str
    description: str | None = None
    type: str
    status: str
    priority: str
    project_id: uuid.UUID | None = None
    project: ProjectRef | None = None
    assignee: UserRef | None = None
    reporter: UserRef | None = None
    epic_id: uuid.UUID | None = None
    parent_id: uuid.UUID | None = None
    sprint_id: uuid.UUID | None = None
    milestone_id: uuid.UUID | None = None
    estimate: float | None = None
    spent: float | None = None
    due_date: date | None = None
    labels: list = []
    order_index: int
    is_blocked: bool
    comment_count: int = 0
    subtask_count: int = 0
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None


class TaskDetailOut(TaskOut):
    subtasks: list[TaskOut] = []
    blocked_by: list[TaskOut] = []
    blocks: list[TaskOut] = []


class BoardColumn(BaseModel):
    key: str
    label: str
    tasks: list[TaskOut]
    count: int
