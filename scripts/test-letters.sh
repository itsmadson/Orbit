#!/usr/bin/env bash
# End-to-end check of the secretariat: numbering, composing, exports and RBAC.
#   ./scripts/test-letters.sh [api_base_url]
set -euo pipefail
API="${1:-http://localhost:8000}/api/v1"
PASSWORD="${ORBIT_PASSWORD:-orbit1234}"
OUT="${OUT_DIR:-$(mktemp -d)}"

python3 - "$API" "$PASSWORD" "$OUT" <<'PY'
import json, sys, urllib.request, urllib.error

API, PASSWORD, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
GREEN, RED, CYAN, RESET = "\033[32m", "\033[31m", "\033[36m", "\033[0m"
failures = 0


def call(method, path, token=None, body=None, raw=False):
    request = urllib.request.Request(f"{API}{path}", method=method)
    request.add_header("content-type", "application/json")
    if token:
        request.add_header("authorization", f"Bearer {token}")
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(request, data) as response:
            payload = response.read()
            return response.status, (payload if raw else json.loads(payload or b"{}"))
    except urllib.error.HTTPError as error:
        return error.code, error.read()[:200]


def ok(label, condition, detail=""):
    global failures
    if condition:
        print(f"  {GREEN}✓{RESET} {label}{(' — ' + str(detail)) if detail else ''}")
    else:
        failures += 1
        print(f"  {RED}✗{RESET} {label} — {detail}")


def section(title):
    print(f"{CYAN}{title}{RESET}")


section("Signing in")
_, auth = call("POST", "/auth/login", body={"email": "admin@orbit.dev", "password": PASSWORD})
token = auth["access_token"]
ok("authenticated as the company admin", bool(token))

section("Numbering formula")
status, numbering = call("GET", "/letter-numbering", token)
ok("numbering settings load", status == 200, numbering.get("pattern"))
ok("pattern renders a preview", bool(numbering.get("preview")), numbering.get("preview"))

status, preview = call(
    "GET", "/letter-numbering/preview?pattern=ORB-%7Byear%7D-%7Bseq:05%7D&digits=en", token)
ok("a custom formula previews without consuming a number",
   preview["samples"][0]["value"].startswith("ORB-"), preview["samples"][0]["value"])

section("Composing from plain text")
body = {
    "text": "با سلام،\n\nبدین‌وسیله اعلام می‌گردد جلسه هماهنگی پروژه برگزار خواهد شد.\n\n"
            "خواهشمند است حضور خود را تأیید فرمایید.",
    "recipient_name": "دکتر احمدی",
    "recipient_org": "شرکت کبالت انرژی",
    "subject": "هماهنگی جلسه پروژه",
    "register_now": True,
}
status, letter = call("POST", "/letters/compose", token, body)
ok("letter composed", status == 201, letter.get("subject"))
ok("number allocated on registration", bool(letter.get("number")), letter.get("number"))
ok("salutation filled from the template", bool(letter.get("salutation")), letter.get("salutation"))
letter_id = letter["id"]

section("Exports")
status, pdf = call("GET", f"/letters/{letter_id}/pdf", token, raw=True)
ok("PDF renders", status == 200 and pdf[:4] == b"%PDF", f"{len(pdf)} bytes")
open(f"{OUT}/letter.pdf", "wb").write(pdf)

status, docx = call("GET", f"/letters/{letter_id}/docx", token, raw=True)
ok("DOCX renders", status == 200 and docx[:2] == b"PK", f"{len(docx)} bytes")
open(f"{OUT}/letter.docx", "wb").write(docx)

status, html = call("GET", f"/letters/{letter_id}/preview", token)
ok("preview HTML matches the print sheet", "letter-header" in html["html"])

section("Lifecycle")
status, signed = call("POST", f"/letters/{letter_id}/sign", token, {})
ok("signed", signed.get("status") == "signed")
status, sent = call("POST", f"/letters/{letter_id}/send", token, {"delivery_method": "post"})
ok("sent", sent.get("status") == "sent", sent.get("delivery_method"))
status, _ = call("DELETE", f"/letters/{letter_id}", token)
ok("a registered letter cannot be deleted", status == 409, f"HTTP {status}")
status, voided = call("POST", f"/letters/{letter_id}/void", token, {})
ok("but it can be voided", voided.get("status") == "void")

section("Register integrity")
status, first = call("POST", "/letters", token, {"subject": "شماره‌گذاری ۱", "register_now": True})
status, second = call("POST", "/letters", token, {"subject": "شماره‌گذاری ۲", "register_now": True})
ok("consecutive letters take consecutive numbers",
   second["number_seq"] == first["number_seq"] + 1,
   f'{first["number"]} → {second["number"]}')
for row in (first, second):
    call("POST", f"/letters/{row['id']}/void", token, {})

section("Permissions")
_, dev = call("POST", "/auth/login", body={"email": "dev@orbit.dev", "password": PASSWORD})
dev_token = dev["access_token"]
status, _ = call("GET", "/letters", dev_token)
ok("an employee can read the register", status == 200, f"HTTP {status}")
status, _ = call("POST", "/letters", dev_token, {"subject": "nope"})
ok("an employee cannot write letters", status == 403, f"HTTP {status}")
status, _ = call("PATCH", "/letter-numbering", dev_token, {"pattern": "{seq}"})
ok("an employee cannot change the numbering formula", status == 403, f"HTTP {status}")

print()
if failures:
    print(f"{RED}{failures} check(s) failed.{RESET}")
    sys.exit(1)
print(f"{GREEN}All secretariat checks passed.{RESET} Artefacts in {OUT}")
PY
