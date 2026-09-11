#!/usr/bin/env bash
# Checks that privilege escalation paths stay closed.
#   ./scripts/test-permissions.sh [api_base_url]
set -euo pipefail
API="${1:-http://localhost:8000}/api/v1"

python3 - "$API" "${ORBIT_PASSWORD:-orbit1234}" <<'PY'
import json, sys, urllib.request, urllib.error

API, PASSWORD = sys.argv[1], sys.argv[2]
GREEN, RED, CYAN, RESET = "\033[32m", "\033[31m", "\033[36m", "\033[0m"
failures = 0


def call(method, path, token=None, body=None):
    request = urllib.request.Request(f"{API}{path}", method=method)
    request.add_header("content-type", "application/json")
    if token:
        request.add_header("authorization", f"Bearer {token}")
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(request, data) as response:
            return response.status, json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as error:
        return error.code, error.read()[:160].decode(errors="replace")


def login(email):
    _, body = call("POST", "/auth/login", body={"email": email, "password": PASSWORD})
    return body["access_token"]


def ok(label, condition, detail=""):
    global failures
    mark = f"{GREEN}✓{RESET}" if condition else f"{RED}✗{RESET}"
    if not condition:
        failures += 1
    print(f"  {mark} {label}{(' — ' + str(detail)) if detail else ''}")


print(f"{CYAN}Role hierarchy{RESET}")
admin, hr = login("admin@orbit.dev"), login("hr@orbit.dev")

status, roles = call("GET", "/users/roles", hr)
assignable = roles["assignable"]
ok("HR is not offered company_admin", "company_admin" not in assignable)
ok("HR is not offered super_admin", "super_admin" not in assignable)
ok("HR is offered employee", "employee" in assignable)
ok("roles explain themselves", bool(roles["items"][0].get("summary")),
   roles["items"][0]["label"])

print(f"{CYAN}Escalation is refused{RESET}")
status, _ = call("POST", "/users", hr, {
    "full_name": "Escalation Probe", "email": "probe.escalation@orbit.dev",
    "password": "probe12345", "role": "company_admin"})
ok("HR cannot create a company_admin", status == 403, f"HTTP {status}")

status, _ = call("POST", "/users", hr, {
    "full_name": "Escalation Probe", "email": "probe.escalation@orbit.dev",
    "password": "probe12345", "role": "super_admin"})
ok("HR cannot create a super_admin", status == 403, f"HTTP {status}")

import time
probe_email = f"probe.{int(time.time())}@orbit.dev"
status, created = call("POST", "/users", hr, {
    "full_name": "Probe Employee", "email": probe_email,
    "password": "probe12345", "role": "employee"})
ok("HR can still create an employee", status == 201, f"HTTP {status}")
probe_id = created.get("id") if status == 201 else None

if probe_id:
    status, _ = call("PATCH", f"/users/{probe_id}", hr, {"role": "company_admin"})
    ok("HR cannot promote anyone to company_admin", status == 403, f"HTTP {status}")

print(f"{CYAN}Self-protection{RESET}")
_, hr_session = call("GET", "/auth/me", hr)
me = hr_session.get("user", hr_session)
status, _ = call("PATCH", f"/users/{me['id']}", hr, {"role": "company_admin"})
ok("nobody can change their own role", status == 403, f"HTTP {status}")

_, admin_session = call("GET", "/auth/me", admin)
admin_me = admin_session.get("user", admin_session)
status, _ = call("DELETE", f"/users/{admin_me['id']}", admin)
ok("nobody can deactivate themselves", status in (400, 403), f"HTTP {status}")

status, _ = call("DELETE", f"/users/{admin_me['id']}", hr)
ok("a junior cannot deactivate an admin", status == 403, f"HTTP {status}")

print(f"{CYAN}Grants{RESET}")
# Managing grants needs settings.write, which HR does not hold at all.
status, _ = call("GET", "/permissions/catalogue", hr)
ok("HR cannot reach the grant catalogue", status == 403, f"HTTP {status}")

status, catalogue = call("GET", "/permissions/catalogue", admin)
ok("the catalogue lists what an admin may grant", status == 200,
   f"{len(catalogue['grantable'])} grantable")
ok("company.manage is withheld even from the admin",
   "company.manage" not in catalogue["grantable"])

if probe_id:
    status, _ = call("POST", "/permissions/grants", admin, {
        "user_id": probe_id, "permission": "not.a.permission", "scope_type": "company"})
    ok("an invented permission is refused", status == 400, f"HTTP {status}")

    status, _ = call("POST", "/permissions/grants", admin, {
        "user_id": probe_id, "permission": "company.manage", "scope_type": "company"})
    ok("granting a permission you lack is refused", status == 403, f"HTTP {status}")

    status, grant = call("POST", "/permissions/grants", admin, {
        "user_id": probe_id, "permission": "finance.read", "scope_type": "company"})
    ok("a permission you do hold can be granted", status == 201, f"HTTP {status}")
    if status == 201:
        status, _ = call("DELETE", f"/permissions/grants/{grant['id']}", admin)
        ok("and revoked again", status == 200, f"HTTP {status}")

    call("DELETE", f"/users/{probe_id}", admin)

print()
if failures:
    print(f"{RED}{failures} check(s) failed.{RESET}")
    sys.exit(1)
print(f"{GREEN}All permission checks passed.{RESET}")
PY
