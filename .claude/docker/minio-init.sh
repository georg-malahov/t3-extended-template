#!/bin/bash
# minio-init.sh — starts MinIO S3-compatible storage inside the ralphex container.
# Appended to the official /srv/init.sh by Dockerfile.ralphex.
# Runs as root; the entrypoint drops to 'app' user for the main command.

set -eo pipefail

MINIO_DATA="/data/minio"
MINIO_ROOT_USER="${MINIO_ACCESS_KEY:-minioadmin}"
MINIO_ROOT_PASSWORD="${MINIO_SECRET_KEY:-minioadmin}"
MINIO_BUCKET_NAME="${MINIO_BUCKET:-app-storage}"

mkdir -p "${MINIO_DATA}"

echo "[minio-init] starting MinIO..."

# Start MinIO in the background
MINIO_ROOT_USER="${MINIO_ROOT_USER}" \
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD}" \
minio server "${MINIO_DATA}" --address ":9000" --console-address ":9001" \
  >/var/log/minio.log 2>&1 &

# Wait for MinIO to be ready
for _ in $(seq 1 30); do
  if curl -sf http://localhost:9000/minio/health/ready >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

if ! curl -sf http://localhost:9000/minio/health/ready >/dev/null 2>&1; then
  echo "[minio-init] ERROR: MinIO failed to start"
  cat /var/log/minio.log
  exit 1
fi

# Configure mc client and create the bucket
mc alias set local http://localhost:9000 "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" --api S3v4 >/dev/null 2>&1
mc mb "local/${MINIO_BUCKET_NAME}" --ignore-existing >/dev/null 2>&1

echo "[minio-init] MinIO ready (bucket: ${MINIO_BUCKET_NAME})"
