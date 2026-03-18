#!/bin/bash
# app-init.sh — populates the node_modules Docker volume from prebuilt modules.
# Runs as root before the entrypoint drops to 'app' user.
# Prebuilt modules live at /prebuilt_node_modules (baked into the image).
# A named Docker volume is mounted over /workspace/node_modules by bin/ralphex-dk,
# so host node_modules are never touched.

set -e

if [ -d /prebuilt_node_modules ]; then
    if [ ! -f /workspace/node_modules/.yarn-integrity ]; then
        cp -a /prebuilt_node_modules/. /workspace/node_modules/
        echo "[app-init] populated node_modules volume from prebuilt image"
    else
        echo "[app-init] node_modules volume already populated, skipping copy"
    fi
fi
