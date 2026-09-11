import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select

from app.api.helpers import get_or_404, user_ref
from app.core.deps import CurrentUser, DbSession, can, granted_permissions, require
from app.core.errors import BadRequest, Conflict, Forbidden
from app.core.pagination import Paging, as_page
from app.core.rbac import (
    DOMAINS, MANAGE, READ, ROLES, WRITE, assignable_roles, can_assign_role,
    describe_roles, has_permission, role_permissions,
)
from app.core.security import hash_password
from app.core import currency
from app.models.identity import Company, Department, PermissionGrant, User
from app.models.people import UserSkill, Skill
from app.models.work import ProjectMember, Project, Task
from app.schemas.common import Message
from app.schemas.identity import (
    CompanyOut, CompanyUpdate, DepartmentIn, DepartmentOut, PermissionGrantIn,
    UserCreate, UserOut, UserUpdate,
)
from app.services import audit

router = APIRouter(tags=["people"])


def _department_out(db, dept: Department) -> dict:
    return {
        "id": dept.id,
        "name": dept.name,
        "description": dept.description,
        "color": dept.color,
        "lead": user_ref(db.get(User, dept.lead_id)) if dept.lead_id else None,
        "parent_id": dept.parent_id,
        "member_count": db.scalar(
            select(func.count(User.id)).where(
                User.department_id == dept.id, User.deleted_at.is_(None)
            )
        ) or 0,
    }


# ---------------------------------------------------------------- departments
@router.get("/departments", response_model=list[DepartmentOut])
def list_departments(db: DbSession, user: Annotated[User, Depends(require("departments.read"))]):
    rows = db.scalars(
        select(Department)
        .where(Department.company_id == user.company_id, Department.deleted_at.is_(None))
        .order_by(Department.name)
    ).all()
    return [_department_out(db, d) for d in rows]


@router.post("/departments", response_model=DepartmentOut, status_code=201)
def create_department(
    payload: DepartmentIn, db: DbSession, user: Annotated[User, Depends(require("departments.write"))]
):
    dept = Department(company_id=user.company_id, **payload.model_dump())
    db.add(dept)
    db.flush()
    audit.record(db, actor=user, action="created", entity_type="department",
                 entity_id=dept.id, summary=f"Created department {dept.name}")
    return _department_out(db, dept)


@router.patch("/departments/{department_id}", response_model=DepartmentOut)
def update_department(
    department_id: uuid.UUID, payload: DepartmentIn, db: DbSession,
    user: Annotated[User, Depends(require("departments.write"))],
):
    dept = get_or_404(db, Department, department_id, user.company_id, "Department")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(dept, field, value)
    audit.record(db, actor=user, action="updated", entity_type="department", entity_id=dept.id,
                 summary=f"Updated department {dept.name}")
    return _department_out(db, dept)


@router.delete("/departments/{department_id}", response_model=Message)
def delete_department(
    department_id: uuid.UUID, db: DbSession,
    user: Annotated[User, Depends(require("departments.manage"))],
):
    from datetime import UTC, datetime

    dept = get_or_404(db, Department, department_id, user.company_id, "Department")
    dept.deleted_at = datetime.now(UTC)
    audit.record(db, actor=user, action="deleted", entity_type="department", entity_id=dept.id,
                 summary=f"Deleted department {dept.name}")
    return Message(message="Department removed")


# ---------------------------------------------------------------- users
@router.get("/users")
def list_users(
    db: DbSession,
    user: Annotated[User, Depends(require("users.read"))],
    paging: Paging,
    q: str | None = None,
    department_id: uuid.UUID | None = None,
    role: str | None = None,
    is_active: bool | None = None,
):
    stmt = select(User).where(User.company_id == user.company_id, User.deleted_at.is_(None))
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(User.full_name.ilike(like), User.email.ilike(like), User.title.ilike(like)))
    if department_id:
        stmt = stmt.where(User.department_id == department_id)
    if role:
        stmt = stmt.where(User.role == role)
    if is_active is not None:
        stmt = stmt.where(User.is_active.is_(is_active))
    stmt = stmt.order_by(User.full_name)
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.scalars(stmt.limit(paging.page_size).offset(paging.offset)).all()
    items = [UserOut.model_validate(u).model_dump() for u in rows]
    for item, row in zip(items, rows):
        item["department"] = _department_out(db, row.department) if row.department else None
        item["manager"] = user_ref(row.manager)
    return as_page(items, total, paging)


@router.get("/users/directory")
def directory(db: DbSession, user: CurrentUser, q: str | None = None):
    """Lightweight people picker available to every authenticated user."""
    stmt = select(User).where(
        User.company_id == user.company_id, User.deleted_at.is_(None), User.is_active.is_(True)
    )
    if q:
        stmt = stmt.where(User.full_name.ilike(f"%{q}%"))
    rows = db.scalars(stmt.order_by(User.full_name).limit(200)).all()
    return [user_ref(u) for u in rows]


@router.get("/users/roles")
def list_roles(user: CurrentUser):
    """Roles with what each one actually grants, so assigning one is not a guess."""
    return {"items": describe_roles(), "assignable": assignable_roles(user.role)}


@router.get("/users/{user_id}", response_model=UserOut)
def get_user(user_id: uuid.UUID, db: DbSession, current: CurrentUser):
    if user_id != current.id and not can(db, current, "users.read"):
        raise Forbidden()
    target = get_or_404(db, User, user_id, current.company_id, "User")
    data = UserOut.model_validate(target).model_dump()
    data["department"] = _department_out(db, target.department) if target.department else None
    data["manager"] = user_ref(target.manager)
    return data


@router.get("/users/{user_id}/profile")
def user_profile(user_id: uuid.UUID, db: DbSession, current: CurrentUser):
    """Employee page: profile, skills, projects and workload."""
    target = get_or_404(db, User, user_id, current.company_id, "User")
    skills = db.execute(
        select(Skill.id, Skill.name, Skill.category, UserSkill.level)
        .join(UserSkill, UserSkill.skill_id == Skill.id)
        .where(UserSkill.user_id == target.id)
        .order_by(UserSkill.level.desc())
    ).all()
    projects = db.scalars(
        select(Project)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .where(ProjectMember.user_id == target.id, Project.deleted_at.is_(None))
        .order_by(Project.name)
    ).all()
    open_tasks = db.scalar(
        select(func.count(Task.id)).where(
            Task.assignee_id == target.id,
            Task.status.notin_(["done", "cancelled"]),
            Task.deleted_at.is_(None),
        )
    ) or 0
    done_tasks = db.scalar(
        select(func.count(Task.id)).where(
            Task.assignee_id == target.id, Task.status == "done", Task.deleted_at.is_(None)
        )
    ) or 0
    reports = db.scalars(
        select(User).where(User.manager_id == target.id, User.deleted_at.is_(None))
    ).all()
    data = UserOut.model_validate(target).model_dump()
    data["department"] = _department_out(db, target.department) if target.department else None
    data["manager"] = user_ref(target.manager)
    show_salary = can(db, current, "hr.read") or current.id == target.id
    return {
        "user": data,
        "skills": [
            {"id": str(s.id), "name": s.name, "category": s.category, "level": s.level}
            for s in skills
        ],
        "projects": [
            {"id": str(p.id), "name": p.name, "key": p.key, "color": p.color,
             "icon": p.icon, "status": p.status}
            for p in projects
        ],
        "reports": [user_ref(r) for r in reports],
        "stats": {"open_tasks": open_tasks, "done_tasks": done_tasks},
        "salary": float(target.salary) if (show_salary and target.salary) else None,
    }


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(
    payload: UserCreate, db: DbSession, user: Annotated[User, Depends(require("users.write"))]
):
    if payload.role not in ROLES:
        raise BadRequest(f"Unknown role: {payload.role}")
    # A role may not mint one senior to itself, or the account it creates
    # becomes a way around its own limits.
    if not can_assign_role(user.role, payload.role):
        raise Forbidden(
            f"Your role cannot create a {payload.role.replace('_', ' ')} account."
        )
    email = payload.email.lower()
    exists = db.scalar(
        select(User).where(User.company_id == user.company_id, User.email == email)
    )
    if exists:
        raise Conflict("A user with this email already exists")
    data = payload.model_dump(exclude={"password", "email"})
    new_user = User(
        company_id=user.company_id,
        email=email,
        password_hash=hash_password(payload.password),
        **data,
    )
    db.add(new_user)
    db.flush()
    audit.record(db, actor=user, action="created", entity_type="user", entity_id=new_user.id,
                 summary=f"Created user {new_user.full_name} ({new_user.role})")
    return UserOut.model_validate(new_user)


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: uuid.UUID, payload: UserUpdate, db: DbSession,
    user: Annotated[User, Depends(require("users.write"))],
):
    target = get_or_404(db, User, user_id, user.company_id, "User")
    changes = payload.model_dump(exclude_unset=True)
    if "role" in changes and changes["role"] not in ROLES:
        raise BadRequest(f"Unknown role: {changes['role']}")
    if "role" in changes and changes["role"] != target.role:
        if target.id == user.id:
            raise Forbidden("You cannot change your own role.")
        # Both the role being granted and the one being taken away must sit at
        # or below the actor, so nobody can demote a senior or promote past self.
        if not can_assign_role(user.role, changes["role"]):
            raise Forbidden(
                f"Your role cannot assign {changes['role'].replace('_', ' ')}."
            )
        if not can_assign_role(user.role, target.role):
            raise Forbidden("You cannot change the role of a more senior account.")
    if changes.get("is_active") is False and target.id == user.id:
        raise Forbidden("You cannot deactivate your own account.")
    if "role" in changes and target.role != changes["role"]:
        audit.record(db, actor=user, action="permission_changed", entity_type="user",
                     entity_id=target.id,
                     summary=f"Role changed for {target.full_name}",
                     changes={"role": {"from": target.role, "to": changes["role"]}})
    for field, value in changes.items():
        setattr(target, field, value)
    audit.record(db, actor=user, action="updated", entity_type="user", entity_id=target.id,
                 summary=f"Updated {target.full_name}")
    return UserOut.model_validate(target)


@router.delete("/users/{user_id}", response_model=Message)
def deactivate_user(
    user_id: uuid.UUID, db: DbSession, user: Annotated[User, Depends(require("users.manage"))]
):
    from datetime import UTC, datetime

    target = get_or_404(db, User, user_id, user.company_id, "User")
    if target.id == user.id:
        raise BadRequest("You cannot deactivate your own account")
    # Otherwise a junior role holding users.manage could lock out an admin.
    if not can_assign_role(user.role, target.role):
        raise Forbidden("You cannot deactivate a more senior account.")
    target.is_active = False
    target.deleted_at = datetime.now(UTC)
    audit.record(db, actor=user, action="deleted", entity_type="user", entity_id=target.id,
                 summary=f"Deactivated {target.full_name}")
    return Message(message="User deactivated")


@router.get("/permissions/catalogue")
def permission_catalogue(user: Annotated[User, Depends(require("settings.read"))]):
    """Every permission, and which of them the caller is able to hand out."""
    own = role_permissions(user.role)
    return {
        "domains": DOMAINS,
        "actions": [READ, WRITE, MANAGE],
        "grantable": sorted(
            f"{domain}.{action}"
            for domain in DOMAINS
            for action in (READ, WRITE, MANAGE)
            if has_permission(user.role, f"{domain}.{action}")
        ),
        "own": sorted(own),
    }


@router.get("/permissions/grants")
def list_grants(db: DbSession, user: Annotated[User, Depends(require("settings.read"))]):
    rows = db.scalars(
        select(PermissionGrant)
        .join(User, PermissionGrant.user_id == User.id)
        .where(User.company_id == user.company_id)
    ).all()
    return [
        {
            "id": str(g.id),
            "user": user_ref(db.get(User, g.user_id)),
            "permission": g.permission,
            "scope_type": g.scope_type,
            "scope_id": str(g.scope_id) if g.scope_id else None,
        }
        for g in rows
    ]


@router.post("/permissions/grants", status_code=201)
def create_grant(
    payload: PermissionGrantIn, db: DbSession,
    user: Annotated[User, Depends(require("settings.write"))],
):
    target = get_or_404(db, User, payload.user_id, user.company_id, "User")
    domain, _, action = payload.permission.partition(".")
    if domain not in DOMAINS or action not in (READ, WRITE, MANAGE):
        raise BadRequest(f"Unknown permission: {payload.permission}")
    # You cannot grant what you do not hold — otherwise settings.write becomes a
    # route to every permission, including the one company_admin is denied.
    if not has_permission(user.role, payload.permission, extra=granted_permissions(db, user)):
        raise Forbidden(f"You do not hold {payload.permission}, so you cannot grant it.")
    grant = PermissionGrant(**payload.model_dump())
    db.add(grant)
    db.flush()
    audit.record(db, actor=user, action="permission_changed", entity_type="user",
                 entity_id=target.id,
                 summary=f"Granted {payload.permission} to {target.full_name}")
    return {"id": str(grant.id)}


@router.delete("/permissions/grants/{grant_id}", response_model=Message)
def delete_grant(
    grant_id: uuid.UUID, db: DbSession, user: Annotated[User, Depends(require("settings.write"))]
):
    grant = db.get(PermissionGrant, grant_id)
    if grant:
        db.delete(grant)
    return Message(message="Grant removed")

# ------------------------------------------------------------------ company
@router.get("/currencies")
def list_currencies(user: CurrentUser):
    """The currencies a workspace may keep its books in."""
    return {"items": currency.as_dicts(), "default": currency.DEFAULT}


@router.get("/company", response_model=CompanyOut)
def get_company(db: DbSession, user: Annotated[User, Depends(require("company.read"))]):
    return db.get(Company, user.company_id)


@router.patch("/company", response_model=CompanyOut)
def update_company(payload: CompanyUpdate, db: DbSession,
                   user: Annotated[User, Depends(require("company.write"))]):
    org = db.get(Company, user.company_id)
    changes = payload.model_dump(exclude_unset=True)
    if "currency" in changes and not currency.is_supported(changes["currency"]):
        raise BadRequest(f"Unsupported currency: {changes['currency']}")
    before = {key: getattr(org, key) for key in changes}
    for key, value in changes.items():
        setattr(org, key, value)
    db.flush()
    audit.record(db, actor=user, action="updated", entity_type="company",
                 entity_id=org.id, summary=f"Updated {', '.join(changes)}",
                 changes=audit.diff(before, changes))
    return org
