import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import ORMModel, UserRef


# ------------------------------------------------------------------ finance
class AccountIn(BaseModel):
    name: str
    type: str = "bank"
    currency: str = "USD"
    balance: float = 0
    account_number: str | None = None


class AccountOut(ORMModel):
    id: uuid.UUID
    name: str
    type: str
    currency: str
    balance: float
    account_number: str | None = None


class CategoryIn(BaseModel):
    name: str
    kind: str = "expense"
    color: str = "#6366f1"


class CategoryOut(ORMModel):
    id: uuid.UUID
    name: str
    kind: str
    color: str


class VendorIn(BaseModel):
    name: str
    email: str | None = None
    phone: str | None = None
    website: str | None = None
    category: str | None = None
    notes: str | None = None
    rating: int = 3


class VendorOut(ORMModel):
    id: uuid.UUID
    name: str
    email: str | None = None
    phone: str | None = None
    website: str | None = None
    category: str | None = None
    notes: str | None = None
    rating: int
    total_spend: float = 0


class BudgetIn(BaseModel):
    name: str
    amount: float
    period_start: date | None = None
    period_end: date | None = None
    project_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None


class BudgetOut(ORMModel):
    id: uuid.UUID
    name: str
    amount: float
    period_start: date | None = None
    period_end: date | None = None
    project_id: uuid.UUID | None = None
    project_name: str | None = None
    department_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    spent: float = 0
    remaining: float = 0
    utilisation: int = 0


class TransactionIn(BaseModel):
    kind: str = "expense"
    description: str
    amount: float
    currency: str = "USD"
    occurred_on: date
    status: str = "posted"
    account_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None
    vendor_id: uuid.UUID | None = None
    customer_id: uuid.UUID | None = None
    invoice_id: uuid.UUID | None = None


class TransactionUpdate(BaseModel):
    kind: str | None = None
    description: str | None = None
    amount: float | None = None
    occurred_on: date | None = None
    status: str | None = None
    account_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None
    vendor_id: uuid.UUID | None = None
    customer_id: uuid.UUID | None = None


class TransactionOut(ORMModel):
    id: uuid.UUID
    kind: str
    description: str
    amount: float
    currency: str
    occurred_on: date
    status: str
    account_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    category_name: str | None = None
    category_color: str | None = None
    project_id: uuid.UUID | None = None
    project_name: str | None = None
    vendor_id: uuid.UUID | None = None
    vendor_name: str | None = None
    customer_id: uuid.UUID | None = None
    created_by: UserRef | None = None
    created_at: datetime


class InvoiceLine(BaseModel):
    description: str
    qty: float = 1
    unit_price: float = 0


class InvoiceIn(BaseModel):
    number: str | None = None
    direction: str = "outgoing"
    status: str = "draft"
    customer_id: uuid.UUID | None = None
    vendor_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    contract_id: uuid.UUID | None = None
    lines: list[InvoiceLine] = []
    tax_rate: float = 0
    currency: str = "USD"
    issued_on: date | None = None
    due_on: date | None = None
    notes: str | None = None


class InvoiceUpdate(BaseModel):
    status: str | None = None
    lines: list[InvoiceLine] | None = None
    tax_rate: float | None = None
    due_on: date | None = None
    paid_on: date | None = None
    notes: str | None = None
    customer_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None


class InvoiceOut(ORMModel):
    id: uuid.UUID
    number: str
    direction: str
    status: str
    customer_id: uuid.UUID | None = None
    customer_name: str | None = None
    vendor_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    project_name: str | None = None
    lines: list = []
    subtotal: float
    tax_rate: float
    total: float
    currency: str
    issued_on: date | None = None
    due_on: date | None = None
    paid_on: date | None = None
    notes: str | None = None
    created_at: datetime


class FinanceSummary(BaseModel):
    income: float = 0
    expenses: float = 0
    net: float = 0
    outstanding: float = 0
    overdue: float = 0
    by_category: list[dict] = []
    by_month: list[dict] = []
    by_project: list[dict] = []
    accounts_total: float = 0
    currency: str = "USD"


# ------------------------------------------------------------------ CRM
class CrmCompanyIn(BaseModel):
    name: str
    industry: str | None = None
    website: str | None = None
    size: str | None = None
    country: str | None = None
    status: str = "lead"
    owner_id: uuid.UUID | None = None
    notes: str | None = None
    annual_value: float | None = None


class CrmCompanyOut(ORMModel):
    id: uuid.UUID
    name: str
    industry: str | None = None
    website: str | None = None
    size: str | None = None
    country: str | None = None
    status: str
    owner: UserRef | None = None
    notes: str | None = None
    annual_value: float | None = None
    contact_count: int = 0
    open_deals: int = 0
    pipeline_value: float = 0
    created_at: datetime


class ContactIn(BaseModel):
    full_name: str
    crm_company_id: uuid.UUID | None = None
    email: str | None = None
    phone: str | None = None
    title: str | None = None
    is_primary: int = 0
    notes: str | None = None


class ContactOut(ORMModel):
    id: uuid.UUID
    full_name: str
    crm_company_id: uuid.UUID | None = None
    crm_company_name: str | None = None
    email: str | None = None
    phone: str | None = None
    title: str | None = None
    is_primary: int
    notes: str | None = None


class DealIn(BaseModel):
    title: str
    crm_company_id: uuid.UUID | None = None
    contact_id: uuid.UUID | None = None
    stage: str = "qualification"
    value: float = 0
    currency: str = "USD"
    probability: int = 50
    owner_id: uuid.UUID | None = None
    expected_close: date | None = None
    project_id: uuid.UUID | None = None
    notes: str | None = None


class DealUpdate(BaseModel):
    title: str | None = None
    stage: str | None = None
    value: float | None = None
    probability: int | None = None
    owner_id: uuid.UUID | None = None
    expected_close: date | None = None
    project_id: uuid.UUID | None = None
    notes: str | None = None


class DealOut(ORMModel):
    id: uuid.UUID
    title: str
    crm_company_id: uuid.UUID | None = None
    crm_company_name: str | None = None
    contact_id: uuid.UUID | None = None
    stage: str
    value: float
    currency: str
    probability: int
    owner: UserRef | None = None
    expected_close: date | None = None
    project_id: uuid.UUID | None = None
    notes: str | None = None
    created_at: datetime


class CrmActivityIn(BaseModel):
    crm_company_id: uuid.UUID | None = None
    deal_id: uuid.UUID | None = None
    type: str = "note"
    subject: str
    body: str | None = None
    occurred_at: datetime | None = None


class CrmActivityOut(ORMModel):
    id: uuid.UUID
    crm_company_id: uuid.UUID | None = None
    deal_id: uuid.UUID | None = None
    type: str
    subject: str
    body: str | None = None
    occurred_at: datetime | None = None
    user: UserRef | None = None
    created_at: datetime


class ContractIn(BaseModel):
    title: str
    crm_company_id: uuid.UUID | None = None
    deal_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    number: str | None = None
    status: str = "draft"
    value: float = 0
    currency: str = "USD"
    start_date: date | None = None
    end_date: date | None = None
    terms: str | None = None


class ContractOut(ORMModel):
    id: uuid.UUID
    title: str
    number: str | None = None
    crm_company_id: uuid.UUID | None = None
    crm_company_name: str | None = None
    deal_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    status: str
    value: float
    currency: str
    start_date: date | None = None
    end_date: date | None = None
    terms: str | None = None
    created_at: datetime


# ------------------------------------------------------------------ assets & procurement
class AssetIn(BaseModel):
    name: str
    tag: str | None = None
    category: str = "laptop"
    serial_number: str | None = None
    status: str = "in_use"
    owner_id: uuid.UUID | None = None
    location: str | None = None
    purchase_date: date | None = None
    cost: float | None = None
    warranty_until: date | None = None
    vendor_id: uuid.UUID | None = None
    notes: str | None = None


class AssetUpdate(AssetIn):
    name: str | None = None


class MaintenanceIn(BaseModel):
    date: date
    note: str
    cost: float | None = None


class AssetOut(ORMModel):
    id: uuid.UUID
    name: str
    tag: str | None = None
    category: str
    serial_number: str | None = None
    status: str
    owner: UserRef | None = None
    location: str | None = None
    purchase_date: date | None = None
    cost: float | None = None
    warranty_until: date | None = None
    vendor_id: uuid.UUID | None = None
    vendor_name: str | None = None
    notes: str | None = None
    maintenance: list = []
    created_at: datetime


class PurchaseOrderIn(BaseModel):
    title: str
    vendor_id: uuid.UUID | None = None
    request_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    lines: list[InvoiceLine] = []
    currency: str = "USD"
    ordered_on: date | None = None
    expected_on: date | None = None


class PurchaseOrderUpdate(BaseModel):
    title: str | None = None
    status: str | None = None
    vendor_id: uuid.UUID | None = None
    lines: list[InvoiceLine] | None = None
    ordered_on: date | None = None
    expected_on: date | None = None
    delivered_on: date | None = None


class PurchaseOrderOut(ORMModel):
    id: uuid.UUID
    number: str
    title: str
    status: str
    vendor_id: uuid.UUID | None = None
    vendor_name: str | None = None
    request_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    invoice_id: uuid.UUID | None = None
    lines: list = []
    total: float
    currency: str
    ordered_on: date | None = None
    expected_on: date | None = None
    delivered_on: date | None = None
    created_at: datetime


class NextStepIn(BaseModel):
    """The agreed next move on a deal, optionally logged as activity."""

    next_step: str = Field(min_length=1, max_length=300)
    due_on: date | None = None
    log_activity: bool = True
    activity_type: str | None = None
    activity_subject: str | None = None
    activity_body: str | None = None


class RecurringIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    kind: str = "expense"
    amount: float = Field(ge=0)
    currency: str = "USD"
    cadence: str = "monthly"
    day_of_month: int = Field(default=1, ge=1, le=31)
    starts_on: date
    ends_on: date | None = None
    next_run: date | None = None
    is_active: bool = True
    description: str | None = None
    account_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    vendor_id: uuid.UUID | None = None
    customer_id: uuid.UUID | None = None


class RecurringUpdate(BaseModel):
    name: str | None = None
    amount: float | None = None
    cadence: str | None = None
    day_of_month: int | None = None
    ends_on: date | None = None
    next_run: date | None = None
    is_active: bool | None = None
    description: str | None = None
    account_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
