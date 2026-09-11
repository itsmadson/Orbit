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
    AttendanceRecord, LeaveAdjustment, LeavePolicy, LeaveRequest, OnboardingItem,
    Skill, UserSkill,
)
from app.schemas.common import Message
from app.schemas.people import (
    AttendanceIn, AttendanceOut, HrSummary, LeaveAdjustmentIn, LeaveDecision, LeaveIn,
    LeaveOut, LeavePolicyIn,
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


# ------------------------------------------------------------------ balances
DEFAULT_POLICIES = [
    {"leave_type": "vacation", "annual_days": 28, "max_carryover": 5},
    {"leave_type": "sick", "annual_days": 10, "max_carryover": 0},
    {"leave_type": "personal", "annual_days": 3, "max_carryover": 0},
    {"leave_type": "remote", "annual_days": 0, "max_carryover": 0, "requires_approval": False},
]


def _policies(db, company_id) -> list[LeavePolicy]:
    rows = db.scalars(
        select(LeavePolicy).where(LeavePolicy.company_id == company_id)
        .order_by(LeavePolicy.leave_type)
    ).all()
    if not rows:
        # First read seeds the defaults, so the module works before anyone
        # visits settings.
        rows = [LeavePolicy(company_id=company_id, **spec) for spec in DEFAULT_POLICIES]
        db.add_all(rows)
        db.flush()
    return rows


def leave_balance(db, user: User, target: User, year: int) -> list[dict]:
    """Entitlement minus what is taken or pending, per leave type."""
    out = []
    for policy in _policies(db, target.company_id):
        taken = db.scalar(
            select(func.coalesce(func.sum(LeaveRequest.days), 0)).where(
                LeaveRequest.user_id == target.id,
                LeaveRequest.type == policy.leave_type,
                LeaveRequest.status == "approved",
                func.extract("year", LeaveRequest.start_date) == year,
            )
        ) or 0
        pending = db.scalar(
            select(func.coalesce(func.sum(LeaveRequest.days), 0)).where(
                LeaveRequest.user_id == target.id,
                LeaveRequest.type == policy.leave_type,
                LeaveRequest.status == "pending",
                func.extract("year", LeaveRequest.start_date) == year,
            )
        ) or 0
        adjustments = db.scalar(
            select(func.coalesce(func.sum(LeaveAdjustment.days), 0)).where(
                LeaveAdjustment.user_id == target.id,
                LeaveAdjustment.leave_type == policy.leave_type,
                LeaveAdjustment.year == year,
            )
        ) or 0
        entitled = float(policy.annual_days) + float(adjustments)
        out.append({
            "leave_type": policy.leave_type,
            "annual_days": float(policy.annual_days),
            "adjustments": float(adjustments),
            "entitled": entitled,
            "taken": float(taken),
            "pending": float(pending),
            # Pending counts against the balance: a day you have asked for is a
            # day you cannot also spend elsewhere.
            "remaining": round(entitled - float(taken) - float(pending), 1),
            "requires_approval": policy.requires_approval,
            "is_paid": policy.is_paid,
        })
    return out


@router.get("/leave/balance")
def my_balance(db: DbSession, user: CurrentUser, user_id: uuid.UUID | None = None,
               year: int | None = None):
    """Your own balance, or someone else's if you are allowed to see it."""
    target = user
    if user_id and user_id != user.id:
        if not can(db, user, "hr.read"):
            raise Forbidden("You can only see your own leave balance.")
        target = get_or_404(db, User, user_id, user.company_id, "User")
    year = year or date.today().year
    balances = leave_balance(db, user, target, year)
    return {
        "user": user_ref(target),
        "year": year,
        "balances": balances,
        "total_remaining": round(
            sum(b["remaining"] for b in balances if b["annual_days"] > 0), 1
        ),
    }


@router.get("/leave/policies")
def list_policies(db: DbSession, user: Annotated[User, Depends(require("hr.read"))]):
    return [
        {
            "id": p.id, "leave_type": p.leave_type, "annual_days": float(p.annual_days),
            "max_carryover": float(p.max_carryover), "accrues_monthly": p.accrues_monthly,
            "requires_approval": p.requires_approval, "is_paid": p.is_paid,
        }
        for p in _policies(db, user.company_id)
    ]


@router.patch("/leave/policies/{policy_id}")
def update_policy(policy_id: uuid.UUID, payload: LeavePolicyIn, db: DbSession,
                  user: Annotated[User, Depends(require("hr.manage"))]):
    policy = get_or_404(db, LeavePolicy, policy_id, user.company_id, "Policy")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(policy, key, value)
    db.flush()
    audit.record(db, actor=user, action="updated", entity_type="leave_policy",
                 entity_id=policy.id,
                 summary=f"{policy.leave_type}: {policy.annual_days} days a year")
    return {"id": policy.id, "leave_type": policy.leave_type,
            "annual_days": float(policy.annual_days)}


@router.post("/leave/adjustments", status_code=201)
def adjust_balance(payload: LeaveAdjustmentIn, db: DbSession,
                   user: Annotated[User, Depends(require("hr.write"))]):
    """Correct someone's balance — carryover, a bought day, a fix — with a reason."""
    target = get_or_404(db, User, payload.user_id, user.company_id, "User")
    adjustment = LeaveAdjustment(
        company_id=user.company_id, created_by_id=user.id, **payload.model_dump()
    )
    db.add(adjustment)
    db.flush()
    audit.record(db, actor=user, action="updated", entity_type="user", entity_id=target.id,
                 summary=f"Leave adjustment for {target.full_name}: "
                         f"{payload.days:+g} {payload.leave_type} days")
    notifications.notify(
        db, user_id=target.id, company_id=user.company_id, type="hr_update",
        title=f"Your {payload.leave_type} balance changed by {payload.days:+g} days",
        body=payload.reason, url="/hr", actor_id=user.id,
    )
    return {"id": adjustment.id, "days": float(adjustment.days)}
