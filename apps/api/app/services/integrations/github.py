from datetime import datetime
from urllib.parse import quote

from app.services.integrations.base import (
    Connector, RemoteComment, RemoteIssue, RemoteProject, parse_time,
)


class GitHubConnector(Connector):
    provider = "github"
    label = "GitHub"
    default_base_url = "https://api.github.com"

    def __init__(self, *, token, base_url=None, username=None):
        # GitHub Enterprise Server serves its API under /api/v3.
        if base_url and "api.github.com" not in base_url and "/api/" not in base_url:
            base_url = base_url.rstrip("/") + "/api/v3"
        super().__init__(token=token, base_url=base_url, username=username)

    def _headers(self):
        return {
            "authorization": f"Bearer {self.token}",
            "accept": "application/vnd.github+json",
            "x-github-api-version": "2022-11-28",
        }

    def whoami(self):
        me = self.request("GET", "/user")
        return {"login": me.get("login"), "name": me.get("name") or me.get("login")}

    def list_projects(self, query=None):
        if query:
            found = self.request("GET", "/search/repositories",
                                 params={"q": f"{query} in:name fork:true user:@me", "per_page": 30})
            repos = found.get("items", [])
            if not repos:
                repos = self.request("GET", "/search/repositories",
                                     params={"q": f"{query} in:name", "per_page": 20}).get("items", [])
        else:
            repos = self.request("GET", "/user/repos",
                                 params={"per_page": 100, "sort": "pushed",
                                         "affiliation": "owner,collaborator,organization_member"})
        return [
            RemoteProject(key=r["full_name"], name=r["full_name"], url=r.get("html_url"),
                          description=r.get("description"))
            for r in repos
        ]

    @staticmethod
    def _issue(raw: dict, remote_key: str) -> RemoteIssue:
        closed = raw.get("state") == "closed"
        category = "open"
        if closed:
            category = "cancelled" if raw.get("state_reason") == "not_planned" else "done"
        labels = [label["name"] if isinstance(label, dict) else label
                  for label in raw.get("labels", [])]
        assignee = raw.get("assignee") or {}
        lowered = {label.lower() for label in labels}
        return RemoteIssue(
            id=str(raw["number"]), title=raw.get("title") or "", body=raw.get("body"),
            category=category, state=raw.get("state", "open"), url=raw.get("html_url"),
            assignee_name=assignee.get("login"), labels=labels,
            type="bug" if "bug" in lowered else ("feature" if "enhancement" in lowered else "task"),
            updated_at=parse_time(raw.get("updated_at")),
            created_at=parse_time(raw.get("created_at")), remote_key=remote_key,
        )

    def list_issues(self, remote_key, *, since: datetime | None = None, state="all", limit=200):
        issues: list[RemoteIssue] = []
        page = 1
        while len(issues) < limit:
            params = {"state": state, "per_page": 100, "page": page, "sort": "updated",
                      "direction": "desc"}
            if since:
                params["since"] = since.strftime("%Y-%m-%dT%H:%M:%SZ")
            batch = self.request("GET", f"/repos/{remote_key}/issues", params=params)
            if not batch:
                break
            # The issues endpoint also returns pull requests; those are not tasks.
            issues += [self._issue(raw, remote_key) for raw in batch if "pull_request" not in raw]
            if len(batch) < 100:
                break
            page += 1
        return issues[:limit]

    def get_issue(self, remote_key, issue_id):
        return self._issue(self.request("GET", f"/repos/{remote_key}/issues/{issue_id}"), remote_key)

    def create_issue(self, remote_key, *, title, body=None, labels=None, type=None):
        payload = {"title": title, "body": body or ""}
        if labels:
            payload["labels"] = labels
        return self._issue(
            self.request("POST", f"/repos/{remote_key}/issues", json=payload), remote_key)

    def update_issue(self, remote_key, issue_id, *, title=None, body=None, category=None,
                     status_name=None, labels=None):
        payload: dict = {}
        if title is not None:
            payload["title"] = title
        if body is not None:
            payload["body"] = body
        if labels is not None:
            payload["labels"] = labels
        if category in ("open", "started"):
            payload["state"] = "open"
        elif category == "done":
            payload.update(state="closed", state_reason="completed")
        elif category == "cancelled":
            payload.update(state="closed", state_reason="not_planned")
        return self._issue(
            self.request("PATCH", f"/repos/{remote_key}/issues/{issue_id}", json=payload),
            remote_key)

    @staticmethod
    def _comment(raw: dict) -> RemoteComment:
        return RemoteComment(
            id=str(raw["id"]), body=raw.get("body") or "",
            author=(raw.get("user") or {}).get("login"),
            created_at=parse_time(raw.get("created_at")), url=raw.get("html_url"),
        )

    def list_comments(self, remote_key, issue_id):
        rows = self.request("GET", f"/repos/{remote_key}/issues/{quote(str(issue_id))}/comments",
                            params={"per_page": 100})
        return [self._comment(raw) for raw in rows or []]

    def add_comment(self, remote_key, issue_id, body):
        return self._comment(self.request(
            "POST", f"/repos/{remote_key}/issues/{issue_id}/comments", json={"body": body}))
