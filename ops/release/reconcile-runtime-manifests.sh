#!/usr/bin/env bash
# Owner-controlled ACTIVE_OWNER / EXPECTED_RELEASE reconcile.
# ALWAYS runs media promotion gate first. Never auto-fills digests from a broken live container.
#
# Usage:
#   ops/release/reconcile-runtime-manifests.sh --dry-run \
#     --active-src /path/ACTIVE_OWNER.candidate.json \
#     --expected-src /path/EXPECTED_RELEASE.candidate.json
#   ops/release/reconcile-runtime-manifests.sh --apply \
#     --active-src ... --expected-src ...
#
# Destinations default to /srv/woodright/runtime-ownership/{ACTIVE_OWNER,EXPECTED_RELEASE}.json
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ASSERT="$ROOT/ops/release/assert-manifest-update-allowed.sh"

MODE=""
ACTIVE_SRC=""
EXPECTED_SRC=""
ACTIVE_DST="${WOODRIGHT_ACTIVE_OWNER:-/srv/woodright/runtime-ownership/ACTIVE_OWNER.json}"
EXPECTED_DST="${WOODRIGHT_EXPECTED_RELEASE:-/srv/woodright/runtime-ownership/EXPECTED_RELEASE.json}"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) MODE=dry-run; shift ;;
    --apply) MODE=apply; shift ;;
    --active-src) ACTIVE_SRC="$2"; shift 2 ;;
    --expected-src) EXPECTED_SRC="$2"; shift 2 ;;
    --active-dst) ACTIVE_DST="$2"; shift 2 ;;
    --expected-dst) EXPECTED_DST="$2"; shift 2 ;;
    -h|--help)
      sed -n '1,20p' "$0"
      exit 0
      ;;
    *) die "unknown arg: $1" ;;
  esac
done

[[ "$MODE" == "dry-run" || "$MODE" == "apply" ]] || die "require --dry-run or --apply"
[[ -n "$ACTIVE_SRC" && -f "$ACTIVE_SRC" ]] || die "missing --active-src"
[[ -n "$EXPECTED_SRC" && -f "$EXPECTED_SRC" ]] || die "missing --expected-src"

# Gate FIRST — blocks reconcile when Mounts=[] / wrong volume / product-static fail / etc.
bash "$ASSERT"

if [[ "$MODE" == "dry-run" ]]; then
  printf 'reconcile-runtime-manifests: DRY-RUN ok (gate PASS); would install:\n'
  printf '  %s -> %s\n' "$ACTIVE_SRC" "$ACTIVE_DST"
  printf '  %s -> %s\n' "$EXPECTED_SRC" "$EXPECTED_DST"
  exit 0
fi

install -m 0600 "$ACTIVE_SRC" "$ACTIVE_DST"
install -m 0600 "$EXPECTED_SRC" "$EXPECTED_DST"
printf 'reconcile-runtime-manifests: APPLIED active=%s expected=%s\n' "$ACTIVE_DST" "$EXPECTED_DST"
