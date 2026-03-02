#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Installing dependencies..."
npm ci

echo "Building application..."
node build.mjs

echo "Build complete."
