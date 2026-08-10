#!/bin/sh
set -e

# Applies any pending migrations before the app (or the cleanup loop)
# starts. Safe to run concurrently from multiple containers — Prisma takes
# an advisory lock in the database, so a second container just waits.
echo "[entrypoint] applying database migrations..."
npx prisma migrate deploy
echo "[entrypoint] migrations up to date."

exec "$@"
