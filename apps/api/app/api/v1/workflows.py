import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select

from app.api.helpers import get_or_404, user_ref
from app.core.deps import CurrentUser, DbSession, can, require
from app.core.errors import Forbidden
from app.core.pagination import Paging, as_page
from app.models.identity import User
from app.models.ops import Approval, WorkflowDefinition, WorkflowRequest
from app.schemas.common import Message
from app.schemas.ops import (
    ApprovalOut, RequestAction, RequestDetail, RequestIn, RequestOut,
    WorkflowDefinitionIn, WorkflowDefinitionOut,
)
from app.services import audit, workflow

router = APIRouter(tags=["workflows"])


def definition_out(db, definition: WorkflowDefinition) -> dict:
    total = db.scalar(select(func.count(WorkflowRequest.id)).where(
        WorkflowRequest.definition_id == definition.id)) or 0
    open_count = db.scalar(select(func.count(WorkflowRequest.id)).where(
        WorkflowRequest.definition_id == definition.id,
        WorkflowRequest.status == "open")) or 0
    return {
        "id": definition.id, "key": definition.key, "name": definition.name,
        "description": definition.description, "icon": definition.icon,
        "category": definition.category, "is_active": definition.is_active,
        "form_schema": definition.form_schema or [], "states": definition.states or [],
        "transitions": definition.transitions or [],
        "request_count": total, "open_count": open_count,
    }


def _state_label(definition: WorkflowDefinition, key: str) -> str | None:
    for state in definition.states or []:
        if state.get("key") == key:
            return state.get("label")
    return key


def request_out(db, request: WorkflowRequest, viewer: User, detail: bool = False) -> dict:
    definition = db.get(WorkflowDefinition, request.definition_id)
    awaiting = db.scalar(
        select(func.count(Approval.id)).where(
            Approval.request_id == request.id, Approval.status == "pending",
            Approval.approver_id == viewer.id)
    ) or 0
    data = {
        "id": request.id, "number": request.number, "title": request.title,
        "state": request.state,
        "state_label": _state_label(definition, request.state) if definition else request.state,
        "status": request.status, "data": request.data or {},
        "amount": float(request.amount) if request.amount is not None else None,
        "requester": user_ref(db.get(User, request.requester_id))
        if request.requester_id else None,
        "definition_id": request.definition_id,
        "definition_name": definition.name if definition else None,
        "definition_icon": definition.icon if definition else None,
        "project_id": request.project_id, "created_at": request.created_at,
        "completed_at": request.completed_at, "awaiting_me": bool(awaiting),
    }
    if detail and definition:
        approvals = db.scalars(
            select(Approval).where(Approval.request_id == request.id)
            .order_by(Approval.step, Approval.created_at)
        ).all()
        current = next((s for s in definition.states if s.get("key") == request.state), None)
        data |= {
            "approvals": [
                {
                    "id": a.id, "state_key": a.state_key, "step": a.step,
                    "approver": user_ref(db.get(User, a.approver_id)) if a.approver_id else None,
                    "approver_role": a.approver_role, "status": a.status, "comment": a.comment,
                    "decided_at": a.decided_at, "created_at": a.created_at,
                }
                for a in approvals
            ],
            "available_actions": workflow.available_actions(db, definition, request),
            "form_schema": definition.form_schema or [],
            "states": definition.states or [],
            "can_act": bool(current) and request.status == "open"
                       and workflow.can_act(db, request, current, viewer),
        }
    return data


# ---------------------------------------------------------------- definitions
@router.get("/workflows", response_model=list[WorkflowDefinitionOut])
def list_definitions(db: DbSession, user: Annotated[User, Depends(require("workflows.read"))],
                     category: str | None = None):
    stmt = select(WorkflowDefinition).where(
        WorkflowDefinition.company_id == user.company_id,
        WorkflowDefinition.deleted_at.is_(None))
    if category:
        stmt = stmt.where(WorkflowDefinition.category == category)
    rows = db.scalars(stmt.order_by(WorkflowDefinition.name)).all()
    return [definition_out(db, d) for d in rows]


@router.post("/workflows", response_model=WorkflowDefinitionOut, status_code=201)
def create_definition(payload: WorkflowDefinitionIn, db: DbSession,
                      user: Annotated[User, Depends(require("workflows.manage"))]):
    data = payload.model_dump()
    data["form_schema"] = [f if isinstance(f, dict) else f.model_dump()
                           for f in payload.form_schema]
    data["states"] = [s if isinstance(s, dict) else s.model_dump() for s in payload.states]
    definition = WorkflowDefinition(company_id=user.company_id, **data)
    db.add(definition)
    db.flush()
    audit.record(db, actor=user, action="created", entity_type="request",
                 entity_id=definition.id, summary=f"Created workflow {definition.name}")
    return definition_out(db, definition)


@router.get("/workflows/{definition_id}", response_model=WorkflowDefinitionOut)
def get_definition(definition_id: uuid.UUID, db: DbSession,
                   user: Annotated[User, Depends(require("workflows.read"))]):
    definition = get_or_404(db, WorkflowDefinition, definition_id, user.company_id, "Workflow")
    return definition_out(db, definition)


@router.patch("/workflows/{definition_id}", response_model=WorkflowDefinitionOut)
def update_definition(definition_id: uuid.UUID, payload: WorkflowDefinitionIn, db: DbSession,
                      user: Annotated[User, Depends(require("workflows.manage"))]):
    definition = get_or_404(db, WorkflowDefinition, definition_id, user.company_id, "Workflow")
    data = payload.model_dump(exclude_unset=True)
    if "form_schema" in data:
        data["form_schema"] = [f if isinstance(f, dict) else f.model_dump()
                               for f in payload.form_schema]
    if "states" in data:
        data["states"] = [s if isinstance(s, dict) else s.model_dump() for s in payload.states]
    for field, value in data.items():
        setattr(definition, field, value)
    return definition_out(db, definition)


# ---------------------------------------------------------------- requests
@router.get("/requests")
def list_requests(db: DbSession, user: CurrentUser, paging: Paging,
                  q: str | None = None,
                  status: Annotated[list[str] | None, Query()] = None,
                  definition_id: uuid.UUID | None = None,
                  mine: bool = False, awaiting_me: bool = False):
    stmt = select(WorkflowRequest).where(
        WorkflowRequest.company_id == user.company_id, WorkflowRequest.deleted_at.is_(None))
    if not can(db, user, "approvals.read"):
        # Ordinary employees only see their own requests and ones awaiting them.
        stmt = stmt.where(
            or_(
                WorkflowRequest.requester_id == user.id,
                WorkflowRequest.id.in_(
                    select(Approval.request_id).where(Approval.approver_id == user.id)
                ),
            )
        )
    if q:
        stmt = stmt.where(WorkflowRequest.title.ilike(f"%{q}%"))
    if status:
        stmt = stmt.where(WorkflowRequest.status.in_(status))
    if definition_id:
        stmt = stmt.where(WorkflowRequest.definition_id == definition_id)
    if mine:
        stmt = stmt.where(WorkflowRequest.requester_id == user.id)
    if awaiting_me:
        stmt = stmt.where(
            WorkflowRequest.id.in_(
                select(Approval.request_id).where(
                    Approval.approver_id == user.id, Approval.status == "pending")
            ),
            WorkflowRequest.status == "open",
        )
    stmt = stmt.order_by(WorkflowRequest.created_at.desc())
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.scalars(stmt.limit(paging.page_size).offset(paging.offset)).all()
    return as_page([request_out(db, r, user) for r in rows], total, paging)


@router.post("/requests", response_model=RequestDetail, status_code=201)
def create_request(payload: RequestIn, db: DbSession,
                   user: Annotated[User, Depends(require("workflows.write"))]):
    definition = get_or_404(db, WorkflowDefinition, payload.definition_id,
                            user.company_id, "Workflow")
    title = payload.title or f"{definition.name} #{(db.scalar(select(func.count(WorkflowRequest.id)).where(WorkflowRequest.definition_id == definition.id)) or 0) + 1}"
    amount = payload.amount
    if amount is None:
        raw = payload.data.get("amount")
        try:
            amount = float(raw) if raw not in (None, "") else None
        except (TypeError, ValueError):
            amount = None
    request = workflow.create_request(
        db, definition=definition, requester=user, title=title, data=payload.data,
        project_id=payload.project_id, amount=amount,
    )
    db.flush()
    return request_out(db, request, user, detail=True)


@router.get("/requests/{request_id}", response_model=RequestDetail)
def get_request(request_id: uuid.UUID, db: DbSession, user: CurrentUser):
    request = get_or_404(db, WorkflowRequest, request_id, user.company_id, "Request")
    if request.requester_id != user.id and not can(db, user, "approvals.read"):
        is_approver = db.scalar(select(func.count(Approval.id)).where(
            Approval.request_id == request.id, Approval.approver_id == user.id)) or 0
        if not is_approver:
            raise Forbidden("You cannot view this request")
    return request_out(db, request, user, detail=True)


@router.post("/requests/{request_id}/actions", response_model=RequestDetail)
def act_on_request(request_id: uuid.UUID, payload: RequestAction, db: DbSession,
                   user: CurrentUser):
    request = get_or_404(db, WorkflowRequest, request_id, user.company_id, "Request")
    workflow.act(db, request=request, user=user, action=payload.action, comment=payload.comment)
    db.flush()
    return request_out(db, request, user, detail=True)


@router.get("/approvals/pending", response_model=list[ApprovalOut])
def my_pending_approvals(db: DbSession, user: CurrentUser):
    rows = db.scalars(
        select(Approval)
        .join(WorkflowRequest, Approval.request_id == WorkflowRequest.id)
        .where(WorkflowRequest.company_id == user.company_id,
               Approval.approver_id == user.id, Approval.status == "pending")
        .order_by(Approval.created_at.desc())
    ).all()
    return [
        {
            "id": a.id, "state_key": a.state_key, "step": a.step,
            "approver": user_ref(db.get(User, a.approver_id)) if a.approver_id else None,
            "approver_role": a.approver_role, "status": a.status, "comment": a.comment,
            "decided_at": a.decided_at, "created_at": a.created_at,
        }
        for a in rows
    ]


@router.delete("/requests/{request_id}", response_model=Message)
def cancel_request(request_id: uuid.UUID, db: DbSession, user: CurrentUser):
    request = get_or_404(db, WorkflowRequest, request_id, user.company_id, "Request")
    if request.requester_id != user.id and not can(db, user, "workflows.manage"):
        raise Forbidden("Only the requester can cancel this request")
    request.status = "cancelled"
    for approval in db.scalars(select(Approval).where(
            Approval.request_id == request.id, Approval.status == "pending")).all():
        approval.status = "cancelled"
    audit.record(db, actor=user, action="updated", entity_type="request", entity_id=request.id,
                 summary=f"Cancelled request {request.title}")
    return Message(message="Request cancelled")
