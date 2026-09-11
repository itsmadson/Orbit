import uuid
from datetime import date, datetime

from pydantic import BaseModel

from app.schemas.common import ORMModel, UserRef


class IdeaIn(BaseModel):
    title: str
    description: str | None = None
    status: str = "draft"
    tags: list[str] = []
    business_value: int = 3
    technical_feasibility: int = 3
    expected_impact: int = 3
    effort: int = 3
    estimated_cost: float | None = None
    contributor_ids: list[uuid.UUID] = []


class IdeaUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None
    tags: list[str] | None = None
    business_value: int | None = None
    technical_feasibility: int | None = None
    expected_impact: int | None = None
    effort: int | None = None
    estimated_cost: float | None = None


class IdeaOut(ORMModel):
    id: uuid.UUID
    title: str
    description: str | None = None
    status: str
    author: UserRef | None = None
    tags: list = []
    business_value: int
    technical_feasibility: int
    expected_impact: int
    effort: int
    estimated_cost: float | None = None
    score: float
    vote_count: int
    project_id: uuid.UUID | None = None
    contributors: list[UserRef] = []
    comment_count: int = 0
    has_voted: bool = False
    created_at: datetime
    updated_at: datetime


class IdeaConvert(BaseModel):
    target: str = "project"  # project | research
    name: str | None = None


class BrainstormBoardIn(BaseModel):
    name: str
    description: str | None = None
    project_id: uuid.UUID | None = None
    categories: list[str] = []


class BrainstormCardIn(BaseModel):
    text: str
    category: str | None = None
    color: str = "#6366f1"
    x: int = 0
    y: int = 0


class BrainstormCardUpdate(BaseModel):
    text: str | None = None
    category: str | None = None
    color: str | None = None
    x: int | None = None
    y: int | None = None


class BrainstormCardOut(ORMModel):
    id: uuid.UUID
    board_id: uuid.UUID
    text: str
    category: str | None = None
    color: str
    x: int
    y: int
    votes: int
    author: UserRef | None = None
    idea_id: uuid.UUID | None = None
    created_at: datetime


class BrainstormBoardOut(ORMModel):
    id: uuid.UUID
    name: str
    description: str | None = None
    status: str
    project_id: uuid.UUID | None = None
    categories: list = []
    created_by: UserRef | None = None
    card_count: int = 0
    created_at: datetime


class BrainstormBoardDetail(BrainstormBoardOut):
    cards: list[BrainstormCardOut] = []


class ResearchIn(BaseModel):
    title: str
    research_question: str | None = None
    hypothesis: str | None = None
    objectives: list[str] = []
    methods: str | None = None
    findings: str | None = None
    conclusion: str | None = None
    references: list[str] = []
    status: str = "active"
    lead_id: uuid.UUID | None = None
    idea_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    start_date: date | None = None
    end_date: date | None = None
    budget: float | None = None


class ResearchUpdate(ResearchIn):
    title: str | None = None


class ResearchOut(ORMModel):
    id: uuid.UUID
    title: str
    research_question: str | None = None
    hypothesis: str | None = None
    objectives: list = []
    methods: str | None = None
    findings: str | None = None
    conclusion: str | None = None
    references: list = []
    status: str
    lead: UserRef | None = None
    idea_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    start_date: date | None = None
    end_date: date | None = None
    budget: float | None = None
    experiment_count: int = 0
    running_experiments: int = 0
    created_at: datetime


class ExperimentIn(BaseModel):
    name: str
    research_id: uuid.UUID | None = None
    hypothesis: str | None = None
    method: str | None = None
    status: str = "planned"
    result: str | None = None
    metrics: dict = {}
    dataset_ref: str | None = None
    researcher_id: uuid.UUID | None = None


class ExperimentUpdate(BaseModel):
    name: str | None = None
    hypothesis: str | None = None
    method: str | None = None
    status: str | None = None
    result: str | None = None
    metrics: dict | None = None
    dataset_ref: str | None = None
    researcher_id: uuid.UUID | None = None


class ExperimentOut(ORMModel):
    id: uuid.UUID
    number: int
    name: str
    research_id: uuid.UUID | None = None
    research_title: str | None = None
    hypothesis: str | None = None
    method: str | None = None
    status: str
    result: str | None = None
    metrics: dict = {}
    dataset_ref: str | None = None
    researcher: UserRef | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None
    created_at: datetime
