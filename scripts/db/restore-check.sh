#!/usr/bin/env bash
# Prueba que una copia se puede restaurar: levanta un Postgres de Supabase vacío en otro
# puerto, carga roles, esquema y datos como indica Supabase para pasar de un proyecto a
# otro, y compara el conteo de las tablas principales con el que se tomó al copiar.
# Uso: scripts/db/restore-check.sh <carpeta de la copia>
set -euo pipefail
SRC="$(cd "${1:?Falta la carpeta de la copia}" && pwd)"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${RESTORE_DB_PORT:-55432}"
WORK="$(mktemp -d)"

mkdir -p "$WORK/supabase"
cat > "$WORK/supabase/config.toml" <<EOF
project_id = "restauracion-de-prueba"

[db]
port = $PORT
shadow_port = $((PORT + 1))
major_version = 17
EOF

cleanup() { supabase stop --workdir "$WORK" --no-backup >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

supabase db start --workdir "$WORK"
DB="postgresql://postgres:postgres@127.0.0.1:$PORT/postgres"

# Los permisos sobre parámetros de Postgres los maneja Supabase y el usuario postgres no
# los puede otorgar: se dejan afuera al restaurar.
grep -v 'ON PARAMETER' "$SRC/roles.sql" > "$WORK/roles.sql"

psql "$DB" -X -q --single-transaction -v ON_ERROR_STOP=1 \
  -f "$WORK/roles.sql" \
  -f "$SRC/schema.sql" \
  -c 'SET session_replication_role = replica' \
  -f "$SRC/data.sql" >/dev/null

psql "$DB" -X -q -t -A -v ON_ERROR_STOP=1 -f "$ROOT/scripts/db/conteos.sql" > "$WORK/conteos.txt"
if diff -u "$SRC/conteos.txt" "$WORK/conteos.txt"; then
  echo "Restauración probada: los conteos coinciden."
  cat "$WORK/conteos.txt"
else
  echo "La copia restaurada no coincide con la original." >&2
  exit 1
fi
