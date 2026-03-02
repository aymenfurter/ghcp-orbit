#!/usr/bin/env bash
# Packages the Electron app for the specified platform.
# Usage:
#   ./scripts/package.sh              — current platform
#   ./scripts/package.sh --mac        — macOS (dmg + zip)
#   ./scripts/package.sh --win        — Windows (nsis + portable)
#   ./scripts/package.sh --linux      — Linux (AppImage + deb)
#   ./scripts/package.sh --dir        — unpacked directory (for testing)
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Building application..."
node build.mjs

BUILDER_ARGS=""

for arg in "$@"; do
  case "$arg" in
    --mac)    BUILDER_ARGS+=" --mac" ;;
    --win)    BUILDER_ARGS+=" --win" ;;
    --linux)  BUILDER_ARGS+=" --linux" ;;
    --dir)    BUILDER_ARGS+=" --dir" ;;
  esac
done

BUILDER_ARGS+=" --publish never"

echo "Packaging: npx electron-builder${BUILDER_ARGS}"
npx electron-builder $BUILDER_ARGS

echo ""
echo "Done. Output is in ./release/"
