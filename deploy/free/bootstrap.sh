#!/usr/bin/env bash
# One-shot bootstrap for the free single-VM deployment (Oracle Cloud Always Free
# or any Ubuntu 22.04/24.04 box with Docker installed).
#
#   bash deploy/free/bootstrap.sh            # build + start + sync DB schema
#   bash deploy/free/bootstrap.sh --seed     # ... and load the demo seed data
#
# Idempotent: safe to re-run after a git pull.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

ENV_FILE="deploy/free/.env"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f deploy/free/docker-compose.yml)
SEED=0
[[ "${1:-}" == "--seed" ]] && SEED=1

if [[ ! -f "$ENV_FILE" ]]; then
  cp deploy/free/env.example "$ENV_FILE"
  echo "Created $ENV_FILE from env.example"
fi

rand_hex() { openssl rand -hex "$1"; }

# Generate the three secrets on first run only.
if grep -q '^MYSQL_PASSWORD=CHANGE_ME$' "$ENV_FILE"; then
  sed -i "s|^MYSQL_PASSWORD=CHANGE_ME$|MYSQL_PASSWORD=$(rand_hex 16)|" "$ENV_FILE"
fi
if grep -q '^MYSQL_ROOT_PASSWORD=CHANGE_ME$' "$ENV_FILE"; then
  sed -i "s|^MYSQL_ROOT_PASSWORD=CHANGE_ME$|MYSQL_ROOT_PASSWORD=$(rand_hex 16)|" "$ENV_FILE"
fi
if grep -q '^JWT_SECRET=CHANGE_ME$' "$ENV_FILE"; then
  sed -i "s|^JWT_SECRET=CHANGE_ME$|JWT_SECRET=$(rand_hex 32)|" "$ENV_FILE"
fi

# Derive API_DOMAIN from the public IP when it is still the placeholder.
if grep -q '^API_DOMAIN=CHANGE_ME.sslip.io$' "$ENV_FILE"; then
  PUBLIC_IP="$(curl -fsS --max-time 10 https://api.ipify.org || true)"
  if [[ -n "$PUBLIC_IP" ]]; then
    sed -i "s|^API_DOMAIN=.*$|API_DOMAIN=${PUBLIC_IP}.sslip.io|" "$ENV_FILE"
    echo "API_DOMAIN set to ${PUBLIC_IP}.sslip.io"
  else
    echo "WARNING: could not detect the public IP; set API_DOMAIN manually in $ENV_FILE" >&2
  fi
fi

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

if [[ "$FRONTEND_URL" == *".vercel.app" ]]; then
  echo "WARNING: FRONTEND_URL/CORS_ORIGINS still point at $FRONTEND_URL —"
  echo "         update them to the real Vercel deployment URL before using the app."
fi

echo "==> Building and starting containers"
"${COMPOSE[@]}" up -d --build

echo "==> Waiting for the API to become healthy"
for i in $(seq 1 60); do
  if "${COMPOSE[@]}" ps backend | grep -q "(healthy)"; then
    break
  fi
  sleep 5
  if [[ "$i" == 60 ]]; then
    echo "API did not become healthy in time; showing logs:" >&2
    "${COMPOSE[@]}" logs --tail 80 backend >&2
    exit 1
  fi
done

echo "==> Syncing the Prisma schema (db push, matches the previous EC2 runbook)"
"${COMPOSE[@]}" exec -T backend \
  npx prisma db push --schema prisma/schema.prisma --accept-data-loss --skip-generate

if [[ "$SEED" == 1 ]]; then
  echo "==> Seeding demo data (seed-master, idempotent)"
  "${COMPOSE[@]}" exec -T backend \
    npx --yes ts-node --transpile-only --compiler-options \
    '{"module":"commonjs","moduleResolution":"node"}' prisma/seed-master.ts
fi

echo "==> Done. API: https://$API_DOMAIN/api  Swagger: https://$API_DOMAIN/docs"
