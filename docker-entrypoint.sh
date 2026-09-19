#!/bin/sh
# Brings the database up to date, seeds the administrator the first time, then
# hands over to the command. Safe to run on every release: `migrate deploy`
# applies only outstanding migrations and the seed leaves an existing
# administrator's password alone.
set -e

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set — the app cannot start without a database." >&2
  exit 1
fi

echo "==> applying database migrations"
npx prisma migrate deploy

if [ -n "${ADMIN_EMAIL:-}" ] && [ -n "${ADMIN_INITIAL_PASSWORD:-}" ]; then
  echo "==> seeding the administrator"
  npm run seed:admin
else
  echo "==> ADMIN_EMAIL / ADMIN_INITIAL_PASSWORD not set; skipping admin seed"
fi

mkdir -p "${STORAGE_LOCAL_PATH:-/data/storage}" "${OCR_CACHE_PATH:-/data/tesseract-cache}"

exec "$@"
