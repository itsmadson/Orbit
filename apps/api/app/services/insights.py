"""Dashboard metrics and the deterministic insight engine.

Every insight below is computed from real rows in Postgres. Nothing here calls
an AI provider — when no model is configured the dashboard still tells the
truth, and `AI_PROVIDER` only changes the Orbit AI chat, never these numbers.
"""

import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.models.business import Deal, Invoice, Transaction
from app.models.identity import User
from app.models.innovation import Experiment, Idea, ResearchProject
from app.models.knowledge import Decision
from app.models.ops import Approval, Meeting, WorkflowRequest
from app.models.people import Goal, LeaveRequest
from app.models.work import Milestone, Project, Task


def _month_bounds(today: date) -> tuple[date, date]:
    start = today.replace(day=1)
    next_month = (start + timedelta(days=32)).replace(day=1)
    return start, next_month - timedelta(days=1)


def _sum(db: Session, stmt) -> float:
    return float(db.scalar(stmt) or 0)


def company_metrics(db: Session, company_id: uuid.UUID, user: User) -> dict:
    today = date.today()
    now = datetime.now(UTC)
    month_start, month_end = _month_bounds(today)
    prev_start = (month_start - timedelta(days=1)).replace(day=1)

    active_projects = db.scalar(
        select(func.count(Project.id)).where(
            Project.company_id == company_id,
            Project.status == "active",
            Project.deleted_at.is_(None),
        )
    ) or 0
    at_risk = db.scalar(
        select(func.count(Project.id)).where(
            Project.company_id == company_id,
            Project.status == "active",
            Project.health.in_(["at_risk", "off_track"]),
            Project.deleted_at.is_(None),
        )
    ) or 0
    open_tasks = db.scalar(
        select(func.count(Task.id)).where(
            Task.company_id == company_id,
            Task.status.notin_(["done", "cancelled"]),
            Task.deleted_at.is_(None),
        )
    ) or 0
    overdue_tasks = db.scalar(
        select(func.count(Task.id)).where(
            Task.company_id == company_id,
            Task.due_date < today,
            Task.status.notin_(["done", "cancelled"]),
            Task.deleted_at.is_(None),
        )
    ) or 0
    my_tasks = db.scalar(
        select(func.count(Task.id)).where(
            Task.company_id == company_id,
            Task.assignee_id == user.id,
            Task.status.notin_(["done", "cancelled"]),
            Task.deleted_at.is_(None),
        )
    ) or 0
    pending_approvals = db.scalar(
        select(func.count(Approval.id))
        .join(WorkflowRequest, Approval.request_id == WorkflowRequest.id)
        .where(
            WorkflowRequest.company_id == company_id,
            Approval.status == "pending",
        )
    ) or 0
    my_approvals = db.scalar(
        select(func.count(Approval.id))
        .join(WorkflowRequest, Approval.request_id == WorkflowRequest.id)
        .where(
            WorkflowRequest.company_id == company_id,
            Approval.status == "pending",
            Approval.approver_id == user.id,
        )
    ) or 0

    revenue = _sum(
        db,
        select(func.sum(Transaction.amount)).where(
            Transaction.company_id == company_id,
            Transaction.kind == "income",
            Transaction.occurred_on.between(month_start, month_end),
            Transaction.deleted_at.is_(None),
        ),
    )
    expenses = _sum(
        db,
        select(func.sum(Transaction.amount)).where(
            Transaction.company_id == company_id,
            Transaction.kind == "expense",
            Transaction.occurred_on.between(month_start, month_end),
            Transaction.deleted_at.is_(None),
        ),
    )
    prev_expenses = _sum(
        db,
        select(func.sum(Transaction.amount)).where(
            Transaction.company_id == company_id,
            Transaction.kind == "expense",
            Transaction.occurred_on.between(prev_start, month_start - timedelta(days=1)),
            Transaction.deleted_at.is_(None),
        ),
    )
    prev_revenue = _sum(
        db,
        select(func.sum(Transaction.amount)).where(
            Transaction.company_id == company_id,
            Transaction.kind == "income",
            Transaction.occurred_on.between(prev_start, month_start - timedelta(days=1)),
            Transaction.deleted_at.is_(None),
        ),
    )
    outstanding = _sum(
        db,
        select(func.sum(Invoice.total)).where(
            Invoice.company_id == company_id,
            Invoice.direction == "outgoing",
            Invoice.status.in_(["sent", "overdue"]),
            Invoice.deleted_at.is_(None),
        ),
    )
    pipeline = _sum(
        db,
        select(func.sum(Deal.value)).where(
            Deal.company_id == company_id,
            Deal.stage.notin_(["won", "lost"]),
            Deal.deleted_at.is_(None),
        ),
    )

    new_ideas = db.scalar(
        select(func.count(Idea.id)).where(
            Idea.company_id == company_id,
            Idea.created_at >= now - timedelta(days=30),
            Idea.deleted_at.is_(None),
        )
    ) or 0
    running_experiments = db.scalar(
        select(func.count(Experiment.id)).where(
            Experiment.company_id == company_id, Experiment.status == "running"
        )
    ) or 0
    active_research = db.scalar(
        select(func.count(ResearchProject.id)).where(
            ResearchProject.company_id == company_id,
            ResearchProject.status == "active",
            ResearchProject.deleted_at.is_(None),
        )
    ) or 0
    headcount = db.scalar(
        select(func.count(User.id)).where(
            User.company_id == company_id, User.is_active.is_(True), User.deleted_at.is_(None)
        )
    ) or 0
    on_leave = db.scalar(
        select(func.count(LeaveRequest.id)).where(
            LeaveRequest.company_id == company_id,
            LeaveRequest.status == "approved",
            LeaveRequest.start_date <= today,
            LeaveRequest.end_date >= today,
        )
    ) or 0
    goal_progress = db.scalar(
        select(func.avg(Goal.progress)).where(
            Goal.company_id == company_id, Goal.level == "company", Goal.deleted_at.is_(None)
        )
    )

    completion = db.scalar(
        select(func.count(Task.id)).where(
            Task.company_id == company_id, Task.status == "done", Task.deleted_at.is_(None)
        )
    ) or 0
    total_tasks = completion + open_tasks

    health = _health_score(
        at_risk=at_risk,
        active_projects=active_projects,
        overdue=overdue_tasks,
        open_tasks=open_tasks,
        revenue=revenue,
        expenses=expenses,
        goal_progress=float(goal_progress or 0),
    )

    return {
        "health": health,
        "active_projects": active_projects,
        "projects_at_risk": at_risk,
        "open_tasks": open_tasks,
        "overdue_tasks": overdue_tasks,
        "my_open_tasks": my_tasks,
        "task_completion_rate": round(completion / total_tasks * 100) if total_tasks else 0,
        "pending_approvals": pending_approvals,
        "my_pending_approvals": my_approvals,
        "monthly_revenue": revenue,
        "monthly_expenses": expenses,
        "previous_month_revenue": prev_revenue,
        "previous_month_expenses": prev_expenses,
        "net_monthly": revenue - expenses,
        "outstanding_invoices": outstanding,
        "pipeline_value": pipeline,
        "new_ideas": new_ideas,
        "running_experiments": running_experiments,
        "active_research": active_research,
        "headcount": headcount,
        "on_leave_today": on_leave,
        "company_goal_progress": round(float(goal_progress or 0)),
        "currency": "USD",
    }


def _health_score(**kw) -> int:
    score = 100.0
    if kw["active_projects"]:
        score -= (kw["at_risk"] / kw["active_projects"]) * 30
    if kw["open_tasks"]:
        score -= min(kw["overdue"] / kw["open_tasks"], 1.0) * 25
    if kw["revenue"] or kw["expenses"]:
        margin = (kw["revenue"] - kw["expenses"]) / max(kw["revenue"], 1.0)
        score -= max(0.0, min(-margin, 1.0)) * 25
    score -= max(0.0, (70 - kw["goal_progress"]) / 70) * 20
    return max(0, min(100, round(score)))


def upcoming_deadlines(db: Session, company_id: uuid.UUID, days: int = 14) -> list[dict]:
    today = date.today()
    horizon = today + timedelta(days=days)
    out: list[dict] = []
    tasks = db.scalars(
        select(Task)
        .where(
            Task.company_id == company_id,
            Task.due_date.between(today - timedelta(days=7), horizon),
            Task.status.notin_(["done", "cancelled"]),
            Task.deleted_at.is_(None),
        )
        .order_by(Task.due_date)
        .limit(8)
    ).all()
    for task in tasks:
        out.append(
            {
                "type": "task",
                "id": str(task.id),
                "title": f"{task.key} · {task.title}",
                "date": task.due_date.isoformat() if task.due_date else None,
                "overdue": bool(task.due_date and task.due_date < today),
                "url": f"/tasks/{task.id}",
            }
        )
    milestones = db.scalars(
        select(Milestone)
        .join(Project, Milestone.project_id == Project.id)
        .where(
            Project.company_id == company_id,
            Milestone.due_date.between(today - timedelta(days=7), horizon),
            Milestone.status != "completed",
        )
        .order_by(Milestone.due_date)
        .limit(5)
    ).all()
    for milestone in milestones:
        out.append(
            {
                "type": "milestone",
                "id": str(milestone.id),
                "title": milestone.name,
                "date": milestone.due_date.isoformat() if milestone.due_date else None,
                "overdue": bool(milestone.due_date and milestone.due_date < today),
                "url": f"/projects/{milestone.project_id}",
            }
        )
    invoices = db.scalars(
        select(Invoice)
        .where(
            Invoice.company_id == company_id,
            Invoice.due_on.between(today - timedelta(days=14), horizon),
            Invoice.status.in_(["sent", "overdue"]),
            Invoice.deleted_at.is_(None),
        )
        .order_by(Invoice.due_on)
        .limit(5)
    ).all()
    for invoice in invoices:
        out.append(
            {
                "type": "invoice",
                "id": str(invoice.id),
                "title": f"Invoice {invoice.number} · {float(invoice.total):,.0f}",
                "date": invoice.due_on.isoformat() if invoice.due_on else None,
                "overdue": bool(invoice.due_on and invoice.due_on < today),
                "url": f"/finance/invoices/{invoice.id}",
            }
        )
    out.sort(key=lambda item: item["date"] or "9999")
    return out[:12]


def workload(db: Session, company_id: uuid.UUID, limit: int = 8) -> list[dict]:
    rows = db.execute(
        select(
            User.id,
            User.full_name,
            User.avatar_color,
            User.title,
            func.count(Task.id).label("open_tasks"),
        )
        .join(
            Task,
            and_(
                Task.assignee_id == User.id,
                Task.status.notin_(["done", "cancelled"]),
                Task.deleted_at.is_(None),
            ),
            isouter=True,
        )
        .where(User.company_id == company_id, User.is_active.is_(True), User.deleted_at.is_(None))
        .group_by(User.id)
        .order_by(func.count(Task.id).desc())
        .limit(limit)
    ).all()
    max_open = max([r.open_tasks for r in rows], default=0) or 1
    return [
        {
            "id": str(r.id),
            "name": r.full_name,
            "title": r.title,
            "color": r.avatar_color,
            "open_tasks": r.open_tasks,
            "load": round(r.open_tasks / max_open * 100),
        }
        for r in rows
    ]


def generate_insights(db: Session, company_id: uuid.UUID, metrics: dict) -> list[dict]:
    """Rule-based insights over live data. Honest by construction."""
    today = date.today()
    insights: list[dict] = []

    behind = db.scalars(
        select(Project).where(
            Project.company_id == company_id,
            Project.status == "active",
            Project.health.in_(["at_risk", "off_track"]),
            Project.deleted_at.is_(None),
        ).limit(3)
    ).all()
    for project in behind:
        overdue = db.scalar(
            select(func.count(Task.id)).where(
                Task.project_id == project.id,
                Task.due_date < today,
                Task.status.notin_(["done", "cancelled"]),
                Task.deleted_at.is_(None),
            )
        ) or 0
        insights.append(
            {
                "level": "warning",
                "icon": "alert-triangle",
                "title": f"{project.name} is {'off track' if project.health == 'off_track' else 'at risk'}",
                "body": (
                    f"{overdue} overdue task(s) and {project.progress}% progress"
                    + (f", due {project.end_date.isoformat()}" if project.end_date else "")
                ),
                "url": f"/projects/{project.id}",
            }
        )

    if metrics["monthly_expenses"] and metrics["previous_month_expenses"]:
        delta = (
            (metrics["monthly_expenses"] - metrics["previous_month_expenses"])
            / metrics["previous_month_expenses"] * 100
        )
        if abs(delta) >= 10:
            insights.append(
                {
                    "level": "warning" if delta > 0 else "success",
                    "icon": "banknote",
                    "title": f"Expenses are {abs(delta):.0f}% {'above' if delta > 0 else 'below'} last month",
                    "body": f"{metrics['monthly_expenses']:,.0f} this month vs "
                            f"{metrics['previous_month_expenses']:,.0f} last month.",
                    "url": "/finance",
                }
            )

    high_potential = db.scalars(
        select(Idea).where(
            Idea.company_id == company_id,
            Idea.status.in_(["submitted", "discussion", "evaluation"]),
            Idea.score >= 12,
            Idea.deleted_at.is_(None),
        ).limit(5)
    ).all()
    if high_potential:
        insights.append(
            {
                "level": "idea",
                "icon": "lightbulb",
                "title": f"{len(high_potential)} idea(s) score high on value and feasibility",
                "body": ", ".join(i.title for i in high_potential[:3]),
                "url": "/ideas",
            }
        )

    recent_experiments = db.scalars(
        select(Experiment)
        .where(
            Experiment.company_id == company_id,
            Experiment.status.in_(["completed", "validated"]),
            Experiment.ended_at.is_not(None),
        )
        .order_by(Experiment.ended_at.desc())
        .limit(2)
    ).all()
    for experiment in recent_experiments:
        insights.append(
            {
                "level": "success",
                "icon": "flask-conical",
                "title": f"Experiment #{experiment.number} {experiment.status}",
                "body": experiment.name,
                "url": f"/experiments/{experiment.id}",
            }
        )

    heavy = workload(db, company_id, limit=3)
    if heavy and heavy[0]["open_tasks"] >= 8:
        insights.append(
            {
                "level": "warning",
                "icon": "users",
                "title": f"{heavy[0]['name']} carries {heavy[0]['open_tasks']} open tasks",
                "body": "Consider rebalancing work across the team.",
                "url": "/analytics/people",
            }
        )

    if metrics["overdue_tasks"]:
        insights.append(
            {
                "level": "warning",
                "icon": "clock",
                "title": f"{metrics['overdue_tasks']} task(s) are past their due date",
                "body": "Review the overdue queue and reschedule or reassign.",
                "url": "/tasks?overdue=true",
            }
        )

    if metrics["outstanding_invoices"]:
        insights.append(
            {
                "level": "info",
                "icon": "receipt",
                "title": f"{metrics['outstanding_invoices']:,.0f} outstanding in unpaid invoices",
                "body": "Chase overdue customer invoices to protect cash flow.",
                "url": "/finance",
            }
        )

    return insights[:6]


def recent_decisions(db: Session, company_id: uuid.UUID, limit: int = 5) -> list[Decision]:
    return list(
        db.scalars(
            select(Decision)
            .where(Decision.company_id == company_id, Decision.deleted_at.is_(None))
            .order_by(Decision.created_at.desc())
            .limit(limit)
        ).all()
    )


def upcoming_meetings(db: Session, company_id: uuid.UUID, user_id: uuid.UUID, limit: int = 5) -> list[Meeting]:
    now = datetime.now(UTC)
    return list(
        db.scalars(
            select(Meeting)
            .where(
                Meeting.company_id == company_id,
                Meeting.starts_at >= now - timedelta(hours=2),
                Meeting.deleted_at.is_(None),
            )
            .order_by(Meeting.starts_at)
            .limit(limit)
        ).all()
    )
