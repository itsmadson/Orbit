#!/usr/bin/env bash
# Customer portal isolation, SLA clocks, monitoring, and capacity planning.
#   ./scripts/test-support.sh [api_base_url]
set -euo pipefail
API="${1:-http://localhost:8000}/api/v1"

python3 - "$API" "${ORBIT_PASSWORD:-orbit1234}" <<'PY'
import json, sys, urllib.error, urllib.parse, urllib.request
from datetime import date, timedelta

API, PASSWORD = sys.argv[1], sys.argv[2]
GREEN, RED, CYAN, RESET = "\033[32m", "\033[31m", "\033[36m", "\033[0m"
failures = 0


def call(method, path, token=None, body=None, params=None):
    url = f"{API}{path}" + ("?" + urllib.parse.urlencode(params, doseq=True) if params else "")
    request = urllib.request.Request(url, method=method)
    request.add_header("content-type", "application/json")
    if token:
        request.add_header("authorization", f"Bearer {token}")
    data = json.dumps(body, default=str).encode() if body is not None else None
    try:
        with urllib.request.urlopen(request, data) as response:
            return response.status, json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as error:
        return error.code, error.read()[:200].decode(errors="replace")


def login(email):
    status, body = call("POST", "/auth/login", body={"email": email, "password": PASSWORD})
    return body["access_token"] if status == 200 else None


def ok(label, condition, detail=""):
    global failures
    if not condition:
        failures += 1
    print(f"  {GREEN + '✓' + RESET if condition else RED + '✗' + RESET} {label}"
          f"{(' — ' + str(detail)) if detail else ''}")


admin = login("admin@orbit.dev")
anna = login("anna@meridian.example")     # Meridian Health
peter = login("peter@kestrel.example")    # Kestrel Logistics
ok("customer logins work", bool(anna and peter))

print(f"{CYAN}Portal isolation{RESET}")
status, overview = call("GET", "/portal/overview", anna)
ok("a customer gets their own overview", status == 200,
   overview.get("company", {}).get("name") if status == 200 else overview)
ok("scoped to their company", overview["company"]["name"] == "Meridian Health")

status, anna_tickets = call("GET", "/tickets", anna)
names = {t["customer"]["name"] for t in anna_tickets["items"] if t.get("customer")}
ok("sees only their own tickets", names == {"Meridian Health"}, names)

status, peter_tickets = call("GET", "/tickets", peter)
peter_ids = {t["id"] for t in peter_tickets["items"]}
anna_ids = {t["id"] for t in anna_tickets["items"]}
ok("two customers never overlap", not (peter_ids & anna_ids))

# The decisive one: fetching another customer's ticket by id.
other = next(iter(peter_ids))
status, _ = call("GET", f"/tickets/{other}", anna)
ok("another customer's ticket is not found", status == 404, f"HTTP {status}")

status, _ = call("GET", "/projects", anna)
ok("a customer cannot list projects", status == 403, f"HTTP {status}")
status, _ = call("GET", "/finance/summary", anna)
ok("nor finance", status == 403, f"HTTP {status}")
status, _ = call("GET", "/users", anna)
ok("nor the staff directory", status == 403, f"HTTP {status}")

print(f"{CYAN}Tickets and SLA{RESET}")
status, ticket = call("POST", "/tickets", anna, {
    "subject": "Portal test ticket", "body": "Filed from the portal.",
    "priority": "urgent", "crm_company_id": "00000000-0000-0000-0000-000000000000"})
ok("a customer can raise a ticket", status == 201, ticket.get("number"))
ok("the company is forced to their own, not the body's",
   ticket["customer"]["name"] == "Meridian Health", ticket["customer"]["name"])
ok("an SLA clock is set", bool(ticket["sla"]["response"]), ticket["sla"]["response"])
ticket_id = ticket["id"]

status, _ = call("PATCH", f"/tickets/{ticket_id}", anna, {"assignee_id": None,
                                                          "priority": "low"})
ok("a customer cannot re-prioritise or assign", status == 403, f"HTTP {status}")

call("POST", f"/tickets/{ticket_id}/messages", admin,
     {"body": "Internal: check the pool config first.", "is_internal": True})
call("POST", f"/tickets/{ticket_id}/messages", admin, {"body": "Looking into it now."})

status, customer_view = call("GET", f"/tickets/{ticket_id}/messages", anna)
ok("internal notes never reach the portal",
   all(not m["is_internal"] for m in customer_view), f"{len(customer_view)} visible")
status, staff_view = call("GET", f"/tickets/{ticket_id}/messages", admin)
ok("staff see both", len(staff_view) > len(customer_view),
   f"{len(staff_view)} vs {len(customer_view)}")

status, after = call("GET", f"/tickets/{ticket_id}", admin)
ok("the public reply stopped the response clock", bool(after["first_response_at"]))

status, task = call("POST", f"/tickets/{ticket_id}/to-task", admin)
ok("a ticket becomes a task", status == 200, task.get("key"))
status, _ = call("POST", f"/tickets/{ticket_id}/to-task", admin)
ok("but only once", status == 409, f"HTTP {status}")

print(f"{CYAN}Monitoring{RESET}")
status, monitors = call("GET", "/monitors", admin)
ok("staff see every monitor", status == 200 and len(monitors["items"]) >= 4,
   f"{len(monitors['items'])} monitors")
status, anna_monitors = call("GET", "/monitors", anna)
customers = {m["customer"]["name"] for m in anna_monitors["items"] if m.get("customer")}
ok("a customer sees only their own", customers == {"Meridian Health"}, customers)

status, created = call("POST", "/monitors", admin, {
    "name": "Probe target", "url": "https://example.com", "interval_seconds": 300})
ok("a monitor can be created", status == 201, created.get("name"))
status, _ = call("POST", "/monitors", admin, {"name": "bad", "url": "not-a-url"})
ok("a non-URL is refused", status == 400, f"HTTP {status}")

status, result = call("POST", "/monitors/check", admin,
                      params={"monitor_id": created["id"]})
ok("an on-demand probe runs", status == 200 and result.get("checked") == 1,
   f"{result.get('status')} in {result.get('result', {}).get('response_ms')}ms")

call("DELETE", f"/monitors/{created['id']}", admin)

print(f"{CYAN}Capacity planning{RESET}")
status, capacity = call("GET", "/planning/capacity", admin)
ok("capacity is computed per person", status == 200 and len(capacity["people"]) > 3,
   f"{len(capacity['people'])} people, {capacity['total_available']}h free")
person = capacity["people"][0]
ok("it accounts for committed work", "committed_hours" in person,
   f"{person['user']['full_name']}: {person['committed_hours']}h committed")
ok("customers are excluded from capacity",
   all(p["user"]["full_name"] not in ("Anna Weber", "Peter Jansen")
       for p in capacity["people"]))

status, dry = call("POST", "/planning/auto-assign", admin, {"commit": False})
ok("auto-assign runs as a dry run by default", status == 200 and not dry["committed"],
   f"{dry['assigned']} would be assigned")
ok("every assignment explains itself",
   all(a.get("why") for a in dry["assignments"]) if dry["assignments"] else True,
   dry["assignments"][0]["why"] if dry["assignments"] else "nothing to assign")

_, projects = call("GET", "/projects", admin, params={"page_size": 5})
project = next((p for p in projects["items"] if p["status"] == "active"), projects["items"][0])
status, plan = call("POST", "/planning/sprint", admin,
                    {"project_id": project["id"], "commit": False,
                     "allow_parallel": True})
ok("a sprint plan fits the capacity budget", status == 200
   and plan["planned_hours"] <= plan["capacity_hours"],
   f"{plan['planned_hours']}h planned of {plan['capacity_hours']}h")
ok("it reports what did not fit", "left_out" in plan, f"{plan.get('left_out')} left out")

status, _ = call("POST", "/planning/auto-assign", peter, {"commit": True})
ok("a customer cannot run the planner", status == 403, f"HTTP {status}")

print()
if failures:
    print(f"{RED}{failures} check(s) failed.{RESET}")
    sys.exit(1)
print(f"{GREEN}All support and planning checks passed.{RESET}")
PY
