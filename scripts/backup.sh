#!/usr/bin/env bash
set -euo pipefail
# Run with DATABASE_URL injected by your secret manager; use a PostgreSQL 17 client.
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_DIR:?Set a private backup destination}"
umask 077
mkdir -p "$BACKUP_DIR"
backup_file="$BACKUP_DIR/elite-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --no-acl --file="$backup_file"
sha256sum "$backup_file" > "$backup_file.sha256"
printf 'Backup completed: %s\n' "$backup_file"
