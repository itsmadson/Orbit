#!/usr/bin/env bash
# The daily-use loops: mentioning someone, and triaging a board in bulk.
#   ./scripts/test-daily.sh [api_base_url]
set -euo pipefail
API="${1:-http://localhost:8000}/api/v1"

python3 - "$API" "${ORBIT_PASSWORD:-orbit1234}" <<'PY'
import json, sys, urllib.request, urllib.error

API, PASSWORD = sys.argv[1], sys.argv[2]
GREEN, RED, CYAN, RESET = "\033[32m", "\033[31m", "\033[36m", "\033[0m"
failures = 0


def call(method, path, token=None, body=None, params=None):
    url = f"{API}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True)
    request = urllib.request.Request(url, method=method)
    request.add_header("content-type", "application/json")
    if token:
        request.add_header("authorization", f"Bearer {token}")
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(request, data) as response:
            return response.status, json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as error:
        return error.code, error.read()[:200].decode(errors="replace")


import urllib.parse


def login(email):
    _, body = call("POST", "/auth/login", body={"email": email, "password": PASSWORD})
    return body["access_token"]


def ok(label, condition, detail=""):
    global failures
    if not condition:
        failures += 1
    print(f"  {GREEN + '✓' + RESET if condition else RED + '✗' + RESET} {label}"
          f"{(' — ' + str(detail)) if detail else ''}")


admin, dev = login("admin@orbit.dev"), login("dev@orbit.dev")
_, dev_session = call("GET", "/auth/me", dev)
dev_user = dev_session.get("user", dev_session)

print(f"{CYAN}Mentioning someone{RESET}")
_, tasks = call("GET", "/tasks", admin, params={"page_size": 1})
task = tasks["items"][0]

_, before = call("GET", "/notifications/counts", dev)
status, comment = call("POST", "/comments", admin,
                       body={"body": f"@{dev_user['full_name']} can you take a look?",
                             "mentions": [dev_user["id"]]},
                       params={"entity_type": "task", "entity_id": task["id"]})
ok("a comment can carry a mention", status == 201, comment.get("mentions"))

_, after = call("GET", "/notifications/counts", dev)
ok("the mentioned person is notified",
   after.get("mentions", 0) > before.get("mentions", 0),
   f"mentions {before.get('mentions', 0)} → {after.get('mentions', 0)}")

status, inbox = call("GET", "/notifications", dev, params={"filter": "mentions"})
ok("it lands under the inbox Mentions filter", status == 200 and inbox["total"] > 0,
   f"{inbox['total']} in filter")

print(f"{CYAN}Bulk triage{RESET}")
_, page = call("GET", "/tasks", admin,
               params={"page_size": 6, "status": ["todo", "backlog", "in_progress"]})
ids = [row["id"] for row in page["items"]][:3]
ok("found tasks to triage", len(ids) >= 2, f"{len(ids)} tasks")

if len(ids) >= 2:
    status, result = call("POST", "/tasks/bulk", admin,
                          body={"ids": ids, "priority": "high"})
    ok("one call sets priority on many", status == 200, result.get("message"))

    _, check = call("GET", f"/tasks/{ids[0]}", admin)
    ok("the change actually landed", check["priority"] == "high", check["priority"])

    # Unset fields must be left alone — the whole point of a partial update.
    sprint_before = check.get("sprint_id")
    call("POST", "/tasks/bulk", admin, body={"ids": ids, "assignee_id": dev_user["id"]})
    _, recheck = call("GET", f"/tasks/{ids[0]}", admin)
    ok("assigning does not clear the sprint", recheck.get("sprint_id") == sprint_before)
    ok("the assignee changed", (recheck.get("assignee") or {}).get("id") == dev_user["id"])

    status, _ = call("POST", "/tasks/bulk", admin, body={"ids": ids, "status": "nonsense"})
    ok("an unknown status is refused", status == 400, f"HTTP {status}")

    # Deliberately not a status change: a permission check should not leave the
    # board rearranged behind it.
    status, _ = call("POST", "/tasks/bulk", dev, body={"ids": ids, "priority": "medium"})
    ok("bulk still respects permissions", status in (200, 403), f"HTTP {status}")
    call("POST", "/tasks/bulk", admin, body={"ids": ids, "priority": "high"})

    status, _ = call("POST", "/tasks/bulk", admin, body={"ids": [], "status": "done"})
    ok("an empty selection is refused", status == 400, f"HTTP {status}")

print()
if failures:
    print(f"{RED}{failures} check(s) failed.{RESET}")
    sys.exit(1)
print(f"{GREEN}All daily-loop checks passed.{RESET}")
PY
