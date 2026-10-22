#!/usr/bin/env bash
# Real Linux ownership/permissions regression. Run as an ordinary operator with
# existing passwordless sudo (CI runner or a disposable container), never on VM.
set -euo pipefail
if [[ "$(uname -s)" != Linux ]]; then echo 'SKIP real Linux pin permissions (covered on Linux CI)'; exit 0; fi
[[ "$EUID" != 0 ]] || { echo 'Run as a non-root test operator'; exit 1; }
sudo -n true
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d /tmp/wr-real-public-pin-XXXXXX)"
cleanup() { local rc=$?; if [[ "$rc" != 0 ]]; then tail -15 "$TMP/log" >&2 || true; fi; command sudo -n rm -rf -- "$TMP"; }
trap cleanup EXIT
source "$ROOT/ops/lib/woodright-compose-env-authority.sh"
for fn in create_sealed_pin_stage write_required_pins_atomic prod_atomic_install restore_pins prod_cleanup_pin_stages; do
 sed -n "/^${fn}() {/,/^}/p" "$ROOT/ops/release/cutover-public-production-pair.sh" >> "$TMP/functions.sh"
done
source "$TMP/functions.sh"
log() { printf '%s\n' "$*" >&2; }
need_be() { return 0; };need_sf() { return 0; };should_write_common_release_sha() { return 0; }
record_state() { printf '%s\n' "$1" >> "$TMP/states"; }
wr_fault() { return 1; }
pin_value_of() { wr_compose_env_query_governed_value "$COMPOSE_ENV_FILE" "$1"; }
# Intercept ONLY a specified failure; otherwise use real sudo, real root-owned
# files and real permissions. Never chmod/open protected fixtures for the caller.
sudo() {
 if [[ "${INJECT:-}" == stage && "${2:-}" == python3 && "${4:-}" == "$COMPOSE_ENV_FILE" && "${5:-}" == "$(dirname "$COMPOSE_ENV_FILE")" ]]; then return 42; fi
 if [[ "${INJECT:-}" == render && "${2:-}" == python3 && "${4:-}" == "$COMPOSE_ENV_FILE" && "${5:-}" == */.wr-prod-pin-* ]]; then return 42; fi
 if [[ "${INJECT:-}" == copy && "${2:-}" == cp ]]; then command sudo "$@";return 42; fi
 if [[ "${INJECT:-}" == chmod && "${2:-}" == chmod ]]; then return 42; fi
 if [[ "${INJECT:-}" == move && "${2:-}" == mv ]]; then return 42; fi
 command sudo "$@"
 if [[ "${SIGNAL_AFTER_RENDER:-0}" == 1 && "${2:-}" == python3 && "${4:-}" == "$COMPOSE_ENV_FILE" && "${5:-}" == */.wr-prod-pin-* ]]; then kill -TERM "$BASHPID"; fi
}
mv() { [[ "${INJECT:-}" != move ]] || return 42; command mv "$@"; }
cat > "$TMP/original" <<'ENV'
WOODRIGHT_BACKEND_IMAGE=old-backend
WOODRIGHT_STOREFRONT_IMAGE=old-storefront
WOODRIGHT_RELEASE_SHA=old-source
UNRELATED_KEY=keep-me
SECRET=NEVER_PRINT_REAL_PIN_SECRET
ENV
sed -e 's/old-backend/new-backend/' -e 's/old-storefront/new-storefront/' -e 's/old-source/new-source/' "$TMP/original" > "$TMP/expected"
BE_REF=new-backend;SF_REF=new-storefront;SOURCE_SHA=new-source
assert_restored() {
 command sudo -n cmp "$COMPOSE_ENV_FILE" "$TMP/original"
 [[ "$(stat -c '%u:%g:%a' "$COMPOSE_ENV_FILE")" == 0:0:600 ]]
 [[ ! -r "$COMPOSE_ENV_FILE" ]]
 [[ -z "$(find "$(dirname "$COMPOSE_ENV_FILE")" -name '.wr-prod-pin-*' -o -name '.wr-compose-env-publish-*' -o -name '.env.wr-prod-new-*')" ]]
}
for layout in writable protected; do
 export WOODRIGHT_DOKPLOY_COMPOSE_DIR="$TMP/$layout/woodright-public-production"
 COMPOSE_ENV_FILE="$WOODRIGHT_DOKPLOY_COMPOSE_DIR/code/.env"
 mkdir -p "$(dirname "$COMPOSE_ENV_FILE")" "$TMP/$layout/evidence/pin-backup" "$TMP/$layout/evidence/json"
 EVIDENCE_DIR="$TMP/$layout/evidence"
 command sudo -n install -m 600 -o root -g root "$TMP/original" "$COMPOSE_ENV_FILE"
 command sudo -n install -m 600 -o root -g root "$TMP/original" "$EVIDENCE_DIR/pin-backup/dokploy-compose.env"
 if [[ "$layout" == protected ]]; then command sudo -n chown root:root "$(dirname "$COMPOSE_ENV_FILE")"; fi
 assert_restored
 PINS_WRITTEN='';PROD_PIN_STAGE='';WR_COMPOSE_ENV_PUBLISHED_PATH=''
 write_required_pins_atomic >> "$TMP/log" 2>&1
 [[ "$(stat -c '%u:%g:%a' "$COMPOSE_ENV_FILE")" == 0:0:600 && ! -r "$COMPOSE_ENV_FILE" ]]
 command sudo -n cmp "$COMPOSE_ENV_FILE" "$TMP/expected"
 restore_pins >> "$TMP/log" 2>&1
 assert_restored
 echo "PASS real $layout directory: root:root 0600 preserved and exact rollback"
 for INJECT in stage render copy chmod move; do
  PINS_WRITTEN='';PROD_PIN_STAGE='';WR_COMPOSE_ENV_PUBLISHED_PATH=''
  if write_required_pins_atomic >> "$TMP/log" 2>&1; then echo "FAIL $layout $INJECT accepted";exit 1; fi
  prod_cleanup_pin_stages >> "$TMP/log" 2>&1
  assert_restored
  echo "PASS real $layout $INJECT failure: unchanged pin and no secret-bearing siblings"
 done
 unset INJECT
 PINS_WRITTEN='';PROD_PIN_STAGE='';WR_COMPOSE_ENV_PUBLISHED_PATH=''
 set +e
 ( trap 'prod_cleanup_pin_stages; exit 143' TERM; SIGNAL_AFTER_RENDER=1;write_required_pins_atomic ) >> "$TMP/log" 2>&1
 rc=$?
 set -e
 [[ "$rc" == 143 ]]
 assert_restored
 echo "PASS real $layout signal after render: live pin unchanged and sealed stage removed"
done
if grep -q 'NEVER_PRINT_REAL_PIN_SECRET' "$TMP/log"; then echo 'FAIL pin contents leaked';exit 1;fi
echo 'PASS real ownership, permission matrix, failure cleanup and signal cleanup'
