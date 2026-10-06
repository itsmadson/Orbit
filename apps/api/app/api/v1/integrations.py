"""Integrations: connecting GitHub, GitLab and Jira, and working with their issues.

Three layers of endpoint, from coarse to fine:

* connect / disconnect a provider (``integrations.manage``)
* link an Orbit project to a remote repository or Jira project, and sync it
* read and write individual remote issues — also what the AI assistant calls

Tokens are encrypted at rest and never leave the server: the API returns only a
masked tail.
"""

import uuid
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select

from app.api.helpers import get_or_404
from app.core.deps import DbSession, require
from app.core.errors import BadRequest, NotFound, OrbitError
from app.models.identity import User
from app.models.system import ExternalIssue, Integration, IntegrationLink
from app.models.work import Project, Task
from app.schemas.common import Message
from app.services import audit
from app.services.integrations import CONNECTORS, IntegrationError, crypto
from app.services.integrations import sync as sync_service

router = APIRouter(tags=["integrations"])

#: provider, name, description, category, state when nothing is configured.
CATALOGUE = [
    ("github", "GitHub", "Import issues as tasks and keep status, title and comments in sync.", "development", "available"),
    ("gitlab", "GitLab", "Import issues as tasks and keep status, title and comments in sync. Works with self-hosted GitLab.", "development", "available"),
    ("jira", "Jira", "Import issues as tasks and sync status through Jira workflow transitions. Cloud and Data Center.", "development", "available"),
    ("gapgpt", "GapGPT", "OpenAI-compatible model gateway that powers the Orbit AI assistant.", "ai", "env"),
    ("tau", "Tau", "Hugging Face's open agent harness. Runs the assistant's tool-calling loop.", "ai", "env"),
    ("slack", "Slack", "Send notifications to Slack channels.", "communication", "coming_soon"),
    ("teams", "Microsoft Teams", "Send notifications to Teams channels.", "communication", "coming_soon"),
    ("google_calendar", "Google Calendar", "Two-way sync for meetings.", "calendar", "coming_soon"),
    ("google_drive", "Google Drive", "Attach Drive files to entities.", "storage", "coming_soon"),
    ("s3", "S3 / MinIO", "Object storage for attachments.", "storage", "env"),
    ("email", "Email (SMTP)", "Deliver notifications by email.", "communication", "coming_soon"),
    ("linear", "Linear", "Import issues and sync status.", "development", "coming_soon"),
    ("ldap", "LDAP", "Directory-backed authentication.", "identity", "coming_soon"),
    ("oidc", "OIDC / SSO", "Single sign-on for the workspace.", "identity", "coming_soon"),
]


class IntegrationFailed(OrbitError):
    code = "integration_error"

    def __init__(self, exc: IntegrationError):
        # 502 only when the tracker itself is at fault; "not connected" or a
        # rejected token is something the user can fix.
        unreachable = str(exc).startswith("Could not reach") or (exc.status or 0) >= 500
        super().__init__(str(exc), 502 if unreachable else 400)


def _connector(db, user: User, provider: str):
    try:
        return sync_service.connector_for(db, user.company_id, provider)
    except IntegrationError as exc:
        raise IntegrationFailed(exc) from exc


def _call(function, *args, **kwargs):
    try:
        return function(*args, **kwargs)
    except IntegrationError as exc:
        raise IntegrationFailed(exc) from exc


def _env_status(provider: str) -> tuple[str, dict]:
    """Integrations configured through .env rather than the UI."""
    from app.core.config import settings
    from app.services import assistant

    if provider == "gapgpt":
        status = assistant.status()
        return ("connected" if status["agent"] else "available",
                {"model": status["model"], "base_url": settings.assistant_api_base})
    if provider == "tau":
        return ("connected" if assistant.tau_version() else "available",
                {"version": assistant.tau_version(), "url": "https://twotimespi.dev/"})
    if provider == "s3":
        return ("connected" if settings.STORAGE_BACKEND == "s3" else "available", {})
    return "available", {}


# ---------------------------------------------------------------- connections
@router.get("/integrations")
def list_integrations(db: DbSession, user: Annotated[User, Depends(require("integrations.read"))]):
    configured = {
        i.provider: i for i in db.scalars(
            select(Integration).where(Integration.company_id == user.company_id)).all()
    }
    out = []
    for provider, name, description, category, default in CATALOGUE:
        row = configured.get(provider)
        config = (row.config or {}) if row else {}
        cls = CONNECTORS.get(provider)
        item: dict[str, Any] = {
            "id": row.id if row else None, "provider": provider, "name": name,
            "description": description, "category": category,
            "status": row.status if row else ("coming_soon" if default == "coming_soon" else "available"),
            "connected_at": row.connected_at if row else None,
            "connectable": cls is not None,
            "managed_by": "env" if default == "env" else ("ui" if cls else None),
            "needs_base_url": bool(cls and cls.needs_base_url),
            "needs_username": bool(cls and cls.needs_username),
            "default_base_url": cls.default_base_url if cls else None,
            "account": config.get("account"),
            "base_url": config.get("base_url"),
            "username": config.get("username"),
            "token_hint": config.get("token_hint"),
            "last_error": config.get("last_error"),
            "details": {},
        }
        if default == "env":
            item["status"], item["details"] = _env_status(provider)
        if cls is not None:
            item["link_count"] = db.scalar(select(func.count(IntegrationLink.id)).where(
                IntegrationLink.company_id == user.company_id,
                IntegrationLink.provider == provider)) or 0
        out.append(item)
    return out


class ConnectIn(BaseModel):
    token: str
    base_url: str | None = None
    username: str | None = None


@router.post("/integrations/{provider}/connect")
def connect(provider: str, payload: ConnectIn, db: DbSession,
            user: Annotated[User, Depends(require("integrations.manage"))]):
    """Verify the credentials against the tracker, then store them encrypted."""
    cls = CONNECTORS.get(provider)
    if cls is None:
        raise BadRequest(f"Unknown provider: {provider}")
    token = payload.token.strip()
    base_url = (payload.base_url or "").strip().rstrip("/") or None
    username = (payload.username or "").strip() or None
    if not token:
        raise BadRequest("A token is required")
    if provider == "jira" and not base_url:
        raise BadRequest("Jira needs a base URL, an email and an API token")
    if base_url and not base_url.startswith(("http://", "https://")):
        base_url = f"https://{base_url}"
    me = _call(cls(token=token, base_url=base_url, username=username).whoami)

    row = sync_service.integration_row(db, user.company_id, provider)
    if row is None:
        row = Integration(company_id=user.company_id, provider=provider)
        db.add(row)
    row.status = "connected"
    row.connected_at = datetime.now(UTC)
    row.config = {
        "secret": crypto.encrypt(token), "token_hint": crypto.mask(token),
        "base_url": base_url, "username": username,
        "account": me.get("name") or me.get("login"), "login": me.get("login"),
    }
    db.flush()
    audit.record(db, actor=user, action="connected", entity_type="integration",
                 entity_id=row.id, summary=f"Connected {cls.label} as {me.get('login')}")
    return {"provider": provider, "status": "connected", "account": row.config["account"]}


@router.post("/integrations/{provider}/test")
def test_connection(provider: str, db: DbSession,
                    user: Annotated[User, Depends(require("integrations.read"))]):
    row = sync_service.integration_row(db, user.company_id, provider)
    try:
        me = sync_service.connector_for(db, user.company_id, provider).whoami()
    except IntegrationError as exc:
        if row is not None and row.status == "connected":
            row.status = "error"
            row.config = {**(row.config or {}), "last_error": str(exc)[:300]}
            db.commit()
        raise IntegrationFailed(exc) from exc
    if row is not None:
        row.status = "connected"
        row.config = {**(row.config or {}), "last_error": None}
    return {"ok": True, "account": me.get("name") or me.get("login")}


@router.delete("/integrations/{provider}", response_model=Message)
def disconnect(provider: str, db: DbSession,
               user: Annotated[User, Depends(require("integrations.manage"))]):
    """Forget the token. Imported tasks stay; they simply stop syncing."""
    row = sync_service.integration_row(db, user.company_id, provider)
    if row is None:
        raise NotFound("Integration")
    for link in db.scalars(select(IntegrationLink).where(
            IntegrationLink.company_id == user.company_id,
            IntegrationLink.provider == provider)).all():
        db.delete(link)
    for external in db.scalars(select(ExternalIssue).where(
            ExternalIssue.company_id == user.company_id,
            ExternalIssue.provider == provider)).all():
        db.delete(external)
    db.delete(row)
    audit.record(db, actor=user, action="disconnected", entity_type="integration",
                 summary=f"Disconnected {provider}")
    return Message(message="Disconnected")


# -------------------------------------------------------------- remote browsing
@router.get("/integrations/{provider}/projects")
def remote_projects(provider: str, db: DbSession,
                    user: Annotated[User, Depends(require("integrations.read"))],
                    q: str | None = None):
    """Repositories or Jira projects the connected account can see."""
    return [p.as_dict() for p in _call(_connector(db, user, provider).list_projects, q)]


@router.get("/integrations/{provider}/issues")
def remote_issues(provider: str, remote_key: str, db: DbSession,
                  user: Annotated[User, Depends(require("integrations.read"))],
                  state: str = "open", limit: int = 50):
    issues = _call(_connector(db, user, provider).list_issues, remote_key,
                   state=state, limit=min(max(limit, 1), 200))
    return [i.as_dict() for i in issues]


@router.get("/integrations/{provider}/issues/{issue_id}")
def remote_issue(provider: str, issue_id: str, remote_key: str, db: DbSession,
                 user: Annotated[User, Depends(require("integrations.read"))]):
    connector = _connector(db, user, provider)
    issue = _call(connector.get_issue, remote_key, issue_id)
    comments = _call(connector.list_comments, remote_key, issue_id)
    return {**issue.as_dict(), "comments": [c.as_dict() for c in comments]}


class RemoteIssueIn(BaseModel):
    remote_key: str
    title: str
    body: str | None = None
    labels: list[str] = []
    type: str | None = None


@router.post("/integrations/{provider}/issues", status_code=201)
def create_remote_issue(provider: str, payload: RemoteIssueIn, db: DbSession,
                        user: Annotated[User, Depends(require("integrations.write"))]):
    """Create an issue on the tracker without creating an Orbit task."""
    issue = _call(_connector(db, user, provider).create_issue, payload.remote_key,
                  title=payload.title, body=payload.body, labels=payload.labels, type=payload.type)
    audit.record(db, actor=user, action="created", entity_type="integration",
                 summary=f"Created {provider} issue {payload.remote_key}#{issue.id}")
    return issue.as_dict()


class RemoteIssueUpdate(BaseModel):
    remote_key: str
    title: str | None = None
    body: str | None = None
    #: open | started | done | cancelled
    category: str | None = None
    status_name: str | None = None
    labels: list[str] | None = None


@router.patch("/integrations/{provider}/issues/{issue_id}")
def update_remote_issue(provider: str, issue_id: str, payload: RemoteIssueUpdate, db: DbSession,
                        user: Annotated[User, Depends(require("integrations.write"))]):
    if payload.category and payload.category not in ("open", "started", "done", "cancelled"):
        raise BadRequest(f"Unknown category: {payload.category}")
    issue = _call(_connector(db, user, provider).update_issue, payload.remote_key, issue_id,
                  title=payload.title, body=payload.body, category=payload.category,
                  status_name=payload.status_name, labels=payload.labels)
    audit.record(db, actor=user, action="updated", entity_type="integration",
                 summary=f"Updated {provider} issue {payload.remote_key}#{issue_id}")
    return issue.as_dict()


class RemoteCommentIn(BaseModel):
    remote_key: str
    body: str


@router.post("/integrations/{provider}/issues/{issue_id}/comments", status_code=201)
def comment_remote_issue(provider: str, issue_id: str, payload: RemoteCommentIn, db: DbSession,
                         user: Annotated[User, Depends(require("integrations.write"))]):
    comment = _call(_connector(db, user, provider).add_comment, payload.remote_key, issue_id,
                    payload.body)
    return comment.as_dict()


class RawRequestIn(BaseModel):
    method: str = "GET"
    path: str
    params: dict | None = None
    body: Any = None


@router.post("/integrations/{provider}/request")
def raw_request(provider: str, payload: RawRequestIn, db: DbSession,
                user: Annotated[User, Depends(require("integrations.manage"))]):
    """Escape hatch: any call on the tracker's own REST API, as the connected account.

    For what the typed endpoints do not cover — pull requests, pipelines,
    sprints, releases. ``path`` is relative to the provider's API root and the
    call cannot leave that host. Admin only, and audited.
    """
    method = payload.method.upper()
    if method not in ("GET", "POST", "PUT", "PATCH", "DELETE"):
        raise BadRequest(f"Unsupported method: {method}")
    result = _call(_connector(db, user, provider).request, method, payload.path,
                   params=payload.params, json=payload.body)
    if method != "GET":
        audit.record(db, actor=user, action="updated", entity_type="integration",
                     summary=f"{provider} API {method} {payload.path[:200]}")
    return {"result": result}


# ------------------------------------------------------------------------ links
def _link_out(db, link: IntegrationLink) -> dict:
    project = db.get(Project, link.project_id)
    return {
        "id": link.id, "provider": link.provider, "project_id": link.project_id,
        "project": {"id": project.id, "key": project.key, "name": project.name} if project else None,
        "remote_key": link.remote_key, "remote_name": link.remote_name,
        "remote_url": link.remote_url, "auto_sync": link.auto_sync,
        "last_synced_at": link.last_synced_at, "last_error": link.last_error,
        "issue_count": db.scalar(select(func.count(ExternalIssue.id)).where(
            ExternalIssue.link_id == link.id)) or 0,
    }


@router.get("/integration-links")
def list_links(db: DbSession, user: Annotated[User, Depends(require("integrations.read"))],
               project_id: uuid.UUID | None = None, provider: str | None = None):
    stmt = select(IntegrationLink).where(IntegrationLink.company_id == user.company_id)
    if project_id:
        stmt = stmt.where(IntegrationLink.project_id == project_id)
    if provider:
        stmt = stmt.where(IntegrationLink.provider == provider)
    return [_link_out(db, link) for link in db.scalars(stmt.order_by(IntegrationLink.created_at)).all()]


class LinkIn(BaseModel):
    project_id: uuid.UUID
    provider: str
    remote_key: str
    auto_sync: bool = True
    #: Pull the existing issues in straight away.
    import_now: bool = True


@router.post("/integration-links", status_code=201)
def create_link(payload: LinkIn, db: DbSession,
                user: Annotated[User, Depends(require("integrations.manage"))]):
    """Bind an Orbit project to a repository or Jira project."""
    project = get_or_404(db, Project, payload.project_id, user.company_id, "Project")
    connector = _connector(db, user, payload.provider)
    remote_key = payload.remote_key.strip().strip("/")
    existing = db.scalar(select(IntegrationLink).where(
        IntegrationLink.project_id == project.id, IntegrationLink.provider == payload.provider,
        IntegrationLink.remote_key == remote_key))
    if existing:
        return {**_link_out(db, existing), "sync": None}
    # Fail now, with the tracker's own message, rather than on the first sync.
    _call(connector.list_issues, remote_key, state="open", limit=1)
    base = (connector.base_url or "").replace("api.github.com", "github.com").replace("/api/v3", "")
    link = IntegrationLink(
        company_id=user.company_id, project_id=project.id, provider=payload.provider,
        remote_key=remote_key, remote_name=remote_key, auto_sync=payload.auto_sync,
        remote_url=f"{base}/browse/{remote_key}" if payload.provider == "jira"
        else f"{base}/{remote_key}",
    )
    db.add(link)
    db.flush()
    stats = sync_service.sync_link(db, link, actor=user, full=True) if payload.import_now else None
    audit.record(db, actor=user, action="created", entity_type="integration",
                 summary=f"Linked {project.name} to {payload.provider} {remote_key}",
                 changes=stats or {})
    return {**_link_out(db, link), "sync": stats}


@router.post("/integration-links/{link_id}/sync")
def sync_link(link_id: uuid.UUID, db: DbSession,
              user: Annotated[User, Depends(require("integrations.write"))], full: bool = False):
    link = get_or_404(db, IntegrationLink, link_id, user.company_id, "Link")
    stats = sync_service.sync_link(db, link, actor=user, full=full)
    return {**_link_out(db, link), "sync": stats}


class LinkUpdate(BaseModel):
    auto_sync: bool | None = None


@router.patch("/integration-links/{link_id}")
def update_link(link_id: uuid.UUID, payload: LinkUpdate, db: DbSession,
                user: Annotated[User, Depends(require("integrations.manage"))]):
    link = get_or_404(db, IntegrationLink, link_id, user.company_id, "Link")
    if payload.auto_sync is not None:
        link.auto_sync = payload.auto_sync
    return _link_out(db, link)


@router.delete("/integration-links/{link_id}", response_model=Message)
def delete_link(link_id: uuid.UUID, db: DbSession,
                user: Annotated[User, Depends(require("integrations.manage"))]):
    """Stop syncing. Tasks already imported are kept."""
    link = get_or_404(db, IntegrationLink, link_id, user.company_id, "Link")
    for external in db.scalars(select(ExternalIssue).where(ExternalIssue.link_id == link.id)).all():
        db.delete(external)
    db.delete(link)
    return Message(message="Link removed")


# ------------------------------------------------------------------- task twins
class PublishIn(BaseModel):
    link_id: uuid.UUID


@router.post("/tasks/{task_id}/external", status_code=201)
def publish_task(task_id: uuid.UUID, payload: PublishIn, db: DbSession,
                 user: Annotated[User, Depends(require("integrations.write"))]):
    """Create the remote issue for an Orbit task, and keep the two in sync from then on."""
    task = get_or_404(db, Task, task_id, user.company_id, "Task")
    link = get_or_404(db, IntegrationLink, payload.link_id, user.company_id, "Link")
    label = CONNECTORS[link.provider].label
    if db.scalar(select(ExternalIssue).where(
            ExternalIssue.task_id == task.id, ExternalIssue.provider == link.provider)):
        raise BadRequest(f"This task is already linked to {label}")
    external = _call(sync_service.publish_task, db, task, link)
    audit.record(db, actor=user, action="updated", entity_type="task", entity_id=task.id,
                 summary=f"Published {task.key} to {label} as {external.remote_id}")
    return {"id": external.id, "provider": external.provider, "remote_id": external.remote_id,
            "url": external.url, "remote_state": external.remote_state}


@router.delete("/tasks/{task_id}/external/{external_id}", response_model=Message)
def unlink_task(task_id: uuid.UUID, external_id: uuid.UUID, db: DbSession,
                user: Annotated[User, Depends(require("integrations.write"))]):
    task = get_or_404(db, Task, task_id, user.company_id, "Task")
    external = db.get(ExternalIssue, external_id)
    if external is None or external.task_id != task.id:
        raise NotFound("Link")
    db.delete(external)
    return Message(message="Link removed")
