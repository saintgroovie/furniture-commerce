#!/usr/bin/env bash
# Prepare a NEW immutable public_demo target env bundle.
# Rewrites only governed release-identity keys. Never prints secret values.
# Does NOT recreate containers, change Traefik, or run pair execute.
#
# Usage:
#   bash ops/release/prepare-public-demo-target-env.sh \
#     --environment public_demo \
#     --mode dry-run|execute \
#     --target-sha <40hex> \
#     --source-backend-env <mode 600> \
#     --source-storefront-env <mode 600> \
#     --output-dir <new evidence dir> \
#     [--confirm-mutation I_UNDERSTAND_PUBLIC_DEMO_TARGET_ENV]
set -euo pipefail
IFS=$'\n\t'

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/woodright-environment-profile.sh
source "$HERE/../lib/woodright-environment-profile.sh"
# shellcheck source=../lib/woodright-cutover-common.sh
source "$HERE/../lib/woodright-cutover-common.sh"

MODE="dry-run"
TARGET_SHA=""
SRC_BE=""
SRC_SF=""
OUT_DIR=""
CONFIRM=""
PY="$HERE/../lib/woodright-public-demo-target-env.py"
REJECTED_MARKER_NAME="REJECTED_TARGET_ENV_IDENTITY_MISMATCH"

usage() {
  cat <<'EOF'
Usage: prepare-public-demo-target-env.sh --environment public_demo --mode <mode> [options]

Modes: dry-run | execute

Required:
  --target-sha <40hex>
  --source-backend-env <path mode 600>
  --source-storefront-env <path mode 600>
  --output-dir <new directory; must not already contain env files>

Execute additionally:
  --confirm-mutation I_UNDERSTAND_PUBLIC_DEMO_TARGET_ENV

Does not overwrite the source bundle. Identity rewrite only.
EOF
}

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $*"; exit 2; }

FULL_ARGV=("$@")
wr_require_environment_from_args "${FULL_ARGV[@]}" || exit 1

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --help|-h) usage; exit 0 ;;
      --environment) shift 2 ;;
      --environment=*) shift ;;
      --mode) MODE="${2:?}"; shift 2 ;;
      --mode=*) MODE="${1#--mode=}"; shift ;;
      --target-sha) TARGET_SHA="${2:?}"; shift 2 ;;
      --target-sha=*) TARGET_SHA="${1#--target-sha=}"; shift ;;
      --source-backend-env) SRC_BE="${2:?}"; shift 2 ;;
      --source-storefront-env) SRC_SF="${2:?}"; shift 2 ;;
      --output-dir) OUT_DIR="${2:?}"; shift 2 ;;
      --confirm-mutation) CONFIRM="${2:?}"; shift 2 ;;
      --confirm-mutation=*) CONFIRM="${1#--confirm-mutation=}"; shift ;;
      *) shift ;;
    esac
  done
}

parse_args "${FULL_ARGV[@]}"
[[ "${WOODRIGHT_ENVIRONMENT}" == "public_demo" ]] || die "only --environment public_demo"
case "$MODE" in dry-run|execute) ;; *) die "invalid mode=$MODE" ;; esac
[[ -n "$TARGET_SHA" && -n "$SRC_BE" && -n "$SRC_SF" && -n "$OUT_DIR" ]] || die "missing required args"
wr_cutover_require_full_sha "$TARGET_SHA" || exit 2
[[ -f "$SRC_BE" && -f "$SRC_SF" ]] || die "source env files missing"
[[ ! -L "$SRC_BE" && ! -L "$SRC_SF" ]] || die "refusing symlink source env"
case "$OUT_DIR" in
  *caf82b0-20260825T1218Z*) die "refusing to write into rejected 20260825T1218Z bundle" ;;
esac

src_mode_be="$(stat -c '%a' "$SRC_BE" 2>/dev/null || stat -f '%Lp' "$SRC_BE")"
src_mode_sf="$(stat -c '%a' "$SRC_SF" 2>/dev/null || stat -f '%Lp' "$SRC_SF")"
[[ "$src_mode_be" == "600" || "$src_mode_be" == "0600" ]] || die "source backend env mode must be 600"
[[ "$src_mode_sf" == "600" || "$src_mode_sf" == "0600" ]] || die "source storefront env mode must be 600"

BE_HASH="$(python3 -c 'import hashlib,sys; print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())' "$SRC_BE")"
SF_HASH="$(python3 -c 'import hashlib,sys; print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())' "$SRC_SF")"
DEST_BE="$OUT_DIR/env/backend.env"
DEST_SF="$OUT_DIR/env/storefront.env"

log "PLANNED target_sha=$TARGET_SHA"
log "PLANNED source_backend=$SRC_BE sha256=$BE_HASH mode=$src_mode_be"
log "PLANNED source_storefront=$SRC_SF sha256=$SF_HASH mode=$src_mode_sf"
log "PLANNED dest_backend=$DEST_BE"
log "PLANNED dest_storefront=$DEST_SF"
log "PLANNED identity_rewrite=WOODRIGHT_RELEASE_SHA[+SOURCE_SHA if present]"

if [[ "$MODE" == "dry-run" ]]; then
  python3 "$PY" keys --env-file "$SRC_BE" >/dev/null
  python3 "$PY" keys --env-file "$SRC_SF" >/dev/null
  log "DRY_RUN_OK no write"
  exit 0
fi

[[ "$CONFIRM" == "I_UNDERSTAND_PUBLIC_DEMO_TARGET_ENV" ]] \
  || die "execute requires --confirm-mutation I_UNDERSTAND_PUBLIC_DEMO_TARGET_ENV"

[[ -e "$DEST_BE" || -e "$DEST_SF" ]] && die "dest env already exists (immutable; use a new output-dir)"
mkdir -p "$OUT_DIR/env" "$OUT_DIR/json"
chmod 700 "$OUT_DIR" "$OUT_DIR/env" "$OUT_DIR/json" 2>/dev/null || true

python3 "$PY" rewrite --source "$SRC_BE" --dest "$DEST_BE" --target-sha "$TARGET_SHA" --source-sha256 "$BE_HASH"
python3 "$PY" rewrite --source "$SRC_SF" --dest "$DEST_SF" --target-sha "$TARGET_SHA" --source-sha256 "$SF_HASH"
chmod 600 "$DEST_BE" "$DEST_SF"

python3 "$PY" validate-pair --backend-env "$DEST_BE" --storefront-env "$DEST_SF" --target-sha "$TARGET_SHA" \
  >"$OUT_DIR/json/target-env-identity.json"
python3 "$PY" compare --old "$SRC_BE" --new "$DEST_BE" --target-sha "$TARGET_SHA" \
  >"$OUT_DIR/json/compare-backend.json"
python3 "$PY" compare --old "$SRC_SF" --new "$DEST_SF" --target-sha "$TARGET_SHA" \
  >"$OUT_DIR/json/compare-storefront.json"

{
  echo "target_sha=$TARGET_SHA"
  echo "backend_sha256=$(python3 -c 'import hashlib,sys; print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())' "$DEST_BE")"
  echo "storefront_sha256=$(python3 -c 'import hashlib,sys; print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())' "$DEST_SF")"
  echo "source_backend_sha256=$BE_HASH"
  echo "source_storefront_sha256=$SF_HASH"
  echo "secret_values_printed=NO"
} >"$OUT_DIR/json/env-hashes.txt"
chmod 600 "$OUT_DIR/json"/* 2>/dev/null || true

# Sidecar rejection marker for the known-bad historical bundle (does not mutate env files).
OLD_BUNDLE_DIR="$(dirname "$(dirname "$SRC_BE")")"
if [[ "$(basename "$OLD_BUNDLE_DIR")" == "caf82b0-20260825T1218Z" ]]; then
  marker="$OLD_BUNDLE_DIR/$REJECTED_MARKER_NAME"
  if [[ ! -e "$marker" ]]; then
    printf '%s\n' "REJECTED_TARGET_ENV_IDENTITY_MISMATCH" >"$marker" || true
    log "rejection_marker_attempted path=$marker"
  fi
fi

if [[ "$TARGET_SHA" == "caf82b048b9caefae30679342aec3d4fc42a8d89" ]]; then
  log "TARGET_ENV_IDENTITY_VERIFIED_CAF82B0 dest=$OUT_DIR"
else
  log "TARGET_ENV_IDENTITY_VERIFIED dest=$OUT_DIR sha=$TARGET_SHA"
fi
exit 0
