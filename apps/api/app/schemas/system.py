import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import ORMModel, UserRef


class NotificationOut(ORMModel):
    id: uuid.UUID
    type: str
    category: str
    title: str
    body: str | None = None
    entity_type: str | None = None
    entity_id: uuid.UUID | None = None
    url: str | None = None
    actor: UserRef | None = None
    priority: str
    read_at: datetime | None = None
    created_at: datetime


class InboxCounts(BaseModel):
    all: int = 0
    unread: int = 0
    mentions: int = 0
    tasks: int = 0
    approvals: int = 0
    finance: int = 0
    hr: int = 0
    projects: int = 0
    system: int = 0


class SearchHit(BaseModel):
    type: str
    label: str
    id: str
    title: str
    subtitle: str | None = None
    status: str | None = None
    url: str
    icon: str


class SearchResults(BaseModel):
    query: str
    hits: list[SearchHit]
    grouped: dict[str, list[SearchHit]] = {}


class AiAskIn(BaseModel):
    question: str
    conversation_id: uuid.UUID | None = None


class AiSource(BaseModel):
    type: str
    id: str
    label: str
    url: str


class AiAnswer(BaseModel):
    answer: str
    provider: str
    model: str | None = None
    sources: list[AiSource] = []
    conversation_id: uuid.UUID | None = None


class AiStatus(BaseModel):
    provider: str
    configured: str
    model: str | None = None
    generative: bool
    suggested_prompts: list[str] = []


class IntegrationOut(ORMModel):
    id: uuid.UUID | None = None
    provider: str
    status: str
    connected_at: datetime | None = None
    name: str | None = None
    description: str | None = None
    category: str | None = None


class DashboardOut(BaseModel):
    greeting: str
    metrics: dict
    insights: list[dict]
    deadlines: list[dict]
    workload: list[dict]
    decisions: list[dict]
    meetings: list[dict]
    my_tasks: list[dict]
    activity: list[dict]


class SavedViewIn(BaseModel):
    entity: str
    name: str = Field(min_length=1, max_length=120)
    filters: dict = Field(default_factory=dict)
    is_shared: bool = False
    is_default: bool = False
    icon: str | None = None
    order_index: int = 0


class SavedViewUpdate(BaseModel):
    name: str | None = None
    filters: dict | None = None
    is_shared: bool | None = None
    is_default: bool | None = None
    icon: str | None = None
    order_index: int | None = None


class SavedViewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    entity: str
    name: str
    filters: dict
    is_shared: bool
    is_default: bool
    icon: str | None = None
    order_index: int = 0
    use_count: int = 0
    owner_id: uuid.UUID
    is_mine: bool = False
    created_at: datetime
