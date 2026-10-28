#!/bin/sh
# Render entrypoint: API in the foreground, AI worker alongside it, and an
# optional Prisma schema sync on boot (first deploy of a fresh database).
set -u

PORT="${PORT:-10000}"
export PORT

echo "[start] ExamTrust API on port ${PORT}"
mkdir -p "${PROCTORING_EVIDENCE_DIR:-./var/proctoring-evidence}"

if [ "${RUN_DB_PUSH:-true}" = "true" ]; then
  echo "[start] syncing Prisma schema (db push)"
  npx prisma db push --schema prisma/schema.prisma --accept-data-loss --skip-generate \
    || echo "[start] WARN: prisma db push failed (see log above)"
fi

if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "[start] seeding demo data (seed-master)"
  npx --yes ts-node --transpile-only --compiler-options \
    '{"module":"commonjs","moduleResolution":"node"}' prisma/seed-master.ts \
    || echo "[start] WARN: seed failed (see log above)"
fi

if [ "${RUN_AI_WORKER:-true}" = "true" ] && [ -f dist/ai-worker.js ]; then
  echo "[start] starting AI worker in the background"
  node dist/ai-worker.js &
fi

echo "[start] starting API"
exec node dist/main.js
