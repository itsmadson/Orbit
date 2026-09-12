"""Capacity planning: who has room, and filling a sprint with what fits.

The arithmetic is deliberately visible rather than clever. A planner that
cannot explain why it gave someone a task is one nobody trusts twice, so every
assignment comes back with the reason it was made.
"""

import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_, select

from app.api.helpers import get_or_404, user_ref
from app.core.deps import DbSession, require
from app.core.errors import BadRequest, Conflict
from app.models.identity import User
from app.models.people import LeaveRequest, Skill, UserSkill
from app.models.support import Ticket
from app.models.work import Project, ProjectMember, Sprint, Task
from app.schemas.planning import AutoAssignIn, SprintPlanIn
from app.services import audit, graph, notifications

router = APIRouter(prefix="/planning", tags=["planning"])

OPEN_STATUSES = ["backlog", "todo", "in_progress", "in_review"]
#: Hours assumed for a task nobody estimated. Better than treating it as free.
DEFAULT_ESTIMATE = 4.0
PRIORITY_WEIGHT = {"urgent": 0, "high": 1, "medium": 2, "low": 3}


def _working_days(start: date, end: date) -> int:
    days = 0
    cursor = start
    while cursor <= end:
        if cursor.weekday() < 5:
            days += 1
        cursor += timedelta(days=1)
    return days


def capacity_rows(db, company_id, start: date, end: date,
                  project_id: uuid.UUID | None = None) -> list[dict]:
    """Per person: what they can take, what they already hold, what is left.

    Committed work counts open tasks in the window; approved leave is removed
    from capacity, because planning someone who is away is how a sprint misses.
    """
    stmt = select(User).where(
        User.company_id == company_id, User.is_active.is_(True),
        User.deleted_at.is_(None), User.role != "customer",
    )
    if project_id:
        member_ids = select(ProjectMember.user_id).where(
            ProjectMember.project_id == project_id
        )
        stmt = stmt.where(User.id.in_(member_ids))
    people = db.scalars(stmt.order_by(User.full_name)).all()

    span_days = max(_working_days(start, end), 1)
    weeks = span_days / 5

    rows = []
    for person in people:
        weekly = float(person.weekly_capacity_hours or 40)
        gross = weekly * weeks

        leave_days = db.scalar(
            select(func.coalesce(func.sum(LeaveRequest.days), 0)).where(
                LeaveRequest.user_id == person.id,
                LeaveRequest.status == "approved",
                LeaveRequest.start_date <= end,
                LeaveRequest.end_date >= start,
            )
        ) or 0
        leave_hours = float(leave_days) * (weekly / 5)

        committed = db.scalar(
            select(func.coalesce(func.sum(Task.estimate), 0)).where(
                Task.assignee_id == person.id,
                Task.company_id == company_id,
                Task.deleted_at.is_(None),
                Task.status.in_(OPEN_STATUSES),
            )
        ) or 0
        open_tasks = db.scalar(
            select(func.count(Task.id)).where(
                Task.assignee_id == person.id, Task.company_id == company_id,
                Task.deleted_at.is_(None), Task.status.in_(OPEN_STATUSES),
            )
        ) or 0
        open_tickets = db.scalar(
            select(func.count(Ticket.id)).where(
                Ticket.assignee_id == person.id, Ticket.company_id == company_id,
                Ticket.deleted_at.is_(None),
                Ticket.status.notin_(["resolved", "closed"]),
            )
        ) or 0

        available = round(gross - leave_hours - float(committed), 1)
        skills = db.scalars(
            select(Skill.name).join(UserSkill, UserSkill.skill_id == Skill.id)
            .where(UserSkill.user_id == person.id)
        ).all()

        rows.append({
            "user": user_ref(person),
            "weekly_capacity_hours": weekly,
            "gross_hours": round(gross, 1),
            "leave_days": float(leave_days),
            "leave_hours": round(leave_hours, 1),
            "committed_hours": float(committed),
            "available_hours": available,
            "open_tasks": open_tasks,
            "open_tickets": open_tickets,
            "utilisation": round(
                (float(committed) / gross * 100) if gross else 0, 1
            ),
            "skills": skills,
        })
    return rows


@router.get("/capacity")
def capacity(db: DbSession, user: Annotated[User, Depends(require("planning.read"))],
             start: date | None = None, end: date | None = None,
             project_id: uuid.UUID | None = None):
    start = start or date.today()
    end = end or (start + timedelta(days=13))
    rows = capacity_rows(db, user.company_id, start, end, project_id)
    return {
        "start": start, "end": end,
        "working_days": _working_days(start, end),
        "people": rows,
        "total_available": round(sum(r["available_hours"] for r in rows), 1),
        "total_committed": round(sum(r["committed_hours"] for r in rows), 1),
        "overloaded": [r["user"]["full_name"] for r in rows if r["available_hours"] < 0],
    }


def _score(person: dict, task: Task) -> tuple[float, list[str]]:
    """How good a fit this person is, and why. Higher wins."""
    reasons = []
    score = person["available_hours"]          # room is the dominant term

    labels = {str(label).lower() for label in (task.labels or [])}
    matched = [s for s in person["skills"] if s.lower() in labels]
    if matched:
        score += 12 * len(matched)
        reasons.append(f"knows {', '.join(matched)}")

    # Spread work rather than piling it on whoever is already juggling most.
    score -= person["open_tasks"] * 1.5
    if person["open_tickets"]:
        score -= person["open_tickets"] * 2
        reasons.append(f"{person['open_tickets']} open tickets")

    if person["available_hours"] <= 0:
        reasons.append("already over capacity")
    else:
        reasons.append(f"{person['available_hours']}h free")
    return score, reasons


@router.post("/auto-assign")
def auto_assign(payload: AutoAssignIn, db: DbSession,
                user: Annotated[User, Depends(require("planning.write"))]):
    """Spread unassigned work across whoever has room for it.

    Runs as a dry run unless `commit` is set, because a plan you cannot inspect
    before it happens is not a plan.
    """
    start = payload.start or date.today()
    end = payload.end or (start + timedelta(days=13))
    people = capacity_rows(db, user.company_id, start, end, payload.project_id)
    if not people:
        raise BadRequest("Nobody available to plan for.")

    stmt = select(Task).where(
        Task.company_id == user.company_id, Task.deleted_at.is_(None),
        Task.assignee_id.is_(None), Task.status.in_(["backlog", "todo"]),
    )
    if payload.project_id:
        stmt = stmt.where(Task.project_id == payload.project_id)
    if payload.sprint_id:
        stmt = stmt.where(Task.sprint_id == payload.sprint_id)
    tasks = db.scalars(stmt).all()

    # Urgent first, then whatever has a deadline soonest.
    tasks.sort(key=lambda t: (
        PRIORITY_WEIGHT.get(t.priority, 2),
        t.due_date or date.max,
        -(t.estimate or DEFAULT_ESTIMATE),
    ))

    # Work on a copy of the capacity numbers so one run cannot overcommit
    # somebody across several tasks.
    ledger = {row["user"]["id"]: dict(row) for row in people}
    assignments, skipped = [], []

    for task in tasks[: payload.limit]:
        hours = float(task.estimate or DEFAULT_ESTIMATE)
        candidates = [
            (s, reasons, person)
            for person in ledger.values()
            for s, reasons in [_score(person, task)]
            if payload.allow_overflow or person["available_hours"] >= hours
        ]
        if not candidates:
            skipped.append({"task": task.key, "title": task.title,
                            "reason": "nobody has room for it"})
            continue
        score, reasons, chosen = max(candidates, key=lambda c: c[0])
        chosen["available_hours"] = round(chosen["available_hours"] - hours, 1)
        chosen["open_tasks"] += 1
        assignments.append({
            "task_id": task.id, "task": task.key, "title": task.title,
            "hours": hours, "assignee": chosen["user"], "why": reasons,
            "remaining_after": chosen["available_hours"],
        })

    if payload.commit:
        by_id = {a["task_id"]: a for a in assignments}
        for task in tasks:
            if task.id in by_id:
                assignee_id = by_id[task.id]["assignee"]["id"]
                task.assignee_id = assignee_id
                if payload.sprint_id:
                    task.sprint_id = payload.sprint_id
                if task.status == "backlog":
                    task.status = "todo"
                graph.link(db, company_id=user.company_id, from_type="task",
                           from_id=task.id, rel_type="assigned_to", to_type="user",
                           to_id=assignee_id)
        db.flush()
        audit.record(db, actor=user, action="updated", entity_type="task",
                     summary=f"Auto-assigned {len(assignments)} tasks")
        # One notification per person, not per task.
        per_person: dict = {}
        for item in assignments:
            per_person.setdefault(item["assignee"]["id"], []).append(item["task"])
        for assignee_id, keys in per_person.items():
            if assignee_id == user.id:
                continue
            notifications.notify(
                db, user_id=assignee_id, company_id=user.company_id,
                type="task_assigned",
                title=f"{len(keys)} task(s) planned for you",
                body=", ".join(keys[:6]), url="/tasks?mine=1", actor_id=user.id,
            )

    return {
        "committed": payload.commit,
        "assigned": len(assignments),
        "skipped": len(skipped),
        "assignments": assignments,
        "unplaceable": skipped,
        "capacity_after": [
            {"user": row["user"], "available_hours": row["available_hours"]}
            for row in ledger.values()
        ],
    }


@router.post("/sprint")
def plan_sprint(payload: SprintPlanIn, db: DbSession,
                user: Annotated[User, Depends(require("planning.write"))]):
    """Create a sprint and fill it to the team's real capacity.

    Stops at the capacity line rather than sweeping in the whole backlog — a
    sprint that cannot be finished is just a backlog with a date on it.
    """
    project = get_or_404(db, Project, payload.project_id, user.company_id, "Project")
    start = payload.start or date.today()
    end = payload.end or (start + timedelta(days=payload.length_days - 1))

    existing = db.scalar(
        select(Sprint).where(Sprint.project_id == project.id, Sprint.status == "active")
    )
    if existing and not payload.allow_parallel:
        raise Conflict(f"{project.name} already has an active sprint: {existing.name}")

    people = capacity_rows(db, user.company_id, start, end, project.id)
    budget = sum(row["available_hours"] for row in people if row["available_hours"] > 0)
    budget *= payload.focus_factor          # nobody delivers 100% of their hours

    candidates = db.scalars(
        select(Task).where(
            Task.company_id == user.company_id, Task.project_id == project.id,
            Task.deleted_at.is_(None), Task.sprint_id.is_(None),
            Task.status.in_(["backlog", "todo"]),
        )
    ).all()
    candidates.sort(key=lambda t: (
        PRIORITY_WEIGHT.get(t.priority, 2), t.due_date or date.max,
    ))

    chosen, planned_hours = [], 0.0
    for task in candidates:
        hours = float(task.estimate or DEFAULT_ESTIMATE)
        if planned_hours + hours > budget:
            continue                        # keep scanning: a smaller one may still fit
        chosen.append(task)
        planned_hours += hours

    count = db.scalar(select(func.count(Sprint.id)).where(
        Sprint.project_id == project.id)) or 0
    sprint = Sprint(
        company_id=user.company_id, project_id=project.id,
        name=payload.name or f"{project.key} Sprint {count + 1}",
        goal=payload.goal, status="planned", start_date=start, end_date=end,
    )
    db.add(sprint)
    db.flush()

    if payload.commit:
        for task in chosen:
            task.sprint_id = sprint.id
            if task.status == "backlog":
                task.status = "todo"
        db.flush()
        audit.record(db, actor=user, action="created", entity_type="sprint",
                     entity_id=sprint.id,
                     summary=f"{sprint.name}: {len(chosen)} tasks, {planned_hours:g}h")
    else:
        db.expunge(sprint)

    return {
        "committed": payload.commit,
        "sprint": {"id": sprint.id, "name": sprint.name, "start_date": start,
                   "end_date": end},
        "capacity_hours": round(budget, 1),
        "planned_hours": round(planned_hours, 1),
        "headroom_hours": round(budget - planned_hours, 1),
        "focus_factor": payload.focus_factor,
        "tasks": [
            {"id": t.id, "key": t.key, "title": t.title, "priority": t.priority,
             "hours": float(t.estimate or DEFAULT_ESTIMATE)}
            for t in chosen
        ],
        "left_out": len(candidates) - len(chosen),
        "people": people,
    }
