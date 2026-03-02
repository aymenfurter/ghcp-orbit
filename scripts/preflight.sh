#!/usr/bin/env bash
# Checks that the project is ready for packaging.
set -euo pipefail
cd "$(dirname "$0")/.."

errors=0
warnings=0

error() { echo "  ERROR: $1"; ((errors++)) || true; }
warn()  { echo "  WARN:  $1"; ((warnings++)) || true; }

echo "Preflight checks for Orbit"
echo ""

echo "Assets:"
[[ -f assets/icon.svg ]]  || error "assets/icon.svg is missing"
[[ -f assets/icon.png ]]  || error "assets/icon.png is missing — run: npm run icons"
[[ -f assets/icon.icns ]] || warn  "assets/icon.icns is missing — run: npm run icons"

echo "Package config:"
name=$(node -p "require('./package.json').name")
product=$(node -p "require('./package.json').build.productName")
appId=$(node -p "require('./package.json').build.appId")
version=$(node -p "require('./package.json').version")
[[ "$name" == "orbit" ]]    || error "package.json name should be 'orbit', got '$name'"
[[ "$product" == "Orbit" ]] || error "build.productName should be 'Orbit', got '$product'"
[[ -n "$appId" ]]           || error "build.appId is missing"
[[ -n "$version" ]]         || error "version is missing"

echo "Dependencies:"
[[ -d node_modules ]]                  || error "node_modules/ not found — run: npm install"
[[ -d node_modules/electron ]]         || error "electron not installed"
[[ -d node_modules/electron-builder ]] || error "electron-builder not installed"

echo "Build output:"
[[ -f dist/main/index.js ]] || warn "dist/main/index.js not found — run: npm run build"

echo ""
echo "Results: $errors error(s), $warnings warning(s)"
[[ $errors -eq 0 ]]
