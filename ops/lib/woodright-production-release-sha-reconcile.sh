#!/usr/bin/env bash
# Metadata-only WOODRIGHT_RELEASE_SHA reconcile for PRIVATE production-candidate.
# Sourced by reconcile-production-candidate-metadata.sh (not a standalone entrypoint).
# shellcheck shell=bash

WR_PC_RELEASE_SHA_CONFIRM='I_UNDERSTAND_PRODUCTION_METADATA_COMPOSE_RELEASE_SHA_CORRECTION'

wr_pc_release_sha_oci_of_ref() {
  local ref="$1"
  docker image inspect "$ref" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null || true
}

wr_pc_release_sha_run() {
  local mode="$1"
  local confirm="${2:-}"
  local compose_env="${WOODRIGHT_COMPOSE_ENV_FILE:?}"
  local compose_parent
  local pin_sf pin_be release_now
  local sf_name be_name
  local -a sf_rt be_rt sf_rt2 be_rt2
  local sf_oci be_oci
  local own_dir evidence_dir ts
  local want_sha="$SOURCE_SHA"
  local backup tmp staged
  local before_sha after_sha

  [[ "$WOODRIGHT_ENVIRONMENT" == "production" ]] || die "compose-common-release-sha: production only"
  require_full_sha "$want_sha" application-source-sha
  require_full_sha "$CURRENT_HELPER_SHA" current-helper-install-sha
  require_immutable_ref "$SF_REF" storefront
  require_immutable_ref "$BE_REF" backend

  if [[ "$mode" == "dry-run" ]]; then
    wr_resolve_installed_governance_sha --dry-run || die "canonical governance marker unresolved"
  else
    wr_resolve_installed_governance_sha --mutating || die "canonical governance marker unresolved or legacy drift"
  fi
  [[ "$WR_INSTALLED_GOVERNANCE_SHA" == "$CURRENT_HELPER_SHA" ]] \
    || die "current helper install SHA mismatch: marker=$WR_INSTALLED_GOVERNANCE_SHA declared=$CURRENT_HELPER_SHA"

  compose_parent="$(dirname -- "$compose_env")"
  wr_compose_env_assert_path_under "$compose_env" "$compose_parent" || die "compose env path refused"
  wr_compose_env_is_regular_file "$compose_env" || die "compose env must be a regular file"
  wr_compose_env_assert_no_duplicate_governed_keys "$compose_env" || die "duplicate governed keys in compose env"

  own_dir="${WOODRIGHT_OWNERSHIP_DIR:?}"
  sf_name="${WOODRIGHT_SF_CONTAINER_DEFAULT:?}"
  be_name="${WOODRIGHT_BE_CONTAINER_DEFAULT:?}"

  pin_sf="$(pin_of WOODRIGHT_STOREFRONT_IMAGE)"
  pin_be="$(pin_of WOODRIGHT_BACKEND_IMAGE)"
  release_now="$(pin_of WOODRIGHT_RELEASE_SHA)"
  [[ "$pin_sf" == "$SF_REF" ]] || die "pin storefront mismatch"
  [[ "$pin_be" == "$BE_REF" ]] || die "pin backend mismatch"

  mapfile -t sf_rt < <(runtime_digest "$sf_name")
  mapfile -t be_rt < <(runtime_digest "$be_name")
  [[ "${sf_rt[0]}" == "$SF_REF" ]] || die "runtime storefront digest mismatch"
  [[ "${be_rt[0]}" == "$BE_REF" ]] || die "runtime backend digest mismatch"
  [[ "${sf_rt[3]}" == "healthy" && "${be_rt[3]}" == "healthy" ]] || die "containers not healthy"

  sf_oci="$(wr_pc_release_sha_oci_of_ref "$SF_REF")"
  be_oci="$(wr_pc_release_sha_oci_of_ref "$BE_REF")"
  [[ "$sf_oci" == "$want_sha" && "$be_oci" == "$want_sha" ]] \
    || die "OCI revision gate failed sf=$sf_oci be=$be_oci want=$want_sha"

  for f in ACTIVE_RELEASE.json ACTIVE_OWNER.json EXPECTED_RELEASE.json; do
    [[ -f "$own_dir/$f" ]] || die "missing ownership file $own_dir/$f"
  done
  ACTIVE_APP="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("application_source_sha",""))' "$own_dir/ACTIVE_RELEASE.json")"
  ACTIVE_SF="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("storefront_image",""))' "$own_dir/ACTIVE_RELEASE.json")"
  ACTIVE_BE="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("backend_image",""))' "$own_dir/ACTIVE_RELEASE.json")"
  OWNER_APP="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("application_source_sha",""))' "$own_dir/ACTIVE_OWNER.json")"
  EXPECT_APP="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("application_source_sha",""))' "$own_dir/EXPECTED_RELEASE.json")"
  [[ "$ACTIVE_APP" == "$want_sha" && "$OWNER_APP" == "$want_sha" && "$EXPECT_APP" == "$want_sha" ]] \
    || die "ownership application_source_sha not aligned to target"
  [[ "$ACTIVE_SF" == "$SF_REF" && "$ACTIVE_BE" == "$BE_REF" ]] || die "ACTIVE images do not match refs"

  if [[ "$release_now" == "$want_sha" ]]; then
    cat <<EOF
{
  "tool": "reconcile-production-candidate-metadata.sh",
  "correction": "compose-common-release-sha",
  "mode": "$mode",
  "status": "already_corrected",
  "metadata_only": true,
  "container_recreate_planned": false,
  "pin_image_write_planned": false,
  "compose_release_sha_write_planned": false,
  "runtime_mutation_planned": false
}
EOF
    log "ALREADY_CORRECTED WOODRIGHT_RELEASE_SHA already $want_sha"
    return 0
  fi

  if [[ "$mode" == "dry-run" ]]; then
    cat <<EOF
{
  "tool": "reconcile-production-candidate-metadata.sh",
  "mode": "dry-run",
  "correction": "compose-common-release-sha",
  "metadata_only": true,
  "container_recreate_planned": false,
  "pin_image_write_planned": false,
  "compose_release_sha_write_planned": true,
  "runtime_mutation_planned": false,
  "application_source_sha": "$want_sha",
  "current_release_sha_present": $([[ -n "$release_now" ]] && echo true || echo false),
  "pins": {"storefront": "$pin_sf", "backend": "$pin_be"},
  "runtime_digests_match": true,
  "oci_revisions_match": true,
  "ownership_application_sha_match": true,
  "lock_path": "${WR_STAGING_MUTATION_LOCK_PATH}",
  "no_lock_held": true,
  "note": "values redacted; secrets never printed"
}
EOF
    log "DRY_RUN_OK metadata_only correction=compose-common-release-sha"
    return 0
  fi

  [[ "$confirm" == "$WR_PC_RELEASE_SHA_CONFIRM" ]] \
    || die "execute requires --confirm-mutation $WR_PC_RELEASE_SHA_CONFIRM"

  ts="$(date -u +%Y%m%dT%H%M%SZ)"
  evidence_dir="${WOODRIGHT_EVIDENCE_DIR:-/srv/woodright/reports/production/metadata-compose-release-sha-$ts}"
  mkdir -p "$evidence_dir"/{json,pin-backup}
  chmod 0700 "$evidence_dir" "$evidence_dir/json" "$evidence_dir/pin-backup" 2>/dev/null || true
  EVIDENCE_DIR="$evidence_dir"
  record_state prepared
  printf '%s\n' "$want_sha" >"$evidence_dir/json/application-source-sha.txt"
  printf '%s\n' "$CURRENT_HELPER_SHA" >"$evidence_dir/json/metadata-correction-helper-sha.txt"
  printf '%s\n' "compose-common-release-sha" >"$evidence_dir/json/correction.txt"
  # Checksums only - never copy secret-bearing .env into evidence unless under pin-backup with 0600
  before_sha="$(wr_compose_env_sha256 "$compose_env")"
  printf '%s\n' "$before_sha" >"$evidence_dir/json/compose-env-before.sha256"
  cp -p "$compose_env" "$evidence_dir/pin-backup/dokploy-compose.env"
  chmod 0600 "$evidence_dir/pin-backup/dokploy-compose.env"

  wr_staging_lock_acquire "reconcile-production-candidate-compose-release-sha" || die "lock contention"
  LOCK_HELD=1
  trap 'if [[ "${LOCK_HELD:-0}" == "1" ]]; then wr_staging_lock_release || true; LOCK_HELD=0; fi' EXIT

  # Under-lock re-gates (Codex: re-run every gate before/after write)
  mapfile -t sf_rt2 < <(runtime_digest "$sf_name")
  mapfile -t be_rt2 < <(runtime_digest "$be_name")
  [[ "${sf_rt2[1]}" == "${sf_rt[1]}" && "${be_rt2[1]}" == "${be_rt[1]}" ]] || die "container IDs changed under lock"
  [[ "${sf_rt2[0]}" == "$SF_REF" && "${be_rt2[0]}" == "$BE_REF" ]] || die "runtime digests changed under lock"
  [[ "$(pin_of WOODRIGHT_STOREFRONT_IMAGE)" == "$SF_REF" ]] || die "storefront pin changed under lock"
  [[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$BE_REF" ]] || die "backend pin changed under lock"
  [[ "$(wr_pc_release_sha_oci_of_ref "$SF_REF")" == "$want_sha" ]] || die "storefront OCI changed under lock"
  [[ "$(wr_pc_release_sha_oci_of_ref "$BE_REF")" == "$want_sha" ]] || die "backend OCI changed under lock"

  tmp="$(mktemp "${compose_parent}/.wr-pc-release-sha-XXXXXX")"
  [[ ! -L "$tmp" ]] || { rm -f "$tmp"; die "temp path is symlink"; }
  cp -p "$compose_env" "$tmp" || { rm -f "$tmp"; die "compose env backup to temp failed"; }
  staged="${tmp}.next"
  if ! wr_compose_env_render_keys "$tmp" "$staged" WOODRIGHT_RELEASE_SHA "$want_sha"; then
    rm -f "$tmp" "$staged"
    die "render WOODRIGHT_RELEASE_SHA failed"
  fi
  wr_compose_env_validate_keys "$staged" \
    WOODRIGHT_BACKEND_IMAGE "$BE_REF" \
    WOODRIGHT_STOREFRONT_IMAGE "$SF_REF" \
    WOODRIGHT_RELEASE_SHA "$want_sha" \
    || { rm -f "$tmp" "$staged"; die "validate staged compose env failed"; }
  wr_compose_env_assert_no_duplicate_governed_keys "$staged" \
    || { rm -f "$tmp" "$staged"; die "duplicate keys in staged env"; }

  record_state pins_written
  if ! wr_compose_env_atomic_install "$staged" "$compose_env" "$compose_parent"; then
    rm -f "$tmp" "$staged"
    die "atomic compose env install failed"
  fi
  rm -f "$tmp" "$staged"

  after_sha="$(wr_compose_env_sha256 "$compose_env")"
  printf '%s\n' "$after_sha" >"$evidence_dir/json/compose-env-after.sha256"
  [[ "$(pin_of WOODRIGHT_RELEASE_SHA)" == "$want_sha" ]] || {
    log "ERROR: postcondition RELEASE_SHA mismatch - restoring backup"
    wr_compose_env_restore_backup "$evidence_dir/pin-backup/dokploy-compose.env" "$compose_env" "$compose_parent" \
      || die "CRITICAL: compose env restore failed"
    record_state metadata_correction_incomplete
    exit 14
  }
  [[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$BE_REF" ]] || {
    wr_compose_env_restore_backup "$evidence_dir/pin-backup/dokploy-compose.env" "$compose_env" "$compose_parent" || true
    die "backend pin drifted after release-sha write"
  }
  [[ "$(pin_of WOODRIGHT_STOREFRONT_IMAGE)" == "$SF_REF" ]] || {
    wr_compose_env_restore_backup "$evidence_dir/pin-backup/dokploy-compose.env" "$compose_env" "$compose_parent" || true
    die "storefront pin drifted after release-sha write"
  }
  mapfile -t sf_rt2 < <(runtime_digest "$sf_name")
  mapfile -t be_rt2 < <(runtime_digest "$be_name")
  [[ "${sf_rt2[1]}" == "${sf_rt[1]}" && "${be_rt2[1]}" == "${be_rt[1]}" ]] || {
    wr_compose_env_restore_backup "$evidence_dir/pin-backup/dokploy-compose.env" "$compose_env" "$compose_parent" || true
    die "containers mutated during metadata-only release-sha write"
  }

  record_state metadata_correction_committed
  cat <<EOF
{
  "tool": "reconcile-production-candidate-metadata.sh",
  "correction": "compose-common-release-sha",
  "mode": "execute",
  "status": "committed",
  "metadata_only": true,
  "container_recreate_planned": false,
  "application_source_sha": "$want_sha",
  "compose_env_before_sha256": "$before_sha",
  "compose_env_after_sha256": "$after_sha",
  "evidence_dir": "$evidence_dir",
  "runtime_mutation_performed": false
}
EOF
  log "PRODUCTION_CANDIDATE_COMPOSE_RELEASE_SHA_OK sha=$want_sha"
  wr_staging_lock_release || true
  LOCK_HELD=0
  return 0
}
