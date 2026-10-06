#!/usr/bin/env bash
# Custom task statuses, Persian server text, and the assistant's guard rails.
#   ./scripts/test-statuses.sh [api_base_url]
# The assistant checks here never call a language model: they cover what must
# hold whichever model is plugged in. Leaves the workspace as it found it.
set -euo pipefail
API="${1:-http://localhost:8000}/api/v1"

python3 - "$API" "${ORBIT_PASSWORD:-orbit1234}" <<'PY'
import json, sys, urllib.error, urllib.parse, urllib.request

API, PASSWORD = sys.argv[1], sys.argv[2]
GREEN, RED, CYAN, RESET = "\033[32m", "\033[31m", "\033[36m", "\033[0m"
failures = 0


def call(method, path, token=None, body=None, params=None, locale=None):
    url = f"{API}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True)
    request = urllib.request.Request(url, method=method)
    request.add_header("content-type", "application/json")
    if token:
        request.add_header("authorization", f"Bearer {token}")
    if locale:
        request.add_header("x-orbit-locale", locale)
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(request, data) as response:
            return response.status, json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as error:
        raw = error.read()
        try:
            return error.code, json.loads(raw)
        except ValueError:
            return error.code, {"message": raw[:200].decode(errors="replace")}


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

print(f"{CYAN}The board is data{RESET}")
_, statuses = call("GET", "/task-statuses", admin)
keys = [s["key"] for s in statuses]
ok("a company starts with the six built-in states",
   {"backlog", "todo", "in_progress", "in_review", "done", "cancelled"} <= set(keys), keys)
ok("each carries a category reports can read",
   {s["category"] for s in statuses} == {"open", "started", "done", "cancelled"})

status, created = call("POST", "/task-statuses", admin,
                       {"name": "Waiting on customer", "name_fa": "در انتظار مشتری",
                        "category": "started", "color": "#00a7b5"})
ok("an admin can add a column", status == 201, created.get("key"))
key, status_id = created["key"], created["id"]
status, _ = call("POST", "/task-statuses", dev, {"name": "Nope"})
ok("someone without tasks.manage cannot", status == 403, status)

_, board = call("GET", "/tasks/board", admin)
columns = [c["key"] for c in board["columns"]]
ok("the new column is on the board, after the other started states",
   key in columns and columns.index(key) > columns.index("in_progress") and
   columns.index(key) < columns.index("done"), columns)
ok("cancelled states are not columns", "cancelled" not in columns)

print(f"{CYAN}Tasks move through custom states{RESET}")
_, page = call("GET", "/tasks", admin, params={"status": "todo", "page_size": 1})
task = page["items"][0]
original = task["status"]
status, moved = call("POST", f"/tasks/{task['id']}/move", admin, {"status": key, "order_index": 0})
ok("a task can be dropped into it", status == 200 and moved["status"] == key)
ok("a started state does not mark it complete", moved.get("completed_at") is None)
_, listed = call("GET", "/tasks", admin, params={"open_only": "true", "q": task["key"]})
ok("it still counts as open work",
   any(item["id"] == task["id"] for item in listed["items"]))
status, _ = call("PATCH", f"/tasks/{task['id']}", admin, {"status": "done"})
_, after = call("GET", f"/tasks/{task['id']}", admin)
ok("a done-category state stamps completion", after.get("completed_at") is not None)
call("PATCH", f"/tasks/{task['id']}", admin, {"status": key})

status, error = call("PATCH", f"/tasks/{task['id']}", admin, {"status": "no_such_state"})
ok("an unknown state is refused", status == 400, error.get("message"))
status, error = call("GET", "/tasks", admin, params={"status": "bogus"})
ok("filtering by an unknown state is an error, not an empty list",
   status == 400 and "Valid:" in error.get("message", ""), status)
status, by_category = call("GET", "/tasks", admin, params={"status": "started", "page_size": 100})
ok("a category works as a filter and includes the custom state",
   status == 200 and any(item["status"] == key for item in by_category["items"]))

print(f"{CYAN}Rename, reorder, delete{RESET}")
status, renamed = call("PATCH", f"/task-statuses/{status_id}", admin, {"name": "Blocked on client"})
ok("rename keeps the key, so tasks do not move",
   status == 200 and renamed["key"] == key and renamed["name"] == "Blocked on client")
todo = next(s for s in statuses if s["key"] == "todo")
status, error = call("PATCH", f"/task-statuses/{todo['id']}", admin, {"category": "done"})
ok("a built-in state cannot change its meaning", status == 400, error.get("message"))
status, error = call("DELETE", f"/task-statuses/{todo['id']}", admin)
ok("or be deleted", status == 400)
status, reordered = call("POST", "/task-statuses/reorder", admin, {"keys": [key] + keys})
ok("columns can be reordered", status == 200 and reordered[0]["key"] == key)
call("POST", "/task-statuses/reorder", admin, {"keys": keys})

status, error = call("DELETE", f"/task-statuses/{status_id}", admin)
ok("a column holding tasks cannot be deleted without a destination", status == 400)
status, _ = call("DELETE", f"/task-statuses/{status_id}", admin, params={"move_to": original})
_, after = call("GET", f"/tasks/{task['id']}", admin)
ok("with one, its tasks move there first", status == 200 and after["status"] == original,
   after["status"])
_, final = call("GET", "/task-statuses", admin)
ok("and the column is gone", key not in [s["key"] for s in final])

print(f"{CYAN}The server speaks Persian when asked{RESET}")
status, error = call("GET", "/tasks/00000000-0000-0000-0000-000000000000", admin, locale="fa")
ok("errors are translated", status == 404 and "پیدا نشد" in error.get("message", ""),
   error.get("message"))
_, error_en = call("GET", "/tasks/00000000-0000-0000-0000-000000000000", admin)
ok("and stay English otherwise", error_en.get("message") == "Task not found")
_, dashboard = call("GET", "/dashboard", admin, locale="fa")
titles = " ".join(i["title"] for i in dashboard.get("insights", []))
ok("insights are translated", not titles or any("؀" <= ch <= "ۿ" for ch in titles),
   titles[:60])
status, error = call("POST", "/task-statuses", dev, {"name": "x"}, locale="fa")
ok("permission errors too", "دسترسی" in error.get("message", ""), error.get("message"))

print(f"{CYAN}The assistant's guard rails{RESET}")
status, ai = call("GET", "/ai/status", admin, locale="fa")
ok("status reports whether it can act", status == 200 and "agent" in ai, ai.get("provider"))
ok("suggested prompts follow the language",
   any("؀" <= ch <= "ۿ" for ch in "".join(ai["suggested_prompts"])))
status, _ = call("POST", "/ai/ask", admin, {"question": "   "})
ok("an empty question is refused before any model call", status == 400)
status, _ = call("POST", "/ai/conversations/00000000-0000-0000-0000-000000000000/actions/x",
                 admin, {"decision": "approve"})
ok("approving an action in someone else's (or no) conversation is a 404", status == 404)
_, integrations = call("GET", "/integrations", admin)
by_provider = {i["provider"]: i for i in integrations}
ok("GitHub, GitLab and Jira are connectable",
   all(by_provider[p]["connectable"] for p in ("github", "gitlab", "jira")))
ok("Tau and GapGPT are listed", {"tau", "gapgpt"} <= set(by_provider))
ok("no token ever appears in the catalogue",
   "secret" not in json.dumps(integrations) and "sk-" not in json.dumps(integrations))
status, error = call("POST", "/integrations/github/connect", dev, {"token": "x"})
ok("connecting a tracker needs integrations.manage", status == 403, status)
status, error = call("GET", "/integrations/github/projects", admin)
ok("using a tracker that is not connected is a clear error",
   status == 400 and "not connected" in error.get("message", ""), error.get("message"))

print()
print(f"{GREEN}statuses: all checks passed{RESET}" if not failures
      else f"{RED}statuses: {failures} check(s) failed{RESET}")
sys.exit(1 if failures else 0)
PY
