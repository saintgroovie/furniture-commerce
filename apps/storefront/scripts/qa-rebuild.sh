#!/usr/bin/env bash
# Atomic QA rebuild: build → wait for BUILD_ID watcher / kickstart → CSS verify.
# Prefer this over bare `yarn build` when the LaunchAgent runs mode=qa on :3002.
set -euo pipefail

export PATH="/usr/local/opt/node@22/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin${PATH:+:$PATH}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE_URL="${WOODRIGHT_STOREFRONT_URL:-http://localhost:3002}"
LABEL="${WOODRIGHT_STOREFRONT_LABEL:-com.woodright.storefront-qa}"
cd "$ROOT"

echo "qa-rebuild: yarn build (NEXT_DIST_DIR=.next-build)"
yarn build
echo "qa-rebuild: sync QA build marker (macOS LaunchAgent helper)"
yarn sync:qa-build-marker || true

BUILD_ID="$(tr -d '[:space:]' <"$ROOT/.next-build/BUILD_ID" 2>/dev/null || true)"
echo "qa-rebuild: BUILD_ID=$BUILD_ID"

# Kickstart is a bounded backup if the LaunchAgent was down or the watcher
# missed the marker.
if launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1; then
  echo "qa-rebuild: kickstart $LABEL (backup if watcher already reloading)"
  launchctl kickstart -k "gui/$(id -u)/$LABEL" || true
fi

ok=0
for i in 1 2 3 4 5 6 7 8 9 10; do
  sleep 3
  if node "$ROOT/scripts/check-landing-css-assets.mjs" "$BASE_URL"; then
    ok=1
    break
  fi
  echo "qa-rebuild: CSS not ready yet (try $i) - waiting"
done

if [[ "$ok" -ne 1 ]]; then
  echo "qa-rebuild: FAILED - CSS assets still broken on $BASE_URL" >&2
  exit 1
fi

echo "qa-rebuild: OK"
