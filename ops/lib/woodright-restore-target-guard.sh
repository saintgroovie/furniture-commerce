#!/usr/bin/env bash
# Fail-closed restore target identity for public_production.
# Isolation is stack/data/volume, not a second VPS/IP.
# Never restore into demo/staging (or private candidate) Postgres.
# shellcheck shell=bash

wr_restore_target_log() { printf '%s wr_restore_target_guard %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
wr_restore_target_die() { wr_restore_target_log "ERROR: $*"; return 1; }

# wr_assert_public_production_restore_target CONTAINER DB [VOLUME] [COMPOSE_PROJECT] [NETWORK]
wr_assert_public_production_restore_target() {
  local container="${1:-}"
  local db="${2:-}"
  local volume="${3:-}"
  local compose_project="${4:-}"
  local network="${5:-}"

  [[ -n "$container" ]] || { wr_restore_target_die "RESTORE_TARGET_CONTAINER_EMPTY"; return 1; }
  [[ -n "$db" ]] || { wr_restore_target_die "RESTORE_TARGET_DATABASE_EMPTY"; return 1; }

  case "$container" in
    *staging*|woodright-staging-postgres)
      wr_restore_target_die "RESTORE_TARGET_STAGING_CONTAINER container=$container"
      return 1
      ;;
    woodright-production-postgres|*production-candidate*)
      wr_restore_target_die "RESTORE_TARGET_CANDIDATE_CONTAINER container=$container"
      return 1
      ;;
    woodright-public-production-postgres) ;;
    *)
      wr_restore_target_die "RESTORE_TARGET_NOT_PUBLIC_PRODUCTION container=$container"
      return 1
      ;;
  esac

  case "$db" in
    woodright_staging)
      wr_restore_target_die "RESTORE_TARGET_STAGING_DATABASE db=$db"
      return 1
      ;;
    woodright_production)
      wr_restore_target_die "RESTORE_TARGET_CANDIDATE_DATABASE db=$db"
      return 1
      ;;
    woodright_public_production) ;;
    *)
      wr_restore_target_die "RESTORE_TARGET_DATABASE_NOT_PUBLIC_PRODUCTION db=$db"
      return 1
      ;;
  esac

  if [[ -n "$volume" ]]; then
    case "$volume" in
      *staging*)
        wr_restore_target_die "RESTORE_TARGET_STAGING_VOLUME volume=$volume"
        return 1
        ;;
      woodright-production_*|*production-candidate*)
        wr_restore_target_die "RESTORE_TARGET_CANDIDATE_VOLUME volume=$volume"
        return 1
        ;;
      woodright-public-production_postgres_data) ;;
      *)
        wr_restore_target_die "RESTORE_TARGET_VOLUME_NOT_PUBLIC_PRODUCTION volume=$volume"
        return 1
        ;;
    esac
  fi

  if [[ -n "$compose_project" ]]; then
    case "$compose_project" in
      *staging*|*woodright-demo*|woodright-stack-*)
        wr_restore_target_die "RESTORE_TARGET_STAGING_COMPOSE_PROJECT project=$compose_project"
        return 1
        ;;
      woodright-public-production) ;;
      *)
        wr_restore_target_die "RESTORE_TARGET_COMPOSE_PROJECT_NOT_PUBLIC_PRODUCTION project=$compose_project"
        return 1
        ;;
    esac
  fi

  if [[ -n "$network" ]]; then
    case "$network" in
      *staging*|*woodright-demo*)
        wr_restore_target_die "RESTORE_TARGET_STAGING_NETWORK network=$network"
        return 1
        ;;
      woodright-public-production_woodright_public) ;;
      *)
        wr_restore_target_die "RESTORE_TARGET_NETWORK_NOT_PUBLIC_PRODUCTION network=$network"
        return 1
        ;;
    esac
  fi

  wr_restore_target_log "PASS container=$container db=$db volume=${volume:-unset} project=${compose_project:-unset} network=${network:-unset}"
  return 0
}

# wr_assert_public_production_media_volume VOLUME
wr_assert_public_production_media_volume() {
  local volume="${1:-}"
  [[ -n "$volume" ]] || { wr_restore_target_die "RESTORE_MEDIA_VOLUME_EMPTY"; return 1; }
  case "$volume" in
    *staging*)
      wr_restore_target_die "RESTORE_MEDIA_STAGING_VOLUME volume=$volume"
      return 1
      ;;
    woodright-production_*|*production-candidate*)
      wr_restore_target_die "RESTORE_MEDIA_CANDIDATE_VOLUME volume=$volume"
      return 1
      ;;
    woodright-public-production_woodright_public_media) ;;
    *)
      wr_restore_target_die "RESTORE_MEDIA_VOLUME_NOT_PUBLIC_PRODUCTION volume=$volume"
      return 1
      ;;
  esac
  wr_restore_target_log "PASS media_volume=$volume"
  return 0
}

# wr_assert_public_production_restore_networks NET [NET...]
# Every attached network must be the isolated production network.
# Staging/demo/unknown networks fail closed. Empty list fails closed.
wr_assert_public_production_restore_networks() {
  local saw_prod=0
  local n
  [[ $# -ge 1 ]] || { wr_restore_target_die "RESTORE_TARGET_NETWORKS_EMPTY"; return 1; }
  for n in "$@"; do
    [[ -n "$n" ]] || continue
    case "$n" in
      *staging*|*woodright-demo*|woodright-stack-*)
        wr_restore_target_die "RESTORE_TARGET_STAGING_NETWORK network=$n"
        return 1
        ;;
      woodright-public-production_woodright_public)
        saw_prod=1
        ;;
      *)
        wr_restore_target_die "RESTORE_TARGET_NETWORK_NOT_PUBLIC_PRODUCTION network=$n"
        return 1
        ;;
    esac
  done
  [[ "$saw_prod" -eq 1 ]] || {
    wr_restore_target_die "RESTORE_TARGET_PRODUCTION_NETWORK_MISSING"
    return 1
  }
  wr_restore_target_log "PASS networks=$*"
  return 0
}
