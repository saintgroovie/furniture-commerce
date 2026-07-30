#!/usr/bin/env bash
# Explicit environment profile loader for Woodright release governance.
# CLI argument --environment is the authority. Inherited env alone cannot select.
#
# Usage:
#   source ops/lib/woodright-environment-profile.sh
#   wr_require_environment_from_args "$@"
#   # or: wr_load_environment_profile staging
#
# Fail-closed: missing/unknown/path-traversal/untracked profile → non-zero.
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
    staging|production) return 0 ;;
    *) return 1 ;;
  esac
}

wr_resolve_environment_profile_path() {
  local env_name="$1"
  local base resolved
  wr_environment_allowed_name "$env_name" || return 1
  # Refuse path traversal / absolute injection via env name
  [[ "$env_name" != *..* && "$env_name" != */* && "$env_name" != *\\* ]] || return 1
  base="${WOODRIGHT_ENV_PROFILE_DIR%/}/${env_name}.conf"
  if command -v realpath >/dev/null 2>&1; then
    resolved="$(realpath "$base" 2>/dev/null || true)"
  else
    resolved="$(cd "$(dirname "$base")" 2>/dev/null && printf '%s/%s\n' "$(pwd -P)" "$(basename "$base")")"
  fi
  [[ -n "$resolved" && -f "$resolved" ]] || return 1
  # Must stay under profile dir
  case "$resolved" in
    "${WOODRIGHT_ENV_PROFILE_DIR%/}"/*) printf '%s\n' "$resolved"; return 0 ;;
    *) return 1 ;;
  esac
}

wr_load_environment_profile() {
  local env_name="${1:-}"
  local profile path key val
  [[ -n "$env_name" ]] || { wr_env_die "environment required (no default)"; return 1; }
  wr_environment_allowed_name "$env_name" || { wr_env_die "unknown environment='$env_name' (allowed: staging|production)"; return 1; }

  # Inherited WOODRIGHT_ENVIRONMENT that conflicts with explicit selection → FAIL
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
  # Only KEY=VALUE lines; ignore comments/blank
  # shellcheck source=/dev/null
  source "$path"
  set +a

  export WOODRIGHT_ENVIRONMENT="$env_name"
  export WOODRIGHT_ENV_PROFILE_PATH="$path"
  export WOODRIGHT_ENV_PROFILE_LOADED=1

  # Apply ownership/lock/media defaults from profile into discovery vars
  export WOODRIGHT_ACTIVE_OWNER="${WOODRIGHT_ACTIVE_OWNER}"
  export WOODRIGHT_EXPECTED_RELEASE="${WOODRIGHT_EXPECTED_RELEASE}"
  export WOODRIGHT_MEDIA_VOLUME="${WOODRIGHT_MEDIA_VOLUME}"
  export WOODRIGHT_MEDIA_MOUNT_IN_BE="${WOODRIGHT_MEDIA_MOUNT_IN_BE:-/server/static}"
  export WR_STAGING_MUTATION_LOCK_PATH="${WOODRIGHT_MUTATION_LOCK_PATH}"
  export WR_STAGING_MUTATION_LOCK_META="${WOODRIGHT_MUTATION_LOCK_PATH}.meta"

  # Role gate: staging requires public_demo label; production_candidate uses name/compose pins
  if [[ -n "${WOODRIGHT_REQUIRED_RUNTIME_ROLE:-}" ]]; then
    export WOODRIGHT_REQUIRE_PUBLIC_DEMO=1
  else
    export WOODRIGHT_REQUIRE_PUBLIC_DEMO=0
  fi

  wr_env_log "loaded environment=$env_name class=${WOODRIGHT_ENVIRONMENT_CLASS:-} profile=$path lock=${WOODRIGHT_MUTATION_LOCK_PATH}"
  return 0
}

# Parse argv for --environment <name> or --environment=<name>.
# Does not consume other args; sets WR_PARSED_ENVIRONMENT.
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
    wr_env_die "missing required --environment <staging|production> (no default; inherited env is not authority)"
    return 1
  fi
  wr_load_environment_profile "$WR_PARSED_ENVIRONMENT"
}

# Opt-in: allow WOODRIGHT_ENVIRONMENT only when WOODRIGHT_ENV_FROM_ENV=1 AND value allowlisted.
wr_load_environment_from_opt_in_env() {
  if [[ "${WOODRIGHT_ENV_FROM_ENV:-0}" != "1" ]]; then
    wr_env_die "WOODRIGHT_ENV_FROM_ENV=1 required to load from environment variable"
    return 1
  fi
  local env_name="${WOODRIGHT_ENVIRONMENT:-}"
  [[ -n "$env_name" ]] || { wr_env_die "WOODRIGHT_ENVIRONMENT empty"; return 1; }
  wr_load_environment_profile "$env_name"
}

wr_assert_container_matches_environment() {
  local name="$1"
  local kind="${2:-backend}" # backend|storefront
  local owner role title compose prefix required_role
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

  owner="$(docker inspect -f '{{index .Config.Labels "com.woodright.deployment-owner"}}' "$name" 2>/dev/null || true)"
  role="$(docker inspect -f '{{index .Config.Labels "com.woodright.runtime-role"}}' "$name" 2>/dev/null || true)"
  title="$(docker inspect -f '{{index .Config.Labels "org.opencontainers.image.title"}}' "$name" 2>/dev/null || true)"
  compose="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$name" 2>/dev/null || true)"

  if [[ -n "${WOODRIGHT_REQUIRED_OWNER_LABEL:-}" && "$owner" != "${WOODRIGHT_REQUIRED_OWNER_LABEL}" ]]; then
    wr_env_die "owner label mismatch for $name (have='$owner' want='${WOODRIGHT_REQUIRED_OWNER_LABEL}')"
    return 1
  fi
  required_role="${WOODRIGHT_REQUIRED_RUNTIME_ROLE:-}"
  if [[ -n "$required_role" && "$role" != "$required_role" ]]; then
    wr_env_die "runtime-role mismatch for $name (have='$role' want='$required_role')"
    return 1
  fi
  if [[ "$kind" == "backend" && -n "${WOODRIGHT_REQUIRED_BE_TITLE:-}" && "$title" != "${WOODRIGHT_REQUIRED_BE_TITLE}" ]]; then
    wr_env_die "title mismatch for $name"
    return 1
  fi
  if [[ "$kind" == "storefront" && -n "${WOODRIGHT_REQUIRED_SF_TITLE:-}" && "$title" != "${WOODRIGHT_REQUIRED_SF_TITLE}" ]]; then
    wr_env_die "title mismatch for $name"
    return 1
  fi
  # Compose project pin
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

wr_assert_media_volume_for_environment() {
  local vol="$1"
  [[ "${WOODRIGHT_ENV_PROFILE_LOADED:-0}" == "1" ]] || { wr_env_die "profile not loaded"; return 1; }
  [[ "$vol" == "${WOODRIGHT_MEDIA_VOLUME}" ]] || {
    wr_env_die "media volume mismatch have='$vol' want='${WOODRIGHT_MEDIA_VOLUME}'"
    return 1
  }
}
