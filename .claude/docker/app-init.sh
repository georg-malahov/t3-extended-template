#!/bin/bash
# app-init.sh — populates the node_modules Docker volume from prebuilt modules.
# Runs as root before the entrypoint drops to 'app' user.
# Prebuilt modules live at /prebuilt_node_modules (baked into the image).
# A named Docker volume is mounted over /workspace/node_modules by bin/ralphex-dk,
# so host node_modules are never touched.

set -e

if [ ! -f /workspace/node_modules/.yarn-integrity ]; then
    if [ -d /prebuilt_node_modules ]; then
        # Race condition fix: CI checks for .yarn-integrity to know when
        # node_modules is ready. We must copy .yarn-integrity LAST so it
        # only appears after all binaries (.bin/) are fully copied.
        #
        # 1. Temporarily hide .yarn-integrity from the source
        # 2. Copy everything else (including .bin/ symlinks)
        # 3. Restore and copy .yarn-integrity as the final signal
        mv /prebuilt_node_modules/.yarn-integrity /tmp/.yarn-integrity-hold
        cp -a /prebuilt_node_modules/. /workspace/node_modules/
        cp -a /tmp/.yarn-integrity-hold /workspace/node_modules/.yarn-integrity
        mv /tmp/.yarn-integrity-hold /prebuilt_node_modules/.yarn-integrity
        echo "[app-init] populated node_modules volume from prebuilt image"
    elif [ -f /workspace/package.json ]; then
        echo "[app-init] no prebuilt node_modules found, running yarn install..."
        cd /workspace && yarn install --frozen-lockfile
        echo "[app-init] yarn install complete"
    else
        echo "[app-init] WARNING: no prebuilt modules and no package.json — node_modules will be empty"
    fi
else
    echo "[app-init] node_modules volume already populated, skipping"
fi
