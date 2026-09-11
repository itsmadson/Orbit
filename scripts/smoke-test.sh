#!/usr/bin/env bash
# End-to-end smoke test against a running ORBIT stack.
#   ./scripts/smoke-test.sh [api_base_url]
set -euo pipefail

API="${1:-http://localhost:8000}/api/v1"
EMAIL="${ORBIT_EMAIL:-admin@orbit.dev}"
PASSWORD="${ORBIT_PASSWORD:-orbit1234}"

say() { printf '\033[36m%s\033[0m\n' "$1"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1"; exit 1; }

say "Signing in as $EMAIL"
TOKEN=$(curl -fsS -X POST "$API/auth/login" -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" |
  python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])') || fail "login"
ok "authenticated"

AUTH="Authorization: Bearer $TOKEN"

say "Reading core endpoints"
for path in /auth/me /dashboard /projects /tasks/board /ideas/pipeline /rd /documents \
            /decisions /meetings /requests /finance/summary /crm/pipeline /assets \
            /hr/summary /goals/tree /notifications/counts /analytics/company /ai/status; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -H "$AUTH" "$API$path")
  [ "$code" = "200" ] && ok "$path" || fail "$path returned $code"
done

say "Creating and moving a task"
PROJECT=$(curl -fsS -H "$AUTH" "$API/projects?page_size=1" |
  python3 -c 'import sys,json;print(json.load(sys.stdin)["items"][0]["id"])')
TASK=$(curl -fsS -X POST "$API/tasks" -H "$AUTH" -H 'content-type: application/json' \
  -d "{\"title\":\"Smoke test task\",\"project_id\":\"$PROJECT\",\"status\":\"todo\"}")
TASK_ID=$(echo "$TASK" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
ok "created $(echo "$TASK" | python3 -c 'import sys,json;print(json.load(sys.stdin)["key"])')"

curl -fsS -X POST "$API/tasks/$TASK_ID/move" -H "$AUTH" -H 'content-type: application/json' \
  -d '{"status":"in_progress","order_index":0}' > /dev/null && ok "moved to in_progress"

curl -fsS -X DELETE "$API/tasks/$TASK_ID" -H "$AUTH" > /dev/null && ok "cleaned up"

say "Checking RBAC (an employee must not read finance)"
DEV=$(curl -fsS -X POST "$API/auth/login" -H 'content-type: application/json' \
  -d '{"email":"dev@orbit.dev","password":"'"$PASSWORD"'"}' |
  python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
code=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $DEV" "$API/finance/summary")
[ "$code" = "403" ] && ok "finance blocked for employee (403)" || fail "expected 403, got $code"

printf '\n\033[32mAll smoke tests passed.\033[0m\n'
