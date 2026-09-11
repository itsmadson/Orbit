import uuid
from datetime import UTC, date, datetime, timedelta
from calendar import monthrange
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select

from app.api.helpers import get_or_404, user_ref
from app.core.deps import DbSession, require
from app.core.pagination import Paging, as_page
from app.models.business import (
    RecurringTransaction,
    Budget, CrmCompany, FinanceAccount, FinanceCategory, Invoice, Transaction, Vendor,
)
from app.models.identity import User
from app.models.work import Project
from app.schemas.business import (
    RecurringIn, RecurringUpdate,
    AccountIn, AccountOut, BudgetIn, BudgetOut, CategoryIn, CategoryOut, FinanceSummary,
    InvoiceIn, InvoiceOut, InvoiceUpdate, TransactionIn, TransactionOut, TransactionUpdate,
    VendorIn, VendorOut,
)
from app.schemas.common import Message
from app.services import audit, graph, notifications

router = APIRouter(prefix="/finance", tags=["finance"])


def transaction_out(db, tx: Transaction) -> dict:
    category = db.get(FinanceCategory, tx.category_id) if tx.category_id else None
    project = db.get(Project, tx.project_id) if tx.project_id else None
    vendor = db.get(Vendor, tx.vendor_id) if tx.vendor_id else None
    return {
        "id": tx.id, "kind": tx.kind, "description": tx.description,
        "amount": float(tx.amount), "currency": tx.currency, "occurred_on": tx.occurred_on,
        "status": tx.status, "account_id": tx.account_id, "category_id": tx.category_id,
        "category_name": category.name if category else None,
        "category_color": category.color if category else None,
        "project_id": tx.project_id, "project_name": project.name if project else None,
        "vendor_id": tx.vendor_id, "vendor_name": vendor.name if vendor else None,
        "customer_id": tx.customer_id,
        "created_by": user_ref(db.get(User, tx.created_by_id)) if tx.created_by_id else None,
        "created_at": tx.created_at,
    }


def invoice_out(db, invoice: Invoice) -> dict:
    customer = db.get(CrmCompany, invoice.customer_id) if invoice.customer_id else None
    project = db.get(Project, invoice.project_id) if invoice.project_id else None
    return {
        "id": invoice.id, "number": invoice.number, "direction": invoice.direction,
        "status": invoice.status, "customer_id": invoice.customer_id,
        "customer_name": customer.name if customer else None, "vendor_id": invoice.vendor_id,
        "project_id": invoice.project_id, "project_name": project.name if project else None,
        "lines": invoice.lines or [], "subtotal": float(invoice.subtotal),
        "tax_rate": float(invoice.tax_rate), "total": float(invoice.total),
        "currency": invoice.currency, "issued_on": invoice.issued_on, "due_on": invoice.due_on,
        "paid_on": invoice.paid_on, "notes": invoice.notes, "created_at": invoice.created_at,
    }


def budget_spent(db, budget: Budget) -> float:
    stmt = select(func.sum(Transaction.amount)).where(
        Transaction.kind == "expense", Transaction.deleted_at.is_(None))
    if budget.project_id:
        stmt = stmt.where(Transaction.project_id == budget.project_id)
    if budget.department_id:
        stmt = stmt.where(Transaction.department_id == budget.department_id)
    if budget.category_id:
        stmt = stmt.where(Transaction.category_id == budget.category_id)
    if budget.period_start:
        stmt = stmt.where(Transaction.occurred_on >= budget.period_start)
    if budget.period_end:
        stmt = stmt.where(Transaction.occurred_on <= budget.period_end)
    return float(db.scalar(stmt) or 0)


# ---------------------------------------------------------------- summary
@router.get("/summary", response_model=FinanceSummary)
def summary(db: DbSession, user: Annotated[User, Depends(require("finance.read"))],
            months: int = 6, project_id: uuid.UUID | None = None):
    today = date.today()
    start = (today.replace(day=1) - timedelta(days=31 * (months - 1))).replace(day=1)
    base = [Transaction.company_id == user.company_id, Transaction.deleted_at.is_(None)]
    if project_id:
        base.append(Transaction.project_id == project_id)

    income = float(db.scalar(select(func.sum(Transaction.amount)).where(
        *base, Transaction.kind == "income", Transaction.occurred_on >= start)) or 0)
    expenses = float(db.scalar(select(func.sum(Transaction.amount)).where(
        *base, Transaction.kind == "expense", Transaction.occurred_on >= start)) or 0)

    by_category = [
        {"name": name or "Uncategorised", "color": color or "#64748b", "amount": float(amount)}
        for name, color, amount in db.execute(
            select(FinanceCategory.name, FinanceCategory.color, func.sum(Transaction.amount))
            .join(FinanceCategory, Transaction.category_id == FinanceCategory.id, isouter=True)
            .where(*base, Transaction.kind == "expense", Transaction.occurred_on >= start)
            .group_by(FinanceCategory.name, FinanceCategory.color)
            .order_by(func.sum(Transaction.amount).desc())
        ).all()
    ]
    month_expr = func.to_char(Transaction.occurred_on, "YYYY-MM")
    monthly: dict[str, dict] = {}
    for month, kind, amount in db.execute(
        select(month_expr, Transaction.kind, func.sum(Transaction.amount))
        .where(*base, Transaction.occurred_on >= start)
        .group_by(month_expr, Transaction.kind)
        .order_by(month_expr)
    ).all():
        entry = monthly.setdefault(month, {"month": month, "income": 0.0, "expenses": 0.0})
        entry["income" if kind == "income" else "expenses"] = float(amount or 0)
    for entry in monthly.values():
        entry["net"] = entry["income"] - entry["expenses"]

    by_project = [
        {"name": name or "Unassigned", "amount": float(amount)}
        for name, amount in db.execute(
            select(Project.name, func.sum(Transaction.amount))
            .join(Project, Transaction.project_id == Project.id, isouter=True)
            .where(*base, Transaction.kind == "expense", Transaction.occurred_on >= start)
            .group_by(Project.name)
            .order_by(func.sum(Transaction.amount).desc())
            .limit(8)
        ).all()
    ]
    outstanding = float(db.scalar(select(func.sum(Invoice.total)).where(
        Invoice.company_id == user.company_id, Invoice.direction == "outgoing",
        Invoice.status.in_(["sent", "overdue"]), Invoice.deleted_at.is_(None))) or 0)
    overdue = float(db.scalar(select(func.sum(Invoice.total)).where(
        Invoice.company_id == user.company_id, Invoice.direction == "outgoing",
        Invoice.status.in_(["sent", "overdue"]), Invoice.due_on < today,
        Invoice.deleted_at.is_(None))) or 0)
    accounts_total = float(db.scalar(select(func.sum(FinanceAccount.balance)).where(
        FinanceAccount.company_id == user.company_id,
        FinanceAccount.deleted_at.is_(None))) or 0)
    return FinanceSummary(
        income=income, expenses=expenses, net=income - expenses, outstanding=outstanding,
        overdue=overdue, by_category=by_category,
        by_month=sorted(monthly.values(), key=lambda m: m["month"]),
        by_project=by_project, accounts_total=accounts_total,
    )


# ---------------------------------------------------------------- transactions
@router.get("/transactions")
def list_transactions(db: DbSession, user: Annotated[User, Depends(require("finance.read"))],
                      paging: Paging, q: str | None = None, kind: str | None = None,
                      project_id: uuid.UUID | None = None,
                      category_id: uuid.UUID | None = None,
                      vendor_id: uuid.UUID | None = None,
                      start: date | None = None, end: date | None = None):
    stmt = select(Transaction).where(Transaction.company_id == user.company_id,
                                     Transaction.deleted_at.is_(None))
    if q:
        stmt = stmt.where(Transaction.description.ilike(f"%{q}%"))
    if kind:
        stmt = stmt.where(Transaction.kind == kind)
    if project_id:
        stmt = stmt.where(Transaction.project_id == project_id)
    if category_id:
        stmt = stmt.where(Transaction.category_id == category_id)
    if vendor_id:
        stmt = stmt.where(Transaction.vendor_id == vendor_id)
    if start:
        stmt = stmt.where(Transaction.occurred_on >= start)
    if end:
        stmt = stmt.where(Transaction.occurred_on <= end)
    stmt = stmt.order_by(Transaction.occurred_on.desc(), Transaction.created_at.desc())
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.scalars(stmt.limit(paging.page_size).offset(paging.offset)).all()
    return as_page([transaction_out(db, t) for t in rows], total, paging)


@router.post("/transactions", response_model=TransactionOut, status_code=201)
def create_transaction(payload: TransactionIn, db: DbSession,
                       user: Annotated[User, Depends(require("finance.write"))]):
    tx = Transaction(company_id=user.company_id, created_by_id=user.id, **payload.model_dump())
    db.add(tx)
    db.flush()
    if tx.project_id:
        graph.link(db, company_id=user.company_id, from_type="project", from_id=tx.project_id,
                   rel_type="funded_by", to_type="transaction", to_id=tx.id, actor=user)
    audit.record(db, actor=user, action="created", entity_type="transaction", entity_id=tx.id,
                 summary=f"{tx.kind.title()} {float(tx.amount):,.2f} — {tx.description}",
                 changes={"amount": {"from": None, "to": float(tx.amount)}})
    return transaction_out(db, tx)


@router.get("/transactions/{transaction_id}", response_model=TransactionOut)
def get_transaction(transaction_id: uuid.UUID, db: DbSession,
                    user: Annotated[User, Depends(require("finance.read"))]):
    tx = get_or_404(db, Transaction, transaction_id, user.company_id, "Transaction")
    return transaction_out(db, tx)


@router.patch("/transactions/{transaction_id}", response_model=TransactionOut)
def update_transaction(transaction_id: uuid.UUID, payload: TransactionUpdate, db: DbSession,
                       user: Annotated[User, Depends(require("finance.write"))]):
    tx = get_or_404(db, Transaction, transaction_id, user.company_id, "Transaction")
    changes = payload.model_dump(exclude_unset=True)
    before = {k: getattr(tx, k) for k in changes}
    for field, value in changes.items():
        setattr(tx, field, value)
    diff = audit.diff(before, changes)
    if diff:
        audit.record(db, actor=user, action="updated", entity_type="transaction",
                     entity_id=tx.id, summary=f"Updated transaction {tx.description}",
                     changes=diff)
    return transaction_out(db, tx)


@router.delete("/transactions/{transaction_id}", response_model=Message)
def delete_transaction(transaction_id: uuid.UUID, db: DbSession,
                       user: Annotated[User, Depends(require("finance.manage"))]):
    tx = get_or_404(db, Transaction, transaction_id, user.company_id, "Transaction")
    tx.deleted_at = datetime.now(UTC)
    audit.record(db, actor=user, action="deleted", entity_type="transaction", entity_id=tx.id,
                 summary=f"Deleted transaction {tx.description}")
    return Message(message="Transaction deleted")


# ---------------------------------------------------------------- invoices
@router.get("/invoices")
def list_invoices(db: DbSession, user: Annotated[User, Depends(require("finance.read"))],
                  paging: Paging, q: str | None = None,
                  status: Annotated[list[str] | None, Query()] = None,
                  direction: str | None = None, customer_id: uuid.UUID | None = None):
    stmt = select(Invoice).where(Invoice.company_id == user.company_id,
                                 Invoice.deleted_at.is_(None))
    if q:
        stmt = stmt.where(or_(Invoice.number.ilike(f"%{q}%"), Invoice.notes.ilike(f"%{q}%")))
    if status:
        stmt = stmt.where(Invoice.status.in_(status))
    if direction:
        stmt = stmt.where(Invoice.direction == direction)
    if customer_id:
        stmt = stmt.where(Invoice.customer_id == customer_id)
    stmt = stmt.order_by(Invoice.issued_on.desc().nulls_last(), Invoice.created_at.desc())
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.scalars(stmt.limit(paging.page_size).offset(paging.offset)).all()
    return as_page([invoice_out(db, i) for i in rows], total, paging)


def _totals(lines: list, tax_rate: float) -> tuple[float, float]:
    subtotal = sum(float(line.get("qty", 1)) * float(line.get("unit_price", 0)) for line in lines)
    return subtotal, round(subtotal * (1 + float(tax_rate or 0)), 2)


@router.post("/invoices", response_model=InvoiceOut, status_code=201)
def create_invoice(payload: InvoiceIn, db: DbSession,
                   user: Annotated[User, Depends(require("finance.write"))]):
    count = db.scalar(select(func.count(Invoice.id)).where(
        Invoice.company_id == user.company_id)) or 0
    number = payload.number or f"INV-{date.today().year}-{count + 1:04d}"
    lines = [line.model_dump() for line in payload.lines]
    subtotal, total = _totals(lines, payload.tax_rate)
    invoice = Invoice(
        company_id=user.company_id,
        **(payload.model_dump(exclude={"lines", "number"})
           | {"number": number, "lines": lines, "subtotal": subtotal, "total": total}),
    )
    db.add(invoice)
    db.flush()
    if invoice.customer_id:
        graph.link(db, company_id=user.company_id, from_type="crm_company",
                   from_id=invoice.customer_id, rel_type="generates", to_type="invoice",
                   to_id=invoice.id, actor=user)
    if invoice.project_id:
        graph.link(db, company_id=user.company_id, from_type="project",
                   from_id=invoice.project_id, rel_type="generates", to_type="invoice",
                   to_id=invoice.id, actor=user)
    audit.record(db, actor=user, action="created", entity_type="invoice", entity_id=invoice.id,
                 summary=f"Created invoice {invoice.number} for {total:,.2f}")
    return invoice_out(db, invoice)


@router.get("/invoices/{invoice_id}", response_model=InvoiceOut)
def get_invoice(invoice_id: uuid.UUID, db: DbSession,
                user: Annotated[User, Depends(require("finance.read"))]):
    invoice = get_or_404(db, Invoice, invoice_id, user.company_id, "Invoice")
    return invoice_out(db, invoice)


@router.patch("/invoices/{invoice_id}", response_model=InvoiceOut)
def update_invoice(invoice_id: uuid.UUID, payload: InvoiceUpdate, db: DbSession,
                   user: Annotated[User, Depends(require("finance.write"))]):
    invoice = get_or_404(db, Invoice, invoice_id, user.company_id, "Invoice")
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("lines") is not None:
        changes["lines"] = [line.model_dump() if hasattr(line, "model_dump") else line
                            for line in changes["lines"]]
    before = {k: getattr(invoice, k) for k in changes}
    for field, value in changes.items():
        setattr(invoice, field, value)
    invoice.subtotal, invoice.total = _totals(invoice.lines or [], invoice.tax_rate)
    if changes.get("status") == "paid" and invoice.paid_on is None:
        invoice.paid_on = date.today()
        db.add(Transaction(
            company_id=user.company_id,
            kind="income" if invoice.direction == "outgoing" else "expense",
            description=f"Invoice {invoice.number}", amount=invoice.total,
            currency=invoice.currency, occurred_on=invoice.paid_on, status="posted",
            project_id=invoice.project_id, customer_id=invoice.customer_id,
            vendor_id=invoice.vendor_id, invoice_id=invoice.id, created_by_id=user.id,
        ))
    diff = audit.diff(before, changes)
    if diff:
        audit.record(db, actor=user, action="updated", entity_type="invoice",
                     entity_id=invoice.id, summary=f"Updated invoice {invoice.number}",
                     changes=diff)
    return invoice_out(db, invoice)


# ---------------------------------------------------------------- accounts, categories, vendors, budgets
@router.get("/accounts", response_model=list[AccountOut])
def list_accounts(db: DbSession, user: Annotated[User, Depends(require("finance.read"))]):
    rows = db.scalars(select(FinanceAccount).where(
        FinanceAccount.company_id == user.company_id,
        FinanceAccount.deleted_at.is_(None)).order_by(FinanceAccount.name)).all()
    return [AccountOut.model_validate(a) for a in rows]


@router.post("/accounts", response_model=AccountOut, status_code=201)
def create_account(payload: AccountIn, db: DbSession,
                   user: Annotated[User, Depends(require("finance.manage"))]):
    account = FinanceAccount(company_id=user.company_id, **payload.model_dump())
    db.add(account)
    db.flush()
    return AccountOut.model_validate(account)


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(db: DbSession, user: Annotated[User, Depends(require("finance.read"))],
                    kind: str | None = None):
    stmt = select(FinanceCategory).where(FinanceCategory.company_id == user.company_id)
    if kind:
        stmt = stmt.where(FinanceCategory.kind == kind)
    return [CategoryOut.model_validate(c) for c in db.scalars(stmt.order_by(FinanceCategory.name)).all()]


@router.post("/categories", response_model=CategoryOut, status_code=201)
def create_category(payload: CategoryIn, db: DbSession,
                    user: Annotated[User, Depends(require("finance.write"))]):
    category = FinanceCategory(company_id=user.company_id, **payload.model_dump())
    db.add(category)
    db.flush()
    return CategoryOut.model_validate(category)


@router.get("/vendors", response_model=list[VendorOut])
def list_vendors(db: DbSession, user: Annotated[User, Depends(require("finance.read"))],
                 q: str | None = None):
    stmt = select(Vendor).where(Vendor.company_id == user.company_id, Vendor.deleted_at.is_(None))
    if q:
        stmt = stmt.where(Vendor.name.ilike(f"%{q}%"))
    rows = db.scalars(stmt.order_by(Vendor.name)).all()
    return [
        {
            **VendorOut.model_validate(v).model_dump(exclude={"total_spend"}),
            "total_spend": float(db.scalar(select(func.sum(Transaction.amount)).where(
                Transaction.vendor_id == v.id, Transaction.kind == "expense",
                Transaction.deleted_at.is_(None))) or 0),
        }
        for v in rows
    ]


@router.post("/vendors", response_model=VendorOut, status_code=201)
def create_vendor(payload: VendorIn, db: DbSession,
                  user: Annotated[User, Depends(require("procurement.write"))]):
    vendor = Vendor(company_id=user.company_id, **payload.model_dump())
    db.add(vendor)
    db.flush()
    return {**VendorOut.model_validate(vendor).model_dump(exclude={"total_spend"}),
            "total_spend": 0.0}


@router.get("/budgets", response_model=list[BudgetOut])
def list_budgets(db: DbSession, user: Annotated[User, Depends(require("finance.read"))],
                 project_id: uuid.UUID | None = None):
    stmt = select(Budget).where(Budget.company_id == user.company_id)
    if project_id:
        stmt = stmt.where(Budget.project_id == project_id)
    rows = db.scalars(stmt.order_by(Budget.name)).all()
    out = []
    for budget in rows:
        spent = budget_spent(db, budget)
        amount = float(budget.amount)
        project = db.get(Project, budget.project_id) if budget.project_id else None
        out.append(
            {
                "id": budget.id, "name": budget.name, "amount": amount,
                "period_start": budget.period_start, "period_end": budget.period_end,
                "project_id": budget.project_id,
                "project_name": project.name if project else None,
                "department_id": budget.department_id, "category_id": budget.category_id,
                "spent": spent, "remaining": amount - spent,
                "utilisation": round(spent / amount * 100) if amount else 0,
            }
        )
    return out


@router.post("/budgets", response_model=BudgetOut, status_code=201)
def create_budget(payload: BudgetIn, db: DbSession,
                  user: Annotated[User, Depends(require("finance.write"))]):
    budget = Budget(company_id=user.company_id, **payload.model_dump())
    db.add(budget)
    db.flush()
    amount = float(budget.amount)
    return {
        "id": budget.id, "name": budget.name, "amount": amount,
        "period_start": budget.period_start, "period_end": budget.period_end,
        "project_id": budget.project_id, "project_name": None,
        "department_id": budget.department_id, "category_id": budget.category_id,
        "spent": 0.0, "remaining": amount, "utilisation": 0,
    }


# --------------------------------------------------------- recurring money
def advance(current: date, cadence: str, day_of_month: int) -> date:
    """The next occurrence after `current`, clamped to real calendar days."""
    if cadence == "weekly":
        return current + timedelta(days=7)
    months = {"monthly": 1, "quarterly": 3, "yearly": 12}.get(cadence, 1)
    month = current.month - 1 + months
    year = current.year + month // 12
    month = month % 12 + 1
    day = min(day_of_month or current.day, monthrange(year, month)[1])
    return date(year, month, day)


def recurring_out(db, row: RecurringTransaction) -> dict:
    return {
        "id": row.id, "name": row.name, "kind": row.kind, "amount": float(row.amount),
        "currency": row.currency, "cadence": row.cadence, "day_of_month": row.day_of_month,
        "starts_on": row.starts_on, "ends_on": row.ends_on, "next_run": row.next_run,
        "is_active": row.is_active, "description": row.description,
        "account_id": row.account_id, "category_id": row.category_id,
        "project_id": row.project_id, "vendor_id": row.vendor_id,
        "customer_id": row.customer_id,
        "last_posted_on": row.last_posted_on, "posted_count": row.posted_count,
        "is_due": row.is_active and row.next_run <= date.today(),
        "category": (
            {"id": c.id, "name": c.name, "color": c.color}
            if (c := db.get(FinanceCategory, row.category_id)) else None
        ),
    }


@router.get("/recurring")
def list_recurring(db: DbSession, user: Annotated[User, Depends(require("finance.read"))],
                   only_due: bool = False):
    stmt = select(RecurringTransaction).where(
        RecurringTransaction.company_id == user.company_id,
        RecurringTransaction.deleted_at.is_(None),
    )
    if only_due:
        stmt = stmt.where(RecurringTransaction.is_active.is_(True),
                          RecurringTransaction.next_run <= date.today())
    rows = db.scalars(stmt.order_by(RecurringTransaction.next_run)).all()
    due = [r for r in rows if r.is_active and r.next_run <= date.today()]
    return {
        "items": [recurring_out(db, row) for row in rows],
        "due_count": len(due),
        "due_total": round(sum(float(r.amount) for r in due), 2),
    }


@router.post("/recurring", status_code=201)
def create_recurring(payload: RecurringIn, db: DbSession,
                     user: Annotated[User, Depends(require("finance.write"))]):
    data = payload.model_dump()
    # model_dump() carries next_run=None explicitly, so setdefault never fires.
    data["next_run"] = data.get("next_run") or data["starts_on"]
    row = RecurringTransaction(company_id=user.company_id, **data)
    db.add(row)
    db.flush()
    audit.record(db, actor=user, action="created", entity_type="recurring_transaction",
                 entity_id=row.id, summary=f"Recurring {row.kind}: {row.name}")
    return recurring_out(db, row)


@router.patch("/recurring/{recurring_id}")
def update_recurring(recurring_id: uuid.UUID, payload: RecurringUpdate, db: DbSession,
                     user: Annotated[User, Depends(require("finance.write"))]):
    row = get_or_404(db, RecurringTransaction, recurring_id, user.company_id, "Schedule")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.flush()
    return recurring_out(db, row)


@router.delete("/recurring/{recurring_id}", response_model=Message)
def delete_recurring(recurring_id: uuid.UUID, db: DbSession,
                     user: Annotated[User, Depends(require("finance.write"))]):
    row = get_or_404(db, RecurringTransaction, recurring_id, user.company_id, "Schedule")
    row.deleted_at = datetime.now(UTC)
    return Message(message="Schedule removed")


@router.post("/recurring/post")
def post_due(db: DbSession, user: Annotated[User, Depends(require("finance.write"))],
             recurring_id: uuid.UUID | None = None, through: date | None = None):
    """Write the transactions a schedule owes, up to today.

    Posting is deliberate rather than automatic: a schedule that quietly writes
    rows while nobody is looking is how a ledger stops being trusted. Catching
    up a schedule that has been idle for months produces one row per missed
    period, not a single lump.
    """
    through = through or date.today()
    stmt = select(RecurringTransaction).where(
        RecurringTransaction.company_id == user.company_id,
        RecurringTransaction.deleted_at.is_(None),
        RecurringTransaction.is_active.is_(True),
        RecurringTransaction.next_run <= through,
    )
    if recurring_id:
        stmt = stmt.where(RecurringTransaction.id == recurring_id)

    created, total = [], 0.0
    for schedule in db.scalars(stmt).all():
        guard = 0
        while schedule.next_run <= through and guard < 60:
            if schedule.ends_on and schedule.next_run > schedule.ends_on:
                schedule.is_active = False
                break
            transaction = Transaction(
                company_id=user.company_id, kind=schedule.kind,
                description=schedule.description or schedule.name,
                amount=schedule.amount, currency=schedule.currency,
                occurred_on=schedule.next_run, status="posted",
                account_id=schedule.account_id, category_id=schedule.category_id,
                project_id=schedule.project_id, vendor_id=schedule.vendor_id,
                customer_id=schedule.customer_id, created_by_id=user.id,
            )
            db.add(transaction)
            created.append({"name": schedule.name, "on": schedule.next_run,
                            "amount": float(schedule.amount)})
            total += float(schedule.amount)
            schedule.last_posted_on = schedule.next_run
            schedule.posted_count += 1
            schedule.next_run = advance(schedule.next_run, schedule.cadence,
                                        schedule.day_of_month)
            guard += 1
    db.flush()
    if created:
        audit.record(db, actor=user, action="created", entity_type="transaction",
                     summary=f"Posted {len(created)} recurring transactions")
    return {"posted": len(created), "total": round(total, 2), "items": created}
