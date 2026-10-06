from datetime import datetime
from urllib.parse import quote

from app.services.integrations.base import (
    Connector, RemoteComment, RemoteIssue, RemoteProject, parse_time,
)

#: GitLab has two states; teams mark "in progress" with a label. These are the
#: common spellings, matched case-insensitively.
STARTED_LABELS = {"doing", "in progress", "in-progress", "wip", "in review", "review",
                  "workflow::in dev", "workflow::in review"}
CANCELLED_LABELS = {"wontfix", "won't fix", "invalid", "duplicate", "cancelled", "canceled"}


class GitLabConnector(Connector):
    provider = "gitlab"
    label = "GitLab"
    default_base_url = "https://gitlab.com"
    needs_base_url = True

    @property
    def api_root(self):
        return f"{self.base_url}/api/v4"

    def _headers(self):
        return {"private-token": self.token}

    @staticmethod
    def _path(remote_key: str) -> str:
        return quote(remote_key, safe="")

    def whoami(self):
        me = self.request("GET", "/user")
        return {"login": me.get("username"), "name": me.get("name") or me.get("username")}

    def list_projects(self, query=None):
        params = {"membership": "true", "per_page": 100, "order_by": "last_activity_at",
                  "simple": "true"}
        if query:
            params["search"] = query
        return [
            RemoteProject(key=p["path_with_namespace"], name=p.get("name_with_namespace")
                          or p["path_with_namespace"], url=p.get("web_url"),
                          description=p.get("description"))
            for p in self.request("GET", "/projects", params=params) or []
        ]

    @staticmethod
    def _issue(raw: dict, remote_key: str) -> RemoteIssue:
        labels = list(raw.get("labels") or [])
        lowered = {label.lower() for label in labels}
        if raw.get("state") == "closed":
            category = "cancelled" if lowered & CANCELLED_LABELS else "done"
        else:
            category = "started" if lowered & STARTED_LABELS else "open"
        assignee = raw.get("assignee") or {}
        kind = (raw.get("issue_type") or raw.get("type") or "issue").lower()
        return RemoteIssue(
            id=str(raw["iid"]), title=raw.get("title") or "", body=raw.get("description"),
            category=category, state=raw.get("state", "opened"), url=raw.get("web_url"),
            assignee_name=assignee.get("name") or assignee.get("username"),
            assignee_email=assignee.get("email"), labels=labels,
            type="bug" if ("bug" in lowered or kind == "incident") else "task",
            updated_at=parse_time(raw.get("updated_at")),
            created_at=parse_time(raw.get("created_at")), remote_key=remote_key,
        )

    def list_issues(self, remote_key, *, since: datetime | None = None, state="all", limit=200):
        issues: list[RemoteIssue] = []
        page = 1
        while len(issues) < limit:
            params = {"per_page": 100, "page": page, "order_by": "updated_at", "sort": "desc"}
            if state in ("open", "opened"):
                params["state"] = "opened"
            elif state == "closed":
                params["state"] = "closed"
            if since:
                params["updated_after"] = since.strftime("%Y-%m-%dT%H:%M:%SZ")
            batch = self.request("GET", f"/projects/{self._path(remote_key)}/issues", params=params)
            if not batch:
                break
            issues += [self._issue(raw, remote_key) for raw in batch]
            if len(batch) < 100:
                break
            page += 1
        return issues[:limit]

    def get_issue(self, remote_key, issue_id):
        return self._issue(
            self.request("GET", f"/projects/{self._path(remote_key)}/issues/{issue_id}"), remote_key)

    def create_issue(self, remote_key, *, title, body=None, labels=None, type=None):
        payload = {"title": title, "description": body or ""}
        if labels:
            payload["labels"] = ",".join(labels)
        return self._issue(
            self.request("POST", f"/projects/{self._path(remote_key)}/issues", json=payload),
            remote_key)

    def update_issue(self, remote_key, issue_id, *, title=None, body=None, category=None,
                     status_name=None, labels=None):
        payload: dict = {}
        if title is not None:
            payload["title"] = title
        if body is not None:
            payload["description"] = body
        if labels is not None:
            payload["labels"] = ",".join(labels)
        if category in ("open", "started"):
            payload["state_event"] = "reopen"
        elif category in ("done", "cancelled"):
            payload["state_event"] = "close"
        if category:
            current = self.get_issue(remote_key, issue_id)
            closed = current.state == "closed"
            # GitLab rejects a reopen of an open issue; only send a real change.
            if (payload.get("state_event") == "reopen" and not closed) or (
                    payload.get("state_event") == "close" and closed):
                payload.pop("state_event", None)
            if not payload:
                return current
        return self._issue(
            self.request("PUT", f"/projects/{self._path(remote_key)}/issues/{issue_id}", json=payload),
            remote_key)

    @staticmethod
    def _comment(raw: dict) -> RemoteComment:
        author = raw.get("author") or {}
        return RemoteComment(id=str(raw["id"]), body=raw.get("body") or "",
                             author=author.get("name") or author.get("username"),
                             created_at=parse_time(raw.get("created_at")))

    def list_comments(self, remote_key, issue_id):
        rows = self.request(
            "GET", f"/projects/{self._path(remote_key)}/issues/{issue_id}/notes",
            params={"per_page": 100, "sort": "asc"})
        return [self._comment(raw) for raw in rows or [] if not raw.get("system")]

    def add_comment(self, remote_key, issue_id, body):
        return self._comment(self.request(
            "POST", f"/projects/{self._path(remote_key)}/issues/{issue_id}/notes",
            json={"body": body}))
