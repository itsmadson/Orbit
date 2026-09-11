import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select

from app.api.helpers import get_or_404, user_ref
from app.core.deps import DbSession, require
from app.core.pagination import Paging, as_page
from app.models.identity import User
from app.models.innovation import Experiment, ResearchProject
from app.schemas.common import Message
from app.schemas.innovation import (
    ExperimentIn, ExperimentOut, ExperimentUpdate, ResearchIn, ResearchOut, ResearchUpdate,
)
from app.services import audit, graph, notifications

router = APIRouter(tags=["r&d"])


def research_out(db, research: ResearchProject) -> dict:
    total = db.scalar(select(func.count(Experiment.id)).where(
        Experiment.research_id == research.id)) or 0
    running = db.scalar(select(func.count(Experiment.id)).where(
        Experiment.research_id == research.id, Experiment.status == "running")) or 0
    return {
        "id": research.id, "title": research.title,
        "research_question": research.research_question, "hypothesis": research.hypothesis,
        "objectives": research.objectives or [], "methods": research.methods,
        "findings": research.findings, "conclusion": research.conclusion,
        "references": research.references or [], "status": research.status,
        "lead": user_ref(db.get(User, research.lead_id)) if research.lead_id else None,
        "idea_id": research.idea_id, "project_id": research.project_id,
        "start_date": research.start_date, "end_date": research.end_date,
        "budget": float(research.budget) if research.budget is not None else None,
        "experiment_count": total, "running_experiments": running,
        "created_at": research.created_at,
    }


def experiment_out(db, experiment: Experiment) -> dict:
    research = db.get(ResearchProject, experiment.research_id) if experiment.research_id else None
    return {
        "id": experiment.id, "number": experiment.number, "name": experiment.name,
        "research_id": experiment.research_id,
        "research_title": research.title if research else None,
        "hypothesis": experiment.hypothesis, "method": experiment.method,
        "status": experiment.status, "result": experiment.result,
        "metrics": experiment.metrics or {}, "dataset_ref": experiment.dataset_ref,
        "researcher": user_ref(db.get(User, experiment.researcher_id))
        if experiment.researcher_id else None,
        "started_at": experiment.started_at, "ended_at": experiment.ended_at,
        "created_at": experiment.created_at,
    }


@router.get("/rd")
def list_research(db: DbSession, user: Annotated[User, Depends(require("rd.read"))],
                  paging: Paging, q: str | None = None,
                  status: Annotated[list[str] | None, Query()] = None,
                  lead_id: uuid.UUID | None = None):
    stmt = select(ResearchProject).where(
        ResearchProject.company_id == user.company_id, ResearchProject.deleted_at.is_(None))
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(ResearchProject.title.ilike(like),
                              ResearchProject.research_question.ilike(like)))
    if status:
        stmt = stmt.where(ResearchProject.status.in_(status))
    if lead_id:
        stmt = stmt.where(ResearchProject.lead_id == lead_id)
    stmt = stmt.order_by(ResearchProject.created_at.desc())
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.scalars(stmt.limit(paging.page_size).offset(paging.offset)).all()
    return as_page([research_out(db, r) for r in rows], total, paging)


@router.post("/rd", response_model=ResearchOut, status_code=201)
def create_research(payload: ResearchIn, db: DbSession,
                    user: Annotated[User, Depends(require("rd.write"))]):
    research = ResearchProject(company_id=user.company_id, **payload.model_dump())
    research.lead_id = research.lead_id or user.id
    db.add(research)
    db.flush()
    if research.idea_id:
        graph.link(db, company_id=user.company_id, from_type="idea", from_id=research.idea_id,
                   rel_type="creates", to_type="research", to_id=research.id, actor=user)
    if research.project_id:
        graph.link(db, company_id=user.company_id, from_type="research", from_id=research.id,
                   rel_type="relates_to", to_type="project", to_id=research.project_id, actor=user)
    audit.record(db, actor=user, action="created", entity_type="research", entity_id=research.id,
                 summary=f"Created R&D project {research.title}")
    return research_out(db, research)


@router.get("/rd/{research_id}", response_model=ResearchOut)
def get_research(research_id: uuid.UUID, db: DbSession,
                 user: Annotated[User, Depends(require("rd.read"))]):
    research = get_or_404(db, ResearchProject, research_id, user.company_id, "R&D project")
    return research_out(db, research)


@router.get("/rd/{research_id}/experiments", response_model=list[ExperimentOut])
def research_experiments(research_id: uuid.UUID, db: DbSession,
                         user: Annotated[User, Depends(require("rd.read"))]):
    rows = db.scalars(
        select(Experiment).where(Experiment.research_id == research_id)
        .order_by(Experiment.number)
    ).all()
    return [experiment_out(db, e) for e in rows]


@router.patch("/rd/{research_id}", response_model=ResearchOut)
def update_research(research_id: uuid.UUID, payload: ResearchUpdate, db: DbSession,
                    user: Annotated[User, Depends(require("rd.write"))]):
    research = get_or_404(db, ResearchProject, research_id, user.company_id, "R&D project")
    changes = payload.model_dump(exclude_unset=True)
    before = {k: getattr(research, k) for k in changes}
    for field, value in changes.items():
        setattr(research, field, value)
    diff = audit.diff(before, changes)
    if diff:
        audit.record(db, actor=user, action="updated", entity_type="research",
                     entity_id=research.id, summary=f"Updated {research.title}", changes=diff)
    return research_out(db, research)


@router.delete("/rd/{research_id}", response_model=Message)
def delete_research(research_id: uuid.UUID, db: DbSession,
                    user: Annotated[User, Depends(require("rd.manage"))]):
    research = get_or_404(db, ResearchProject, research_id, user.company_id, "R&D project")
    research.deleted_at = datetime.now(UTC)
    audit.record(db, actor=user, action="deleted", entity_type="research", entity_id=research.id,
                 summary=f"Deleted {research.title}")
    return Message(message="R&D project deleted")


# ---------------------------------------------------------------- experiments
@router.get("/experiments")
def list_experiments(db: DbSession, user: Annotated[User, Depends(require("rd.read"))],
                     paging: Paging,
                     status: Annotated[list[str] | None, Query()] = None,
                     research_id: uuid.UUID | None = None,
                     researcher_id: uuid.UUID | None = None,
                     q: str | None = None):
    stmt = select(Experiment).where(Experiment.company_id == user.company_id)
    if status:
        stmt = stmt.where(Experiment.status.in_(status))
    if research_id:
        stmt = stmt.where(Experiment.research_id == research_id)
    if researcher_id:
        stmt = stmt.where(Experiment.researcher_id == researcher_id)
    if q:
        stmt = stmt.where(Experiment.name.ilike(f"%{q}%"))
    stmt = stmt.order_by(Experiment.number.desc())
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.scalars(stmt.limit(paging.page_size).offset(paging.offset)).all()
    return as_page([experiment_out(db, e) for e in rows], total, paging)


@router.post("/experiments", response_model=ExperimentOut, status_code=201)
def create_experiment(payload: ExperimentIn, db: DbSession,
                      user: Annotated[User, Depends(require("rd.write"))]):
    count = db.scalar(select(func.count(Experiment.id)).where(
        Experiment.company_id == user.company_id)) or 0
    experiment = Experiment(company_id=user.company_id, number=count + 1, **payload.model_dump())
    experiment.researcher_id = experiment.researcher_id or user.id
    if experiment.status == "running":
        experiment.started_at = datetime.now(UTC)
    db.add(experiment)
    db.flush()
    if experiment.research_id:
        graph.link(db, company_id=user.company_id, from_type="research",
                   from_id=experiment.research_id, rel_type="contains",
                   to_type="experiment", to_id=experiment.id, actor=user)
    audit.record(db, actor=user, action="created", entity_type="experiment",
                 entity_id=experiment.id, summary=f"Created experiment #{experiment.number}")
    return experiment_out(db, experiment)


@router.get("/experiments/{experiment_id}", response_model=ExperimentOut)
def get_experiment(experiment_id: uuid.UUID, db: DbSession,
                   user: Annotated[User, Depends(require("rd.read"))]):
    experiment = get_or_404(db, Experiment, experiment_id, user.company_id, "Experiment")
    return experiment_out(db, experiment)


@router.patch("/experiments/{experiment_id}", response_model=ExperimentOut)
def update_experiment(experiment_id: uuid.UUID, payload: ExperimentUpdate, db: DbSession,
                      user: Annotated[User, Depends(require("rd.write"))]):
    experiment = get_or_404(db, Experiment, experiment_id, user.company_id, "Experiment")
    changes = payload.model_dump(exclude_unset=True)
    before = {k: getattr(experiment, k) for k in changes}
    for field, value in changes.items():
        setattr(experiment, field, value)
    if changes.get("status") == "running" and experiment.started_at is None:
        experiment.started_at = datetime.now(UTC)
    if changes.get("status") in ("completed", "failed", "validated") and experiment.ended_at is None:
        experiment.ended_at = datetime.now(UTC)
    diff = audit.diff(before, changes)
    if diff:
        audit.record(db, actor=user,
                     action="status_changed" if "status" in diff else "updated",
                     entity_type="experiment", entity_id=experiment.id,
                     summary=f"Experiment #{experiment.number} updated", changes=diff)
    if "status" in diff and experiment.research_id:
        research = db.get(ResearchProject, experiment.research_id)
        if research and research.lead_id:
            notifications.notify(
                db, user_id=research.lead_id, company_id=user.company_id, type="rd_result",
                title=f"Experiment #{experiment.number} is {experiment.status}",
                body=experiment.name, entity_type="experiment", entity_id=experiment.id,
                url=f"/experiments/{experiment.id}", actor_id=user.id,
            )
    return experiment_out(db, experiment)


@router.delete("/experiments/{experiment_id}", response_model=Message)
def delete_experiment(experiment_id: uuid.UUID, db: DbSession,
                      user: Annotated[User, Depends(require("rd.manage"))]):
    experiment = get_or_404(db, Experiment, experiment_id, user.company_id, "Experiment")
    db.delete(experiment)
    return Message(message="Experiment deleted")
