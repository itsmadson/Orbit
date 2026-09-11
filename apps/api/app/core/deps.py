from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import Forbidden, Unauthorized
from app.core.rbac import has_permission
from app.core.security import decode_token
from app.models.identity import PermissionGrant, User

bearer = HTTPBearer(auto_error=False)

DbSession = Annotated[Session, Depends(get_db)]


def get_current_user(
    request: Request,
    db: DbSession,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)] = None,
) -> User:
    token = creds.credentials if creds else request.cookies.get("orbit_access")
    if not token:
        raise Unauthorized()
    payload = decode_token(token, expected_type="access")
    if not payload:
        raise Unauthorized("Invalid or expired token")
    user = db.get(User, payload["sub"])
    if user is None or not user.is_active or user.deleted_at is not None:
        raise Unauthorized("Account is not active")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def granted_permissions(db: Session, user: User) -> set[str]:
    rows = db.scalars(select(PermissionGrant).where(PermissionGrant.user_id == user.id)).all()
    return {r.permission for r in rows}


def require(permission: str) -> Callable[..., User]:
    """Dependency factory enforcing a permission for the whole request."""

    def dependency(user: CurrentUser, db: DbSession) -> User:
        if has_permission(user.role, permission):
            return user
        if has_permission(user.role, permission, granted_permissions(db, user)):
            return user
        raise Forbidden(f"Missing permission: {permission}")

    return dependency


def can(db: Session, user: User, permission: str) -> bool:
    if has_permission(user.role, permission):
        return True
    return has_permission(user.role, permission, granted_permissions(db, user))


def client_ip(request: Request) -> str | None:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else None
