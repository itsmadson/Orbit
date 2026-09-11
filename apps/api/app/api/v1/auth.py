from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Request
from sqlalchemy import select

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession, client_ip
from app.core.errors import Unauthorized
from app.core.rbac import role_permissions
from app.core.security import (
    create_access_token, create_refresh_token, decode_token, hash_password, verify_password,
)
from app.models.identity import Company, User, UserSession
from app.schemas.common import Message
from app.schemas.identity import (
    LoginIn, MeOut, PasswordChange, ProfileUpdate, RefreshIn, TokenPair,
)
from app.services import audit, notifications

router = APIRouter(prefix="/auth", tags=["auth"])


def _issue(db, user: User, request: Request) -> TokenPair:
    access = create_access_token(
        str(user.id), {"role": user.role, "company": str(user.company_id)}
    )
    refresh = create_refresh_token(str(user.id))
    payload = decode_token(refresh, "refresh") or {}
    db.add(
        UserSession(
            user_id=user.id,
            token_id=payload.get("jti", ""),
            user_agent=(request.headers.get("user-agent") or "")[:400],
            ip_address=client_ip(request),
            expires_at=datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_TTL_DAYS),
        )
    )
    return TokenPair(
        access_token=access,
        refresh_token=refresh,
        expires_in=settings.ACCESS_TOKEN_TTL_MINUTES * 60,
    )


@router.post("/login", response_model=TokenPair)
def login(payload: LoginIn, request: Request, db: DbSession) -> TokenPair:
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise Unauthorized("Incorrect email or password")
    if not user.is_active or user.deleted_at is not None:
        raise Unauthorized("This account is disabled")
    user.last_login_at = datetime.now(UTC)
    tokens = _issue(db, user, request)
    audit.record(
        db, actor=user, action="login", entity_type="user", entity_id=user.id,
        summary=f"{user.full_name} signed in", ip_address=client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    return tokens


@router.post("/refresh", response_model=TokenPair)
def refresh_token(payload: RefreshIn, request: Request, db: DbSession) -> TokenPair:
    data = decode_token(payload.refresh_token, "refresh")
    if not data:
        raise Unauthorized("Invalid refresh token")
    session = db.scalar(select(UserSession).where(UserSession.token_id == data.get("jti", "")))
    if session is None or session.revoked_at is not None:
        raise Unauthorized("Session has been revoked")
    user = db.get(User, data["sub"])
    if user is None or not user.is_active:
        raise Unauthorized("Account is not active")
    session.revoked_at = datetime.now(UTC)
    return _issue(db, user, request)


@router.post("/logout", response_model=Message)
def logout(payload: RefreshIn, db: DbSession) -> Message:
    data = decode_token(payload.refresh_token, "refresh")
    if data:
        session = db.scalar(select(UserSession).where(UserSession.token_id == data.get("jti", "")))
        if session and session.revoked_at is None:
            session.revoked_at = datetime.now(UTC)
    return Message(message="Signed out")


@router.get("/me", response_model=MeOut)
def me(user: CurrentUser, db: DbSession) -> MeOut:
    company = db.get(Company, user.company_id)
    from app.core.deps import granted_permissions

    permissions = sorted(role_permissions(user.role) | granted_permissions(db, user))
    return MeOut(
        user=user,
        company=company,
        permissions=permissions,
        unread_notifications=notifications.unread_count(db, user.id),
    )


@router.patch("/me", response_model=MeOut)
def update_profile(payload: ProfileUpdate, user: CurrentUser, db: DbSession) -> MeOut:
    from app.core.deps import granted_permissions

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.flush()
    company = db.get(Company, user.company_id)
    return MeOut(
        user=user,
        company=company,
        permissions=sorted(role_permissions(user.role) | granted_permissions(db, user)),
        unread_notifications=notifications.unread_count(db, user.id),
    )


@router.post("/change-password", response_model=Message)
def change_password(payload: PasswordChange, user: CurrentUser, db: DbSession, request: Request) -> Message:
    if not verify_password(payload.current_password, user.password_hash):
        raise Unauthorized("Current password is incorrect")
    user.password_hash = hash_password(payload.new_password)
    audit.record(
        db, actor=user, action="updated", entity_type="user", entity_id=user.id,
        summary="Password changed", ip_address=client_ip(request),
    )
    return Message(message="Password updated")
