#!/usr/bin/env bash
# LIVE_MUTATING=metadata_only
# requires_global_lock=true (execute)
#
# Metadata-only authority reconcile for PUBLIC_DEMO:
#   1) compose .env WOODRIGHT_RELEASE_SHA
#   2) ACTIVE_OWNER.approved_git_sha
#
# Never recreates/restarts containers, never pulls images, never rewrites
# image pin digests when runtime already matches.
#
# Confirmation (execute only):
#   I_UNDERSTAND_PUBLIC_DEMO_METADATA_AUTHORITY_RECONCILE
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# shellcheck source=../lib/woodright-environment-profile.sh
source "$SCRIPT_DIR/../lib/woodright-environment-profile.sh"
# shellcheck source=../lib/woodright-staging-mutation-lock.sh
source "$SCRIPT_DIR/../lib/woodright-staging-mutation-lock.sh"
# shellcheck source=../lib/woodright-compose-env-authority.sh
source "$SCRIPT_DIR/../lib/woodright-compose-env-authority.sh"
# shellcheck source=../lib/woodright-public-demo-metadata-authority.sh
source "$SCRIPT_DIR/../lib/woodright-public-demo-metadata-authority.sh"
# shellcheck source=../lib/woodright-install-provenance.sh
source "$SCRIPT_DIR/../lib/woodright-install-provenance.sh"

MODE="dry-run"
SOURCE_SHA=""
CURRENT_HELPER_SHA=""
SF_REF=""
BE_REF=""
CONFIRM=""
LOCK_HELD=0
EVIDENCE_DIR=""
STATE="prepared"
ROLLBACK_PERFORMED=0

die() { echo "ERROR: $*" >&2; exit 2; }
log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }

usage() {
  cat <<EOF
Usage: reconcile-public-demo-metadata.sh \\
  --environment public_demo \\
  --application-source-sha <40hex> \\
  --backend-ref ghcr.io/saintgroovie/woodright-backend@sha256:<64hex> \\
  --storefront-ref ghcr.io/saintgroovie/woodright-storefront@sha256:<64hex> \\
  --current-helper-install-sha <40hex> \\
  [--dry-run|--execute] \\
  [--confirm-mutation $WR_PD_META_CONFIRM]

Exit: 0 ok | 2 validation | 3 lock | 14 incomplete/rolled_back
EOF
}

record_state() {
  STATE="$1"
  [[ -n "$EVIDENCE_DIR" ]] || return 0
  mkdir -p "$EVIDENCE_DIR" 2>/dev/null || true
  printf '%s\n' "$STATE" >"$EVIDENCE_DIR/state.txt"
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$STATE" >>"$EVIDENCE_DIR/state-transitions.log"
}

FULL_ARGV=("$@")
for wr_arg in "${FULL_ARGV[@]-}"; do
  case "$wr_arg" in -h|--help) usage; exit 0 ;; esac
done

wr_require_environment_from_args "${FULL_ARGV[@]}" || exit 1
[[ "${WOODRIGHT_ENVIRONMENT}" == "public_demo" ]] \
  || die "refused --environment '${WOODRIGHT_ENVIRONMENT}' (public_demo only)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --environment) shift 2 ;;
    --environment=*) shift ;;
    --application-source-sha) SOURCE_SHA="${2:?}"; shift 2 ;;
    --application-source-sha=*) SOURCE_SHA="${1#--application-source-sha=}"; shift ;;
    --backend-ref) BE_REF="${2:?}"; shift 2 ;;
    --backend-ref=*) BE_REF="${1#--backend-ref=}"; shift ;;
    --storefront-ref) SF_REF="${2:?}"; shift 2 ;;
    --storefront-ref=*) SF_REF="${1#--storefront-ref=}"; shift ;;
    --current-helper-install-sha) CURRENT_HELPER_SHA="${2:?}"; shift 2 ;;
    --current-helper-install-sha=*) CURRENT_HELPER_SHA="${1#--current-helper-install-sha=}"; shift ;;
    --dry-run) MODE="dry-run"; shift ;;
    --execute) MODE="execute"; shift ;;
    --confirm-mutation) CONFIRM="${2:?}"; shift 2 ;;
    --confirm-mutation=*) CONFIRM="${1#--confirm-mutation=}"; shift ;;
    *) die "unknown arg: $1" ;;
  esac
done

[[ -n "$SOURCE_SHA" && -n "$BE_REF" && -n "$SF_REF" && -n "$CURRENT_HELPER_SHA" ]] \
  || die "required: --application-source-sha --backend-ref --storefront-ref --current-helper-install-sha"

# Hard ban: this helper must never invoke recreate/restart/pull mutators.
case "${BASH_SOURCE[0]}" in
  *) ;;
esac
if grep -Eiq 'compose[[:space:]]+.*\b(up|recreate|restart|pull)\b|docker[[:space:]]+.*\b(restart|rm|pull|create)\b' \
  "$SCRIPT_DIR/../lib/woodright-public-demo-metadata-authority.sh" \
  "$0" 2>/dev/null; then
  # Allow only docker inspect / image inspect strings in comments and commands we use.
  :
fi
# Explicit static ban list for this entrypoint body (fail CI if added later).
if grep -En 'docker[[:space:]]+(compose|restart|rm|pull|create)|compose[[:space:]]+(up|recreate)' "$0" \
  | grep -v '^[[:space:]]*#' | grep -v 'grep -En' >/dev/null; then
  die "unsafe docker mutation command detected in helper"
fi

if [[ "$MODE" == "dry-run" ]]; then
  wr_resolve_installed_governance_sha --dry-run || die "canonical governance marker unresolved"
else
  wr_resolve_installed_governance_sha --mutating || die "canonical governance marker unresolved or legacy drift"
fi
[[ "$WR_INSTALLED_GOVERNANCE_SHA" == "$CURRENT_HELPER_SHA" ]] \
  || die "current helper install SHA mismatch: marker=$WR_INSTALLED_GOVERNANCE_SHA declared=$CURRENT_HELPER_SHA"

# Lock path must be the public_demo canonical path from profile.
[[ "${WR_STAGING_MUTATION_LOCK_PATH}" == "${WOODRIGHT_MUTATION_LOCK_PATH}" ]] \
  || WR_STAGING_MUTATION_LOCK_PATH="${WOODRIGHT_MUTATION_LOCK_PATH}"
WR_STAGING_MUTATION_LOCK_META="${WR_STAGING_MUTATION_LOCK_PATH}.meta"
WR_STAGING_MUTATION_LOCK_DIR="$(dirname "$WR_STAGING_MUTATION_LOCK_PATH")"
case "$WR_STAGING_MUTATION_LOCK_PATH" in
  */locks/public_demo/live-cutover.lock) ;;
  *) die "refused lock path '$WR_STAGING_MUTATION_LOCK_PATH' (public_demo only)" ;;
esac

wr_pd_meta_run_gates "$SOURCE_SHA" "$BE_REF" "$SF_REF" || die "runtime/authority gate failed"

release_now="${WR_PD_META_RELEASE_NOW:-}"
approved_now="${WR_PD_META_APPROVED_NOW:-}"
need_env=0
need_owner=0
[[ "$release_now" == "$SOURCE_SHA" ]] || need_env=1
[[ "$approved_now" == "$SOURCE_SHA" ]] || need_owner=1

emit_plan() {
  local status="$1"
  cat <<EOF
{
  "tool": "reconcile-public-demo-metadata.sh",
  "mode": "$MODE",
  "status": "$status",
  "metadata_only": true,
  "environment": "public_demo",
  "application_source_sha": "$SOURCE_SHA",
  "backend_ref": "$BE_REF",
  "storefront_ref": "$SF_REF",
  "container_recreate_planned": false,
  "container_restart_planned": false,
  "image_pull_planned": false,
  "pin_image_write_planned": false,
  "compose_release_sha_write_planned": $([[ "$need_env" == "1" && "$status" != "already_corrected" ]] && echo true || echo false),
  "approved_git_sha_write_planned": $([[ "$need_owner" == "1" && "$status" != "already_corrected" ]] && echo true || echo false),
  "runtime_mutation_planned": false,
  "runtime_mutation_count": 0,
  "lock_path": "$WR_STAGING_MUTATION_LOCK_PATH",
  "backend_container_id": "$WR_PD_META_BE_ID",
  "storefront_container_id": "$WR_PD_META_SF_ID",
  "note": "secrets never printed; env values redacted"
}
EOF
}

if [[ "$need_env" == "0" && "$need_owner" == "0" ]]; then
  emit_plan already_corrected
  log "ALREADY_CORRECTED release_sha+approved_git_sha already $SOURCE_SHA"
  exit 0
fi

if [[ "$MODE" == "dry-run" ]]; then
  emit_plan dry-run
  log "DRY_RUN_OK metadata_only need_env=$need_env need_owner=$need_owner"
  exit 0
fi

[[ "$CONFIRM" == "$WR_PD_META_CONFIRM" ]] \
  || die "execute requires --confirm-mutation $WR_PD_META_CONFIRM"

ts="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE_DIR="${WOODRIGHT_EVIDENCE_ROOT:-/srv/woodright/reports/public_demo}/metadata-authority-$ts"
mkdir -p "$EVIDENCE_DIR"/{json,backup}
chmod 0700 "$EVIDENCE_DIR" "$EVIDENCE_DIR/json" "$EVIDENCE_DIR/backup" 2>/dev/null || true
record_state prepared
printf '%s\n' "$SOURCE_SHA" >"$EVIDENCE_DIR/json/application-source-sha.txt"
printf '%s\n' "$CURRENT_HELPER_SHA" >"$EVIDENCE_DIR/json/helper-install-sha.txt"
printf '%s\n' "$WR_PD_META_BE_ID" >"$EVIDENCE_DIR/json/backend-container-id-before.txt"
printf '%s\n' "$WR_PD_META_SF_ID" >"$EVIDENCE_DIR/json/storefront-container-id-before.txt"
printf '%s\n' "$WR_PD_META_BE_START" >"$EVIDENCE_DIR/json/backend-started-before.txt"
printf '%s\n' "$WR_PD_META_SF_START" >"$EVIDENCE_DIR/json/storefront-started-before.txt"

compose_env="${WOODRIGHT_COMPOSE_ENV_FILE}"
allowed_root="${WOODRIGHT_DOKPLOY_COMPOSE_DIR}"
active_owner="${WOODRIGHT_ACTIVE_OWNER}"
own_parent="$(dirname -- "$active_owner")"

before_env_sha="$(wr_compose_env_sha256 "$compose_env")"
before_owner_sha="$(wr_pd_meta_sha256 "$active_owner")"
printf '%s\n' "$before_env_sha" >"$EVIDENCE_DIR/json/compose-env-before.sha256"
printf '%s\n' "$before_owner_sha" >"$EVIDENCE_DIR/json/active-owner-before.sha256"
cp -p "$compose_env" "$EVIDENCE_DIR/backup/dokploy-compose.env"
chmod 0600 "$EVIDENCE_DIR/backup/dokploy-compose.env"
cp -p "$active_owner" "$EVIDENCE_DIR/backup/ACTIVE_OWNER.json"
chmod 0600 "$EVIDENCE_DIR/backup/ACTIVE_OWNER.json"

rollback_all() {
  log "ROLLBACK_BEGIN"
  ROLLBACK_PERFORMED=1
  wr_compose_env_restore_backup "$EVIDENCE_DIR/backup/dokploy-compose.env" "$compose_env" "$allowed_root" \
    || log "ERROR: compose env restore failed"
  wr_pd_meta_atomic_install_file "$EVIDENCE_DIR/backup/ACTIVE_OWNER.json" "$active_owner" "$own_parent" \
    || log "ERROR: ACTIVE_OWNER restore failed"
  record_state rolled_back
  log "ROLLBACK_DONE"
}

wr_staging_mutation_lock_acquire \
  actor=reconcile-public-demo-metadata \
  command=reconcile-public-demo-metadata.sh \
  target="$SOURCE_SHA" \
  || { echo "ERROR: lock contention" >&2; exit 3; }
LOCK_HELD=1
trap 'if [[ "${LOCK_HELD:-0}" == "1" ]]; then wr_staging_mutation_lock_release || true; LOCK_HELD=0; fi' EXIT

# Under-lock revalidation
wr_pd_meta_run_gates "$SOURCE_SHA" "$BE_REF" "$SF_REF" || {
  wr_staging_mutation_lock_release || true
  LOCK_HELD=0
  die "under-lock gate failed"
}
wr_pd_meta_assert_containers_unchanged || {
  wr_staging_mutation_lock_release || true
  LOCK_HELD=0
  die "containers drifted before write"
}

compose_parent="$(dirname -- "$compose_env")"
tmp_env="$(mktemp "${compose_parent}/.wr-pd-meta-env-XXXXXX")"
staged_env="${tmp_env}.next"
tmp_owner="$(mktemp "${own_parent}/.wr-pd-meta-owner-XXXXXX")"
staged_owner="${tmp_owner}.next"
cleanup_tmps() { rm -f "$tmp_env" "$staged_env" "$tmp_owner" "$staged_owner" 2>/dev/null || true; }

cp -p "$compose_env" "$tmp_env"
cp -p "$active_owner" "$tmp_owner"

if [[ "$need_env" == "1" ]]; then
  wr_compose_env_render_keys "$tmp_env" "$staged_env" WOODRIGHT_RELEASE_SHA "$SOURCE_SHA" \
    || { cleanup_tmps; die "render WOODRIGHT_RELEASE_SHA failed"; }
  wr_compose_env_validate_keys "$staged_env" \
    WOODRIGHT_BACKEND_IMAGE "$BE_REF" \
    WOODRIGHT_STOREFRONT_IMAGE "$SF_REF" \
    WOODRIGHT_RELEASE_SHA "$SOURCE_SHA" \
    || { cleanup_tmps; die "validate staged compose env failed"; }
  wr_compose_env_assert_no_duplicate_governed_keys "$staged_env" \
    || { cleanup_tmps; die "duplicate keys in staged env"; }
else
  cp -p "$tmp_env" "$staged_env"
fi

if [[ "$need_owner" == "1" ]]; then
  wr_pd_meta_render_owner_approved "$tmp_owner" "$staged_owner" "$SOURCE_SHA" "$CURRENT_HELPER_SHA" \
    || { cleanup_tmps; die "render ACTIVE_OWNER approved_git_sha failed"; }
else
  cp -p "$tmp_owner" "$staged_owner"
fi

record_state writing
ENV_OK=0
OWNER_OK=0
if [[ "$need_env" == "1" ]]; then
  if wr_compose_env_atomic_install "$staged_env" "$compose_env" "$allowed_root"; then
    ENV_OK=1
  else
    cleanup_tmps
    rollback_all
    exit 14
  fi
else
  ENV_OK=1
fi

if [[ "$need_owner" == "1" ]]; then
  if wr_pd_meta_atomic_install_file "$staged_owner" "$active_owner" "$own_parent"; then
    OWNER_OK=1
  else
    cleanup_tmps
    rollback_all
    exit 14
  fi
else
  OWNER_OK=1
fi
cleanup_tmps

# Postconditions
after_env_sha="$(wr_compose_env_sha256 "$compose_env")"
after_owner_sha="$(wr_pd_meta_sha256 "$active_owner")"
printf '%s\n' "$after_env_sha" >"$EVIDENCE_DIR/json/compose-env-after.sha256"
printf '%s\n' "$after_owner_sha" >"$EVIDENCE_DIR/json/active-owner-after.sha256"

got_release="$(wr_pd_meta_pin_of "$compose_env" WOODRIGHT_RELEASE_SHA || true)"
got_approved="$(wr_pd_meta_json_get "$active_owner" approved_git_sha)"
got_be_img="$(wr_pd_meta_pin_of "$compose_env" WOODRIGHT_BACKEND_IMAGE || true)"
got_sf_img="$(wr_pd_meta_pin_of "$compose_env" WOODRIGHT_STOREFRONT_IMAGE || true)"

if [[ "$got_release" != "$SOURCE_SHA" \
   || "$got_approved" != "$SOURCE_SHA" \
   || "$got_be_img" != "$BE_REF" \
   || "$got_sf_img" != "$SF_REF" ]]; then
  log "ERROR: authority postcondition failed - rolling back"
  rollback_all
  exit 14
fi

if ! wr_pd_meta_assert_containers_unchanged; then
  log "ERROR: containers mutated during metadata write - rolling back"
  rollback_all
  exit 14
fi

# Re-assert ACTIVE_PUBLIC / EXPECTED unchanged (sha only)
ap_sha="$(wr_pd_meta_json_get "${WOODRIGHT_ACTIVE_PUBLIC}" release_sha)"
[[ "$ap_sha" == "$SOURCE_SHA" ]] || { rollback_all; die "ACTIVE_PUBLIC drifted"; }

record_state metadata_correction_committed
printf '%s\n' "$WR_PD_META_BE_ID" >"$EVIDENCE_DIR/json/backend-container-id-after.txt"
printf '%s\n' "$WR_PD_META_SF_ID" >"$EVIDENCE_DIR/json/storefront-container-id-after.txt"

cat <<EOF
{
  "tool": "reconcile-public-demo-metadata.sh",
  "mode": "execute",
  "status": "committed",
  "metadata_only": true,
  "application_source_sha": "$SOURCE_SHA",
  "compose_env_before_sha256": "$before_env_sha",
  "compose_env_after_sha256": "$after_env_sha",
  "active_owner_before_sha256": "$before_owner_sha",
  "active_owner_after_sha256": "$after_owner_sha",
  "backend_container_id": "$WR_PD_META_BE_ID",
  "storefront_container_id": "$WR_PD_META_SF_ID",
  "container_ids_unchanged": true,
  "runtime_mutation_performed": false,
  "rollback_performed": false,
  "evidence_dir": "$EVIDENCE_DIR"
}
EOF
log "PUBLIC_DEMO_METADATA_AUTHORITY_OK sha=$SOURCE_SHA"
wr_staging_mutation_lock_release || true
LOCK_HELD=0
exit 0
