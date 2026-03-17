#!/bin/bash
# entrypoint.sh — Debian-compatible entrypoint for ralphex-t3 container.
# Mirrors the official ralphex Alpine entrypoint: runs init, drops to app user.

set -e

echo "init container"

# Set timezone
if [ -n "${TIME_ZONE:-}" ] && [ -f "/usr/share/zoneinfo/${TIME_ZONE}" ]; then
  ln -sf "/usr/share/zoneinfo/${TIME_ZONE}" /etc/localtime
  echo "${TIME_ZONE}" > /etc/timezone
  echo "set timezone ${TIME_ZONE} ($(date))"
fi

# Adjust app user UID if requested
if [ -n "${APP_UID:-}" ] && [ "${APP_UID}" != "1001" ]; then
  echo "set custom APP_UID=${APP_UID}"
  usermod -u "${APP_UID}" app
  groupmod -g "${APP_UID}" app
else
  echo "custom APP_UID not defined, using default uid=1001"
fi

# Fix ownership
chown -R app:app /srv
if [ "${SKIP_HOME_CHOWN}" != "1" ]; then
  chown -R app:app /home/app
fi

# Run init script (starts PostgreSQL)
if [ -f /srv/init.sh ]; then
  echo "execute /srv/init.sh"
  chmod +x /srv/init.sh
  /srv/init.sh
fi

echo "execute $*"
exec gosu app "$@"
