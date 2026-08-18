#!/usr/bin/env bash
# Static web export for hosting (Netlify, Vercel, any static host).
#
# Expo puts bundled font assets under assets/node_modules/… — Netlify's
# uploader silently skips any directory named node_modules, which 404s every
# font and leaves the app blank. We rename the directory to assets/vendor and
# patch the references inside the exported JS bundles.
set -euo pipefail
cd "$(dirname "$0")/.."

npx expo export --platform web

if [ -d dist/assets/node_modules ]; then
  mv dist/assets/node_modules dist/assets/vendor
  find dist/_expo/static/js -name '*.js' -exec \
    sed -i '' 's|assets/node_modules/|assets/vendor/|g' {} +
fi

echo
echo "✓ dist/ is ready to deploy (drag the dist folder to Netlify Drop)"
