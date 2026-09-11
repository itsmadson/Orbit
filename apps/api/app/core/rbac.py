"""Role/permission model.

Roles are coarse. Permissions are fine-grained and may additionally be granted
per scope (company / department / project / document / finance) through the
``permission_grants`` table. Every check happens on the backend; the frontend
only mirrors the result for UX.
"""

ROLES = [
    "super_admin", "company_admin", "manager", "employee",
    "finance", "hr", "rd", "project_manager", "viewer",
]

# Domains a permission can belong to.
DOMAINS = [
    "company", "users", "departments", "projects", "tasks", "ideas", "brainstorm",
    "rd", "documents", "decisions", "meetings", "workflows", "approvals",
    "finance", "hr", "crm", "assets", "procurement", "goals", "analytics",
    "ai", "audit", "integrations", "settings",
]

READ = "read"
WRITE = "write"
MANAGE = "manage"


def _all(domains: list[str], *actions: str) -> set[str]:
    return {f"{d}.{a}" for d in domains for a in actions}


_EVERYTHING = _all(DOMAINS, READ, WRITE, MANAGE)

_COMMON_READ = _all(
    ["company", "users", "departments", "projects", "tasks", "ideas", "brainstorm",
     "rd", "documents", "decisions", "meetings", "workflows", "goals", "assets", "ai"],
    READ,
)

_EMPLOYEE = _COMMON_READ | _all(
    ["tasks", "ideas", "brainstorm", "documents", "meetings", "workflows", "goals"],
    WRITE,
)

ROLE_PERMISSIONS: dict[str, set[str]] = {
    "super_admin": _EVERYTHING,
    "company_admin": _EVERYTHING - {"company.manage"},
    "manager": (
        _COMMON_READ
        | _all(["projects", "tasks", "ideas", "brainstorm", "documents", "decisions",
                "meetings", "workflows", "goals", "rd"], WRITE)
        | _all(["approvals"], READ, WRITE)
        | _all(["hr", "finance", "analytics", "crm", "audit"], READ)
        | {"projects.manage", "tasks.manage", "goals.manage"}
    ),
    "project_manager": (
        _COMMON_READ
        | _all(["projects", "tasks", "documents", "decisions", "meetings", "goals",
                "ideas", "brainstorm", "workflows"], WRITE)
        | {"projects.manage", "tasks.manage", "analytics.read", "approvals.read", "crm.read"}
    ),
    "finance": (
        _COMMON_READ
        | _all(["finance", "procurement", "assets"], READ, WRITE, MANAGE)
        | _all(["approvals"], READ, WRITE)
        | _all(["crm", "analytics", "audit"], READ)
        | _all(["tasks", "documents", "meetings", "workflows"], WRITE)
    ),
    "hr": (
        _COMMON_READ
        | _all(["hr", "users"], READ, WRITE, MANAGE)
        | _all(["approvals"], READ, WRITE)
        | _all(["departments", "analytics", "audit"], READ)
        | _all(["tasks", "documents", "meetings", "workflows", "goals"], WRITE)
    ),
    "rd": (
        _COMMON_READ
        | _all(["rd", "ideas", "brainstorm"], READ, WRITE, MANAGE)
        | _all(["tasks", "documents", "decisions", "meetings", "workflows"], WRITE)
        | {"analytics.read"}
    ),
    "employee": _EMPLOYEE,
    "viewer": _COMMON_READ,
}

# Sensitive domains an ordinary employee may only see for themselves.
SELF_SCOPED_DOMAINS = {"hr", "finance"}


def role_permissions(role: str) -> set[str]:
    return ROLE_PERMISSIONS.get(role, ROLE_PERMISSIONS["viewer"])


def has_permission(role: str, permission: str, extra: set[str] | None = None) -> bool:
    perms = role_permissions(role)
    if extra:
        perms = perms | extra
    if permission in perms:
        return True
    domain, _, action = permission.partition(".")
    # manage implies write implies read
    if action == READ and ({f"{domain}.write", f"{domain}.manage"} & perms):
        return True
    if action == WRITE and f"{domain}.manage" in perms:
        return True
    return False
