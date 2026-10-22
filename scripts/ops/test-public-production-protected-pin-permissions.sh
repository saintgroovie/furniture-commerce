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
for fn in create_sealed_pin_stage write_required_pins_atomic prod_atomic_install restore_pins prod_cleanup_pin_stages prod_on_exit prod_on_signal verify_rollback_release_sha run_rollback; do
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
 if [[ "${INJECT:-}" == backupread && "${2:-}" == python3 && "${4:-}" == "$EVIDENCE_DIR/pin-backup/dokploy-compose.env" ]];then return 42;fi
 if [[ "${INJECT:-}" == cleanup && "${2:-}" == rm && "${*: -1}" == */.wr-prod-pin-* ]]; then return 42; fi
 if [[ "${INJECT:-}" == rollback_copy && "${2:-}" == cp && "${*: -1}" == */.env.wr-prod-new-* ]]; then command sudo "$@";return 42;fi
 if [[ "${INJECT:-}" == stage && "${2:-}" == python3 && "${4:-}" == "$COMPOSE_ENV_FILE" && "${5:-}" == "$(dirname "$COMPOSE_ENV_FILE")" ]]; then return 42; fi
 if [[ "${INJECT:-}" == render && "${2:-}" == python3 && "${4:-}" == "$COMPOSE_ENV_FILE" && "${5:-}" == */.wr-prod-pin-* ]]; then return 42; fi
 if [[ "${INJECT:-}" == copy && "${2:-}" == cp ]]; then command sudo "$@";return 42; fi
 if [[ "${INJECT:-}" == chmod && "${2:-}" == chmod ]]; then return 42; fi
 if [[ "${INJECT:-}" == move && "${2:-}" == mv ]]; then return 42; fi
 command sudo "$@"
 if [[ "${SIGNAL_AFTER_RENDER:-0}" == 1 && "${2:-}" == python3 && "${4:-}" == "$COMPOSE_ENV_FILE" && "${5:-}" == */.wr-prod-pin-* ]]; then kill -TERM "$BASHPID"; fi
}
rm() { [[ "${INJECT:-}" != cleanup || "${*: -1}" != */.wr-prod-pin-* ]] || return 42; command rm "$@"; }
rollback_armed() { return 1; };release_lock() { :; }
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
 verify_rollback_release_sha >> "$TMP/log" 2>&1
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
 ( COMMITTED=0;ROLLBACK_DONE=0;PHASE=prepared;trap prod_on_exit EXIT;trap 'prod_on_signal TERM 143' TERM;SIGNAL_AFTER_RENDER=1;write_required_pins_atomic ) >> "$TMP/log" 2>&1
 rc=$?
 set -e
 [[ "$rc" == 143 ]]
 assert_restored
 echo "PASS real $layout signal after render: actual exit hook cleans the sealed stage"
 # A failed stage removal must remain tracked and be reported, then recover.
 PINS_WRITTEN='';PROD_PIN_STAGE='';WR_COMPOSE_ENV_PUBLISHED_PATH='';PROD_ATOMIC_PUBLISH_STAGE=''
 INJECT=cleanup
 if write_required_pins_atomic >> "$TMP/log" 2>&1; then echo 'FAIL cleanup failure hidden';exit 1;fi
 [[ -n "$PROD_PIN_STAGE" && -f "$PROD_PIN_STAGE" ]]
 if prod_cleanup_pin_stages >> "$TMP/log" 2>&1; then echo 'FAIL exit cleanup failure hidden';exit 1;fi
 unset INJECT
 prod_cleanup_pin_stages >> "$TMP/log" 2>&1
 restore_pins >> "$TMP/log" 2>&1
 assert_restored
 echo "PASS real $layout cleanup failure: retained tracking and explicit failure, then recovered"
 # A partial backup copy on rollback must never leave an untracked sibling.
 PINS_WRITTEN='';PROD_PIN_STAGE='';WR_COMPOSE_ENV_PUBLISHED_PATH='';PROD_ATOMIC_PUBLISH_STAGE=''
 write_required_pins_atomic >> "$TMP/log" 2>&1
 INJECT=rollback_copy
 if restore_pins >> "$TMP/log" 2>&1;then echo 'FAIL partial rollback copy accepted';exit 1;fi
 prod_cleanup_pin_stages >> "$TMP/log" 2>&1
 [[ -z "$(find "$(dirname "$COMPOSE_ENV_FILE")" -name '.env.wr-prod-new-*')" ]]
 unset INJECT
 restore_pins >> "$TMP/log" 2>&1
 assert_restored
 echo "PASS real $layout partial rollback copy: tracked sibling cleaned, exact restore recovered"
 # Exercise actual rollback control flow with real protected-file IO. Runtime
 # gates are stubs here; real Docker lifecycle is covered by the full fidelity.
 component_in_scope() { return 1; }
 verify_runtime_matches_pins() { return 0; };verify_rollback_exposure() { return 0; };verify_rollback_http() { return 0; }
 COMPONENT=pair;COMPONENTS_RECREATED='';METADATA_WRITTEN=0;WR_OA_RESERVATION_STATE=legacy
 PRE_BE_REF=old-backend;PRE_SF_REF=old-storefront;PRE_RELEASE_SHA=old-source;PHASE=pins_written
 for INJECT in none backupread; do
  PINS_WRITTEN='';PROD_PIN_STAGE='';WR_COMPOSE_ENV_PUBLISHED_PATH='';PROD_ATOMIC_PUBLISH_STAGE=''
  write_required_pins_atomic >> "$TMP/log" 2>&1
  ROLLBACK_DONE=0;ROLLBACK_RC=0
  if run_rollback >> "$TMP/log" 2>&1;then rc=0;else rc=$?;fi
  if [[ "$INJECT" == none ]];then [[ "$rc" == 10 && "$(tail -1 "$TMP/states")" == rolled_back ]];else [[ "$rc" == 13 && "$(tail -1 "$TMP/states")" == rollback_incomplete ]];fi
  unset INJECT
  assert_restored
 done
 unset COMPONENT
 echo "PASS real $layout rollback control: protected marker verified; denied backup read is incomplete"
done
if grep -q 'NEVER_PRINT_REAL_PIN_SECRET' "$TMP/log"; then echo 'FAIL pin contents leaked';exit 1;fi
echo 'PASS real ownership, permission matrix, failure cleanup and signal cleanup'
