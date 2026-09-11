import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select

from app.api.helpers import comment_count, get_or_404, user_ref
from app.core.deps import DbSession, require
from app.core.errors import NotFound
from app.core.pagination import Paging, as_page
from app.models.identity import User
from app.models.innovation import (
    BrainstormBoard, BrainstormCard, Idea, IdeaContributor, IdeaVote, ResearchProject,
)
from app.models.work import Project
from app.schemas.common import Message
from app.schemas.innovation import (
    BrainstormBoardDetail, BrainstormBoardIn, BrainstormBoardOut, BrainstormCardIn,
    BrainstormCardOut, BrainstormCardUpdate, IdeaConvert, IdeaIn, IdeaOut, IdeaUpdate,
)
from app.services import audit, graph, notifications

router = APIRouter(tags=["innovation"])

IDEA_PIPELINE = [
    "draft", "submitted", "discussion", "evaluation", "approved",
    "prototype", "rd", "product", "rejected", "archived",
]


def score_of(idea: Idea) -> float:
    """Weighted RICE-style score: value and impact pull up, effort pulls down."""
    numerator = (idea.business_value * 2) + idea.expected_impact + idea.technical_feasibility
    return round(numerator / max(idea.effort, 1) * 3, 2)


def serialize(db, idea: Idea, viewer: User | None = None) -> dict:
    contributor_ids = db.scalars(
        select(IdeaContributor.user_id).where(IdeaContributor.idea_id == idea.id)
    ).all()
    voted = False
    if viewer:
        voted = bool(db.scalar(select(IdeaVote).where(
            IdeaVote.idea_id == idea.id, IdeaVote.user_id == viewer.id)))
    return {
        "id": idea.id,
        "title": idea.title,
        "description": idea.description,
        "status": idea.status,
        "author": user_ref(db.get(User, idea.author_id)) if idea.author_id else None,
        "tags": idea.tags or [],
        "business_value": idea.business_value,
        "technical_feasibility": idea.technical_feasibility,
        "expected_impact": idea.expected_impact,
        "effort": idea.effort,
        "estimated_cost": float(idea.estimated_cost) if idea.estimated_cost is not None else None,
        "score": float(idea.score),
        "vote_count": idea.vote_count,
        "project_id": idea.project_id,
        "contributors": [user_ref(db.get(User, c)) for c in contributor_ids if db.get(User, c)],
        "comment_count": comment_count(db, "idea", idea.id),
        "has_voted": voted,
        "created_at": idea.created_at,
        "updated_at": idea.updated_at,
    }


@router.get("/ideas")
def list_ideas(
    db: DbSession, user: Annotated[User, Depends(require("ideas.read"))], paging: Paging,
    q: str | None = None,
    status: Annotated[list[str] | None, Query()] = None,
    author_id: uuid.UUID | None = None,
    tag: str | None = None,
    sort: str = "score",
):
    stmt = select(Idea).where(Idea.company_id == user.company_id, Idea.deleted_at.is_(None))
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Idea.title.ilike(like), Idea.description.ilike(like)))
    if status:
        stmt = stmt.where(Idea.status.in_(status))
    if author_id:
        stmt = stmt.where(Idea.author_id == author_id)
    if tag:
        stmt = stmt.where(Idea.tags.contains([tag]))
    order = {
        "score": Idea.score.desc(), "votes": Idea.vote_count.desc(),
        "recent": Idea.created_at.desc(), "title": Idea.title,
    }.get(sort, Idea.score.desc())
    stmt = stmt.order_by(order)
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.scalars(stmt.limit(paging.page_size).offset(paging.offset)).all()
    return as_page([serialize(db, i, user) for i in rows], total, paging)


@router.get("/ideas/pipeline")
def pipeline(db: DbSession, user: Annotated[User, Depends(require("ideas.read"))]):
    counts = dict(
        db.execute(
            select(Idea.status, func.count(Idea.id))
            .where(Idea.company_id == user.company_id, Idea.deleted_at.is_(None))
            .group_by(Idea.status)
        ).all()
    )
    stages = []
    for status in IDEA_PIPELINE:
        rows = db.scalars(
            select(Idea).where(
                Idea.company_id == user.company_id, Idea.status == status,
                Idea.deleted_at.is_(None)
            ).order_by(Idea.score.desc()).limit(20)
        ).all()
        stages.append(
            {
                "key": status,
                "label": status.replace("_", " ").title(),
                "count": counts.get(status, 0),
                "ideas": [serialize(db, i, user) for i in rows],
            }
        )
    return {"stages": stages}


@router.get("/ideas/{idea_id}", response_model=IdeaOut)
def get_idea(idea_id: uuid.UUID, db: DbSession,
             user: Annotated[User, Depends(require("ideas.read"))]):
    idea = get_or_404(db, Idea, idea_id, user.company_id, "Idea")
    return serialize(db, idea, user)


@router.post("/ideas", response_model=IdeaOut, status_code=201)
def create_idea(payload: IdeaIn, db: DbSession,
                user: Annotated[User, Depends(require("ideas.write"))]):
    data = payload.model_dump(exclude={"contributor_ids"})
    idea = Idea(company_id=user.company_id, author_id=user.id, **data)
    idea.score = score_of(idea)
    db.add(idea)
    db.flush()
    for contributor_id in payload.contributor_ids:
        if db.get(User, contributor_id):
            db.add(IdeaContributor(idea_id=idea.id, user_id=contributor_id))
    audit.record(db, actor=user, action="created", entity_type="idea", entity_id=idea.id,
                 summary=f"Submitted idea {idea.title}")
    return serialize(db, idea, user)


@router.patch("/ideas/{idea_id}", response_model=IdeaOut)
def update_idea(idea_id: uuid.UUID, payload: IdeaUpdate, db: DbSession,
                user: Annotated[User, Depends(require("ideas.write"))]):
    idea = get_or_404(db, Idea, idea_id, user.company_id, "Idea")
    changes = payload.model_dump(exclude_unset=True)
    before = {k: getattr(idea, k) for k in changes}
    for field, value in changes.items():
        setattr(idea, field, value)
    idea.score = score_of(idea)
    diff = audit.diff(before, changes)
    if diff:
        audit.record(db, actor=user,
                     action="status_changed" if "status" in diff else "updated",
                     entity_type="idea", entity_id=idea.id,
                     summary=f"Updated idea {idea.title}", changes=diff)
    if "status" in diff and idea.author_id:
        notifications.notify(
            db, user_id=idea.author_id, company_id=user.company_id, type="project_update",
            title=f"Your idea “{idea.title}” is now {idea.status}",
            entity_type="idea", entity_id=idea.id, url=f"/ideas/{idea.id}", actor_id=user.id,
        )
    return serialize(db, idea, user)


@router.post("/ideas/{idea_id}/vote", response_model=IdeaOut)
def vote(idea_id: uuid.UUID, db: DbSession,
         user: Annotated[User, Depends(require("ideas.read"))]):
    idea = get_or_404(db, Idea, idea_id, user.company_id, "Idea")
    existing = db.scalar(select(IdeaVote).where(
        IdeaVote.idea_id == idea.id, IdeaVote.user_id == user.id))
    if existing:
        db.delete(existing)
        idea.vote_count = max(0, idea.vote_count - 1)
    else:
        db.add(IdeaVote(idea_id=idea.id, user_id=user.id))
        idea.vote_count += 1
    db.flush()
    return serialize(db, idea, user)


@router.post("/ideas/{idea_id}/convert", response_model=dict)
def convert_idea(idea_id: uuid.UUID, payload: IdeaConvert, db: DbSession,
                 user: Annotated[User, Depends(require("ideas.write"))]):
    """Idea → Project or Idea → R&D, wiring the graph edge as it goes."""
    from app.api.v1.projects import make_key

    idea = get_or_404(db, Idea, idea_id, user.company_id, "Idea")
    name = payload.name or idea.title
    if payload.target == "research":
        research = ResearchProject(
            company_id=user.company_id, title=name,
            research_question=idea.description, lead_id=user.id, idea_id=idea.id, status="active",
        )
        db.add(research)
        db.flush()
        idea.status = "rd"
        graph.link(db, company_id=user.company_id, from_type="idea", from_id=idea.id,
                   rel_type="creates", to_type="research", to_id=research.id, actor=user)
        audit.record(db, actor=user, action="created", entity_type="research",
                     entity_id=research.id, summary=f"Idea “{idea.title}” became R&D “{name}”")
        return {"target": "research", "id": str(research.id), "url": f"/rd/{research.id}"}

    project = Project(
        company_id=user.company_id, key=make_key(db, user.company_id, name), name=name,
        description=idea.description, status="planning", lead_id=user.id,
        budget=idea.estimated_cost,
    )
    db.add(project)
    db.flush()
    idea.status = "approved"
    idea.project_id = project.id
    graph.link(db, company_id=user.company_id, from_type="idea", from_id=idea.id,
               rel_type="creates", to_type="project", to_id=project.id, actor=user)
    audit.record(db, actor=user, action="created", entity_type="project", entity_id=project.id,
                 summary=f"Idea “{idea.title}” became project “{name}”")
    return {"target": "project", "id": str(project.id), "url": f"/projects/{project.id}"}


@router.delete("/ideas/{idea_id}", response_model=Message)
def delete_idea(idea_id: uuid.UUID, db: DbSession,
                user: Annotated[User, Depends(require("ideas.write"))]):
    idea = get_or_404(db, Idea, idea_id, user.company_id, "Idea")
    idea.deleted_at = datetime.now(UTC)
    audit.record(db, actor=user, action="deleted", entity_type="idea", entity_id=idea.id,
                 summary=f"Deleted idea {idea.title}")
    return Message(message="Idea removed")


# ---------------------------------------------------------------- brainstorm
def board_out(db, board: BrainstormBoard) -> dict:
    return {
        "id": board.id, "name": board.name, "description": board.description,
        "status": board.status, "project_id": board.project_id,
        "categories": board.categories or [],
        "created_by": user_ref(db.get(User, board.created_by_id)) if board.created_by_id else None,
        "card_count": db.scalar(select(func.count(BrainstormCard.id)).where(
            BrainstormCard.board_id == board.id)) or 0,
        "created_at": board.created_at,
    }


def card_out(db, card: BrainstormCard) -> dict:
    return {
        "id": card.id, "board_id": card.board_id, "text": card.text, "category": card.category,
        "color": card.color, "x": card.x, "y": card.y, "votes": card.votes,
        "author": user_ref(db.get(User, card.author_id)) if card.author_id else None,
        "idea_id": card.idea_id, "created_at": card.created_at,
    }


@router.get("/brainstorm", response_model=list[BrainstormBoardOut])
def list_boards(db: DbSession, user: Annotated[User, Depends(require("brainstorm.read"))]):
    rows = db.scalars(
        select(BrainstormBoard).where(
            BrainstormBoard.company_id == user.company_id, BrainstormBoard.deleted_at.is_(None)
        ).order_by(BrainstormBoard.created_at.desc())
    ).all()
    return [board_out(db, b) for b in rows]


@router.post("/brainstorm", response_model=BrainstormBoardOut, status_code=201)
def create_board(payload: BrainstormBoardIn, db: DbSession,
                 user: Annotated[User, Depends(require("brainstorm.write"))]):
    board = BrainstormBoard(company_id=user.company_id, created_by_id=user.id,
                            **payload.model_dump())
    db.add(board)
    db.flush()
    audit.record(db, actor=user, action="created", entity_type="brainstorm_board",
                 entity_id=board.id, summary=f"Created board {board.name}")
    return board_out(db, board)


@router.get("/brainstorm/{board_id}", response_model=BrainstormBoardDetail)
def get_board(board_id: uuid.UUID, db: DbSession,
              user: Annotated[User, Depends(require("brainstorm.read"))]):
    board = get_or_404(db, BrainstormBoard, board_id, user.company_id, "Board")
    cards = db.scalars(
        select(BrainstormCard).where(BrainstormCard.board_id == board.id)
        .order_by(BrainstormCard.created_at)
    ).all()
    return {**board_out(db, board), "cards": [card_out(db, c) for c in cards]}


@router.patch("/brainstorm/{board_id}", response_model=BrainstormBoardOut)
def update_board(board_id: uuid.UUID, payload: BrainstormBoardIn, db: DbSession,
                 user: Annotated[User, Depends(require("brainstorm.write"))]):
    board = get_or_404(db, BrainstormBoard, board_id, user.company_id, "Board")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(board, field, value)
    return board_out(db, board)


@router.post("/brainstorm/{board_id}/cards", response_model=BrainstormCardOut, status_code=201)
def create_card(board_id: uuid.UUID, payload: BrainstormCardIn, db: DbSession,
                user: Annotated[User, Depends(require("brainstorm.write"))]):
    board = get_or_404(db, BrainstormBoard, board_id, user.company_id, "Board")
    card = BrainstormCard(board_id=board.id, author_id=user.id, **payload.model_dump())
    db.add(card)
    db.flush()
    return card_out(db, card)


@router.patch("/brainstorm/{board_id}/cards/{card_id}", response_model=BrainstormCardOut)
def update_card(board_id: uuid.UUID, card_id: uuid.UUID, payload: BrainstormCardUpdate,
                db: DbSession, user: Annotated[User, Depends(require("brainstorm.write"))]):
    card = db.get(BrainstormCard, card_id)
    if card is None or card.board_id != board_id:
        raise NotFound("Card")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(card, field, value)
    return card_out(db, card)


@router.post("/brainstorm/{board_id}/cards/{card_id}/vote", response_model=BrainstormCardOut)
def vote_card(board_id: uuid.UUID, card_id: uuid.UUID, db: DbSession,
              user: Annotated[User, Depends(require("brainstorm.write"))]):
    card = db.get(BrainstormCard, card_id)
    if card is None or card.board_id != board_id:
        raise NotFound("Card")
    card.votes += 1
    return card_out(db, card)


@router.delete("/brainstorm/{board_id}/cards/{card_id}", response_model=Message)
def delete_card(board_id: uuid.UUID, card_id: uuid.UUID, db: DbSession,
                user: Annotated[User, Depends(require("brainstorm.write"))]):
    card = db.get(BrainstormCard, card_id)
    if card and card.board_id == board_id:
        db.delete(card)
    return Message(message="Card removed")


@router.post("/brainstorm/{board_id}/cards/{card_id}/promote", response_model=IdeaOut)
def promote_card(board_id: uuid.UUID, card_id: uuid.UUID, db: DbSession,
                 user: Annotated[User, Depends(require("ideas.write"))]):
    """Brainstorm card → Idea, keeping the provenance edge."""
    board = get_or_404(db, BrainstormBoard, board_id, user.company_id, "Board")
    card = db.get(BrainstormCard, card_id)
    if card is None or card.board_id != board.id:
        raise NotFound("Card")
    idea = Idea(
        company_id=user.company_id, title=card.text[:280],
        description=f"Promoted from brainstorm board “{board.name}”.",
        status="submitted", author_id=card.author_id or user.id,
        tags=[card.category] if card.category else [],
    )
    idea.score = score_of(idea)
    db.add(idea)
    db.flush()
    card.idea_id = idea.id
    graph.link(db, company_id=user.company_id, from_type="brainstorm_board", from_id=board.id,
               rel_type="creates", to_type="idea", to_id=idea.id, actor=user)
    audit.record(db, actor=user, action="created", entity_type="idea", entity_id=idea.id,
                 summary=f"Promoted brainstorm card to idea “{idea.title}”")
    return serialize(db, idea, user)
