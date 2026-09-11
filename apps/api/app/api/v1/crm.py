import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select

from app.api.helpers import get_or_404, user_ref
from app.core.deps import DbSession, require
from app.core.pagination import Paging, as_page
from app.models.business import Contact, Contract, CrmActivity, CrmCompany, Deal, Invoice
from app.models.identity import User
from app.schemas.business import (
    NextStepIn,
    ContactIn, ContactOut, ContractIn, ContractOut, CrmActivityIn, CrmActivityOut,
    CrmCompanyIn, CrmCompanyOut, DealIn, DealOut, DealUpdate,
)
from app.schemas.common import Message
from app.services import audit, graph

router = APIRouter(prefix="/crm", tags=["crm"])

DEAL_STAGES = ["qualification", "proposal", "negotiation", "won", "lost"]


def company_out(db, company: CrmCompany) -> dict:
    open_deals = db.scalars(select(Deal).where(
        Deal.crm_company_id == company.id, Deal.stage.notin_(["won", "lost"]),
        Deal.deleted_at.is_(None))).all()
    return {
        "id": company.id, "name": company.name, "industry": company.industry,
        "website": company.website, "size": company.size, "country": company.country,
        "status": company.status,
        "owner": user_ref(db.get(User, company.owner_id)) if company.owner_id else None,
        "notes": company.notes,
        "annual_value": float(company.annual_value) if company.annual_value is not None else None,
        "contact_count": db.scalar(select(func.count(Contact.id)).where(
            Contact.crm_company_id == company.id, Contact.deleted_at.is_(None))) or 0,
        "open_deals": len(open_deals),
        "pipeline_value": sum(float(d.value) for d in open_deals),
        "created_at": company.created_at,
    }


def deal_out(db, deal: Deal) -> dict:
    account = db.get(CrmCompany, deal.crm_company_id) if deal.crm_company_id else None
    return {
        "id": deal.id, "title": deal.title, "crm_company_id": deal.crm_company_id,
        "crm_company_name": account.name if account else None, "contact_id": deal.contact_id,
        "stage": deal.stage, "value": float(deal.value), "currency": deal.currency,
        "probability": deal.probability,
        "owner": user_ref(db.get(User, deal.owner_id)) if deal.owner_id else None,
        "expected_close": deal.expected_close, "project_id": deal.project_id,
        "notes": deal.notes, "created_at": deal.created_at,
    }


@router.get("/companies")
def list_companies(db: DbSession, user: Annotated[User, Depends(require("crm.read"))],
                   paging: Paging, q: str | None = None,
                   status: Annotated[list[str] | None, Query()] = None,
                   owner_id: uuid.UUID | None = None):
    stmt = select(CrmCompany).where(CrmCompany.company_id == user.company_id,
                                    CrmCompany.deleted_at.is_(None))
    if q:
        stmt = stmt.where(or_(CrmCompany.name.ilike(f"%{q}%"),
                              CrmCompany.industry.ilike(f"%{q}%")))
    if status:
        stmt = stmt.where(CrmCompany.status.in_(status))
    if owner_id:
        stmt = stmt.where(CrmCompany.owner_id == owner_id)
    stmt = stmt.order_by(CrmCompany.name)
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.scalars(stmt.limit(paging.page_size).offset(paging.offset)).all()
    return as_page([company_out(db, c) for c in rows], total, paging)


@router.post("/companies", response_model=CrmCompanyOut, status_code=201)
def create_company(payload: CrmCompanyIn, db: DbSession,
                   user: Annotated[User, Depends(require("crm.write"))]):
    account = CrmCompany(company_id=user.company_id, **payload.model_dump())
    account.owner_id = account.owner_id or user.id
    db.add(account)
    db.flush()
    audit.record(db, actor=user, action="created", entity_type="crm_company",
                 entity_id=account.id, summary=f"Added customer {account.name}")
    return company_out(db, account)


@router.get("/companies/{company_id}")
def get_company(company_id: uuid.UUID, db: DbSession,
                user: Annotated[User, Depends(require("crm.read"))]):
    account = get_or_404(db, CrmCompany, company_id, user.company_id, "Customer")
    contacts = db.scalars(select(Contact).where(
        Contact.crm_company_id == account.id, Contact.deleted_at.is_(None))).all()
    deals = db.scalars(select(Deal).where(
        Deal.crm_company_id == account.id, Deal.deleted_at.is_(None))
        .order_by(Deal.created_at.desc())).all()
    contracts = db.scalars(select(Contract).where(
        Contract.crm_company_id == account.id, Contract.deleted_at.is_(None))).all()
    invoices = db.scalars(select(Invoice).where(
        Invoice.customer_id == account.id, Invoice.deleted_at.is_(None))
        .order_by(Invoice.created_at.desc()).limit(10)).all()
    activities = db.scalars(select(CrmActivity).where(
        CrmActivity.crm_company_id == account.id)
        .order_by(CrmActivity.created_at.desc()).limit(20)).all()
    return {
        "company": company_out(db, account),
        "contacts": [
            {**ContactOut.model_validate(c).model_dump(), "crm_company_name": account.name}
            for c in contacts
        ],
        "deals": [deal_out(db, d) for d in deals],
        "contracts": [
            {**ContractOut.model_validate(c).model_dump(), "crm_company_name": account.name,
             "value": float(c.value)}
            for c in contracts
        ],
        "invoices": [
            {"id": str(i.id), "number": i.number, "total": float(i.total),
             "status": i.status, "due_on": i.due_on} for i in invoices
        ],
        "activities": [
            {"id": a.id, "crm_company_id": a.crm_company_id, "deal_id": a.deal_id,
             "type": a.type, "subject": a.subject, "body": a.body,
             "occurred_at": a.occurred_at,
             "user": user_ref(db.get(User, a.user_id)) if a.user_id else None,
             "created_at": a.created_at}
            for a in activities
        ],
    }


@router.patch("/companies/{company_id}", response_model=CrmCompanyOut)
def update_company(company_id: uuid.UUID, payload: CrmCompanyIn, db: DbSession,
                   user: Annotated[User, Depends(require("crm.write"))]):
    account = get_or_404(db, CrmCompany, company_id, user.company_id, "Customer")
    changes = payload.model_dump(exclude_unset=True)
    before = {k: getattr(account, k) for k in changes}
    for field, value in changes.items():
        setattr(account, field, value)
    diff = audit.diff(before, changes)
    if diff:
        audit.record(db, actor=user, action="updated", entity_type="crm_company",
                     entity_id=account.id, summary=f"Updated {account.name}", changes=diff)
    return company_out(db, account)


@router.get("/contacts", response_model=list[ContactOut])
def list_contacts(db: DbSession, user: Annotated[User, Depends(require("crm.read"))],
                  crm_company_id: uuid.UUID | None = None, q: str | None = None):
    stmt = select(Contact).where(Contact.company_id == user.company_id,
                                 Contact.deleted_at.is_(None))
    if crm_company_id:
        stmt = stmt.where(Contact.crm_company_id == crm_company_id)
    if q:
        stmt = stmt.where(or_(Contact.full_name.ilike(f"%{q}%"), Contact.email.ilike(f"%{q}%")))
    rows = db.scalars(stmt.order_by(Contact.full_name)).all()
    out = []
    for contact in rows:
        account = db.get(CrmCompany, contact.crm_company_id) if contact.crm_company_id else None
        out.append({**ContactOut.model_validate(contact).model_dump(),
                    "crm_company_name": account.name if account else None})
    return out


@router.post("/contacts", response_model=ContactOut, status_code=201)
def create_contact(payload: ContactIn, db: DbSession,
                   user: Annotated[User, Depends(require("crm.write"))]):
    contact = Contact(company_id=user.company_id, **payload.model_dump())
    db.add(contact)
    db.flush()
    return ContactOut.model_validate(contact)


@router.get("/deals")
def list_deals(db: DbSession, user: Annotated[User, Depends(require("crm.read"))],
               paging: Paging, stage: Annotated[list[str] | None, Query()] = None,
               owner_id: uuid.UUID | None = None, q: str | None = None):
    stmt = select(Deal).where(Deal.company_id == user.company_id, Deal.deleted_at.is_(None))
    if stage:
        stmt = stmt.where(Deal.stage.in_(stage))
    if owner_id:
        stmt = stmt.where(Deal.owner_id == owner_id)
    if q:
        stmt = stmt.where(Deal.title.ilike(f"%{q}%"))
    stmt = stmt.order_by(Deal.value.desc())
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.scalars(stmt.limit(paging.page_size).offset(paging.offset)).all()
    return as_page([deal_out(db, d) for d in rows], total, paging)


@router.get("/pipeline")
def pipeline(db: DbSession, user: Annotated[User, Depends(require("crm.read"))]):
    stages = []
    for stage in DEAL_STAGES:
        rows = db.scalars(select(Deal).where(
            Deal.company_id == user.company_id, Deal.stage == stage,
            Deal.deleted_at.is_(None)).order_by(Deal.value.desc()).limit(50)).all()
        stages.append({
            "key": stage, "label": stage.title(),
            "value": sum(float(d.value) for d in rows), "count": len(rows),
            "deals": [deal_out(db, d) for d in rows],
        })
    return {"stages": stages}


@router.post("/deals", response_model=DealOut, status_code=201)
def create_deal(payload: DealIn, db: DbSession,
                user: Annotated[User, Depends(require("crm.write"))]):
    deal = Deal(company_id=user.company_id, **payload.model_dump())
    deal.owner_id = deal.owner_id or user.id
    db.add(deal)
    db.flush()
    if deal.crm_company_id:
        graph.link(db, company_id=user.company_id, from_type="crm_company",
                   from_id=deal.crm_company_id, rel_type="owns", to_type="deal",
                   to_id=deal.id, actor=user)
    audit.record(db, actor=user, action="created", entity_type="deal", entity_id=deal.id,
                 summary=f"Created deal {deal.title} ({float(deal.value):,.0f})")
    return deal_out(db, deal)


@router.patch("/deals/{deal_id}", response_model=DealOut)
def update_deal(deal_id: uuid.UUID, payload: DealUpdate, db: DbSession,
                user: Annotated[User, Depends(require("crm.write"))]):
    deal = get_or_404(db, Deal, deal_id, user.company_id, "Deal")
    changes = payload.model_dump(exclude_unset=True)
    before = {k: getattr(deal, k) for k in changes}
    for field, value in changes.items():
        setattr(deal, field, value)
    if changes.get("stage") in ("won", "lost") and deal.closed_at is None:
        deal.closed_at = datetime.now(UTC)
        if changes["stage"] == "won" and deal.crm_company_id:
            account = db.get(CrmCompany, deal.crm_company_id)
            if account and account.status != "customer":
                account.status = "customer"
    diff = audit.diff(before, changes)
    if diff:
        audit.record(db, actor=user,
                     action="status_changed" if "stage" in diff else "updated",
                     entity_type="deal", entity_id=deal.id,
                     summary=f"Updated deal {deal.title}", changes=diff)
    return deal_out(db, deal)


@router.get("/contracts", response_model=list[ContractOut])
def list_contracts(db: DbSession, user: Annotated[User, Depends(require("crm.read"))],
                   crm_company_id: uuid.UUID | None = None):
    stmt = select(Contract).where(Contract.company_id == user.company_id,
                                  Contract.deleted_at.is_(None))
    if crm_company_id:
        stmt = stmt.where(Contract.crm_company_id == crm_company_id)
    rows = db.scalars(stmt.order_by(Contract.created_at.desc())).all()
    out = []
    for contract in rows:
        account = db.get(CrmCompany, contract.crm_company_id) if contract.crm_company_id else None
        out.append({**ContractOut.model_validate(contract).model_dump(),
                    "crm_company_name": account.name if account else None,
                    "value": float(contract.value)})
    return out


@router.post("/contracts", response_model=ContractOut, status_code=201)
def create_contract(payload: ContractIn, db: DbSession,
                    user: Annotated[User, Depends(require("crm.write"))]):
    contract = Contract(company_id=user.company_id, **payload.model_dump())
    db.add(contract)
    db.flush()
    if contract.crm_company_id:
        graph.link(db, company_id=user.company_id, from_type="crm_company",
                   from_id=contract.crm_company_id, rel_type="owns", to_type="contract",
                   to_id=contract.id, actor=user)
    if contract.project_id:
        graph.link(db, company_id=user.company_id, from_type="contract", from_id=contract.id,
                   rel_type="creates", to_type="project", to_id=contract.project_id, actor=user)
    audit.record(db, actor=user, action="created", entity_type="contract",
                 entity_id=contract.id, summary=f"Created contract {contract.title}")
    return {**ContractOut.model_validate(contract).model_dump(),
            "value": float(contract.value), "crm_company_name": None}


@router.post("/activities", response_model=CrmActivityOut, status_code=201)
def create_activity(payload: CrmActivityIn, db: DbSession,
                    user: Annotated[User, Depends(require("crm.write"))]):
    activity = CrmActivity(company_id=user.company_id, user_id=user.id, **payload.model_dump())
    activity.occurred_at = activity.occurred_at or datetime.now(UTC)
    db.add(activity)
    db.flush()
    return {
        "id": activity.id, "crm_company_id": activity.crm_company_id,
        "deal_id": activity.deal_id, "type": activity.type, "subject": activity.subject,
        "body": activity.body, "occurred_at": activity.occurred_at,
        "user": user_ref(user), "created_at": activity.created_at,
    }


@router.delete("/companies/{company_id}", response_model=Message)
def delete_company(company_id: uuid.UUID, db: DbSession,
                   user: Annotated[User, Depends(require("crm.manage"))]):
    account = get_or_404(db, CrmCompany, company_id, user.company_id, "Customer")
    account.deleted_at = datetime.now(UTC)
    return Message(message="Customer removed")


@router.get("/followups")
def followups(db: DbSession, user: Annotated[User, Depends(require("crm.read"))],
              mine: bool = True, horizon_days: int = 7):
    """The pipeline's actual to-do list.

    Three buckets a salesperson checks each morning: what is overdue, what is
    due soon, and — the one that quietly loses deals — which open deals have no
    agreed next step at all.
    """
    today = date.today()
    horizon = today + timedelta(days=horizon_days)
    base = select(Deal).where(
        Deal.company_id == user.company_id,
        Deal.deleted_at.is_(None),
        Deal.stage.notin_(["won", "lost"]),
    )
    if mine:
        base = base.where(Deal.owner_id == user.id)

    def serialize(rows):
        return [
            {
                "id": row.id, "title": row.title, "stage": row.stage,
                "value": float(row.value), "currency": row.currency,
                "next_step": row.next_step, "next_step_due": row.next_step_due,
                "expected_close": row.expected_close,
                "last_activity_at": row.last_activity_at,
                "company": (
                    {"id": c.id, "name": c.name}
                    if (c := db.get(CrmCompany, row.crm_company_id)) else None
                ),
                "owner": user_ref(db.get(User, row.owner_id)) if row.owner_id else None,
                "days_overdue": (today - row.next_step_due).days if row.next_step_due else None,
            }
            for row in rows
        ]

    overdue = db.scalars(
        base.where(Deal.next_step_due.is_not(None), Deal.next_step_due < today)
        .order_by(Deal.next_step_due)
    ).all()
    upcoming = db.scalars(
        base.where(Deal.next_step_due.is_not(None), Deal.next_step_due >= today,
                   Deal.next_step_due <= horizon).order_by(Deal.next_step_due)
    ).all()
    unscheduled = db.scalars(
        base.where(Deal.next_step_due.is_(None)).order_by(Deal.value.desc())
    ).all()

    return {
        "overdue": serialize(overdue),
        "upcoming": serialize(upcoming),
        "unscheduled": serialize(unscheduled),
        "counts": {
            "overdue": len(overdue), "upcoming": len(upcoming),
            "unscheduled": len(unscheduled),
        },
    }


@router.post("/deals/{deal_id}/next-step")
def set_next_step(deal_id: uuid.UUID, payload: NextStepIn, db: DbSession,
                  user: Annotated[User, Depends(require("crm.write"))]):
    """Agree the next move on a deal, and log it as activity in one action."""
    deal = get_or_404(db, Deal, deal_id, user.company_id, "Deal")
    deal.next_step = payload.next_step
    deal.next_step_due = payload.due_on
    deal.last_activity_at = datetime.now(UTC)
    if payload.log_activity:
        db.add(CrmActivity(
            company_id=user.company_id, crm_company_id=deal.crm_company_id, deal_id=deal.id,
            type=payload.activity_type or "note",
            subject=payload.activity_subject or f"Next step: {payload.next_step}",
            body=payload.activity_body, occurred_at=datetime.now(UTC), user_id=user.id,
        ))
    db.flush()
    audit.record(db, actor=user, action="updated", entity_type="deal", entity_id=deal.id,
                 summary=f"Next step on {deal.title}: {payload.next_step}")
    return {
        "id": deal.id, "next_step": deal.next_step, "next_step_due": deal.next_step_due,
        "last_activity_at": deal.last_activity_at,
    }
