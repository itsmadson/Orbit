"""Keeping an Orbit task and its remote issue in step.

Each linked task has an ``ExternalIssue`` row holding a *snapshot*: the fields as
they stood the last time both sides agreed. That is what lets a sync tell which
side moved:

    remote != snapshot           -> the tracker changed; pull it into the task
    task   != snapshot           -> Orbit changed; push it to the tracker
    both                         -> the tracker wins the field it changed

Pushes happen inline when a task is edited, so Orbit is rarely the stale side.
A failed push never fails the user's edit — it is recorded on the link and the
next sync retries it.
"""

import asyncio
import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.identity import User
from app.models.system import ExternalIssue, Integration, IntegrationLink
from app.models.work import Project, Task
from app.services import task_status
from app.services.integrations import CONNECTORS, Connector, IntegrationError, RemoteIssue
from app.services.integrations import crypto

logger = logging.getLogger("orbit.integrations")

SYNCED_FIELDS = ("title", "body", "category")


# ------------------------------------------------------------------ connections
def integration_row(db: Session, company_id: uuid.UUID, provider: str) -> Integration | None:
    return db.scalar(select(Integration).where(
        Integration.company_id == company_id, Integration.provider == provider))


def connector_for(db: Session, company_id: uuid.UUID, provider: str) -> Connector:
    """A ready client for a connected provider, or a clear error."""
    cls = CONNECTORS.get(provider)
    if cls is None:
        raise IntegrationError(f"Unknown provider: {provider}")
    row = integration_row(db, company_id, provider)
    secret = crypto.decrypt((row.config or {}).get("secret", "")) if row else None
    if row is None or row.status not in ("connected", "error") or not secret:
        raise IntegrationError(f"{cls.label} is not connected")
    config = row.config or {}
    return cls(token=secret, base_url=config.get("base_url"), username=config.get("username"))


def connected_providers(db: Session, company_id: uuid.UUID) -> list[str]:
    rows = db.scalars(select(Integration).where(
        Integration.company_id == company_id, Integration.status == "connected",
        Integration.provider.in_(list(CONNECTORS)))).all()
    return [row.provider for row in rows]


# -------------------------------------------------------------------- snapshots
def _snapshot_of_remote(issue: RemoteIssue) -> dict:
    return {"title": issue.title, "body": issue.body or "", "category": issue.category,
            "state": issue.state}


def _snapshot_of_task(db: Session, task: Task) -> dict:
    return {
        "title": task.title, "body": task.description or "",
        "category": task_status.category_of(db, task.company_id, task.status),
    }


def _find_user(db: Session, company_id: uuid.UUID, issue: RemoteIssue) -> uuid.UUID | None:
    """Best effort: trackers rarely expose an email, so match on it or on the name."""
    if issue.assignee_email:
        user = db.scalar(select(User).where(
            User.company_id == company_id, func.lower(User.email) == issue.assignee_email.lower()))
        if user:
            return user.id
    if issue.assignee_name:
        user = db.scalar(select(User).where(
            User.company_id == company_id,
            func.lower(User.full_name) == issue.assignee_name.lower()))
        if user:
            return user.id
    return None


def _status_for(db: Session, company_id: uuid.UUID, issue: RemoteIssue,
                current: str | None = None) -> str:
    """The Orbit column a remote state lands in.

    A column named like the remote status wins ("In QA" -> "In QA"); otherwise
    the first column of the matching category.
    """
    statuses = task_status.all_statuses(db, company_id)
    by_name = next((s for s in statuses if s.category == issue.category
                    and issue.state.lower() in {s.name.lower(), (s.name_fa or "").lower(),
                                                s.key.replace("_", " ")}), None)
    if by_name:
        return by_name.key
    if current and task_status.category_of(db, company_id, current) == issue.category:
        return current
    preferred = {"open": "todo", "started": "in_progress", "done": "done",
                 "cancelled": "cancelled"}[issue.category]
    if any(s.key == preferred for s in statuses):
        return preferred
    return task_status.first_key(db, company_id, issue.category, preferred)


def _apply_status(db: Session, task: Task, key: str) -> None:
    status = task_status.get(db, task.company_id, key)
    task.status = key
    now = datetime.now(UTC)
    if status and status.category == "done":
        task.completed_at = task.completed_at or now
    else:
        task.completed_at = None
    if status and status.category == "started" and task.started_at is None:
        task.started_at = now


# ------------------------------------------------------------------------- pull
def _next_task_key(db: Session, project: Project) -> str:
    project.task_counter += 1
    candidate = f"{project.key}-{project.task_counter}"
    while db.scalar(select(Task.id).where(
            Task.company_id == project.company_id, Task.key == candidate)):
        project.task_counter += 1
        candidate = f"{project.key}-{project.task_counter}"
    return candidate


def _import_issue(db: Session, link: IntegrationLink, project: Project, issue: RemoteIssue,
                  actor: User | None) -> Task:
    task = Task(
        company_id=link.company_id, project_id=project.id, key=_next_task_key(db, project),
        title=issue.title[:300] or f"{link.provider} #{issue.id}", description=issue.body,
        type=issue.type if issue.type in ("task", "bug", "feature", "story", "epic", "subtask")
        else "task",
        priority=issue.priority or "medium",
        labels=sorted({*issue.labels, link.provider})[:12],
        assignee_id=_find_user(db, link.company_id, issue),
        reporter_id=actor.id if actor else None,
        status="todo",
    )
    _apply_status(db, task, _status_for(db, link.company_id, issue))
    db.add(task)
    db.flush()
    db.add(ExternalIssue(
        company_id=link.company_id, task_id=task.id, link_id=link.id, provider=link.provider,
        remote_key=link.remote_key, remote_id=issue.id, url=issue.url,
        remote_state=issue.state, remote_updated_at=issue.updated_at,
        synced_at=datetime.now(UTC), snapshot=_snapshot_of_remote(issue),
    ))
    return task


def _pull_into(db: Session, external: ExternalIssue, task: Task, issue: RemoteIssue) -> bool:
    """Apply whatever the tracker changed since the snapshot. True if the task moved."""
    remote, before = _snapshot_of_remote(issue), external.snapshot or {}
    changed = False
    if remote["title"] != before.get("title") and issue.title:
        task.title, changed = issue.title[:300], True
    if remote["body"] != before.get("body", ""):
        task.description, changed = issue.body, True
    if remote["category"] != before.get("category") or remote["state"] != before.get("state"):
        key = _status_for(db, task.company_id, issue, task.status)
        if key != task.status:
            _apply_status(db, task, key)
            changed = True
    external.snapshot = remote
    external.remote_state = issue.state
    external.remote_updated_at = issue.updated_at
    external.url = issue.url or external.url
    external.synced_at = datetime.now(UTC)
    return changed


def sync_link(db: Session, link: IntegrationLink, actor: User | None = None,
              full: bool = False) -> dict:
    """Pull remote changes for one linked project, then push any local ones still owed."""
    stats = {"imported": 0, "updated": 0, "pushed": 0, "errors": 0}
    project = db.get(Project, link.project_id)
    if project is None or project.deleted_at is not None:
        return stats
    try:
        connector = connector_for(db, link.company_id, link.provider)
        # Overlap the window a little: clocks differ, and an issue edited during
        # the last sync must not fall between two of them.
        since = None if (full or not link.last_synced_at) else (
            link.last_synced_at - timedelta(minutes=5))
        issues = connector.list_issues(link.remote_key, since=since,
                                       limit=settings.INTEGRATION_IMPORT_LIMIT)
        known = {
            e.remote_id: e for e in db.scalars(select(ExternalIssue).where(
                ExternalIssue.company_id == link.company_id,
                ExternalIssue.provider == link.provider,
                ExternalIssue.remote_key == link.remote_key)).all()
        }
        for issue in issues:
            external = known.get(issue.id)
            if external is None:
                _import_issue(db, link, project, issue, actor)
                stats["imported"] += 1
                continue
            task = db.get(Task, external.task_id)
            if task is None or task.deleted_at is not None:
                continue
            local_before = _snapshot_of_task(db, task)
            snapshot_before = dict(external.snapshot or {})
            if _pull_into(db, external, task, issue):
                stats["updated"] += 1
            # Anything Orbit changed that the tracker did not also change.
            owed = {
                field: local_before[field] for field in SYNCED_FIELDS
                if local_before[field] != snapshot_before.get(field, local_before[field])
                and _snapshot_of_remote(issue)[field] == snapshot_before.get(field)
            }
            if owed:
                try:
                    _push_fields(db, connector, external, task, owed)
                    stats["pushed"] += 1
                except IntegrationError:
                    stats["errors"] += 1
        link.last_synced_at = datetime.now(UTC)
        link.last_error = None
        _recalculate_progress(db, project)
    except IntegrationError as exc:
        link.last_error = str(exc)[:400]
        link.updated_at = datetime.now(UTC)      # paces the retry; see run_due_syncs
        stats["errors"] += 1
        stats["error"] = str(exc)
    db.flush()
    return stats


def _recalculate_progress(db: Session, project: Project) -> None:
    total = db.scalar(select(func.count(Task.id)).where(
        Task.project_id == project.id, Task.deleted_at.is_(None),
        ~task_status.is_cancelled())) or 0
    done = db.scalar(select(func.count(Task.id)).where(
        Task.project_id == project.id, task_status.is_done(), Task.deleted_at.is_(None))) or 0
    project.progress = round(done / total * 100) if total else 0


# ------------------------------------------------------------------------- push
def _push_fields(db: Session, connector: Connector, external: ExternalIssue, task: Task,
                 fields: dict) -> None:
    status = task_status.get(db, task.company_id, task.status)
    issue = connector.update_issue(
        external.remote_key, external.remote_id,
        title=fields.get("title"),
        body=fields.get("body"),
        category=fields.get("category"),
        status_name=status.name if (status and "category" in fields) else None,
    )
    external.snapshot = _snapshot_of_remote(issue)
    external.remote_state = issue.state
    external.remote_updated_at = issue.updated_at
    external.synced_at = datetime.now(UTC)


def push_task(db: Session, task: Task) -> list[str]:
    """Send a task's current title, description and status to every tracker it is linked to.

    Called after a task is edited. Returns the errors, if any; never raises.
    """
    errors: list[str] = []
    externals = db.scalars(select(ExternalIssue).where(ExternalIssue.task_id == task.id)).all()
    if not externals:
        return errors
    local = _snapshot_of_task(db, task)
    status = task_status.get(db, task.company_id, task.status)
    for external in externals:
        before = external.snapshot or {}
        fields = {f: local[f] for f in SYNCED_FIELDS if local[f] != before.get(f)}
        # Same category, different column ("In progress" -> "In review"): Jira
        # can still follow, GitHub and GitLab have nothing to change.
        renamed = bool(status) and status.name.lower() != (before.get("state") or "").lower()
        if "category" not in fields and renamed and external.provider == "jira":
            fields["category"] = local["category"]
        if not fields:
            continue
        try:
            connector = connector_for(db, task.company_id, external.provider)
            _push_fields(db, connector, external, task, fields)
        except IntegrationError as exc:
            errors.append(str(exc))
            if external.link_id:
                link = db.get(IntegrationLink, external.link_id)
                if link:
                    link.last_error = str(exc)[:400]
            logger.warning("push of %s to %s failed: %s", task.key, external.provider, exc)
    db.flush()
    return errors


def push_comment(db: Session, task: Task, author: User, body: str) -> None:
    """Mirror an Orbit comment onto the remote issue, attributed in the text."""
    for external in db.scalars(
            select(ExternalIssue).where(ExternalIssue.task_id == task.id)).all():
        try:
            connector_for(db, task.company_id, external.provider).add_comment(
                external.remote_key, external.remote_id, f"{author.full_name} (Orbit): {body}")
        except IntegrationError as exc:
            logger.warning("comment push to %s failed: %s", external.provider, exc)


def publish_task(db: Session, task: Task, link: IntegrationLink) -> ExternalIssue:
    """Create the remote issue for a task that so far only exists in Orbit."""
    connector = connector_for(db, task.company_id, link.provider)
    issue = connector.create_issue(
        link.remote_key, title=task.title, body=task.description,
        labels=[label for label in (task.labels or []) if label != link.provider], type=task.type,
    )
    category = task_status.category_of(db, task.company_id, task.status)
    if category != issue.category:
        status = task_status.get(db, task.company_id, task.status)
        try:
            issue = connector.update_issue(link.remote_key, issue.id, category=category,
                                           status_name=status.name if status else None)
        except IntegrationError as exc:
            logger.warning("initial status push failed: %s", exc)
    external = ExternalIssue(
        company_id=task.company_id, task_id=task.id, link_id=link.id, provider=link.provider,
        remote_key=link.remote_key, remote_id=issue.id, url=issue.url,
        remote_state=issue.state, remote_updated_at=issue.updated_at,
        synced_at=datetime.now(UTC), snapshot=_snapshot_of_remote(issue),
    )
    db.add(external)
    db.flush()
    return external


# -------------------------------------------------------------- background loop
def run_due_syncs(session_factory) -> int:
    """Sync every auto-sync link whose last run is older than the interval."""
    cutoff = datetime.now(UTC) - timedelta(seconds=settings.INTEGRATION_SYNC_SECONDS)
    done = 0
    with session_factory() as db:
        link_ids = db.scalars(select(IntegrationLink.id).where(
            IntegrationLink.auto_sync.is_(True),
            or_(IntegrationLink.last_synced_at.is_(None),
                IntegrationLink.last_synced_at < cutoff),
            # A failing link is retried once per interval, not once per tick.
            or_(IntegrationLink.last_error.is_(None),
                IntegrationLink.updated_at < cutoff))).all()
    for link_id in link_ids:
        # One transaction per link: a tracker that is down must not roll back the others.
        with session_factory() as db:
            link = db.get(IntegrationLink, link_id)
            if link is None:
                continue
            try:
                sync_link(db, link)
                db.commit()
                done += 1
            except Exception:
                db.rollback()
                logger.exception("sync of link %s failed", link_id)
    return done


async def integration_loop(session_factory, interval: int = 60) -> None:
    """Background poller, the same shape as the uptime monitor's."""
    await asyncio.sleep(20)
    while True:
        try:
            synced = await asyncio.to_thread(run_due_syncs, session_factory)
            if synced:
                logger.info("synced %s integration links", synced)
        except Exception:
            logger.exception("integration loop iteration failed")
        await asyncio.sleep(interval)
