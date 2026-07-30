#!/usr/bin/env bash
# Component mutation authority: storefront | backend | pair
# Storefront-only freezes backend digest; backend-only freezes storefront.
# shellcheck shell=bash

wr_component_log() { printf '%s wr_component %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
wr_component_die() { wr_component_log "ERROR: $*"; return 1; }

wr_parse_component_arg() {
  WR_PARSED_COMPONENT=""
  local -a args=("$@")
  local i=0
  while [[ $i -lt ${#args[@]} ]]; do
    case "${args[$i]}" in
      --component)
        i=$((i + 1))
        WR_PARSED_COMPONENT="${args[$i]:-}"
        ;;
      --component=*)
        WR_PARSED_COMPONENT="${args[$i]#--component=}"
        ;;
    esac
    i=$((i + 1))
  done
  [[ -n "$WR_PARSED_COMPONENT" ]]
}

wr_require_component_from_args() {
  if ! wr_parse_component_arg "$@"; then
    wr_component_die "missing required --component <storefront|backend|pair>"
    return 1
  fi
  case "$WR_PARSED_COMPONENT" in
    storefront|backend|pair)
      export WOODRIGHT_COMPONENT_SCOPE="$WR_PARSED_COMPONENT"
      return 0
      ;;
    *)
      wr_component_die "unknown component='$WR_PARSED_COMPONENT' (allowed: storefront|backend|pair)"
      return 1
      ;;
  esac
}

wr_assert_component_scope() {
  local scope="${1:-${WOODRIGHT_COMPONENT_SCOPE:-}}"
  case "$scope" in
    storefront|backend|pair) export WOODRIGHT_COMPONENT_SCOPE="$scope"; return 0 ;;
    *) wr_component_die "component scope required (storefront|backend|pair)"; return 1 ;;
  esac
}

# Capture immutable backend expectation for storefront-only (digest ref).
wr_freeze_peer_digest() {
  local peer_kind="$1" # backend|storefront
  local container="$2"
  local digest
  digest="$(docker inspect "$container" --format '{{.Config.Image}}' 2>/dev/null || true)"
  if [[ ! "$digest" =~ @sha256:[0-9a-f]{64}$ ]]; then
    # Resolve via RepoDigests when Config.Image is short id
    digest="$(docker inspect "$container" --format '{{index .RepoDigests 0}}' 2>/dev/null || true)"
  fi
  if [[ ! "$digest" =~ sha256:[0-9a-f]{64} ]]; then
    wr_component_die "cannot freeze $peer_kind digest from $container"
    return 1
  fi
  if [[ "$peer_kind" == "backend" ]]; then
    export WOODRIGHT_FROZEN_BACKEND_DIGEST
    WOODRIGHT_FROZEN_BACKEND_DIGEST="$(printf '%s' "$digest" | grep -oE 'sha256:[0-9a-f]{64}' | head -1)"
    wr_component_log "frozen backend digest=${WOODRIGHT_FROZEN_BACKEND_DIGEST}"
  else
    export WOODRIGHT_FROZEN_STOREFRONT_DIGEST
    WOODRIGHT_FROZEN_STOREFRONT_DIGEST="$(printf '%s' "$digest" | grep -oE 'sha256:[0-9a-f]{64}' | head -1)"
    wr_component_log "frozen storefront digest=${WOODRIGHT_FROZEN_STOREFRONT_DIGEST}"
  fi
}

wr_assert_peer_unchanged() {
  local peer_kind="$1"
  local container="$2"
  local want have
  if [[ "$peer_kind" == "backend" ]]; then
    want="${WOODRIGHT_FROZEN_BACKEND_DIGEST:-}"
  else
    want="${WOODRIGHT_FROZEN_STOREFRONT_DIGEST:-}"
  fi
  [[ -n "$want" ]] || { wr_component_die "no frozen $peer_kind digest"; return 1; }
  have="$(docker inspect "$container" --format '{{.Config.Image}}' 2>/dev/null || true)"
  have="$(printf '%s' "$have" | grep -oE 'sha256:[0-9a-f]{64}' | head -1)"
  if [[ -z "$have" ]]; then
    have="$(docker inspect "$container" --format '{{index .RepoDigests 0}}' 2>/dev/null | grep -oE 'sha256:[0-9a-f]{64}' | head -1)"
  fi
  if [[ "$have" != "$want" ]]; then
    wr_component_die "$peer_kind digest changed under ${WOODRIGHT_COMPONENT_SCOPE:-unknown} scope (have=$have want=$want) — P0 stop"
    return 1
  fi
  return 0
}

wr_assert_storefront_only_does_not_mutate_backend() {
  local planned_be="${1:-}"
  [[ "${WOODRIGHT_COMPONENT_SCOPE:-}" == "storefront" ]] || return 0
  if [[ -n "$planned_be" && -n "${WOODRIGHT_FROZEN_BACKEND_DIGEST:-}" && "$planned_be" != "${WOODRIGHT_FROZEN_BACKEND_DIGEST}" ]]; then
    wr_component_die "storefront-only refuses backend digest change planned=$planned_be frozen=${WOODRIGHT_FROZEN_BACKEND_DIGEST}"
    return 1
  fi
  return 0
}
