#!/usr/bin/env bash
# Explicit environment profile loader for Woodright release governance.
# CLI argument --environment is the authority. Inherited env alone cannot select.
#
# Usage:
#   source ops/lib/woodright-environment-profile.sh
#   wr_require_environment_from_args "$@"
#   wr_assert_environment_provisioned   # before lock / Docker / metadata writes
#
# Allowed: public_demo | staging | production | public_production
# Fail-closed: missing/unknown/path-traversal/untracked/unprovisioned → non-zero.
# Note: `production` remains PRODUCTION_CANDIDATE (private). `public_production`
# is a distinct PUBLIC_PRODUCTION profile - never treat them as aliases.
# shellcheck shell=bash

_WR_ENV_PROFILE_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_WR_ENV_REPO_ROOT="$(cd "${_WR_ENV_PROFILE_LIB_DIR}/../.." && pwd)"
WOODRIGHT_ENV_PROFILE_DIR="${WOODRIGHT_ENV_PROFILE_DIR:-${_WR_ENV_REPO_ROOT}/ops/config/runtime-environments}"

wr_env_log() { printf '%s wr_env_profile %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }

wr_env_die() {
  wr_env_log "ERROR: $*"
  return 1
}

wr_environment_allowed_name() {
  case "$1" in
    public_demo|staging|production|public_production) return 0 ;;
    *) return 1 ;;
  esac
}

wr_resolve_environment_profile_path() {
  local env_name="$1"
  local base resolved dir_resolved
  wr_environment_allowed_name "$env_name" || return 1
  [[ "$env_name" != *..* && "$env_name" != */* && "$env_name" != *\\* ]] || return 1
  base="${WOODRIGHT_ENV_PROFILE_DIR%/}/${env_name}.conf"
  if command -v realpath >/dev/null 2>&1; then
    resolved="$(realpath "$base" 2>/dev/null || true)"
    dir_resolved="$(realpath "${WOODRIGHT_ENV_PROFILE_DIR%/}" 2>/dev/null || true)"
  else
    resolved="$(cd "$(dirname "$base")" 2>/dev/null && printf '%s/%s\n' "$(pwd -P)" "$(basename "$base")")"
    dir_resolved="$(cd "${WOODRIGHT_ENV_PROFILE_DIR%/}" 2>/dev/null && pwd -P)"
  fi
  [[ -n "$resolved" && -f "$resolved" && -n "$dir_resolved" ]] || return 1
  # Compare realpath prefixes so macOS /tmp → /private/tmp does not false-reject.
  case "$resolved" in
    "${dir_resolved}"/*) printf '%s\n' "$resolved"; return 0 ;;
    *) return 1 ;;
  esac
}

wr_load_environment_profile() {
  local env_name="${1:-}"
  local path
  [[ -n "$env_name" ]] || { wr_env_die "environment required (no default)"; return 1; }
  wr_environment_allowed_name "$env_name" || {
    wr_env_die "unknown environment='$env_name' (allowed: public_demo|staging|production|public_production)"
    return 1
  }

  if [[ -n "${WOODRIGHT_ENVIRONMENT:-}" && "${WOODRIGHT_ENVIRONMENT}" != "$env_name" ]]; then
    if [[ "${WOODRIGHT_ENV_ALLOW_INHERITED_MISMATCH:-0}" != "1" ]]; then
      wr_env_die "inherited WOODRIGHT_ENVIRONMENT='${WOODRIGHT_ENVIRONMENT}' conflicts with explicit '${env_name}'"
      return 1
    fi
  fi

  path="$(wr_resolve_environment_profile_path "$env_name")" || {
    wr_env_die "profile not found or outside allowlist for environment='$env_name'"
    return 1
  }

  # shellcheck disable=SC1090
  set -a
  # shellcheck source=/dev/null
  source "$path"
  set +a

  export WOODRIGHT_ENVIRONMENT="$env_name"
  export WOODRIGHT_ENV_PROFILE_PATH="$path"
  export WOODRIGHT_ENV_PROFILE_LOADED=1

  export WOODRIGHT_ACTIVE_OWNER="${WOODRIGHT_ACTIVE_OWNER}"
  export WOODRIGHT_EXPECTED_RELEASE="${WOODRIGHT_EXPECTED_RELEASE}"
  export WOODRIGHT_MEDIA_VOLUME="${WOODRIGHT_MEDIA_VOLUME}"
  export WOODRIGHT_MEDIA_MOUNT_IN_BE="${WOODRIGHT_MEDIA_MOUNT_IN_BE:-/server/static}"
  # Rebind monitor/backup path aliases from profile roots when present.
  # Units may still set WOODRIGHT_MONITOR_STATE explicitly; profile root is fallback.
  if [[ -n "${WOODRIGHT_MONITOR_STATE_ROOT:-}" ]]; then
    export WOODRIGHT_MONITOR_STATE="${WOODRIGHT_MONITOR_STATE:-$WOODRIGHT_MONITOR_STATE_ROOT}"
  fi
  if [[ -n "${WOODRIGHT_MONITOR_HISTORY_ROOT:-}" ]]; then
    export WOODRIGHT_MONITOR_HISTORY="${WOODRIGHT_MONITOR_HISTORY:-$WOODRIGHT_MONITOR_HISTORY_ROOT}"
  elif [[ -n "${WOODRIGHT_MONITOR_STATE_ROOT:-}" ]]; then
    # Sibling history next to state root (.../state → .../history)
    export WOODRIGHT_MONITOR_HISTORY="${WOODRIGHT_MONITOR_HISTORY:-${WOODRIGHT_MONITOR_STATE_ROOT%/state}/history}"
  fi
  if [[ -n "${WOODRIGHT_BACKUP_ROOT:-}" ]]; then
    export WOODRIGHT_BACKUP_ROOT
  fi
  # Do not clobber an inherited lock path from a parent mutator (pair cutover → pin reconcile).
  # Profile still exports WOODRIGHT_MUTATION_LOCK_PATH as the environment canonical target.
  if [[ "${WOODRIGHT_STAGING_MUTATION_LOCK_HELD:-0}" == "1" && -n "${WR_STAGING_MUTATION_LOCK_PATH:-}" ]]; then
    export WR_STAGING_MUTATION_LOCK_META="${WR_STAGING_MUTATION_LOCK_PATH}.meta"
  else
    export WR_STAGING_MUTATION_LOCK_PATH="${WOODRIGHT_MUTATION_LOCK_PATH}"
    export WR_STAGING_MUTATION_LOCK_META="${WOODRIGHT_MUTATION_LOCK_PATH}.meta"
  fi

  if [[ -n "${WOODRIGHT_REQUIRED_RUNTIME_ROLE:-}" && "${WOODRIGHT_REQUIRED_RUNTIME_ROLE}" == "public_demo" ]]; then
    export WOODRIGHT_REQUIRE_PUBLIC_DEMO=1
  else
    export WOODRIGHT_REQUIRE_PUBLIC_DEMO=0
  fi

  wr_env_log "loaded environment=$env_name class=${WOODRIGHT_ENVIRONMENT_CLASS:-} provisioned=${WOODRIGHT_ENVIRONMENT_PROVISIONED:-0} profile=$path lock=${WOODRIGHT_MUTATION_LOCK_PATH} held_lock=${WR_STAGING_MUTATION_LOCK_PATH}"
  return 0
}

wr_parse_environment_arg() {
  WR_PARSED_ENVIRONMENT=""
  local -a args=("$@")
  local i=0
  while [[ $i -lt ${#args[@]} ]]; do
    case "${args[$i]}" in
      --environment)
        i=$((i + 1))
        WR_PARSED_ENVIRONMENT="${args[$i]:-}"
        ;;
      --environment=*)
        WR_PARSED_ENVIRONMENT="${args[$i]#--environment=}"
        ;;
    esac
    i=$((i + 1))
  done
  [[ -n "$WR_PARSED_ENVIRONMENT" ]]
}

wr_require_environment_from_args() {
  if ! wr_parse_environment_arg "$@"; then
    wr_env_die "missing required --environment <public_demo|staging|production|public_production> (no default; inherited env is not authority)"
    return 1
  fi
  wr_load_environment_profile "$WR_PARSED_ENVIRONMENT"
}

wr_load_environment_from_opt_in_env() {
  if [[ "${WOODRIGHT_ENV_FROM_ENV:-0}" != "1" ]]; then
    wr_env_die "WOODRIGHT_ENV_FROM_ENV=1 required to load from environment variable"
    return 1
  fi
  local env_name="${WOODRIGHT_ENVIRONMENT:-}"
  [[ -n "$env_name" ]] || { wr_env_die "WOODRIGHT_ENVIRONMENT empty"; return 1; }
  wr_load_environment_profile "$env_name"
}

wr_assert_environment_provisioned() {
  [[ "${WOODRIGHT_ENV_PROFILE_LOADED:-0}" == "1" ]] || { wr_env_die "profile not loaded"; return 1; }
  if [[ "${WOODRIGHT_ENVIRONMENT_PROVISIONED:-0}" != "1" ]]; then
    wr_env_die "environment=${WOODRIGHT_ENVIRONMENT} is unprovisioned on this host (refusing lock/Docker/metadata mutation; use --environment public_demo for buyer demo)"
    return 1
  fi
  return 0
}

# Canonical logical DB identity (governance label / HTTP header alias).
# Distinct from WOODRIGHT_DB_NAME (physical PostgreSQL database / connection name).
# Fail-closed when profile lacks WOODRIGHT_REQUIRED_DB_ALIAS.
wr_require_canonical_db_identity() {
  [[ "${WOODRIGHT_ENV_PROFILE_LOADED:-0}" == "1" ]] || { wr_env_die "profile not loaded"; return 1; }
  local alias="${WOODRIGHT_REQUIRED_DB_ALIAS:-}"
  if [[ -z "$alias" ]]; then
    wr_env_die "WOODRIGHT_REQUIRED_DB_ALIAS missing for environment=${WOODRIGHT_ENVIRONMENT:-unknown}"
    return 1
  fi
  case "$alias" in
    *[:/\\]*|*[[:space:]]*|*@*|*.*)
      wr_env_die "invalid WOODRIGHT_REQUIRED_DB_ALIAS='$alias'"
      return 1
      ;;
  esac
  # Never promote physical connection DB name into governance identity.
  export WOODRIGHT_DATABASE_IDENTITY_ALIAS="$alias"
  export WOODRIGHT_DATABASE_CONNECTION_NAME="${WOODRIGHT_DB_NAME:-}"
  wr_env_log "db_identity alias=${WOODRIGHT_DATABASE_IDENTITY_ALIAS} connection_name=${WOODRIGHT_DATABASE_CONNECTION_NAME:-none}"
  return 0
}

wr_canonical_db_identity_label() {
  wr_require_canonical_db_identity || return 1
  printf '%s\n' "${WOODRIGHT_DATABASE_IDENTITY_ALIAS}"
}

wr_assert_container_matches_environment() {
  local name="$1"
  local kind="${2:-backend}" # backend|storefront
  local owner role exposure title compose prefix required_role db_alias
  [[ "${WOODRIGHT_ENV_PROFILE_LOADED:-0}" == "1" ]] || { wr_env_die "profile not loaded"; return 1; }
  [[ -n "$name" ]] || { wr_env_die "empty container name"; return 1; }

  if [[ "$kind" == "backend" ]]; then
    prefix="${WOODRIGHT_BE_NAME_PREFIX}"
  else
    prefix="${WOODRIGHT_SF_NAME_PREFIX}"
  fi
  case "$name" in
    ${prefix}*) ;;
    *) wr_env_die "container '$name' does not match prefix '$prefix' for environment=${WOODRIGHT_ENVIRONMENT}"; return 1 ;;
  esac

  # Hard ban: staging must never touch public_demo legacy names
  if [[ "${WOODRIGHT_ENVIRONMENT}" == "staging" ]]; then
    case "$name" in
      woodright-staging-backend|woodright-staging-storefront|woodright-staging-backend-*|woodright-staging-storefront-*)
        wr_env_die "staging must not select public_demo container '$name'"
        return 1
        ;;
    esac
  fi

  owner="$(docker inspect --format '{{index .Config.Labels "com.woodright.deployment-owner"}}' "$name" 2>/dev/null || true)"
  role="$(docker inspect --format '{{index .Config.Labels "com.woodright.runtime-role"}}' "$name" 2>/dev/null || true)"
  exposure="$(docker inspect --format '{{index .Config.Labels "com.woodright.exposure"}}' "$name" 2>/dev/null || true)"
  title="$(docker inspect --format '{{index .Config.Labels "org.opencontainers.image.title"}}' "$name" 2>/dev/null || true)"
  compose="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$name" 2>/dev/null || true)"
  db_alias="$(docker inspect --format '{{index .Config.Labels "com.woodright.database-identity"}}' "$name" 2>/dev/null || true)"
  if [[ -z "$db_alias" ]]; then
    db_alias="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$name" 2>/dev/null | awk -F= '/^WOODRIGHT_DATABASE_IDENTITY_ALIAS=/{print $2; exit}')"
  fi
  if [[ -z "$exposure" ]]; then
    exposure="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$name" 2>/dev/null | awk -F= '/^WOODRIGHT_EXPOSURE=/{print $2; exit}')"
  fi

  if [[ -n "${WOODRIGHT_REQUIRED_OWNER_LABEL:-}" && "$owner" != "${WOODRIGHT_REQUIRED_OWNER_LABEL}" ]]; then
    wr_env_die "owner label mismatch for $name (have='$owner' want='${WOODRIGHT_REQUIRED_OWNER_LABEL}')"
    return 1
  fi
  required_role="${WOODRIGHT_REQUIRED_RUNTIME_ROLE:-}"
  if [[ -n "$required_role" && "$role" != "$required_role" ]]; then
    wr_env_die "runtime-role mismatch for $name (have='$role' want='$required_role')"
    return 1
  fi
  if [[ -n "${WOODRIGHT_REQUIRED_EXPOSURE:-}" && -n "$exposure" && "$exposure" != "${WOODRIGHT_REQUIRED_EXPOSURE}" ]]; then
    wr_env_die "exposure mismatch for $name (have='$exposure' want='${WOODRIGHT_REQUIRED_EXPOSURE}')"
    return 1
  fi
  if [[ -n "${WOODRIGHT_REQUIRED_DB_ALIAS:-}" ]]; then
    if [[ -z "$db_alias" ]]; then
      wr_env_die "DB alias missing for $name (want='${WOODRIGHT_REQUIRED_DB_ALIAS}')"
      return 1
    fi
    if [[ "$db_alias" != "${WOODRIGHT_REQUIRED_DB_ALIAS}" ]]; then
      wr_env_die "DB alias mismatch for $name (have='$db_alias' want='${WOODRIGHT_REQUIRED_DB_ALIAS}')"
      return 1
    fi
  fi
  if [[ "$kind" == "backend" && -n "${WOODRIGHT_REQUIRED_BE_TITLE:-}" && "$title" != "${WOODRIGHT_REQUIRED_BE_TITLE}" ]]; then
    wr_env_die "title mismatch for $name"
    return 1
  fi
  if [[ "$kind" == "storefront" && -n "${WOODRIGHT_REQUIRED_SF_TITLE:-}" && "$title" != "${WOODRIGHT_REQUIRED_SF_TITLE}" ]]; then
    wr_env_die "title mismatch for $name"
    return 1
  fi
  if [[ -n "${WOODRIGHT_COMPOSE_PROJECT:-}" ]]; then
    if [[ "${WOODRIGHT_REQUIRE_COMPOSE_LABEL:-0}" == "1" ]]; then
      if [[ -z "$compose" ]]; then
        wr_env_die "compose project label missing on $name (want='${WOODRIGHT_COMPOSE_PROJECT}')"
        return 1
      fi
    fi
    if [[ -n "$compose" && "$compose" != "${WOODRIGHT_COMPOSE_PROJECT}" ]]; then
      wr_env_die "compose project mismatch for $name (have='$compose' want='${WOODRIGHT_COMPOSE_PROJECT}')"
      return 1
    fi
  fi
  return 0
}

wr_assert_manifest_path_for_environment() {
  local path="$1"
  [[ "${WOODRIGHT_ENV_PROFILE_LOADED:-0}" == "1" ]] || { wr_env_die "profile not loaded"; return 1; }
  local root="${WOODRIGHT_OWNERSHIP_DIR%/}"
  case "$path" in
    "$root"/*) return 0 ;;
    *) wr_env_die "manifest path '$path' outside ownership dir '$root' for environment=${WOODRIGHT_ENVIRONMENT}"; return 1 ;;
  esac
}

wr_assert_identity_path_for_environment() {
  local path="$1"
  [[ "${WOODRIGHT_ENV_PROFILE_LOADED:-0}" == "1" ]] || { wr_env_die "profile not loaded"; return 1; }
  local root="${WOODRIGHT_IDENTITY_DIR%/}"
  [[ -n "$root" ]] || { wr_env_die "WOODRIGHT_IDENTITY_DIR unset"; return 1; }
  case "$path" in
    "$root"/*) return 0 ;;
    *) wr_env_die "identity path '$path' outside identity dir '$root' for environment=${WOODRIGHT_ENVIRONMENT}"; return 1 ;;
  esac
}

wr_assert_media_volume_for_environment() {
  local vol="$1"
  [[ "${WOODRIGHT_ENV_PROFILE_LOADED:-0}" == "1" ]] || { wr_env_die "profile not loaded"; return 1; }
  [[ "$vol" == "${WOODRIGHT_MEDIA_VOLUME}" ]] || {
    wr_env_die "media volume mismatch have='$vol' want='${WOODRIGHT_MEDIA_VOLUME}'"
    return 1
  }
}

wr_assert_compose_paths_for_environment() {
  local env_file="${1:-${WOODRIGHT_COMPOSE_ENV_FILE:-}}"
  local compose_file="${2:-${WOODRIGHT_COMPOSE_FILE:-}}"
  [[ "${WOODRIGHT_ENV_PROFILE_LOADED:-0}" == "1" ]] || { wr_env_die "profile not loaded"; return 1; }
  if [[ "${WOODRIGHT_PIN_RECONCILE_ALLOW_TEST_LOCK:-}" == "1" || "${WOODRIGHT_ENV_STRICT_PATHS:-1}" == "0" ]]; then
    return 0
  fi
  if [[ -n "${WOODRIGHT_COMPOSE_ENV_FILE:-}" && -n "$env_file" && "$env_file" != "${WOODRIGHT_COMPOSE_ENV_FILE}" ]]; then
    wr_env_die "compose env path mismatch have='$env_file' want='${WOODRIGHT_COMPOSE_ENV_FILE}'"
    return 1
  fi
  if [[ -n "${WOODRIGHT_COMPOSE_FILE:-}" && -n "$compose_file" && "$compose_file" != "${WOODRIGHT_COMPOSE_FILE}" ]]; then
    wr_env_die "compose file path mismatch have='$compose_file' want='${WOODRIGHT_COMPOSE_FILE}'"
    return 1
  fi
  return 0
}

# Pre-lock: registry pins vs live defaults (no flock yet).
wr_prelock_validate_environment_target() {
  local be sf
  wr_assert_environment_provisioned || return 1
  be="${WOODRIGHT_BE_CONTAINER_DEFAULT:?}"
  sf="${WOODRIGHT_SF_CONTAINER_DEFAULT:?}"
  wr_assert_compose_paths_for_environment || return 1
  if command -v docker >/dev/null 2>&1; then
    if docker inspect "$be" >/dev/null 2>&1; then
      wr_assert_container_matches_environment "$be" backend || return 1
    fi
    if docker inspect "$sf" >/dev/null 2>&1; then
      wr_assert_container_matches_environment "$sf" storefront || return 1
    fi
  fi
  return 0
}
