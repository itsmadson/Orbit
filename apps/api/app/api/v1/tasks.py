import uuid
from datetime import UTC, date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select

from app.api.helpers import comment_count, get_or_404, user_ref
from app.core.deps import CurrentUser, DbSession, require
from app.core.errors import BadRequest
from app.core.pagination import Paging, as_page
from app.models.identity import User
from app.models.work import Project, Sprint, Task, TaskDependency, TASK_STATUSES
from app.schemas.common import Message
from app.schemas.work import (
    SprintIn, SprintOut, TaskDetailOut, TaskIn, TaskMove, TaskOut, TaskUpdate,
)
from app.services import audit, graph, notifications

router = APIRouter(tags=["tasks"])

STATUS_LABELS = {
    "backlog": "Backlog", "todo": "To do", "in_progress": "In progress",
    "in_review": "In review", "done": "Done", "cancelled": "Cancelled",
}


def next_key(db, company_id: uuid.UUID, project: Project | None) -> str:
    if project is not None:
        project.task_counter += 1
        candidate = f"{project.key}-{project.task_counter}"
        while db.scalar(select(Task).where(Task.company_id == company_id, Task.key == candidate)):
            project.task_counter += 1
            candidate = f"{project.key}-{project.task_counter}"
        return candidate
    count = db.scalar(select(func.count(Task.id)).where(
        Task.company_id == company_id, Task.project_id.is_(None))) or 0
    candidate = f"ORB-{count + 1}"
    while db.scalar(select(Task).where(Task.company_id == company_id, Task.key == candidate)):
        count += 1
        candidate = f"ORB-{count + 1}"
    return candidate


def serialize(db, task: Task) -> dict:
    project = db.get(Project, task.project_id) if task.project_id else None
    return {
        "id": task.id,
        "key": task.key,
        "title": task.title,
        "description": task.description,
        "type": task.type,
        "status": task.status,
        "priority": task.priority,
        "project_id": task.project_id,
        "project": {
            "id": project.id, "key": project.key, "name": project.name,
            "color": project.color, "icon": project.icon,
        } if project else None,
        "assignee": user_ref(db.get(User, task.assignee_id)) if task.assignee_id else None,
        "reporter": user_ref(db.get(User, task.reporter_id)) if task.reporter_id else None,
        "epic_id": task.epic_id,
        "parent_id": task.parent_id,
        "sprint_id": task.sprint_id,
        "milestone_id": task.milestone_id,
        "estimate": float(task.estimate) if task.estimate is not None else None,
        "spent": float(task.spent) if task.spent is not None else None,
        "due_date": task.due_date,
        "labels": task.labels or [],
        "order_index": task.order_index,
        "is_blocked": task.is_blocked,
        "comment_count": comment_count(db, "task", task.id),
        "subtask_count": db.scalar(select(func.count(Task.id)).where(
            Task.parent_id == task.id, Task.deleted_at.is_(None))) or 0,
        "created_at": task.created_at,
        "updated_at": task.updated_at,
        "completed_at": task.completed_at,
    }


def _filtered(db, user: User, **filters):
    stmt = select(Task).where(Task.company_id == user.company_id, Task.deleted_at.is_(None))
    if filters.get("q"):
        like = f"%{filters['q']}%"
        stmt = stmt.where(or_(Task.title.ilike(like), Task.key.ilike(like),
                              Task.description.ilike(like)))
    if filters.get("project_id"):
        stmt = stmt.where(Task.project_id == filters["project_id"])
    if filters.get("status"):
        stmt = stmt.where(Task.status.in_(filters["status"]))
    if filters.get("type"):
        stmt = stmt.where(Task.type.in_(filters["type"]))
    if filters.get("priority"):
        stmt = stmt.where(Task.priority.in_(filters["priority"]))
    if filters.get("assignee_id"):
        stmt = stmt.where(Task.assignee_id == filters["assignee_id"])
    if filters.get("sprint_id"):
        stmt = stmt.where(Task.sprint_id == filters["sprint_id"])
    if filters.get("epic_id"):
        stmt = stmt.where(Task.epic_id == filters["epic_id"])
    if filters.get("label"):
        stmt = stmt.where(Task.labels.contains([filters["label"]]))
    if filters.get("overdue"):
        stmt = stmt.where(Task.due_date < date.today(),
                          Task.status.notin_(["done", "cancelled"]))
    if filters.get("open_only"):
        stmt = stmt.where(Task.status.notin_(["done", "cancelled"]))
    if filters.get("no_sprint"):
        stmt = stmt.where(Task.sprint_id.is_(None))
    return stmt


@router.get("/tasks")
def list_tasks(
    db: DbSession,
    user: Annotated[User, Depends(require("tasks.read"))],
    paging: Paging,
    q: str | None = None,
    project_id: uuid.UUID | None = None,
    status: Annotated[list[str] | None, Query()] = None,
    type: Annotated[list[str] | None, Query()] = None,
    priority: Annotated[list[str] | None, Query()] = None,
    assignee_id: uuid.UUID | None = None,
    sprint_id: uuid.UUID | None = None,
    epic_id: uuid.UUID | None = None,
    label: str | None = None,
    overdue: bool = False,
    mine: bool = False,
    open_only: bool = False,
    no_sprint: bool = False,
    sort: str = "updated",
):
    stmt = _filtered(
        db, user, q=q, project_id=project_id, status=status, type=type, priority=priority,
        assignee_id=assignee_id or (user.id if mine else None), sprint_id=sprint_id,
        epic_id=epic_id, label=label, overdue=overdue, open_only=open_only, no_sprint=no_sprint,
    )
    order = {
        "updated": Task.updated_at.desc(),
        "created": Task.created_at.desc(),
        "due": Task.due_date.nulls_last(),
        "priority": Task.priority,
        "key": Task.key,
    }.get(sort, Task.updated_at.desc())
    stmt = stmt.order_by(order)
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.scalars(stmt.limit(paging.page_size).offset(paging.offset)).all()
    return as_page([serialize(db, t) for t in rows], total, paging)


@router.get("/tasks/board")
def board(
    db: DbSession,
    user: Annotated[User, Depends(require("tasks.read"))],
    project_id: uuid.UUID | None = None,
    sprint_id: uuid.UUID | None = None,
    assignee_id: uuid.UUID | None = None,
    mine: bool = False,
):
    columns = []
    for status in TASK_STATUSES:
        if status == "cancelled":
            continue
        stmt = _filtered(
            db, user, project_id=project_id, status=[status], sprint_id=sprint_id,
            assignee_id=assignee_id or (user.id if mine else None),
        ).order_by(Task.order_index, Task.created_at.desc()).limit(100)
        rows = db.scalars(stmt).all()
        columns.append(
            {
                "key": status,
                "label": STATUS_LABELS[status],
                "tasks": [serialize(db, t) for t in rows],
                "count": len(rows),
            }
        )
    return {"columns": columns}


@router.get("/tasks/{task_id}", response_model=TaskDetailOut)
def get_task(task_id: uuid.UUID, db: DbSession,
             user: Annotated[User, Depends(require("tasks.read"))]):
    task = get_or_404(db, Task, task_id, user.company_id, "Task")
    data = serialize(db, task)
    data["subtasks"] = [
        serialize(db, t) for t in db.scalars(
            select(Task).where(Task.parent_id == task.id, Task.deleted_at.is_(None))
        ).all()
    ]
    blocked_ids = db.scalars(
        select(TaskDependency.depends_on_id).where(TaskDependency.task_id == task.id)
    ).all()
    blocks_ids = db.scalars(
        select(TaskDependency.task_id).where(TaskDependency.depends_on_id == task.id)
    ).all()
    data["blocked_by"] = [serialize(db, db.get(Task, i)) for i in blocked_ids if db.get(Task, i)]
    data["blocks"] = [serialize(db, db.get(Task, i)) for i in blocks_ids if db.get(Task, i)]
    return data


@router.post("/tasks", response_model=TaskOut, status_code=201)
def create_task(payload: TaskIn, db: DbSession,
                user: Annotated[User, Depends(require("tasks.write"))]):
    project = None
    if payload.project_id:
        project = get_or_404(db, Project, payload.project_id, user.company_id, "Project")
    data = payload.model_dump(exclude={"depends_on"})
    task = Task(
        company_id=user.company_id,
        key=next_key(db, user.company_id, project),
        reporter_id=user.id,
        **data,
    )
    db.add(task)
    db.flush()
    for dep_id in payload.depends_on:
        if db.get(Task, dep_id):
            db.add(TaskDependency(task_id=task.id, depends_on_id=dep_id))
            graph.link(db, company_id=user.company_id, from_type="task", from_id=dep_id,
                       rel_type="blocks", to_type="task", to_id=task.id, actor=user)
    if project:
        graph.link(db, company_id=user.company_id, from_type="project", from_id=project.id,
                   rel_type="contains", to_type="task", to_id=task.id, actor=user)
    if task.assignee_id:
        graph.link(db, company_id=user.company_id, from_type="task", from_id=task.id,
                   rel_type="assigned_to", to_type="user", to_id=task.assignee_id, actor=user)
        notifications.notify(
            db, user_id=task.assignee_id, company_id=user.company_id, type="task_assigned",
            title=f"{task.key}: {task.title}",
            body=f"{user.full_name} assigned this {task.type} to you.",
            entity_type="task", entity_id=task.id, url=f"/tasks/{task.id}", actor_id=user.id,
        )
    audit.record(db, actor=user, action="created", entity_type="task", entity_id=task.id,
                 summary=f"Created {task.key}: {task.title}")
    return serialize(db, task)


@router.patch("/tasks/{task_id}", response_model=TaskOut)
def update_task(task_id: uuid.UUID, payload: TaskUpdate, db: DbSession,
                user: Annotated[User, Depends(require("tasks.write"))]):
    task = get_or_404(db, Task, task_id, user.company_id, "Task")
    changes = payload.model_dump(exclude_unset=True)
    before = {k: getattr(task, k) for k in changes}
    previous_assignee = task.assignee_id
    for field, value in changes.items():
        setattr(task, field, value)
    if "status" in changes:
        if changes["status"] == "done" and task.completed_at is None:
            task.completed_at = datetime.now(UTC)
        elif changes["status"] != "done":
            task.completed_at = None
        if changes["status"] == "in_progress" and task.started_at is None:
            task.started_at = datetime.now(UTC)
    db.flush()
    diff = audit.diff(before, changes)
    if diff:
        audit.record(
            db, actor=user,
            action="status_changed" if "status" in diff else
                   ("assigned" if "assignee_id" in diff else "updated"),
            entity_type="task", entity_id=task.id,
            summary=f"Updated {task.key}", changes=diff,
        )
    if "assignee_id" in changes and task.assignee_id and task.assignee_id != previous_assignee:
        graph.link(db, company_id=user.company_id, from_type="task", from_id=task.id,
                   rel_type="assigned_to", to_type="user", to_id=task.assignee_id, actor=user)
        notifications.notify(
            db, user_id=task.assignee_id, company_id=user.company_id, type="task_assigned",
            title=f"{task.key}: {task.title}",
            body=f"{user.full_name} assigned this {task.type} to you.",
            entity_type="task", entity_id=task.id, url=f"/tasks/{task.id}", actor_id=user.id,
        )
    if "status" in diff and task.reporter_id:
        notifications.notify(
            db, user_id=task.reporter_id, company_id=user.company_id, type="task_status",
            title=f"{task.key} moved to {STATUS_LABELS.get(task.status, task.status)}",
            entity_type="task", entity_id=task.id, url=f"/tasks/{task.id}", actor_id=user.id,
        )
    _recalculate_progress(db, task)
    return serialize(db, task)


@router.post("/tasks/{task_id}/move", response_model=TaskOut)
def move_task(task_id: uuid.UUID, payload: TaskMove, db: DbSession,
              user: Annotated[User, Depends(require("tasks.write"))]):
    """Drag-and-drop target: change column and position in one call."""
    task = get_or_404(db, Task, task_id, user.company_id, "Task")
    if payload.status not in TASK_STATUSES:
        raise BadRequest(f"Unknown status: {payload.status}")
    old_status = task.status
    task.status = payload.status
    task.order_index = payload.order_index
    if payload.status == "done" and task.completed_at is None:
        task.completed_at = datetime.now(UTC)
    if payload.status != "done":
        task.completed_at = None
    siblings = db.scalars(
        select(Task).where(
            Task.company_id == user.company_id, Task.status == payload.status,
            Task.project_id == task.project_id, Task.id != task.id, Task.deleted_at.is_(None)
        ).order_by(Task.order_index)
    ).all()
    ordered = siblings[:payload.order_index] + [task] + siblings[payload.order_index:]
    for index, item in enumerate(ordered):
        item.order_index = index
    if old_status != payload.status:
        audit.record(db, actor=user, action="status_changed", entity_type="task",
                     entity_id=task.id, summary=f"{task.key} → {payload.status}",
                     changes={"status": {"from": old_status, "to": payload.status}})
        if task.reporter_id:
            notifications.notify(
                db, user_id=task.reporter_id, company_id=user.company_id, type="task_status",
                title=f"{task.key} moved to {STATUS_LABELS.get(task.status, task.status)}",
                entity_type="task", entity_id=task.id, url=f"/tasks/{task.id}", actor_id=user.id,
            )
    _recalculate_progress(db, task)
    return serialize(db, task)


def _recalculate_progress(db, task: Task) -> None:
    if not task.project_id:
        return
    project = db.get(Project, task.project_id)
    if project is None:
        return
    total = db.scalar(select(func.count(Task.id)).where(
        Task.project_id == project.id, Task.deleted_at.is_(None),
        Task.status != "cancelled")) or 0
    done = db.scalar(select(func.count(Task.id)).where(
        Task.project_id == project.id, Task.status == "done", Task.deleted_at.is_(None))) or 0
    project.progress = round(done / total * 100) if total else 0


@router.delete("/tasks/{task_id}", response_model=Message)
def delete_task(task_id: uuid.UUID, db: DbSession,
                user: Annotated[User, Depends(require("tasks.write"))]):
    task = get_or_404(db, Task, task_id, user.company_id, "Task")
    task.deleted_at = datetime.now(UTC)
    audit.record(db, actor=user, action="deleted", entity_type="task", entity_id=task.id,
                 summary=f"Deleted {task.key}")
    _recalculate_progress(db, task)
    return Message(message="Task deleted")


@router.post("/tasks/{task_id}/dependencies", response_model=TaskDetailOut)
def add_dependency(task_id: uuid.UUID, depends_on_id: uuid.UUID, db: DbSession,
                   user: Annotated[User, Depends(require("tasks.write"))]):
    task = get_or_404(db, Task, task_id, user.company_id, "Task")
    other = get_or_404(db, Task, depends_on_id, user.company_id, "Task")
    if task.id == other.id:
        raise BadRequest("A task cannot depend on itself")
    exists = db.scalar(select(TaskDependency).where(
        TaskDependency.task_id == task.id, TaskDependency.depends_on_id == other.id))
    if not exists:
        db.add(TaskDependency(task_id=task.id, depends_on_id=other.id))
        graph.link(db, company_id=user.company_id, from_type="task", from_id=other.id,
                   rel_type="blocks", to_type="task", to_id=task.id, actor=user)
    db.flush()
    return get_task(task_id, db, user)


@router.delete("/tasks/{task_id}/dependencies/{depends_on_id}", response_model=Message)
def remove_dependency(task_id: uuid.UUID, depends_on_id: uuid.UUID, db: DbSession,
                      user: Annotated[User, Depends(require("tasks.write"))]):
    dep = db.scalar(select(TaskDependency).where(
        TaskDependency.task_id == task_id, TaskDependency.depends_on_id == depends_on_id))
    if dep:
        db.delete(dep)
    return Message(message="Dependency removed")


# ---------------------------------------------------------------- sprints
@router.get("/sprints", response_model=list[SprintOut])
def list_sprints(db: DbSession, user: Annotated[User, Depends(require("tasks.read"))],
                 project_id: uuid.UUID | None = None, status: str | None = None):
    stmt = select(Sprint).where(Sprint.company_id == user.company_id)
    if project_id:
        stmt = stmt.where(Sprint.project_id == project_id)
    if status:
        stmt = stmt.where(Sprint.status == status)
    rows = db.scalars(stmt.order_by(Sprint.start_date.desc().nulls_last())).all()
    return [
        {
            **SprintOut.model_validate(s).model_dump(exclude={"task_count"}),
            "task_count": db.scalar(select(func.count(Task.id)).where(
                Task.sprint_id == s.id, Task.deleted_at.is_(None))) or 0,
        }
        for s in rows
    ]


@router.post("/sprints", response_model=SprintOut, status_code=201)
def create_sprint(payload: SprintIn, db: DbSession,
                  user: Annotated[User, Depends(require("tasks.write"))]):
    sprint = Sprint(company_id=user.company_id, **payload.model_dump())
    db.add(sprint)
    db.flush()
    return {**SprintOut.model_validate(sprint).model_dump(exclude={"task_count"}), "task_count": 0}


@router.patch("/sprints/{sprint_id}", response_model=SprintOut)
def update_sprint(sprint_id: uuid.UUID, payload: SprintIn, db: DbSession,
                  user: Annotated[User, Depends(require("tasks.write"))]):
    sprint = get_or_404(db, Sprint, sprint_id, user.company_id, "Sprint")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(sprint, field, value)
    return {
        **SprintOut.model_validate(sprint).model_dump(exclude={"task_count"}),
        "task_count": db.scalar(select(func.count(Task.id)).where(
            Task.sprint_id == sprint.id, Task.deleted_at.is_(None))) or 0,
    }
