#!/usr/bin/env bash
# Component-aware EXPECTED_RELEASE identity (digest + source SHA per role).
# Source from discovery / cutover. Never mutates Docker.
# shellcheck shell=bash

wr_expected_identity_log() { printf '%s\n' "$*" >&2; }

wr_json_has_key() {
  local f="$1" k="$2"
  [[ -f "$f" ]] || return 1
  python3 - "$f" "$k" <<'PY' 2>/dev/null || return 1
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception:
    sys.exit(1)
sys.exit(0 if sys.argv[2] in d else 1)
PY
}

wr_expected_kind_keys() {
  local kind="$1"
  case "$kind" in
    backend)
      WR_EXPECTED_DIGEST_KEY=backend_digest
      WR_EXPECTED_SHA_KEY=backend_source_sha
      ;;
    storefront)
      WR_EXPECTED_DIGEST_KEY=storefront_digest
      WR_EXPECTED_SHA_KEY=storefront_source_sha
      ;;
    *)
      return 1
      ;;
  esac
}

# Fail if application_source_sha and approved_git_sha both exist and differ.
wr_assert_expected_global_sha_keys_consistent() {
  local f="${1:-${WOODRIGHT_EXPECTED_RELEASE:-}}"
  local app approved
  app=$(wr_json_get "$f" application_source_sha)
  approved=$(wr_json_get "$f" approved_git_sha)
  if [[ -n "$app" && -n "$approved" && "$app" != "$approved" ]]; then
    wr_discovery_set_verdict DIGEST_MISMATCH "expected_git_sha_conflict"
    return 1
  fi
  return 0
}

wr_expected_component_digest() {
  local f="${1:-${WOODRIGHT_EXPECTED_RELEASE:-}}"
  local kind="$2"
  local key val
  WR_EXPECTED_COMPONENT_DIGEST=""
  wr_expected_kind_keys "$kind" || return 1
  key="$WR_EXPECTED_DIGEST_KEY"
  wr_assert_expected_release_readable "$f" || return 1
  val=$(wr_json_get "$f" "$key")
  if [[ -z "$val" || ! "$val" =~ ^sha256:[0-9a-f]{64}$ ]]; then
    wr_discovery_set_verdict DIGEST_MISMATCH "expected_${kind}_digest_missing"
    return 1
  fi
  WR_EXPECTED_COMPONENT_DIGEST="$val"
  return 0
}

# Resolve WR_EXPECTED_COMPONENT_SOURCE_SHA for backend|storefront.
# Explicit component SHA key present → use it or fail (no global fallback).
# Key absent + valid component digest → legacy application_source_sha / approved_git_sha.
wr_resolve_expected_component_source_sha() {
  local f="${1:-${WOODRIGHT_EXPECTED_RELEASE:-}}"
  local kind="$2"
  local sha_key raw
  WR_EXPECTED_COMPONENT_SOURCE_SHA=""
  wr_expected_kind_keys "$kind" || return 1
  sha_key="$WR_EXPECTED_SHA_KEY"
  wr_assert_expected_release_readable "$f" || return 1
  wr_assert_expected_global_sha_keys_consistent "$f" || return 1

  if wr_json_has_key "$f" "$sha_key"; then
    raw=$(wr_json_get "$f" "$sha_key")
    if [[ -z "$raw" || ! "$raw" =~ ^[0-9a-f]{40}$ ]]; then
      wr_discovery_set_verdict DIGEST_MISMATCH "expected_${kind}_source_sha_malformed"
      return 1
    fi
    WR_EXPECTED_COMPONENT_SOURCE_SHA="$raw"
    return 0
  fi

  wr_expected_component_digest "$f" "$kind" || return 1
  wr_resolve_expected_application_source_sha "$f" || return 1
  WR_EXPECTED_COMPONENT_SOURCE_SHA="$WR_EXPECTED_APPLICATION_SOURCE_SHA"
  return 0
}
