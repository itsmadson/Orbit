import re
import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select

from app.api.helpers import get_or_404, refs, user_ref
from app.core.deps import DbSession, require
from app.core.pagination import Paging, as_page
from app.models.identity import User
from app.models.knowledge import Decision, Document, DocumentVersion, WikiSpace
from app.models.work import Project
from app.schemas.common import Message
from app.schemas.knowledge import (
    DecisionIn, DecisionOut, DecisionUpdate, DocumentDetail, DocumentIn, DocumentOut,
    DocumentUpdate, DocumentVersionOut, SpaceIn, SpaceOut,
)
from app.services import audit, graph, notifications

router = APIRouter(tags=["knowledge"])

TAG_RE = re.compile(r"<[^>]+>")


def excerpt_of(content: str | None) -> str | None:
    if not content:
        return None
    text = TAG_RE.sub(" ", content)
    text = " ".join(text.split())
    return text[:300] or None


def space_out(db, space: WikiSpace) -> dict:
    return {
        "id": space.id, "name": space.name, "slug": space.slug,
        "description": space.description, "icon": space.icon, "color": space.color,
        "visibility": space.visibility,
        "document_count": db.scalar(select(func.count(Document.id)).where(
            Document.space_id == space.id, Document.deleted_at.is_(None))) or 0,
    }


def document_out(db, doc: Document, with_content: bool = False) -> dict:
    data = {
        "id": doc.id, "title": doc.title, "space_id": doc.space_id, "parent_id": doc.parent_id,
        "doc_type": doc.doc_type, "excerpt": doc.excerpt, "status": doc.status,
        "tags": doc.tags or [], "version": doc.version,
        "author": user_ref(db.get(User, doc.author_id)) if doc.author_id else None,
        "project_id": doc.project_id,
        "child_count": db.scalar(select(func.count(Document.id)).where(
            Document.parent_id == doc.id, Document.deleted_at.is_(None))) or 0,
        "created_at": doc.created_at, "updated_at": doc.updated_at,
    }
    if with_content:
        space = db.get(WikiSpace, doc.space_id) if doc.space_id else None
        breadcrumb, cursor = [], doc
        while cursor.parent_id:
            cursor = db.get(Document, cursor.parent_id)
            if cursor is None:
                break
            breadcrumb.insert(0, {"id": str(cursor.id), "title": cursor.title})
        data |= {
            "content": doc.content,
            "space_name": space.name if space else None,
            "breadcrumb": breadcrumb,
        }
    return data


# ---------------------------------------------------------------- spaces
@router.get("/spaces", response_model=list[SpaceOut])
def list_spaces(db: DbSession, user: Annotated[User, Depends(require("documents.read"))]):
    rows = db.scalars(
        select(WikiSpace).where(WikiSpace.company_id == user.company_id,
                                WikiSpace.deleted_at.is_(None)).order_by(WikiSpace.name)
    ).all()
    return [space_out(db, s) for s in rows]


@router.post("/spaces", response_model=SpaceOut, status_code=201)
def create_space(payload: SpaceIn, db: DbSession,
                 user: Annotated[User, Depends(require("documents.write"))]):
    slug = payload.slug or re.sub(r"[^a-z0-9]+", "-", payload.name.lower()).strip("-")
    space = WikiSpace(company_id=user.company_id, **(payload.model_dump() | {"slug": slug}))
    db.add(space)
    db.flush()
    return space_out(db, space)


# ---------------------------------------------------------------- documents
@router.get("/documents")
def list_documents(db: DbSession, user: Annotated[User, Depends(require("documents.read"))],
                   paging: Paging, q: str | None = None,
                   space_id: uuid.UUID | None = None,
                   project_id: uuid.UUID | None = None,
                   doc_type: Annotated[list[str] | None, Query()] = None,
                   parent_id: uuid.UUID | None = None,
                   root_only: bool = False,
                   tag: str | None = None):
    stmt = select(Document).where(Document.company_id == user.company_id,
                                  Document.deleted_at.is_(None))
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Document.title.ilike(like), Document.content.ilike(like)))
    if space_id:
        stmt = stmt.where(Document.space_id == space_id)
    if project_id:
        stmt = stmt.where(Document.project_id == project_id)
    if doc_type:
        stmt = stmt.where(Document.doc_type.in_(doc_type))
    if parent_id:
        stmt = stmt.where(Document.parent_id == parent_id)
    elif root_only:
        stmt = stmt.where(Document.parent_id.is_(None))
    if tag:
        stmt = stmt.where(Document.tags.contains([tag]))
    stmt = stmt.order_by(Document.updated_at.desc())
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.scalars(stmt.limit(paging.page_size).offset(paging.offset)).all()
    return as_page([document_out(db, d) for d in rows], total, paging)


@router.get("/documents/tree")
def document_tree(db: DbSession, user: Annotated[User, Depends(require("documents.read"))],
                  space_id: uuid.UUID | None = None):
    stmt = select(Document).where(Document.company_id == user.company_id,
                                  Document.deleted_at.is_(None))
    if space_id:
        stmt = stmt.where(Document.space_id == space_id)
    rows = db.scalars(stmt.order_by(Document.order_index, Document.title)).all()
    by_parent: dict[str | None, list] = {}
    for doc in rows:
        by_parent.setdefault(str(doc.parent_id) if doc.parent_id else None, []).append(doc)

    def build(parent_key: str | None) -> list[dict]:
        return [
            {
                "id": str(doc.id), "title": doc.title, "doc_type": doc.doc_type,
                "space_id": str(doc.space_id) if doc.space_id else None,
                "children": build(str(doc.id)),
            }
            for doc in by_parent.get(parent_key, [])
        ]

    return build(None)


@router.get("/documents/{document_id}", response_model=DocumentDetail)
def get_document(document_id: uuid.UUID, db: DbSession,
                 user: Annotated[User, Depends(require("documents.read"))]):
    doc = get_or_404(db, Document, document_id, user.company_id, "Document")
    return document_out(db, doc, with_content=True)


@router.get("/documents/{document_id}/versions", response_model=list[DocumentVersionOut])
def document_versions(document_id: uuid.UUID, db: DbSession,
                      user: Annotated[User, Depends(require("documents.read"))]):
    rows = db.scalars(
        select(DocumentVersion).where(DocumentVersion.document_id == document_id)
        .order_by(DocumentVersion.version.desc())
    ).all()
    return [
        {
            "id": v.id, "version": v.version, "title": v.title,
            "author": user_ref(db.get(User, v.author_id)) if v.author_id else None,
            "change_note": v.change_note, "created_at": v.created_at,
        }
        for v in rows
    ]


@router.post("/documents", response_model=DocumentDetail, status_code=201)
def create_document(payload: DocumentIn, db: DbSession,
                    user: Annotated[User, Depends(require("documents.write"))]):
    doc = Document(company_id=user.company_id, author_id=user.id,
                   excerpt=excerpt_of(payload.content), **payload.model_dump())
    db.add(doc)
    db.flush()
    db.add(DocumentVersion(document_id=doc.id, version=1, title=doc.title,
                           content=doc.content, author_id=user.id, change_note="Created"))
    if doc.project_id:
        graph.link(db, company_id=user.company_id, from_type="project", from_id=doc.project_id,
                   rel_type="documents", to_type="document", to_id=doc.id, actor=user)
    audit.record(db, actor=user, action="created", entity_type="document", entity_id=doc.id,
                 summary=f"Created document {doc.title}")
    return document_out(db, doc, with_content=True)


@router.patch("/documents/{document_id}", response_model=DocumentDetail)
def update_document(document_id: uuid.UUID, payload: DocumentUpdate, db: DbSession,
                    user: Annotated[User, Depends(require("documents.write"))]):
    doc = get_or_404(db, Document, document_id, user.company_id, "Document")
    changes = payload.model_dump(exclude_unset=True, exclude={"change_note"})
    before = {k: getattr(doc, k) for k in changes}
    content_changed = "content" in changes and changes["content"] != doc.content
    for field, value in changes.items():
        setattr(doc, field, value)
    if content_changed:
        doc.version += 1
        doc.excerpt = excerpt_of(doc.content)
        db.add(DocumentVersion(document_id=doc.id, version=doc.version, title=doc.title,
                               content=doc.content, author_id=user.id,
                               change_note=payload.change_note or "Updated"))
    diff = audit.diff(
        {k: v for k, v in before.items() if k != "content"},
        {k: v for k, v in changes.items() if k != "content"},
    )
    if content_changed:
        diff["content"] = {"from": "…", "to": f"version {doc.version}"}
    if diff:
        audit.record(db, actor=user, action="updated", entity_type="document", entity_id=doc.id,
                     summary=f"Updated document {doc.title}", changes=diff)
    return document_out(db, doc, with_content=True)


@router.delete("/documents/{document_id}", response_model=Message)
def delete_document(document_id: uuid.UUID, db: DbSession,
                    user: Annotated[User, Depends(require("documents.write"))]):
    doc = get_or_404(db, Document, document_id, user.company_id, "Document")
    doc.deleted_at = datetime.now(UTC)
    audit.record(db, actor=user, action="deleted", entity_type="document", entity_id=doc.id,
                 summary=f"Deleted document {doc.title}")
    return Message(message="Document deleted")


# ---------------------------------------------------------------- decisions
def decision_out(db, decision: Decision) -> dict:
    project = db.get(Project, decision.project_id) if decision.project_id else None
    return {
        "id": decision.id, "title": decision.title, "problem": decision.problem,
        "context": decision.context, "options": decision.options or [],
        "decision": decision.decision, "reason": decision.reason,
        "consequences": decision.consequences, "status": decision.status,
        "decided_by": user_ref(db.get(User, decision.decided_by_id))
        if decision.decided_by_id else None,
        "decided_at": decision.decided_at, "project_id": decision.project_id,
        "project_name": project.name if project else None,
        "meeting_id": decision.meeting_id, "participants": decision.participants or [],
        "participant_refs": refs(db, decision.participants or []),
        "created_at": decision.created_at,
    }


@router.get("/decisions")
def list_decisions(db: DbSession, user: Annotated[User, Depends(require("decisions.read"))],
                   paging: Paging, q: str | None = None,
                   status: Annotated[list[str] | None, Query()] = None,
                   project_id: uuid.UUID | None = None):
    stmt = select(Decision).where(Decision.company_id == user.company_id,
                                  Decision.deleted_at.is_(None))
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Decision.title.ilike(like), Decision.problem.ilike(like),
                              Decision.decision.ilike(like)))
    if status:
        stmt = stmt.where(Decision.status.in_(status))
    if project_id:
        stmt = stmt.where(Decision.project_id == project_id)
    stmt = stmt.order_by(Decision.created_at.desc())
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.scalars(stmt.limit(paging.page_size).offset(paging.offset)).all()
    return as_page([decision_out(db, d) for d in rows], total, paging)


@router.get("/decisions/{decision_id}", response_model=DecisionOut)
def get_decision(decision_id: uuid.UUID, db: DbSession,
                 user: Annotated[User, Depends(require("decisions.read"))]):
    decision = get_or_404(db, Decision, decision_id, user.company_id, "Decision")
    return decision_out(db, decision)


@router.post("/decisions", response_model=DecisionOut, status_code=201)
def create_decision(payload: DecisionIn, db: DbSession,
                    user: Annotated[User, Depends(require("decisions.write"))]):
    data = payload.model_dump()
    data["options"] = [o if isinstance(o, dict) else o.model_dump() for o in payload.options]
    data["participants"] = [str(p) for p in payload.participants]
    decision = Decision(company_id=user.company_id, **data)
    if decision.status == "decided":
        decision.decided_by_id = user.id
        decision.decided_at = datetime.now(UTC)
    db.add(decision)
    db.flush()
    if decision.project_id:
        graph.link(db, company_id=user.company_id, from_type="decision", from_id=decision.id,
                   rel_type="relates_to", to_type="project", to_id=decision.project_id, actor=user)
    if decision.meeting_id:
        graph.link(db, company_id=user.company_id, from_type="meeting",
                   from_id=decision.meeting_id, rel_type="creates", to_type="decision",
                   to_id=decision.id, actor=user)
    for participant in decision.participants:
        notifications.notify(
            db, user_id=uuid.UUID(participant), company_id=user.company_id, type="mention",
            title=f"You are named in decision “{decision.title}”",
            entity_type="decision", entity_id=decision.id,
            url=f"/decisions/{decision.id}", actor_id=user.id,
        )
    audit.record(db, actor=user, action="created", entity_type="decision", entity_id=decision.id,
                 summary=f"Recorded decision {decision.title}")
    return decision_out(db, decision)


@router.patch("/decisions/{decision_id}", response_model=DecisionOut)
def update_decision(decision_id: uuid.UUID, payload: DecisionUpdate, db: DbSession,
                    user: Annotated[User, Depends(require("decisions.write"))]):
    decision = get_or_404(db, Decision, decision_id, user.company_id, "Decision")
    changes = payload.model_dump(exclude_unset=True)
    if "options" in changes and changes["options"] is not None:
        changes["options"] = [o if isinstance(o, dict) else o.model_dump()
                              for o in changes["options"]]
    if "participants" in changes and changes["participants"] is not None:
        changes["participants"] = [str(p) for p in changes["participants"]]
    before = {k: getattr(decision, k) for k in changes}
    for field, value in changes.items():
        setattr(decision, field, value)
    if changes.get("status") == "decided" and decision.decided_at is None:
        decision.decided_by_id = user.id
        decision.decided_at = datetime.now(UTC)
    diff = audit.diff(before, changes)
    if diff:
        audit.record(db, actor=user,
                     action="status_changed" if "status" in diff else "updated",
                     entity_type="decision", entity_id=decision.id,
                     summary=f"Updated decision {decision.title}", changes=diff)
    return decision_out(db, decision)


@router.delete("/decisions/{decision_id}", response_model=Message)
def delete_decision(decision_id: uuid.UUID, db: DbSession,
                    user: Annotated[User, Depends(require("decisions.write"))]):
    decision = get_or_404(db, Decision, decision_id, user.company_id, "Decision")
    decision.deleted_at = datetime.now(UTC)
    return Message(message="Decision archived")
