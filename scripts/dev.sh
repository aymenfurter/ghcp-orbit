#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Building..."
node build.mjs

echo "Starting Electron in dev mode..."
npx electron . --dev
