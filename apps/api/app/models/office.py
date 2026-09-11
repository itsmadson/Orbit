"""Secretariat (دبیرخانه): official letters, their letterhead, templates and numbering.

An organisation's letter register is its own thing, not a wiki page: every letter
carries a registered number produced by a formula the company controls, a date in
the company calendar, a confidentiality level, and a paper trail from draft to
signature to dispatch.
"""

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean, Date, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import OrbitBase, SoftDeleteMixin

# صادره (outgoing), وارده (incoming), داخلی (internal)
LETTER_KINDS = ["outgoing", "incoming", "internal"]
LETTER_STATUSES = [
    "draft",                # پیش‌نویس
    "awaiting_signature",   # در انتظار امضا
    "signed",               # امضا شده
    "sent",                 # ارسال شده
    "received",             # دریافت شده (incoming)
    "archived",             # بایگانی
    "void",                 # ابطال
]
CONFIDENTIALITY = ["normal", "confidential", "secret"]        # عادی، محرمانه، سری
URGENCY = ["normal", "urgent", "immediate"]                   # عادی، فوری، آنی
DELIVERY_METHODS = ["email", "post", "courier", "hand", "fax", "portal", "automation"]


class Letterhead(OrbitBase, SoftDeleteMixin):
    """The header and footer, captured once and reused by every letter."""

    __tablename__ = "letterheads"

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)

    # Identity block
    org_name: Mapped[str] = mapped_column(String(200), default="")
    org_name_secondary: Mapped[str | None] = mapped_column(String(200))
    org_subtitle: Mapped[str | None] = mapped_column(String(200))
    logo_key: Mapped[str | None] = mapped_column(String(500))
    logo_data_url: Mapped[str | None] = mapped_column(Text)

    # Pre-printed stationery: a wide, short banner across the top of the sheet
    # and another across the bottom. When set, they replace the generated blocks.
    header_image_data_url: Mapped[str | None] = mapped_column(Text)
    footer_image_data_url: Mapped[str | None] = mapped_column(Text)
    header_image_height_mm: Mapped[int] = mapped_column(Integer, default=26)
    footer_image_height_mm: Mapped[int] = mapped_column(Integer, default=16)
    header_image_full_bleed: Mapped[bool] = mapped_column(Boolean, default=True)

    # Free-form HTML overrides; when set they replace the generated blocks.
    header_html: Mapped[str | None] = mapped_column(Text)
    footer_html: Mapped[str | None] = mapped_column(Text)

    # Contact block rendered into the footer when header/footer HTML is absent
    address: Mapped[str | None] = mapped_column(String(400))
    phone: Mapped[str | None] = mapped_column(String(80))
    fax: Mapped[str | None] = mapped_column(String(80))
    email: Mapped[str | None] = mapped_column(String(160))
    website: Mapped[str | None] = mapped_column(String(160))
    postal_code: Mapped[str | None] = mapped_column(String(40))

    # Sheet setup
    paper: Mapped[str] = mapped_column(String(12), default="A4")
    margin_top_mm: Mapped[int] = mapped_column(Integer, default=38)
    margin_bottom_mm: Mapped[int] = mapped_column(Integer, default=28)
    margin_x_mm: Mapped[int] = mapped_column(Integer, default=22)
    direction: Mapped[str] = mapped_column(String(4), default="rtl")
    language: Mapped[str] = mapped_column(String(8), default="fa")
    font_family: Mapped[str] = mapped_column(String(120), default="Vazirmatn")
    font_size_pt: Mapped[int] = mapped_column(Integer, default=12)
    accent_color: Mapped[str] = mapped_column(String(16), default="#f4511e")

    # Signature / stamp images dropped onto the signature block
    signature_data_url: Mapped[str | None] = mapped_column(Text)
    stamp_data_url: Mapped[str | None] = mapped_column(Text)
    show_qr: Mapped[bool] = mapped_column(Boolean, default=True)
    show_page_numbers: Mapped[bool] = mapped_column(Boolean, default=True)


class LetterNumbering(OrbitBase):
    """The formula that mints letter numbers, plus how its counter resets.

    `pattern` is a template over the tokens documented in services/letters.py,
    e.g. "{kind}/{year}/{seq:04}" → "ص/۱۴۰۴/۰۰۱۲".
    """

    __tablename__ = "letter_numberings"

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(160), default="Default")
    is_default: Mapped[bool] = mapped_column(Boolean, default=True)
    pattern: Mapped[str] = mapped_column(String(200), default="{kind}/{year}/{seq:04}")
    prefix: Mapped[str] = mapped_column(String(40), default="")
    kind_codes: Mapped[dict] = mapped_column(
        JSONB, default=lambda: {"outgoing": "ص", "incoming": "و", "internal": "د"}
    )
    calendar: Mapped[str] = mapped_column(String(12), default="jalali")   # jalali | gregorian
    digits: Mapped[str] = mapped_column(String(8), default="fa")          # fa | en
    reset: Mapped[str] = mapped_column(String(12), default="yearly")      # yearly|monthly|never
    scope: Mapped[str] = mapped_column(String(16), default="per_kind")    # per_kind|shared
    start_at: Mapped[int] = mapped_column(Integer, default=1)
    separator: Mapped[str] = mapped_column(String(4), default="/")


class LetterSequence(OrbitBase):
    """One counter per (numbering, scope key, period key)."""

    __tablename__ = "letter_sequences"
    __table_args__ = (
        UniqueConstraint("numbering_id", "scope_key", "period_key",
                         name="uq_letter_sequences_numbering_id"),
    )

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    numbering_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("letter_numberings.id", ondelete="CASCADE"), index=True
    )
    scope_key: Mapped[str] = mapped_column(String(40), default="all")
    period_key: Mapped[str] = mapped_column(String(20), default="-")
    next_value: Mapped[int] = mapped_column(Integer, default=1)


class LetterTemplate(OrbitBase, SoftDeleteMixin):
    """A reusable skeleton: salutation, body and closing with {{placeholders}}."""

    __tablename__ = "letter_templates"

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(String(20), default="outgoing")
    language: Mapped[str] = mapped_column(String(8), default="fa")
    subject: Mapped[str | None] = mapped_column(String(300))
    salutation: Mapped[str | None] = mapped_column(String(300))
    body: Mapped[str | None] = mapped_column(Text)
    closing: Mapped[str | None] = mapped_column(String(300))
    letterhead_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("letterheads.id", ondelete="SET NULL")
    )
    variables: Mapped[list] = mapped_column(JSONB, default=list)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    usage_count: Mapped[int] = mapped_column(Integer, default=0)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )


class Letter(OrbitBase, SoftDeleteMixin):
    """One registered letter."""

    __tablename__ = "letters"
    __table_args__ = (
        Index("ix_letters_company_kind_status", "company_id", "kind", "status"),
        UniqueConstraint("company_id", "number", name="uq_letters_company_id"),
    )

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    number: Mapped[str | None] = mapped_column(String(80), index=True)
    number_seq: Mapped[int | None] = mapped_column(Integer)
    number_period: Mapped[str | None] = mapped_column(String(20))
    registered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    kind: Mapped[str] = mapped_column(String(20), default="outgoing", index=True)
    status: Mapped[str] = mapped_column(String(24), default="draft", index=True)
    confidentiality: Mapped[str] = mapped_column(String(20), default="normal")
    urgency: Mapped[str] = mapped_column(String(20), default="normal")

    subject: Mapped[str] = mapped_column(String(300), nullable=False)
    salutation: Mapped[str | None] = mapped_column(String(300))
    body: Mapped[str | None] = mapped_column(Text)          # HTML
    closing: Mapped[str | None] = mapped_column(String(300))
    letter_date: Mapped[date] = mapped_column(Date, default=date.today)

    # Correspondent — free text so external parties need no CRM record,
    # with optional links when the counterparty is known to the system.
    recipient_name: Mapped[str | None] = mapped_column(String(200))
    recipient_title: Mapped[str | None] = mapped_column(String(200))
    recipient_org: Mapped[str | None] = mapped_column(String(200))
    recipient_address: Mapped[str | None] = mapped_column(String(400))
    recipient_user_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    crm_company_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("crm_companies.id", ondelete="SET NULL"), index=True
    )
    cc: Mapped[list] = mapped_column(JSONB, default=list)

    sender_name: Mapped[str | None] = mapped_column(String(200))
    sender_title: Mapped[str | None] = mapped_column(String(200))
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    signer_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    signed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivery_method: Mapped[str | None] = mapped_column(String(20))

    # پیرو / عطف — the letter this one follows up on or answers
    in_reply_to_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("letters.id", ondelete="SET NULL"), index=True
    )
    follow_up_of: Mapped[str | None] = mapped_column(String(80))
    attachment_note: Mapped[str | None] = mapped_column(String(200))

    letterhead_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("letterheads.id", ondelete="SET NULL")
    )
    template_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("letter_templates.id", ondelete="SET NULL")
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), index=True
    )
    tags: Mapped[list] = mapped_column(JSONB, default=list)

    # Rendered artefacts, regenerated on demand and cached in storage
    pdf_key: Mapped[str | None] = mapped_column(String(500))
    docx_key: Mapped[str | None] = mapped_column(String(500))
    rendered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
