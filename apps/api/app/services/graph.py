"""The company graph: generic typed edges between any two registered entities."""

import uuid

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.errors import BadRequest
from app.models.identity import User
from app.models.system import Relation
from app.services.registry import REGISTRY, spec

# Relationship vocabulary. New verbs can be added without a migration.
RELATION_TYPES = [
    "relates_to", "creates", "contains", "assigned_to", "funded_by", "owns",
    "generates", "blocks", "derived_from", "documents", "decides", "attends",
    "delivers", "supersedes",
]

INVERSE = {
    "creates": "created_by",
    "contains": "part_of",
    "owns": "owned_by",
    "generates": "generated_by",
    "funded_by": "funds",
    "assigned_to": "assignee_of",
    "derived_from": "origin_of",
    "blocks": "blocked_by",
}


def _check(entity_type: str) -> None:
    if entity_type not in REGISTRY:
        raise BadRequest(f"Unknown entity type: {entity_type}")


def link(
    db: Session,
    *,
    company_id: uuid.UUID,
    from_type: str,
    from_id: uuid.UUID,
    rel_type: str,
    to_type: str,
    to_id: uuid.UUID,
    actor: User | None = None,
    meta: dict | None = None,
) -> Relation:
    _check(from_type)
    _check(to_type)
    existing = db.scalar(
        select(Relation).where(
            Relation.from_type == from_type,
            Relation.from_id == from_id,
            Relation.rel_type == rel_type,
            Relation.to_type == to_type,
            Relation.to_id == to_id,
        )
    )
    if existing:
        return existing
    relation = Relation(
        company_id=company_id,
        from_type=from_type,
        from_id=from_id,
        rel_type=rel_type,
        to_type=to_type,
        to_id=to_id,
        meta=meta or {},
        created_by_id=actor.id if actor else None,
    )
    db.add(relation)
    db.flush()
    return relation


def unlink(db: Session, relation_id: uuid.UUID) -> None:
    relation = db.get(Relation, relation_id)
    if relation:
        db.delete(relation)


def _resolve(db: Session, entity_type: str, entity_id: uuid.UUID) -> dict | None:
    s = spec(entity_type)
    if not s or s.model is None:
        return None
    obj = db.get(s.model, entity_id)
    if obj is None:
        return None
    status = getattr(obj, s.status_field, None) if s.status_field else None
    return {
        "type": entity_type,
        "id": str(obj.id),
        "label": s.label,
        "title": s.title_of(obj),
        "status": status,
        "url": s.url_of(obj),
        "icon": s.icon,
    }


def neighbours(
    db: Session, entity_type: str, entity_id: uuid.UUID, limit: int = 100
) -> list[dict]:
    """Edges touching an entity in either direction, resolved to display nodes."""
    _check(entity_type)
    stmt = (
        select(Relation)
        .where(
            or_(
                (Relation.from_type == entity_type) & (Relation.from_id == entity_id),
                (Relation.to_type == entity_type) & (Relation.to_id == entity_id),
            )
        )
        .limit(limit)
    )
    out: list[dict] = []
    for rel in db.scalars(stmt).all():
        outgoing = rel.from_type == entity_type and rel.from_id == entity_id
        other_type = rel.to_type if outgoing else rel.from_type
        other_id = rel.to_id if outgoing else rel.from_id
        node = _resolve(db, other_type, other_id)
        if node is None:
            continue
        out.append(
            {
                "relation_id": str(rel.id),
                "rel_type": rel.rel_type if outgoing else INVERSE.get(rel.rel_type, rel.rel_type),
                "direction": "out" if outgoing else "in",
                "node": node,
                "meta": rel.meta,
            }
        )
    return out


def subgraph(db: Session, entity_type: str, entity_id: uuid.UUID, depth: int = 2) -> dict:
    """Breadth-first expansion used by the graph explorer view."""
    root = _resolve(db, entity_type, entity_id)
    if root is None:
        return {"nodes": [], "edges": []}
    nodes: dict[str, dict] = {f"{entity_type}:{entity_id}": root}
    edges: list[dict] = []
    frontier = [(entity_type, entity_id)]
    for _ in range(max(depth, 1)):
        next_frontier: list[tuple[str, uuid.UUID]] = []
        for etype, eid in frontier:
            for item in neighbours(db, etype, eid, limit=40):
                node = item["node"]
                key = f"{node['type']}:{node['id']}"
                if key not in nodes:
                    nodes[key] = node
                    next_frontier.append((node["type"], uuid.UUID(node["id"])))
                source = f"{etype}:{eid}" if item["direction"] == "out" else key
                target = key if item["direction"] == "out" else f"{etype}:{eid}"
                edge = {"source": source, "target": target, "type": item["rel_type"]}
                if edge not in edges:
                    edges.append(edge)
        frontier = next_frontier
        if not frontier:
            break
    return {"nodes": list(nodes.values()), "edges": edges}
