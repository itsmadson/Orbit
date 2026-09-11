import uuid
from datetime import UTC, date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select

from app.api.helpers import get_or_404, user_ref
from app.core.deps import DbSession, require
from app.core.pagination import Paging, as_page
from app.models.business import Asset, Invoice, PurchaseOrder, Transaction, Vendor
from app.models.identity import User
from app.models.ops import WorkflowRequest
from app.schemas.business import (
    AssetIn, AssetOut, AssetUpdate, MaintenanceIn, PurchaseOrderIn, PurchaseOrderOut,
    PurchaseOrderUpdate,
)
from app.schemas.common import Message
from app.services import audit, graph, notifications

router = APIRouter(tags=["assets"])


def asset_out(db, asset: Asset) -> dict:
    vendor = db.get(Vendor, asset.vendor_id) if asset.vendor_id else None
    return {
        "id": asset.id, "name": asset.name, "tag": asset.tag, "category": asset.category,
        "serial_number": asset.serial_number, "status": asset.status,
        "owner": user_ref(db.get(User, asset.owner_id)) if asset.owner_id else None,
        "location": asset.location, "purchase_date": asset.purchase_date,
        "cost": float(asset.cost) if asset.cost is not None else None,
        "warranty_until": asset.warranty_until, "vendor_id": asset.vendor_id,
        "vendor_name": vendor.name if vendor else None, "notes": asset.notes,
        "maintenance": asset.maintenance or [], "created_at": asset.created_at,
    }


def po_out(db, po: PurchaseOrder) -> dict:
    vendor = db.get(Vendor, po.vendor_id) if po.vendor_id else None
    return {
        "id": po.id, "number": po.number, "title": po.title, "status": po.status,
        "vendor_id": po.vendor_id, "vendor_name": vendor.name if vendor else None,
        "request_id": po.request_id, "project_id": po.project_id, "invoice_id": po.invoice_id,
        "lines": po.lines or [], "total": float(po.total), "currency": po.currency,
        "ordered_on": po.ordered_on, "expected_on": po.expected_on,
        "delivered_on": po.delivered_on, "created_at": po.created_at,
    }


@router.get("/assets")
def list_assets(db: DbSession, user: Annotated[User, Depends(require("assets.read"))],
                paging: Paging, q: str | None = None,
                category: Annotated[list[str] | None, Query()] = None,
                status: Annotated[list[str] | None, Query()] = None,
                owner_id: uuid.UUID | None = None):
    stmt = select(Asset).where(Asset.company_id == user.company_id, Asset.deleted_at.is_(None))
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Asset.name.ilike(like), Asset.tag.ilike(like),
                              Asset.serial_number.ilike(like)))
    if category:
        stmt = stmt.where(Asset.category.in_(category))
    if status:
        stmt = stmt.where(Asset.status.in_(status))
    if owner_id:
        stmt = stmt.where(Asset.owner_id == owner_id)
    stmt = stmt.order_by(Asset.name)
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.scalars(stmt.limit(paging.page_size).offset(paging.offset)).all()
    return as_page([asset_out(db, a) for a in rows], total, paging)


@router.get("/assets/summary")
def assets_summary(db: DbSession, user: Annotated[User, Depends(require("assets.read"))]):
    by_category = [
        {"name": category, "count": count, "value": float(value or 0)}
        for category, count, value in db.execute(
            select(Asset.category, func.count(Asset.id), func.sum(Asset.cost))
            .where(Asset.company_id == user.company_id, Asset.deleted_at.is_(None))
            .group_by(Asset.category).order_by(func.count(Asset.id).desc())
        ).all()
    ]
    by_status = dict(
        db.execute(
            select(Asset.status, func.count(Asset.id))
            .where(Asset.company_id == user.company_id, Asset.deleted_at.is_(None))
            .group_by(Asset.status)
        ).all()
    )
    total_value = float(db.scalar(select(func.sum(Asset.cost)).where(
        Asset.company_id == user.company_id, Asset.deleted_at.is_(None))) or 0)
    expiring = db.scalars(
        select(Asset).where(
            Asset.company_id == user.company_id, Asset.deleted_at.is_(None),
            Asset.warranty_until.is_not(None),
            Asset.warranty_until <= date.today().replace(year=date.today().year + 1),
        ).order_by(Asset.warranty_until).limit(6)
    ).all()
    return {
        "by_category": by_category, "by_status": by_status, "total_value": total_value,
        "expiring_warranty": [asset_out(db, a) for a in expiring],
    }


@router.get("/assets/{asset_id}", response_model=AssetOut)
def get_asset(asset_id: uuid.UUID, db: DbSession,
              user: Annotated[User, Depends(require("assets.read"))]):
    return asset_out(db, get_or_404(db, Asset, asset_id, user.company_id, "Asset"))


@router.post("/assets", response_model=AssetOut, status_code=201)
def create_asset(payload: AssetIn, db: DbSession,
                 user: Annotated[User, Depends(require("assets.write"))]):
    asset = Asset(company_id=user.company_id, **payload.model_dump())
    db.add(asset)
    db.flush()
    if asset.owner_id:
        graph.link(db, company_id=user.company_id, from_type="user", from_id=asset.owner_id,
                   rel_type="owns", to_type="asset", to_id=asset.id, actor=user)
    audit.record(db, actor=user, action="created", entity_type="asset", entity_id=asset.id,
                 summary=f"Registered asset {asset.name}")
    return asset_out(db, asset)


@router.patch("/assets/{asset_id}", response_model=AssetOut)
def update_asset(asset_id: uuid.UUID, payload: AssetUpdate, db: DbSession,
                 user: Annotated[User, Depends(require("assets.write"))]):
    asset = get_or_404(db, Asset, asset_id, user.company_id, "Asset")
    changes = payload.model_dump(exclude_unset=True)
    before = {k: getattr(asset, k) for k in changes}
    previous_owner = asset.owner_id
    for field, value in changes.items():
        setattr(asset, field, value)
    diff = audit.diff(before, changes)
    if diff:
        audit.record(db, actor=user, action="updated", entity_type="asset", entity_id=asset.id,
                     summary=f"Updated asset {asset.name}", changes=diff)
    if asset.owner_id and asset.owner_id != previous_owner:
        graph.link(db, company_id=user.company_id, from_type="user", from_id=asset.owner_id,
                   rel_type="owns", to_type="asset", to_id=asset.id, actor=user)
        notifications.notify(
            db, user_id=asset.owner_id, company_id=user.company_id, type="system_alert",
            title=f"{asset.name} assigned to you", entity_type="asset", entity_id=asset.id,
            url=f"/assets/{asset.id}", actor_id=user.id,
        )
    return asset_out(db, asset)


@router.post("/assets/{asset_id}/maintenance", response_model=AssetOut)
def add_maintenance(asset_id: uuid.UUID, payload: MaintenanceIn, db: DbSession,
                    user: Annotated[User, Depends(require("assets.write"))]):
    asset = get_or_404(db, Asset, asset_id, user.company_id, "Asset")
    entry = payload.model_dump()
    entry["date"] = entry["date"].isoformat()
    asset.maintenance = (asset.maintenance or []) + [entry]
    audit.record(db, actor=user, action="updated", entity_type="asset", entity_id=asset.id,
                 summary=f"Logged maintenance on {asset.name}")
    return asset_out(db, asset)


@router.delete("/assets/{asset_id}", response_model=Message)
def delete_asset(asset_id: uuid.UUID, db: DbSession,
                 user: Annotated[User, Depends(require("assets.manage"))]):
    asset = get_or_404(db, Asset, asset_id, user.company_id, "Asset")
    asset.deleted_at = datetime.now(UTC)
    return Message(message="Asset retired")


# ---------------------------------------------------------------- procurement
@router.get("/purchase-orders")
def list_purchase_orders(db: DbSession,
                         user: Annotated[User, Depends(require("procurement.read"))],
                         paging: Paging,
                         status: Annotated[list[str] | None, Query()] = None,
                         vendor_id: uuid.UUID | None = None):
    stmt = select(PurchaseOrder).where(PurchaseOrder.company_id == user.company_id,
                                       PurchaseOrder.deleted_at.is_(None))
    if status:
        stmt = stmt.where(PurchaseOrder.status.in_(status))
    if vendor_id:
        stmt = stmt.where(PurchaseOrder.vendor_id == vendor_id)
    stmt = stmt.order_by(PurchaseOrder.created_at.desc())
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.scalars(stmt.limit(paging.page_size).offset(paging.offset)).all()
    return as_page([po_out(db, p) for p in rows], total, paging)


@router.post("/purchase-orders", response_model=PurchaseOrderOut, status_code=201)
def create_purchase_order(payload: PurchaseOrderIn, db: DbSession,
                          user: Annotated[User, Depends(require("procurement.write"))]):
    count = db.scalar(select(func.count(PurchaseOrder.id)).where(
        PurchaseOrder.company_id == user.company_id)) or 0
    lines = [line.model_dump() for line in payload.lines]
    total = sum(float(line["qty"]) * float(line["unit_price"]) for line in lines)
    po = PurchaseOrder(
        company_id=user.company_id, number=f"PO-{date.today().year}-{count + 1:04d}",
        created_by_id=user.id, total=total,
        **(payload.model_dump(exclude={"lines"}) | {"lines": lines}),
    )
    db.add(po)
    db.flush()
    if po.request_id:
        graph.link(db, company_id=user.company_id, from_type="request", from_id=po.request_id,
                   rel_type="creates", to_type="purchase_order", to_id=po.id, actor=user)
    audit.record(db, actor=user, action="created", entity_type="purchase_order",
                 entity_id=po.id, summary=f"Created {po.number} ({total:,.2f})")
    return po_out(db, po)


@router.patch("/purchase-orders/{po_id}", response_model=PurchaseOrderOut)
def update_purchase_order(po_id: uuid.UUID, payload: PurchaseOrderUpdate, db: DbSession,
                          user: Annotated[User, Depends(require("procurement.write"))]):
    po = get_or_404(db, PurchaseOrder, po_id, user.company_id, "Purchase order")
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("lines") is not None:
        changes["lines"] = [line.model_dump() if hasattr(line, "model_dump") else line
                            for line in changes["lines"]]
    before = {k: getattr(po, k) for k in changes}
    for field, value in changes.items():
        setattr(po, field, value)
    po.total = sum(float(line.get("qty", 1)) * float(line.get("unit_price", 0))
                   for line in po.lines or [])
    if changes.get("status") == "invoiced" and po.invoice_id is None:
        invoice_count = db.scalar(select(func.count(Invoice.id)).where(
            Invoice.company_id == user.company_id)) or 0
        invoice = Invoice(
            company_id=user.company_id,
            number=f"INV-{date.today().year}-{invoice_count + 1:04d}", direction="incoming",
            status="sent", vendor_id=po.vendor_id, project_id=po.project_id,
            lines=po.lines, subtotal=po.total, total=po.total, currency=po.currency,
            issued_on=date.today(),
        )
        db.add(invoice)
        db.flush()
        po.invoice_id = invoice.id
        graph.link(db, company_id=user.company_id, from_type="purchase_order", from_id=po.id,
                   rel_type="generates", to_type="invoice", to_id=invoice.id, actor=user)
    diff = audit.diff(before, changes)
    if diff:
        audit.record(db, actor=user, action="updated", entity_type="purchase_order",
                     entity_id=po.id, summary=f"Updated {po.number}", changes=diff)
    return po_out(db, po)


@router.post("/purchase-orders/from-request/{request_id}", response_model=PurchaseOrderOut)
def po_from_request(request_id: uuid.UUID, db: DbSession,
                    user: Annotated[User, Depends(require("procurement.write"))]):
    """Approved purchase request → purchase order, closing the procurement loop."""
    request = get_or_404(db, WorkflowRequest, request_id, user.company_id, "Request")
    count = db.scalar(select(func.count(PurchaseOrder.id)).where(
        PurchaseOrder.company_id == user.company_id)) or 0
    data = request.data or {}
    amount = float(request.amount or data.get("amount") or 0)
    vendor = None
    if data.get("vendor"):
        vendor = db.scalar(select(Vendor).where(Vendor.company_id == user.company_id,
                                                Vendor.name.ilike(f"%{data['vendor']}%")))
    po = PurchaseOrder(
        company_id=user.company_id, number=f"PO-{date.today().year}-{count + 1:04d}",
        title=data.get("item") or request.title, status="ordered",
        vendor_id=vendor.id if vendor else None, request_id=request.id,
        project_id=request.project_id, created_by_id=user.id, ordered_on=date.today(),
        lines=[{"description": data.get("item") or request.title, "qty": 1,
                "unit_price": amount}],
        total=amount,
    )
    db.add(po)
    db.flush()
    graph.link(db, company_id=user.company_id, from_type="request", from_id=request.id,
               rel_type="creates", to_type="purchase_order", to_id=po.id, actor=user)
    audit.record(db, actor=user, action="created", entity_type="purchase_order",
                 entity_id=po.id, summary=f"{po.number} raised from request {request.title}")
    return po_out(db, po)
