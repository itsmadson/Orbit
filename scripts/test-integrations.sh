#!/usr/bin/env bash
# Issue-tracker sync, exercised end to end against an in-memory tracker.
#   ./scripts/test-integrations.sh [api_container]
# No GitHub / GitLab / Jira account is needed: a fake connector stands in for
# the remote API, and everything from there down (linking, import, status
# mapping, push, pull, conflict rule, token encryption) is the real code on the
# real database. All rows are rolled back at the end.
set -euo pipefail
CONTAINER="${1:-${ORBIT_API_CONTAINER:-orbit-api}}"

docker exec -i "$CONTAINER" python - <<'PY'
import sys
from datetime import UTC, datetime

from sqlalchemy import select

from app.core.db import SessionLocal
from app.models.identity import User
from app.models.system import ExternalIssue, Integration, IntegrationLink
from app.models.work import Project, Task, TaskStatus
from app.services import task_status
from app.services.integrations import CONNECTORS, RemoteComment, RemoteIssue, RemoteProject, crypto
from app.services.integrations import sync
from app.services.integrations.github import GitHubConnector
from app.services.integrations.gitlab import GitLabConnector
from app.services.integrations.jira import JiraConnector

GREEN, RED, CYAN, RESET = "\033[32m", "\033[31m", "\033[36m", "\033[0m"
failures = 0


def ok(label, condition, detail=""):
    global failures
    if not condition:
        failures += 1
    print(f"  {GREEN + '✓' + RESET if condition else RED + '✗' + RESET} {label}"
          f"{(' — ' + str(detail)) if detail else ''}")


class FakeTracker:
    """The remote side: a dict of issues, and a log of what Orbit wrote to it."""

    provider, label = "github", "GitHub"

    def __init__(self):
        self.issues: dict[str, RemoteIssue] = {}
        self.comments: list[tuple[str, str]] = []
        self.writes: list[tuple] = []
        self.counter = 0

    def add(self, title, category="open", state="open", body="", **extra):
        self.counter += 1
        issue = RemoteIssue(id=str(self.counter), title=title, body=body, category=category,
                            state=state, url=f"https://example.test/{self.counter}",
                            updated_at=datetime.now(UTC), remote_key="acme/app", **extra)
        self.issues[issue.id] = issue
        return issue

    def whoami(self): return {"login": "octocat", "name": "Octo Cat"}
    def list_projects(self, query=None): return [RemoteProject("acme/app", "acme/app")]
    def list_issues(self, remote_key, *, since=None, state="all", limit=200):
        return list(self.issues.values())[:limit]
    def get_issue(self, remote_key, issue_id): return self.issues[issue_id]

    def create_issue(self, remote_key, *, title, body=None, labels=None, type=None):
        self.writes.append(("create", title))
        return self.add(title, body=body or "")

    def update_issue(self, remote_key, issue_id, *, title=None, body=None, category=None,
                     status_name=None, labels=None):
        self.writes.append(("update", issue_id, title, body, category, status_name))
        issue = self.issues[issue_id]
        if title is not None: issue.title = title
        if body is not None: issue.body = body
        if category:
            issue.category = category
            issue.state = "closed" if category in ("done", "cancelled") else "open"
        return issue

    def list_comments(self, remote_key, issue_id): return []
    def add_comment(self, remote_key, issue_id, body):
        self.comments.append((issue_id, body))
        return RemoteComment(id="1", body=body)


def _try(function):
    """True when the call was refused for leaving the tracker's own host."""
    try:
        function()
    except Exception as exc:
        return "other than" in str(exc)
    return False


db = SessionLocal()
try:
    admin = db.scalar(select(User).where(User.email == "admin@orbit.dev"))
    project = db.scalar(select(Project).where(Project.company_id == admin.company_id,
                                               Project.deleted_at.is_(None)))
    company = admin.company_id
    tracker = FakeTracker()
    sync.connector_for = lambda *_args, **_kwargs: tracker   # the only thing faked

    print(f"{CYAN}Tokens at rest{RESET}")
    sealed = crypto.encrypt("ghp_supersecrettoken1234")
    ok("a token is not stored in the clear", "supersecret" not in sealed)
    ok("it decrypts to the original", crypto.decrypt(sealed) == "ghp_supersecrettoken1234")
    ok("a tampered value decrypts to nothing", crypto.decrypt(sealed[:-4] + "AAAA") is None)
    ok("the UI only ever gets the tail", crypto.mask("ghp_supersecrettoken1234") == "…1234")

    print(f"{CYAN}Connectors normalise each tracker's vocabulary{RESET}")
    gh = GitHubConnector._issue({"number": 7, "title": "Crash", "state": "closed",
                                 "state_reason": "not_planned", "labels": [{"name": "bug"}],
                                 "pull_request": None}, "acme/app")
    ok("GitHub: closed as not planned is cancelled, not done", gh.category == "cancelled")
    ok("GitHub: a bug label makes it a bug", gh.type == "bug")
    gl = GitLabConnector._issue({"iid": 3, "title": "x", "state": "opened",
                                 "labels": ["Doing"]}, "g/p")
    ok("GitLab: an open issue labelled Doing is started", gl.category == "started")
    jira = JiraConnector(token="t", base_url="https://x.atlassian.net", username="a@b.c")
    ji = jira._issue({"key": "ENG-9", "fields": {
        "summary": "Ship", "status": {"name": "In QA", "statusCategory": {"key": "indeterminate"}},
        "priority": {"name": "Highest"}, "issuetype": {"name": "Story"},
        "updated": "2026-10-01T10:00:00.000+0000"}})
    ok("Jira: status category indeterminate is started", ji.category == "started", ji.state)
    ok("Jira: Highest maps to urgent, and +0000 timestamps parse",
       ji.priority == "urgent" and ji.updated_at is not None)
    ok("a connector refuses to call any host but its own",
       _try(lambda: jira.request("GET", "https://evil.test/steal")))

    print(f"{CYAN}Linking a project imports its issues{RESET}")
    tracker.add("Login page crashes on Safari", body="Steps…", type="bug")
    tracker.add("Add dark mode", category="done", state="closed")
    db.add(Integration(company_id=company, provider="github", status="connected",
                       config={"secret": sealed}))
    link = IntegrationLink(company_id=company, project_id=project.id, provider="github",
                           remote_key="acme/app", auto_sync=True)
    db.add(link)
    db.flush()
    stats = sync.sync_link(db, link, actor=admin, full=True)
    ok("both issues become tasks", stats["imported"] == 2, stats)
    twins = {e.remote_id: db.get(Task, e.task_id) for e in db.scalars(
        select(ExternalIssue).where(ExternalIssue.link_id == link.id)).all()}
    ok("an open issue lands in an open column",
       task_status.category_of(db, company, twins["1"].status) == "open", twins["1"].status)
    ok("a closed issue lands in a done column with a completion time",
       task_status.category_of(db, company, twins["2"].status) == "done"
       and twins["2"].completed_at is not None)
    ok("type and project carry over",
       twins["1"].type == "bug" and twins["1"].project_id == project.id
       and twins["1"].key.startswith(project.key))
    ok("syncing again imports nothing twice",
       sync.sync_link(db, link, actor=admin, full=True)["imported"] == 0)

    print(f"{CYAN}Orbit → tracker{RESET}")
    task = twins["1"]
    task.title = "Login page crashes on Safari 17"
    task.status = "done"
    db.flush()
    errors = sync.push_task(db, task)
    ok("an edit is pushed without error", errors == [], errors)
    ok("the remote title and state follow",
       tracker.issues["1"].title.endswith("17") and tracker.issues["1"].state == "closed")
    writes = len(tracker.writes)
    sync.push_task(db, task)
    ok("an unchanged task is not pushed again", len(tracker.writes) == writes)
    sync.push_comment(db, task, admin, "Fixed in 4.2")
    ok("a comment is mirrored, attributed to its author",
       tracker.comments and admin.full_name in tracker.comments[-1][1])

    print(f"{CYAN}Tracker → Orbit{RESET}")
    tracker.issues["1"].category, tracker.issues["1"].state = "open", "open"
    tracker.issues["1"].title = "Reopened: Safari crash"
    stats = sync.sync_link(db, link, actor=admin, full=True)
    db.refresh(task)
    ok("a remote reopen moves the task out of done",
       task_status.category_of(db, company, task.status) == "open" and task.completed_at is None,
       task.status)
    ok("the remote title is pulled in", task.title == "Reopened: Safari crash", stats)

    print(f"{CYAN}Custom statuses map by name and by category{RESET}")
    db.add(TaskStatus(company_id=company, key="zz_qa", name="In QA", category="started",
                      color="#00a7b5", order_index=50, is_system=False))
    db.flush()
    tracker.issues["1"].category, tracker.issues["1"].state = "started", "In QA"
    sync.sync_link(db, link, actor=admin, full=True)
    db.refresh(task)
    ok("a remote status named like a custom column lands in that column",
       task.status == "zz_qa", task.status)
    task.status = "done"
    db.flush()
    sync.push_task(db, task)
    ok("moving it to Done in Orbit closes the remote issue",
       tracker.issues["1"].category == "done")

    print(f"{CYAN}Both sides changed{RESET}")
    task.description = "Edited in Orbit"
    db.flush()
    tracker.issues["1"].title = "Edited on the tracker"
    stats = sync.sync_link(db, link, actor=admin, full=True)
    db.refresh(task)
    ok("each side keeps the field it changed",
       task.title == "Edited on the tracker" and tracker.issues["1"].body == "Edited in Orbit",
       (task.title, tracker.issues["1"].body, stats))

    print(f"{CYAN}Publishing an Orbit task{RESET}")
    local = Task(company_id=company, project_id=project.id, key=f"{project.key}-99901",
                 title="Write the migration guide", status="in_progress", type="task")
    db.add(local)
    db.flush()
    external = sync.publish_task(db, local, link)
    ok("the remote issue is created and remembered",
       external.remote_id in tracker.issues and external.task_id == local.id)

    print(f"{CYAN}A tracker that is down{RESET}")
    from app.services.integrations import IntegrationError

    def broken(*_a, **_k):
        raise IntegrationError("Could not reach GitHub: ConnectTimeout")
    sync.connector_for = broken
    task.title = "Edited while GitHub was down"
    db.flush()
    errors = sync.push_task(db, task)
    ok("a failed push reports the error instead of raising", len(errors) == 1, errors)
    stats = sync.sync_link(db, link, actor=admin)
    db.refresh(link)
    ok("a failed sync is recorded on the link", bool(link.last_error) and stats["errors"] == 1)
finally:
    db.rollback()       # nothing above is kept
    db.close()

print()
print(f"{GREEN}integrations: all checks passed{RESET}" if not failures
      else f"{RED}integrations: {failures} check(s) failed{RESET}")
sys.exit(1 if failures else 0)
PY
