"""Secretariat contracts: letterheads, numbering, templates and letters."""

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import UserRef


class LetterheadIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    is_default: bool = False
    org_name: str = ""
    org_name_secondary: str | None = None
    org_subtitle: str | None = None
    logo_data_url: str | None = None
    header_image_data_url: str | None = None
    footer_image_data_url: str | None = None
    header_image_height_mm: int = Field(default=26, ge=5, le=80)
    footer_image_height_mm: int = Field(default=16, ge=5, le=60)
    header_image_full_bleed: bool = True
    header_html: str | None = None
    footer_html: str | None = None
    address: str | None = None
    phone: str | None = None
    fax: str | None = None
    email: str | None = None
    website: str | None = None
    postal_code: str | None = None
    paper: str = "A4"
    margin_top_mm: int = Field(default=38, ge=5, le=80)
    margin_bottom_mm: int = Field(default=28, ge=5, le=80)
    margin_x_mm: int = Field(default=22, ge=5, le=60)
    direction: str = "rtl"
    language: str = "fa"
    font_family: str = "Vazirmatn"
    font_size_pt: int = Field(default=12, ge=8, le=20)
    accent_color: str = "#f4511e"
    signature_data_url: str | None = None
    stamp_data_url: str | None = None
    show_qr: bool = True
    show_page_numbers: bool = True


class LetterheadUpdate(LetterheadIn):
    name: str | None = None


class LetterheadOut(LetterheadIn):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class NumberingIn(BaseModel):
    name: str = "Default"
    is_default: bool = True
    pattern: str = "{kind}/{year}/{seq:04}"
    prefix: str = ""
    kind_codes: dict[str, str] = Field(
        default_factory=lambda: {"outgoing": "ص", "incoming": "و", "internal": "د"}
    )
    calendar: str = "jalali"
    digits: str = "fa"
    reset: str = "yearly"
    scope: str = "per_kind"
    start_at: int = Field(default=1, ge=1)
    separator: str = "/"


class NumberingUpdate(NumberingIn):
    name: str | None = None
    pattern: str | None = None


class NumberingOut(NumberingIn):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    preview: str | None = None
    tokens: dict[str, str] | None = None
    counters: list[dict] | None = None


class TemplateIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    kind: str = "outgoing"
    language: str = "fa"
    subject: str | None = None
    salutation: str | None = None
    body: str | None = None
    closing: str | None = None
    letterhead_id: uuid.UUID | None = None
    variables: list[str] = Field(default_factory=list)
    is_default: bool = False


class TemplateUpdate(TemplateIn):
    name: str | None = None


class TemplateOut(TemplateIn):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    usage_count: int = 0
    created_at: datetime


class LetterIn(BaseModel):
    subject: str = Field(min_length=1, max_length=300)
    body: str | None = None
    kind: str = "outgoing"
    salutation: str | None = None
    closing: str | None = None
    letter_date: date | None = None
    confidentiality: str = "normal"
    urgency: str = "normal"
    recipient_name: str | None = None
    recipient_title: str | None = None
    recipient_org: str | None = None
    recipient_address: str | None = None
    recipient_user_id: uuid.UUID | None = None
    crm_company_id: uuid.UUID | None = None
    cc: list[str] = Field(default_factory=list)
    sender_name: str | None = None
    sender_title: str | None = None
    signer_id: uuid.UUID | None = None
    in_reply_to_id: uuid.UUID | None = None
    follow_up_of: str | None = None
    attachment_note: str | None = None
    letterhead_id: uuid.UUID | None = None
    template_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    tags: list[str] = Field(default_factory=list)
    #: Register a number immediately instead of leaving the letter a draft.
    register_now: bool = False


class LetterUpdate(LetterIn):
    subject: str | None = None
    register_now: bool | None = None


class LetterOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    number: str | None
    kind: str
    status: str
    subject: str
    confidentiality: str
    urgency: str
    letter_date: date
    letter_date_display: str | None = None
    recipient_name: str | None
    recipient_org: str | None
    author: UserRef | None = None
    signer: UserRef | None = None
    project_id: uuid.UUID | None = None
    tags: list[str] = Field(default_factory=list)
    attachment_count: int = 0
    has_pdf: bool = False
    has_docx: bool = False
    created_at: datetime
    updated_at: datetime


class LetterDetail(LetterOut):
    body: str | None = None
    salutation: str | None = None
    closing: str | None = None
    recipient_title: str | None = None
    recipient_address: str | None = None
    recipient_user_id: uuid.UUID | None = None
    crm_company_id: uuid.UUID | None = None
    cc: list[str] = Field(default_factory=list)
    sender_name: str | None = None
    sender_title: str | None = None
    in_reply_to_id: uuid.UUID | None = None
    follow_up_of: str | None = None
    attachment_note: str | None = None
    letterhead_id: uuid.UUID | None = None
    template_id: uuid.UUID | None = None
    registered_at: datetime | None = None
    signed_at: datetime | None = None
    sent_at: datetime | None = None
    delivery_method: str | None = None
    number_seq: int | None = None


class ComposeIn(BaseModel):
    """Write a letter by supplying the text and little else."""

    text: str = Field(min_length=1, description="Plain text body; blank lines split paragraphs.")
    subject: str | None = None
    recipient_name: str | None = None
    recipient_title: str | None = None
    recipient_org: str | None = None
    template_id: uuid.UUID | None = None
    kind: str = "outgoing"
    register_now: bool = True
    variables: dict[str, str] = Field(default_factory=dict)


class SignIn(BaseModel):
    signer_id: uuid.UUID | None = None


class SendIn(BaseModel):
    delivery_method: str = "email"
    note: str | None = None


class PreviewOut(BaseModel):
    html: str
    number_preview: str | None = None
