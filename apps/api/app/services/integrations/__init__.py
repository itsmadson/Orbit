"""Issue-tracker integrations: GitHub, GitLab and Jira behind one interface.

    connector  ->  one remote API, normalised to RemoteIssue / RemoteProject
    sync       ->  keeps an Orbit task and its remote twin in step
    crypto     ->  tokens at rest

Adding a tracker means one ``Connector`` subclass and one line in ``CONNECTORS``.
"""

from app.services.integrations.base import (
    Connector, IntegrationError, RemoteComment, RemoteIssue, RemoteProject,
)
from app.services.integrations.github import GitHubConnector
from app.services.integrations.gitlab import GitLabConnector
from app.services.integrations.jira import JiraConnector

CONNECTORS: dict[str, type[Connector]] = {
    "github": GitHubConnector,
    "gitlab": GitLabConnector,
    "jira": JiraConnector,
}

__all__ = [
    "CONNECTORS", "Connector", "IntegrationError", "RemoteComment", "RemoteIssue",
    "RemoteProject",
]
