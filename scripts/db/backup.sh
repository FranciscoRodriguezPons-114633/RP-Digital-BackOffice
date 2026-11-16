#!/usr/bin/env bash
# Copia de la base: roles, esquema y datos, más el conteo de las tablas principales.
# Los archivos de Storage no entran: solo sus metadatos (storage.objects).
# Uso: SUPABASE_DB_URL=postgresql://... scripts/db/backup.sh <carpeta>
set -euo pipefail
: "${SUPABASE_DB_URL:?Falta SUPABASE_DB_URL}"
OUT="${1:?Falta la carpeta de salida}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
mkdir -p "$OUT"

supabase db dump --db-url "$SUPABASE_DB_URL" -f "$OUT/roles.sql" --role-only
supabase db dump --db-url "$SUPABASE_DB_URL" -f "$OUT/schema.sql"
# Las tablas de buckets vectoriales son internas de Storage: el usuario postgres no las
# puede escribir al restaurar, y este proyecto no las usa.
supabase db dump --db-url "$SUPABASE_DB_URL" -f "$OUT/data.sql" --data-only --use-copy \
  -x storage.buckets_vectors -x storage.vector_indexes
psql "$SUPABASE_DB_URL" -X -q -t -A -v ON_ERROR_STOP=1 -f "$ROOT/scripts/db/conteos.sql" > "$OUT/conteos.txt"

echo "Copia en $OUT:"
cat "$OUT/conteos.txt"
