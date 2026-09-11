import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import OrbitBase, SoftDeleteMixin

IDEA_STATUSES = [
    "draft", "submitted", "discussion", "evaluation", "approved",
    "prototype", "rd", "product", "rejected", "archived",
]
EXPERIMENT_STATUSES = ["planned", "running", "completed", "failed", "validated", "archived"]


class Idea(OrbitBase, SoftDeleteMixin):
    __tablename__ = "ideas"

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(24), default="draft", index=True)
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    tags: Mapped[list] = mapped_column(JSONB, default=list)
    business_value: Mapped[int] = mapped_column(Integer, default=3)      # 1..5
    technical_feasibility: Mapped[int] = mapped_column(Integer, default=3)
    expected_impact: Mapped[int] = mapped_column(Integer, default=3)
    effort: Mapped[int] = mapped_column(Integer, default=3)
    estimated_cost: Mapped[float | None] = mapped_column(Numeric(14, 2))
    score: Mapped[float] = mapped_column(Numeric(6, 2), default=0)
    vote_count: Mapped[int] = mapped_column(Integer, default=0)
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL")
    )


class IdeaVote(OrbitBase):
    __tablename__ = "idea_votes"
    __table_args__ = (UniqueConstraint("idea_id", "user_id", name="uq_idea_vote"),)

    idea_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("ideas.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    value: Mapped[int] = mapped_column(Integer, default=1)


class IdeaContributor(OrbitBase):
    __tablename__ = "idea_contributors"
    __table_args__ = (UniqueConstraint("idea_id", "user_id", name="uq_idea_contributor"),)

    idea_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("ideas.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )


class BrainstormBoard(OrbitBase, SoftDeleteMixin):
    __tablename__ = "brainstorm_boards"

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(24), default="open")
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL")
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    categories: Mapped[list] = mapped_column(JSONB, default=list)


class BrainstormCard(OrbitBase):
    __tablename__ = "brainstorm_cards"

    board_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("brainstorm_boards.id", ondelete="CASCADE"), index=True
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str | None] = mapped_column(String(80))
    color: Mapped[str] = mapped_column(String(16), default="#6366f1")
    x: Mapped[int] = mapped_column(Integer, default=0)
    y: Mapped[int] = mapped_column(Integer, default=0)
    votes: Mapped[int] = mapped_column(Integer, default=0)
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    idea_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("ideas.id", ondelete="SET NULL")
    )


class ResearchProject(OrbitBase, SoftDeleteMixin):
    __tablename__ = "research_projects"

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    research_question: Mapped[str | None] = mapped_column(Text)
    hypothesis: Mapped[str | None] = mapped_column(Text)
    objectives: Mapped[list] = mapped_column(JSONB, default=list)
    methods: Mapped[str | None] = mapped_column(Text)
    findings: Mapped[str | None] = mapped_column(Text)
    conclusion: Mapped[str | None] = mapped_column(Text)
    references: Mapped[list] = mapped_column(JSONB, default=list)
    status: Mapped[str] = mapped_column(String(24), default="active", index=True)
    lead_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    idea_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("ideas.id", ondelete="SET NULL")
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL")
    )
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    budget: Mapped[float | None] = mapped_column(Numeric(14, 2))


class Experiment(OrbitBase):
    __tablename__ = "experiments"

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    research_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("research_projects.id", ondelete="CASCADE"), index=True
    )
    number: Mapped[int] = mapped_column(Integer, default=1)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    hypothesis: Mapped[str | None] = mapped_column(Text)
    method: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(24), default="planned", index=True)
    result: Mapped[str | None] = mapped_column(Text)
    metrics: Mapped[dict] = mapped_column(JSONB, default=dict)
    dataset_ref: Mapped[str | None] = mapped_column(String(400))
    researcher_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
