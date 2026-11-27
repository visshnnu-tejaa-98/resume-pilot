#!/usr/bin/env bash
# Runs the test suites against a dedicated database (never the dev one).
# Creates resume_pilot_test on the docker-compose Postgres if missing, applies
# migrations + seed, then runs `turbo run test` with DATABASE_URL pointing at it.
#   pnpm test:db                 # all packages
#   pnpm test:db --filter @resume-pilot/services
set -euo pipefail
cd "$(dirname "$0")/.."

export TEST_DATABASE_URL="${TEST_DATABASE_URL:-postgres://postgres:postgres@localhost:55432/resume_pilot_test}"
export DATABASE_URL="$TEST_DATABASE_URL"
export REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"
db_name="${TEST_DATABASE_URL##*/}"

case "$db_name" in
  *test*) ;;
  *) echo "Refusing to run: TEST_DATABASE_URL must point at a database with 'test' in its name (got $db_name)." >&2; exit 1 ;;
esac

if command -v docker >/dev/null && docker ps --format '{{.Names}}' | grep -q '^resume-pilot-postgres$'; then
  docker exec resume-pilot-postgres psql -U postgres -Atc "select 1 from pg_database where datname='$db_name'" | grep -q 1 \
    || docker exec resume-pilot-postgres psql -U postgres -qc "create database $db_name"
fi

pnpm --filter @resume-pilot/database db:migrate >/dev/null
pnpm --filter @resume-pilot/database db:seed >/dev/null
exec pnpm exec turbo run test --concurrency=1 "$@"
