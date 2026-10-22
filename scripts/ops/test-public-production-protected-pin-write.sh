#!/usr/bin/env bash
# Exercise the actual production helper pin transaction with denied direct IO.
# Fake sudo opens ONLY this disposable fixture, then restores denied IO. No VM,
# real Docker, credentials or production file is used.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/ops/release/cutover-public-production-pair.sh"
TMP="$(cd "$(mktemp -d /tmp/wr-public-pin-write-XXXXXX)" && pwd -P)"
cleanup() { local rc=$?; if [[ "$rc" != 0 && -f "$TMP/err" ]]; then tail -15 "$TMP/err" >&2; fi; chmod -R u+rwX "$TMP" 2>/dev/null || true; rm -rf "$TMP"; }
trap cleanup EXIT
export FIXTURE="$TMP/woodright-public-production/code"
export COMPOSE_ENV_FILE="$FIXTURE/.env"
mkdir -p "$FIXTURE" "$TMP/bin" "$TMP/evidence/pin-backup" "$TMP/evidence/json"
cat > "$COMPOSE_ENV_FILE" <<'ENV'
WOODRIGHT_BACKEND_IMAGE=old-backend
WOODRIGHT_STOREFRONT_IMAGE=old-storefront
WOODRIGHT_RELEASE_SHA=old-source
UNRELATED_KEY=keep-me
SECRET=NEVER_PRINT_PIN_SECRET
ENV
cp "$COMPOSE_ENV_FILE" "$TMP/original"
cp "$COMPOSE_ENV_FILE" "$TMP/evidence/pin-backup/dokploy-compose.env"
cat > "$TMP/bin/sudo" <<'SUDO'
#!/usr/bin/env bash
set -euo pipefail
[[ "${1:-}" == -n ]] || exit 98
shift
case "${1:-}" in python3|cp|mv|rm|chmod|chown|sha256sum) ;; *) exit 97 ;; esac
printf '%s\n' "$1" >> "$SUDO_CALLS"
[[ "${FAIL_PRIVILEGED_PYTHON:-0}" != 1 || "$1" != python3 ]] || exit 42
# Model a root-owned pin and directory without requiring root on the test host.
chmod u+w "$FIXTURE"
for p in "$COMPOSE_ENV_FILE" "$FIXTURE"/.wr-prod-pin-* "$FIXTURE"/.wr-compose-env-publish-* "$FIXTURE"/.env.wr-prod-new-*; do
 [[ ! -f "$p" ]] || chmod u+rw "$p"
done
set +e
"$@"
rc=$?
set -e
for p in "$COMPOSE_ENV_FILE" "$FIXTURE"/.wr-prod-pin-* "$FIXTURE"/.wr-compose-env-publish-* "$FIXTURE"/.env.wr-prod-new-*; do
 [[ ! -f "$p" ]] || chmod 000 "$p"
done
chmod 555 "$FIXTURE"
exit "$rc"
SUDO
chmod +x "$TMP/bin/sudo"
export PATH="$TMP/bin:$PATH" SUDO_CALLS="$TMP/sudo-calls"
source "$ROOT/ops/lib/woodright-compose-env-authority.sh"
# Load only the real helper functions; never execute its cutover entry point.
for fn in create_sealed_pin_stage write_required_pins_atomic prod_atomic_install restore_pins; do
 sed -n "/^${fn}() {/,/^}/p" "$SCRIPT" >> "$TMP/functions.sh"
done
source "$TMP/functions.sh"
log() { printf '%s\n' "$*" >&2; }
need_be() { [[ "${COMPONENT:-pair}" == pair ]]; }
need_sf() { return 0; }
should_write_common_release_sha() { [[ "${COMPONENT:-pair}" == pair ]]; }
record_state() { printf '%s\n' "$1" >> "$TMP/states"; }
wr_fault() { [[ "${FAULT:-}" == "$1" ]]; }
pin_value_of() { wr_compose_env_query_governed_value "$COMPOSE_ENV_FILE" "$1"; }
export WOODRIGHT_DOKPLOY_COMPOSE_DIR="$TMP/woodright-public-production"
EVIDENCE_DIR="$TMP/evidence";BE_REF=new-backend;SF_REF=new-storefront;SOURCE_SHA=new-source;PINS_WRITTEN=""
chmod 000 "$COMPOSE_ENV_FILE"
chmod 555 "$FIXTURE"
[[ ! -r "$COMPOSE_ENV_FILE" && ! -w "$FIXTURE" ]] || { echo 'Test requires denied direct IO (run as a normal user)'; exit 1; }
write_required_pins_atomic >"$TMP/out" 2>"$TMP/err"
[[ ! -r "$COMPOSE_ENV_FILE" && ! -w "$FIXTURE" ]]
[[ "$(pin_value_of WOODRIGHT_BACKEND_IMAGE)" == new-backend ]]
[[ "$(pin_value_of WOODRIGHT_STOREFRONT_IMAGE)" == new-storefront ]]
[[ "$(pin_value_of WOODRIGHT_RELEASE_SHA)" == new-source ]]
[[ "$(cat "$TMP/states")" == pins_written ]]
chmod u+rw "$COMPOSE_ENV_FILE"
grep -qx 'SECRET=NEVER_PRINT_PIN_SECRET' "$COMPOSE_ENV_FILE"
grep -qx 'UNRELATED_KEY=keep-me' "$COMPOSE_ENV_FILE"
chmod 000 "$COMPOSE_ENV_FILE"
restore_pins >>"$TMP/out" 2>>"$TMP/err"
chmod u+r "$COMPOSE_ENV_FILE"
cmp "$COMPOSE_ENV_FILE" "$TMP/original"
chmod 000 "$COMPOSE_ENV_FILE"
[[ ! -r "$COMPOSE_ENV_FILE" && ! -w "$FIXTURE" ]]
[[ -z "$(find "$FIXTURE" -name '.wr-prod-pin-*' -o -name '.wr-compose-env-publish-*' -o -name '.env.wr-prod-new-*')" ]]
echo 'PASS protected pair: stage, validate, atomic install, exact rollback, denied direct IO and no staging leftovers'
# A privileged reader failure must not write the live pin or arm mutation.
rm "$TMP/states"
export FAIL_PRIVILEGED_PYTHON=1
if write_required_pins_atomic >>"$TMP/out" 2>>"$TMP/err"; then echo 'FAIL privileged failure accepted'; exit 1; fi
unset FAIL_PRIVILEGED_PYTHON
[[ ! -e "$TMP/states" ]]
chmod u+r "$COMPOSE_ENV_FILE";cmp "$COMPOSE_ENV_FILE" "$TMP/original";chmod 000 "$COMPOSE_ENV_FILE"
echo 'PASS privileged reader failure: unchanged pins, no mutation state'
# An injected stop immediately before publish must clean the sealed temp.
FAULT=first_pin
if write_required_pins_atomic >>"$TMP/out" 2>>"$TMP/err"; then echo 'FAIL injected fault accepted'; exit 1; fi
unset FAULT
[[ ! -e "$TMP/states" ]]
[[ -z "$(find "$FIXTURE" -name '.wr-prod-pin-*')" ]]
chmod u+r "$COMPOSE_ENV_FILE";cmp "$COMPOSE_ENV_FILE" "$TMP/original";chmod 000 "$COMPOSE_ENV_FILE"
echo 'PASS pre-publish fault: unchanged pins and sealed temp removed'
if grep -q 'NEVER_PRINT_PIN_SECRET' "$TMP/out" "$TMP/err" "$SUDO_CALLS"; then echo 'FAIL secret leaked'; exit 1; fi
echo 'PASS no pin contents in logs or privileged command arguments'
