"""Global search across every registered entity.

Uses PostgreSQL full-text search over the entity's searchable columns with an
ILIKE prefix match layered on top so short/partial queries still hit. Results
are filtered by the caller's permissions before they leave the service.
"""

import uuid

from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.orm import Session

from app.models.identity import User
from app.services.registry import REGISTRY, EntitySpec


def _entity_filter(spec: EntitySpec, company_id: uuid.UUID):
    model = spec.model
    clauses = []
    if hasattr(model, "company_id"):
        clauses.append(model.company_id == company_id)
    if hasattr(model, "deleted_at"):
        clauses.append(model.deleted_at.is_(None))
    return clauses


def _match(spec: EntitySpec, query: str):
    model = spec.model
    columns = [getattr(model, f) for f in spec.search_fields if hasattr(model, f)]
    if not columns:
        return None
    haystack = func.concat_ws(" ", *[func.coalesce(cast(c, String), "") for c in columns])
    fts = func.to_tsvector("simple", haystack).op("@@")(
        func.websearch_to_tsquery("simple", query)
    )
    like = or_(*[cast(c, String).ilike(f"%{query}%") for c in columns])
    return or_(fts, like)


def search(
    db: Session,
    *,
    user: User,
    query: str,
    types: list[str] | None = None,
    limit_per_type: int = 6,
    allowed: set[str] | None = None,
) -> list[dict]:
    query = (query or "").strip()
    if not query:
        return []
    results: list[dict] = []
    for key, spec in REGISTRY.items():
        if types and key not in types:
            continue
        if allowed is not None and spec.permission not in allowed:
            continue
        condition = _match(spec, query)
        if condition is None:
            continue
        stmt = (
            select(spec.model)
            .where(*_entity_filter(spec, user.company_id), condition)
            .limit(limit_per_type)
        )
        try:
            rows = db.scalars(stmt).all()
        except Exception:  # pragma: no cover - a module without searchable columns
            db.rollback()
            continue
        for obj in rows:
            title = spec.title_of(obj)
            results.append(
                {
                    "type": key,
                    "label": spec.label,
                    "id": str(obj.id),
                    "title": title,
                    "subtitle": _subtitle(spec, obj),
                    "status": getattr(obj, spec.status_field, None) if spec.status_field else None,
                    "url": spec.url_of(obj),
                    "icon": spec.icon,
                    "score": 2.0 if query.lower() in (title or "").lower() else 1.0,
                }
            )
    results.sort(key=lambda r: (-r["score"], r["title"] or ""))
    return results


def _subtitle(spec: EntitySpec, obj) -> str | None:
    for candidate in ("key", "excerpt", "email", "description", "number", "title"):
        if candidate == spec.title_field:
            continue
        value = getattr(obj, candidate, None)
        if isinstance(value, str) and value.strip():
            text = value.strip()
            return text[:120] + ("…" if len(text) > 120 else "")
    return None
