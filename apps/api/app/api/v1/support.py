"""Tickets, uptime monitors, and the customer portal.

Staff reach these through /tickets and /monitors. A customer login reaches the
same data through /portal, where every query is additionally narrowed to their
own CRM company — the filter lives here, on the server, not in the client.
"""

import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select

from app.api.helpers import get_or_404, user_ref
from app.core.deps import CurrentUser, DbSession, can, require
from app.core.db import SessionLocal
from app.core.errors import BadRequest, Conflict, Forbidden, NotFound
from app.core.pagination import Paging, as_page
from app.models.business import CrmCompany
from app.models.identity import User
from app.models.system import Attachment
from app.models.support import (
    TICKET_PRIORITIES, TICKET_SOURCES, TICKET_STATUSES, Monitor, MonitorCheck,
    MonitorIncident, Ticket, TicketMessage,
)
from app.models.work import Project, Task
from app.schemas.common import Message
from app.schemas.support import (
    MonitorIn, MonitorUpdate, TicketIn, TicketMessageIn, TicketUpdate,
)
from app.services import audit, graph, notifications
from app.services import support as svc

router = APIRouter(tags=["support"])


# ------------------------------------------------------------------ helpers
def _customer_scope(user: User) -> uuid.UUID | None:
    """The CRM company a customer login is locked to; None for staff."""
    return user.crm_company_id if user.role == "customer" else None


def ticket_out(db, ticket: Ticket, detail: bool = False, for_customer: bool = False) -> dict:
    company = db.get(CrmCompany, ticket.crm_company_id) if ticket.crm_company_id else None
    data = {
        "id": ticket.id, "number": ticket.number, "subject": ticket.subject,
        "status": ticket.status, "priority": ticket.priority, "category": ticket.category,
        "source": ticket.source,
        "customer": {"id": company.id, "name": company.name} if company else None,
        "assignee": user_ref(db.get(User, ticket.assignee_id)) if ticket.assignee_id else None,
        "requester": (
            user_ref(db.get(User, ticket.requester_id)) if ticket.requester_id else None
        ),
        "created_at": ticket.created_at, "updated_at": ticket.updated_at,
        "first_response_at": ticket.first_response_at, "resolved_at": ticket.resolved_at,
        "sla": svc.sla_state(ticket),
        "message_count": db.scalar(select(func.count(TicketMessage.id)).where(
            TicketMessage.ticket_id == ticket.id,
            *([TicketMessage.is_internal.is_(False)] if for_customer else []),
        )) or 0,
        "attachment_count": db.scalar(select(func.count(Attachment.id)).where(
            Attachment.entity_type == "ticket", Attachment.entity_id == ticket.id,
            Attachment.deleted_at.is_(None),
        )) or 0,
    }
    if detail:
        data |= {
            "body": ticket.body, "tags": ticket.tags or [], "project_id": ticket.project_id,
            "task_id": ticket.task_id, "monitor_id": ticket.monitor_id,
            "contact_email": ticket.contact_email, "satisfaction": ticket.satisfaction,
            "reopened_count": ticket.reopened_count,
        }
    return data


def _visible_tickets(db, user: User):
    stmt = select(Ticket).where(Ticket.company_id == user.company_id,
                                Ticket.deleted_at.is_(None))
    scope = _customer_scope(user)
    if scope:
        stmt = stmt.where(Ticket.crm_company_id == scope)
    return stmt


def _guard_ticket(db, user: User, ticket_id: uuid.UUID) -> Ticket:
    ticket = get_or_404(db, Ticket, ticket_id, user.company_id, "Ticket")
    scope = _customer_scope(user)
    if scope and ticket.crm_company_id != scope:
        # Not "forbidden" — a customer should not learn that the ticket exists.
        raise NotFound("Ticket")
    return ticket


# ------------------------------------------------------------------ tickets
@router.get("/tickets")
def list_tickets(db: DbSession, user: Annotated[User, Depends(require("support.read"))],
                 paging: Paging, q: str | None = None,
                 status: Annotated[list[str] | None, Query()] = None,
                 priority: Annotated[list[str] | None, Query()] = None,
                 customer_id: uuid.UUID | None = None,
                 assignee_id: uuid.UUID | None = None,
                 mine: bool = False, breached: bool = False, unassigned: bool = False):
    stmt = _visible_tickets(db, user)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Ticket.subject.ilike(like), Ticket.number.ilike(like),
                              Ticket.body.ilike(like)))
    if status:
        stmt = stmt.where(Ticket.status.in_(status))
    if priority:
        stmt = stmt.where(Ticket.priority.in_(priority))
    if customer_id:
        stmt = stmt.where(Ticket.crm_company_id == customer_id)
    if assignee_id:
        stmt = stmt.where(Ticket.assignee_id == assignee_id)
    if mine:
        stmt = stmt.where(Ticket.assignee_id == user.id)
    if unassigned:
        stmt = stmt.where(Ticket.assignee_id.is_(None))
    if breached:
        now = datetime.now(UTC)
        stmt = stmt.where(
            Ticket.status.notin_(["resolved", "closed", "pending_customer"]),
            or_(
                (Ticket.first_response_at.is_(None)) & (Ticket.response_due_at < now),
                (Ticket.resolved_at.is_(None)) & (Ticket.resolution_due_at < now),
            ),
        )
    stmt = stmt.order_by(Ticket.created_at.desc())
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.scalars(stmt.limit(paging.page_size).offset(paging.offset)).all()
    return as_page(
        [ticket_out(db, row, for_customer=bool(_customer_scope(user))) for row in rows],
        total, paging,
    )


@router.get("/tickets/stats")
def ticket_stats(db: DbSession, user: Annotated[User, Depends(require("support.read"))]):
    now = datetime.now(UTC)
    base = _visible_tickets(db, user).order_by(None).subquery()
    counts = {
        status: db.scalar(
            select(func.count()).select_from(base).where(base.c.status == status)
        ) or 0
        for status in TICKET_STATUSES
    }
    breached = db.scalar(select(func.count()).select_from(base).where(
        base.c.status.notin_(["resolved", "closed", "pending_customer"]),
        or_((base.c.first_response_at.is_(None)) & (base.c.response_due_at < now),
            (base.c.resolved_at.is_(None)) & (base.c.resolution_due_at < now)),
    )) or 0
    unassigned = db.scalar(select(func.count()).select_from(base).where(
        base.c.assignee_id.is_(None),
        base.c.status.notin_(["resolved", "closed"]),
    )) or 0
    return {
        "by_status": counts,
        "open": counts["new"] + counts["open"] + counts["pending_customer"],
        "breached": breached,
        "unassigned": unassigned,
    }


@router.post("/tickets", status_code=201)
def create_ticket(payload: TicketIn, db: DbSession,
                  user: Annotated[User, Depends(require("support.write"))]):
    if payload.priority not in TICKET_PRIORITIES:
        raise BadRequest(f"Unknown priority: {payload.priority}")
    scope = _customer_scope(user)
    data = payload.model_dump()
    if scope:
        # A customer may only ever file against their own company, whatever the
        # request body says.
        data["crm_company_id"] = scope
        data["source"] = "portal"
    ticket = Ticket(
        company_id=user.company_id,
        number=svc.next_ticket_number(db, user.company_id),
        requester_id=user.id if scope else data.pop("requester_id", None),
        **{k: v for k, v in data.items() if k != "requester_id"},
    )
    svc.apply_sla(ticket)
    db.add(ticket)
    db.flush()

    if ticket.crm_company_id:
        graph.link(db, company_id=user.company_id, from_type="ticket", from_id=ticket.id,
                   rel_type="relates_to", to_type="crm_company", to_id=ticket.crm_company_id)
    audit.record(db, actor=user, action="created", entity_type="ticket", entity_id=ticket.id,
                 summary=f"{ticket.number}: {ticket.subject}")

    # Staff need to know a customer is waiting; the queue owner is whoever can
    # see support, so notify the ticket's assignee or leave it in the queue.
    if ticket.assignee_id and ticket.assignee_id != user.id:
        notifications.notify(
            db, user_id=ticket.assignee_id, company_id=user.company_id,
            type="ticket_assigned", title=f"{ticket.number}: {ticket.subject}",
            body=(ticket.body or "")[:200], entity_type="ticket", entity_id=ticket.id,
            url=f"/tickets/{ticket.id}", actor_id=user.id,
            priority="high" if ticket.priority in ("urgent", "high") else "normal",
        )
    return ticket_out(db, ticket, detail=True, for_customer=bool(scope))


@router.get("/tickets/{ticket_id}")
def get_ticket(ticket_id: uuid.UUID, db: DbSession,
               user: Annotated[User, Depends(require("support.read"))]):
    ticket = _guard_ticket(db, user, ticket_id)
    return ticket_out(db, ticket, detail=True, for_customer=bool(_customer_scope(user)))


@router.patch("/tickets/{ticket_id}")
def update_ticket(ticket_id: uuid.UUID, payload: TicketUpdate, db: DbSession,
                  user: Annotated[User, Depends(require("support.write"))]):
    ticket = _guard_ticket(db, user, ticket_id)
    scope = _customer_scope(user)
    changes = payload.model_dump(exclude_unset=True)
    if scope:
        # A customer can close their own ticket or rate it; nothing else.
        allowed = {"satisfaction"} | ({"status"} if changes.get("status") == "closed" else set())
        changes = {k: v for k, v in changes.items() if k in allowed}
        if not changes:
            raise Forbidden("You can only close or rate your own ticket.")

    if "status" in changes and changes["status"] not in TICKET_STATUSES:
        raise BadRequest(f"Unknown status: {changes['status']}")

    previous = ticket.status
    now = datetime.now(UTC)
    for key, value in changes.items():
        setattr(ticket, key, value)

    if "priority" in changes:
        svc.apply_sla(ticket, ticket.created_at)
    if changes.get("status") == "resolved" and not ticket.resolved_at:
        ticket.resolved_at = now
    if changes.get("status") == "closed" and not ticket.closed_at:
        ticket.closed_at = now
        ticket.resolved_at = ticket.resolved_at or now
    if changes.get("status") in ("open", "new") and previous in ("resolved", "closed"):
        ticket.reopened_count += 1
        ticket.resolved_at = ticket.closed_at = None

    db.flush()
    audit.record(db, actor=user, action="updated", entity_type="ticket", entity_id=ticket.id,
                 summary=f"{ticket.number}: {', '.join(changes) or 'no change'}")

    if "assignee_id" in changes and ticket.assignee_id and ticket.assignee_id != user.id:
        notifications.notify(
            db, user_id=ticket.assignee_id, company_id=user.company_id,
            type="ticket_assigned", title=f"{ticket.number}: {ticket.subject}",
            entity_type="ticket", entity_id=ticket.id, url=f"/tickets/{ticket.id}",
            actor_id=user.id,
        )
    if previous != ticket.status and ticket.requester_id and ticket.requester_id != user.id:
        notifications.notify(
            db, user_id=ticket.requester_id, company_id=user.company_id,
            type="ticket_update",
            title=f"{ticket.number} is now {ticket.status.replace('_', ' ')}",
            entity_type="ticket", entity_id=ticket.id, url=f"/portal/tickets/{ticket.id}",
            actor_id=user.id,
        )
    return ticket_out(db, ticket, detail=True, for_customer=bool(scope))


# ------------------------------------------------------------------ messages
@router.get("/tickets/{ticket_id}/messages")
def list_messages(ticket_id: uuid.UUID, db: DbSession,
                  user: Annotated[User, Depends(require("support.read"))]):
    ticket = _guard_ticket(db, user, ticket_id)
    stmt = select(TicketMessage).where(TicketMessage.ticket_id == ticket.id)
    if _customer_scope(user):
        stmt = stmt.where(TicketMessage.is_internal.is_(False))
    rows = db.scalars(stmt.order_by(TicketMessage.created_at)).all()
    return [
        {
            "id": row.id, "body": row.body, "is_internal": row.is_internal,
            "is_from_customer": row.is_from_customer,
            "author": user_ref(db.get(User, row.author_id)) if row.author_id else None,
            "created_at": row.created_at,
        }
        for row in rows
    ]


@router.post("/tickets/{ticket_id}/messages", status_code=201)
def add_message(ticket_id: uuid.UUID, payload: TicketMessageIn, db: DbSession,
                user: Annotated[User, Depends(require("support.write"))]):
    ticket = _guard_ticket(db, user, ticket_id)
    scope = _customer_scope(user)
    internal = payload.is_internal and not scope

    message = TicketMessage(
        company_id=user.company_id, ticket_id=ticket.id, author_id=user.id,
        body=payload.body, is_internal=internal, is_from_customer=bool(scope),
    )
    db.add(message)

    now = datetime.now(UTC)
    # The first public reply from staff is what stops the response clock.
    if not scope and not internal and not ticket.first_response_at:
        ticket.first_response_at = now
    if scope and ticket.status in ("resolved", "pending_customer"):
        ticket.status = "open"          # a customer replying reopens the conversation
    elif not scope and not internal and ticket.status == "new":
        ticket.status = "open"
    db.flush()

    if scope:
        recipients = [ticket.assignee_id] if ticket.assignee_id else []
        title = f"{ticket.number}: reply from {user.full_name}"
        url = f"/tickets/{ticket.id}"
    else:
        recipients = [ticket.requester_id] if (ticket.requester_id and not internal) else []
        title = f"{ticket.number}: {ticket.subject}"
        url = f"/portal/tickets/{ticket.id}"
    notifications.notify_many(
        db, [r for r in recipients if r and r != user.id], company_id=user.company_id,
        type="ticket_update", title=title, body=payload.body[:200],
        entity_type="ticket", entity_id=ticket.id, url=url, actor_id=user.id,
    )
    return {
        "id": message.id, "body": message.body, "is_internal": message.is_internal,
        "is_from_customer": message.is_from_customer, "author": user_ref(user),
        "created_at": message.created_at,
    }


@router.post("/tickets/{ticket_id}/to-task")
def ticket_to_task(ticket_id: uuid.UUID, db: DbSession,
                   user: Annotated[User, Depends(require("tasks.write"))],
                   project_id: uuid.UUID | None = None):
    """Turn a ticket into internal work, keeping both ends linked."""
    ticket = _guard_ticket(db, user, ticket_id)
    if _customer_scope(user):
        raise Forbidden("Not available from the portal.")
    if ticket.task_id:
        raise Conflict("This ticket already has a task.")

    project = db.get(Project, project_id) if project_id else None
    if project and project.company_id != user.company_id:
        raise NotFound("Project")
    if project:
        project.task_counter = (project.task_counter or 0) + 1
        key = f"{project.key}-{project.task_counter}"
    else:
        key = f"SUP-{ticket.number.split('-')[-1]}"
    # Task keys are unique per company; step past anything already taken rather
    # than failing the request on a collision.
    suffix = 1
    base = key
    while db.scalar(select(Task.id).where(Task.company_id == user.company_id, Task.key == key)):
        suffix += 1
        key = f"{base}-{suffix}"

    task = Task(
        company_id=user.company_id, key=key, title=ticket.subject,
        description=ticket.body, type="task", status="todo",
        priority="urgent" if ticket.priority == "urgent" else "high",
        project_id=project.id if project else None, reporter_id=user.id,
        labels=["support"],
    )
    db.add(task)
    db.flush()
    ticket.task_id = task.id
    graph.link(db, company_id=user.company_id, from_type="ticket", from_id=ticket.id,
               rel_type="creates", to_type="task", to_id=task.id)
    audit.record(db, actor=user, action="created", entity_type="task", entity_id=task.id,
                 summary=f"{task.key} from ticket {ticket.number}")
    return {"task_id": task.id, "key": task.key}


# ----------------------------------------------------------------- monitors
def monitor_out(db, monitor: Monitor, detail: bool = False) -> dict:
    company = db.get(CrmCompany, monitor.crm_company_id) if monitor.crm_company_id else None
    data = {
        "id": monitor.id, "name": monitor.name, "url": monitor.url,
        "status": monitor.status, "is_active": monitor.is_active,
        "interval_seconds": monitor.interval_seconds,
        "last_checked_at": monitor.last_checked_at,
        "last_response_ms": monitor.last_response_ms, "last_error": monitor.last_error,
        "uptime": svc.uptime_ratio(monitor),
        "total_checks": monitor.total_checks, "failed_checks": monitor.failed_checks,
        "customer": {"id": company.id, "name": company.name} if company else None,
    }
    if detail:
        data |= {
            "method": monitor.method, "expected_status": monitor.expected_status,
            "expected_body": monitor.expected_body, "timeout_seconds": monitor.timeout_seconds,
            "failure_threshold": monitor.failure_threshold, "is_public": monitor.is_public,
            "consecutive_failures": monitor.consecutive_failures,
            "next_check_at": monitor.next_check_at,
        }
    return data


def _visible_monitors(db, user: User):
    stmt = select(Monitor).where(Monitor.company_id == user.company_id,
                                 Monitor.deleted_at.is_(None))
    scope = _customer_scope(user)
    if scope:
        # A customer sees only their own, and only the ones marked public.
        stmt = stmt.where(Monitor.crm_company_id == scope, Monitor.is_public.is_(True))
    return stmt


@router.get("/monitors")
def list_monitors(db: DbSession, user: Annotated[User, Depends(require("monitoring.read"))],
                  customer_id: uuid.UUID | None = None):
    stmt = _visible_monitors(db, user)
    if customer_id:
        stmt = stmt.where(Monitor.crm_company_id == customer_id)
    rows = db.scalars(stmt.order_by(Monitor.status.desc(), Monitor.name)).all()
    down = [m for m in rows if m.status == "down"]
    return {
        "items": [monitor_out(db, row) for row in rows],
        "down": len(down),
        "up": len([m for m in rows if m.status == "up"]),
        "uptime": round(
            sum(svc.uptime_ratio(m) for m in rows) / len(rows), 2
        ) if rows else 100.0,
    }


@router.post("/monitors", status_code=201)
def create_monitor(payload: MonitorIn, db: DbSession,
                   user: Annotated[User, Depends(require("monitoring.write"))]):
    if not payload.url.startswith(("http://", "https://")):
        raise BadRequest("A monitor URL must start with http:// or https://")
    monitor = Monitor(company_id=user.company_id, **payload.model_dump())
    monitor.next_check_at = datetime.now(UTC)
    db.add(monitor)
    db.flush()
    audit.record(db, actor=user, action="created", entity_type="monitor",
                 entity_id=monitor.id, summary=f"Monitoring {monitor.url}")
    return monitor_out(db, monitor, detail=True)


@router.patch("/monitors/{monitor_id}")
def update_monitor(monitor_id: uuid.UUID, payload: MonitorUpdate, db: DbSession,
                   user: Annotated[User, Depends(require("monitoring.write"))]):
    monitor = get_or_404(db, Monitor, monitor_id, user.company_id, "Monitor")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(monitor, key, value)
    db.flush()
    return monitor_out(db, monitor, detail=True)


@router.delete("/monitors/{monitor_id}", response_model=Message)
def delete_monitor(monitor_id: uuid.UUID, db: DbSession,
                   user: Annotated[User, Depends(require("monitoring.write"))]):
    monitor = get_or_404(db, Monitor, monitor_id, user.company_id, "Monitor")
    monitor.deleted_at = datetime.now(UTC)
    return Message(message="Monitor removed")


@router.get("/monitors/{monitor_id}")
def get_monitor(monitor_id: uuid.UUID, db: DbSession,
                user: Annotated[User, Depends(require("monitoring.read"))],
                hours: int = 24):
    monitor = get_or_404(db, Monitor, monitor_id, user.company_id, "Monitor")
    scope = _customer_scope(user)
    if scope and (monitor.crm_company_id != scope or not monitor.is_public):
        raise NotFound("Monitor")

    since = datetime.now(UTC) - timedelta(hours=hours)
    checks = db.scalars(
        select(MonitorCheck)
        .where(MonitorCheck.monitor_id == monitor.id, MonitorCheck.created_at >= since)
        .order_by(MonitorCheck.created_at)
    ).all()
    incidents = db.scalars(
        select(MonitorIncident)
        .where(MonitorIncident.monitor_id == monitor.id)
        .order_by(MonitorIncident.started_at.desc()).limit(20)
    ).all()
    return monitor_out(db, monitor, detail=True) | {
        "checks": [
            {"at": c.created_at, "ok": c.ok, "ms": c.response_ms,
             "status_code": c.status_code, "error": c.error}
            for c in checks
        ],
        "incidents": [
            {"id": i.id, "started_at": i.started_at, "resolved_at": i.resolved_at,
             "duration_seconds": i.duration_seconds, "cause": i.cause,
             "ticket_id": i.ticket_id}
            for i in incidents
        ],
    }


@router.post("/monitors/check")
async def check_now(db: DbSession,
                    user: Annotated[User, Depends(require("monitoring.write"))],
                    monitor_id: uuid.UUID | None = None):
    """Probe on demand, rather than waiting for the loop."""
    if monitor_id:
        monitor = get_or_404(db, Monitor, monitor_id, user.company_id, "Monitor")
        result = await svc.probe(monitor)
        incident = svc.record_check(db, monitor, result)
        if incident is not None:
            svc._raise_ticket(db, monitor, incident)
        db.flush()
        return {"checked": 1, "result": result, "status": monitor.status}
    checked = await svc.run_due_monitors(SessionLocal)
    return {"checked": checked}


# -------------------------------------------------------------------- portal
@router.get("/portal/overview")
def portal_overview(db: DbSession, user: CurrentUser):
    """Everything a customer is entitled to see, in one call.

    Deliberately its own endpoint rather than the staff dashboard with fields
    removed — the portal should never be one forgotten filter away from leaking.
    """
    scope = _customer_scope(user)
    if not scope:
        raise Forbidden("The portal is for customer logins.")
    company = db.get(CrmCompany, scope)

    tickets = db.scalars(
        select(Ticket).where(Ticket.crm_company_id == scope, Ticket.deleted_at.is_(None))
        .order_by(Ticket.created_at.desc()).limit(10)
    ).all()
    open_count = db.scalar(select(func.count(Ticket.id)).where(
        Ticket.crm_company_id == scope, Ticket.deleted_at.is_(None),
        Ticket.status.notin_(["resolved", "closed"]),
    )) or 0
    monitors = db.scalars(
        select(Monitor).where(Monitor.crm_company_id == scope, Monitor.is_public.is_(True),
                              Monitor.deleted_at.is_(None)).order_by(Monitor.name)
    ).all()
    projects = db.scalars(
        select(Project).join(Ticket, Ticket.project_id == Project.id, isouter=True)
        .where(Project.company_id == user.company_id, Project.deleted_at.is_(None))
        .distinct().limit(0)
    ).all()

    return {
        "company": {"id": company.id, "name": company.name} if company else None,
        "open_tickets": open_count,
        "tickets": [ticket_out(db, t, for_customer=True) for t in tickets],
        "monitors": [monitor_out(db, m) for m in monitors],
        "uptime": round(
            sum(svc.uptime_ratio(m) for m in monitors) / len(monitors), 2
        ) if monitors else None,
        "projects": [{"id": p.id, "name": p.name} for p in projects],
    }
