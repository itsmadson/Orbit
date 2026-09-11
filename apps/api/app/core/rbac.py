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
    "letters",
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
     "rd", "documents", "decisions", "meetings", "workflows", "goals", "assets", "ai",
     "letters"],
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
        | _all(["approvals", "letters"], READ, WRITE)
        | _all(["hr", "finance", "analytics", "crm", "audit"], READ)
        | {"projects.manage", "tasks.manage", "goals.manage", "letters.manage"}
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
        | _all(["approvals", "letters"], READ, WRITE)
        | _all(["crm", "analytics", "audit"], READ)
        | _all(["tasks", "documents", "meetings", "workflows"], WRITE)
    ),
    "hr": (
        _COMMON_READ
        | _all(["hr", "users"], READ, WRITE, MANAGE)
        | _all(["approvals", "letters"], READ, WRITE)
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

#: Seniority, used to stop a role from minting one above itself.
#:
#: Without this, any role holding ``users.write`` — HR does — could create a
#: company_admin, set its password and sign in as it. Assignment is therefore
#: capped at the assigner's own rank, and super_admin is reserved to itself.
ROLE_RANK: dict[str, int] = {
    "super_admin": 100,
    "company_admin": 90,
    "hr": 50,
    "finance": 50,
    "manager": 40,
    "project_manager": 35,
    "rd": 30,
    "employee": 20,
    "viewer": 10,
}


def rank(role: str) -> int:
    return ROLE_RANK.get(role, 0)


def assignable_roles(actor_role: str) -> list[str]:
    """Roles this actor may hand out — never one senior to themselves."""
    ceiling = rank(actor_role)
    return [
        role for role in ROLES
        if rank(role) <= ceiling and (role != "super_admin" or actor_role == "super_admin")
    ]


def can_assign_role(actor_role: str, target_role: str) -> bool:
    return target_role in assignable_roles(actor_role)


#: What each role is *for*, in the words an administrator would use. The
#: capabilities below are derived from ROLE_PERMISSIONS rather than written by
#: hand, so this can never drift from what the server actually enforces.
ROLE_INFO: dict[str, dict[str, str]] = {
    "super_admin": {
        "label": "Super admin",
        "summary": "Unrestricted. Can change company-level settings no one else can.",
        "caution": "Grant this only to whoever administers the deployment itself.",
    },
    "company_admin": {
        "label": "Company admin",
        "summary": "Runs the workspace: every module, every record, plus user management.",
        "caution": "Full read and write access to salaries, finance and the audit trail.",
    },
    "manager": {
        "label": "Manager",
        "summary": "Leads teams and projects. Approves requests, reads finance and HR.",
        "caution": "Can see payroll-adjacent HR data, but cannot change it.",
    },
    "project_manager": {
        "label": "Project manager",
        "summary": "Owns delivery: projects, tasks, roadmaps, documents and meetings.",
        "caution": "",
    },
    "employee": {
        "label": "Employee",
        "summary": "The default. Own work, team projects, the wiki and the letter register.",
        "caution": "",
    },
    "finance": {
        "label": "Finance",
        "summary": "Money and assets: transactions, budgets, invoices, procurement, approvals.",
        "caution": "Can read the CRM pipeline and the audit trail.",
    },
    "hr": {
        "label": "People / HR",
        "summary": "The team: directory, leave, attendance, onboarding, and user accounts.",
        "caution": "Can create and edit user accounts, including salaries.",
    },
    "rd": {
        "label": "Research",
        "summary": "Research projects, experiments and the idea pipeline.",
        "caution": "",
    },
    "viewer": {
        "label": "Viewer",
        "summary": "Read-only across whatever they are given access to. Changes nothing.",
        "caution": "",
    },
}

#: Domains an administrator recognises, in the order the sidebar shows them.
_HEADLINE_DOMAINS = [
    "projects", "tasks", "ideas", "rd", "documents", "meetings", "letters",
    "workflows", "approvals", "finance", "crm", "hr", "assets", "users",
    "analytics", "settings",
]


def describe_role(role: str) -> dict:
    """Role metadata for the UI, derived from the permission sets themselves."""
    perms = role_permissions(role)
    info = ROLE_INFO.get(role, {})

    def level(domain: str) -> str | None:
        if f"{domain}.manage" in perms:
            return "manage"
        if f"{domain}.write" in perms:
            return "write"
        if f"{domain}.read" in perms:
            return "read"
        return None

    capabilities = [
        {"domain": domain, "level": lvl}
        for domain in _HEADLINE_DOMAINS
        if (lvl := level(domain))
    ]
    return {
        "key": role,
        "label": info.get("label", role.replace("_", " ").title()),
        "summary": info.get("summary", ""),
        "caution": info.get("caution", ""),
        "permission_count": len(perms),
        "capabilities": capabilities,
        "can_write_count": sum(1 for c in capabilities if c["level"] in ("write", "manage")),
    }


def describe_roles() -> list[dict]:
    return [describe_role(role) for role in ROLES]

