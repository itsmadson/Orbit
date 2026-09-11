import uuid
from datetime import date, datetime
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class UserRef(ORMModel):
    id: uuid.UUID
    full_name: str
    email: str | None = None
    title: str | None = None
    avatar_color: str = "#4f46e5"
    role: str | None = None


class Ref(BaseModel):
    id: uuid.UUID
    name: str


class PageMeta(BaseModel):
    total: int
    page: int
    page_size: int
    pages: int


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int


class Message(BaseModel):
    message: str
    ok: bool = True


class CommentIn(BaseModel):
    body: str
    mentions: list[uuid.UUID] = []
    parent_id: uuid.UUID | None = None


class CommentOut(ORMModel):
    id: uuid.UUID
    body: str
    entity_type: str
    entity_id: uuid.UUID
    author: UserRef | None = None
    mentions: list[Any] = []
    parent_id: uuid.UUID | None = None
    created_at: datetime


class AttachmentOut(ORMModel):
    id: uuid.UUID
    filename: str
    content_type: str
    size: int
    entity_type: str
    entity_id: uuid.UUID
    created_at: datetime
    uploaded_by: UserRef | None = None


class ActivityOut(ORMModel):
    id: uuid.UUID
    action: str
    entity_type: str
    entity_id: uuid.UUID | None = None
    summary: str | None = None
    changes: dict = {}
    actor: UserRef | None = None
    ip_address: str | None = None
    created_at: datetime


class RelationNode(BaseModel):
    type: str
    id: str
    label: str
    title: str
    status: str | None = None
    url: str
    icon: str


class RelationOut(BaseModel):
    relation_id: str
    rel_type: str
    direction: str
    node: RelationNode
    meta: dict = {}


class RelationIn(BaseModel):
    from_type: str
    from_id: uuid.UUID
    rel_type: str = "relates_to"
    to_type: str
    to_id: uuid.UUID
    meta: dict = {}


class DateRange(BaseModel):
    start: date | None = None
    end: date | None = None
