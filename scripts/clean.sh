#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Cleaning build artifacts..."
rm -rf dist release assets/icon.iconset assets/.tmp

echo "Clean complete."
