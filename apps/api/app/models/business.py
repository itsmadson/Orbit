import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import OrbitBase, SoftDeleteMixin

# ---------------------------------------------------------------- finance


class FinanceAccount(OrbitBase, SoftDeleteMixin):
    __tablename__ = "finance_accounts"

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    type: Mapped[str] = mapped_column(String(24), default="bank")  # bank|cash|card|receivable|payable
    currency: Mapped[str] = mapped_column(String(8), default="USD")
    balance: Mapped[float] = mapped_column(Numeric(16, 2), default=0)
    account_number: Mapped[str | None] = mapped_column(String(80))


class FinanceCategory(OrbitBase):
    __tablename__ = "finance_categories"
    __table_args__ = (UniqueConstraint("company_id", "name", "kind", name="uq_finance_category"),)

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), default="expense")  # expense|income
    color: Mapped[str] = mapped_column(String(16), default="#6366f1")


class Vendor(OrbitBase, SoftDeleteMixin):
    __tablename__ = "vendors"

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str | None] = mapped_column(String(200))
    phone: Mapped[str | None] = mapped_column(String(60))
    website: Mapped[str | None] = mapped_column(String(200))
    category: Mapped[str | None] = mapped_column(String(80))
    notes: Mapped[str | None] = mapped_column(Text)
    rating: Mapped[int] = mapped_column(Integer, default=3)


class Budget(OrbitBase):
    __tablename__ = "budgets"

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(16, 2), default=0)
    period_start: Mapped[date | None] = mapped_column(Date)
    period_end: Mapped[date | None] = mapped_column(Date)
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("departments.id", ondelete="CASCADE"), index=True
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("finance_categories.id", ondelete="SET NULL")
    )


class Transaction(OrbitBase, SoftDeleteMixin):
    """Income or expense line. The finance backbone of the graph."""

    __tablename__ = "transactions"

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(16), default="expense", index=True)  # expense|income
    description: Mapped[str] = mapped_column(String(300), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(16, 2), default=0)
    currency: Mapped[str] = mapped_column(String(8), default="USD")
    occurred_on: Mapped[date] = mapped_column(Date, index=True)
    status: Mapped[str] = mapped_column(String(24), default="posted")  # draft|pending|posted
    account_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("finance_accounts.id", ondelete="SET NULL")
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("finance_categories.id", ondelete="SET NULL"), index=True
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), index=True
    )
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("departments.id", ondelete="SET NULL")
    )
    vendor_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("vendors.id", ondelete="SET NULL")
    )
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("crm_companies.id", ondelete="SET NULL")
    )
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("invoices.id", ondelete="SET NULL")
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )


class Invoice(OrbitBase, SoftDeleteMixin):
    __tablename__ = "invoices"
    __table_args__ = (UniqueConstraint("company_id", "number", name="uq_invoice_number"),)

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    number: Mapped[str] = mapped_column(String(40), nullable=False)
    direction: Mapped[str] = mapped_column(String(16), default="outgoing")  # outgoing|incoming
    status: Mapped[str] = mapped_column(String(24), default="draft", index=True)
    # draft|sent|paid|overdue|void
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("crm_companies.id", ondelete="SET NULL"), index=True
    )
    vendor_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("vendors.id", ondelete="SET NULL")
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL")
    )
    contract_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("crm_contracts.id", ondelete="SET NULL")
    )
    lines: Mapped[list] = mapped_column(JSONB, default=list)  # [{description, qty, unit_price}]
    subtotal: Mapped[float] = mapped_column(Numeric(16, 2), default=0)
    tax_rate: Mapped[float] = mapped_column(Numeric(6, 3), default=0)
    total: Mapped[float] = mapped_column(Numeric(16, 2), default=0)
    currency: Mapped[str] = mapped_column(String(8), default="USD")
    issued_on: Mapped[date | None] = mapped_column(Date)
    due_on: Mapped[date | None] = mapped_column(Date, index=True)
    paid_on: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)


# ---------------------------------------------------------------- CRM


class CrmCompany(OrbitBase, SoftDeleteMixin):
    __tablename__ = "crm_companies"

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    industry: Mapped[str | None] = mapped_column(String(120))
    website: Mapped[str | None] = mapped_column(String(200))
    size: Mapped[str | None] = mapped_column(String(40))
    country: Mapped[str | None] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(24), default="lead", index=True)
    # lead|prospect|customer|churned
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    notes: Mapped[str | None] = mapped_column(Text)
    annual_value: Mapped[float | None] = mapped_column(Numeric(16, 2))


class Contact(OrbitBase, SoftDeleteMixin):
    __tablename__ = "crm_contacts"

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    crm_company_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("crm_companies.id", ondelete="CASCADE"), index=True
    )
    full_name: Mapped[str] = mapped_column(String(160), nullable=False)
    email: Mapped[str | None] = mapped_column(String(200))
    phone: Mapped[str | None] = mapped_column(String(60))
    title: Mapped[str | None] = mapped_column(String(120))
    is_primary: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[str | None] = mapped_column(Text)


class Deal(OrbitBase, SoftDeleteMixin):
    __tablename__ = "crm_deals"

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    crm_company_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("crm_companies.id", ondelete="CASCADE"), index=True
    )
    contact_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("crm_contacts.id", ondelete="SET NULL")
    )
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    stage: Mapped[str] = mapped_column(String(32), default="qualification", index=True)
    # qualification|proposal|negotiation|won|lost
    value: Mapped[float] = mapped_column(Numeric(16, 2), default=0)
    currency: Mapped[str] = mapped_column(String(8), default="USD")
    probability: Mapped[int] = mapped_column(Integer, default=50)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    expected_close: Mapped[date | None] = mapped_column(Date)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL")
    )
    notes: Mapped[str | None] = mapped_column(Text)
    # A deal with no agreed next step is how a pipeline quietly rots, so the
    # commitment and its date live on the deal itself.
    next_step: Mapped[str | None] = mapped_column(String(300))
    next_step_due: Mapped[date | None] = mapped_column(Date, index=True)
    last_activity_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class CrmActivity(OrbitBase):
    __tablename__ = "crm_activities"

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    crm_company_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("crm_companies.id", ondelete="CASCADE"), index=True
    )
    deal_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("crm_deals.id", ondelete="CASCADE")
    )
    type: Mapped[str] = mapped_column(String(24), default="note")  # call|email|meeting|note|task
    subject: Mapped[str] = mapped_column(String(300))
    body: Mapped[str | None] = mapped_column(Text)
    occurred_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )


class Contract(OrbitBase, SoftDeleteMixin):
    __tablename__ = "crm_contracts"

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    crm_company_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("crm_companies.id", ondelete="CASCADE"), index=True
    )
    deal_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("crm_deals.id", ondelete="SET NULL")
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL")
    )
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    number: Mapped[str | None] = mapped_column(String(60))
    status: Mapped[str] = mapped_column(String(24), default="draft", index=True)
    value: Mapped[float] = mapped_column(Numeric(16, 2), default=0)
    currency: Mapped[str] = mapped_column(String(8), default="USD")
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    terms: Mapped[str | None] = mapped_column(Text)


# ---------------------------------------------------------------- assets & procurement


class Asset(OrbitBase, SoftDeleteMixin):
    __tablename__ = "assets"

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    tag: Mapped[str | None] = mapped_column(String(60))
    category: Mapped[str] = mapped_column(String(40), default="laptop", index=True)
    # laptop|server|phone|vehicle|license|domain|equipment|office
    serial_number: Mapped[str | None] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(24), default="in_use", index=True)
    # in_use|available|maintenance|retired|lost
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    location: Mapped[str | None] = mapped_column(String(160))
    purchase_date: Mapped[date | None] = mapped_column(Date)
    cost: Mapped[float | None] = mapped_column(Numeric(14, 2))
    warranty_until: Mapped[date | None] = mapped_column(Date)
    vendor_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("vendors.id", ondelete="SET NULL")
    )
    notes: Mapped[str | None] = mapped_column(Text)
    maintenance: Mapped[list] = mapped_column(JSONB, default=list)  # [{date, note, cost}]


class PurchaseOrder(OrbitBase, SoftDeleteMixin):
    __tablename__ = "purchase_orders"
    __table_args__ = (UniqueConstraint("company_id", "number", name="uq_po_number"),)

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    number: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="draft", index=True)
    # draft|ordered|delivered|invoiced|paid|cancelled
    vendor_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("vendors.id", ondelete="SET NULL"), index=True
    )
    request_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("workflow_requests.id", ondelete="SET NULL")
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL")
    )
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("invoices.id", ondelete="SET NULL")
    )
    lines: Mapped[list] = mapped_column(JSONB, default=list)
    total: Mapped[float] = mapped_column(Numeric(16, 2), default=0)
    currency: Mapped[str] = mapped_column(String(8), default="USD")
    ordered_on: Mapped[date | None] = mapped_column(Date)
    expected_on: Mapped[date | None] = mapped_column(Date)
    delivered_on: Mapped[date | None] = mapped_column(Date)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )


class RecurringTransaction(OrbitBase, SoftDeleteMixin):
    """A template for money that repeats: rent, salaries, subscriptions.

    Kept as a template plus a cursor rather than rows written years ahead, so
    changing the amount does not require rewriting a future that has not
    happened yet.
    """

    __tablename__ = "recurring_transactions"

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), default="expense")
    amount: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    currency: Mapped[str] = mapped_column(String(8), default="USD")
    cadence: Mapped[str] = mapped_column(String(16), default="monthly")  # weekly|monthly|quarterly|yearly
    day_of_month: Mapped[int] = mapped_column(Integer, default=1)
    starts_on: Mapped[date] = mapped_column(Date, default=date.today)
    ends_on: Mapped[date | None] = mapped_column(Date)
    next_run: Mapped[date] = mapped_column(Date, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    account_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("finance_accounts.id", ondelete="SET NULL")
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("finance_categories.id", ondelete="SET NULL")
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL")
    )
    vendor_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("vendors.id", ondelete="SET NULL")
    )
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("crm_companies.id", ondelete="SET NULL")
    )
    description: Mapped[str | None] = mapped_column(Text)
    last_posted_on: Mapped[date | None] = mapped_column(Date)
    posted_count: Mapped[int] = mapped_column(Integer, default=0)
