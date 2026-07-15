#!/usr/bin/env bash
# Foreground-only material-execution pricing verification loop runner.
#
# Does NOT start yarn/medusa servers. Probes :9000 / :3002; fails if down.
# Saves artifacts under docs/reports/material-execution-pricing/runs/<UTC>/.
#
# Usage (canonical repo root):
#   bash scripts/material-execution-pricing-loop.sh
#   bash scripts/material-execution-pricing-loop.sh --skip-e2e
#   bash scripts/material-execution-pricing-loop.sh --unit-only
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$ROOT/apps/backend"
STOREFRONT="$ROOT/apps/storefront"
REPORT_ROOT="$ROOT/docs/reports/material-execution-pricing"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
RUN_DIR="$REPORT_ROOT/runs/$TS"
SKIP_E2E=0
UNIT_ONLY=0

for arg in "$@"; do
  case "$arg" in
    --skip-e2e) SKIP_E2E=1 ;;
    --unit-only) UNIT_ONLY=1; SKIP_E2E=1 ;;
    -h|--help)
      sed -n '1,20p' "$0"
      exit 0
      ;;
  esac
done

mkdir -p "$RUN_DIR/e2e"
cd "$ROOT"

sha="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
branch="$(git branch --show-current 2>/dev/null || echo unknown)"

{
  echo "# Baseline"
  echo
  echo "- UTC: $TS"
  echo "- SHA: \`$sha\`"
  echo "- Branch: \`$branch\`"
  echo "- Repo: \`$ROOT\`"
  echo "- Backend probe: http://127.0.0.1:9000/health"
  echo "- Storefront probe: http://127.0.0.1:3002/"
} > "$RUN_DIR/baseline.md"

probe() {
  local url="$1"
  curl -sS --max-time 5 -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000"
}

backend_code="$(probe http://127.0.0.1:9000/health)"
store_code="$(probe http://127.0.0.1:3002/)"
{
  echo
  echo "## Probes"
  echo "- backend health: \`$backend_code\`"
  echo "- storefront: \`$store_code\`"
} >> "$RUN_DIR/baseline.md"

if [[ "$backend_code" != "200" ]]; then
  echo "BLOCKED: backend :9000 not healthy (got $backend_code). Start LaunchAgent / medusa qa first." | tee "$RUN_DIR/blocked.md"
  exit 2
fi

# Live dist must contain the pure resolver (exhaustion criterion).
DIST_ROUTE="$BACKEND/dist/src/api/store/carts/[id]/line-items/route.js"
DIST_HELPER="$BACKEND/dist/src/lib/configured-line-item-pricing.js"
if [[ ! -f "$DIST_HELPER" ]]; then
  echo "BLOCKED: missing $DIST_HELPER — rebuild backend dist (yarn build in apps/backend)." | tee "$RUN_DIR/blocked.md"
  exit 2
fi
if ! rg -q "resolveConfiguredLineItemPricing" "$DIST_ROUTE" 2>/dev/null; then
  echo "BLOCKED: live dist route does not reference resolveConfiguredLineItemPricing — rebuild/restart backend." | tee "$RUN_DIR/blocked.md"
  exit 2
fi
{
  echo
  echo "## Dist fingerprint"
  echo "- helper present: \`$DIST_HELPER\`"
  echo "- route references \`resolveConfiguredLineItemPricing\`: yes"
} >> "$RUN_DIR/baseline.md"

{
  echo "# Test results"
  echo
  echo "## Unit: configured-line-item-pricing"
  echo '```'
} > "$RUN_DIR/test-results.md"

set +e
(
  cd "$BACKEND"
  yarn node --import tsx --test src/lib/configured-line-item-pricing.test.ts
) >> "$RUN_DIR/test-results.md" 2>&1
unit_rc=$?
set -e

{
  echo '```'
  echo
  echo "- unit exit: \`$unit_rc\`"
} >> "$RUN_DIR/test-results.md"

e2e_rc=0
if [[ "$UNIT_ONLY" -eq 0 && "$SKIP_E2E" -eq 0 ]]; then
  if [[ "$store_code" == "000" || "$store_code" == "000fail" ]]; then
    echo "BLOCKED: storefront :3002 not up; cannot run browser E2E." | tee -a "$RUN_DIR/blocked.md"
    e2e_rc=2
  else
    {
      echo
      echo "## E2E: material-execution-pricing"
      echo '```'
    } >> "$RUN_DIR/test-results.md"
    set +e
    ARTIFACT_DIR="$RUN_DIR/e2e" \
      STORE_URL=http://127.0.0.1:3002 \
      BACKEND_URL=http://127.0.0.1:9000 \
      node "$STOREFRONT/scripts/e2e-material-execution-pricing.cjs" \
      >> "$RUN_DIR/test-results.md" 2>&1
    e2e_rc=$?
    set -e
    {
      echo '```'
      echo
      echo "- e2e exit: \`$e2e_rc\`"
    } >> "$RUN_DIR/test-results.md"
  fi
else
  echo >> "$RUN_DIR/test-results.md"
  echo "## E2E skipped (\`--skip-e2e\` / \`--unit-only\`)" >> "$RUN_DIR/test-results.md"
fi

# Placeholder files for Codex / fix loop
[[ -f "$RUN_DIR/codex-review.md" ]] || printf '# Codex review\n\n_pending_\n' > "$RUN_DIR/codex-review.md"
[[ -f "$RUN_DIR/fix-log.md" ]] || printf '# Fix log\n\n_none yet_\n' > "$RUN_DIR/fix-log.md"

# latest.md pointer
{
  echo "# Material execution pricing — latest run"
  echo
  echo "- Run dir: \`docs/reports/material-execution-pricing/runs/$TS/\`"
  echo "- SHA: \`$sha\`"
  echo "- Unit exit: \`$unit_rc\`"
  echo "- E2E exit: \`$e2e_rc\`"
  echo "- Backend health: \`$backend_code\`"
  echo "- Storefront: \`$store_code\`"
  echo
  echo "Open: [baseline](runs/$TS/baseline.md) · [tests](runs/$TS/test-results.md) · [codex](runs/$TS/codex-review.md) · [fixes](runs/$TS/fix-log.md)"
} > "$REPORT_ROOT/latest.md"

echo "RUN_DIR=$RUN_DIR"
echo "unit_rc=$unit_rc e2e_rc=$e2e_rc"

if [[ "$unit_rc" -ne 0 ]]; then
  exit "$unit_rc"
fi
if [[ "$e2e_rc" -ne 0 && "$e2e_rc" -ne 2 ]]; then
  exit "$e2e_rc"
fi
if [[ "$e2e_rc" -eq 2 ]]; then
  exit 2
fi
exit 0
