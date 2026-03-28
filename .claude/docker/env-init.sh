#!/bin/bash
# env-init.sh — loads Doppler secrets into the current shell environment.
# Sourced (not executed) by /init.sh just before exec'ing the app process.
#
# /srv/doppler-env.sh is created by doppler-init.sh during container startup.
# If the file exists, its exported variables override Dockerfile ENV defaults.
# If no Doppler token was provided, the file won't exist and Dockerfile ENV
# defaults remain in effect — no action needed.

# Load Doppler secrets if available (created by doppler-init.sh during startup)
if [ -f /srv/doppler-env.sh ]; then
  # shellcheck disable=SC1091
  . /srv/doppler-env.sh
  rm -f /srv/doppler-env.sh
fi

# The container runs its own PostgreSQL and MinIO.
# Override vars so the app always uses in-container services, regardless of
# whether Doppler provided values pointing to external hosts.
export DATABASE_URL="postgresql://postgres@localhost:5432/app"
export AUTH_DATABASE_URL="postgresql://postgres@localhost:5432/app?options=-csearch_path%3Dauth"
export APP_URL="http://localhost:3000"
export BETTER_AUTH_URL="http://localhost:3000/api/auth"
export NODE_ENV="development"
export MINIO_ENDPOINT="http://localhost:9000"
export MINIO_ACCESS_KEY="minioadmin"
export MINIO_SECRET_KEY="minioadmin"
export MINIO_BUCKET="app-storage"

# Test user defaults
export TEST_USER_EMAIL="testuser@localhost"
export TEST_USER_PASSWORD="testpassword"
export TEST_USER_NAME="Test User"

# Security-sensitive secrets must also be overridden to prevent Doppler
# production values from leaking into the sandbox environment.
export AUTH_SECRET="tZWssbPUE8cxF7JwsLxKuiE8lBaWC/eFEB9AUKzEUzA="
