#!/bin/bash
# ralphex-init.sh — starts PostgreSQL inside the ralphex container.
# Called by the entrypoint (/init.sh) before ralphex launches.
# Runs as root; the entrypoint drops to 'app' user for the main command.

set -e

PG_DB="app"
# Auto-detect installed PostgreSQL version
PG_VERSION=$(ls /usr/lib/postgresql/ | sort -rn | head -1)
PG_BIN="/usr/lib/postgresql/${PG_VERSION}/bin"
PG_DATA="/var/lib/postgresql/${PG_VERSION}/data"

mkdir -p "${PG_DATA}" /run/postgresql
chown -R postgres:postgres "${PG_DATA}" /run/postgresql

echo "[ralphex-init] starting PostgreSQL ${PG_VERSION}..."

# Initialize database cluster if needed
if [ ! -f "${PG_DATA}/PG_VERSION" ]; then
  gosu postgres "${PG_BIN}/initdb" -D "${PG_DATA}" --auth=trust --no-locale --encoding=UTF8
fi

# Start PostgreSQL in the background
gosu postgres "${PG_BIN}/pg_ctl" -D "${PG_DATA}" -l /var/lib/postgresql/pg.log start

# Wait for PostgreSQL to be ready
for i in $(seq 1 30); do
  if pg_isready -q; then
    break
  fi
  sleep 0.5
done

# Create database and auth schema
gosu postgres createdb "${PG_DB}" 2>/dev/null || true
gosu postgres psql -d "${PG_DB}" -c "CREATE SCHEMA IF NOT EXISTS auth;" 2>/dev/null

echo "[ralphex-init] PostgreSQL ready (database: ${PG_DB}, auth schema created)"
