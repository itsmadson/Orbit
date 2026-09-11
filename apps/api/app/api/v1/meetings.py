import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_, select

from app.api.helpers import get_or_404, user_ref
from app.core.deps import DbSession, require
from app.core.errors import NotFound
from app.core.pagination import Paging, as_page
from app.models.identity import User
from app.models.knowledge import Decision
from app.models.ops import ActionItem, Meeting, MeetingParticipant
from app.models.work import Project, Task
from app.schemas.common import Message
from app.schemas.ops import (
    ActionItemIn, ActionItemOut, MeetingDetail, MeetingIn, MeetingOut, MeetingUpdate,
)
from app.services import audit, graph, notifications

router = APIRouter(tags=["meetings"])


def meeting_out(db, meeting: Meeting, detail: bool = False) -> dict:
    project = db.get(Project, meeting.project_id) if meeting.project_id else None
    participants = db.scalars(
        select(MeetingParticipant).where(MeetingParticipant.meeting_id == meeting.id)
    ).all()
    action_items = db.scalars(
        select(ActionItem).where(ActionItem.meeting_id == meeting.id)
        .order_by(ActionItem.created_at)
    ).all()
    data = {
        "id": meeting.id, "title": meeting.title, "description": meeting.description,
        "agenda": meeting.agenda or [], "location": meeting.location,
        "meeting_url": meeting.meeting_url, "status": meeting.status,
        "starts_at": meeting.starts_at, "ends_at": meeting.ends_at,
        "project_id": meeting.project_id, "project_name": project.name if project else None,
        "organizer": user_ref(db.get(User, meeting.organizer_id))
        if meeting.organizer_id else None,
        "participant_count": len(participants), "action_item_count": len(action_items),
        "created_at": meeting.created_at,
    }
    if detail:
        data |= {
            "notes": meeting.notes,
            "participants": [
                {"id": p.id, "user": user_ref(db.get(User, p.user_id)),
                 "response": p.response, "attended": p.attended}
                for p in participants if db.get(User, p.user_id)
            ],
            "action_items": [action_item_out(db, a) for a in action_items],
            "decision_ids": [
                d for d in db.scalars(
                    select(Decision.id).where(Decision.meeting_id == meeting.id)
                ).all()
            ],
        }
    return data


def action_item_out(db, item: ActionItem) -> dict:
    return {
        "id": item.id, "meeting_id": item.meeting_id, "title": item.title,
        "assignee": user_ref(db.get(User, item.assignee_id)) if item.assignee_id else None,
        "due_date": item.due_date, "status": item.status, "task_id": item.task_id,
    }


@router.get("/meetings")
def list_meetings(db: DbSession, user: Annotated[User, Depends(require("meetings.read"))],
                  paging: Paging, q: str | None = None,
                  project_id: uuid.UUID | None = None,
                  status: str | None = None,
                  upcoming: bool = False, mine: bool = False,
                  start: datetime | None = None, end: datetime | None = None):
    stmt = select(Meeting).where(Meeting.company_id == user.company_id,
                                 Meeting.deleted_at.is_(None))
    if q:
        stmt = stmt.where(or_(Meeting.title.ilike(f"%{q}%"), Meeting.notes.ilike(f"%{q}%")))
    if project_id:
        stmt = stmt.where(Meeting.project_id == project_id)
    if status:
        stmt = stmt.where(Meeting.status == status)
    if upcoming:
        stmt = stmt.where(Meeting.starts_at >= datetime.now(UTC) - timedelta(hours=2))
    if start:
        stmt = stmt.where(Meeting.starts_at >= start)
    if end:
        stmt = stmt.where(Meeting.starts_at <= end)
    if mine:
        stmt = stmt.where(
            or_(
                Meeting.organizer_id == user.id,
                Meeting.id.in_(select(MeetingParticipant.meeting_id).where(
                    MeetingParticipant.user_id == user.id)),
            )
        )
    stmt = stmt.order_by(Meeting.starts_at.desc() if not upcoming else Meeting.starts_at)
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.scalars(stmt.limit(paging.page_size).offset(paging.offset)).all()
    return as_page([meeting_out(db, m) for m in rows], total, paging)


@router.get("/meetings/{meeting_id}", response_model=MeetingDetail)
def get_meeting(meeting_id: uuid.UUID, db: DbSession,
                user: Annotated[User, Depends(require("meetings.read"))]):
    meeting = get_or_404(db, Meeting, meeting_id, user.company_id, "Meeting")
    return meeting_out(db, meeting, detail=True)


@router.post("/meetings", response_model=MeetingDetail, status_code=201)
def create_meeting(payload: MeetingIn, db: DbSession,
                   user: Annotated[User, Depends(require("meetings.write"))]):
    data = payload.model_dump(exclude={"participant_ids"})
    data["agenda"] = [a if isinstance(a, dict) else a.model_dump() for a in payload.agenda]
    meeting = Meeting(company_id=user.company_id, organizer_id=user.id, **data)
    db.add(meeting)
    db.flush()
    for participant_id in set(payload.participant_ids) | {user.id}:
        if db.get(User, participant_id):
            db.add(MeetingParticipant(meeting_id=meeting.id, user_id=participant_id,
                                      response="yes" if participant_id == user.id else "pending"))
            notifications.notify(
                db, user_id=participant_id, company_id=user.company_id, type="meeting_invite",
                title=f"Meeting: {meeting.title}",
                body=meeting.starts_at.strftime("%Y-%m-%d %H:%M UTC"),
                entity_type="meeting", entity_id=meeting.id,
                url=f"/meetings/{meeting.id}", actor_id=user.id,
            )
    if meeting.project_id:
        graph.link(db, company_id=user.company_id, from_type="project",
                   from_id=meeting.project_id, rel_type="contains", to_type="meeting",
                   to_id=meeting.id, actor=user)
    audit.record(db, actor=user, action="created", entity_type="meeting", entity_id=meeting.id,
                 summary=f"Scheduled meeting {meeting.title}")
    return meeting_out(db, meeting, detail=True)


@router.patch("/meetings/{meeting_id}", response_model=MeetingDetail)
def update_meeting(meeting_id: uuid.UUID, payload: MeetingUpdate, db: DbSession,
                   user: Annotated[User, Depends(require("meetings.write"))]):
    meeting = get_or_404(db, Meeting, meeting_id, user.company_id, "Meeting")
    changes = payload.model_dump(exclude_unset=True, exclude={"participant_ids"})
    if "agenda" in changes and changes["agenda"] is not None:
        changes["agenda"] = [a if isinstance(a, dict) else a.model_dump()
                             for a in changes["agenda"]]
    before = {k: getattr(meeting, k) for k in changes}
    for field, value in changes.items():
        setattr(meeting, field, value)
    if payload.participant_ids is not None:
        existing = {p.user_id: p for p in db.scalars(
            select(MeetingParticipant).where(MeetingParticipant.meeting_id == meeting.id)).all()}
        for participant_id in payload.participant_ids:
            if participant_id not in existing and db.get(User, participant_id):
                db.add(MeetingParticipant(meeting_id=meeting.id, user_id=participant_id))
                notifications.notify(
                    db, user_id=participant_id, company_id=user.company_id,
                    type="meeting_invite", title=f"Meeting: {meeting.title}",
                    entity_type="meeting", entity_id=meeting.id,
                    url=f"/meetings/{meeting.id}", actor_id=user.id,
                )
        for user_id, participant in existing.items():
            if user_id not in payload.participant_ids:
                db.delete(participant)
    diff = audit.diff(before, changes)
    if diff:
        audit.record(db, actor=user, action="updated", entity_type="meeting",
                     entity_id=meeting.id, summary=f"Updated meeting {meeting.title}",
                     changes={k: v for k, v in diff.items() if k != "notes"})
    db.flush()
    return meeting_out(db, meeting, detail=True)


@router.post("/meetings/{meeting_id}/respond", response_model=MeetingDetail)
def respond(meeting_id: uuid.UUID, response: str, db: DbSession,
            user: Annotated[User, Depends(require("meetings.read"))]):
    meeting = get_or_404(db, Meeting, meeting_id, user.company_id, "Meeting")
    participant = db.scalar(select(MeetingParticipant).where(
        MeetingParticipant.meeting_id == meeting.id, MeetingParticipant.user_id == user.id))
    if participant is None:
        participant = MeetingParticipant(meeting_id=meeting.id, user_id=user.id)
        db.add(participant)
    participant.response = response
    db.flush()
    return meeting_out(db, meeting, detail=True)


@router.post("/meetings/{meeting_id}/action-items", response_model=ActionItemOut, status_code=201)
def create_action_item(meeting_id: uuid.UUID, payload: ActionItemIn, db: DbSession,
                       user: Annotated[User, Depends(require("meetings.write"))]):
    meeting = get_or_404(db, Meeting, meeting_id, user.company_id, "Meeting")
    item = ActionItem(meeting_id=meeting.id, **payload.model_dump())
    db.add(item)
    db.flush()
    if item.assignee_id:
        notifications.notify(
            db, user_id=item.assignee_id, company_id=user.company_id, type="task_assigned",
            title=f"Action item: {item.title}", body=f"From meeting “{meeting.title}”.",
            entity_type="meeting", entity_id=meeting.id,
            url=f"/meetings/{meeting.id}", actor_id=user.id,
        )
    return action_item_out(db, item)


@router.post("/meetings/{meeting_id}/action-items/{item_id}/to-task")
def action_item_to_task(meeting_id: uuid.UUID, item_id: uuid.UUID, db: DbSession,
                        user: Annotated[User, Depends(require("tasks.write"))]):
    """Meeting action item → real task, linked back to the meeting."""
    from app.api.v1.tasks import next_key, serialize as task_serialize

    meeting = get_or_404(db, Meeting, meeting_id, user.company_id, "Meeting")
    item = db.get(ActionItem, item_id)
    if item is None or item.meeting_id != meeting.id:
        raise NotFound("Action item")
    if item.task_id and db.get(Task, item.task_id):
        return task_serialize(db, db.get(Task, item.task_id))
    project = db.get(Project, meeting.project_id) if meeting.project_id else None
    task = Task(
        company_id=user.company_id, key=next_key(db, user.company_id, project),
        project_id=meeting.project_id, title=item.title,
        description=f"Action item from meeting “{meeting.title}”.",
        assignee_id=item.assignee_id, reporter_id=user.id, due_date=item.due_date, status="todo",
    )
    db.add(task)
    db.flush()
    item.task_id = task.id
    item.status = "converted"
    graph.link(db, company_id=user.company_id, from_type="meeting", from_id=meeting.id,
               rel_type="creates", to_type="task", to_id=task.id, actor=user)
    if task.assignee_id:
        notifications.notify(
            db, user_id=task.assignee_id, company_id=user.company_id, type="task_assigned",
            title=f"{task.key}: {task.title}", entity_type="task", entity_id=task.id,
            url=f"/tasks/{task.id}", actor_id=user.id,
        )
    audit.record(db, actor=user, action="created", entity_type="task", entity_id=task.id,
                 summary=f"Action item became {task.key}")
    return task_serialize(db, task)


@router.patch("/meetings/{meeting_id}/action-items/{item_id}", response_model=ActionItemOut)
def update_action_item(meeting_id: uuid.UUID, item_id: uuid.UUID, payload: ActionItemIn,
                       db: DbSession,
                       user: Annotated[User, Depends(require("meetings.write"))]):
    item = db.get(ActionItem, item_id)
    if item is None or item.meeting_id != meeting_id:
        raise NotFound("Action item")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    return action_item_out(db, item)


@router.post("/meetings/{meeting_id}/decisions")
def meeting_decision(meeting_id: uuid.UUID, title: str, db: DbSession,
                     user: Annotated[User, Depends(require("decisions.write"))],
                     decision: str | None = None):
    """Meeting → Decision record, part of institutional memory."""
    meeting = get_or_404(db, Meeting, meeting_id, user.company_id, "Meeting")
    record = Decision(
        company_id=user.company_id, title=title, decision=decision,
        status="decided" if decision else "proposed", meeting_id=meeting.id,
        project_id=meeting.project_id, decided_by_id=user.id if decision else None,
        decided_at=datetime.now(UTC) if decision else None,
        participants=[str(p.user_id) for p in db.scalars(
            select(MeetingParticipant).where(MeetingParticipant.meeting_id == meeting.id)).all()],
    )
    db.add(record)
    db.flush()
    graph.link(db, company_id=user.company_id, from_type="meeting", from_id=meeting.id,
               rel_type="creates", to_type="decision", to_id=record.id, actor=user)
    audit.record(db, actor=user, action="created", entity_type="decision", entity_id=record.id,
                 summary=f"Decision from meeting {meeting.title}")
    return {"id": str(record.id), "url": f"/decisions/{record.id}"}


@router.delete("/meetings/{meeting_id}", response_model=Message)
def delete_meeting(meeting_id: uuid.UUID, db: DbSession,
                   user: Annotated[User, Depends(require("meetings.write"))]):
    meeting = get_or_404(db, Meeting, meeting_id, user.company_id, "Meeting")
    meeting.deleted_at = datetime.now(UTC)
    return Message(message="Meeting cancelled")
