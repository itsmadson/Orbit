from datetime import datetime

import httpx

from app.services.integrations.base import (
    Connector, IntegrationError, RemoteComment, RemoteIssue, RemoteProject, parse_time,
)

#: Jira's status categories → Orbit's.
CATEGORY = {"new": "open", "undefined": "open", "indeterminate": "started", "done": "done"}
JIRA_CATEGORY = {"open": "new", "started": "indeterminate", "done": "done", "cancelled": "done"}
PRIORITY = {"highest": "urgent", "high": "high", "medium": "medium", "low": "low", "lowest": "low"}
CANCELLED_WORDS = ("cancel", "won't", "wont", "reject", "declin", "duplicate", "invalid")
FIELDS = "summary,description,status,assignee,labels,issuetype,priority,updated,created,resolution"


class JiraConnector(Connector):
    """Jira Cloud (email + API token) and Server / Data Center (personal access token).

    Uses REST v2 throughout: it takes plain-text descriptions on both editions,
    where v3 insists on Atlassian Document Format.
    """

    provider = "jira"
    label = "Jira"
    needs_username = True
    needs_base_url = True

    @property
    def api_root(self):
        return f"{self.base_url}/rest/api/2"

    def _headers(self):
        # No email means a Server/Data Center personal access token.
        return {} if self.username else {"authorization": f"Bearer {self.token}"}

    def _auth(self):
        return httpx.BasicAuth(self.username, self.token) if self.username else None

    def whoami(self):
        me = self.request("GET", "/myself")
        return {"login": me.get("emailAddress") or me.get("name") or me.get("accountId"),
                "name": me.get("displayName")}

    def list_projects(self, query=None):
        try:
            data = self.request("GET", "/project/search",
                                params={"maxResults": 100, **({"query": query} if query else {})})
            rows = data.get("values", [])
        except IntegrationError as exc:
            if exc.status != 404:
                raise
            rows = self.request("GET", "/project") or []     # Server editions
            if query:
                rows = [r for r in rows if query.lower() in f"{r['key']} {r['name']}".lower()]
        return [
            RemoteProject(key=r["key"], name=f"{r['key']} · {r['name']}",
                          url=f"{self.base_url}/browse/{r['key']}")
            for r in rows
        ]

    def _issue(self, raw: dict) -> RemoteIssue:
        fields = raw.get("fields") or {}
        status = fields.get("status") or {}
        status_name = status.get("name") or "Open"
        category = CATEGORY.get((status.get("statusCategory") or {}).get("key", "new"), "open")
        resolution = ((fields.get("resolution") or {}).get("name") or "").lower()
        if category == "done" and any(
                word in resolution or word in status_name.lower() for word in CANCELLED_WORDS):
            category = "cancelled"
        assignee = fields.get("assignee") or {}
        kind = ((fields.get("issuetype") or {}).get("name") or "task").lower()
        description = fields.get("description")
        return RemoteIssue(
            id=raw["key"], title=fields.get("summary") or "",
            body=description if isinstance(description, str) else None,
            category=category, state=status_name, url=f"{self.base_url}/browse/{raw['key']}",
            assignee_name=assignee.get("displayName"), assignee_email=assignee.get("emailAddress"),
            labels=list(fields.get("labels") or []),
            type=kind if kind in ("bug", "story", "epic", "task") else (
                "subtask" if "sub" in kind else "task"),
            priority=PRIORITY.get(((fields.get("priority") or {}).get("name") or "").lower()),
            updated_at=parse_time(fields.get("updated")),
            created_at=parse_time(fields.get("created")),
            remote_key=raw["key"].rsplit("-", 1)[0],
        )

    def list_issues(self, remote_key, *, since: datetime | None = None, state="all", limit=200):
        jql = f'project = "{remote_key}"'
        if state == "open":
            jql += " AND statusCategory != Done"
        elif state == "closed":
            jql += " AND statusCategory = Done"
        if since:
            jql += f' AND updated >= "{since.strftime("%Y-%m-%d %H:%M")}"'
        jql += " ORDER BY updated DESC"
        issues: list[RemoteIssue] = []
        token, start, modern = None, 0, True
        while len(issues) < limit:
            if modern:
                params = {"jql": jql, "maxResults": 100, "fields": FIELDS}
                if token:
                    params["nextPageToken"] = token
                try:
                    data = self.request("GET", "/search/jql", params=params)
                except IntegrationError as exc:
                    if exc.status not in (404, 405):
                        raise
                    modern = False        # Server / Data Center still use /search
                    continue
            else:
                data = self.request("GET", "/search", params={
                    "jql": jql, "maxResults": 100, "startAt": start, "fields": FIELDS})
            batch = data.get("issues", [])
            issues += [self._issue(raw) for raw in batch]
            token = data.get("nextPageToken")
            start += len(batch)
            if not batch or (modern and not token) or (
                    not modern and start >= data.get("total", 0)):
                break
        return issues[:limit]

    def get_issue(self, remote_key, issue_id):
        return self._issue(self.request("GET", f"/issue/{issue_id}", params={"fields": FIELDS}))

    def create_issue(self, remote_key, *, title, body=None, labels=None, type=None):
        wanted = {"bug": "Bug", "story": "Story", "epic": "Epic"}.get(type or "", "Task")
        fields = {"project": {"key": remote_key}, "summary": title,
                  "description": body or "", "issuetype": {"name": wanted}}
        if labels:
            fields["labels"] = [label.replace(" ", "-") for label in labels]
        try:
            created = self.request("POST", "/issue", json={"fields": fields})
        except IntegrationError as exc:
            if wanted == "Task" or exc.status != 400:
                raise
            # A project without that issue type: fall back to the one every project has.
            fields["issuetype"] = {"name": "Task"}
            created = self.request("POST", "/issue", json={"fields": fields})
        return self.get_issue(remote_key, created["key"])

    def update_issue(self, remote_key, issue_id, *, title=None, body=None, category=None,
                     status_name=None, labels=None):
        fields: dict = {}
        if title is not None:
            fields["summary"] = title
        if body is not None:
            fields["description"] = body
        if labels is not None:
            fields["labels"] = [label.replace(" ", "-") for label in labels]
        if fields:
            self.request("PUT", f"/issue/{issue_id}", json={"fields": fields})
        if category:
            self._transition(issue_id, category, status_name)
        return self.get_issue(remote_key, issue_id)

    def _transition(self, issue_id: str, category: str, status_name: str | None) -> None:
        """Jira moves by workflow transition, not by setting a field.

        Prefer a transition whose target carries the same name as the Orbit
        column; otherwise any transition into the right status category.
        """
        current = self.get_issue("", issue_id)
        if status_name and current.state.lower() == status_name.lower():
            return
        if not status_name and current.category == category:
            return
        options = self.request("GET", f"/issue/{issue_id}/transitions").get("transitions", [])
        wanted = JIRA_CATEGORY[category]

        def target_category(option):
            return ((option.get("to") or {}).get("statusCategory") or {}).get("key")

        def target_name(option):
            return ((option.get("to") or {}).get("name") or "").lower()

        choice = None
        if status_name:
            choice = next((o for o in options if target_name(o) == status_name.lower()), None)
        if choice is None and current.category == category:
            return            # already in the right category; no same-named state to move to
        if choice is None:
            pool = [o for o in options if target_category(o) == wanted]
            if category == "cancelled":
                choice = next((o for o in pool
                               if any(w in target_name(o) for w in CANCELLED_WORDS)), None)
            elif category == "done":
                choice = next((o for o in pool
                               if not any(w in target_name(o) for w in CANCELLED_WORDS)), None)
            choice = choice or (pool[0] if pool else None)
        if choice is None:
            raise IntegrationError(
                f"Jira has no transition from “{current.state}” to a {category} status")
        self.request("POST", f"/issue/{issue_id}/transitions",
                     json={"transition": {"id": choice["id"]}})

    @staticmethod
    def _comment(raw: dict) -> RemoteComment:
        body = raw.get("body")
        return RemoteComment(id=str(raw["id"]), body=body if isinstance(body, str) else "",
                             author=(raw.get("author") or {}).get("displayName"),
                             created_at=parse_time(raw.get("created")))

    def list_comments(self, remote_key, issue_id):
        data = self.request("GET", f"/issue/{issue_id}/comment", params={"maxResults": 100})
        return [self._comment(raw) for raw in data.get("comments", [])]

    def add_comment(self, remote_key, issue_id, body):
        return self._comment(
            self.request("POST", f"/issue/{issue_id}/comment", json={"body": body}))
