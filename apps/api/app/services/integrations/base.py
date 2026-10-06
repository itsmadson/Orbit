"""The contract every issue tracker is reduced to."""

from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Any

import httpx

from app.core.config import settings


class IntegrationError(Exception):
    """A remote call failed in a way worth showing to the user."""

    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


@dataclass
class RemoteProject:
    key: str            # owner/repo · group/project · JIRA key
    name: str
    url: str | None = None
    description: str | None = None

    def as_dict(self) -> dict:
        return asdict(self)


@dataclass
class RemoteIssue:
    id: str             # issue number · iid · KEY-12
    title: str
    body: str | None = None
    #: Orbit's four categories, so status mapping never depends on a tracker's vocabulary.
    category: str = "open"
    state: str = "open"   # the tracker's own word for it
    url: str | None = None
    assignee_name: str | None = None
    assignee_email: str | None = None
    labels: list[str] = field(default_factory=list)
    type: str = "task"
    priority: str | None = None
    updated_at: datetime | None = None
    created_at: datetime | None = None
    remote_key: str | None = None

    def as_dict(self) -> dict:
        data = asdict(self)
        for name in ("updated_at", "created_at"):
            data[name] = data[name].isoformat() if data[name] else None
        return data


@dataclass
class RemoteComment:
    id: str
    body: str
    author: str | None = None
    created_at: datetime | None = None
    url: str | None = None

    def as_dict(self) -> dict:
        data = asdict(self)
        data["created_at"] = data["created_at"].isoformat() if data["created_at"] else None
        return data


def parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        text = value.replace("Z", "+00:00")
        # Jira writes +0000 without the colon.
        if len(text) > 5 and text[-5] in "+-" and text[-3] != ":":
            text = f"{text[:-2]}:{text[-2:]}"
        return datetime.fromisoformat(text)
    except ValueError:
        return None


class Connector(ABC):
    provider: str
    label: str
    default_base_url: str = ""
    #: Shown in the connect form.
    needs_username: bool = False
    needs_base_url: bool = False

    def __init__(self, *, token: str, base_url: str | None = None, username: str | None = None):
        self.token = token
        self.base_url = (base_url or self.default_base_url).rstrip("/")
        self.username = username or None

    # ---- transport
    @abstractmethod
    def _headers(self) -> dict[str, str]: ...

    def _auth(self) -> httpx.Auth | None:
        return None

    @property
    def api_root(self) -> str:
        return self.base_url

    def request(self, method: str, path: str, *, params: dict | None = None,
                json: Any = None) -> Any:
        """One authenticated call. ``path`` is relative to the tracker's API root."""
        url = path if path.startswith("http") else f"{self.api_root}/{path.lstrip('/')}"
        if not url.startswith(self.base_url_origin):
            raise IntegrationError(f"Refusing to call a host other than {self.base_url_origin}")
        try:
            with httpx.Client(timeout=settings.INTEGRATION_TIMEOUT, follow_redirects=True) as client:
                response = client.request(
                    method.upper(), url, params=params, json=json,
                    headers={"accept": "application/json", "user-agent": "orbit-integrations",
                             **self._headers()},
                    auth=self._auth(),
                )
        except httpx.HTTPError as exc:
            raise IntegrationError(
                f"Could not reach {self.label}: {type(exc).__name__}") from exc
        if response.status_code in (401, 403):
            raise IntegrationError(
                f"{self.label} rejected the credentials ({response.status_code})",
                response.status_code)
        if response.status_code >= 400:
            raise IntegrationError(
                f"{self.label} answered {response.status_code}: {response.text[:300]}",
                response.status_code)
        if not response.content:
            return None
        try:
            return response.json()
        except ValueError:
            return response.text

    @property
    def base_url_origin(self) -> str:
        parsed = httpx.URL(self.api_root)
        return f"{parsed.scheme}://{parsed.host}" + (f":{parsed.port}" if parsed.port else "")

    # ---- the contract
    @abstractmethod
    def whoami(self) -> dict:
        """Proves the credentials work. Returns ``{"login": …, "name": …}``."""

    @abstractmethod
    def list_projects(self, query: str | None = None) -> list[RemoteProject]: ...

    @abstractmethod
    def list_issues(self, remote_key: str, *, since: datetime | None = None,
                    state: str = "all", limit: int = 200) -> list[RemoteIssue]: ...

    @abstractmethod
    def get_issue(self, remote_key: str, issue_id: str) -> RemoteIssue: ...

    @abstractmethod
    def create_issue(self, remote_key: str, *, title: str, body: str | None = None,
                     labels: list[str] | None = None, type: str | None = None) -> RemoteIssue: ...

    @abstractmethod
    def update_issue(self, remote_key: str, issue_id: str, *, title: str | None = None,
                     body: str | None = None, category: str | None = None,
                     status_name: str | None = None,
                     labels: list[str] | None = None) -> RemoteIssue: ...

    @abstractmethod
    def list_comments(self, remote_key: str, issue_id: str) -> list[RemoteComment]: ...

    @abstractmethod
    def add_comment(self, remote_key: str, issue_id: str, body: str) -> RemoteComment: ...
