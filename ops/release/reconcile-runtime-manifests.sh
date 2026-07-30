#!/usr/bin/env bash
# LIVE_MUTATING=true
# requires_global_lock=true
# Owner-controlled ACTIVE_OWNER / EXPECTED_RELEASE reconcile.
# ALWAYS runs media promotion gate. Never auto-fills digests from a broken live container.
# --apply: acquire live-cutover.lock via flock, then re-run gate, then install.
# --dry-run: gate only (no lock, no write).
#
# Usage:
#   ops/release/reconcile-runtime-manifests.sh --dry-run \
#     --active-src /path/ACTIVE_OWNER.candidate.json \
#     --expected-src /path/EXPECTED_RELEASE.candidate.json
#   ops/release/reconcile-runtime-manifests.sh --apply \
#     --active-src ... --expected-src ...
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ASSERT="$ROOT/ops/release/assert-manifest-update-allowed.sh"
# shellcheck source=../lib/woodright-environment-profile.sh
source "$ROOT/ops/lib/woodright-environment-profile.sh"
# shellcheck source=../lib/woodright-staging-mutation-lock.sh
source "$ROOT/ops/lib/woodright-staging-mutation-lock.sh"
# shellcheck source=../lib/woodright-validation-freeze.sh
source "$ROOT/ops/lib/woodright-validation-freeze.sh"

MODE=""
ACTIVE_SRC=""
EXPECTED_SRC=""
ENV_ARG=""
ACTIVE_DST=""
EXPECTED_DST=""

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) MODE=dry-run; shift ;;
    --apply) MODE=apply; shift ;;
    --environment) ENV_ARG="$2"; shift 2 ;;
    --environment=*) ENV_ARG="${1#--environment=}"; shift ;;
    --active-src) ACTIVE_SRC="$2"; shift 2 ;;
    --expected-src) EXPECTED_SRC="$2"; shift 2 ;;
    --active-dst) ACTIVE_DST="$2"; shift 2 ;;
    --expected-dst) EXPECTED_DST="$2"; shift 2 ;;
    -h|--help)
      sed -n '1,25p' "$0"
      exit 0
      ;;
    *) die "unknown arg: $1" ;;
  esac
done

[[ -n "$ENV_ARG" ]] || die "missing required --environment <public_demo|staging|production>"
wr_load_environment_profile "$ENV_ARG" || exit 1
wr_assert_environment_provisioned || exit 1

ACTIVE_DST="${ACTIVE_DST:-$WOODRIGHT_ACTIVE_OWNER}"
EXPECTED_DST="${EXPECTED_DST:-$WOODRIGHT_EXPECTED_RELEASE}"
wr_assert_manifest_path_for_environment "$ACTIVE_DST" || exit 1
wr_assert_manifest_path_for_environment "$EXPECTED_DST" || exit 1

[[ "$MODE" == "dry-run" || "$MODE" == "apply" ]] || die "require --dry-run or --apply"
[[ -n "$ACTIVE_SRC" && -f "$ACTIVE_SRC" ]] || die "missing --active-src"
[[ -n "$EXPECTED_SRC" && -f "$EXPECTED_SRC" ]] || die "missing --expected-src"

if [[ "$MODE" == "dry-run" ]]; then
  bash "$ASSERT" --environment "$WOODRIGHT_ENVIRONMENT" ${EXPECTED_SRC:+--expected-src "$EXPECTED_SRC"}
  printf 'reconcile-runtime-manifests: DRY-RUN ok (gate PASS); would install:\n'
  printf '  %s -> %s\n' "$ACTIVE_SRC" "$ACTIVE_DST"
  printf '  %s -> %s\n' "$EXPECTED_SRC" "$EXPECTED_DST"
  exit 0
fi

wr_prelock_validate_environment_target || die "pre-lock environment validation failed"

wr_staging_mutation_lock_acquire \
  "actor=reconcile-runtime-manifests" \
  "command=$0 --apply --environment $WOODRIGHT_ENVIRONMENT" \
  "target=manifests" \
  || die "canonical mutation lock busy/unavailable"

wr_validation_freeze_assert_clear_for_mutation "$WOODRIGHT_ENVIRONMENT" || die "validation freeze active"
wr_prelock_validate_environment_target || die "under-lock environment retarget detected"

# Re-run gate under the lock immediately before install (pin candidate digests).
bash "$ASSERT" --environment "$WOODRIGHT_ENVIRONMENT" --expected-src "$EXPECTED_SRC"

install -m 0600 "$ACTIVE_SRC" "$ACTIVE_DST"
install -m 0600 "$EXPECTED_SRC" "$EXPECTED_DST"
printf 'reconcile-runtime-manifests: APPLIED active=%s expected=%s\n' "$ACTIVE_DST" "$EXPECTED_DST"
