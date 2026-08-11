#!/usr/bin/env bash
# Shared --mode parsing for staging recreate helpers.
# Fail-closed: missing/empty/duplicate/unknown modes must not default to execute.
# shellcheck shell=bash

# Sets WR_RECREATE_MODE. Does not validate the allowed vocabulary (caller does).
# Safe with zero args under bash 3.2 + set -u (do not expand empty arrays).
wr_recreate_parse_mode_from_args() {
  WR_RECREATE_MODE=""
  local seen=0
  local arg
  local next
  while [[ $# -gt 0 ]]; do
    arg="$1"
    case "$arg" in
      --mode)
        if [[ "$seen" -ge 1 ]]; then
          printf '%s\n' "ERROR: RECREATE_MODE_DUPLICATE" >&2
          return 1
        fi
        seen=1
        next="${2:-}"
        if [[ -z "$next" || "$next" == --* ]]; then
          printf '%s\n' "ERROR: INVALID_RECREATE_MODE (empty)" >&2
          return 1
        fi
        WR_RECREATE_MODE="$next"
        shift 2
        ;;
      --mode=*)
        if [[ "$seen" -ge 1 ]]; then
          printf '%s\n' "ERROR: RECREATE_MODE_DUPLICATE" >&2
          return 1
        fi
        seen=1
        WR_RECREATE_MODE="${arg#--mode=}"
        if [[ -z "$WR_RECREATE_MODE" ]]; then
          printf '%s\n' "ERROR: INVALID_RECREATE_MODE (empty)" >&2
          return 1
        fi
        shift
        ;;
      *)
        shift
        ;;
    esac
  done
  if [[ "$seen" -eq 0 || -z "$WR_RECREATE_MODE" ]]; then
    printf '%s\n' "ERROR: RECREATE_MODE_REQUIRED (pass --mode dry-run|execute)" >&2
    return 1
  fi
  return 0
}

# Validate WR_RECREATE_MODE against a space-separated allowlist.
# On failure prints INVALID_RECREATE_MODE and returns non-zero.
wr_recreate_require_allowed_mode() {
  local allow="${1:?}"
  local m="${WR_RECREATE_MODE:-}"
  local tok
  [[ -n "$m" ]] || {
    printf '%s\n' "ERROR: RECREATE_MODE_REQUIRED" >&2
    return 1
  }
  for tok in $allow; do
    if [[ "$m" == "$tok" ]]; then
      return 0
    fi
  done
  printf '%s\n' "ERROR: INVALID_RECREATE_MODE ($m)" >&2
  return 1
}
