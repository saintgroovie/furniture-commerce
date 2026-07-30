#!/usr/bin/env bash
# Shared read-only runtime discovery for Woodright public_demo pair.
# Source from backup/monitor/release scripts. Never mutates Docker/runtime.
# shellcheck shell=bash
#
# Exports on success:
#   WR_DISCOVERY_VERDICT=DISCOVERY_OK
#   WR_BE_CONTAINER / WR_SF_CONTAINER (name)
# Prints container name on stdout for wr_discover_backend_container / wr_discover_storefront_container.
#
# Verdicts (stderr + WR_DISCOVERY_VERDICT):
#   DISCOVERY_OK | DISCOVERY_ZERO_MATCH | DISCOVERY_MULTIPLE_MATCH
#   DIGEST_MISMATCH | OWNER_MISMATCH | MEDIA_MOUNT_MISSING | MEDIA_VOLUME_MISMATCH
#   CONTAINER_UNHEALTHY | ROLE_MISMATCH | NAME_EXCLUDED | CONTAINER_MISSING

: "${WOODRIGHT_ACTIVE_OWNER:=/srv/woodright/runtime-ownership/ACTIVE_OWNER.json}"
: "${WOODRIGHT_EXPECTED_RELEASE:=/srv/woodright/runtime-ownership/EXPECTED_RELEASE.json}"
: "${WOODRIGHT_MEDIA_VOLUME:=woodright-stack-3dsdhd_woodright_staging_media}"
: "${WOODRIGHT_MEDIA_MOUNT_IN_BE:=/server/static}"
: "${WOODRIGHT_REQUIRE_MEDIA_MOUNT:=1}"
: "${WOODRIGHT_REQUIRE_PUBLIC_DEMO:=1}"
: "${WOODRIGHT_REQUIRE_EXPECTED_DIGEST:=1}"
# Optional explicit pin for digest-advance / post-promote (overrides EXPECTED_RELEASE file).
# When set, WOODRIGHT_REQUIRE_EXPECTED_DIGEST must be 1 for the pin check to run.
: "${WOODRIGHT_PINNED_BACKEND_DIGEST:=}"
: "${WOODRIGHT_PINNED_GIT_SHA:=}"

wr_discovery_log() { printf '%s\n' "$*" >&2; }

wr_discovery_set_verdict() {
  WR_DISCOVERY_VERDICT="$1"
  wr_discovery_log "WR_DISCOVERY_VERDICT=$1${2:+ detail=$2}"
}

wr_name_is_excluded() {
  local n="$1"
  [[ "$n" =~ (rollback|keeper|candidate|STOPPED|stopped) ]]
}

wr_json_get() {
  # wr_json_get <file> <key> — empty if missing/unreadable
  local f="$1" k="$2"
  [[ -f "$f" ]] || return 0
  python3 - "$f" "$k" <<'PY' 2>/dev/null || true
import json,sys
try:
  d=json.load(open(sys.argv[1]))
except Exception:
  sys.exit(0)
print(d.get(sys.argv[2]) or "")
PY
}

wr_container_exists() {
  docker inspect "$1" >/dev/null 2>&1
}

wr_container_running() {
  local st
  st=$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null || echo false)
  [[ "$st" == "true" ]]
}

wr_container_health_ok() {
  local h
  h=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$1" 2>/dev/null || echo missing)
  [[ "$h" == "healthy" || "$h" == "none" ]]
}

wr_container_label() {
  docker inspect -f "{{index .Config.Labels \"$2\"}}" "$1" 2>/dev/null || true
}

wr_container_image_id() {
  docker inspect -f '{{.Image}}' "$1" 2>/dev/null || true
}

wr_container_mount_name_at() {
  local c="$1" dest="$2"
  docker inspect "$c" --format '{{json .Mounts}}' 2>/dev/null \
    | python3 -c 'import json,sys
dest=sys.argv[1]
try:
  mounts=json.load(sys.stdin)
except Exception:
  print("", end=""); raise SystemExit(0)
print(next((m.get("Name") or "") for m in mounts if m.get("Destination")==dest), end="")' "$dest"
}

wr_container_mount_rw_at() {
  local c="$1" dest="$2"
  docker inspect "$c" --format '{{json .Mounts}}' 2>/dev/null \
    | python3 -c 'import json,sys
dest=sys.argv[1]
try:
  mounts=json.load(sys.stdin)
except Exception:
  print("false", end=""); raise SystemExit(0)
m=next((m for m in mounts if m.get("Destination")==dest), None)
print("true" if m and m.get("RW") else "false", end="")' "$dest"
}

# Validate a single named backend candidate. Sets WR_DISCOVERY_VERDICT.
# Returns 0 on DISCOVERY_OK.
wr_validate_backend_candidate() {
  local name="$1"
  local owner role img expected_digest expected_sha mount_name rw

  if ! wr_container_exists "$name"; then
    wr_discovery_set_verdict CONTAINER_MISSING "$name"
    return 1
  fi
  if wr_name_is_excluded "$name"; then
    wr_discovery_set_verdict NAME_EXCLUDED "$name"
    return 1
  fi
  if ! wr_container_running "$name"; then
    wr_discovery_set_verdict CONTAINER_UNHEALTHY "not_running:$name"
    return 1
  fi
  if ! wr_container_health_ok "$name"; then
    wr_discovery_set_verdict CONTAINER_UNHEALTHY "$name"
    return 1
  fi

  owner=$(wr_container_label "$name" "com.woodright.deployment-owner")
  if [[ "$owner" != "Dokploy" ]]; then
    wr_discovery_set_verdict OWNER_MISMATCH "owner=${owner:-empty}"
    return 1
  fi

  if [[ "${WOODRIGHT_REQUIRE_PUBLIC_DEMO}" == "1" ]]; then
    role=$(wr_container_label "$name" "com.woodright.runtime-role")
    if [[ "$role" != "public_demo" ]]; then
      wr_discovery_set_verdict ROLE_MISMATCH "role=${role:-empty}"
      return 1
    fi
  fi

  if [[ "${WOODRIGHT_REQUIRE_EXPECTED_DIGEST}" == "1" ]]; then
    if [[ -n "${WOODRIGHT_PINNED_BACKEND_DIGEST}" ]]; then
      expected_digest="$WOODRIGHT_PINNED_BACKEND_DIGEST"
      expected_sha="${WOODRIGHT_PINNED_GIT_SHA:-}"
    elif [[ -f "$WOODRIGHT_EXPECTED_RELEASE" ]]; then
      expected_digest=$(wr_json_get "$WOODRIGHT_EXPECTED_RELEASE" backend_digest)
      expected_sha=$(wr_json_get "$WOODRIGHT_EXPECTED_RELEASE" approved_git_sha)
    else
      expected_digest=""
      expected_sha=""
    fi
    if [[ -z "$expected_digest" || ! "$expected_digest" =~ ^sha256:[0-9a-f]{64}$ ]]; then
      wr_discovery_set_verdict DIGEST_MISMATCH "expected_backend_digest_missing"
      return 1
    fi
    # Git SHA required when pinning via EXPECTED_RELEASE; optional when only digest pin is set
    # for mid-promotion post-gate (SHA checked when WOODRIGHT_PINNED_GIT_SHA is non-empty).
    if [[ -z "${WOODRIGHT_PINNED_BACKEND_DIGEST}" ]]; then
      if [[ -z "$expected_sha" || ! "$expected_sha" =~ ^[0-9a-f]{40}$ ]]; then
        wr_discovery_set_verdict DIGEST_MISMATCH "expected_git_sha_missing"
        return 1
      fi
    elif [[ -n "$expected_sha" && ! "$expected_sha" =~ ^[0-9a-f]{40}$ ]]; then
      wr_discovery_set_verdict DIGEST_MISMATCH "pinned_git_sha_invalid"
      return 1
    fi
    img=$(wr_container_image_id "$name")
    if [[ "$img" != "$expected_digest" ]]; then
      # Also accept when Image Id equals resolved Id for the pinned digest ref.
      local resolved=""
      resolved=$(docker image inspect "$expected_digest" --format '{{.Id}}' 2>/dev/null || true)
      if [[ -z "$resolved" || "$img" != "$resolved" ]]; then
        wr_discovery_set_verdict DIGEST_MISMATCH "have=${img:0:19}… want=${expected_digest:0:19}…"
        return 1
      fi
    fi
    if [[ -n "$expected_sha" ]]; then
      local rev
      rev=$(wr_container_label "$name" "org.opencontainers.image.revision")
      if [[ -z "$rev" || "$rev" != "$expected_sha" ]]; then
        wr_discovery_set_verdict DIGEST_MISMATCH "oci_rev_mismatch"
        return 1
      fi
    fi
  fi

  if [[ "${WOODRIGHT_REQUIRE_MEDIA_MOUNT}" == "1" ]]; then
    mount_name=$(wr_container_mount_name_at "$name" "$WOODRIGHT_MEDIA_MOUNT_IN_BE")
    if [[ -z "$mount_name" ]]; then
      wr_discovery_set_verdict MEDIA_MOUNT_MISSING "$WOODRIGHT_MEDIA_MOUNT_IN_BE"
      return 1
    fi
    if [[ "$mount_name" != "$WOODRIGHT_MEDIA_VOLUME" ]]; then
      wr_discovery_set_verdict MEDIA_VOLUME_MISMATCH "got=$mount_name"
      return 1
    fi
    rw=$(wr_container_mount_rw_at "$name" "$WOODRIGHT_MEDIA_MOUNT_IN_BE")
    if [[ "$rw" != "true" ]]; then
      wr_discovery_set_verdict MEDIA_VOLUME_MISMATCH "mount_not_rw"
      return 1
    fi
  fi

  wr_discovery_set_verdict DISCOVERY_OK "$name"
  return 0
}

wr_validate_storefront_candidate() {
  local name="$1"
  local owner role img expected_digest expected_sha
  # Storefront: no media mount requirement
  local WOODRIGHT_REQUIRE_MEDIA_MOUNT=0

  if ! wr_container_exists "$name"; then
    wr_discovery_set_verdict CONTAINER_MISSING "$name"
    return 1
  fi
  if wr_name_is_excluded "$name"; then
    wr_discovery_set_verdict NAME_EXCLUDED "$name"
    return 1
  fi
  if ! wr_container_running "$name"; then
    wr_discovery_set_verdict CONTAINER_UNHEALTHY "not_running:$name"
    return 1
  fi
  if ! wr_container_health_ok "$name"; then
    wr_discovery_set_verdict CONTAINER_UNHEALTHY "$name"
    return 1
  fi
  owner=$(wr_container_label "$name" "com.woodright.deployment-owner")
  if [[ "$owner" != "Dokploy" ]]; then
    wr_discovery_set_verdict OWNER_MISMATCH "owner=${owner:-empty}"
    return 1
  fi
  if [[ "${WOODRIGHT_REQUIRE_PUBLIC_DEMO}" == "1" ]]; then
    role=$(wr_container_label "$name" "com.woodright.runtime-role")
    if [[ "$role" != "public_demo" ]]; then
      wr_discovery_set_verdict ROLE_MISMATCH "role=${role:-empty}"
      return 1
    fi
  fi
  if [[ "${WOODRIGHT_REQUIRE_EXPECTED_DIGEST}" == "1" && -f "$WOODRIGHT_EXPECTED_RELEASE" ]]; then
    expected_digest=$(wr_json_get "$WOODRIGHT_EXPECTED_RELEASE" storefront_digest)
    expected_sha=$(wr_json_get "$WOODRIGHT_EXPECTED_RELEASE" approved_git_sha)
    if [[ -z "$expected_digest" || ! "$expected_digest" =~ ^sha256:[0-9a-f]{64}$ ]]; then
      wr_discovery_set_verdict DIGEST_MISMATCH "expected_storefront_digest_missing"
      return 1
    fi
    if [[ -z "$expected_sha" || ! "$expected_sha" =~ ^[0-9a-f]{40}$ ]]; then
      wr_discovery_set_verdict DIGEST_MISMATCH "expected_git_sha_missing"
      return 1
    fi
    img=$(wr_container_image_id "$name")
    if [[ "$img" != "$expected_digest" ]]; then
      wr_discovery_set_verdict DIGEST_MISMATCH "sf_digest"
      return 1
    fi
    local rev
    rev=$(wr_container_label "$name" "org.opencontainers.image.revision")
    if [[ -z "$rev" || "$rev" != "$expected_sha" ]]; then
      wr_discovery_set_verdict DIGEST_MISMATCH "sf_oci_rev"
      return 1
    fi
  fi
  wr_discovery_set_verdict DISCOVERY_OK "$name"
  return 0
}

wr_list_env_scoped_backend_names() {
  # Environment-scoped listing when profile loaded; else legacy public_demo (staging-implicit).
  local id name owner role title compose prefix want_owner want_role want_title want_compose
  prefix="${WOODRIGHT_BE_NAME_PREFIX:-woodright-staging-}"
  want_owner="${WOODRIGHT_REQUIRED_OWNER_LABEL:-Dokploy}"
  want_role="${WOODRIGHT_REQUIRED_RUNTIME_ROLE-public_demo}"
  want_title="${WOODRIGHT_REQUIRED_BE_TITLE:-woodright-backend}"
  want_compose="${WOODRIGHT_COMPOSE_PROJECT-}"
  while read -r id; do
    [[ -n "$id" ]] || continue
    name=$(docker inspect -f '{{.Name}}' "$id" | sed 's#^/##')
    wr_name_is_excluded "$name" && continue
    case "$name" in
      ${prefix}*) ;;
      *) continue ;;
    esac
    owner=$(wr_container_label "$id" "com.woodright.deployment-owner")
    role=$(wr_container_label "$id" "com.woodright.runtime-role")
    title=$(wr_container_label "$id" "org.opencontainers.image.title")
    compose=$(wr_container_label "$id" "com.docker.compose.project")
    [[ "$owner" == "$want_owner" ]] || continue
    if [[ -n "$want_role" ]]; then
      [[ "$role" == "$want_role" ]] || continue
    fi
    [[ "$title" == "$want_title" ]] || continue
    if [[ -n "$want_compose" ]]; then
      if [[ "${WOODRIGHT_REQUIRE_COMPOSE_LABEL:-0}" == "1" && -z "$compose" ]]; then
        continue
      fi
      if [[ -n "$compose" && "$compose" != "$want_compose" ]]; then
        continue
      fi
    fi
    printf '%s\n' "$name"
  done < <(docker ps -q)
}

wr_list_public_demo_backend_names() {
  # Backward-compatible name; delegates to env-scoped listing (defaults = staging/public_demo).
  wr_list_env_scoped_backend_names
}

wr_list_env_scoped_storefront_names() {
  local id name owner role title compose prefix want_owner want_role want_title want_compose
  prefix="${WOODRIGHT_SF_NAME_PREFIX:-woodright-staging-}"
  want_owner="${WOODRIGHT_REQUIRED_OWNER_LABEL:-Dokploy}"
  want_role="${WOODRIGHT_REQUIRED_RUNTIME_ROLE-public_demo}"
  want_title="${WOODRIGHT_REQUIRED_SF_TITLE:-woodright-storefront}"
  want_compose="${WOODRIGHT_COMPOSE_PROJECT-}"
  while read -r id; do
    [[ -n "$id" ]] || continue
    name=$(docker inspect -f '{{.Name}}' "$id" | sed 's#^/##')
    wr_name_is_excluded "$name" && continue
    case "$name" in
      ${prefix}*) ;;
      *) continue ;;
    esac
    owner=$(wr_container_label "$id" "com.woodright.deployment-owner")
    role=$(wr_container_label "$id" "com.woodright.runtime-role")
    title=$(wr_container_label "$id" "org.opencontainers.image.title")
    compose=$(wr_container_label "$id" "com.docker.compose.project")
    [[ "$owner" == "$want_owner" ]] || continue
    if [[ -n "$want_role" ]]; then
      [[ "$role" == "$want_role" ]] || continue
    fi
    [[ "$title" == "$want_title" ]] || continue
    if [[ -n "$want_compose" ]]; then
      if [[ "${WOODRIGHT_REQUIRE_COMPOSE_LABEL:-0}" == "1" && -z "$compose" ]]; then
        continue
      fi
      if [[ -n "$compose" && "$compose" != "$want_compose" ]]; then
        continue
      fi
    fi
    printf '%s\n' "$name"
  done < <(docker ps -q)
}

wr_list_public_demo_storefront_names() {
  wr_list_env_scoped_storefront_names
}

wr_masked_backend_inventory() {
  # Names + owner/role/image-title only (no env secrets).
  local id name
  while read -r id; do
    name=$(docker inspect -f '{{.Name}}' "$id" 2>/dev/null | sed 's#^/##' || true)
    [[ -n "$name" ]] || continue
    printf 'candidate name=%s owner=%s role=%s title=%s running=%s\n' \
      "$name" \
      "$(wr_container_label "$id" "com.woodright.deployment-owner")" \
      "$(wr_container_label "$id" "com.woodright.runtime-role")" \
      "$(wr_container_label "$id" "org.opencontainers.image.title")" \
      "$(docker inspect -f '{{.State.Running}}' "$id" 2>/dev/null || echo false)" >&2
  done < <(docker ps -aq)
}

# Resolve backend container name into WR_BE_CONTAINER (no stdout capture required).
# Returns 0 on OK. Also prints name for convenience when stdout is a TTY/pipe without capture loss of vars —
# prefer calling without command substitution so WR_DISCOVERY_VERDICT remains in-shell.
wr_discover_backend_container() {
  local override="${WOODRIGHT_BE_CONTAINER:-}"
  local from_owner=""
  local -a matches=()
  local m

  WR_BE_CONTAINER=""

  if [[ -n "$override" ]]; then
    if [[ "${WOODRIGHT_ENV_PROFILE_LOADED:-0}" == "1" ]]; then
      # shellcheck source=woodright-environment-profile.sh
      if declare -F wr_assert_container_matches_environment >/dev/null 2>&1; then
        wr_assert_container_matches_environment "$override" backend || return 1
      fi
    fi
    if wr_validate_backend_candidate "$override"; then
      WR_BE_CONTAINER="$override"
      printf '%s\n' "$override"
      return 0
    fi
    return 1
  fi

  if [[ -f "$WOODRIGHT_ACTIVE_OWNER" ]]; then
    from_owner=$(wr_json_get "$WOODRIGHT_ACTIVE_OWNER" be_container)
    if [[ -n "$from_owner" ]]; then
      if [[ "${WOODRIGHT_ENV_PROFILE_LOADED:-0}" == "1" ]] && declare -F wr_assert_container_matches_environment >/dev/null 2>&1; then
        if ! wr_assert_container_matches_environment "$from_owner" backend; then
          wr_discovery_log "ACTIVE_OWNER be_container rejected by environment profile"
          from_owner=""
        fi
      fi
      if [[ -n "$from_owner" ]] && wr_validate_backend_candidate "$from_owner"; then
        WR_BE_CONTAINER="$from_owner"
        printf '%s\n' "$from_owner"
        return 0
      fi
      wr_discovery_log "ACTIVE_OWNER be_container failed validation; scanning labels"
    fi
  fi

  while read -r m; do
    [[ -n "$m" ]] || continue
    if wr_validate_backend_candidate "$m"; then
      matches+=("$m")
    fi
  done < <(wr_list_env_scoped_backend_names)

  if [[ "${#matches[@]}" -eq 0 ]]; then
    wr_discovery_set_verdict DISCOVERY_ZERO_MATCH
    wr_masked_backend_inventory || true
    return 1
  fi
  if [[ "${#matches[@]}" -gt 1 ]]; then
    wr_discovery_set_verdict DISCOVERY_MULTIPLE_MATCH "count=${#matches[@]}"
    printf 'matches: %s\n' "${matches[*]}" >&2
    return 1
  fi

  WR_BE_CONTAINER="${matches[0]}"
  wr_discovery_set_verdict DISCOVERY_OK "$WR_BE_CONTAINER"
  printf '%s\n' "$WR_BE_CONTAINER"
  return 0
}

wr_discover_storefront_container() {
  local override="${WOODRIGHT_SF_CONTAINER:-}"
  local from_owner=""
  local -a matches=()
  local m

  WR_SF_CONTAINER=""

  if [[ -n "$override" ]]; then
    if [[ "${WOODRIGHT_ENV_PROFILE_LOADED:-0}" == "1" ]] && declare -F wr_assert_container_matches_environment >/dev/null 2>&1; then
      wr_assert_container_matches_environment "$override" storefront || return 1
    fi
    if wr_validate_storefront_candidate "$override"; then
      WR_SF_CONTAINER="$override"
      printf '%s\n' "$override"
      return 0
    fi
    return 1
  fi

  if [[ -f "$WOODRIGHT_ACTIVE_OWNER" ]]; then
    from_owner=$(wr_json_get "$WOODRIGHT_ACTIVE_OWNER" sf_container)
    if [[ -n "$from_owner" ]]; then
      if [[ "${WOODRIGHT_ENV_PROFILE_LOADED:-0}" == "1" ]] && declare -F wr_assert_container_matches_environment >/dev/null 2>&1; then
        wr_assert_container_matches_environment "$from_owner" storefront || from_owner=""
      fi
      if [[ -n "$from_owner" ]] && wr_validate_storefront_candidate "$from_owner"; then
        WR_SF_CONTAINER="$from_owner"
        printf '%s\n' "$from_owner"
        return 0
      fi
    fi
  fi

  while read -r m; do
    [[ -n "$m" ]] || continue
    if wr_validate_storefront_candidate "$m"; then
      matches+=("$m")
    fi
  done < <(wr_list_env_scoped_storefront_names)

  if [[ "${#matches[@]}" -eq 0 ]]; then
    wr_discovery_set_verdict DISCOVERY_ZERO_MATCH
    return 1
  fi
  if [[ "${#matches[@]}" -gt 1 ]]; then
    wr_discovery_set_verdict DISCOVERY_MULTIPLE_MATCH "count=${#matches[@]}"
    return 1
  fi
  WR_SF_CONTAINER="${matches[0]}"
  wr_discovery_set_verdict DISCOVERY_OK "$WR_SF_CONTAINER"
  printf '%s\n' "$WR_SF_CONTAINER"
  return 0
}
