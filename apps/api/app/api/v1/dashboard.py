import uuid
from datetime import UTC, date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select

from app.api.helpers import user_ref
from app.core.deps import CurrentUser, DbSession, can, require
from app.models.business import Deal, Transaction
from app.models.identity import Department, User
from app.models.innovation import Experiment, Idea
from app.models.system import AuditLog
from app.models.work import Project, Task
from app.services import insights

router = APIRouter(tags=["dashboard"])


def greeting_for(hour: int) -> str:
    if hour < 12:
        return "morning"
    if hour < 18:
        return "afternoon"
    return "evening"


@router.get("/dashboard")
def dashboard(db: DbSession, user: CurrentUser):
    metrics = insights.company_metrics(db, user.company_id, user)
    if not can(db, user, "finance.read"):
        for key in ("monthly_revenue", "monthly_expenses", "previous_month_revenue",
                    "previous_month_expenses", "net_monthly", "outstanding_invoices",
                    "pipeline_value"):
            metrics[key] = None
    my_tasks = db.scalars(
        select(Task).where(
            Task.company_id == user.company_id, Task.assignee_id == user.id,
            Task.status.notin_(["done", "cancelled"]), Task.deleted_at.is_(None)
        ).order_by(Task.due_date.nulls_last(), Task.priority).limit(6)
    ).all()
    activity = db.scalars(
        select(AuditLog).where(AuditLog.company_id == user.company_id)
        .order_by(AuditLog.created_at.desc()).limit(8)
    ).all()
    return {
        "greeting": greeting_for(datetime.now(UTC).hour),
        "metrics": metrics,
        "insights": insights.generate_insights(db, user.company_id, metrics),
        "deadlines": insights.upcoming_deadlines(db, user.company_id),
        "workload": insights.workload(db, user.company_id),
        "decisions": [
            {"id": str(d.id), "title": d.title, "status": d.status,
             "created_at": d.created_at.isoformat()}
            for d in insights.recent_decisions(db, user.company_id)
        ],
        "meetings": [
            {"id": str(m.id), "title": m.title, "starts_at": m.starts_at.isoformat(),
             "location": m.location}
            for m in insights.upcoming_meetings(db, user.company_id, user.id)
        ],
        "my_tasks": [
            {"id": str(t.id), "key": t.key, "title": t.title, "status": t.status,
             "priority": t.priority, "type": t.type,
             "due_date": t.due_date.isoformat() if t.due_date else None}
            for t in my_tasks
        ],
        "activity": [
            {"id": str(a.id), "action": a.action, "entity_type": a.entity_type,
             "entity_id": str(a.entity_id) if a.entity_id else None, "summary": a.summary,
             "actor": user_ref(db.get(User, a.actor_id)) if a.actor_id else None,
             "created_at": a.created_at.isoformat()}
            for a in activity
        ],
    }


@router.get("/analytics/company")
def company_analytics(db: DbSession, user: Annotated[User, Depends(require("analytics.read"))]):
    metrics = insights.company_metrics(db, user.company_id, user)
    projects_by_status = dict(
        db.execute(
            select(Project.status, func.count(Project.id))
            .where(Project.company_id == user.company_id, Project.deleted_at.is_(None))
            .group_by(Project.status)
        ).all()
    )
    tasks_by_status = dict(
        db.execute(
            select(Task.status, func.count(Task.id))
            .where(Task.company_id == user.company_id, Task.deleted_at.is_(None))
            .group_by(Task.status)
        ).all()
    )
    ideas_by_status = dict(
        db.execute(
            select(Idea.status, func.count(Idea.id))
            .where(Idea.company_id == user.company_id, Idea.deleted_at.is_(None))
            .group_by(Idea.status)
        ).all()
    )
    experiments_by_status = dict(
        db.execute(
            select(Experiment.status, func.count(Experiment.id))
            .where(Experiment.company_id == user.company_id)
            .group_by(Experiment.status)
        ).all()
    )
    month = func.to_char(Task.completed_at, "YYYY-MM")
    throughput = [
        {"month": m, "completed": c}
        for m, c in db.execute(
            select(month, func.count(Task.id))
            .where(Task.company_id == user.company_id, Task.completed_at.is_not(None),
                   Task.deleted_at.is_(None))
            .group_by(month).order_by(month)
        ).all()
    ]
    return {
        "metrics": metrics,
        "projects_by_status": projects_by_status,
        "tasks_by_status": tasks_by_status,
        "ideas_by_status": ideas_by_status,
        "experiments_by_status": experiments_by_status,
        "throughput": throughput,
        "insights": insights.generate_insights(db, user.company_id, metrics),
    }


@router.get("/analytics/projects")
def project_analytics(db: DbSession, user: Annotated[User, Depends(require("analytics.read"))]):
    today = date.today()
    rows = db.scalars(
        select(Project).where(Project.company_id == user.company_id,
                              Project.deleted_at.is_(None)).order_by(Project.name)
    ).all()
    out = []
    for project in rows:
        total = db.scalar(select(func.count(Task.id)).where(
            Task.project_id == project.id, Task.deleted_at.is_(None))) or 0
        done = db.scalar(select(func.count(Task.id)).where(
            Task.project_id == project.id, Task.status == "done",
            Task.deleted_at.is_(None))) or 0
        overdue = db.scalar(select(func.count(Task.id)).where(
            Task.project_id == project.id, Task.due_date < today,
            Task.status.notin_(["done", "cancelled"]), Task.deleted_at.is_(None))) or 0
        spent = float(db.scalar(select(func.sum(Transaction.amount)).where(
            Transaction.project_id == project.id, Transaction.kind == "expense",
            Transaction.deleted_at.is_(None))) or 0)
        out.append(
            {
                "id": str(project.id), "name": project.name, "key": project.key,
                "status": project.status, "health": project.health,
                "progress": project.progress, "color": project.color,
                "total_tasks": total, "done_tasks": done, "overdue_tasks": overdue,
                "budget": float(project.budget or 0), "spent": spent,
                "end_date": project.end_date.isoformat() if project.end_date else None,
            }
        )
    return {"projects": out}


@router.get("/analytics/people")
def people_analytics(db: DbSession, user: Annotated[User, Depends(require("analytics.read"))]):
    workload = insights.workload(db, user.company_id, limit=30)
    by_department = [
        {"name": name or "Unassigned", "count": count, "color": color or "#64748b"}
        for name, color, count in db.execute(
            select(Department.name, Department.color, func.count(User.id))
            .join(Department, User.department_id == Department.id, isouter=True)
            .where(User.company_id == user.company_id, User.is_active.is_(True),
                   User.deleted_at.is_(None))
            .group_by(Department.name, Department.color)
        ).all()
    ]
    completions = [
        {"name": name, "completed": count}
        for name, count in db.execute(
            select(User.full_name, func.count(Task.id))
            .join(Task, Task.assignee_id == User.id)
            .where(User.company_id == user.company_id, Task.status == "done",
                   Task.deleted_at.is_(None))
            .group_by(User.full_name).order_by(func.count(Task.id).desc()).limit(10)
        ).all()
    ]
    return {"workload": workload, "by_department": by_department, "completions": completions}


@router.get("/analytics/finance")
def finance_analytics(db: DbSession, user: Annotated[User, Depends(require("finance.read"))],
                      months: int = 12):
    from app.api.v1.finance import summary as finance_summary

    data = finance_summary(db, user, months=months)
    pipeline = [
        {"stage": stage, "value": float(value or 0), "count": count}
        for stage, value, count in db.execute(
            select(Deal.stage, func.sum(Deal.value), func.count(Deal.id))
            .where(Deal.company_id == user.company_id, Deal.deleted_at.is_(None))
            .group_by(Deal.stage)
        ).all()
    ]
    return {"summary": data.model_dump(), "pipeline": pipeline}
