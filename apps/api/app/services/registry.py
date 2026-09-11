"""Single registry describing every entity that can appear in the company graph,
in global search results and in inbox links. Adding a module means adding a row
here — nothing else in the graph/search layer needs to change.
"""

from dataclasses import dataclass, field
from typing import Any

from app.models.identity import User
from app.models.business import Asset, Contract, CrmCompany, Deal, Invoice, Transaction
from app.models.innovation import BrainstormBoard, Experiment, Idea, ResearchProject
from app.models.knowledge import Decision, Document
from app.models.ops import Meeting, WorkflowRequest
from app.models.people import Goal
from app.models.work import Project, Task


@dataclass(frozen=True)
class EntitySpec:
    key: str
    model: Any
    label: str
    title_field: str
    url: str                      # "/projects/{id}"
    icon: str
    search_fields: list[str] = field(default_factory=list)
    permission: str = "projects.read"
    subtitle_field: str | None = None
    status_field: str | None = "status"

    def title_of(self, obj: Any) -> str:
        return getattr(obj, self.title_field, "") or ""

    def url_of(self, obj: Any) -> str:
        return self.url.format(id=obj.id)


REGISTRY: dict[str, EntitySpec] = {
    s.key: s
    for s in [
        EntitySpec("project", Project, "Project", "name", "/projects/{id}", "folder-kanban",
                   ["name", "description", "key"], "projects.read"),
        EntitySpec("task", Task, "Task", "title", "/tasks/{id}", "check-square",
                   ["title", "description", "key"], "tasks.read"),
        EntitySpec("idea", Idea, "Idea", "title", "/ideas/{id}", "lightbulb",
                   ["title", "description"], "ideas.read"),
        EntitySpec("research", ResearchProject, "R&D", "title", "/rd/{id}", "flask-conical",
                   ["title", "research_question", "hypothesis", "findings"], "rd.read"),
        EntitySpec("experiment", Experiment, "Experiment", "name", "/experiments/{id}", "atom",
                   ["name", "hypothesis", "result"], "rd.read"),
        EntitySpec("document", Document, "Document", "title", "/documents/{id}", "file-text",
                   ["title", "content", "excerpt"], "documents.read"),
        EntitySpec("decision", Decision, "Decision", "title", "/decisions/{id}", "gavel",
                   ["title", "problem", "decision", "reason"], "decisions.read"),
        EntitySpec("meeting", Meeting, "Meeting", "title", "/meetings/{id}", "calendar",
                   ["title", "description", "notes"], "meetings.read"),
        EntitySpec("crm_company", CrmCompany, "Customer", "name", "/crm/{id}", "building-2",
                   ["name", "industry", "notes"], "crm.read"),
        EntitySpec("deal", Deal, "Deal", "title", "/crm/deals/{id}", "handshake",
                   ["title", "notes"], "crm.read", status_field="stage"),
        EntitySpec("contract", Contract, "Contract", "title", "/crm/contracts/{id}", "file-signature",
                   ["title", "number", "terms"], "crm.read"),
        EntitySpec("invoice", Invoice, "Invoice", "number", "/finance/invoices/{id}", "receipt",
                   ["number", "notes"], "finance.read"),
        EntitySpec("transaction", Transaction, "Transaction", "description",
                   "/finance/transactions/{id}", "banknote", ["description"], "finance.read"),
        EntitySpec("asset", Asset, "Asset", "name", "/assets/{id}", "laptop",
                   ["name", "tag", "serial_number", "notes"], "assets.read"),
        EntitySpec("goal", Goal, "Goal", "objective", "/goals/{id}", "target",
                   ["objective", "description"], "goals.read"),
        EntitySpec("request", WorkflowRequest, "Request", "title", "/approvals/{id}", "clipboard-list",
                   ["title"], "workflows.read"),
        EntitySpec("brainstorm_board", BrainstormBoard, "Brainstorm", "name", "/brainstorm/{id}",
                   "sparkles", ["name", "description"], "brainstorm.read"),
        EntitySpec("user", User, "Person", "full_name", "/employees/{id}", "user",
                   ["full_name", "email", "title"], "users.read", status_field=None),
    ]
}


def spec(entity_type: str) -> EntitySpec | None:
    return REGISTRY.get(entity_type)
