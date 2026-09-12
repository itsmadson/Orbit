"""Demo company seed.

Creates a complete, connected company so the workspace is alive on first boot:
people, projects, tasks, ideas, R&D, documents, decisions, meetings, workflows,
finance, CRM, assets, goals and the graph edges that tie them together.

Idempotent: running it again on a seeded database does nothing.
"""

import logging
import random
import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models.business import (
    Asset, Budget, Contact, Contract, CrmActivity, CrmCompany, Deal, FinanceAccount,
    FinanceCategory, Invoice, PurchaseOrder, Transaction, Vendor,
)
from app.models.identity import Company, Department, User
from app.models.innovation import (
    BrainstormBoard, BrainstormCard, Experiment, Idea, IdeaVote, ResearchProject,
)
from app.models.knowledge import Decision, Document, DocumentVersion, WikiSpace
from app.models.office import Letter, Letterhead, LetterNumbering, LetterTemplate
from app.models.support import Monitor, Ticket, TicketMessage
from app.models.ops import (
    ActionItem, Meeting, MeetingParticipant, WorkflowDefinition, WorkflowRequest,
)
from app.models.people import (
    AttendanceRecord, Goal, KeyResult, LeaveRequest, OnboardingItem, Skill, UserSkill,
)
from app.models.system import AuditLog, Comment, Notification, Relation
from app.models.work import Milestone, Project, ProjectMember, Sprint, Task, TaskDependency
from app.services import graph, letters as letter_svc, support as support_svc, workflow

logger = logging.getLogger("orbit.seed")
rng = random.Random(7)

TODAY = date.today()
NOW = datetime.now(UTC)


def days_ago(n: int) -> date:
    return TODAY - timedelta(days=n)


def days_ahead(n: int) -> date:
    return TODAY + timedelta(days=n)


def hours_ahead(n: int) -> datetime:
    return NOW + timedelta(hours=n)


PEOPLE = [
    # (full_name, email, role, title, department, manager_email, color)
    ("Ava Mitchell", "admin@orbit.dev", "company_admin", "Chief Executive Officer",
     "Operations", None, "#f5501b"),
    ("Daniel Reed", "manager@orbit.dev", "manager", "VP of Engineering",
     "Engineering", "admin@orbit.dev", "#2d88e2"),
    ("Maya Chen", "dev@orbit.dev", "employee", "Senior Backend Engineer",
     "Engineering", "manager@orbit.dev", "#61a746"),
    ("Leo Novak", "leo@orbit.dev", "employee", "Frontend Engineer",
     "Engineering", "manager@orbit.dev", "#8b6000"),
    ("Priya Raman", "priya@orbit.dev", "employee", "Platform Engineer",
     "Engineering", "manager@orbit.dev", "#946ad5"),
    ("Sofia Marino", "researcher@orbit.dev", "rd", "Head of Research",
     "R&D", "admin@orbit.dev", "#b2468b"),
    ("Tomas Berg", "tomas@orbit.dev", "rd", "Research Engineer",
     "R&D", "researcher@orbit.dev", "#007f60"),
    ("Nadia Haddad", "pm@orbit.dev", "project_manager", "Head of Product",
     "Product", "admin@orbit.dev", "#00a7b5"),
    ("Ivan Petrov", "design@orbit.dev", "employee", "Product Designer",
     "Product", "pm@orbit.dev", "#2d88e2"),
    ("Grace Okafor", "finance@orbit.dev", "finance", "Finance Director",
     "Finance", "admin@orbit.dev", "#007f60"),
    ("Hugo Lambert", "hr@orbit.dev", "hr", "People Lead",
     "HR", "admin@orbit.dev", "#b2468b"),
    ("Elena Rossi", "sales@orbit.dev", "manager", "Head of Sales",
     "Sales", "admin@orbit.dev", "#946ad5"),
    ("Marcus Webb", "marcus@orbit.dev", "employee", "Account Executive",
     "Sales", "sales@orbit.dev", "#8b6000"),
    ("Yuki Tanaka", "ops@orbit.dev", "employee", "Operations Specialist",
     "Operations", "admin@orbit.dev", "#5d6b85"),
]

DEPARTMENTS = [
    ("Engineering", "Builds and runs the product.", "#2d88e2"),
    ("R&D", "Explores what the product could become.", "#b2468b"),
    ("Product", "Decides what to build and why.", "#8b6000"),
    ("Sales", "Finds and keeps customers.", "#946ad5"),
    ("Finance", "Keeps the company solvent.", "#007f60"),
    ("HR", "Hires, supports and grows the team.", "#f5501b"),
    ("Operations", "Keeps everything else running.", "#00a7b5"),
]

SKILLS = [
    ("Python", "engineering"), ("TypeScript", "engineering"), ("React", "engineering"),
    ("PostgreSQL", "engineering"), ("Kubernetes", "infrastructure"), ("Go", "engineering"),
    ("Machine learning", "research"), ("Statistics", "research"), ("UX design", "design"),
    ("Product strategy", "product"), ("Financial modelling", "finance"),
    ("Recruiting", "people"), ("Negotiation", "sales"), ("Technical writing", "communication"),
]


def seed_if_empty() -> None:
    with SessionLocal() as db:
        if db.scalar(select(func.count(Company.id))):
            logger.info("Database already seeded; skipping.")
            return
        logger.info("Seeding ORBIT demo company…")
        seed(db)
        db.commit()
        logger.info("Seed complete.")


def seed(db: Session) -> None:
    company = Company(
        name="Orbit Demo Company", slug="orbit-demo", logo_emoji="🪐",
        default_locale="en", currency="USD",
        settings={"week_start": "monday", "fiscal_year_start": "01-01"},
    )
    db.add(company)
    db.flush()

    departments = _seed_departments(db, company)
    users = _seed_users(db, company, departments)
    _seed_skills(db, company, users)
    projects = _seed_projects(db, company, users, departments)
    tasks = _seed_tasks(db, company, users, projects)
    ideas = _seed_ideas(db, company, users, projects)
    _seed_brainstorm(db, company, users, ideas)
    research = _seed_research(db, company, users, ideas, projects)
    documents = _seed_knowledge(db, company, users, projects)
    meetings = _seed_meetings(db, company, users, projects, tasks)
    _seed_decisions(db, company, users, projects, meetings, documents)
    _seed_workflows(db, company, users, projects)
    _seed_secretariat(db, company, users, projects)
    _seed_support(db, company, users, projects)
    customers = _seed_crm(db, company, users, projects)
    _seed_finance(db, company, users, projects, customers)
    _seed_assets(db, company, users)
    _seed_people_ops(db, company, users)
    _seed_goals(db, company, users, departments, projects)
    _seed_activity(db, company, users, projects, tasks, ideas, research)
    db.flush()


def _seed_departments(db: Session, company: Company) -> dict[str, Department]:
    out = {}
    for name, description, color in DEPARTMENTS:
        department = Department(company_id=company.id, name=name, description=description,
                                color=color)
        db.add(department)
        out[name] = department
    db.flush()
    return out


def _seed_users(db: Session, company: Company, departments) -> dict[str, User]:
    password = hash_password(settings.DEMO_PASSWORD)
    users: dict[str, User] = {}
    for full_name, email, role, title, department, _, color in PEOPLE:
        user = User(
            company_id=company.id, email=email, password_hash=password, full_name=full_name,
            role=role, title=title, department_id=departments[department].id,
            avatar_color=color, locale="en", theme="dark",
            employment_type="full_time",
            hired_at=days_ago(rng.randint(120, 1400)),
            salary=rng.choice([85000, 95000, 110000, 125000, 140000, 160000]),
            location=rng.choice(["Berlin", "Lisbon", "Toronto", "Remote", "Amsterdam"]),
            timezone="UTC", is_active=True,
            bio=f"{title} at Orbit Demo Company.",
            last_login_at=NOW - timedelta(hours=rng.randint(1, 72)),
        )
        db.add(user)
        users[email] = user
    db.flush()
    for _, email, _, _, _, manager_email, _ in PEOPLE:
        if manager_email:
            users[email].manager_id = users[manager_email].id
    departments["Engineering"].lead_id = users["manager@orbit.dev"].id
    departments["R&D"].lead_id = users["researcher@orbit.dev"].id
    departments["Product"].lead_id = users["pm@orbit.dev"].id
    departments["Sales"].lead_id = users["sales@orbit.dev"].id
    departments["Finance"].lead_id = users["finance@orbit.dev"].id
    departments["HR"].lead_id = users["hr@orbit.dev"].id
    departments["Operations"].lead_id = users["admin@orbit.dev"].id
    db.flush()
    return users


def _seed_skills(db: Session, company: Company, users) -> None:
    skills = {}
    for name, category in SKILLS:
        skill = Skill(company_id=company.id, name=name, category=category)
        db.add(skill)
        skills[name] = skill
    db.flush()
    assignments = {
        "dev@orbit.dev": ["Python", "PostgreSQL", "Go"],
        "leo@orbit.dev": ["TypeScript", "React", "UX design"],
        "priya@orbit.dev": ["Kubernetes", "Python", "PostgreSQL"],
        "researcher@orbit.dev": ["Machine learning", "Statistics", "Technical writing"],
        "tomas@orbit.dev": ["Machine learning", "Python"],
        "pm@orbit.dev": ["Product strategy", "Technical writing"],
        "design@orbit.dev": ["UX design", "Product strategy"],
        "finance@orbit.dev": ["Financial modelling"],
        "hr@orbit.dev": ["Recruiting"],
        "sales@orbit.dev": ["Negotiation", "Product strategy"],
        "marcus@orbit.dev": ["Negotiation"],
        "manager@orbit.dev": ["Python", "Kubernetes", "Product strategy"],
    }
    for email, names in assignments.items():
        for name in names:
            db.add(UserSkill(user_id=users[email].id, skill_id=skills[name].id,
                             level=rng.randint(3, 5)))
    db.flush()


PROJECT_SPECS = [
    {
        "key": "ATLAS", "name": "Project Atlas", "icon": "🛰️", "color": "#f5501b",
        "description": "Rebuild the data platform on a streaming architecture so every "
                       "product surface reads from one source of truth.",
        "status": "active", "priority": "high", "health": "at_risk",
        "start": 120, "end": -25, "progress": 62, "budget": 250000,
        "lead": "manager@orbit.dev", "department": "Engineering",
        "members": ["dev@orbit.dev", "priya@orbit.dev", "leo@orbit.dev", "pm@orbit.dev"],
    },
    {
        "key": "NOVA", "name": "Nova Customer Portal", "icon": "🚀", "color": "#2d88e2",
        "description": "Self-service portal where customers manage contracts, invoices "
                       "and support requests.",
        "status": "active", "priority": "high", "health": "on_track",
        "start": 75, "end": -60, "progress": 41, "budget": 120000,
        "lead": "pm@orbit.dev", "department": "Product",
        "members": ["leo@orbit.dev", "design@orbit.dev", "dev@orbit.dev"],
    },
    {
        "key": "HELIO", "name": "Helios Billing Engine", "icon": "💠", "color": "#8b6000",
        "description": "Usage-based billing engine with metering, invoicing and dunning.",
        "status": "planning", "priority": "medium", "health": "on_track",
        "start": -10, "end": -140, "progress": 8, "budget": 90000,
        "lead": "finance@orbit.dev", "department": "Finance",
        "members": ["dev@orbit.dev", "finance@orbit.dev"],
    },
    {
        "key": "ORION", "name": "Orion Mobile App", "icon": "📱", "color": "#946ad5",
        "description": "Native mobile companion app for field teams.",
        "status": "active", "priority": "medium", "health": "on_track",
        "start": 45, "end": -90, "progress": 28, "budget": 75000,
        "lead": "pm@orbit.dev", "department": "Product",
        "members": ["leo@orbit.dev", "design@orbit.dev"],
    },
    {
        "key": "VEGA", "name": "Vega Data Migration", "icon": "📦", "color": "#61a746",
        "description": "Migrate legacy warehouse data into the new platform and retire "
                       "the old cluster.",
        "status": "completed", "priority": "medium", "health": "on_track",
        "start": 300, "end": 40, "progress": 100, "budget": 60000,
        "lead": "priya@orbit.dev", "department": "Engineering",
        "members": ["priya@orbit.dev", "dev@orbit.dev"],
    },
]


def _seed_projects(db: Session, company: Company, users, departments) -> dict[str, Project]:
    projects: dict[str, Project] = {}
    for spec in PROJECT_SPECS:
        project = Project(
            company_id=company.id, key=spec["key"], name=spec["name"],
            description=spec["description"], status=spec["status"], priority=spec["priority"],
            health=spec["health"], color=spec["color"], icon=spec["icon"],
            start_date=days_ago(spec["start"]), end_date=days_ago(spec["end"]),
            progress=spec["progress"], budget=spec["budget"],
            lead_id=users[spec["lead"]].id, department_id=departments[spec["department"]].id,
        )
        db.add(project)
        db.flush()
        db.add(ProjectMember(project_id=project.id, user_id=users[spec["lead"]].id, role="lead"))
        for email in spec["members"]:
            if email != spec["lead"]:
                db.add(ProjectMember(project_id=project.id, user_id=users[email].id,
                                     role="member"))
            graph.link(db, company_id=company.id, from_type="project", from_id=project.id,
                       rel_type="assigned_to", to_type="user", to_id=users[email].id)
        projects[spec["key"]] = project

    milestones = {
        "ATLAS": [("Streaming ingest live", -20, "in_progress", 70),
                  ("Warehouse cutover", -55, "planned", 10),
                  ("Legacy shutdown", -95, "planned", 0)],
        "NOVA": [("Design system ready", 12, "completed", 100),
                 ("Beta with 5 customers", -30, "in_progress", 45),
                 ("General availability", -75, "planned", 0)],
        "ORION": [("Prototype shipped", -18, "in_progress", 55),
                  ("App store submission", -80, "planned", 0)],
        "HELIO": [("Technical design signed off", -25, "planned", 15)],
        "VEGA": [("All datasets migrated", 55, "completed", 100)],
    }
    for key, items in milestones.items():
        for name, offset, status, progress in items:
            db.add(Milestone(
                project_id=projects[key].id, name=name,
                due_date=days_ago(offset) if offset > 0 else days_ahead(-offset),
                status=status, progress=progress,
                description=f"{name} for {projects[key].name}.",
            ))
    db.flush()
    return projects


TASK_SPECS = [
    # (project, type, title, status, priority, assignee, due_offset, estimate, labels)
    ("ATLAS", "epic", "Streaming ingestion pipeline", "in_progress", "high", "manager@orbit.dev", -30, 40, ["platform"]),
    ("ATLAS", "story", "Design Kafka topic layout", "done", "high", "priya@orbit.dev", 25, 8, ["platform"]),
    ("ATLAS", "task", "Provision managed Kafka cluster", "done", "high", "priya@orbit.dev", 20, 5, ["infra"]),
    ("ATLAS", "task", "Write ingest consumer service", "in_progress", "urgent", "dev@orbit.dev", -3, 13, ["backend"]),
    ("ATLAS", "bug", "Consumer drops events under backpressure", "in_progress", "urgent", "dev@orbit.dev", 2, 5, ["bug", "backend"]),
    ("ATLAS", "task", "Backfill historical events", "todo", "high", "priya@orbit.dev", -12, 8, ["data"]),
    ("ATLAS", "task", "Schema registry integration", "in_review", "medium", "dev@orbit.dev", -6, 5, ["backend"]),
    ("ATLAS", "story", "Observability for the pipeline", "todo", "medium", "priya@orbit.dev", -20, 8, ["infra"]),
    ("ATLAS", "bug", "Duplicate rows after replay", "todo", "high", "dev@orbit.dev", 1, 3, ["bug", "data"]),
    ("ATLAS", "task", "Document the new data contracts", "backlog", "low", "pm@orbit.dev", -40, 3, ["docs"]),
    ("ATLAS", "task", "Load test at 50k events/sec", "backlog", "medium", "priya@orbit.dev", -35, 8, ["infra"]),
    ("ATLAS", "task", "Decommission legacy ETL jobs", "backlog", "low", None, -70, 5, ["cleanup"]),

    ("NOVA", "epic", "Customer self-service portal", "in_progress", "high", "pm@orbit.dev", -60, 40, ["product"]),
    ("NOVA", "story", "Contract overview page", "done", "high", "leo@orbit.dev", 10, 8, ["frontend"]),
    ("NOVA", "task", "Invoice download endpoint", "in_progress", "high", "dev@orbit.dev", -4, 5, ["backend"]),
    ("NOVA", "task", "Portal authentication flow", "in_review", "urgent", "leo@orbit.dev", -1, 8, ["frontend", "security"]),
    ("NOVA", "bug", "Invoice totals rounded incorrectly", "todo", "high", "dev@orbit.dev", 3, 2, ["bug"]),
    ("NOVA", "story", "Support request submission", "todo", "medium", "leo@orbit.dev", -18, 13, ["frontend"]),
    ("NOVA", "task", "Empty states and error screens", "todo", "low", "design@orbit.dev", -22, 3, ["design"]),
    ("NOVA", "task", "Portal onboarding email", "backlog", "low", "design@orbit.dev", -30, 2, ["design"]),

    ("ORION", "epic", "Mobile companion app", "in_progress", "medium", "pm@orbit.dev", -85, 40, ["mobile"]),
    ("ORION", "task", "Offline-first sync layer", "in_progress", "high", "leo@orbit.dev", -14, 13, ["mobile"]),
    ("ORION", "task", "Push notification service", "todo", "medium", "leo@orbit.dev", -28, 8, ["mobile"]),
    ("ORION", "story", "Field checklist screens", "todo", "medium", "design@orbit.dev", -35, 8, ["design"]),
    ("ORION", "bug", "Session lost on cold start", "todo", "high", "leo@orbit.dev", 4, 3, ["bug", "mobile"]),

    ("HELIO", "story", "Usage metering model", "todo", "high", "dev@orbit.dev", -40, 13, ["billing"]),
    ("HELIO", "task", "Draft billing technical design", "in_progress", "high", "finance@orbit.dev", -8, 5, ["docs"]),
    ("HELIO", "task", "Tax handling research", "backlog", "medium", "finance@orbit.dev", -60, 5, ["research"]),

    ("VEGA", "task", "Migrate customer dimension", "done", "high", "priya@orbit.dev", 70, 8, ["data"]),
    ("VEGA", "task", "Validate row counts", "done", "high", "dev@orbit.dev", 60, 3, ["data"]),
    ("VEGA", "task", "Retire legacy cluster", "done", "medium", "priya@orbit.dev", 45, 5, ["infra"]),

    (None, "task", "Quarterly all-hands preparation", "todo", "medium", "admin@orbit.dev", -6, 3, ["company"]),
    (None, "task", "Update the employee handbook", "todo", "low", "hr@orbit.dev", -16, 5, ["hr"]),
    (None, "task", "Renew infrastructure vendor contract", "todo", "high", "finance@orbit.dev", 5, 2, ["finance"]),
]


def _seed_tasks(db: Session, company: Company, users, projects) -> dict[str, Task]:
    sprints = {}
    for key in ("ATLAS", "NOVA", "ORION"):
        sprint = Sprint(
            company_id=company.id, project_id=projects[key].id,
            name=f"{key} Sprint {rng.randint(8, 14)}",
            goal=f"Move {projects[key].name} forward on its current milestone.",
            status="active", start_date=days_ago(7), end_date=days_ahead(7),
        )
        db.add(sprint)
        sprints[key] = sprint
    db.flush()

    tasks: dict[str, Task] = {}
    epics: dict[str, Task] = {}
    counters: dict[str, int] = {}
    for project_key, task_type, title, status, priority, assignee, due, estimate, labels in TASK_SPECS:
        project = projects[project_key] if project_key else None
        prefix = project.key if project else "ORB"
        counters[prefix] = counters.get(prefix, 0) + 1
        key = f"{prefix}-{counters[prefix]}"
        due_date = days_ago(due) if due > 0 else days_ahead(-due)
        task = Task(
            company_id=company.id, key=key, project_id=project.id if project else None,
            title=title,
            description=f"<p>{title}. Tracked as part of "
                        f"{project.name if project else 'company operations'}.</p>",
            type=task_type, status=status, priority=priority,
            assignee_id=users[assignee].id if assignee else None,
            reporter_id=users[rng.choice(["pm@orbit.dev", "manager@orbit.dev"])].id,
            sprint_id=sprints[project_key].id
            if project_key in sprints and status in ("todo", "in_progress", "in_review") else None,
            estimate=estimate, due_date=due_date, labels=labels,
            order_index=counters[prefix],
            completed_at=NOW - timedelta(days=rng.randint(1, 30)) if status == "done" else None,
            started_at=NOW - timedelta(days=rng.randint(1, 20))
            if status in ("in_progress", "in_review", "done") else None,
        )
        db.add(task)
        db.flush()
        tasks[key] = task
        if project:
            project.task_counter = counters[prefix]
            graph.link(db, company_id=company.id, from_type="project", from_id=project.id,
                       rel_type="contains", to_type="task", to_id=task.id)
        if task.assignee_id:
            graph.link(db, company_id=company.id, from_type="task", from_id=task.id,
                       rel_type="assigned_to", to_type="user", to_id=task.assignee_id)
        if task_type == "epic" and project:
            epics[project.key] = task

    for key, task in tasks.items():
        project_key = key.split("-")[0]
        if project_key in epics and task.type in ("story", "task", "bug") and rng.random() < 0.7:
            task.epic_id = epics[project_key].id

    # A couple of real dependencies so the blocked view has substance.
    db.add(TaskDependency(task_id=tasks["ATLAS-6"].id, depends_on_id=tasks["ATLAS-4"].id))
    db.add(TaskDependency(task_id=tasks["ATLAS-9"].id, depends_on_id=tasks["ATLAS-5"].id))
    tasks["ATLAS-6"].is_blocked = True
    graph.link(db, company_id=company.id, from_type="task", from_id=tasks["ATLAS-4"].id,
               rel_type="blocks", to_type="task", to_id=tasks["ATLAS-6"].id)

    for key in ("ATLAS-4", "ATLAS-5", "NOVA-4"):
        db.add(Comment(
            company_id=company.id, entity_type="task", entity_id=tasks[key].id,
            author_id=users["manager@orbit.dev"].id,
            body="Let's pair on this tomorrow morning — I think the retry policy is the issue.",
        ))
    db.flush()
    return tasks


IDEA_SPECS = [
    ("Anomaly detection on customer usage", "Flag unusual usage patterns before customers "
     "notice them and open a support ticket.", "evaluation", "researcher@orbit.dev",
     ["ml", "product"], 5, 3, 5, 3, 40000, 9),
    ("Self-service data exports", "Let customers export their own datasets instead of "
     "asking support for a CSV.", "approved", "pm@orbit.dev", ["product"], 4, 5, 4, 2, 15000, 12),
    ("Usage-based pricing tier", "Introduce a metered tier for smaller customers.",
     "rd", "finance@orbit.dev", ["pricing", "growth"], 5, 3, 5, 4, 60000, 7),
    ("Internal design system package", "Ship our components as an internal npm package.",
     "prototype", "design@orbit.dev", ["design", "engineering"], 3, 5, 3, 2, 8000, 6),
    ("Automated onboarding checklists", "Generate onboarding tasks automatically when "
     "someone is hired.", "submitted", "hr@orbit.dev", ["hr", "automation"], 3, 5, 3, 1, 5000, 5),
    ("Customer health score", "Combine usage, support and billing signals into a score.",
     "discussion", "sales@orbit.dev", ["crm", "ml"], 4, 3, 4, 3, 25000, 8),
    ("Vector search over company knowledge", "Semantic search across documents, decisions "
     "and meeting notes.", "evaluation", "researcher@orbit.dev", ["ai", "knowledge"],
     5, 4, 5, 3, 35000, 11),
    ("Green compute scheduling", "Run heavy batch jobs when the grid is cleanest.",
     "draft", "priya@orbit.dev", ["infra", "sustainability"], 2, 3, 2, 3, 12000, 2),
    ("Partner referral programme", "Pay partners for qualified referrals.", "rejected",
     "marcus@orbit.dev", ["growth"], 3, 4, 2, 3, 20000, 1),
    ("Offline mode for the mobile app", "Field teams often work without connectivity.",
     "product", "pm@orbit.dev", ["mobile"], 4, 3, 4, 4, 30000, 6),
]


def _seed_ideas(db: Session, company: Company, users, projects) -> dict[str, Idea]:
    ideas: dict[str, Idea] = {}
    emails = list(users.keys())
    for (title, description, status, author, tags, value, feasibility,
         impact, effort, cost, votes) in IDEA_SPECS:
        idea = Idea(
            company_id=company.id, title=title, description=f"<p>{description}</p>",
            status=status, author_id=users[author].id, tags=tags,
            business_value=value, technical_feasibility=feasibility, expected_impact=impact,
            effort=effort, estimated_cost=cost, vote_count=votes,
            score=round(((value * 2) + impact + feasibility) / max(effort, 1) * 3, 2),
            created_at=NOW - timedelta(days=rng.randint(3, 90)),
        )
        db.add(idea)
        db.flush()
        for email in rng.sample(emails, min(votes, len(emails))):
            db.add(IdeaVote(idea_id=idea.id, user_id=users[email].id))
        ideas[title] = idea
    ideas["Self-service data exports"].project_id = projects["NOVA"].id
    graph.link(db, company_id=company.id, from_type="idea",
               from_id=ideas["Self-service data exports"].id, rel_type="creates",
               to_type="project", to_id=projects["NOVA"].id)
    db.add(Comment(
        company_id=company.id, entity_type="idea",
        entity_id=ideas["Vector search over company knowledge"].id,
        author_id=users["manager@orbit.dev"].id,
        body="This pairs well with Atlas — we already stream the documents we would index.",
    ))
    db.flush()
    return ideas


def _seed_brainstorm(db: Session, company: Company, users, ideas) -> None:
    board = BrainstormBoard(
        company_id=company.id, name="Q3 growth ideas",
        description="Everything we could do to grow revenue next quarter.",
        created_by_id=users["pm@orbit.dev"].id,
        categories=["Product", "Pricing", "Marketing", "Retention"],
    )
    db.add(board)
    db.flush()
    cards = [
        ("Bundle the mobile app into the pro plan", "Pricing", "#8b6000", 40, 60, 5),
        ("In-product referral prompt", "Marketing", "#946ad5", 320, 40, 3),
        ("Usage alerts before overage", "Retention", "#61a746", 60, 260, 7),
        ("Free tier with 1 project", "Pricing", "#8b6000", 300, 220, 2),
        ("Templates gallery", "Product", "#2d88e2", 560, 80, 4),
        ("Quarterly customer roundtable", "Retention", "#61a746", 580, 300, 6),
        ("Public changelog", "Marketing", "#946ad5", 120, 430, 3),
        ("Partner marketplace", "Product", "#2d88e2", 420, 440, 1),
    ]
    emails = ["pm@orbit.dev", "sales@orbit.dev", "design@orbit.dev", "marcus@orbit.dev"]
    for text, category, color, x, y, votes in cards:
        db.add(BrainstormCard(
            board_id=board.id, text=text, category=category, color=color, x=x, y=y,
            votes=votes, author_id=users[rng.choice(emails)].id,
        ))
    db.flush()

    second = BrainstormBoard(
        company_id=company.id, name="Atlas retrospective",
        description="What slowed us down on the streaming migration?",
        created_by_id=users["manager@orbit.dev"].id,
        categories=["Went well", "Slowed us down", "Try next"],
    )
    db.add(second)
    db.flush()
    for text, category, x, y in [
        ("Schema registry saved us weeks", "Went well", 60, 60),
        ("Backpressure surprised us in week 3", "Slowed us down", 340, 60),
        ("Too many parallel workstreams", "Slowed us down", 340, 220),
        ("Write load tests before the cutover", "Try next", 620, 140),
    ]:
        db.add(BrainstormCard(board_id=second.id, text=text, category=category,
                              color="#f5501b", x=x, y=y, votes=rng.randint(0, 4),
                              author_id=users["priya@orbit.dev"].id))
    db.flush()


def _seed_research(db: Session, company: Company, users, ideas, projects) -> dict:
    research_specs = [
        {
            "title": "Usage anomaly detection",
            "question": "Can we detect abnormal customer usage patterns early enough to "
                        "prevent churn and overage surprises?",
            "hypothesis": "A seasonal-decomposition baseline plus an isolation forest will "
                          "flag 80% of incidents at least 24 hours before support is contacted.",
            "objectives": ["Establish a labelled incident dataset",
                           "Benchmark three detection approaches",
                           "Ship a shadow-mode detector"],
            "status": "active", "lead": "researcher@orbit.dev",
            "idea": "Anomaly detection on customer usage", "project": "ATLAS", "budget": 40000,
            "findings": "Isolation forest beats the statistical baseline on precision but "
                        "needs at least 30 days of history per customer.",
        },
        {
            "title": "Semantic search over company knowledge",
            "question": "Does embedding-based retrieval beat keyword search for internal "
                        "questions across documents, decisions and meeting notes?",
            "hypothesis": "Hybrid retrieval (BM25 + embeddings) will answer more internal "
                          "questions correctly than keyword search alone.",
            "objectives": ["Build an evaluation set of 100 real questions",
                           "Compare keyword, dense and hybrid retrieval",
                           "Measure latency at workspace scale"],
            "status": "active", "lead": "researcher@orbit.dev",
            "idea": "Vector search over company knowledge", "project": None, "budget": 35000,
            "findings": "Hybrid retrieval wins on recall; dense-only loses on exact "
                        "identifiers such as invoice numbers.",
        },
        {
            "title": "Metered pricing elasticity",
            "question": "How would a usage-based tier change revenue across the current "
                        "customer base?",
            "hypothesis": "A metered tier increases revenue from small accounts without "
                          "cannibalising more than 10% of flat-rate revenue.",
            "objectives": ["Model three pricing curves against historical usage",
                           "Interview 8 customers"],
            "status": "completed", "lead": "finance@orbit.dev",
            "idea": "Usage-based pricing tier", "project": "HELIO", "budget": 20000,
            "findings": "Two of three curves are revenue-positive; the aggressive curve "
                        "cannibalises 18% of flat-rate revenue and was discarded.",
        },
    ]
    research: dict[str, ResearchProject] = {}
    for spec in research_specs:
        item = ResearchProject(
            company_id=company.id, title=spec["title"], research_question=spec["question"],
            hypothesis=spec["hypothesis"], objectives=spec["objectives"],
            methods="Offline evaluation on historical data, followed by a shadow-mode rollout.",
            findings=spec["findings"], status=spec["status"],
            lead_id=users[spec["lead"]].id,
            idea_id=ideas[spec["idea"]].id if spec["idea"] in ideas else None,
            project_id=projects[spec["project"]].id if spec["project"] else None,
            start_date=days_ago(rng.randint(40, 120)), budget=spec["budget"],
            references=["Chandola et al., Anomaly Detection: A Survey (2009)",
                        "Internal: Atlas data contracts v2"],
            conclusion=spec["findings"] if spec["status"] == "completed" else None,
        )
        db.add(item)
        db.flush()
        research[spec["title"]] = item
        if item.idea_id:
            graph.link(db, company_id=company.id, from_type="idea", from_id=item.idea_id,
                       rel_type="creates", to_type="research", to_id=item.id)
        if item.project_id:
            graph.link(db, company_id=company.id, from_type="research", from_id=item.id,
                       rel_type="relates_to", to_type="project", to_id=item.project_id)

    experiment_specs = [
        ("Usage anomaly detection", "Baseline: rolling z-score on daily usage", "completed",
         "The z-score baseline flags 41% of incidents with 12% false positives.",
         {"recall": 0.41, "precision": 0.88, "false_positive_rate": 0.12}, 45, 38),
        ("Usage anomaly detection", "Isolation forest on 30-day windows", "validated",
         "Recall improves to 0.79 with precision holding at 0.84.",
         {"recall": 0.79, "precision": 0.84, "false_positive_rate": 0.16}, 30, 18),
        ("Usage anomaly detection", "Seasonal decomposition + isolation forest", "running",
         None, {"recall": 0.83}, 9, None),
        ("Usage anomaly detection", "Shadow-mode rollout on 20 accounts", "planned", None,
         {}, None, None),
        ("Semantic search over company knowledge", "BM25 keyword baseline", "completed",
         "Answers 54 of 100 evaluation questions correctly.",
         {"accuracy": 0.54, "p95_latency_ms": 60}, 28, 25),
        ("Semantic search over company knowledge", "Dense retrieval with pgvector", "completed",
         "Answers 61 of 100 questions; misses exact identifiers.",
         {"accuracy": 0.61, "p95_latency_ms": 140}, 20, 14),
        ("Semantic search over company knowledge", "Hybrid BM25 + dense reranking", "running",
         None, {"accuracy": 0.74}, 6, None),
        ("Metered pricing elasticity", "Simulate three pricing curves", "completed",
         "Curve B is revenue-positive across 82% of accounts.",
         {"revenue_delta_pct": 8.4, "cannibalisation_pct": 6.1}, 60, 52),
        ("Metered pricing elasticity", "Aggressive metered curve", "failed",
         "Cannibalises 18% of flat-rate revenue — rejected.",
         {"revenue_delta_pct": -3.2, "cannibalisation_pct": 18.0}, 55, 50),
    ]
    for index, (research_title, name, status, result, metrics, started, ended) in enumerate(
        experiment_specs, start=1
    ):
        item = research[research_title]
        experiment = Experiment(
            company_id=company.id, research_id=item.id, number=index, name=name,
            hypothesis=item.hypothesis, method="Offline evaluation on the labelled dataset.",
            status=status, result=result, metrics=metrics,
            dataset_ref="s3://orbit-demo/datasets/usage-2026.parquet",
            researcher_id=users[rng.choice(["researcher@orbit.dev", "tomas@orbit.dev"])].id,
            started_at=NOW - timedelta(days=started) if started else None,
            ended_at=NOW - timedelta(days=ended) if ended else None,
        )
        db.add(experiment)
        db.flush()
        graph.link(db, company_id=company.id, from_type="research", from_id=item.id,
                   rel_type="contains", to_type="experiment", to_id=experiment.id)
    db.flush()
    return research


DOCUMENT_SPECS = [
    ("Engineering", "Atlas technical design", "technical_design", "ATLAS",
     "<h2>Context</h2><p>The current warehouse is refreshed nightly, which makes every "
     "product surface at least a day stale.</p><h2>Approach</h2><p>Move to a streaming "
     "ingest pipeline with a schema registry, then read models per surface.</p>"
     "<h2>Risks</h2><ul><li>Backpressure under replay</li><li>Dual-write period</li></ul>"),
    ("Engineering", "Incident response SOP", "sop", None,
     "<h2>Severity levels</h2><p>SEV1 is customer-facing downtime. SEV2 is degraded "
     "performance.</p><h2>On call</h2><p>Acknowledge within 5 minutes, post an update "
     "every 30 minutes, write a postmortem within 3 working days.</p>"),
    ("Engineering", "Service deployment runbook", "documentation", None,
     "<p>Every service ships through the same pipeline: build, migrate, canary, roll out.</p>"),
    ("Product", "Nova portal specification", "specification", "NOVA",
     "<h2>Goal</h2><p>Customers manage contracts, invoices and support requests without "
     "emailing us.</p><h2>Out of scope</h2><p>Self-service plan changes.</p>"),
    ("Product", "Orion mobile scope", "specification", "ORION",
     "<p>Field teams need checklists, offline sync and push notifications. Everything else "
     "waits for v2.</p>"),
    ("R&D", "Anomaly detection findings", "research", None,
     "<h2>Summary</h2><p>Isolation forest on 30-day windows reaches 0.79 recall at 0.84 "
     "precision, which clears the bar for a shadow rollout.</p>"),
    ("R&D", "Semantic search evaluation", "research", None,
     "<p>Hybrid retrieval answers 74 of 100 internal questions correctly against 54 for "
     "keyword search.</p>"),
    ("Company", "Employee handbook", "policy", None,
     "<h2>Working hours</h2><p>Core hours are 10:00–16:00 in your local timezone.</p>"
     "<h2>Leave</h2><p>28 days per year plus public holidays.</p>"),
    ("Company", "Expense policy", "policy", None,
     "<p>Anything above 500 needs manager and finance approval before it is spent.</p>"),
    ("Company", "Security policy", "policy", None,
     "<p>SSO everywhere, hardware keys for admins, quarterly access reviews.</p>"),
    ("Finance", "FY budget model", "documentation", None,
     "<p>Budget is planned per department and per project, reviewed monthly.</p>"),
    ("Sales", "Discount approval matrix", "sop", None,
     "<p>Up to 10% by the account executive, up to 20% by the head of sales, above that "
     "the CEO signs.</p>"),
]


def _seed_knowledge(db: Session, company: Company, users, projects) -> dict:
    spaces = {}
    for name, icon, color, description in [
        ("Engineering", "⚙️", "#2d88e2", "How we build and run the product."),
        ("Product", "🎯", "#8b6000", "What we are building and why."),
        ("R&D", "🔬", "#b2468b", "Research questions, findings and datasets."),
        ("Company", "🏛️", "#f5501b", "Policies, handbook and how we work."),
        ("Finance", "💰", "#007f60", "Budgets, models and finance processes."),
        ("Sales", "📈", "#946ad5", "Playbooks, pricing and customer notes."),
    ]:
        space = WikiSpace(company_id=company.id, name=name, slug=name.lower(),
                          icon=icon, color=color, description=description)
        db.add(space)
        spaces[name] = space
    db.flush()

    authors = {
        "Engineering": "manager@orbit.dev", "Product": "pm@orbit.dev",
        "R&D": "researcher@orbit.dev", "Company": "hr@orbit.dev",
        "Finance": "finance@orbit.dev", "Sales": "sales@orbit.dev",
    }
    documents = {}
    for space_name, title, doc_type, project_key, content in DOCUMENT_SPECS:
        text = content.replace("<", " <")
        document = Document(
            company_id=company.id, space_id=spaces[space_name].id, title=title,
            doc_type=doc_type, content=content,
            excerpt=" ".join(text.split())[:280],
            status="published", tags=[space_name.lower(), doc_type],
            author_id=users[authors[space_name]].id,
            project_id=projects[project_key].id if project_key else None,
            version=1, created_at=NOW - timedelta(days=rng.randint(5, 200)),
        )
        db.add(document)
        db.flush()
        db.add(DocumentVersion(document_id=document.id, version=1, title=title,
                               content=content, author_id=document.author_id,
                               change_note="Created"))
        if document.project_id:
            graph.link(db, company_id=company.id, from_type="project",
                       from_id=document.project_id, rel_type="documents",
                       to_type="document", to_id=document.id)
        documents[title] = document
    db.flush()
    return documents


def _seed_meetings(db: Session, company: Company, users, projects, tasks) -> dict:
    specs = [
        ("Atlas weekly sync", "ATLAS", -2, 1,
         ["manager@orbit.dev", "dev@orbit.dev", "priya@orbit.dev", "pm@orbit.dev"],
         [{"title": "Backpressure incident review", "owner": "Maya Chen", "minutes": 15},
          {"title": "Cutover plan", "owner": "Daniel Reed", "minutes": 20},
          {"title": "Risks and blockers", "owner": "Nadia Haddad", "minutes": 10}],
         "<p>Backpressure is caused by the consumer committing offsets before the sink "
         "acknowledges. Maya will move the commit after the sink write.</p>"
         "<p>Cutover moves one week later to leave room for load testing.</p>", "completed"),
        ("Product weekly", "NOVA", -1, 1,
         ["pm@orbit.dev", "design@orbit.dev", "leo@orbit.dev", "admin@orbit.dev"],
         [{"title": "Portal beta feedback", "owner": "Nadia Haddad", "minutes": 20},
          {"title": "Next milestone scope", "owner": "Ivan Petrov", "minutes": 20}],
         "<p>Beta customers want invoice download first; support requests can wait.</p>",
         "completed"),
        ("R&D review", None, -5, 1,
         ["researcher@orbit.dev", "tomas@orbit.dev", "manager@orbit.dev", "admin@orbit.dev"],
         [{"title": "Anomaly detection results", "owner": "Sofia Marino", "minutes": 25},
          {"title": "Semantic search progress", "owner": "Tomas Berg", "minutes": 20}],
         "<p>Isolation forest is approved for a shadow rollout on 20 accounts.</p>",
         "completed"),
        ("Leadership weekly", None, 18, 1,
         ["admin@orbit.dev", "manager@orbit.dev", "pm@orbit.dev", "finance@orbit.dev",
          "sales@orbit.dev", "hr@orbit.dev"],
         [{"title": "Company health", "owner": "Ava Mitchell", "minutes": 15},
          {"title": "Budget review", "owner": "Grace Okafor", "minutes": 20},
          {"title": "Hiring plan", "owner": "Hugo Lambert", "minutes": 15}],
         None, "scheduled"),
        ("Atlas cutover planning", "ATLAS", 26, 2,
         ["manager@orbit.dev", "priya@orbit.dev", "dev@orbit.dev"],
         [{"title": "Runbook walkthrough", "owner": "Priya Raman", "minutes": 30},
          {"title": "Rollback criteria", "owner": "Daniel Reed", "minutes": 20}],
         None, "scheduled"),
        ("Sales pipeline review", None, 42, 1,
         ["sales@orbit.dev", "marcus@orbit.dev", "admin@orbit.dev", "finance@orbit.dev"],
         [{"title": "Deals closing this quarter", "owner": "Elena Rossi", "minutes": 25}],
         None, "scheduled"),
        ("Design critique", "ORION", 50, 1,
         ["design@orbit.dev", "pm@orbit.dev", "leo@orbit.dev"],
         [{"title": "Field checklist screens", "owner": "Ivan Petrov", "minutes": 40}],
         None, "scheduled"),
        ("Company all-hands", None, 96, 1,
         [email for _, email, _, _, _, _, _ in PEOPLE],
         [{"title": "Quarter in review", "owner": "Ava Mitchell", "minutes": 20},
          {"title": "Product roadmap", "owner": "Nadia Haddad", "minutes": 20},
          {"title": "Q&A", "owner": "Ava Mitchell", "minutes": 20}],
         None, "scheduled"),
    ]
    meetings = {}
    for title, project_key, offset_hours, duration, participants, agenda, notes, status in specs:
        starts = hours_ahead(offset_hours) if offset_hours > 0 else NOW - timedelta(
            hours=abs(offset_hours) * 24
        )
        meeting = Meeting(
            company_id=company.id, title=title,
            description=f"{title} for the team.", agenda=agenda, notes=notes,
            location=rng.choice(["Meeting room A", "Zoom", "Meeting room B", "Google Meet"]),
            status=status, starts_at=starts, ends_at=starts + timedelta(hours=duration),
            project_id=projects[project_key].id if project_key else None,
            organizer_id=users[participants[0]].id,
        )
        db.add(meeting)
        db.flush()
        for email in participants:
            db.add(MeetingParticipant(
                meeting_id=meeting.id, user_id=users[email].id,
                response="yes" if status == "completed" or rng.random() > 0.3 else "pending",
                attended=status == "completed",
            ))
        if meeting.project_id:
            graph.link(db, company_id=company.id, from_type="project",
                       from_id=meeting.project_id, rel_type="contains", to_type="meeting",
                       to_id=meeting.id)
        meetings[title] = meeting

    action_items = [
        ("Atlas weekly sync", "Move offset commit after sink acknowledgement",
         "dev@orbit.dev", 3, "open"),
        ("Atlas weekly sync", "Write load test for 50k events/sec", "priya@orbit.dev", 7, "open"),
        ("Product weekly", "Ship invoice download endpoint", "dev@orbit.dev", 4, "open"),
        ("R&D review", "Prepare shadow rollout plan", "researcher@orbit.dev", 10, "open"),
        ("R&D review", "Publish anomaly detection findings", "tomas@orbit.dev", 5, "converted"),
    ]
    for meeting_title, item_title, assignee, due, status in action_items:
        db.add(ActionItem(
            meeting_id=meetings[meeting_title].id, title=item_title,
            assignee_id=users[assignee].id, due_date=days_ahead(due), status=status,
        ))
    db.flush()
    return meetings


def _seed_decisions(db: Session, company: Company, users, projects, meetings, documents) -> None:
    specs = [
        {
            "title": "Adopt streaming ingest instead of nightly batch",
            "problem": "Nightly refreshes make every product surface a day stale, and "
                       "customers notice.",
            "context": "Two options were on the table: shorten the batch window, or move "
                       "to a streaming pipeline with a schema registry.",
            "options": [
                {"title": "Shorten the batch window to hourly",
                 "pros": "Cheap, low risk", "cons": "Still stale, does not scale", "chosen": False},
                {"title": "Streaming ingest with schema registry",
                 "pros": "Fresh data, one source of truth",
                 "cons": "Larger migration, dual-write period", "chosen": True},
            ],
            "decision": "Move to streaming ingest with a schema registry.",
            "reason": "Only the streaming option removes staleness permanently and unblocks "
                      "the customer portal and the billing engine.",
            "consequences": "A dual-write period of roughly six weeks and one new "
                            "infrastructure dependency.",
            "status": "decided", "project": "ATLAS", "meeting": "Atlas weekly sync",
            "decided_by": "manager@orbit.dev", "days": 90,
        },
        {
            "title": "Delay the Atlas cutover by one week",
            "problem": "Load testing has not run at production volume.",
            "context": "The backpressure incident showed the consumer is not yet safe "
                       "under replay.",
            "options": [
                {"title": "Cut over as planned", "pros": "Keeps the date",
                 "cons": "Risk of customer-visible data loss", "chosen": False},
                {"title": "Delay one week and load test",
                 "pros": "De-risks the migration", "cons": "Slips the milestone",
                 "chosen": True},
            ],
            "decision": "Delay the cutover by one week and run a 50k events/sec load test first.",
            "reason": "A visible data-loss incident costs more than a one-week slip.",
            "consequences": "Atlas milestone moves; the portal beta is unaffected.",
            "status": "decided", "project": "ATLAS", "meeting": "Atlas weekly sync",
            "decided_by": "manager@orbit.dev", "days": 2,
        },
        {
            "title": "Prioritise invoice download over support requests in the portal",
            "problem": "The beta scope is larger than the milestone allows.",
            "context": "Beta customers asked for invoice access far more often than "
                       "in-portal support.",
            "options": [
                {"title": "Invoice download first", "pros": "Most requested",
                 "cons": "Support stays in email", "chosen": True},
                {"title": "Support requests first", "pros": "Reduces email load",
                 "cons": "Lower customer demand", "chosen": False},
            ],
            "decision": "Ship invoice download in the beta; support requests move to the "
                        "next milestone.",
            "reason": "Customer demand is measurably higher for invoices.",
            "consequences": "Support volume stays in email for another six weeks.",
            "status": "decided", "project": "NOVA", "meeting": "Product weekly",
            "decided_by": "pm@orbit.dev", "days": 1,
        },
        {
            "title": "Approve shadow rollout of anomaly detection",
            "problem": "The detector performs well offline but has never seen live traffic.",
            "context": "Isolation forest reached 0.79 recall at 0.84 precision offline.",
            "options": [
                {"title": "Shadow mode on 20 accounts", "pros": "No customer impact",
                 "cons": "Slower learning", "chosen": True},
                {"title": "Enable alerts immediately", "pros": "Immediate value",
                 "cons": "False positives reach customers", "chosen": False},
            ],
            "decision": "Run in shadow mode on 20 accounts for four weeks.",
            "reason": "Precision has not been validated on live traffic.",
            "consequences": "Alerting is deferred by a month.",
            "status": "decided", "project": None, "meeting": "R&D review",
            "decided_by": "researcher@orbit.dev", "days": 5,
        },
        {
            "title": "Reject the aggressive metered pricing curve",
            "problem": "One of three modelled pricing curves cannibalises flat-rate revenue.",
            "context": "Curve C showed 18% cannibalisation against a 10% ceiling.",
            "options": [
                {"title": "Adopt curve B", "pros": "Revenue positive",
                 "cons": "Smaller upside", "chosen": True},
                {"title": "Adopt curve C", "pros": "Largest upside",
                 "cons": "18% cannibalisation", "chosen": False},
            ],
            "decision": "Proceed with curve B only.",
            "reason": "Curve C breaches the agreed cannibalisation ceiling.",
            "consequences": "Helios is scoped against curve B.",
            "status": "decided", "project": "HELIO", "meeting": None,
            "decided_by": "finance@orbit.dev", "days": 20,
        },
        {
            "title": "Choose the storage backend for attachments",
            "problem": "Attachments currently live on a single node's disk.",
            "context": "S3-compatible storage would survive node loss and simplify backups.",
            "options": [
                {"title": "Keep local disk", "pros": "Simple", "cons": "Single point of failure"},
                {"title": "MinIO / S3", "pros": "Durable, portable", "cons": "One more service"},
            ],
            "decision": None, "reason": None,
            "consequences": None, "status": "discussion", "project": None, "meeting": None,
            "decided_by": None, "days": 3,
        },
    ]
    for spec in specs:
        decision = Decision(
            company_id=company.id, title=spec["title"], problem=spec["problem"],
            context=spec["context"], options=spec["options"], decision=spec["decision"],
            reason=spec["reason"], consequences=spec["consequences"], status=spec["status"],
            project_id=projects[spec["project"]].id if spec["project"] else None,
            meeting_id=meetings[spec["meeting"]].id if spec["meeting"] else None,
            decided_by_id=users[spec["decided_by"]].id if spec["decided_by"] else None,
            decided_at=NOW - timedelta(days=spec["days"]) if spec["decided_by"] else None,
            created_at=NOW - timedelta(days=spec["days"] + 2),
            participants=[str(users[e].id) for e in
                          rng.sample(list(users.keys()), rng.randint(3, 5))],
        )
        db.add(decision)
        db.flush()
        if decision.project_id:
            graph.link(db, company_id=company.id, from_type="decision", from_id=decision.id,
                       rel_type="relates_to", to_type="project", to_id=decision.project_id)
        if decision.meeting_id:
            graph.link(db, company_id=company.id, from_type="meeting",
                       from_id=decision.meeting_id, rel_type="creates", to_type="decision",
                       to_id=decision.id)
    db.flush()


def _seed_workflows(db: Session, company: Company, users, projects) -> None:
    definitions = {}
    for spec in workflow.DEFAULT_WORKFLOWS:
        definition = WorkflowDefinition(company_id=company.id, **spec)
        db.add(definition)
        db.flush()
        definitions[spec["key"]] = definition

    requests = [
        ("purchase_request", "dev@orbit.dev",
         {"item": "MacBook Pro 16\" M4", "amount": 3200, "vendor": "TechSupply Ltd",
          "justification": "Current laptop cannot run the local Kafka stack.",
          "needed_by": days_ahead(21).isoformat()}, 1),
        ("purchase_request", "priya@orbit.dev",
         {"item": "Load testing SaaS licence (annual)", "amount": 4800,
          "vendor": "Northwind Cloud",
          "justification": "Needed before the Atlas cutover load test.",
          "needed_by": days_ahead(10).isoformat()}, 2),
        ("expense_claim", "sales@orbit.dev",
         {"purpose": "Customer dinner — Meridian Health", "amount": 340,
          "spent_on": days_ago(8).isoformat(), "notes": "Contract renewal discussion."}, 2),
        ("expense_claim", "leo@orbit.dev",
         {"purpose": "Conference ticket — FrontendConf", "amount": 690,
          "spent_on": days_ago(20).isoformat(), "notes": "Approved in the team budget."}, 3),
        ("access_request", "tomas@orbit.dev",
         {"system": "Production data warehouse", "level": "read",
          "reason": "Needed to build the anomaly detection evaluation set."}, 1),
        ("document_review", "pm@orbit.dev",
         {"document": "Nova portal specification",
          "reason": "Please confirm the beta scope before we lock the milestone."}, 0),
    ]
    for key, requester_email, data, advance in requests:
        definition = definitions[key]
        request = workflow.create_request(
            db, definition=definition, requester=users[requester_email],
            title=f"{definition.name}: {list(data.values())[0]}", data=data,
            amount=float(data.get("amount") or 0) or None,
            project_id=projects["ATLAS"].id if "Atlas" in str(data) else None,
        )
        db.flush()
        for _ in range(advance):
            actions = workflow.available_actions(db, definition, request)
            approve = next((a for a in actions if a["action"] == "approve"), None)
            if not approve:
                break
            approver = users["admin@orbit.dev"]
            workflow.act(db, request=request, user=approver, action="approve",
                         comment="Approved.")
            db.flush()
    db.flush()


CUSTOMER_SPECS = [
    ("Meridian Health", "Healthcare", "customer", 180000, "Germany", "sales@orbit.dev"),
    ("Kestrel Logistics", "Logistics", "customer", 240000, "Netherlands", "sales@orbit.dev"),
    ("Northwind Cloud", "Technology", "customer", 96000, "Ireland", "marcus@orbit.dev"),
    ("Larkspur Retail", "Retail", "prospect", 60000, "France", "marcus@orbit.dev"),
    ("Cobalt Energy", "Energy", "prospect", 320000, "Norway", "sales@orbit.dev"),
    ("Juniper Media", "Media", "lead", 45000, "Portugal", "marcus@orbit.dev"),
    ("Ardent Manufacturing", "Manufacturing", "lead", 150000, "Poland", "sales@orbit.dev"),
]


LETTER_TEMPLATES = [
    {
        "name": "نامه اداری عمومی",
        "description": "الگوی پایه برای مکاتبات برون‌سازمانی.",
        "kind": "outgoing",
        "subject": "{{subject}}",
        "salutation": "جناب آقای/سرکار خانم {{recipient}}",
        "closing": "با تشکر و احترام",
        "variables": ["recipient", "recipient_title", "subject"],
        "is_default": True,
        "body": "<p>با سلام و احترام،</p>",
    },
    {
        "name": "گواهی اشتغال به کار",
        "description": "برای ارائه به بانک، سفارت یا سازمان‌های دیگر.",
        "kind": "outgoing",
        "subject": "گواهی اشتغال به کار",
        "salutation": "به: {{recipient_org}}",
        "closing": "این گواهی صرفاً جهت اطلاع صادر شده و فاقد هرگونه ارزش دیگری است.",
        "variables": ["recipient_org", "employee", "position", "start_date"],
        "body": (
            "<p>بدین‌وسیله گواهی می‌شود جناب آقای/سرکار خانم {{employee}} با سمت "
            "{{position}} از تاریخ {{start_date}} در این شرکت مشغول به کار می‌باشند.</p>"
        ),
    },
    {
        "name": "دعوت به جلسه",
        "description": "دعوت‌نامه رسمی برای جلسات درون‌سازمانی و برون‌سازمانی.",
        "kind": "internal",
        "subject": "دعوت به جلسه {{meeting}}",
        "salutation": "جناب آقای/سرکار خانم {{recipient}}",
        "closing": "خواهشمند است حضور خود را تأیید فرمایید.",
        "variables": ["recipient", "meeting", "date", "place"],
        "body": (
            "<p>با سلام،</p><p>بدین‌وسیله از جنابعالی دعوت می‌شود در جلسه {{meeting}} "
            "که در تاریخ {{date}} در {{place}} برگزار می‌گردد حضور به هم رسانید.</p>"
        ),
    },
    {
        "name": "پاسخ به استعلام",
        "description": "پاسخ رسمی به نامه یا استعلام دریافتی.",
        "kind": "outgoing",
        "subject": "پاسخ به نامه شماره {{their_number}}",
        "salutation": "جناب آقای/سرکار خانم {{recipient}}",
        "closing": "با احترام",
        "variables": ["recipient", "their_number"],
        "body": "<p>با سلام و احترام،</p><p>بازگشت به نامه شماره {{their_number}}،</p>",
    },
]


def _seed_secretariat(db: Session, company: Company, users, projects) -> None:
    """The letter register: one letterhead, a numbering formula, templates and
    a handful of letters that already carry registered numbers."""
    letterhead = Letterhead(
        company_id=company.id, name="سربرگ رسمی", is_default=True,
        org_name="شرکت اوربیت", org_name_secondary="Orbit Demo Company",
        org_subtitle="مدیریت یکپارچه سازمان",
        address="تهران، خیابان ولیعصر، پلاک ۱۲۰۴", phone="۰۲۱-۹۱۰۰۰۱۰۰",
        email="office@orbit.dev", website="orbit.dev", postal_code="۱۵۱۴۷۳۳۱۱۱",
        paper="A4", direction="rtl", language="fa",
        font_family="Vazirmatn", font_size_pt=12, accent_color="#f4511e",
    )
    db.add(letterhead)

    numbering = LetterNumbering(
        company_id=company.id, name="شماره‌گذاری پیش‌فرض", is_default=True,
        pattern="{kind}/{year}/{seq:04}", prefix="", calendar="jalali", digits="fa",
        reset="yearly", scope="per_kind", start_at=1, separator="/",
    )
    db.add(numbering)
    db.flush()

    templates = {}
    for spec in LETTER_TEMPLATES:
        template = LetterTemplate(
            company_id=company.id, letterhead_id=letterhead.id,
            created_by_id=users["ops@orbit.dev"].id, language="fa", **spec,
        )
        db.add(template)
        db.flush()
        templates[spec["name"]] = template

    letter_specs = [
        {
            "kind": "outgoing", "status": "sent", "days": 12,
            "subject": "درخواست همکاری در پروژه زیرساخت داده",
            "recipient_name": "مهندس رضایی", "recipient_title": "مدیر فناوری اطلاعات",
            "recipient_org": "شرکت مریدین هلث",
            "template": "نامه اداری عمومی",
            "body": (
                "<p>با سلام و احترام،</p>"
                "<p>پیرو مذاکرات انجام‌شده در خصوص پروژه بازطراحی زیرساخت داده، "
                "بدین‌وسیله آمادگی این شرکت جهت همکاری در فازهای طراحی و پیاده‌سازی "
                "اعلام می‌گردد.</p>"
                "<p>خواهشمند است دستور فرمایید نسبت به تعیین جلسه‌ای جهت بررسی "
                "جزئیات فنی اقدام لازم صورت پذیرد.</p>"
            ),
            "author": "ops@orbit.dev", "signer": "admin@orbit.dev",
            "attachment_note": "یک برگ", "delivery": "email",
            "project": "ATLAS",
        },
        {
            "kind": "outgoing", "status": "signed", "days": 5,
            "subject": "گواهی اشتغال به کار",
            "recipient_org": "بانک ملت - شعبه ونک",
            "template": "گواهی اشتغال به کار",
            "body": (
                "<p>بدین‌وسیله گواهی می‌شود جناب آقای لئو نواک با سمت مهندس ارشد "
                "واسط کاربری از تاریخ ۱۴۰۲/۰۵/۱۲ در این شرکت مشغول به کار بوده و "
                "حقوق و مزایای ایشان به‌طور ماهانه پرداخت می‌گردد.</p>"
            ),
            "author": "hr@orbit.dev", "signer": "hr@orbit.dev",
            "attachment_note": "ندارد",
        },
        {
            "kind": "incoming", "status": "received", "days": 9,
            "subject": "استعلام قیمت سامانه گزارش‌ساز",
            "recipient_name": "دبیرخانه شرکت اوربیت",
            "recipient_org": "شرکت کسترل لجستیک",
            "body": (
                "<p>با سلام،</p><p>خواهشمند است قیمت و زمان‌بندی پیاده‌سازی سامانه "
                "گزارش‌ساز مطابق مشخصات پیوست به این شرکت اعلام گردد.</p>"
            ),
            "author": "ops@orbit.dev", "attachment_note": "سه برگ",
        },
        {
            "kind": "internal", "status": "sent", "days": 3,
            "subject": "دعوت به جلسه بررسی مهاجرت داده",
            "recipient_name": "اعضای تیم مهندسی",
            "template": "دعوت به جلسه",
            "body": (
                "<p>با سلام،</p><p>بدین‌وسیله از همکاران گرامی دعوت می‌شود در جلسه "
                "بررسی برنامه مهاجرت داده که روز یکشنبه ساعت ۱۰ در اتاق جلسات الف "
                "برگزار می‌گردد حضور به هم رسانند.</p>"
            ),
            "author": "manager@orbit.dev", "signer": "manager@orbit.dev",
            "delivery": "automation", "project": "ATLAS",
        },
        {
            "kind": "outgoing", "status": "awaiting_signature", "days": 1,
            "subject": "پاسخ به نامه شماره و/۱۴۰۴/۰۰۰۱",
            "recipient_name": "خانم یانسن", "recipient_title": "مدیر تدارکات",
            "recipient_org": "شرکت کسترل لجستیک",
            "template": "پاسخ به استعلام",
            "body": (
                "<p>با سلام و احترام،</p>"
                "<p>بازگشت به استعلام آن شرکت، به استحضار می‌رساند پیشنهاد فنی و مالی "
                "این شرکت به پیوست ارسال می‌گردد. مدت اعتبار پیشنهاد سی روز کاری است.</p>"
            ),
            "author": "sales@orbit.dev", "signer": "admin@orbit.dev",
            "attachment_note": "دوازده برگ", "follow_up": True,
        },
        {
            "kind": "outgoing", "status": "draft", "days": 0,
            "subject": "اعلام تغییر آدرس دفتر مرکزی",
            "recipient_org": "اداره کل پست استان تهران",
            "template": "نامه اداری عمومی",
            "body": "<p>با سلام و احترام،</p><p>بدین‌وسیله به اطلاع می‌رساند…</p>",
            "author": "ops@orbit.dev",
        },
    ]

    created: list[Letter] = []
    for spec in letter_specs:
        template = templates.get(spec.get("template", ""))
        author = users[spec["author"]]
        signer = users.get(spec.get("signer", ""), None)
        letter_date = days_ago(spec["days"])
        letter = Letter(
            company_id=company.id, kind=spec["kind"], status=spec["status"],
            subject=spec["subject"], body=spec["body"],
            salutation=(
                f"جناب آقای/سرکار خانم {spec['recipient_name']}"
                if spec.get("recipient_name") else f"به: {spec.get('recipient_org', '')}"
            ),
            closing=template.closing if template else "با تشکر",
            letter_date=letter_date,
            recipient_name=spec.get("recipient_name"),
            recipient_title=spec.get("recipient_title"),
            recipient_org=spec.get("recipient_org"),
            sender_name=author.full_name, sender_title=author.title,
            author_id=author.id, signer_id=signer.id if signer else None,
            letterhead_id=letterhead.id,
            template_id=template.id if template else None,
            project_id=projects[spec["project"]].id if spec.get("project") else None,
            attachment_note=spec.get("attachment_note"),
            delivery_method=spec.get("delivery"),
            tags=["دبیرخانه"],
        )
        if spec["status"] != "draft":
            number, seq, period = letter_svc.allocate_number(
                db, numbering=numbering, kind=letter.kind, when=letter_date,
            )
            letter.number = number
            letter.number_seq = seq
            letter.number_period = period
            letter.registered_at = NOW - timedelta(days=spec["days"], hours=2)
        if spec["status"] in ("signed", "sent"):
            letter.signed_at = NOW - timedelta(days=spec["days"], hours=1)
        if spec["status"] == "sent":
            letter.sent_at = NOW - timedelta(days=spec["days"])
        db.add(letter)
        db.flush()
        created.append(letter)
        if template:
            template.usage_count += 1
        if letter.project_id:
            graph.link(db, company_id=company.id, from_type="letter", from_id=letter.id,
                       rel_type="relates_to", to_type="project", to_id=letter.project_id)

    # The reply points at the incoming enquiry it answers.
    incoming = next((l for l in created if l.kind == "incoming"), None)
    reply = next((l for l in created if l.subject.startswith("پاسخ")), None)
    if incoming and reply:
        reply.in_reply_to_id = incoming.id
        reply.follow_up_of = incoming.number
        graph.link(db, company_id=company.id, from_type="letter", from_id=reply.id,
                   rel_type="relates_to", to_type="letter", to_id=incoming.id)
    db.flush()


def _seed_support(db: Session, company: Company, users, projects) -> None:
    """Customer logins, their tickets, and uptime monitors on their systems."""
    from app.models.business import CrmCompany

    customers = {
        c.name: c for c in db.scalars(
            select(CrmCompany).where(CrmCompany.company_id == company.id)
        ).all()
    }
    meridian = customers.get("Meridian Health")
    kestrel = customers.get("Kestrel Logistics")
    if not meridian or not kestrel:
        return

    password = hash_password(settings.DEMO_PASSWORD)
    portal_people = [
        ("Anna Weber", "anna@meridian.example", meridian, "Head of IT"),
        ("Peter Jansen", "peter@kestrel.example", kestrel, "Operations Lead"),
    ]
    portal_users = {}
    for full_name, email, customer, title in portal_people:
        person = User(
            company_id=company.id, email=email, password_hash=password,
            full_name=full_name, role="customer", title=title,
            crm_company_id=customer.id, locale="en", theme="dark",
            avatar_color="#2d88e2", is_active=True,
        )
        db.add(person)
        portal_users[email] = person
    db.flush()

    # Two point at something that actually answers, so the demo is not
    # permanently red; one points nowhere, to show a real outage and the ticket
    # it raises.
    monitor_specs = [
        ("Meridian patient portal", "http://orbit-api:8000/health", meridian, "up", 142, 0),
        ("Meridian API gateway", "http://orbit-api:8000/api/v1/openapi.json", meridian,
         "up", 88, 0),
        ("Kestrel warehouse API", "https://api.kestrel.invalid/healthz", kestrel,
         "down", None, 4),
        ("Kestrel tracking site", "http://orbit-api:8000/health", kestrel, "up", 310, 0),
    ]
    monitors = {}
    for name, url, customer, status, response_ms, failures in monitor_specs:
        monitor = Monitor(
            company_id=company.id, crm_company_id=customer.id, name=name, url=url,
            interval_seconds=300, status=status, is_active=True, is_public=True,
            last_checked_at=NOW - timedelta(minutes=rng.randint(1, 5)),
            next_check_at=NOW + timedelta(minutes=5),
            last_response_ms=response_ms, consecutive_failures=failures,
            last_error="ConnectTimeout: timed out after 10s" if failures else None,
            total_checks=rng.randint(2000, 4000),
            failed_checks=rng.randint(1, 40) if status == "up" else rng.randint(60, 120),
        )
        db.add(monitor)
        monitors[name] = monitor
    db.flush()

    ticket_specs = [
        {
            "subject": "Warehouse API returning 502 since 09:10",
            "body": "Our integration is failing. Every call to /v2/shipments returns 502.",
            "status": "open", "priority": "urgent", "customer": kestrel,
            "requester": "peter@kestrel.example", "assignee": "dev@orbit.dev",
            "category": "availability", "hours": 3,
            "replies": [
                ("dev@orbit.dev", "We can see the errors and are on it — the upstream "
                                  "pool is saturated. Updating within the hour.", False),
                ("dev@orbit.dev", "Root cause is the connection pool ceiling we raised "
                                  "last sprint. Needs a config change, not a deploy.", True),
            ],
        },
        {
            "subject": "Please add two users to the reporting module",
            "body": "We have two new analysts who need read access to reporting.",
            "status": "pending_customer", "priority": "normal", "customer": meridian,
            "requester": "anna@meridian.example", "assignee": "ops@orbit.dev",
            "category": "access", "hours": 26,
            "replies": [
                ("ops@orbit.dev", "Happy to. Could you confirm their email addresses "
                                  "and whether they need export rights?", False),
            ],
        },
        {
            "subject": "Invoice INV-2026-0003 does not match our PO",
            "body": "The amount is 28,560 but our purchase order says 24,000.",
            "status": "resolved", "priority": "high", "customer": meridian,
            "requester": "anna@meridian.example", "assignee": "finance@orbit.dev",
            "category": "billing", "hours": 60,
            "replies": [
                ("finance@orbit.dev", "You are right — the extra line was the add-on "
                                      "module. Credit note issued today.", False),
            ],
        },
        {
            "subject": "Export to CSV times out on large date ranges",
            "body": "Anything over three months spins and then fails.",
            "status": "new", "priority": "normal", "customer": kestrel,
            "requester": "peter@kestrel.example", "assignee": None,
            "category": "bug", "hours": 1, "replies": [],
        },
    ]

    for index, spec in enumerate(ticket_specs, start=1):
        opened = NOW - timedelta(hours=spec["hours"])
        ticket = Ticket(
            company_id=company.id, number=f"TKT-{index:04d}",
            subject=spec["subject"], body=spec["body"], status=spec["status"],
            priority=spec["priority"], category=spec["category"], source="portal",
            crm_company_id=spec["customer"].id,
            requester_id=portal_users[spec["requester"]].id,
            assignee_id=users[spec["assignee"]].id if spec["assignee"] else None,
            created_at=opened,
        )
        support_svc.apply_sla(ticket, opened)
        if spec["replies"]:
            ticket.first_response_at = opened + timedelta(minutes=rng.randint(20, 180))
        if spec["status"] in ("resolved", "closed"):
            ticket.resolved_at = opened + timedelta(hours=rng.randint(2, 20))
        db.add(ticket)
        db.flush()

        for author, body, internal in spec["replies"]:
            db.add(TicketMessage(
                company_id=company.id, ticket_id=ticket.id,
                author_id=users[author].id, body=body, is_internal=internal,
                created_at=opened + timedelta(minutes=rng.randint(20, 240)),
            ))
        graph.link(db, company_id=company.id, from_type="ticket", from_id=ticket.id,
                   rel_type="relates_to", to_type="crm_company",
                   to_id=spec["customer"].id)
    db.flush()


def _seed_crm(db: Session, company: Company, users, projects) -> dict:
    customers = {}
    for name, industry, status, value, country, owner in CUSTOMER_SPECS:
        account = CrmCompany(
            company_id=company.id, name=name, industry=industry, status=status,
            website=f"https://{name.lower().replace(' ', '')}.example",
            size=rng.choice(["50-200", "200-1000", "1000+"]), country=country,
            owner_id=users[owner].id, annual_value=value,
            notes=f"{name} operates in {industry.lower()} across {country}.",
        )
        db.add(account)
        db.flush()
        customers[name] = account
        for index in range(rng.randint(1, 3)):
            first = rng.choice(["Anna", "Peter", "Lucia", "Karl", "Ines", "Tom", "Sara"])
            last = rng.choice(["Weber", "Jansen", "Silva", "Novak", "Kowalski", "Larsen"])
            db.add(Contact(
                company_id=company.id, crm_company_id=account.id,
                full_name=f"{first} {last}",
                email=f"{first.lower()}.{last.lower()}@{name.lower().replace(' ', '')}.example",
                phone=f"+49 30 {rng.randint(1000000, 9999999)}",
                title=rng.choice(["CTO", "Head of Operations", "Procurement Lead",
                                  "Data Lead", "CFO"]),
                is_primary=1 if index == 0 else 0,
            ))

    deal_specs = [
        ("Meridian Health", "Platform renewal 2027", "negotiation", 180000, 70, 35),
        ("Kestrel Logistics", "Warehouse analytics expansion", "proposal", 90000, 50, 50),
        ("Cobalt Energy", "Enterprise rollout", "qualification", 320000, 25, 90),
        ("Larkspur Retail", "Pilot programme", "proposal", 60000, 55, 40),
        ("Northwind Cloud", "Add-on: anomaly detection", "won", 48000, 100, -12),
        ("Juniper Media", "Initial subscription", "qualification", 45000, 20, 75),
        ("Ardent Manufacturing", "Data platform evaluation", "lost", 150000, 0, -30),
    ]
    for account_name, title, stage, value, probability, close_offset in deal_specs:
        account = customers[account_name]
        deal = Deal(
            company_id=company.id, crm_company_id=account.id, title=title, stage=stage,
            value=value, probability=probability, owner_id=account.owner_id,
            expected_close=days_ahead(close_offset) if close_offset > 0
            else days_ago(-close_offset),
            closed_at=NOW - timedelta(days=abs(close_offset))
            if stage in ("won", "lost") else None,
            notes=f"{title} for {account_name}.",
        )
        db.add(deal)
        db.flush()
        graph.link(db, company_id=company.id, from_type="crm_company", from_id=account.id,
                   rel_type="owns", to_type="deal", to_id=deal.id)
        db.add(CrmActivity(
            company_id=company.id, crm_company_id=account.id, deal_id=deal.id,
            type=rng.choice(["call", "email", "meeting"]),
            subject=f"Follow-up on {title}",
            body="Discussed scope, timeline and the security review checklist.",
            occurred_at=NOW - timedelta(days=rng.randint(1, 30)),
            user_id=account.owner_id,
        ))

    contract_specs = [
        ("Meridian Health", "Meridian platform agreement 2026", "active", 180000, "ATLAS"),
        ("Kestrel Logistics", "Kestrel analytics agreement", "active", 240000, "NOVA"),
        ("Northwind Cloud", "Northwind add-on order form", "active", 48000, None),
    ]
    for account_name, title, status, value, project_key in contract_specs:
        account = customers[account_name]
        contract = Contract(
            company_id=company.id, crm_company_id=account.id, title=title,
            number=f"CT-{rng.randint(1000, 9999)}", status=status, value=value,
            start_date=days_ago(rng.randint(60, 300)), end_date=days_ahead(rng.randint(60, 400)),
            project_id=projects[project_key].id if project_key else None,
            terms="Annual subscription, net 30, 99.9% uptime commitment.",
        )
        db.add(contract)
        db.flush()
        graph.link(db, company_id=company.id, from_type="crm_company", from_id=account.id,
                   rel_type="owns", to_type="contract", to_id=contract.id)
        if contract.project_id:
            graph.link(db, company_id=company.id, from_type="contract", from_id=contract.id,
                       rel_type="creates", to_type="project", to_id=contract.project_id)
    db.flush()
    return customers


EXPENSE_CATEGORIES = [
    ("Salaries", "#2d88e2"), ("Infrastructure", "#00a7b5"), ("Software", "#946ad5"),
    ("Marketing", "#b2468b"), ("Travel", "#8b6000"), ("Office", "#5d6b85"),
    ("Hardware", "#61a746"), ("Professional services", "#007f60"),
]
INCOME_CATEGORIES = [("Subscriptions", "#f5501b"), ("Services", "#61a746"),
                     ("Support", "#2d88e2")]


def _seed_finance(db: Session, company: Company, users, projects, customers) -> None:
    accounts = {}
    for name, kind, balance in [
        ("Operating account", "bank", 842000), ("Payroll account", "bank", 210000),
        ("Company card", "card", -14200), ("Petty cash", "cash", 3200),
    ]:
        account = FinanceAccount(company_id=company.id, name=name, type=kind, balance=balance,
                                 account_number=f"DE{rng.randint(10**8, 10**9)}")
        db.add(account)
        accounts[name] = account

    categories = {}
    for name, color in EXPENSE_CATEGORIES:
        category = FinanceCategory(company_id=company.id, name=name, kind="expense", color=color)
        db.add(category)
        categories[name] = category
    for name, color in INCOME_CATEGORIES:
        category = FinanceCategory(company_id=company.id, name=name, kind="income", color=color)
        db.add(category)
        categories[name] = category

    vendors = {}
    for name, category, email in [
        ("Northwind Cloud", "Infrastructure", "billing@northwind.example"),
        ("TechSupply Ltd", "Hardware", "orders@techsupply.example"),
        ("Bright Legal", "Professional services", "accounts@brightlegal.example"),
        ("Pulse Marketing", "Marketing", "hello@pulsemarketing.example"),
        ("Deskspace GmbH", "Office", "invoices@deskspace.example"),
        ("Atlas Analytics SaaS", "Software", "billing@atlasanalytics.example"),
    ]:
        vendor = Vendor(company_id=company.id, name=name, category=category, email=email,
                        rating=rng.randint(3, 5),
                        website=f"https://{name.lower().replace(' ', '')}.example")
        db.add(vendor)
        vendors[name] = vendor
    db.flush()

    expense_plan = [
        ("Salaries", 148000, 152000, None, None),
        ("Infrastructure", 12000, 21000, "ATLAS", "Northwind Cloud"),
        ("Software", 4200, 6800, None, "Atlas Analytics SaaS"),
        ("Marketing", 6000, 12000, None, "Pulse Marketing"),
        ("Travel", 1500, 5200, None, None),
        ("Office", 7800, 8200, None, "Deskspace GmbH"),
        ("Hardware", 900, 6400, "ATLAS", "TechSupply Ltd"),
        ("Professional services", 2000, 9000, None, "Bright Legal"),
    ]
    project_cycle = ["ATLAS", "NOVA", "ORION", "HELIO", None]
    for month_offset in range(6, -1, -1):
        month_start = (TODAY.replace(day=1) - timedelta(days=31 * month_offset)).replace(day=1)
        for category_name, low, high, fixed_project, vendor_name in expense_plan:
            occurrences = 1 if category_name == "Salaries" else rng.randint(2, 4)
            for _ in range(occurrences):
                amount = round(rng.uniform(low, high) / occurrences, 2)
                project_key = fixed_project or rng.choice(project_cycle)
                day = min(rng.randint(1, 28), 28)
                db.add(Transaction(
                    company_id=company.id, kind="expense",
                    description=f"{category_name} — {month_start.strftime('%B %Y')}",
                    amount=amount, occurred_on=month_start.replace(day=day), status="posted",
                    account_id=accounts["Operating account"].id,
                    category_id=categories[category_name].id,
                    project_id=projects[project_key].id if project_key else None,
                    vendor_id=vendors[vendor_name].id if vendor_name else None,
                    created_by_id=users["finance@orbit.dev"].id,
                ))
        for customer_name, base in [("Meridian Health", 58000), ("Kestrel Logistics", 74000),
                                    ("Northwind Cloud", 26000), ("Larkspur Retail", 11000)]:
            db.add(Transaction(
                company_id=company.id, kind="income",
                description=f"Subscription — {customer_name}",
                amount=round(base * rng.uniform(0.95, 1.12), 2),
                occurred_on=month_start.replace(day=rng.randint(2, 12)), status="posted",
                account_id=accounts["Operating account"].id,
                category_id=categories["Subscriptions"].id,
                customer_id=customers[customer_name].id,
                created_by_id=users["finance@orbit.dev"].id,
            ))
        if month_offset % 2 == 0:
            db.add(Transaction(
                company_id=company.id, kind="income", description="Implementation services",
                amount=round(rng.uniform(18000, 42000), 2),
                occurred_on=month_start.replace(day=rng.randint(10, 25)), status="posted",
                account_id=accounts["Operating account"].id,
                category_id=categories["Services"].id,
                project_id=projects["NOVA"].id,
                created_by_id=users["finance@orbit.dev"].id,
            ))

    for index, (customer_name, amount, status, due_offset) in enumerate([
        ("Meridian Health", 45000, "paid", -30),
        ("Kestrel Logistics", 60000, "sent", 12),
        ("Northwind Cloud", 24000, "overdue", -9),
        ("Meridian Health", 45000, "sent", 26),
        ("Larkspur Retail", 15000, "draft", 40),
    ], start=1):
        invoice = Invoice(
            company_id=company.id, number=f"INV-{TODAY.year}-{index:04d}", direction="outgoing",
            status=status, customer_id=customers[customer_name].id,
            lines=[{"description": "Platform subscription — quarterly", "qty": 1,
                    "unit_price": amount}],
            subtotal=amount, tax_rate=0.19, total=round(amount * 1.19, 2),
            issued_on=days_ago(abs(due_offset) + 30),
            due_on=days_ahead(due_offset) if due_offset > 0 else days_ago(-due_offset),
            paid_on=days_ago(abs(due_offset)) if status == "paid" else None,
            notes="Thank you for your business.",
        )
        db.add(invoice)
        db.flush()
        graph.link(db, company_id=company.id, from_type="crm_company",
                   from_id=invoice.customer_id, rel_type="generates", to_type="invoice",
                   to_id=invoice.id)

    for project_key, name, amount in [
        ("ATLAS", "Atlas project budget", 250000), ("NOVA", "Nova project budget", 120000),
        ("ORION", "Orion project budget", 75000), ("HELIO", "Helios project budget", 90000),
    ]:
        db.add(Budget(
            company_id=company.id, name=name, amount=amount,
            period_start=TODAY.replace(month=1, day=1), period_end=TODAY.replace(month=12, day=31),
            project_id=projects[project_key].id,
        ))
    db.add(Budget(
        company_id=company.id, name="Infrastructure — annual", amount=180000,
        period_start=TODAY.replace(month=1, day=1), period_end=TODAY.replace(month=12, day=31),
        category_id=categories["Infrastructure"].id,
    ))
    db.flush()


def _seed_assets(db: Session, company: Company, users) -> None:
    specs = [
        ("MacBook Pro 16\" M3", "laptop", "dev@orbit.dev", 3200, "in_use"),
        ("MacBook Pro 14\" M3", "laptop", "leo@orbit.dev", 2600, "in_use"),
        ("MacBook Air M2", "laptop", "design@orbit.dev", 1500, "in_use"),
        ("ThinkPad X1 Carbon", "laptop", "priya@orbit.dev", 2100, "in_use"),
        ("ThinkPad T14", "laptop", "hr@orbit.dev", 1400, "in_use"),
        ("Dell XPS 15", "laptop", None, 1900, "available"),
        ("iPhone 15 Pro", "phone", "sales@orbit.dev", 1200, "in_use"),
        ("iPhone 14", "phone", "marcus@orbit.dev", 900, "in_use"),
        ("Pixel 8", "phone", "pm@orbit.dev", 800, "in_use"),
        ("GPU workstation (RTX 4090)", "server", "researcher@orbit.dev", 6800, "in_use"),
        ("Build server", "server", None, 4200, "in_use"),
        ("Office van", "vehicle", "ops@orbit.dev", 28000, "in_use"),
        ("Figma organisation licence", "license", "design@orbit.dev", 5400, "in_use"),
        ("JetBrains all-products pack", "license", "manager@orbit.dev", 3200, "in_use"),
        ("orbit.dev domain", "domain", "admin@orbit.dev", 120, "in_use"),
        ("Conference room display", "equipment", None, 1800, "maintenance"),
        ("Old build server", "server", None, 3000, "retired"),
    ]
    for name, category, owner, cost, status in specs:
        purchase = days_ago(rng.randint(90, 900))
        asset = Asset(
            company_id=company.id, name=name, tag=f"ORB-{rng.randint(1000, 9999)}",
            category=category, serial_number=uuid.uuid4().hex[:12].upper(), status=status,
            owner_id=users[owner].id if owner else None,
            location=rng.choice(["Berlin office", "Remote", "Data centre", "Lisbon office"]),
            purchase_date=purchase, cost=cost,
            warranty_until=purchase + timedelta(days=rng.choice([365, 730, 1095])),
            notes=f"{name} tracked in the asset register.",
            maintenance=[{"date": days_ago(rng.randint(10, 200)).isoformat(),
                          "note": "Routine service", "cost": 120}]
            if status == "maintenance" else [],
        )
        db.add(asset)
        db.flush()
        if asset.owner_id:
            graph.link(db, company_id=company.id, from_type="user", from_id=asset.owner_id,
                       rel_type="owns", to_type="asset", to_id=asset.id)

    for index, (title, status, total) in enumerate([
        ("Load testing SaaS licence", "ordered", 4800),
        ("Engineering laptops (batch of 3)", "delivered", 8100),
        ("Office chairs", "invoiced", 2400),
    ], start=1):
        db.add(PurchaseOrder(
            company_id=company.id, number=f"PO-{TODAY.year}-{index:04d}", title=title,
            status=status, created_by_id=users["ops@orbit.dev"].id,
            lines=[{"description": title, "qty": 1, "unit_price": total}], total=total,
            ordered_on=days_ago(rng.randint(5, 45)),
            expected_on=days_ahead(rng.randint(3, 20)),
            delivered_on=days_ago(rng.randint(1, 10)) if status != "ordered" else None,
        ))
    db.flush()


def _seed_people_ops(db: Session, company: Company, users) -> None:
    leave_specs = [
        ("leo@orbit.dev", "vacation", 12, 19, "approved", "Summer holiday"),
        ("dev@orbit.dev", "vacation", -4, -1, "pending", "Long weekend"),
        ("design@orbit.dev", "sick", -9, -8, "approved", None),
        ("marcus@orbit.dev", "remote", 3, 5, "pending", "Working from Porto"),
        ("priya@orbit.dev", "vacation", 30, 40, "pending", "Family trip"),
        ("ops@orbit.dev", "vacation", -25, -20, "approved", "Recharge"),
    ]
    for email, kind, start_offset, end_offset, status, reason in leave_specs:
        user = users[email]
        start = days_ahead(start_offset) if start_offset > 0 else days_ago(-start_offset)
        end = days_ahead(end_offset) if end_offset > 0 else days_ago(-end_offset)
        db.add(LeaveRequest(
            company_id=company.id, user_id=user.id, type=kind, start_date=start, end_date=end,
            days=(end - start).days + 1, reason=reason, status=status,
            approver_id=user.manager_id,
            decided_at=NOW - timedelta(days=2) if status != "pending" else None,
        ))

    for email in ["dev@orbit.dev", "leo@orbit.dev", "priya@orbit.dev", "design@orbit.dev"]:
        for offset in range(1, 21):
            work_date = days_ago(offset)
            if work_date.weekday() >= 5:
                continue
            db.add(AttendanceRecord(
                company_id=company.id, user_id=users[email].id, work_date=work_date,
                check_in=datetime.combine(work_date, datetime.min.time(), UTC)
                + timedelta(hours=rng.randint(8, 10)),
                check_out=datetime.combine(work_date, datetime.min.time(), UTC)
                + timedelta(hours=rng.randint(17, 19)),
                hours=round(rng.uniform(7.5, 8.8), 2),
                status=rng.choices(["present", "remote"], weights=[0.6, 0.4])[0],
            ))

    onboarding = [
        ("Set up laptop and accounts", "ops@orbit.dev", "done"),
        ("Read the employee handbook", "hr@orbit.dev", "done"),
        ("Meet the team", "manager@orbit.dev", "pending"),
        ("First-week goals with manager", "manager@orbit.dev", "pending"),
        ("Security training", "admin@orbit.dev", "pending"),
    ]
    for index, (title, owner, status) in enumerate(onboarding):
        db.add(OnboardingItem(
            company_id=company.id, user_id=users["tomas@orbit.dev"].id, kind="onboarding",
            title=title, owner_id=users[owner].id, due_date=days_ahead(index + 2),
            status=status, order_index=index,
        ))
    db.flush()


def _seed_goals(db: Session, company: Company, users, departments, projects) -> None:
    period = f"Q{((TODAY.month - 1) // 3) + 1} {TODAY.year}"
    company_goals = [
        ("Make the platform the single source of truth for customer data",
         "admin@orbit.dev",
         [("Streaming ingest live for all core datasets", 0, 7, 10, "datasets"),
          ("Data freshness under 5 minutes", 1440, 12, 5, "minutes"),
          ("Legacy warehouse decommissioned", 0, 0, 1, "cluster")]),
        ("Grow annual recurring revenue by 40%",
         "sales@orbit.dev",
         [("New ARR closed", 0, 268000, 600000, "USD"),
          ("Logo retention", 88, 94, 96, "%"),
          ("Pipeline coverage", 1.4, 2.6, 3.0, "x")]),
        ("Make Orbit a place engineers recommend",
         "hr@orbit.dev",
         [("Engineering eNPS", 20, 41, 50, "points"),
          ("Time to first commit for new hires", 12, 6, 5, "days")]),
    ]
    parents = {}
    for objective, owner, key_results in company_goals:
        goal = Goal(
            company_id=company.id, objective=objective, level="company",
            owner_id=users[owner].id, period=period, due_date=days_ahead(60),
            description="Company-level objective for the current quarter.",
        )
        db.add(goal)
        db.flush()
        for title, start, current, target, unit in key_results:
            db.add(KeyResult(goal_id=goal.id, title=title, start_value=start,
                             current_value=current, target_value=target, unit=unit,
                             owner_id=users[owner].id))
        parents[objective] = goal

    child_goals = [
        ("Ship the Atlas streaming pipeline", "Engineering", "manager@orbit.dev",
         "Make the platform the single source of truth for customer data", "ATLAS",
         [("Ingest consumer running in production", 0, 1, 1, "service"),
          ("Load test passed at 50k events/sec", 0, 0, 1, "test"),
          ("Data contracts documented", 0, 6, 10, "contracts")]),
        ("Launch the Nova customer portal beta", "Product", "pm@orbit.dev",
         "Grow annual recurring revenue by 40%", "NOVA",
         [("Beta customers onboarded", 0, 3, 5, "customers"),
          ("Portal weekly active customers", 0, 22, 60, "accounts")]),
        ("Close two enterprise deals", "Sales", "sales@orbit.dev",
         "Grow annual recurring revenue by 40%", None,
         [("Enterprise deals closed", 0, 1, 2, "deals"),
          ("Average deal size", 60000, 114000, 150000, "USD")]),
        ("Reduce onboarding friction", "HR", "hr@orbit.dev",
         "Make Orbit a place engineers recommend", None,
         [("Onboarding checklist automated", 0, 0, 1, "workflow"),
          ("New hire satisfaction", 3.4, 4.2, 4.5, "of 5")]),
    ]
    for objective, department, owner, parent, project_key, key_results in child_goals:
        goal = Goal(
            company_id=company.id, objective=objective, level="department",
            parent_id=parents[parent].id, owner_id=users[owner].id,
            department_id=departments[department].id,
            project_id=projects[project_key].id if project_key else None,
            period=period, due_date=days_ahead(60),
        )
        db.add(goal)
        db.flush()
        for title, start, current, target, unit in key_results:
            db.add(KeyResult(goal_id=goal.id, title=title, start_value=start,
                             current_value=current, target_value=target, unit=unit,
                             owner_id=users[owner].id))
        if goal.project_id:
            graph.link(db, company_id=company.id, from_type="goal", from_id=goal.id,
                       rel_type="relates_to", to_type="project", to_id=goal.project_id)
    db.flush()

    from app.api.v1.goals import recalc

    for goal in db.scalars(select(Goal).where(Goal.company_id == company.id)).all():
        recalc(db, goal)
    db.flush()


def _seed_activity(db: Session, company: Company, users, projects, tasks, ideas, research) -> None:
    """Audit trail and inbox items so both views are populated on first login."""
    entries = [
        ("manager@orbit.dev", "status_changed", "project", projects["ATLAS"].id,
         "Project Atlas health changed to at risk",
         {"health": {"from": "on_track", "to": "at_risk"}}, 2),
        ("dev@orbit.dev", "status_changed", "task", tasks["ATLAS-4"].id,
         "ATLAS-4 moved to in progress",
         {"status": {"from": "todo", "to": "in_progress"}}, 3),
        ("priya@orbit.dev", "created", "task", tasks["ATLAS-6"].id,
         "Created ATLAS-6: Backfill historical events", {}, 5),
        ("pm@orbit.dev", "created", "idea", ideas["Self-service data exports"].id,
         "Submitted idea Self-service data exports", {}, 12),
        ("researcher@orbit.dev", "status_changed", "experiment", None,
         "Experiment #2 validated", {"status": {"from": "running", "to": "validated"}}, 18),
        ("finance@orbit.dev", "created", "transaction", None,
         "Expense 21,400.00 — Infrastructure", {}, 4),
        ("admin@orbit.dev", "approved", "request", None,
         "Approved purchase request: MacBook Pro 16\" M4", {}, 1),
        ("hr@orbit.dev", "created", "user", users["tomas@orbit.dev"].id,
         "Created user Tomas Berg (rd)", {}, 30),
    ]
    for email, action, entity_type, entity_id, summary, changes, days in entries:
        db.add(AuditLog(
            company_id=company.id, actor_id=users[email].id, action=action,
            entity_type=entity_type, entity_id=entity_id, summary=summary, changes=changes,
            ip_address=f"10.0.{rng.randint(0, 4)}.{rng.randint(2, 250)}",
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
            created_at=NOW - timedelta(days=days, hours=rng.randint(0, 12)),
        ))

    inbox = [
        ("admin@orbit.dev", "task_assigned", "ATLAS-11: Load test at 50k events/sec",
         "Daniel Reed assigned this task to you.", "manager@orbit.dev", "/tasks", 6, False),
        ("admin@orbit.dev", "mention", "Maya Chen mentioned you on ATLAS-4",
         "@Ava can you confirm the cutover window with Meridian?", "dev@orbit.dev",
         "/tasks", 20, False),
        ("admin@orbit.dev", "rd_result", "Experiment #2 validated",
         "Isolation forest on 30-day windows reached 0.79 recall.", "researcher@orbit.dev",
         "/experiments", 30, True),
        ("admin@orbit.dev", "customer_response", "Meridian Health replied on the renewal",
         "They want the security review completed before signing.", "sales@orbit.dev",
         "/crm", 48, True),
        ("admin@orbit.dev", "system_alert", "Invoice INV-2026-0003 is overdue",
         "Northwind Cloud is 9 days past due for 28,560.00.", None, "/finance", 12, False),
        ("manager@orbit.dev", "approval_request", "Approval needed: Load testing SaaS licence",
         "Finance approval step is waiting for you.", "priya@orbit.dev", "/approvals", 8, False),
        ("dev@orbit.dev", "task_assigned", "ATLAS-5: Consumer drops events under backpressure",
         "Daniel Reed assigned this bug to you.", "manager@orbit.dev", "/tasks", 26, False),
        ("finance@orbit.dev", "expense_approval", "Expense claim: Conference ticket",
         "Leo Novak submitted a 690.00 expense claim.", "leo@orbit.dev", "/approvals", 30, False),
        ("hr@orbit.dev", "leave_request", "Leave request from Maya Chen",
         "vacation · 4 days", "dev@orbit.dev", "/hr", 14, False),
    ]
    for email, kind, title, body, actor, url, hours, read in inbox:
        from app.services.notifications import CATEGORY_BY_TYPE

        db.add(Notification(
            company_id=company.id, user_id=users[email].id, type=kind,
            category=CATEGORY_BY_TYPE.get(kind, "general"), title=title, body=body,
            url=url, actor_id=users[actor].id if actor else None,
            priority="high" if kind in ("approval_request", "system_alert") else "normal",
            read_at=NOW - timedelta(hours=hours // 2) if read else None,
            created_at=NOW - timedelta(hours=hours),
        ))
    db.flush()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    seed_if_empty()
