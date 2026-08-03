#!/usr/bin/env bash
# Compose-safe service recreate helpers for Woodright pair cutover.
# Never rename a Compose-managed live container into a "keeper": Compose discovers
# services by labels, not only by container_name, so rename+up can exit 0 without
# recreating the canonical name (and force-recreate after rename adopts/destroys
# the keeper). Rollback authority is pin/image refs, not renamed containers.
#
# shellcheck shell=bash
# Source from cutover helpers; do not execute alone.

wr_compose_assert_not_rename_keeper_strategy() {
  # Documentation / static guard hook. Call sites that still rename must not
  # feed the renamed container back into `docker compose up` for the same
  # project/service.
  return 0
}

# Run: docker compose ... up -d --no-deps --force-recreate <service>
# Extra compose args may be passed after the service name via the caller binding
# WR_COMPOSE_UP_FN to an environment-specific wrapper.
wr_compose_force_recreate_service() {
  local service="${1:?service required}"
  if declare -F wr_compose_up_impl >/dev/null 2>&1; then
    wr_compose_up_impl "$service" --force-recreate
    return $?
  fi
  echo "ERROR: wr_compose_up_impl not defined by caller" >&2
  return 2
}

# Postconditions after recreate. Args:
#   $1 service name (compose)
#   $2 canonical container name
#   $3 previous container ID (full or 12+) — must differ after recreate
#   $4 optional want digest (sha256:…) — if set, RepoDigest must match
#   $5 optional compose project name — if set, label must match
wr_compose_verify_recreate_postconditions() {
  local service="${1:?}"
  local name="${2:?}"
  local prev_id="${3:-}"
  local want_digest="${4:-}"
  local want_project="${5:-}"
  local docker_bin="${WOODRIGHT_DOCKER_BIN:-docker}"
  local new_id labels project_lbl service_lbl

  if ! "$docker_bin" inspect "$name" >/dev/null 2>&1; then
    echo "ERROR: canonical container missing after recreate: $name" >&2
    return 1
  fi

  new_id="$("$docker_bin" inspect --format '{{.Id}}' "$name")"
  if [[ -n "$prev_id" && "$new_id" == "$prev_id" ]]; then
    echo "ERROR: container ID unchanged after recreate (compose likely no-op): $name" >&2
    return 1
  fi

  project_lbl="$("$docker_bin" inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$name" 2>/dev/null || true)"
  service_lbl="$("$docker_bin" inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' "$name" 2>/dev/null || true)"
  if [[ -z "$service_lbl" ]]; then
    echo "ERROR: missing com.docker.compose.service on $name" >&2
    return 1
  fi
  if [[ "$service_lbl" != "$service" ]]; then
    echo "ERROR: compose service label mismatch on $name have=$service_lbl want=$service" >&2
    return 1
  fi
  if [[ -n "$want_project" && "$project_lbl" != "$want_project" ]]; then
    echo "ERROR: compose project label mismatch on $name have=$project_lbl want=$want_project" >&2
    return 1
  fi

  if [[ -n "$want_digest" ]]; then
    local img digests ok=0
    img="$("$docker_bin" inspect --format '{{.Image}}' "$name")"
    digests="$("$docker_bin" image inspect "$img" --format '{{range .RepoDigests}}{{println .}}{{end}}' 2>/dev/null || true)"
    if [[ "$img" == "$want_digest" || "$img" == *"${want_digest#sha256:}"* ]]; then
      ok=1
    fi
    if [[ "$digests" == *"$want_digest"* ]]; then
      ok=1
    fi
    if [[ "$ok" -ne 1 ]]; then
      echo "ERROR: digest mismatch on $name image='$img' digests='$(echo "$digests" | tr '\n' ' ')' want=$want_digest" >&2
      return 1
    fi
  fi

  return 0
}

# Refuse if a renamed keeper still carries compose service ownership for this service.
wr_compose_assert_no_service_owned_keeper() {
  local project="${1:?}"
  local service="${2:?}"
  local canonical="${3:?}"
  local docker_bin="${WOODRIGHT_DOCKER_BIN:-docker}"
  local id name proj svc ps_out
  local -a ids=()

  # Fail closed if enumeration fails (do not treat a broken `docker ps` as
  # "no colliding keepers").
  if ! ps_out="$("$docker_bin" ps -aq \
      --filter "label=com.docker.compose.project=${project}" \
      --filter "label=com.docker.compose.service=${service}" 2>/dev/null)"; then
    echo "ERROR: docker ps failed while enumerating compose service $project/$service" >&2
    return 1
  fi
  while IFS= read -r id; do
    [[ -n "$id" ]] || continue
    ids+=("$id")
  done <<<"$ps_out"

  for id in "${ids[@]}"; do
    name="$("$docker_bin" inspect --format '{{.Name}}' "$id" | sed 's#^/##')"
    [[ "$name" == "$canonical" ]] && continue
    proj="$("$docker_bin" inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$id" 2>/dev/null || true)"
    svc="$("$docker_bin" inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' "$id" 2>/dev/null || true)"
    if [[ "$proj" == "$project" && "$svc" == "$service" ]]; then
      echo "ERROR: non-canonical container '$name' still owns compose service $project/$service" >&2
      return 1
    fi
  done
  return 0
}
