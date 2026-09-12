"""Ticket numbering, SLA clocks and the uptime checker."""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta

import httpx
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.support import (
    SLA_TARGETS, Monitor, MonitorCheck, MonitorIncident, Ticket,
)

logger = logging.getLogger("orbit.support")


# ------------------------------------------------------------------- tickets
def next_ticket_number(db: Session, company_id) -> str:
    """Sequential per company: TKT-0001. Readable aloud on a phone call."""
    count = db.scalar(
        select(func.count(Ticket.id)).where(Ticket.company_id == company_id)
    ) or 0
    return f"TKT-{count + 1:04d}"


def apply_sla(ticket: Ticket, opened_at: datetime | None = None) -> None:
    """Stamp the response and resolution deadlines for this priority."""
    opened_at = opened_at or datetime.now(UTC)
    response_hours, resolution_hours = SLA_TARGETS.get(ticket.priority, SLA_TARGETS["normal"])
    ticket.response_due_at = opened_at + timedelta(hours=response_hours)
    ticket.resolution_due_at = opened_at + timedelta(hours=resolution_hours)


def sla_state(ticket: Ticket, now: datetime | None = None) -> dict:
    """Where each clock stands. Paused once the ball is in the customer's court.

    A ticket waiting on the customer should not burn its resolution target —
    otherwise every SLA report measures how slowly customers reply.
    """
    now = now or datetime.now(UTC)
    paused = ticket.status == "pending_customer"
    done = ticket.status in ("resolved", "closed")

    def remaining(due: datetime | None, met_at: datetime | None) -> dict | None:
        if not due:
            return None
        if met_at:
            return {"met": met_at <= due, "at": met_at, "due": due, "breached": met_at > due}
        if paused or done:
            return {"met": None, "due": due, "paused": paused}
        seconds = (due - now).total_seconds()
        return {
            "met": None, "due": due, "breached": seconds < 0,
            "hours_left": round(seconds / 3600, 1),
        }

    return {
        "response": remaining(ticket.response_due_at, ticket.first_response_at),
        "resolution": remaining(ticket.resolution_due_at, ticket.resolved_at),
        "paused": paused,
    }


# ---------------------------------------------------------------- monitoring
async def probe(monitor: Monitor) -> dict:
    """Run one HTTP check. Never raises: a failed probe is a result, not an error."""
    started = datetime.now(UTC)
    try:
        async with httpx.AsyncClient(
            timeout=monitor.timeout_seconds, follow_redirects=True
        ) as client:
            response = await client.request(monitor.method or "GET", monitor.url)
        elapsed = int((datetime.now(UTC) - started).total_seconds() * 1000)
        if response.status_code != monitor.expected_status:
            return {"ok": False, "status_code": response.status_code, "response_ms": elapsed,
                    "error": f"Expected {monitor.expected_status}, got {response.status_code}"}
        # A 200 that renders an error page is still an outage.
        if monitor.expected_body and monitor.expected_body not in response.text:
            return {"ok": False, "status_code": response.status_code, "response_ms": elapsed,
                    "error": "Expected text missing from the response"}
        return {"ok": True, "status_code": response.status_code, "response_ms": elapsed,
                "error": None}
    except Exception as exc:
        elapsed = int((datetime.now(UTC) - started).total_seconds() * 1000)
        return {"ok": False, "status_code": None, "response_ms": elapsed,
                "error": f"{type(exc).__name__}: {exc}"[:400]}


def record_check(db: Session, monitor: Monitor, result: dict) -> MonitorIncident | None:
    """Store a probe and move the monitor's state. Returns a newly opened incident.

    A single failure is not an outage — `failure_threshold` consecutive ones
    are — so one dropped packet never raises a ticket.
    """
    now = datetime.now(UTC)
    db.add(MonitorCheck(
        company_id=monitor.company_id, monitor_id=monitor.id, ok=result["ok"],
        status_code=result.get("status_code"), response_ms=result.get("response_ms"),
        error=result.get("error"),
    ))
    monitor.last_checked_at = now
    monitor.next_check_at = now + timedelta(seconds=monitor.interval_seconds)
    monitor.last_response_ms = result.get("response_ms")
    monitor.total_checks += 1

    opened: MonitorIncident | None = None
    if result["ok"]:
        monitor.consecutive_failures = 0
        monitor.last_error = None
        if monitor.status == "down":
            incident = db.scalar(
                select(MonitorIncident)
                .where(MonitorIncident.monitor_id == monitor.id,
                       MonitorIncident.resolved_at.is_(None))
                .order_by(MonitorIncident.started_at.desc())
            )
            if incident:
                incident.resolved_at = now
                incident.duration_seconds = int(
                    (now - incident.started_at).total_seconds()
                )
        monitor.status = "up"
    else:
        monitor.consecutive_failures += 1
        monitor.failed_checks += 1
        monitor.last_error = result.get("error")
        if monitor.consecutive_failures >= monitor.failure_threshold:
            if monitor.status != "down":
                opened = MonitorIncident(
                    company_id=monitor.company_id, monitor_id=monitor.id,
                    started_at=now, cause=result.get("error"),
                )
                db.add(opened)
            monitor.status = "down"
        else:
            monitor.status = "degraded"
    return opened


def uptime_ratio(monitor: Monitor) -> float:
    if not monitor.total_checks:
        return 100.0
    return round((1 - monitor.failed_checks / monitor.total_checks) * 100, 2)


async def run_due_monitors(session_factory, limit: int = 25) -> int:
    """Check every monitor that is due. Used by the background loop and by hand."""
    from app.models.identity import Company  # noqa: F401  (registers metadata)

    with session_factory() as db:
        now = datetime.now(UTC)
        due = db.scalars(
            select(Monitor).where(
                Monitor.is_active.is_(True),
                Monitor.deleted_at.is_(None),
                (Monitor.next_check_at.is_(None)) | (Monitor.next_check_at <= now),
            ).limit(limit)
        ).all()
        if not due:
            return 0
        results = await asyncio.gather(*(probe(monitor) for monitor in due))
        for monitor, result in zip(due, results):
            incident = record_check(db, monitor, result)
            if incident is not None:
                _raise_ticket(db, monitor, incident)
        db.commit()
        return len(due)


def _raise_ticket(db: Session, monitor: Monitor, incident: MonitorIncident) -> None:
    """Turn a confirmed outage into a ticket, so it enters the same queue as
    everything else a customer is waiting on."""
    ticket = Ticket(
        company_id=monitor.company_id,
        number=next_ticket_number(db, monitor.company_id),
        subject=f"{monitor.name} is down",
        body=f"{monitor.url} failed {monitor.consecutive_failures} checks in a row.\n\n"
             f"{monitor.last_error or ''}",
        status="new", priority="urgent", source="monitor", category="availability",
        crm_company_id=monitor.crm_company_id, monitor_id=monitor.id,
    )
    apply_sla(ticket)
    db.add(ticket)
    db.flush()
    incident.ticket_id = ticket.id
    logger.warning("monitor %s is down, opened %s", monitor.name, ticket.number)


async def monitor_loop(session_factory, interval: int = 30) -> None:
    """Background poller. Deliberately simple: one process, one loop.

    A dedicated scheduler would be the answer at scale; for a self-hosted
    workspace this keeps the deployment to the same three containers.
    """
    await asyncio.sleep(5)
    while True:
        try:
            checked = await run_due_monitors(session_factory)
            if checked:
                logger.info("checked %s monitors", checked)
        except Exception:
            logger.exception("monitor loop iteration failed")
        await asyncio.sleep(interval)
