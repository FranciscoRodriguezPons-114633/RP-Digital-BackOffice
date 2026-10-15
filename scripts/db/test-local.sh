#!/usr/bin/env bash
# Corre migraciones y pruebas pgTAP contra un Postgres local (sin Docker ni Supabase CLI).
# Uso: PGHOST=/tmp PGPORT=5432 PGUSER=postgres ./scripts/db/test-local.sh
set -euo pipefail
DB="${TEST_DB:-rp_backoffice_test}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

dropdb --if-exists "$DB" >/dev/null 2>&1 || true
createdb "$DB"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -c "alter database \"$DB\" set search_path = \"\$user\", public, extensions;"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/scripts/db/local-shim.sql"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -c "create extension if not exists pgtap with schema extensions;"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "migración: $(basename "$f")"
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"
done

status=0
for t in "$ROOT"/supabase/tests/database/*.test.sql; do
  echo "prueba: $(basename "$t")"
  out="$(psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$t" 2>&1)" || status=1
  echo "$out" | grep -E "^ *(ok|not ok|# )" || true
  if echo "$out" | grep -qE "^ *not ok|ERROR|Looks like"; then status=1; echo "$out" | grep -E "not ok|ERROR|Looks like|#" ; fi
done
exit $status
