#!/bin/sh
# Builds and serves the web app from the source mounted at /app, so a code
# change only needs `docker compose restart orbit-web` — no image rebuild.
set -eu

cd /app

# Reinstall dependencies only when the lockfile changes; node_modules lives in
# a named volume and survives restarts.
lock_hash="$(md5sum package-lock.json | cut -d' ' -f1)"
if [ ! -f node_modules/.lock-hash ] || [ "$(cat node_modules/.lock-hash)" != "$lock_hash" ]; then
  echo "[orbit-web] installing dependencies…"
  npm ci --include=dev --no-audit --no-fund || npm install --include=dev --no-audit --no-fund
  echo "$lock_hash" > node_modules/.lock-hash
fi

echo "[orbit-web] building…"
npm run build

# The standalone server expects public/ and .next/static next to it.
rm -rf .next/standalone/public .next/standalone/.next/static
cp -r public .next/standalone/public
cp -r .next/static .next/standalone/.next/static

echo "[orbit-web] starting"
exec node .next/standalone/server.js
