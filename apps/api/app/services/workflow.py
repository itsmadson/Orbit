"""Declarative workflow engine.

A workflow definition is data, not code: ``states`` describe the steps,
``transitions`` describe the legal moves, and ``form_schema`` describes the
request form. New workflows are therefore created through the API without
touching the engine.

State shape::

    {"key": "manager_approval", "label": "Manager approval",
     "type": "approval",              # start | approval | action | terminal
     "approver_role": "manager",      # role name, or "manager" = requester's manager
     "approver_id": "<uuid>"}         # explicit approver, optional

Transition shape::

    {"from": "manager_approval", "to": "finance_approval",
     "action": "approve", "label": "Approve"}
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import BadRequest, Forbidden, NotFound
from app.models.identity import User
from app.models.ops import Approval, WorkflowDefinition, WorkflowRequest
from app.services import audit, notifications

TERMINAL_STATUSES = {"approved", "rejected", "cancelled", "completed"}


def _state(definition: WorkflowDefinition, key: str) -> dict | None:
    return next((s for s in definition.states if s.get("key") == key), None)


def start_state(definition: WorkflowDefinition) -> dict:
    start = next((s for s in definition.states if s.get("type") == "start"), None)
    if start:
        moves = [t for t in definition.transitions if t.get("from") == start["key"]]
        if moves:
            nxt = _state(definition, moves[0]["to"])
            if nxt:
                return nxt
    if not definition.states:
        raise BadRequest("Workflow definition has no states")
    return definition.states[0]


def eligible_approvers(db: Session, request: WorkflowRequest, state: dict) -> list[User]:
    if state.get("approver_id"):
        user = db.get(User, uuid.UUID(str(state["approver_id"])))
        return [user] if user else []
    role = state.get("approver_role")
    if not role:
        return []
    if role == "manager":
        requester = db.get(User, request.requester_id) if request.requester_id else None
        if requester and requester.manager_id:
            manager = db.get(User, requester.manager_id)
            return [manager] if manager else []
        role = "company_admin"
    stmt = select(User).where(
        User.company_id == request.company_id,
        User.role == role,
        User.is_active.is_(True),
        User.deleted_at.is_(None),
    )
    return list(db.scalars(stmt).all())


def _enter_state(db: Session, definition: WorkflowDefinition, request: WorkflowRequest, state: dict) -> None:
    request.state = state["key"]
    if state.get("type") == "terminal":
        request.status = state.get("result", "approved")
        request.completed_at = datetime.now(UTC)
        if request.requester_id:
            notifications.notify(
                db,
                user_id=request.requester_id,
                company_id=request.company_id,
                type="approval_result",
                title=f"{request.title} — {state.get('label', request.status)}",
                body=f"Your request {request.title} is now {request.status}.",
                entity_type="request",
                entity_id=request.id,
                url=f"/approvals/{request.id}",
                priority="high",
            )
        return

    if state.get("type") == "approval":
        step = len(db.scalars(select(Approval).where(Approval.request_id == request.id)).all()) + 1
        approvers = eligible_approvers(db, request, state)
        for approver in approvers:
            db.add(
                Approval(
                    request_id=request.id,
                    state_key=state["key"],
                    step=step,
                    approver_id=approver.id,
                    approver_role=state.get("approver_role"),
                    status="pending",
                )
            )
            notifications.notify(
                db,
                user_id=approver.id,
                company_id=request.company_id,
                type="approval_request",
                title=f"Approval needed: {request.title}",
                body=f"{state.get('label', 'Approval')} step is waiting for you.",
                entity_type="request",
                entity_id=request.id,
                url=f"/approvals/{request.id}",
                priority="high",
            )
        if not approvers:
            db.add(
                Approval(
                    request_id=request.id,
                    state_key=state["key"],
                    step=step,
                    approver_role=state.get("approver_role"),
                    status="pending",
                )
            )


def create_request(
    db: Session,
    *,
    definition: WorkflowDefinition,
    requester: User,
    title: str,
    data: dict,
    project_id: uuid.UUID | None = None,
    amount: float | None = None,
) -> WorkflowRequest:
    validate_form(definition, data)
    count = len(
        db.scalars(
            select(WorkflowRequest).where(WorkflowRequest.definition_id == definition.id)
        ).all()
    )
    request = WorkflowRequest(
        company_id=definition.company_id,
        definition_id=definition.id,
        number=count + 1,
        title=title,
        state="draft",
        status="open",
        data=data,
        requester_id=requester.id,
        project_id=project_id,
        amount=amount,
    )
    db.add(request)
    db.flush()
    _enter_state(db, definition, request, start_state(definition))
    audit.record(
        db, actor=requester, action="created", entity_type="request",
        entity_id=request.id, summary=f"Submitted request {request.title}",
    )
    return request


def validate_form(definition: WorkflowDefinition, data: dict) -> None:
    missing = [
        f.get("label", f["key"])
        for f in definition.form_schema
        if f.get("required") and not str(data.get(f["key"], "")).strip()
    ]
    if missing:
        raise BadRequest("Missing required fields: " + ", ".join(missing))


def available_actions(db: Session, definition: WorkflowDefinition, request: WorkflowRequest) -> list[dict]:
    if request.status != "open":
        return []
    return [t for t in definition.transitions if t.get("from") == request.state]


def can_act(db: Session, request: WorkflowRequest, state: dict, user: User) -> bool:
    if user.role in ("super_admin", "company_admin"):
        return True
    if state.get("type") != "approval":
        return request.requester_id == user.id
    return any(a.id == user.id for a in eligible_approvers(db, request, state))


def act(
    db: Session,
    *,
    request: WorkflowRequest,
    user: User,
    action: str,
    comment: str | None = None,
) -> WorkflowRequest:
    definition = db.get(WorkflowDefinition, request.definition_id)
    if definition is None:
        raise NotFound("Workflow definition")
    if request.status != "open":
        raise BadRequest("This request is already closed")
    state = _state(definition, request.state)
    if state is None:
        raise BadRequest("Request is in an unknown state")
    transition = next(
        (
            t for t in definition.transitions
            if t.get("from") == request.state and t.get("action") == action
        ),
        None,
    )
    if transition is None:
        raise BadRequest(f"Action '{action}' is not allowed from state '{request.state}'")
    if not can_act(db, request, state, user):
        raise Forbidden("You are not an approver for this step")

    pending = db.scalars(
        select(Approval).where(
            Approval.request_id == request.id,
            Approval.state_key == request.state,
            Approval.status == "pending",
        )
    ).all()
    for approval in pending:
        if approval.approver_id in (None, user.id) or user.role in ("super_admin", "company_admin"):
            approval.status = "approved" if action == "approve" else action
            approval.comment = comment
            approval.decided_at = datetime.now(UTC)
            approval.approver_id = approval.approver_id or user.id
        else:
            approval.status = "skipped"
            approval.decided_at = datetime.now(UTC)

    target = _state(definition, transition["to"])
    if target is None:
        raise BadRequest("Transition points at an unknown state")
    _enter_state(db, definition, request, target)
    audit.record(
        db, actor=user, action="approved" if action == "approve" else action,
        entity_type="request", entity_id=request.id,
        summary=f"{action} on {request.title}", changes={"state": {"from": state["key"], "to": target["key"]}},
    )
    return request


DEFAULT_WORKFLOWS = [
    {
        "key": "purchase_request",
        "name": "Purchase request",
        "description": "Request to buy goods or services, routed through manager and finance.",
        "icon": "🛒",
        "category": "procurement",
        "form_schema": [
            {"key": "item", "label": "Item", "type": "text", "required": True},
            {"key": "amount", "label": "Amount", "type": "number", "required": True},
            {"key": "vendor", "label": "Preferred vendor", "type": "text"},
            {"key": "justification", "label": "Justification", "type": "textarea", "required": True},
            {"key": "needed_by", "label": "Needed by", "type": "date"},
        ],
        "states": [
            {"key": "draft", "label": "Draft", "type": "start"},
            {"key": "manager_approval", "label": "Manager approval", "type": "approval", "approver_role": "manager"},
            {"key": "finance_approval", "label": "Finance approval", "type": "approval", "approver_role": "finance"},
            {"key": "procurement", "label": "Procurement", "type": "approval", "approver_role": "company_admin"},
            {"key": "approved", "label": "Approved", "type": "terminal", "result": "approved"},
            {"key": "rejected", "label": "Rejected", "type": "terminal", "result": "rejected"},
        ],
        "transitions": [
            {"from": "draft", "to": "manager_approval", "action": "submit", "label": "Submit"},
            {"from": "manager_approval", "to": "finance_approval", "action": "approve", "label": "Approve"},
            {"from": "manager_approval", "to": "rejected", "action": "reject", "label": "Reject"},
            {"from": "finance_approval", "to": "procurement", "action": "approve", "label": "Approve"},
            {"from": "finance_approval", "to": "rejected", "action": "reject", "label": "Reject"},
            {"from": "procurement", "to": "approved", "action": "approve", "label": "Issue purchase order"},
            {"from": "procurement", "to": "rejected", "action": "reject", "label": "Reject"},
        ],
    },
    {
        "key": "expense_claim",
        "name": "Expense claim",
        "description": "Reimbursement for money already spent.",
        "icon": "🧾",
        "category": "finance",
        "form_schema": [
            {"key": "purpose", "label": "Purpose", "type": "text", "required": True},
            {"key": "amount", "label": "Amount", "type": "number", "required": True},
            {"key": "spent_on", "label": "Spent on", "type": "date", "required": True},
            {"key": "notes", "label": "Notes", "type": "textarea"},
        ],
        "states": [
            {"key": "draft", "label": "Draft", "type": "start"},
            {"key": "manager_approval", "label": "Manager approval", "type": "approval", "approver_role": "manager"},
            {"key": "finance_approval", "label": "Finance review", "type": "approval", "approver_role": "finance"},
            {"key": "approved", "label": "Reimbursed", "type": "terminal", "result": "approved"},
            {"key": "rejected", "label": "Rejected", "type": "terminal", "result": "rejected"},
        ],
        "transitions": [
            {"from": "draft", "to": "manager_approval", "action": "submit", "label": "Submit"},
            {"from": "manager_approval", "to": "finance_approval", "action": "approve", "label": "Approve"},
            {"from": "manager_approval", "to": "rejected", "action": "reject", "label": "Reject"},
            {"from": "finance_approval", "to": "approved", "action": "approve", "label": "Reimburse"},
            {"from": "finance_approval", "to": "rejected", "action": "reject", "label": "Reject"},
        ],
    },
    {
        "key": "document_review",
        "name": "Document review",
        "description": "Ask a reviewer to sign off on a document.",
        "icon": "📄",
        "category": "knowledge",
        "form_schema": [
            {"key": "document", "label": "Document", "type": "text", "required": True},
            {"key": "reason", "label": "What should the reviewer check?", "type": "textarea", "required": True},
        ],
        "states": [
            {"key": "draft", "label": "Draft", "type": "start"},
            {"key": "review", "label": "Review", "type": "approval", "approver_role": "manager"},
            {"key": "approved", "label": "Approved", "type": "terminal", "result": "approved"},
            {"key": "rejected", "label": "Changes requested", "type": "terminal", "result": "rejected"},
        ],
        "transitions": [
            {"from": "draft", "to": "review", "action": "submit", "label": "Submit"},
            {"from": "review", "to": "approved", "action": "approve", "label": "Approve"},
            {"from": "review", "to": "rejected", "action": "reject", "label": "Request changes"},
        ],
    },
    {
        "key": "access_request",
        "name": "Access request",
        "description": "Request access to a system, repository or tool.",
        "icon": "🔑",
        "category": "it",
        "form_schema": [
            {"key": "system", "label": "System", "type": "text", "required": True},
            {"key": "level", "label": "Access level", "type": "select",
             "options": ["read", "write", "admin"], "required": True},
            {"key": "reason", "label": "Reason", "type": "textarea", "required": True},
        ],
        "states": [
            {"key": "draft", "label": "Draft", "type": "start"},
            {"key": "manager_approval", "label": "Manager approval", "type": "approval", "approver_role": "manager"},
            {"key": "it_approval", "label": "IT approval", "type": "approval", "approver_role": "company_admin"},
            {"key": "approved", "label": "Granted", "type": "terminal", "result": "approved"},
            {"key": "rejected", "label": "Denied", "type": "terminal", "result": "rejected"},
        ],
        "transitions": [
            {"from": "draft", "to": "manager_approval", "action": "submit", "label": "Submit"},
            {"from": "manager_approval", "to": "it_approval", "action": "approve", "label": "Approve"},
            {"from": "manager_approval", "to": "rejected", "action": "reject", "label": "Reject"},
            {"from": "it_approval", "to": "approved", "action": "approve", "label": "Grant access"},
            {"from": "it_approval", "to": "rejected", "action": "reject", "label": "Deny"},
        ],
    },
]
