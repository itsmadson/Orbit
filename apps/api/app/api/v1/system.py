import re
import uuid
from urllib.parse import quote
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, File, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, select

from app.api.helpers import get_or_404, user_ref
from app.core.config import settings
from app.core.deps import CurrentUser, DbSession, can, require
from app.core.errors import BadRequest, Forbidden, NotFound
from app.core.pagination import Paging, as_page
from app.core.rbac import has_permission
from app.models.identity import User
from app.models.system import Attachment, AuditLog, Comment, Integration, Notification
from app.schemas.common import (
    ActivityOut, AttachmentOut, CommentIn, CommentOut, Message, RelationIn, RelationOut,
)
from app.schemas.system import InboxCounts, IntegrationOut, NotificationOut, SearchResults
from app.services import audit, graph, notifications as notification_service, search as search_service
from app.services.registry import REGISTRY, spec
from app.services.storage import build_key, get_storage

router = APIRouter(tags=["system"])

INBOX_FILTERS = ["all", "unread", "mentions", "tasks", "approvals", "finance", "hr",
                 "projects", "system"]


# ---------------------------------------------------------------- inbox
@router.get("/notifications")
def list_notifications(db: DbSession, user: CurrentUser, paging: Paging,
                       filter: str = "all", q: str | None = None):
    stmt = select(Notification).where(Notification.user_id == user.id,
                                      Notification.archived_at.is_(None))
    if filter == "unread":
        stmt = stmt.where(Notification.read_at.is_(None))
    elif filter in ("mentions", "tasks", "approvals", "finance", "hr", "projects", "system"):
        stmt = stmt.where(Notification.category == filter)
    if q:
        stmt = stmt.where(or_(Notification.title.ilike(f"%{q}%"),
                              Notification.body.ilike(f"%{q}%")))
    stmt = stmt.order_by(Notification.created_at.desc())
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.scalars(stmt.limit(paging.page_size).offset(paging.offset)).all()
    items = [
        {
            "id": n.id, "type": n.type, "category": n.category, "title": n.title,
            "body": n.body, "entity_type": n.entity_type, "entity_id": n.entity_id,
            "url": n.url, "actor": user_ref(db.get(User, n.actor_id)) if n.actor_id else None,
            "priority": n.priority, "read_at": n.read_at, "created_at": n.created_at,
        }
        for n in rows
    ]
    return as_page(items, total, paging)


@router.get("/notifications/counts", response_model=InboxCounts)
def inbox_counts(db: DbSession, user: CurrentUser):
    base = [Notification.user_id == user.id, Notification.archived_at.is_(None)]
    by_category = dict(
        db.execute(
            select(Notification.category, func.count(Notification.id))
            .where(*base).group_by(Notification.category)
        ).all()
    )
    return InboxCounts(
        all=db.scalar(select(func.count(Notification.id)).where(*base)) or 0,
        unread=db.scalar(select(func.count(Notification.id)).where(
            *base, Notification.read_at.is_(None))) or 0,
        mentions=by_category.get("mentions", 0),
        tasks=by_category.get("tasks", 0),
        approvals=by_category.get("approvals", 0),
        finance=by_category.get("finance", 0),
        hr=by_category.get("hr", 0),
        projects=by_category.get("projects", 0),
        system=by_category.get("system", 0),
    )


@router.post("/notifications/{notification_id}/read", response_model=NotificationOut)
def mark_read(notification_id: uuid.UUID, db: DbSession, user: CurrentUser):
    notification = db.get(Notification, notification_id)
    if notification is None or notification.user_id != user.id:
        raise NotFound("Notification")
    notification_service.mark_read(db, notification)
    return {
        "id": notification.id, "type": notification.type, "category": notification.category,
        "title": notification.title, "body": notification.body,
        "entity_type": notification.entity_type, "entity_id": notification.entity_id,
        "url": notification.url,
        "actor": user_ref(db.get(User, notification.actor_id)) if notification.actor_id else None,
        "priority": notification.priority, "read_at": notification.read_at,
        "created_at": notification.created_at,
    }


@router.post("/notifications/read-all", response_model=Message)
def mark_all_read(db: DbSession, user: CurrentUser):
    rows = db.scalars(select(Notification).where(
        Notification.user_id == user.id, Notification.read_at.is_(None))).all()
    for notification in rows:
        notification.read_at = datetime.now(UTC)
    return Message(message=f"{len(rows)} notifications marked read")


@router.post("/notifications/{notification_id}/archive", response_model=Message)
def archive(notification_id: uuid.UUID, db: DbSession, user: CurrentUser):
    notification = db.get(Notification, notification_id)
    if notification is None or notification.user_id != user.id:
        raise NotFound("Notification")
    notification.archived_at = datetime.now(UTC)
    return Message(message="Archived")


# ---------------------------------------------------------------- search
@router.get("/search", response_model=SearchResults)
def search(db: DbSession, user: CurrentUser, q: str,
           types: Annotated[list[str] | None, Query()] = None,
           limit_per_type: int = 5):
    allowed = {
        s.permission for s in REGISTRY.values() if has_permission(user.role, s.permission)
    }
    hits = search_service.search(db, user=user, query=q, types=types,
                                 limit_per_type=limit_per_type, allowed=allowed)
    grouped: dict[str, list] = {}
    for hit in hits:
        grouped.setdefault(hit["type"], []).append(hit)
    return {"query": q, "hits": hits, "grouped": grouped}


# ---------------------------------------------------------------- comments
def _check_entity(db, user: User, entity_type: str, entity_id: uuid.UUID, write: bool = False):
    """The single gate for comments, attachments and graph links.

    Holding the permission is not the same as being allowed to touch *this*
    record: the object must belong to the caller's company, and a customer
    login is confined to its own CRM company on top of that. Every caller in
    this module routes through here, so the check lives in one place.
    """
    entity_spec = spec(entity_type)
    if entity_spec is None:
        raise BadRequest(f"Unknown entity type: {entity_type}")
    permission = entity_spec.permission.replace(".read", ".write" if write else ".read")
    if not can(db, user, permission):
        raise Forbidden(f"Missing permission: {permission}")

    obj = db.get(entity_spec.model, entity_id)
    if obj is None or getattr(obj, "deleted_at", None) is not None:
        raise NotFound(entity_spec.label)
    # Never serve a record belonging to another company.
    if getattr(obj, "company_id", None) != user.company_id:
        raise NotFound(entity_spec.label)

    if user.role == "customer":
        # An external login reaches only its own tickets and public monitors —
        # and learns nothing about anything else, so this is a 404 not a 403.
        if entity_type not in ("ticket", "monitor"):
            raise NotFound(entity_spec.label)
        if getattr(obj, "crm_company_id", None) != user.crm_company_id:
            raise NotFound(entity_spec.label)
        if entity_type == "monitor" and not getattr(obj, "is_public", False):
            raise NotFound(entity_spec.label)
    return obj


@router.get("/comments", response_model=list[CommentOut])
def list_comments(entity_type: str, entity_id: uuid.UUID, db: DbSession, user: CurrentUser):
    _check_entity(db, user, entity_type, entity_id)
    rows = db.scalars(
        select(Comment).where(
            Comment.entity_type == entity_type, Comment.entity_id == entity_id,
            Comment.deleted_at.is_(None)
        ).order_by(Comment.created_at)
    ).all()
    return [
        {
            "id": c.id, "body": c.body, "entity_type": c.entity_type, "entity_id": c.entity_id,
            "author": user_ref(db.get(User, c.author_id)) if c.author_id else None,
            "mentions": c.mentions or [], "parent_id": c.parent_id, "created_at": c.created_at,
        }
        for c in rows
    ]


@router.post("/comments", response_model=CommentOut, status_code=201)
def create_comment(entity_type: str, entity_id: uuid.UUID, payload: CommentIn,
                   db: DbSession, user: CurrentUser):
    obj = _check_entity(db, user, entity_type, entity_id)
    entity_spec = spec(entity_type)
    comment = Comment(
        company_id=user.company_id, entity_type=entity_type, entity_id=entity_id,
        author_id=user.id, body=payload.body,
        mentions=[str(m) for m in payload.mentions], parent_id=payload.parent_id,
    )
    db.add(comment)
    db.flush()
    title = entity_spec.title_of(obj)
    for mention in payload.mentions:
        notification_service.notify(
            db, user_id=mention, company_id=user.company_id, type="mention",
            title=f"{user.full_name} mentioned you on {title}",
            body=payload.body[:200], entity_type=entity_type, entity_id=entity_id,
            url=entity_spec.url_of(obj), actor_id=user.id,
        )
    for owner_field in ("assignee_id", "author_id", "owner_id", "lead_id", "organizer_id"):
        owner_id = getattr(obj, owner_field, None)
        if owner_id and owner_id != user.id and owner_id not in payload.mentions:
            notification_service.notify(
                db, user_id=owner_id, company_id=user.company_id, type="comment",
                title=f"New comment on {title}", body=payload.body[:200],
                entity_type=entity_type, entity_id=entity_id,
                url=entity_spec.url_of(obj), actor_id=user.id,
            )
            break
    return {
        "id": comment.id, "body": comment.body, "entity_type": entity_type,
        "entity_id": entity_id, "author": user_ref(user), "mentions": comment.mentions,
        "parent_id": comment.parent_id, "created_at": comment.created_at,
    }


@router.delete("/comments/{comment_id}", response_model=Message)
def delete_comment(comment_id: uuid.UUID, db: DbSession, user: CurrentUser):
    comment = db.get(Comment, comment_id)
    if comment is None or comment.company_id != user.company_id:
        raise NotFound("Comment")
    if comment.author_id != user.id and not can(db, user, "settings.write"):
        raise Forbidden("You can only delete your own comments")
    comment.deleted_at = datetime.now(UTC)
    return Message(message="Comment deleted")


# ---------------------------------------------------------------- attachments
@router.get("/attachments", response_model=list[AttachmentOut])
def list_attachments(entity_type: str, entity_id: uuid.UUID, db: DbSession, user: CurrentUser):
    _check_entity(db, user, entity_type, entity_id)
    rows = db.scalars(
        select(Attachment).where(
            Attachment.entity_type == entity_type, Attachment.entity_id == entity_id,
            Attachment.deleted_at.is_(None)
        ).order_by(Attachment.created_at.desc())
    ).all()
    return [
        {
            "id": a.id, "filename": a.filename, "content_type": a.content_type, "size": a.size,
            "entity_type": a.entity_type, "entity_id": a.entity_id, "created_at": a.created_at,
            "uploaded_by": user_ref(db.get(User, a.uploaded_by_id)) if a.uploaded_by_id else None,
        }
        for a in rows
    ]


@router.post("/attachments", response_model=AttachmentOut, status_code=201)
def upload_attachment(entity_type: str, entity_id: uuid.UUID, db: DbSession, user: CurrentUser,
                      file: UploadFile = File(...)):
    _check_entity(db, user, entity_type, entity_id, write=True)
    if not file.filename:
        raise BadRequest("A filename is required")
    key = build_key(user.company_id, entity_type, file.filename)
    size = get_storage().save(key, file.file)
    if size > settings.MAX_UPLOAD_BYTES:
        # Written before it could be measured, so remove it again rather than
        # leaving an orphan on disk.
        get_storage().delete(key)
        raise BadRequest(
            f"File is larger than the {settings.MAX_UPLOAD_BYTES // (1024 * 1024)}MB limit"
        )
    attachment = Attachment(
        company_id=user.company_id, entity_type=entity_type, entity_id=entity_id,
        filename=file.filename, content_type=file.content_type or "application/octet-stream",
        size=size, storage_key=key, uploaded_by_id=user.id,
    )
    db.add(attachment)
    db.flush()
    audit.record(db, actor=user, action="created", entity_type=entity_type, entity_id=entity_id,
                 summary=f"Uploaded {file.filename}")
    return {
        "id": attachment.id, "filename": attachment.filename,
        "content_type": attachment.content_type, "size": attachment.size,
        "entity_type": entity_type, "entity_id": entity_id,
        "created_at": attachment.created_at, "uploaded_by": user_ref(user),
    }


@router.get("/attachments/{attachment_id}/download")
def download_attachment(attachment_id: uuid.UUID, db: DbSession, user: CurrentUser):
    attachment = db.get(Attachment, attachment_id)
    if attachment is None or attachment.company_id != user.company_id:
        raise NotFound("Attachment")
    _check_entity(db, user, attachment.entity_type, attachment.entity_id)
    stream = get_storage().open(attachment.storage_key)
    ascii_name = re.sub(r'[^A-Za-z0-9._-]+', "-", attachment.filename).strip("-") or "download"
    return StreamingResponse(
        stream,
        media_type="application/octet-stream",
        headers={
            "content-disposition":
                f'attachment; filename="{ascii_name}"; '
                f"filename*=UTF-8''{quote(attachment.filename)}",
            # Belt and braces: never let a browser sniff its way to executing it.
            "x-content-type-options": "nosniff",
            "content-security-policy": "default-src 'none'; sandbox",
        },
    )


@router.delete("/attachments/{attachment_id}", response_model=Message)
def delete_attachment(attachment_id: uuid.UUID, db: DbSession, user: CurrentUser):
    attachment = db.get(Attachment, attachment_id)
    if attachment is None or attachment.company_id != user.company_id:
        raise NotFound("Attachment")
    if attachment.uploaded_by_id != user.id and not can(db, user, "settings.write"):
        raise Forbidden()
    attachment.deleted_at = datetime.now(UTC)
    return Message(message="Attachment removed")


# ---------------------------------------------------------------- graph
@router.get("/graph/entity-types")
def entity_types(user: CurrentUser):
    return [
        {"key": key, "label": entity.label, "icon": entity.icon}
        for key, entity in REGISTRY.items()
    ]


@router.get("/graph/relations", response_model=list[RelationOut])
def entity_relations(entity_type: str, entity_id: uuid.UUID, db: DbSession, user: CurrentUser):
    _check_entity(db, user, entity_type, entity_id)
    return graph.neighbours(db, entity_type, entity_id)


@router.get("/graph/explore")
def explore_graph(entity_type: str, entity_id: uuid.UUID, db: DbSession, user: CurrentUser,
                  depth: int = 2):
    _check_entity(db, user, entity_type, entity_id)
    return graph.subgraph(db, entity_type, entity_id, depth=min(depth, 3))


@router.post("/graph/relations", status_code=201)
def create_relation(payload: RelationIn, db: DbSession, user: CurrentUser):
    _check_entity(db, user, payload.from_type, payload.from_id, write=True)
    _check_entity(db, user, payload.to_type, payload.to_id)
    relation = graph.link(
        db, company_id=user.company_id, from_type=payload.from_type, from_id=payload.from_id,
        rel_type=payload.rel_type, to_type=payload.to_type, to_id=payload.to_id,
        actor=user, meta=payload.meta,
    )
    return {"id": str(relation.id)}


@router.delete("/graph/relations/{relation_id}", response_model=Message)
def delete_relation(relation_id: uuid.UUID, db: DbSession, user: CurrentUser):
    graph.unlink(db, relation_id)
    return Message(message="Relation removed")


@router.get("/graph/relation-types")
def relation_types(user: CurrentUser):
    return graph.RELATION_TYPES


# ---------------------------------------------------------------- audit
@router.get("/audit")
def audit_log(db: DbSession, user: Annotated[User, Depends(require("audit.read"))],
              paging: Paging, entity_type: str | None = None,
              entity_id: uuid.UUID | None = None, action: str | None = None,
              actor_id: uuid.UUID | None = None, q: str | None = None):
    stmt = select(AuditLog).where(AuditLog.company_id == user.company_id)
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if entity_id:
        stmt = stmt.where(AuditLog.entity_id == entity_id)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if actor_id:
        stmt = stmt.where(AuditLog.actor_id == actor_id)
    if q:
        stmt = stmt.where(AuditLog.summary.ilike(f"%{q}%"))
    stmt = stmt.order_by(AuditLog.created_at.desc())
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.scalars(stmt.limit(paging.page_size).offset(paging.offset)).all()
    items = [
        {
            "id": log.id, "action": log.action, "entity_type": log.entity_type,
            "entity_id": log.entity_id, "summary": log.summary, "changes": log.changes,
            "actor": user_ref(db.get(User, log.actor_id)) if log.actor_id else None,
            "ip_address": log.ip_address, "created_at": log.created_at,
        }
        for log in rows
    ]
    return as_page(items, total, paging)


# ---------------------------------------------------------------- integrations
CATALOGUE = [
    ("github", "GitHub", "Link commits and pull requests to tasks.", "development"),
    ("gitlab", "GitLab", "Link merge requests and pipelines to tasks.", "development"),
    ("slack", "Slack", "Send notifications to Slack channels.", "communication"),
    ("teams", "Microsoft Teams", "Send notifications to Teams channels.", "communication"),
    ("google_calendar", "Google Calendar", "Two-way sync for meetings.", "calendar"),
    ("google_drive", "Google Drive", "Attach Drive files to entities.", "storage"),
    ("s3", "S3 / MinIO", "Object storage for attachments.", "storage"),
    ("email", "Email (SMTP)", "Deliver notifications by email.", "communication"),
    ("jira", "Jira", "Import issues and sync status.", "development"),
    ("linear", "Linear", "Import issues and sync status.", "development"),
    ("ldap", "LDAP", "Directory-backed authentication.", "identity"),
    ("oidc", "OIDC / SSO", "Single sign-on for the workspace.", "identity"),
]


@router.get("/integrations", response_model=list[IntegrationOut])
def list_integrations(db: DbSession, user: Annotated[User, Depends(require("integrations.read"))]):
    configured = {
        i.provider: i for i in db.scalars(
            select(Integration).where(Integration.company_id == user.company_id)
        ).all()
    }
    out = []
    for provider, name, description, category in CATALOGUE:
        row = configured.get(provider)
        out.append(
            {
                "id": row.id if row else None, "provider": provider,
                "status": row.status if row else "available",
                "connected_at": row.connected_at if row else None,
                "name": name, "description": description, "category": category,
            }
        )
    return out
