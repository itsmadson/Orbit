#!/usr/bin/env bash
# Translation hygiene: every key the web app asks for exists, in both languages.
#   ./scripts/check-i18n.sh
# Fails when a t("…") key is missing from en.json or fa.json, when the two
# dictionaries disagree on their keys, or when a Persian value is still English.
set -euo pipefail
cd "$(dirname "$0")/../apps/web"

python3 - <<'PY'
import glob, json, re, sys

en = json.load(open("messages/en.json"))
fa = json.load(open("messages/fa.json"))
failures = 0


def fail(title, items):
    global failures
    if items:
        failures += len(items)
        print(f"\033[31m✗ {title} ({len(items)})\033[0m")
        for item in sorted(items)[:40]:
            print(f"    {item}")
    else:
        print(f"\033[32m✓ {title}\033[0m")


fail("keys missing from fa.json", [k for k in en if k not in fa])
fail("keys missing from en.json", [k for k in fa if k not in en])

used = {}
pattern = re.compile(r"""\bt\(\s*["']([A-Za-z0-9_.]+)["']""")
sources = [f for g in ("app/**/*.tsx", "features/**/*.tsx", "components/**/*.tsx", "lib/*.ts*")
           for f in glob.glob(g, recursive=True)]
for path in sources:
    for number, line in enumerate(open(path, encoding="utf-8"), 1):
        for key in pattern.findall(line):
            used.setdefault(key, f"{path}:{number}")
fail("keys used in code but not defined", [f"{k}  ({where})" for k, where in used.items() if k not in en])

# A Persian entry that is byte-for-byte the English one was never translated.
# Brand names and codes are the same in both languages by design.
same = [k for k in en if fa.get(k) == en[k] and re.search(r"[A-Za-z]{4,}", en[k])
        and not re.fullmatch(r"[A-Z0-9 &/.·-]+|Orbit AI|GitHub|GitLab|Jira|Zoom", en[k])]
fail("Persian values identical to English", same)

print(f"\n{len(en)} keys, {len(used)} referenced from {len(sources)} files")
sys.exit(1 if failures else 0)
PY
