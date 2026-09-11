import re
import uuid
from datetime import UTC, date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_, select

from app.api.helpers import get_or_404, user_ref
from app.core.deps import CurrentUser, DbSession, require
from app.core.errors import BadRequest, NotFound
from app.core.pagination import Paging, as_page
from app.models.business import Transaction
from app.models.identity import User
from app.models.knowledge import Decision, Document
from app.models.ops import Meeting
from app.models.system import AuditLog
from app.models.work import Milestone, Project, ProjectMember, Task
from app.schemas.common import ActivityOut, Message
from app.schemas.work import (
    MilestoneIn, MilestoneOut, ProjectIn, ProjectMemberIn, ProjectOut, ProjectUpdate,
)
from app.services import audit, graph, notifications

router = APIRouter(prefix="/projects", tags=["projects"])


def make_key(db, company_id: uuid.UUID, name: str) -> str:
    base = re.sub(r"[^A-Za-z0-9]", "", name).upper()[:4] or "PRJ"
    key, suffix = base, 1
    while db.scalar(select(Project).where(Project.company_id == company_id, Project.key == key)):
        suffix += 1
        key = f"{base[:3]}{suffix}"
    return key


def project_stats(db, project: Project) -> dict:
    today = date.today()
    total = db.scalar(select(func.count(Task.id)).where(
        Task.project_id == project.id, Task.deleted_at.is_(None))) or 0
    done = db.scalar(select(func.count(Task.id)).where(
        Task.project_id == project.id, Task.status == "done", Task.deleted_at.is_(None))) or 0
    overdue = db.scalar(select(func.count(Task.id)).where(
        Task.project_id == project.id, Task.due_date < today,
        Task.status.notin_(["done", "cancelled"]), Task.deleted_at.is_(None))) or 0
    spent = float(db.scalar(select(func.sum(Transaction.amount)).where(
        Transaction.project_id == project.id, Transaction.kind == "expense",
        Transaction.deleted_at.is_(None))) or 0)
    budget = float(project.budget or 0)
    return {
        "total_tasks": total,
        "done_tasks": done,
        "open_tasks": total - done,
        "overdue_tasks": overdue,
        "spent": spent,
        "budget": budget,
        "remaining": budget - spent,
        "documents": db.scalar(select(func.count(Document.id)).where(
            Document.project_id == project.id, Document.deleted_at.is_(None))) or 0,
        "meetings": db.scalar(select(func.count(Meeting.id)).where(
            Meeting.project_id == project.id, Meeting.deleted_at.is_(None))) or 0,
        "decisions": db.scalar(select(func.count(Decision.id)).where(
            Decision.project_id == project.id, Decision.deleted_at.is_(None))) or 0,
        "members": db.scalar(select(func.count(ProjectMember.id)).where(
            ProjectMember.project_id == project.id)) or 0,
    }


def serialize(db, project: Project, with_stats: bool = True) -> dict:
    return {
        "id": project.id,
        "key": project.key,
        "name": project.name,
        "description": project.description,
        "status": project.status,
        "priority": project.priority,
        "health": project.health,
        "color": project.color,
        "icon": project.icon,
        "start_date": project.start_date,
        "end_date": project.end_date,
        "progress": project.progress,
        "budget": float(project.budget) if project.budget is not None else None,
        "lead": user_ref(db.get(User, project.lead_id)) if project.lead_id else None,
        "department_id": project.department_id,
        "created_at": project.created_at,
        "updated_at": project.updated_at,
        "members": [
            {"id": m.id, "role": m.role, "user": user_ref(db.get(User, m.user_id))}
            for m in project.members
            if db.get(User, m.user_id)
        ],
        "milestones": [MilestoneOut.model_validate(m).model_dump() for m in
                       sorted(project.milestones, key=lambda m: (m.due_date or date.max))],
        "stats": project_stats(db, project) if with_stats else None,
    }


@router.get("")
def list_projects(
    db: DbSession,
    user: Annotated[User, Depends(require("projects.read"))],
    paging: Paging,
    q: str | None = None,
    status: str | None = None,
    health: str | None = None,
    priority: str | None = None,
    lead_id: uuid.UUID | None = None,
    member_id: uuid.UUID | None = None,
    mine: bool = False,
):
    stmt = select(Project).where(Project.company_id == user.company_id, Project.deleted_at.is_(None))
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Project.name.ilike(like), Project.key.ilike(like),
                              Project.description.ilike(like)))
    if status:
        stmt = stmt.where(Project.status == status)
    if health:
        stmt = stmt.where(Project.health == health)
    if priority:
        stmt = stmt.where(Project.priority == priority)
    if lead_id:
        stmt = stmt.where(Project.lead_id == lead_id)
    target_member = member_id or (user.id if mine else None)
    if target_member:
        stmt = stmt.where(
            or_(
                Project.lead_id == target_member,
                Project.id.in_(
                    select(ProjectMember.project_id).where(ProjectMember.user_id == target_member)
                ),
            )
        )
    stmt = stmt.order_by(Project.updated_at.desc())
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.scalars(stmt.limit(paging.page_size).offset(paging.offset)).all()
    items = []
    for project in rows:
        stats = project_stats(db, project)
        items.append(
            {
                "id": str(project.id),
                "key": project.key,
                "name": project.name,
                "description": project.description,
                "status": project.status,
                "priority": project.priority,
                "health": project.health,
                "color": project.color,
                "icon": project.icon,
                "progress": project.progress,
                "start_date": project.start_date,
                "end_date": project.end_date,
                "budget": float(project.budget) if project.budget is not None else None,
                "lead": user_ref(db.get(User, project.lead_id)) if project.lead_id else None,
                "open_tasks": stats["open_tasks"],
                "total_tasks": stats["total_tasks"],
                "overdue_tasks": stats["overdue_tasks"],
                "spent": stats["spent"],
                "member_count": stats["members"],
            }
        )
    return as_page(items, total, paging)


@router.post("", response_model=ProjectOut, status_code=201)
def create_project(
    payload: ProjectIn, db: DbSession, user: Annotated[User, Depends(require("projects.write"))]
):
    data = payload.model_dump(exclude={"member_ids", "key"})
    project = Project(
        company_id=user.company_id,
        key=(payload.key or make_key(db, user.company_id, payload.name)).upper(),
        **data,
    )
    db.add(project)
    db.flush()
    member_ids = set(payload.member_ids) | ({payload.lead_id} if payload.lead_id else set())
    for member_id in member_ids:
        if db.get(User, member_id):
            db.add(ProjectMember(project_id=project.id, user_id=member_id,
                                 role="lead" if member_id == payload.lead_id else "member"))
            notifications.notify(
                db, user_id=member_id, company_id=user.company_id, type="project_update",
                title=f"Added to project {project.name}",
                body=f"{user.full_name} added you to {project.name}.",
                entity_type="project", entity_id=project.id,
                url=f"/projects/{project.id}", actor_id=user.id,
            )
    audit.record(db, actor=user, action="created", entity_type="project", entity_id=project.id,
                 summary=f"Created project {project.name}")
    db.flush()
    db.refresh(project)
    return serialize(db, project)


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project_id: uuid.UUID, db: DbSession,
                user: Annotated[User, Depends(require("projects.read"))]):
    project = get_or_404(db, Project, project_id, user.company_id, "Project")
    return serialize(db, project)


@router.get("/{project_id}/overview")
def project_overview(project_id: uuid.UUID, db: DbSession,
                     user: Annotated[User, Depends(require("projects.read"))]):
    """Everything connected to a project — the point of the company graph."""
    project = get_or_404(db, Project, project_id, user.company_id, "Project")
    tasks_by_status = dict(
        db.execute(
            select(Task.status, func.count(Task.id))
            .where(Task.project_id == project.id, Task.deleted_at.is_(None))
            .group_by(Task.status)
        ).all()
    )
    recent_tasks = db.scalars(
        select(Task).where(Task.project_id == project.id, Task.deleted_at.is_(None))
        .order_by(Task.updated_at.desc()).limit(6)
    ).all()
    documents = db.scalars(
        select(Document).where(Document.project_id == project.id, Document.deleted_at.is_(None))
        .order_by(Document.updated_at.desc()).limit(6)
    ).all()
    meetings = db.scalars(
        select(Meeting).where(Meeting.project_id == project.id, Meeting.deleted_at.is_(None))
        .order_by(Meeting.starts_at.desc()).limit(5)
    ).all()
    decisions = db.scalars(
        select(Decision).where(Decision.project_id == project.id, Decision.deleted_at.is_(None))
        .order_by(Decision.created_at.desc()).limit(5)
    ).all()
    expenses = db.execute(
        select(Transaction.description, Transaction.amount, Transaction.occurred_on)
        .where(Transaction.project_id == project.id, Transaction.kind == "expense",
               Transaction.deleted_at.is_(None))
        .order_by(Transaction.occurred_on.desc()).limit(8)
    ).all()
    spend_by_category = db.execute(
        select(func.coalesce(Transaction.category_id, None), func.sum(Transaction.amount))
        .where(Transaction.project_id == project.id, Transaction.kind == "expense",
               Transaction.deleted_at.is_(None))
        .group_by(Transaction.category_id)
    ).all()
    from app.models.business import FinanceCategory

    categories = []
    for category_id, amount in spend_by_category:
        category = db.get(FinanceCategory, category_id) if category_id else None
        categories.append(
            {"name": category.name if category else "Uncategorised",
             "color": category.color if category else "#64748b",
             "amount": float(amount or 0)}
        )
    return {
        "project": serialize(db, project),
        "tasks_by_status": tasks_by_status,
        "recent_tasks": [
            {"id": str(t.id), "key": t.key, "title": t.title, "status": t.status,
             "priority": t.priority, "type": t.type,
             "assignee": user_ref(db.get(User, t.assignee_id)) if t.assignee_id else None}
            for t in recent_tasks
        ],
        "documents": [
            {"id": str(d.id), "title": d.title, "doc_type": d.doc_type,
             "updated_at": d.updated_at.isoformat()} for d in documents
        ],
        "meetings": [
            {"id": str(m.id), "title": m.title, "starts_at": m.starts_at.isoformat(),
             "status": m.status} for m in meetings
        ],
        "decisions": [
            {"id": str(d.id), "title": d.title, "status": d.status} for d in decisions
        ],
        "expenses": [
            {"description": e[0], "amount": float(e[1]), "date": e[2].isoformat()} for e in expenses
        ],
        "spend_by_category": categories,
    }


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: uuid.UUID, payload: ProjectUpdate, db: DbSession,
    user: Annotated[User, Depends(require("projects.write"))],
):
    project = get_or_404(db, Project, project_id, user.company_id, "Project")
    changes = payload.model_dump(exclude_unset=True)
    before = {k: getattr(project, k) for k in changes}
    for field, value in changes.items():
        setattr(project, field, value)
    db.flush()
    diff = audit.diff(before, changes)
    if diff:
        audit.record(db, actor=user, action="status_changed" if "status" in diff else "updated",
                     entity_type="project", entity_id=project.id,
                     summary=f"Updated {project.name}", changes=diff)
    if "status" in diff:
        for member in project.members:
            notifications.notify(
                db, user_id=member.user_id, company_id=user.company_id, type="project_update",
                title=f"{project.name} is now {project.status}",
                entity_type="project", entity_id=project.id,
                url=f"/projects/{project.id}", actor_id=user.id,
            )
    return serialize(db, project)


@router.delete("/{project_id}", response_model=Message)
def delete_project(project_id: uuid.UUID, db: DbSession,
                   user: Annotated[User, Depends(require("projects.manage"))]):
    project = get_or_404(db, Project, project_id, user.company_id, "Project")
    project.deleted_at = datetime.now(UTC)
    audit.record(db, actor=user, action="deleted", entity_type="project", entity_id=project.id,
                 summary=f"Deleted project {project.name}")
    return Message(message="Project deleted")


@router.post("/{project_id}/members", response_model=ProjectOut)
def add_member(
    project_id: uuid.UUID, payload: ProjectMemberIn, db: DbSession,
    user: Annotated[User, Depends(require("projects.write"))],
):
    project = get_or_404(db, Project, project_id, user.company_id, "Project")
    member = get_or_404(db, User, payload.user_id, user.company_id, "User")
    exists = db.scalar(select(ProjectMember).where(
        ProjectMember.project_id == project.id, ProjectMember.user_id == member.id))
    if not exists:
        db.add(ProjectMember(project_id=project.id, user_id=member.id, role=payload.role))
        graph.link(db, company_id=user.company_id, from_type="project", from_id=project.id,
                   rel_type="assigned_to", to_type="user", to_id=member.id, actor=user)
        notifications.notify(
            db, user_id=member.id, company_id=user.company_id, type="project_update",
            title=f"Added to project {project.name}", entity_type="project",
            entity_id=project.id, url=f"/projects/{project.id}", actor_id=user.id,
        )
        audit.record(db, actor=user, action="assigned", entity_type="project",
                     entity_id=project.id, summary=f"Added {member.full_name} to {project.name}")
    db.flush()
    db.refresh(project)
    return serialize(db, project)


@router.delete("/{project_id}/members/{user_id}", response_model=ProjectOut)
def remove_member(
    project_id: uuid.UUID, user_id: uuid.UUID, db: DbSession,
    user: Annotated[User, Depends(require("projects.write"))],
):
    project = get_or_404(db, Project, project_id, user.company_id, "Project")
    member = db.scalar(select(ProjectMember).where(
        ProjectMember.project_id == project.id, ProjectMember.user_id == user_id))
    if member:
        db.delete(member)
    db.flush()
    db.refresh(project)
    return serialize(db, project)


@router.post("/{project_id}/milestones", response_model=MilestoneOut, status_code=201)
def create_milestone(
    project_id: uuid.UUID, payload: MilestoneIn, db: DbSession,
    user: Annotated[User, Depends(require("projects.write"))],
):
    project = get_or_404(db, Project, project_id, user.company_id, "Project")
    milestone = Milestone(project_id=project.id, **payload.model_dump())
    db.add(milestone)
    db.flush()
    audit.record(db, actor=user, action="created", entity_type="project", entity_id=project.id,
                 summary=f"Added milestone {milestone.name}")
    return MilestoneOut.model_validate(milestone)


@router.patch("/{project_id}/milestones/{milestone_id}", response_model=MilestoneOut)
def update_milestone(
    project_id: uuid.UUID, milestone_id: uuid.UUID, payload: MilestoneIn, db: DbSession,
    user: Annotated[User, Depends(require("projects.write"))],
):
    milestone = db.get(Milestone, milestone_id)
    if milestone is None or milestone.project_id != project_id:
        raise NotFound("Milestone")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(milestone, field, value)
    return MilestoneOut.model_validate(milestone)


@router.delete("/{project_id}/milestones/{milestone_id}", response_model=Message)
def delete_milestone(
    project_id: uuid.UUID, milestone_id: uuid.UUID, db: DbSession,
    user: Annotated[User, Depends(require("projects.write"))],
):
    milestone = db.get(Milestone, milestone_id)
    if milestone and milestone.project_id == project_id:
        db.delete(milestone)
    return Message(message="Milestone removed")


@router.get("/{project_id}/activity", response_model=list[ActivityOut])
def project_activity(project_id: uuid.UUID, db: DbSession,
                     user: Annotated[User, Depends(require("projects.read"))]):
    project = get_or_404(db, Project, project_id, user.company_id, "Project")
    task_ids = [
        t for t in db.scalars(select(Task.id).where(Task.project_id == project.id)).all()
    ]
    rows = db.scalars(
        select(AuditLog)
        .where(
            AuditLog.company_id == user.company_id,
            or_(
                (AuditLog.entity_type == "project") & (AuditLog.entity_id == project.id),
                (AuditLog.entity_type == "task") & (AuditLog.entity_id.in_(task_ids or [uuid.uuid4()])),
            ),
        )
        .order_by(AuditLog.created_at.desc())
        .limit(60)
    ).all()
    return [
        {
            "id": log.id, "action": log.action, "entity_type": log.entity_type,
            "entity_id": log.entity_id, "summary": log.summary, "changes": log.changes,
            "actor": user_ref(db.get(User, log.actor_id)) if log.actor_id else None,
            "ip_address": log.ip_address, "created_at": log.created_at,
        }
        for log in rows
    ]


@router.get("/{project_id}/roadmap")
def project_roadmap(project_id: uuid.UUID, db: DbSession,
                    user: Annotated[User, Depends(require("projects.read"))]):
    project = get_or_404(db, Project, project_id, user.company_id, "Project")
    epics = db.scalars(
        select(Task).where(Task.project_id == project.id, Task.type == "epic",
                           Task.deleted_at.is_(None)).order_by(Task.created_at)
    ).all()
    out = []
    for epic in epics:
        children = db.scalars(
            select(Task).where(Task.epic_id == epic.id, Task.deleted_at.is_(None))
            .order_by(Task.due_date.nulls_last(), Task.created_at)
        ).all()
        done = sum(1 for c in children if c.status == "done")
        out.append(
            {
                "id": str(epic.id), "key": epic.key, "title": epic.title, "status": epic.status,
                "due_date": epic.due_date, "progress": round(done / len(children) * 100) if children else 0,
                "children": [
                    {"id": str(c.id), "key": c.key, "title": c.title, "status": c.status,
                     "due_date": c.due_date, "type": c.type,
                     "assignee": user_ref(db.get(User, c.assignee_id)) if c.assignee_id else None}
                    for c in children
                ],
            }
        )
    return {
        "milestones": [MilestoneOut.model_validate(m).model_dump()
                       for m in sorted(project.milestones, key=lambda m: (m.due_date or date.max))],
        "epics": out,
    }
