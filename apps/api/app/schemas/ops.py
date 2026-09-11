import uuid
from datetime import date, datetime

from pydantic import BaseModel

from app.schemas.common import ORMModel, UserRef


class AgendaItem(BaseModel):
    title: str
    owner: str | None = None
    minutes: int | None = None


class MeetingIn(BaseModel):
    title: str
    description: str | None = None
    agenda: list[AgendaItem] = []
    notes: str | None = None
    location: str | None = None
    meeting_url: str | None = None
    starts_at: datetime
    ends_at: datetime | None = None
    project_id: uuid.UUID | None = None
    participant_ids: list[uuid.UUID] = []


class MeetingUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    agenda: list[AgendaItem] | None = None
    notes: str | None = None
    location: str | None = None
    meeting_url: str | None = None
    status: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    project_id: uuid.UUID | None = None
    participant_ids: list[uuid.UUID] | None = None


class ParticipantOut(ORMModel):
    id: uuid.UUID
    user: UserRef
    response: str
    attended: bool


class ActionItemIn(BaseModel):
    title: str
    assignee_id: uuid.UUID | None = None
    due_date: date | None = None


class ActionItemOut(ORMModel):
    id: uuid.UUID
    meeting_id: uuid.UUID
    title: str
    assignee: UserRef | None = None
    due_date: date | None = None
    status: str
    task_id: uuid.UUID | None = None


class MeetingOut(ORMModel):
    id: uuid.UUID
    title: str
    description: str | None = None
    agenda: list = []
    location: str | None = None
    meeting_url: str | None = None
    status: str
    starts_at: datetime
    ends_at: datetime | None = None
    project_id: uuid.UUID | None = None
    project_name: str | None = None
    organizer: UserRef | None = None
    participant_count: int = 0
    action_item_count: int = 0
    created_at: datetime


class MeetingDetail(MeetingOut):
    notes: str | None = None
    participants: list[ParticipantOut] = []
    action_items: list[ActionItemOut] = []
    decision_ids: list[uuid.UUID] = []


class FormField(BaseModel):
    key: str
    label: str
    type: str = "text"
    required: bool = False
    options: list[str] = []
    help: str | None = None


class WorkflowState(BaseModel):
    key: str
    label: str
    type: str = "approval"
    approver_role: str | None = None
    approver_id: uuid.UUID | None = None
    result: str | None = None


class WorkflowDefinitionIn(BaseModel):
    key: str
    name: str
    description: str | None = None
    icon: str = "📋"
    category: str = "general"
    form_schema: list[FormField] = []
    states: list[WorkflowState] = []
    transitions: list[dict] = []


class WorkflowDefinitionOut(ORMModel):
    id: uuid.UUID
    key: str
    name: str
    description: str | None = None
    icon: str
    category: str
    is_active: bool
    form_schema: list = []
    states: list = []
    transitions: list = []
    request_count: int = 0
    open_count: int = 0


class RequestIn(BaseModel):
    definition_id: uuid.UUID
    title: str | None = None
    data: dict = {}
    project_id: uuid.UUID | None = None
    amount: float | None = None


class ApprovalOut(ORMModel):
    id: uuid.UUID
    state_key: str
    step: int
    approver: UserRef | None = None
    approver_role: str | None = None
    status: str
    comment: str | None = None
    decided_at: datetime | None = None
    created_at: datetime


class RequestAction(BaseModel):
    action: str
    comment: str | None = None


class RequestOut(ORMModel):
    id: uuid.UUID
    number: int
    title: str
    state: str
    state_label: str | None = None
    status: str
    data: dict = {}
    amount: float | None = None
    requester: UserRef | None = None
    definition_id: uuid.UUID
    definition_name: str | None = None
    definition_icon: str | None = None
    project_id: uuid.UUID | None = None
    created_at: datetime
    completed_at: datetime | None = None
    awaiting_me: bool = False


class RequestDetail(RequestOut):
    approvals: list[ApprovalOut] = []
    available_actions: list[dict] = []
    form_schema: list = []
    states: list = []
    can_act: bool = False
