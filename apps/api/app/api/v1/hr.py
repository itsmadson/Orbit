import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select

from app.api.helpers import get_or_404, user_ref
from app.core.deps import CurrentUser, DbSession, can, require
from app.core.errors import BadRequest, Forbidden
from app.core.pagination import Paging, as_page
from app.models.identity import Department, User
from app.models.people import (
    AttendanceRecord, LeaveRequest, OnboardingItem, Skill, UserSkill,
)
from app.schemas.common import Message
from app.schemas.people import (
    AttendanceIn, AttendanceOut, HrSummary, LeaveDecision, LeaveIn, LeaveOut,
    OnboardingIn, OnboardingOut, SkillIn, SkillOut, UserSkillIn, UserSkillOut,
)
from app.services import audit, notifications

router = APIRouter(prefix="/hr", tags=["hr"])


def leave_out(db, leave: LeaveRequest) -> dict:
    return {
        "id": leave.id, "user": user_ref(db.get(User, leave.user_id)), "type": leave.type,
        "start_date": leave.start_date, "end_date": leave.end_date, "days": float(leave.days),
        "reason": leave.reason, "status": leave.status,
        "approver": user_ref(db.get(User, leave.approver_id)) if leave.approver_id else None,
        "decided_at": leave.decided_at, "created_at": leave.created_at,
    }


@router.get("/summary", response_model=HrSummary)
def summary(db: DbSession, user: Annotated[User, Depends(require("hr.read"))]):
    today = date.today()
    headcount = db.scalar(select(func.count(User.id)).where(
        User.company_id == user.company_id, User.is_active.is_(True),
        User.deleted_at.is_(None))) or 0
    by_department = [
        {"name": name or "Unassigned", "count": count, "color": color or "#64748b"}
        for name, color, count in db.execute(
            select(Department.name, Department.color, func.count(User.id))
            .join(Department, User.department_id == Department.id, isouter=True)
            .where(User.company_id == user.company_id, User.is_active.is_(True),
                   User.deleted_at.is_(None))
            .group_by(Department.name, Department.color)
            .order_by(func.count(User.id).desc())
        ).all()
    ]
    by_type = [
        {"name": kind, "count": count}
        for kind, count in db.execute(
            select(User.employment_type, func.count(User.id))
            .where(User.company_id == user.company_id, User.is_active.is_(True),
                   User.deleted_at.is_(None))
            .group_by(User.employment_type)
        ).all()
    ]
    return HrSummary(
        headcount=headcount,
        departments=db.scalar(select(func.count(Department.id)).where(
            Department.company_id == user.company_id, Department.deleted_at.is_(None))) or 0,
        on_leave_today=db.scalar(select(func.count(LeaveRequest.id)).where(
            LeaveRequest.company_id == user.company_id, LeaveRequest.status == "approved",
            LeaveRequest.start_date <= today, LeaveRequest.end_date >= today)) or 0,
        pending_leave=db.scalar(select(func.count(LeaveRequest.id)).where(
            LeaveRequest.company_id == user.company_id, LeaveRequest.status == "pending")) or 0,
        new_hires_90d=db.scalar(select(func.count(User.id)).where(
            User.company_id == user.company_id, User.hired_at >= today - timedelta(days=90),
            User.deleted_at.is_(None))) or 0,
        open_onboarding=db.scalar(select(func.count(OnboardingItem.id)).where(
            OnboardingItem.company_id == user.company_id,
            OnboardingItem.status == "pending")) or 0,
        by_department=by_department, by_employment_type=by_type,
    )


# ---------------------------------------------------------------- leave
@router.get("/leave")
def list_leave(db: DbSession, user: CurrentUser, paging: Paging,
               status: str | None = None, user_id: uuid.UUID | None = None,
               mine: bool = False):
    stmt = select(LeaveRequest).where(LeaveRequest.company_id == user.company_id,
                                      LeaveRequest.deleted_at.is_(None))
    if mine or not can(db, user, "hr.read"):
        stmt = stmt.where(
            (LeaveRequest.user_id == user.id) | (LeaveRequest.approver_id == user.id)
        )
    if user_id:
        stmt = stmt.where(LeaveRequest.user_id == user_id)
    if status:
        stmt = stmt.where(LeaveRequest.status == status)
    stmt = stmt.order_by(LeaveRequest.start_date.desc())
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.scalars(stmt.limit(paging.page_size).offset(paging.offset)).all()
    return as_page([leave_out(db, leave) for leave in rows], total, paging)


@router.post("/leave", response_model=LeaveOut, status_code=201)
def request_leave(payload: LeaveIn, db: DbSession, user: CurrentUser):
    target_id = payload.user_id or user.id
    if target_id != user.id and not can(db, user, "hr.write"):
        raise Forbidden("You can only request leave for yourself")
    if payload.end_date < payload.start_date:
        raise BadRequest("End date must be on or after the start date")
    target = get_or_404(db, User, target_id, user.company_id, "User")
    days = (payload.end_date - payload.start_date).days + 1
    leave = LeaveRequest(
        company_id=user.company_id, user_id=target.id, type=payload.type,
        start_date=payload.start_date, end_date=payload.end_date, days=days,
        reason=payload.reason, approver_id=target.manager_id,
    )
    db.add(leave)
    db.flush()
    approvers = [target.manager_id] if target.manager_id else [
        u.id for u in db.scalars(select(User).where(
            User.company_id == user.company_id, User.role == "hr",
            User.is_active.is_(True))).all()
    ]
    for approver_id in approvers:
        if approver_id:
            notifications.notify(
                db, user_id=approver_id, company_id=user.company_id, type="leave_request",
                title=f"Leave request from {target.full_name}",
                body=f"{payload.type} · {payload.start_date} → {payload.end_date} ({days} days)",
                entity_type="user", entity_id=target.id, url="/hr", actor_id=user.id,
                priority="high",
            )
    audit.record(db, actor=user, action="created", entity_type="user", entity_id=target.id,
                 summary=f"Leave requested by {target.full_name} ({days} days)")
    return leave_out(db, leave)


@router.post("/leave/{leave_id}/decision", response_model=LeaveOut)
def decide_leave(leave_id: uuid.UUID, payload: LeaveDecision, db: DbSession, user: CurrentUser):
    leave = get_or_404(db, LeaveRequest, leave_id, user.company_id, "Leave request")
    if leave.approver_id != user.id and not can(db, user, "hr.write"):
        raise Forbidden("You are not the approver for this request")
    if payload.status not in ("approved", "rejected"):
        raise BadRequest("Status must be approved or rejected")
    leave.status = payload.status
    leave.approver_id = user.id
    leave.decided_at = datetime.now(UTC)
    notifications.notify(
        db, user_id=leave.user_id, company_id=user.company_id, type="leave_result",
        title=f"Your leave request was {payload.status}",
        body=payload.note, entity_type="user", entity_id=leave.user_id, url="/hr",
        actor_id=user.id, priority="high",
    )
    audit.record(db, actor=user, action=payload.status,
                 entity_type="user", entity_id=leave.user_id,
                 summary=f"Leave {payload.status} for {leave.days} days")
    if payload.status == "approved":
        cursor = leave.start_date
        while cursor <= leave.end_date:
            exists = db.scalar(select(AttendanceRecord).where(
                AttendanceRecord.user_id == leave.user_id,
                AttendanceRecord.work_date == cursor))
            if exists:
                exists.status = "leave"
                exists.hours = 0
            else:
                db.add(AttendanceRecord(company_id=user.company_id, user_id=leave.user_id,
                                        work_date=cursor, status="leave", hours=0))
            cursor += timedelta(days=1)
    return leave_out(db, leave)


# ---------------------------------------------------------------- attendance
@router.get("/attendance", response_model=list[AttendanceOut])
def list_attendance(db: DbSession, user: CurrentUser,
                    user_id: uuid.UUID | None = None,
                    start: date | None = None, end: date | None = None):
    target_id = user_id or user.id
    if target_id != user.id and not can(db, user, "hr.read"):
        raise Forbidden()
    stmt = select(AttendanceRecord).where(
        AttendanceRecord.company_id == user.company_id, AttendanceRecord.user_id == target_id)
    if start:
        stmt = stmt.where(AttendanceRecord.work_date >= start)
    if end:
        stmt = stmt.where(AttendanceRecord.work_date <= end)
    rows = db.scalars(stmt.order_by(AttendanceRecord.work_date.desc()).limit(120)).all()
    return [
        {
            "id": r.id, "user_id": r.user_id,
            "user_name": (db.get(User, r.user_id).full_name if db.get(User, r.user_id) else None),
            "work_date": r.work_date, "check_in": r.check_in, "check_out": r.check_out,
            "hours": float(r.hours), "status": r.status,
        }
        for r in rows
    ]


@router.post("/attendance/check-in", response_model=AttendanceOut)
def check_in(db: DbSession, user: CurrentUser):
    today = date.today()
    record = db.scalar(select(AttendanceRecord).where(
        AttendanceRecord.user_id == user.id, AttendanceRecord.work_date == today))
    if record is None:
        record = AttendanceRecord(company_id=user.company_id, user_id=user.id,
                                  work_date=today, status="present")
        db.add(record)
    if record.check_in is None:
        record.check_in = datetime.now(UTC)
    else:
        record.check_out = datetime.now(UTC)
        delta = record.check_out - record.check_in
        record.hours = round(delta.total_seconds() / 3600, 2)
    db.flush()
    return {
        "id": record.id, "user_id": record.user_id, "user_name": user.full_name,
        "work_date": record.work_date, "check_in": record.check_in,
        "check_out": record.check_out, "hours": float(record.hours), "status": record.status,
    }


@router.post("/attendance", response_model=AttendanceOut, status_code=201)
def record_attendance(payload: AttendanceIn, db: DbSession,
                      user: Annotated[User, Depends(require("hr.write"))]):
    target_id = payload.user_id or user.id
    record = db.scalar(select(AttendanceRecord).where(
        AttendanceRecord.user_id == target_id, AttendanceRecord.work_date == payload.work_date))
    if record is None:
        record = AttendanceRecord(company_id=user.company_id, user_id=target_id,
                                  work_date=payload.work_date)
        db.add(record)
    record.status = payload.status
    record.hours = payload.hours
    db.flush()
    target = db.get(User, target_id)
    return {
        "id": record.id, "user_id": record.user_id,
        "user_name": target.full_name if target else None,
        "work_date": record.work_date, "check_in": record.check_in,
        "check_out": record.check_out, "hours": float(record.hours), "status": record.status,
    }


# ---------------------------------------------------------------- onboarding
@router.get("/onboarding", response_model=list[OnboardingOut])
def list_onboarding(db: DbSession, user: Annotated[User, Depends(require("hr.read"))],
                    user_id: uuid.UUID | None = None, kind: str | None = None,
                    status: str | None = None):
    stmt = select(OnboardingItem).where(OnboardingItem.company_id == user.company_id)
    if user_id:
        stmt = stmt.where(OnboardingItem.user_id == user_id)
    if kind:
        stmt = stmt.where(OnboardingItem.kind == kind)
    if status:
        stmt = stmt.where(OnboardingItem.status == status)
    rows = db.scalars(stmt.order_by(OnboardingItem.order_index, OnboardingItem.created_at)).all()
    return [
        {
            "id": i.id, "user_id": i.user_id,
            "user_name": (db.get(User, i.user_id).full_name if db.get(User, i.user_id) else None),
            "kind": i.kind, "title": i.title,
            "owner": user_ref(db.get(User, i.owner_id)) if i.owner_id else None,
            "due_date": i.due_date, "status": i.status, "order_index": i.order_index,
        }
        for i in rows
    ]


@router.post("/onboarding", response_model=OnboardingOut, status_code=201)
def create_onboarding(payload: OnboardingIn, db: DbSession,
                      user: Annotated[User, Depends(require("hr.write"))]):
    item = OnboardingItem(company_id=user.company_id, **payload.model_dump())
    db.add(item)
    db.flush()
    target = db.get(User, item.user_id)
    return {
        "id": item.id, "user_id": item.user_id,
        "user_name": target.full_name if target else None, "kind": item.kind,
        "title": item.title,
        "owner": user_ref(db.get(User, item.owner_id)) if item.owner_id else None,
        "due_date": item.due_date, "status": item.status, "order_index": item.order_index,
    }


@router.patch("/onboarding/{item_id}", response_model=Message)
def update_onboarding(item_id: uuid.UUID, status: str, db: DbSession,
                      user: Annotated[User, Depends(require("hr.write"))]):
    item = get_or_404(db, OnboardingItem, item_id, user.company_id, "Onboarding item")
    item.status = status
    return Message(message="Updated")


# ---------------------------------------------------------------- skills
@router.get("/skills", response_model=list[SkillOut])
def list_skills(db: DbSession, user: CurrentUser):
    rows = db.scalars(select(Skill).where(Skill.company_id == user.company_id)
                      .order_by(Skill.name)).all()
    return [
        {
            "id": s.id, "name": s.name, "category": s.category,
            "people_count": db.scalar(select(func.count(UserSkill.id)).where(
                UserSkill.skill_id == s.id)) or 0,
        }
        for s in rows
    ]


@router.post("/skills", response_model=SkillOut, status_code=201)
def create_skill(payload: SkillIn, db: DbSession,
                 user: Annotated[User, Depends(require("hr.write"))]):
    skill = Skill(company_id=user.company_id, **payload.model_dump())
    db.add(skill)
    db.flush()
    return {"id": skill.id, "name": skill.name, "category": skill.category, "people_count": 0}


@router.post("/users/{user_id}/skills", response_model=UserSkillOut, status_code=201)
def add_user_skill(user_id: uuid.UUID, payload: UserSkillIn, db: DbSession, user: CurrentUser):
    if user_id != user.id and not can(db, user, "hr.write"):
        raise Forbidden()
    target = get_or_404(db, User, user_id, user.company_id, "User")
    skill = db.get(Skill, payload.skill_id) if payload.skill_id else None
    if skill is None and payload.name:
        skill = db.scalar(select(Skill).where(Skill.company_id == user.company_id,
                                              Skill.name == payload.name))
        if skill is None:
            skill = Skill(company_id=user.company_id, name=payload.name)
            db.add(skill)
            db.flush()
    if skill is None:
        raise BadRequest("Provide a skill_id or a name")
    link = db.scalar(select(UserSkill).where(UserSkill.user_id == target.id,
                                             UserSkill.skill_id == skill.id))
    if link is None:
        link = UserSkill(user_id=target.id, skill_id=skill.id, level=payload.level)
        db.add(link)
    else:
        link.level = payload.level
    db.flush()
    return {"id": link.id, "skill_id": skill.id, "name": skill.name,
            "category": skill.category, "level": link.level}


@router.delete("/users/{user_id}/skills/{skill_id}", response_model=Message)
def remove_user_skill(user_id: uuid.UUID, skill_id: uuid.UUID, db: DbSession,
                      user: CurrentUser):
    if user_id != user.id and not can(db, user, "hr.write"):
        raise Forbidden()
    link = db.scalar(select(UserSkill).where(UserSkill.user_id == user_id,
                                             UserSkill.skill_id == skill_id))
    if link:
        db.delete(link)
    return Message(message="Skill removed")
