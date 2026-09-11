import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select

from app.api.helpers import get_or_404, user_ref
from app.core.deps import DbSession, require
from app.core.errors import NotFound
from app.models.identity import Department, User
from app.models.people import Goal, KeyResult
from app.models.work import Project
from app.schemas.common import Message
from app.schemas.people import GoalIn, GoalOut, GoalUpdate, KeyResultIn, KeyResultOut, KeyResultUpdate
from app.services import audit, graph

router = APIRouter(prefix="/goals", tags=["goals"])


def kr_progress(kr: KeyResult) -> int:
    span = float(kr.target_value) - float(kr.start_value)
    if span == 0:
        return 100 if float(kr.current_value) >= float(kr.target_value) else 0
    ratio = (float(kr.current_value) - float(kr.start_value)) / span
    return max(0, min(100, round(ratio * 100)))


def kr_out(db, kr: KeyResult) -> dict:
    return {
        "id": kr.id, "goal_id": kr.goal_id, "title": kr.title, "metric": kr.metric,
        "start_value": float(kr.start_value), "current_value": float(kr.current_value),
        "target_value": float(kr.target_value), "unit": kr.unit,
        "owner": user_ref(db.get(User, kr.owner_id)) if kr.owner_id else None,
        "task_id": kr.task_id, "progress": kr_progress(kr),
    }


def recalc(db, goal: Goal) -> None:
    krs = db.scalars(select(KeyResult).where(KeyResult.goal_id == goal.id)).all()
    if krs:
        goal.progress = round(sum(kr_progress(k) for k in krs) / len(krs))
    children = db.scalars(select(Goal).where(Goal.parent_id == goal.id,
                                             Goal.deleted_at.is_(None))).all()
    if children and not krs:
        goal.progress = round(sum(c.progress for c in children) / len(children))
    goal.status = ("completed" if goal.progress >= 100 else
                   "on_track" if goal.progress >= 60 else
                   "at_risk" if goal.progress >= 30 else "off_track")
    if goal.parent_id:
        parent = db.get(Goal, goal.parent_id)
        if parent:
            recalc(db, parent)


def goal_out(db, goal: Goal) -> dict:
    department = db.get(Department, goal.department_id) if goal.department_id else None
    project = db.get(Project, goal.project_id) if goal.project_id else None
    krs = db.scalars(select(KeyResult).where(KeyResult.goal_id == goal.id)
                     .order_by(KeyResult.created_at)).all()
    return {
        "id": goal.id, "objective": goal.objective, "description": goal.description,
        "level": goal.level, "parent_id": goal.parent_id,
        "owner": user_ref(db.get(User, goal.owner_id)) if goal.owner_id else None,
        "department_id": goal.department_id,
        "department_name": department.name if department else None,
        "project_id": goal.project_id, "project_name": project.name if project else None,
        "period": goal.period, "status": goal.status, "progress": goal.progress,
        "due_date": goal.due_date, "key_results": [kr_out(db, k) for k in krs],
        "child_count": db.scalar(select(func.count(Goal.id)).where(
            Goal.parent_id == goal.id, Goal.deleted_at.is_(None))) or 0,
        "created_at": goal.created_at,
    }


@router.get("", response_model=list[GoalOut])
def list_goals(db: DbSession, user: Annotated[User, Depends(require("goals.read"))],
               level: str | None = None, owner_id: uuid.UUID | None = None,
               period: str | None = None, parent_id: uuid.UUID | None = None,
               root_only: bool = False):
    stmt = select(Goal).where(Goal.company_id == user.company_id, Goal.deleted_at.is_(None))
    if level:
        stmt = stmt.where(Goal.level == level)
    if owner_id:
        stmt = stmt.where(Goal.owner_id == owner_id)
    if period:
        stmt = stmt.where(Goal.period == period)
    if parent_id:
        stmt = stmt.where(Goal.parent_id == parent_id)
    elif root_only:
        stmt = stmt.where(Goal.parent_id.is_(None))
    rows = db.scalars(stmt.order_by(Goal.level, Goal.created_at)).all()
    return [goal_out(db, g) for g in rows]


@router.get("/tree")
def goal_tree(db: DbSession, user: Annotated[User, Depends(require("goals.read"))],
              period: str | None = None):
    stmt = select(Goal).where(Goal.company_id == user.company_id, Goal.deleted_at.is_(None))
    if period:
        stmt = stmt.where(Goal.period == period)
    rows = db.scalars(stmt.order_by(Goal.created_at)).all()
    by_parent: dict[str | None, list[Goal]] = {}
    for goal in rows:
        by_parent.setdefault(str(goal.parent_id) if goal.parent_id else None, []).append(goal)

    def build(key: str | None) -> list[dict]:
        return [
            {**goal_out(db, goal), "children": build(str(goal.id))}
            for goal in by_parent.get(key, [])
        ]

    return build(None)


@router.get("/{goal_id}", response_model=GoalOut)
def get_goal(goal_id: uuid.UUID, db: DbSession,
             user: Annotated[User, Depends(require("goals.read"))]):
    return goal_out(db, get_or_404(db, Goal, goal_id, user.company_id, "Goal"))


@router.post("", response_model=GoalOut, status_code=201)
def create_goal(payload: GoalIn, db: DbSession,
                user: Annotated[User, Depends(require("goals.write"))]):
    goal = Goal(company_id=user.company_id, **payload.model_dump(exclude={"key_results"}))
    goal.owner_id = goal.owner_id or user.id
    db.add(goal)
    db.flush()
    for kr in payload.key_results:
        db.add(KeyResult(goal_id=goal.id, **kr.model_dump()))
    db.flush()
    recalc(db, goal)
    if goal.project_id:
        graph.link(db, company_id=user.company_id, from_type="goal", from_id=goal.id,
                   rel_type="relates_to", to_type="project", to_id=goal.project_id, actor=user)
    audit.record(db, actor=user, action="created", entity_type="goal", entity_id=goal.id,
                 summary=f"Created {goal.level} goal “{goal.objective}”")
    return goal_out(db, goal)


@router.patch("/{goal_id}", response_model=GoalOut)
def update_goal(goal_id: uuid.UUID, payload: GoalUpdate, db: DbSession,
                user: Annotated[User, Depends(require("goals.write"))]):
    goal = get_or_404(db, Goal, goal_id, user.company_id, "Goal")
    changes = payload.model_dump(exclude_unset=True)
    before = {k: getattr(goal, k) for k in changes}
    for field, value in changes.items():
        setattr(goal, field, value)
    diff = audit.diff(before, changes)
    if diff:
        audit.record(db, actor=user, action="updated", entity_type="goal", entity_id=goal.id,
                     summary=f"Updated goal {goal.objective}", changes=diff)
    return goal_out(db, goal)


@router.post("/{goal_id}/key-results", response_model=KeyResultOut, status_code=201)
def add_key_result(goal_id: uuid.UUID, payload: KeyResultIn, db: DbSession,
                   user: Annotated[User, Depends(require("goals.write"))]):
    goal = get_or_404(db, Goal, goal_id, user.company_id, "Goal")
    kr = KeyResult(goal_id=goal.id, **payload.model_dump())
    db.add(kr)
    db.flush()
    recalc(db, goal)
    return kr_out(db, kr)


@router.patch("/{goal_id}/key-results/{kr_id}", response_model=KeyResultOut)
def update_key_result(goal_id: uuid.UUID, kr_id: uuid.UUID, payload: KeyResultUpdate,
                      db: DbSession, user: Annotated[User, Depends(require("goals.write"))]):
    goal = get_or_404(db, Goal, goal_id, user.company_id, "Goal")
    kr = db.get(KeyResult, kr_id)
    if kr is None or kr.goal_id != goal.id:
        raise NotFound("Key result")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(kr, field, value)
    db.flush()
    recalc(db, goal)
    audit.record(db, actor=user, action="updated", entity_type="goal", entity_id=goal.id,
                 summary=f"Updated key result “{kr.title}”")
    return kr_out(db, kr)


@router.delete("/{goal_id}", response_model=Message)
def delete_goal(goal_id: uuid.UUID, db: DbSession,
                user: Annotated[User, Depends(require("goals.manage"))]):
    goal = get_or_404(db, Goal, goal_id, user.company_id, "Goal")
    goal.deleted_at = datetime.now(UTC)
    return Message(message="Goal archived")
