#!/usr/bin/env bash
# OCI provenance checks: expected source SHA must equal image revision label.
# Forbids env/public release-sha writes that are not proven by image labels.
# shellcheck shell=bash

wr_oci_log() { printf '%s wr_oci %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
wr_oci_die() { wr_oci_log "ERROR: $*"; return 1; }

wr_oci_image_revision() {
  local image_ref="$1"
  docker image inspect "$image_ref" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null || true
}

wr_oci_image_repodigest() {
  local image_ref="$1"
  docker image inspect "$image_ref" --format '{{index .RepoDigests 0}}' 2>/dev/null || true
}

wr_assert_digest_exact() {
  local image_ref="$1"
  local want_digest="$2" # sha256:hex
  local got
  [[ "$want_digest" =~ ^sha256:[0-9a-f]{64}$ ]] || { wr_oci_die "invalid want digest"; return 1; }
  got="$(wr_oci_image_repodigest "$image_ref")"
  got="$(printf '%s' "$got" | grep -oE 'sha256:[0-9a-f]{64}' | head -1)"
  # Also accept Config digest / Id match
  if [[ "$got" != "$want_digest" ]]; then
    local id
    id="$(docker image inspect "$image_ref" --format '{{.Id}}' 2>/dev/null || true)"
    if [[ "$id" != "$want_digest" && "$id" != "sha256:${want_digest#sha256:}" ]]; then
      wr_oci_die "RepoDigest mismatch for $image_ref have=$got want=$want_digest"
      return 1
    fi
  fi
  return 0
}

wr_assert_oci_revision_matches_sha() {
  local image_ref="$1"
  local expected_sha="$2"
  local rev
  [[ "$expected_sha" =~ ^[0-9a-f]{40}$ ]] || { wr_oci_die "invalid expected sha"; return 1; }
  rev="$(wr_oci_image_revision "$image_ref")"
  if [[ -z "$rev" ]]; then
    wr_oci_die "missing org.opencontainers.image.revision on $image_ref"
    return 1
  fi
  if [[ "$rev" != "$expected_sha" ]]; then
    wr_oci_die "OCI revision mismatch image=$image_ref oci_rev=$rev expected_sha=$expected_sha"
    return 1
  fi
  return 0
}

# Combined gate for a component candidate.
wr_assert_component_provenance() {
  local image_ref="$1"
  local expected_sha="$2"
  local expected_digest="$3"
  wr_assert_digest_exact "$image_ref" "$expected_digest" || return 1
  wr_assert_oci_revision_matches_sha "$image_ref" "$expected_sha" || return 1
  wr_oci_log "provenance_ok ref=$image_ref sha=$expected_sha digest=$expected_digest"
  return 0
}

# Reject writing WOODRIGHT_RELEASE_SHA that does not match component OCI revisions.
wr_assert_release_sha_consistent_with_images() {
  local release_sha="$1"
  local sf_image="$2"
  local be_image="$3"
  local mode="${4:-unified}" # unified|split
  local sf_rev be_rev
  [[ "$release_sha" =~ ^[0-9a-f]{40}$ ]] || { wr_oci_die "invalid release_sha"; return 1; }
  sf_rev="$(wr_oci_image_revision "$sf_image")"
  be_rev="$(wr_oci_image_revision "$be_image")"
  if [[ "$mode" == "unified" ]]; then
    if [[ "$sf_rev" != "$release_sha" || "$be_rev" != "$release_sha" ]]; then
      wr_oci_die "unified release_sha=$release_sha rejected (sf_oci=$sf_rev be_oci=$be_rev)"
      return 1
    fi
  else
    # split: public marker may follow storefront; backend must still match its own OCI
    if [[ "$sf_rev" != "$release_sha" ]]; then
      wr_oci_die "split public release_sha must equal storefront OCI (sha=$release_sha sf_oci=$sf_rev)"
      return 1
    fi
  fi
  return 0
}
