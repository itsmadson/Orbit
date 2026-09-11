import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.models.identity import User
from app.models.system import AuditLog


def record(
    db: Session,
    *,
    actor: User | None,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID | None = None,
    summary: str | None = None,
    changes: dict[str, Any] | None = None,
    company_id: uuid.UUID | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> AuditLog:
    log = AuditLog(
        company_id=company_id or (actor.company_id if actor else None),
        actor_id=actor.id if actor else None,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        summary=summary,
        changes=changes or {},
        ip_address=ip_address,
        user_agent=(user_agent or "")[:400] or None,
    )
    db.add(log)
    return log


def diff(before: dict[str, Any], after: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Field-level change set, JSON-safe, for the audit trail."""
    out: dict[str, dict[str, Any]] = {}
    for key, new_value in after.items():
        old_value = before.get(key)
        if old_value != new_value:
            out[key] = {"from": _safe(old_value), "to": _safe(new_value)}
    return out


def _safe(value: Any) -> Any:
    if isinstance(value, uuid.UUID):
        return str(value)
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if isinstance(value, (str, int, float, bool, type(None), list, dict)):
        return value
    return str(value)
