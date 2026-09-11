import uuid
from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import ORMModel, UserRef


class SpaceIn(BaseModel):
    name: str
    slug: str | None = None
    description: str | None = None
    icon: str = "📚"
    color: str = "#6366f1"
    visibility: str = "company"


class SpaceOut(ORMModel):
    id: uuid.UUID
    name: str
    slug: str
    description: str | None = None
    icon: str
    color: str
    visibility: str
    document_count: int = 0


class DocumentIn(BaseModel):
    title: str
    space_id: uuid.UUID | None = None
    parent_id: uuid.UUID | None = None
    doc_type: str = "documentation"
    content: str | None = None
    status: str = "draft"
    tags: list[str] = []
    project_id: uuid.UUID | None = None


class DocumentUpdate(BaseModel):
    title: str | None = None
    space_id: uuid.UUID | None = None
    parent_id: uuid.UUID | None = None
    doc_type: str | None = None
    content: str | None = None
    status: str | None = None
    tags: list[str] | None = None
    project_id: uuid.UUID | None = None
    change_note: str | None = None


class DocumentOut(ORMModel):
    id: uuid.UUID
    title: str
    space_id: uuid.UUID | None = None
    parent_id: uuid.UUID | None = None
    doc_type: str
    excerpt: str | None = None
    status: str
    tags: list = []
    version: int
    author: UserRef | None = None
    project_id: uuid.UUID | None = None
    child_count: int = 0
    created_at: datetime
    updated_at: datetime


class DocumentDetail(DocumentOut):
    content: str | None = None
    space_name: str | None = None
    breadcrumb: list[dict] = []


class DocumentVersionOut(ORMModel):
    id: uuid.UUID
    version: int
    title: str
    author: UserRef | None = None
    change_note: str | None = None
    created_at: datetime


class DecisionOption(BaseModel):
    title: str
    pros: str | None = None
    cons: str | None = None
    chosen: bool = False


class DecisionIn(BaseModel):
    title: str
    problem: str | None = None
    context: str | None = None
    options: list[DecisionOption] = []
    decision: str | None = None
    reason: str | None = None
    consequences: str | None = None
    status: str = "proposed"
    project_id: uuid.UUID | None = None
    meeting_id: uuid.UUID | None = None
    participants: list[uuid.UUID] = []


class DecisionUpdate(BaseModel):
    title: str | None = None
    problem: str | None = None
    context: str | None = None
    options: list[DecisionOption] | None = None
    decision: str | None = None
    reason: str | None = None
    consequences: str | None = None
    status: str | None = None
    project_id: uuid.UUID | None = None
    participants: list[uuid.UUID] | None = None


class DecisionOut(ORMModel):
    id: uuid.UUID
    title: str
    problem: str | None = None
    context: str | None = None
    options: list = []
    decision: str | None = None
    reason: str | None = None
    consequences: str | None = None
    status: str
    decided_by: UserRef | None = None
    decided_at: datetime | None = None
    project_id: uuid.UUID | None = None
    project_name: str | None = None
    meeting_id: uuid.UUID | None = None
    participants: list = []
    participant_refs: list[UserRef] = []
    created_at: datetime
