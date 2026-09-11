"""دبیرخانه — the letter register.

Letters are drafted, registered (which mints the number), signed, sent and
archived. Every one of them can be exported as a PDF for the file or as a DOCX
for anyone who needs to keep editing it.
"""

import io
import uuid
from datetime import UTC, date, datetime
from html import escape
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, or_, select

from app.api.helpers import get_or_404, user_ref
from app.core.deps import DbSession, require
from app.core.errors import BadRequest, Conflict, OrbitError
from app.core.pagination import Paging, as_page
from app.models.identity import Company, User
from app.models.office import (
    CONFIDENTIALITY, DELIVERY_METHODS, LETTER_KINDS, LETTER_STATUSES, URGENCY,
    Letter, Letterhead, LetterNumbering, LetterSequence, LetterTemplate,
)
from app.models.system import Attachment
from app.schemas.common import Message
from app.schemas.office import (
    ComposeIn, LetterDetail, LetterIn, LetterOut, LetterUpdate, LetterheadIn,
    LetterheadOut, LetterheadUpdate, NumberingOut, NumberingUpdate, PreviewOut,
    SendIn, SignIn, TemplateIn, TemplateOut, TemplateUpdate,
)
from app.services import audit, graph, letters as svc, notifications
from app.services.storage import get_storage

router = APIRouter(tags=["letters"])


# ------------------------------------------------------------------ helpers
def _company(db, user: User) -> Company:
    return db.get(Company, user.company_id)


def _letterhead(db, user: User, letterhead_id=None) -> Letterhead | None:
    if letterhead_id:
        head = db.get(Letterhead, letterhead_id)
        if head and head.company_id == user.company_id:
            return head
    return db.scalar(
        select(Letterhead)
        .where(Letterhead.company_id == user.company_id, Letterhead.deleted_at.is_(None))
        .order_by(Letterhead.is_default.desc(), Letterhead.created_at)
    )


def letter_out(db, letter: Letter, detail: bool = False) -> dict:
    head = db.get(Letterhead, letter.letterhead_id) if letter.letterhead_id else None
    calendar = "jalali" if (head.language if head else "fa") == "fa" else "gregorian"
    data = {
        "id": letter.id, "number": letter.number, "kind": letter.kind,
        "status": letter.status, "subject": letter.subject,
        "confidentiality": letter.confidentiality, "urgency": letter.urgency,
        "letter_date": letter.letter_date,
        "letter_date_display": svc.format_letter_date(letter.letter_date, calendar),
        "recipient_name": letter.recipient_name, "recipient_org": letter.recipient_org,
        "author": user_ref(db.get(User, letter.author_id)) if letter.author_id else None,
        "signer": user_ref(db.get(User, letter.signer_id)) if letter.signer_id else None,
        "project_id": letter.project_id, "tags": letter.tags or [],
        "attachment_count": db.scalar(select(func.count(Attachment.id)).where(
            Attachment.entity_type == "letter", Attachment.entity_id == letter.id,
            Attachment.deleted_at.is_(None))) or 0,
        "has_pdf": bool(letter.pdf_key), "has_docx": bool(letter.docx_key),
        "created_at": letter.created_at, "updated_at": letter.updated_at,
    }
    if detail:
        data |= {
            "body": letter.body, "salutation": letter.salutation, "closing": letter.closing,
            "recipient_title": letter.recipient_title,
            "recipient_address": letter.recipient_address,
            "recipient_user_id": letter.recipient_user_id,
            "crm_company_id": letter.crm_company_id, "cc": letter.cc or [],
            "sender_name": letter.sender_name, "sender_title": letter.sender_title,
            "in_reply_to_id": letter.in_reply_to_id, "follow_up_of": letter.follow_up_of,
            "attachment_note": letter.attachment_note,
            "letterhead_id": letter.letterhead_id, "template_id": letter.template_id,
            "registered_at": letter.registered_at, "signed_at": letter.signed_at,
            "sent_at": letter.sent_at, "delivery_method": letter.delivery_method,
            "number_seq": letter.number_seq,
        }
    return data


def _register(db, letter: Letter, user: User) -> None:
    """Mint and attach the registered number. Idempotent."""
    if letter.number:
        return
    numbering = svc.default_numbering(db, user.company_id)
    if numbering is None:
        numbering = LetterNumbering(company_id=user.company_id)
        db.add(numbering)
        db.flush()
    dept_code = ""
    if user.department_id:
        from app.models.identity import Department

        dept = db.get(Department, user.department_id)
        dept_code = (dept.name[:3].upper() if dept else "")
    number, seq, period = svc.allocate_number(
        db, numbering=numbering, kind=letter.kind, when=letter.letter_date,
        dept_code=dept_code,
    )
    letter.number = number
    letter.number_seq = seq
    letter.number_period = period
    letter.registered_at = datetime.now(UTC)
    if letter.status == "draft":
        letter.status = "awaiting_signature" if letter.kind != "incoming" else "received"


def _rendered(db, letter: Letter, user: User) -> tuple[str, Letterhead | None, Company]:
    company = _company(db, user)
    head = _letterhead(db, user, letter.letterhead_id)
    author = db.get(User, letter.author_id) if letter.author_id else None
    signer = db.get(User, letter.signer_id) if letter.signer_id else None
    html = svc.letter_html(letter, head, company, author=author, signer=signer)
    return html, head, company


# --------------------------------------------------------------- letterheads
@router.get("/letterheads", response_model=list[LetterheadOut])
def list_letterheads(db: DbSession, user: Annotated[User, Depends(require("letters.read"))]):
    return db.scalars(
        select(Letterhead)
        .where(Letterhead.company_id == user.company_id, Letterhead.deleted_at.is_(None))
        .order_by(Letterhead.is_default.desc(), Letterhead.name)
    ).all()


@router.post("/letterheads", response_model=LetterheadOut, status_code=201)
def create_letterhead(payload: LetterheadIn, db: DbSession,
                      user: Annotated[User, Depends(require("letters.write"))]):
    if payload.is_default:
        db.query(Letterhead).filter(Letterhead.company_id == user.company_id).update(
            {"is_default": False})
    head = Letterhead(company_id=user.company_id, **payload.model_dump())
    db.add(head)
    db.flush()
    audit.record(db, actor=user, action="created", entity_type="letterhead",
                 entity_id=head.id, summary=f"Created letterhead {head.name}")
    return head


@router.patch("/letterheads/{letterhead_id}", response_model=LetterheadOut)
def update_letterhead(letterhead_id: uuid.UUID, payload: LetterheadUpdate, db: DbSession,
                      user: Annotated[User, Depends(require("letters.write"))]):
    head = get_or_404(db, Letterhead, letterhead_id, user.company_id)
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("is_default"):
        db.query(Letterhead).filter(Letterhead.company_id == user.company_id,
                                    Letterhead.id != head.id).update({"is_default": False})
    for key, value in changes.items():
        setattr(head, key, value)
    db.flush()
    audit.record(db, actor=user, action="updated", entity_type="letterhead",
                 entity_id=head.id, summary=f"Updated letterhead {head.name}")
    return head


@router.delete("/letterheads/{letterhead_id}", response_model=Message)
def delete_letterhead(letterhead_id: uuid.UUID, db: DbSession,
                      user: Annotated[User, Depends(require("letters.manage"))]):
    head = get_or_404(db, Letterhead, letterhead_id, user.company_id)
    head.deleted_at = datetime.now(UTC)
    return {"message": "Letterhead deleted"}


# ----------------------------------------------------------------- numbering
def numbering_out(db, numbering: LetterNumbering) -> dict:
    counters = db.scalars(
        select(LetterSequence).where(LetterSequence.numbering_id == numbering.id)
        .order_by(LetterSequence.period_key.desc(), LetterSequence.scope_key)
    ).all()
    data = {c: getattr(numbering, c) for c in (
        "id", "name", "is_default", "pattern", "prefix", "kind_codes", "calendar",
        "digits", "reset", "scope", "start_at", "separator")}
    data |= {
        "preview": svc.preview_number(numbering),
        "tokens": svc.NUMBER_TOKENS,
        "counters": [
            {"scope": c.scope_key, "period": c.period_key, "next": c.next_value}
            for c in counters
        ],
    }
    return data


@router.get("/letter-numbering", response_model=NumberingOut)
def get_numbering(db: DbSession, user: Annotated[User, Depends(require("letters.read"))]):
    numbering = svc.default_numbering(db, user.company_id)
    if numbering is None:
        numbering = LetterNumbering(company_id=user.company_id)
        db.add(numbering)
        db.flush()
    return numbering_out(db, numbering)


@router.patch("/letter-numbering", response_model=NumberingOut)
def update_numbering(payload: NumberingUpdate, db: DbSession,
                     user: Annotated[User, Depends(require("letters.manage"))]):
    numbering = svc.default_numbering(db, user.company_id)
    if numbering is None:
        numbering = LetterNumbering(company_id=user.company_id)
        db.add(numbering)
        db.flush()
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(numbering, key, value)
    db.flush()
    audit.record(db, actor=user, action="updated", entity_type="letter_numbering",
                 entity_id=numbering.id, summary=f"Letter numbering pattern set to {numbering.pattern}")
    return numbering_out(db, numbering)


@router.get("/letter-numbering/preview")
def preview_numbering(db: DbSession, user: Annotated[User, Depends(require("letters.read"))],
                      pattern: str | None = None, kind: str = "outgoing",
                      calendar: str | None = None, digits: str | None = None,
                      prefix: str | None = None, seq: int = 12):
    """Show what a pattern would produce before it is saved."""
    numbering = svc.default_numbering(db, user.company_id) or LetterNumbering(
        company_id=user.company_id)
    candidate = LetterNumbering(
        company_id=user.company_id,
        pattern=pattern or numbering.pattern,
        prefix=prefix if prefix is not None else numbering.prefix,
        kind_codes=numbering.kind_codes,
        calendar=calendar or numbering.calendar,
        digits=digits or numbering.digits,
        separator=numbering.separator,
    )
    return {
        "preview": svc.preview_number(candidate, kind=kind, seq=seq),
        "samples": [
            {"kind": k, "value": svc.preview_number(candidate, kind=k, seq=s)}
            for k, s in (("outgoing", 1), ("incoming", 7), ("internal", 128))
        ],
    }


# ----------------------------------------------------------------- templates
@router.get("/letter-templates", response_model=list[TemplateOut])
def list_templates(db: DbSession, user: Annotated[User, Depends(require("letters.read"))],
                   kind: str | None = None):
    stmt = select(LetterTemplate).where(LetterTemplate.company_id == user.company_id,
                                        LetterTemplate.deleted_at.is_(None))
    if kind:
        stmt = stmt.where(LetterTemplate.kind == kind)
    return db.scalars(stmt.order_by(LetterTemplate.is_default.desc(),
                                    LetterTemplate.usage_count.desc(),
                                    LetterTemplate.name)).all()


@router.post("/letter-templates", response_model=TemplateOut, status_code=201)
def create_template(payload: TemplateIn, db: DbSession,
                    user: Annotated[User, Depends(require("letters.write"))]):
    template = LetterTemplate(company_id=user.company_id, created_by_id=user.id,
                              **payload.model_dump())
    db.add(template)
    db.flush()
    audit.record(db, actor=user, action="created", entity_type="letter_template",
                 entity_id=template.id, summary=f"Created letter template {template.name}")
    return template


@router.patch("/letter-templates/{template_id}", response_model=TemplateOut)
def update_template(template_id: uuid.UUID, payload: TemplateUpdate, db: DbSession,
                    user: Annotated[User, Depends(require("letters.write"))]):
    template = get_or_404(db, LetterTemplate, template_id, user.company_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(template, key, value)
    db.flush()
    return template


@router.delete("/letter-templates/{template_id}", response_model=Message)
def delete_template(template_id: uuid.UUID, db: DbSession,
                    user: Annotated[User, Depends(require("letters.write"))]):
    template = get_or_404(db, LetterTemplate, template_id, user.company_id)
    template.deleted_at = datetime.now(UTC)
    return {"message": "Template deleted"}


# ------------------------------------------------------------------- letters
@router.get("/letters")
def list_letters(db: DbSession, user: Annotated[User, Depends(require("letters.read"))],
                 paging: Paging, q: str | None = None,
                 kind: Annotated[list[str] | None, Query()] = None,
                 status: Annotated[list[str] | None, Query()] = None,
                 confidentiality: str | None = None,
                 project_id: uuid.UUID | None = None,
                 mine: bool = False,
                 year: str | None = None):
    stmt = select(Letter).where(Letter.company_id == user.company_id,
                                Letter.deleted_at.is_(None))
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Letter.subject.ilike(like), Letter.number.ilike(like),
                              Letter.body.ilike(like), Letter.recipient_name.ilike(like),
                              Letter.recipient_org.ilike(like)))
    if kind:
        stmt = stmt.where(Letter.kind.in_(kind))
    if status:
        stmt = stmt.where(Letter.status.in_(status))
    if confidentiality:
        stmt = stmt.where(Letter.confidentiality == confidentiality)
    if project_id:
        stmt = stmt.where(Letter.project_id == project_id)
    if mine:
        stmt = stmt.where(Letter.author_id == user.id)
    if year:
        stmt = stmt.where(Letter.number_period.startswith(year))
    stmt = stmt.order_by(Letter.registered_at.desc().nulls_last(), Letter.created_at.desc())
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.scalars(stmt.limit(paging.page_size).offset(paging.offset)).all()
    return as_page([letter_out(db, row) for row in rows], total, paging)


@router.get("/letters/stats")
def letter_stats(db: DbSession, user: Annotated[User, Depends(require("letters.read"))]):
    base = select(func.count(Letter.id)).where(Letter.company_id == user.company_id,
                                               Letter.deleted_at.is_(None))
    by_kind = {
        k: db.scalar(base.where(Letter.kind == k)) or 0 for k in LETTER_KINDS
    }
    by_status = {
        s: db.scalar(base.where(Letter.status == s)) or 0 for s in LETTER_STATUSES
    }
    numbering = svc.default_numbering(db, user.company_id)
    return {
        "total": db.scalar(base) or 0,
        "by_kind": by_kind,
        "by_status": by_status,
        "drafts": by_status.get("draft", 0),
        "awaiting_signature": by_status.get("awaiting_signature", 0),
        "next_number": svc.preview_number(numbering) if numbering else None,
    }


@router.post("/letters", response_model=LetterDetail, status_code=201)
def create_letter(payload: LetterIn, db: DbSession,
                  user: Annotated[User, Depends(require("letters.write"))]):
    data = payload.model_dump(exclude={"register_now"})
    data["letter_date"] = data.get("letter_date") or date.today()
    if data.get("kind") not in LETTER_KINDS:
        raise BadRequest(f"Unknown letter kind: {data.get('kind')}")
    if data.get("confidentiality") not in CONFIDENTIALITY:
        raise BadRequest("Unknown confidentiality level")
    if data.get("urgency") not in URGENCY:
        raise BadRequest("Unknown urgency level")

    head = _letterhead(db, user, data.get("letterhead_id"))
    letter = Letter(company_id=user.company_id, author_id=user.id, **data)
    if head and not letter.letterhead_id:
        letter.letterhead_id = head.id
    if not letter.sender_name:
        letter.sender_name = user.full_name
        letter.sender_title = user.title
    db.add(letter)
    db.flush()

    if payload.register_now:
        _register(db, letter, user)

    if letter.template_id:
        template = db.get(LetterTemplate, letter.template_id)
        if template:
            template.usage_count += 1
    if letter.project_id:
        graph.link(db, company_id=user.company_id, from_type="letter", from_id=letter.id,
                   rel_type="relates_to", to_type="project", to_id=letter.project_id)
    if letter.crm_company_id:
        graph.link(db, company_id=user.company_id, from_type="letter", from_id=letter.id,
                   rel_type="relates_to", to_type="crm_company", to_id=letter.crm_company_id)
    if letter.in_reply_to_id:
        graph.link(db, company_id=user.company_id, from_type="letter", from_id=letter.id,
                   rel_type="relates_to", to_type="letter", to_id=letter.in_reply_to_id)

    audit.record(db, actor=user, action="created", entity_type="letter",
                 entity_id=letter.id, summary=f"Created letter {letter.number or '(draft)'}: {letter.subject}")
    db.flush()
    return letter_out(db, letter, detail=True)


@router.post("/letters/compose", response_model=LetterDetail, status_code=201)
def compose_letter(payload: ComposeIn, db: DbSession,
                   user: Annotated[User, Depends(require("letters.write"))]):
    """Write a letter from plain text: the template and letterhead supply the rest."""
    template = None
    if payload.template_id:
        template = get_or_404(db, LetterTemplate, payload.template_id, user.company_id)
    else:
        template = db.scalar(
            select(LetterTemplate).where(
                LetterTemplate.company_id == user.company_id,
                LetterTemplate.kind == payload.kind,
                LetterTemplate.deleted_at.is_(None),
            ).order_by(LetterTemplate.is_default.desc(), LetterTemplate.usage_count.desc())
        )

    paragraphs = [p.strip() for p in payload.text.split("\n\n") if p.strip()]
    body_html = "".join(f"<p>{escape(p)}</p>" for p in paragraphs)

    head = _letterhead(db, user, template.letterhead_id if template else None)
    variables = dict(payload.variables)
    variables.setdefault("recipient", payload.recipient_name or "")
    variables.setdefault("recipient_title", payload.recipient_title or "")
    variables.setdefault("recipient_org", payload.recipient_org or "")
    variables.setdefault("sender", user.full_name)
    variables.setdefault("sender_title", user.title or "")

    letter = Letter(
        company_id=user.company_id, author_id=user.id, kind=payload.kind,
        subject=payload.subject or svc.fill(template.subject if template else None, variables)
        or (paragraphs[0][:120] if paragraphs else "بدون موضوع"),
        salutation=svc.fill(template.salutation if template else None, variables)
        or (f"جناب آقای/سرکار خانم {payload.recipient_name}" if payload.recipient_name else None),
        body=svc.fill(template.body, variables) + body_html if template and template.body
        else body_html,
        closing=svc.fill(template.closing if template else None, variables) or "با تشکر",
        recipient_name=payload.recipient_name, recipient_title=payload.recipient_title,
        recipient_org=payload.recipient_org,
        sender_name=user.full_name, sender_title=user.title,
        letterhead_id=head.id if head else None,
        template_id=template.id if template else None,
        letter_date=date.today(),
    )
    db.add(letter)
    db.flush()
    if template:
        template.usage_count += 1
    if payload.register_now:
        _register(db, letter, user)
    audit.record(db, actor=user, action="created", entity_type="letter",
                 entity_id=letter.id, summary=f"Composed letter {letter.number or '(draft)'}: {letter.subject}")
    db.flush()
    return letter_out(db, letter, detail=True)


@router.get("/letters/{letter_id}", response_model=LetterDetail)
def get_letter(letter_id: uuid.UUID, db: DbSession,
               user: Annotated[User, Depends(require("letters.read"))]):
    letter = get_or_404(db, Letter, letter_id, user.company_id)
    return letter_out(db, letter, detail=True)


@router.patch("/letters/{letter_id}", response_model=LetterDetail)
def update_letter(letter_id: uuid.UUID, payload: LetterUpdate, db: DbSession,
                  user: Annotated[User, Depends(require("letters.write"))]):
    letter = get_or_404(db, Letter, letter_id, user.company_id)
    if letter.status in ("sent", "archived"):
        raise Conflict("A sent or archived letter cannot be edited; issue a new one.")
    changes = payload.model_dump(exclude_unset=True, exclude={"register_now"})
    for key, value in changes.items():
        setattr(letter, key, value)
    if payload.register_now:
        _register(db, letter, user)
    # The cached artefacts no longer match the content.
    letter.pdf_key = letter.docx_key = None
    letter.rendered_at = None
    db.flush()
    audit.record(db, actor=user, action="updated", entity_type="letter",
                 entity_id=letter.id, summary=f"Updated letter {letter.number or '(draft)'}")
    return letter_out(db, letter, detail=True)


@router.post("/letters/{letter_id}/register", response_model=LetterDetail)
def register_letter(letter_id: uuid.UUID, db: DbSession,
                    user: Annotated[User, Depends(require("letters.write"))]):
    letter = get_or_404(db, Letter, letter_id, user.company_id)
    if letter.number:
        raise Conflict(f"This letter already carries number {letter.number}.")
    _register(db, letter, user)
    db.flush()
    audit.record(db, actor=user, action="registered", entity_type="letter",
                 entity_id=letter.id, summary=f"Registered letter {letter.number}")
    if letter.signer_id and letter.signer_id != user.id:
        notifications.notify(
            db, company_id=user.company_id, user_id=letter.signer_id,
            type="approval_request", title=f"نامه {letter.number} در انتظار امضای شماست",
            body=letter.subject, url=f"/letters/{letter.id}", actor_id=user.id,
        )
    return letter_out(db, letter, detail=True)


@router.post("/letters/{letter_id}/sign", response_model=LetterDetail)
def sign_letter(letter_id: uuid.UUID, payload: SignIn, db: DbSession,
                user: Annotated[User, Depends(require("letters.write"))]):
    letter = get_or_404(db, Letter, letter_id, user.company_id)
    if not letter.number:
        _register(db, letter, user)
    letter.signer_id = payload.signer_id or letter.signer_id or user.id
    letter.signed_at = datetime.now(UTC)
    letter.status = "signed"
    letter.pdf_key = letter.docx_key = None
    db.flush()
    audit.record(db, actor=user, action="approved", entity_type="letter",
                 entity_id=letter.id, summary=f"Signed letter {letter.number}")
    if letter.author_id and letter.author_id != user.id:
        notifications.notify(
            db, company_id=user.company_id, user_id=letter.author_id,
            type="approval_decision", title=f"نامه {letter.number} امضا شد",
            body=letter.subject, url=f"/letters/{letter.id}", actor_id=user.id,
        )
    return letter_out(db, letter, detail=True)


@router.post("/letters/{letter_id}/send", response_model=LetterDetail)
def send_letter(letter_id: uuid.UUID, payload: SendIn, db: DbSession,
                user: Annotated[User, Depends(require("letters.write"))]):
    letter = get_or_404(db, Letter, letter_id, user.company_id)
    if payload.delivery_method not in DELIVERY_METHODS:
        raise BadRequest("Unknown delivery method")
    if not letter.number:
        _register(db, letter, user)
    letter.delivery_method = payload.delivery_method
    letter.sent_at = datetime.now(UTC)
    letter.status = "sent"
    db.flush()
    audit.record(db, actor=user, action="status_changed", entity_type="letter",
                 entity_id=letter.id, summary=f"Sent letter {letter.number} by {payload.delivery_method}")
    return letter_out(db, letter, detail=True)


@router.post("/letters/{letter_id}/archive", response_model=LetterDetail)
def archive_letter(letter_id: uuid.UUID, db: DbSession,
                   user: Annotated[User, Depends(require("letters.write"))]):
    letter = get_or_404(db, Letter, letter_id, user.company_id)
    letter.status = "archived"
    db.flush()
    return letter_out(db, letter, detail=True)


@router.delete("/letters/{letter_id}", response_model=Message)
def delete_letter(letter_id: uuid.UUID, db: DbSession,
                  user: Annotated[User, Depends(require("letters.write"))]):
    letter = get_or_404(db, Letter, letter_id, user.company_id)
    if letter.number and letter.status not in ("draft", "void"):
        raise Conflict(
            "A registered letter is part of the record: void it instead of deleting.")
    letter.deleted_at = datetime.now(UTC)
    audit.record(db, actor=user, action="deleted", entity_type="letter",
                 entity_id=letter.id, summary=f"Deleted letter {letter.subject}")
    return {"message": "Letter deleted"}


@router.post("/letters/{letter_id}/void", response_model=LetterDetail)
def void_letter(letter_id: uuid.UUID, db: DbSession,
                user: Annotated[User, Depends(require("letters.manage"))]):
    """Cancel a registered letter without reusing or freeing its number."""
    letter = get_or_404(db, Letter, letter_id, user.company_id)
    letter.status = "void"
    db.flush()
    audit.record(db, actor=user, action="status_changed", entity_type="letter",
                 entity_id=letter.id, summary=f"Voided letter {letter.number}")
    return letter_out(db, letter, detail=True)


# ------------------------------------------------------------------- exports
@router.get("/letters/{letter_id}/preview", response_model=PreviewOut)
def preview_letter(letter_id: uuid.UUID, db: DbSession,
                   user: Annotated[User, Depends(require("letters.read"))]):
    letter = get_or_404(db, Letter, letter_id, user.company_id)
    html, _, _ = _rendered(db, letter, user)
    numbering = svc.default_numbering(db, user.company_id)
    return {
        "html": html,
        "number_preview": letter.number or (
            svc.preview_number(numbering, kind=letter.kind) if numbering else None),
    }


@router.get("/letters/{letter_id}/pdf")
def letter_pdf(letter_id: uuid.UUID, db: DbSession,
               user: Annotated[User, Depends(require("letters.read"))],
               download: bool = True):
    letter = get_or_404(db, Letter, letter_id, user.company_id)
    html, _, _ = _rendered(db, letter, user)
    try:
        pdf = svc.render_pdf(html)
    except OSError as exc:  # missing native libs on a stripped image
        raise OrbitError(
            f"PDF rendering is unavailable in this deployment: {exc}", 503) from exc

    key = svc.artifact_key(letter, "pdf")
    get_storage().save(key, io.BytesIO(pdf))
    letter.pdf_key = key
    svc.mark_rendered(letter)
    db.flush()

    disposition = svc.download_filename(letter, "pdf")
    if not download:
        disposition = disposition.replace("attachment;", "inline;", 1)
    return Response(
        content=pdf, media_type="application/pdf",
        headers={"content-disposition": disposition},
    )


@router.get("/letters/{letter_id}/docx")
def letter_docx(letter_id: uuid.UUID, db: DbSession,
                user: Annotated[User, Depends(require("letters.read"))]):
    letter = get_or_404(db, Letter, letter_id, user.company_id)
    company = _company(db, user)
    head = _letterhead(db, user, letter.letterhead_id)
    author = db.get(User, letter.author_id) if letter.author_id else None
    signer = db.get(User, letter.signer_id) if letter.signer_id else None
    blob = svc.render_docx(letter, head, company, author=author, signer=signer)

    key = svc.artifact_key(letter, "docx")
    get_storage().save(key, io.BytesIO(blob))
    letter.docx_key = key
    svc.mark_rendered(letter)
    db.flush()

    return Response(
        content=blob,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"content-disposition": svc.download_filename(letter, "docx")},
    )
