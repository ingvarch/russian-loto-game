#!/usr/bin/env bash
#
# Full production deploy: back up D1, migrate, then ship the Worker.
#
# The order matters. The backup runs first so there is something to
# restore from if a migration goes wrong, and the deploy runs last so the
# new code never reaches production ahead of the schema it needs.
#
# Any step failing aborts the rest — a half-applied deploy is worse than
# no deploy.
#
# Usage: bun run deploy:full

set -euo pipefail

DB_NAME="russian-loto-db"
BACKUP_DIR="backups"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}-${STAMP}.sql"

step() {
  printf '\n\033[1m==> %s\033[0m\n' "$1"
}

step "1/3  Backing up ${DB_NAME} to ${BACKUP_FILE}"
mkdir -p "$BACKUP_DIR"
bunx wrangler d1 export "$DB_NAME" --remote --output "$BACKUP_FILE" --skip-confirmation

# An export that "succeeded" into an empty file is a false sense of
# safety, so refuse to migrate on top of one.
if [ ! -s "$BACKUP_FILE" ]; then
  echo "backup file is empty -- aborting before the migration" >&2
  exit 1
fi
echo "backup ok: $(wc -c < "$BACKUP_FILE" | tr -d ' ') bytes"

step "2/3  Applying migrations"
bunx wrangler d1 migrations apply "$DB_NAME" --remote

step "3/3  Deploying the Worker"
bunx wrangler deploy --env=""

step "Done. Backup kept at ${BACKUP_FILE}"
