#!/usr/bin/env bash
set -euo pipefail
: "${RESTORE_DATABASE_URL:?Use a separate EMPTY database created for this test}"
: "${DATABASE_URL:?The original database URL is needed for safety comparison}"
node -e 'const a=new URL(process.env.DATABASE_URL), b=new URL(process.env.RESTORE_DATABASE_URL);if(a.host===b.host&&a.pathname===b.pathname)process.exit(1)' || { echo 'Refusing to restore over the source database.' >&2; exit 1; }
[ "$(psql "$RESTORE_DATABASE_URL" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")" = '0' ] || { echo 'Restore target is not empty.' >&2; exit 1; }
sha256sum -c "$1.sha256"
pg_restore --dbname="$RESTORE_DATABASE_URL" --no-owner --no-acl --exit-on-error "$1"
psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -c 'SELECT count(*) AS products FROM "Product"; SELECT count(*) AS variants FROM "Variant";'
echo 'Restore completed. Inspect counts and run application smoke checks against this isolated database.'
