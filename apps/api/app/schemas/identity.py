import uuid
from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field

from app.schemas.common import ORMModel, UserRef


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class RefreshIn(BaseModel):
    refresh_token: str


class CompanyOut(ORMModel):
    id: uuid.UUID
    name: str
    slug: str
    logo_emoji: str
    default_locale: str
    currency: str


class DepartmentOut(ORMModel):
    id: uuid.UUID
    name: str
    description: str | None = None
    color: str
    lead: UserRef | None = None
    parent_id: uuid.UUID | None = None
    member_count: int = 0


class DepartmentIn(BaseModel):
    name: str
    description: str | None = None
    color: str = "#6366f1"
    lead_id: uuid.UUID | None = None
    parent_id: uuid.UUID | None = None


class UserOut(ORMModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: str
    title: str | None = None
    department_id: uuid.UUID | None = None
    department: DepartmentOut | None = None
    manager: UserRef | None = None
    avatar_color: str
    locale: str
    theme: str
    phone: str | None = None
    location: str | None = None
    timezone: str
    employment_type: str
    hired_at: date | None = None
    is_active: bool
    bio: str | None = None
    last_login_at: datetime | None = None
    created_at: datetime


class MeOut(BaseModel):
    user: UserOut
    company: CompanyOut
    permissions: list[str]
    unread_notifications: int = 0


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str = Field(min_length=8)
    role: str = "employee"
    title: str | None = None
    department_id: uuid.UUID | None = None
    manager_id: uuid.UUID | None = None
    phone: str | None = None
    location: str | None = None
    employment_type: str = "full_time"
    hired_at: date | None = None
    salary: float | None = None


class UserUpdate(BaseModel):
    full_name: str | None = None
    role: str | None = None
    title: str | None = None
    department_id: uuid.UUID | None = None
    manager_id: uuid.UUID | None = None
    phone: str | None = None
    location: str | None = None
    timezone: str | None = None
    employment_type: str | None = None
    hired_at: date | None = None
    salary: float | None = None
    is_active: bool | None = None
    bio: str | None = None


class ProfileUpdate(BaseModel):
    full_name: str | None = None
    locale: str | None = None
    theme: str | None = None
    phone: str | None = None
    location: str | None = None
    timezone: str | None = None
    bio: str | None = None
    avatar_color: str | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class PermissionGrantIn(BaseModel):
    user_id: uuid.UUID
    permission: str
    scope_type: str = "company"
    scope_id: uuid.UUID | None = None
