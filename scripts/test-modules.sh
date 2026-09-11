#!/usr/bin/env bash
# The loops that turn each module from a form into somewhere you work.
#   ./scripts/test-modules.sh [api_base_url]
set -euo pipefail
API="${1:-http://localhost:8000}/api/v1"

python3 - "$API" "${ORBIT_PASSWORD:-orbit1234}" <<'PY'
import json, sys, urllib.error, urllib.parse, urllib.request
from datetime import date, timedelta

API, PASSWORD = sys.argv[1], sys.argv[2]
GREEN, RED, CYAN, RESET = "\033[32m", "\033[31m", "\033[36m", "\033[0m"
failures = 0


def call(method, path, token=None, body=None, params=None):
    url = f"{API}{path}" + ("?" + urllib.parse.urlencode(params) if params else "")
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
    return call("POST", "/auth/login", body={"email": email, "password": PASSWORD})[1]["access_token"]


def ok(label, condition, detail=""):
    global failures
    if not condition:
        failures += 1
    print(f"  {GREEN + '✓' + RESET if condition else RED + '✗' + RESET} {label}"
          f"{(' — ' + str(detail)) if detail else ''}")


admin = login("admin@orbit.dev")
dev = login("dev@orbit.dev")

print(f"{CYAN}Saved views{RESET}")
status, view = call("POST", "/views", admin, {
    "entity": "task", "name": "My open bugs",
    "filters": {"type": "bug", "status": "todo", "mine": True}, "is_default": True})
ok("a filter set can be saved", status == 201, view.get("name"))
view_id = view.get("id")

status, mine = call("GET", "/views", admin, params={"entity": "task"})
ok("it comes back for its owner", status == 200 and any(v["id"] == view_id for v in mine))

status, theirs = call("GET", "/views", dev, params={"entity": "task"})
ok("a private view stays private", not any(v["id"] == view_id for v in theirs))

call("PATCH", f"/views/{view_id}", admin, {"is_shared": True})
status, theirs = call("GET", "/views", dev, params={"entity": "task"})
ok("sharing it makes it visible to the team", any(v["id"] == view_id for v in theirs))

status, _ = call("DELETE", f"/views/{view_id}", dev)
ok("someone else cannot delete it", status == 403, f"HTTP {status}")
call("DELETE", f"/views/{view_id}", admin)

print(f"{CYAN}Project check-ins{RESET}")
_, projects = call("GET", "/projects", admin, params={"page_size": 1})
project = projects["items"][0]
status, checkin = call("POST", f"/projects/{project['id']}/checkins", admin, {
    "health": "at_risk", "summary": "Load testing slipped; cutover moves a week.",
    "progress": 64, "risks": "Backpressure under replay", "next_steps": "Run the 50k test"})
ok("a check-in can be posted", status == 201, checkin.get("health"))

_, refreshed = call("GET", f"/projects/{project['id']}", admin)
ok("it moves the project's own health", refreshed["health"] == "at_risk", refreshed["health"])
ok("and its progress", refreshed["progress"] == 64, refreshed["progress"])

status, history = call("GET", f"/projects/{project['id']}/checkins", admin)
ok("history is readable", status == 200 and len(history) >= 1, f"{len(history)} check-ins")

print(f"{CYAN}CRM follow-ups{RESET}")
_, deals = call("GET", "/crm/deals", admin, params={"page_size": 50})
open_deals = [d for d in deals["items"] if d["stage"] not in ("won", "lost")]
ok("found open deals", len(open_deals) >= 2, f"{len(open_deals)} open")

overdue_deal, soon_deal = open_deals[0], open_deals[1]
call("POST", f"/crm/deals/{overdue_deal['id']}/next-step", admin, {
    "next_step": "Chase the signed order form", "due_on": date.today() - timedelta(days=3)})
call("POST", f"/crm/deals/{soon_deal['id']}/next-step", admin, {
    "next_step": "Send revised pricing", "due_on": date.today() + timedelta(days=2)})

status, board = call("GET", "/crm/followups", admin, params={"mine": "false"})
ok("overdue follow-ups are surfaced", status == 200 and board["counts"]["overdue"] >= 1,
   f"{board['counts']['overdue']} overdue")
ok("upcoming ones too", board["counts"]["upcoming"] >= 1, f"{board['counts']['upcoming']} upcoming")
ok("deals with no next step are called out", board["counts"]["unscheduled"] >= 1,
   f"{board['counts']['unscheduled']} unscheduled")
ok("overdue days are counted", (board["overdue"][0]["days_overdue"] or 0) >= 1,
   f'{board["overdue"][0]["days_overdue"]} days')

print(f"{CYAN}Leave balances{RESET}")
status, balance = call("GET", "/hr/leave/balance", dev)
ok("an employee sees their own balance", status == 200, f"{balance.get('total_remaining')} days left")
vacation = next((b for b in balance["balances"] if b["leave_type"] == "vacation"), None)
ok("entitlement comes from policy", vacation and vacation["annual_days"] > 0,
   vacation and vacation["annual_days"])
ok("pending days are held against the balance",
   vacation and vacation["remaining"] == round(
       vacation["entitled"] - vacation["taken"] - vacation["pending"], 1))

_, dev_session = call("GET", "/auth/me", dev)
dev_id = dev_session.get("user", dev_session)["id"]
status, _ = call("GET", "/hr/leave/balance", dev, params={"user_id": "00000000-0000-0000-0000-000000000000"})
ok("an employee cannot read someone else's", status in (403, 404), f"HTTP {status}")

before = vacation["remaining"]
call("POST", "/hr/leave/adjustments", admin,
     {"user_id": dev_id, "leave_type": "vacation", "year": date.today().year,
      "days": 2, "reason": "Carried over"})
_, after_balance = call("GET", "/hr/leave/balance", dev)
after = next(b for b in after_balance["balances"] if b["leave_type"] == "vacation")["remaining"]
ok("an adjustment moves the balance", after == round(before + 2, 1), f"{before} → {after}")

print(f"{CYAN}Recurring money{RESET}")
_, accounts = call("GET", "/finance/accounts", admin)
account_id = accounts[0]["id"] if accounts else None
start = date.today() - timedelta(days=75)
status, schedule = call("POST", "/finance/recurring", admin, {
    "name": "Office rent", "kind": "expense", "amount": 4200, "cadence": "monthly",
    "day_of_month": 1, "starts_on": start, "account_id": account_id,
    "description": "Monthly office rent"})
ok("a schedule can be created", status == 201, schedule.get("name"))
schedule_id = schedule.get("id")
ok("it knows it is due", schedule.get("is_due") is True)

status, posted = call("POST", "/finance/recurring/post", admin,
                      params={"recurring_id": schedule_id})
ok("posting catches up every missed period", status == 200 and posted["posted"] >= 2,
   f"{posted['posted']} transactions, {posted['total']}")

status, again = call("POST", "/finance/recurring/post", admin,
                     params={"recurring_id": schedule_id})
ok("posting twice does not duplicate", again["posted"] == 0, f"{again['posted']} posted")

_, listing = call("GET", "/finance/recurring", admin)
row = next(r for r in listing["items"] if r["id"] == schedule_id)
ok("the cursor advanced past today", row["next_run"] > str(date.today()), row["next_run"])

status, _ = call("POST", "/finance/recurring", dev, {
    "name": "nope", "amount": 1, "starts_on": date.today()})
ok("an employee cannot schedule money", status == 403, f"HTTP {status}")

call("DELETE", f"/finance/recurring/{schedule_id}", admin)

print()
if failures:
    print(f"{RED}{failures} check(s) failed.{RESET}")
    sys.exit(1)
print(f"{GREEN}All module checks passed.{RESET}")
PY
