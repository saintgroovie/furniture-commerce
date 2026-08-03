#!/usr/bin/env bash
# Canonical installed-ops-bundle provenance resolver.
#
# Single authority for "which governance/helper SHA is installed on this host":
#   ${WR_ROOT}/tools/release/INSTALLED_ENV_GOVERNANCE_SHA.txt
#
# Legacy compatibility mirrors (NOT independent authorities):
#   ${WR_ROOT}/INSTALLED_PRODUCTION_CUTOVER_HELPER_SHA.txt
#   ${WR_ROOT}/INSTALLED_ENV_GOVERNANCE_SHA.txt   (root copy; historically drifted)
#
# Mutating helpers must call wr_resolve_installed_governance_sha and use the
# returned canonical SHA as operation_helper_install_sha / helper_install_sha.
# A legacy mismatch fail-closes mutating ops; dry-run may report and continue
# when WOODRIGHT_PROVENANCE_DRY_RUN_REPORT_MISMATCH=1.
#
# shellcheck shell=bash

WR_INSTALL_PROVENANCE_SHA_RE='^[0-9a-f]{40}$'

wr_install_provenance_log() {
  printf '%s wr_install_provenance %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2
}

# Default live root; do not assign on source (:= would pin /srv/woodright and
# break harness verify that derives WR from --ops-root).
wr_install_provenance_default_wr_root() {
  printf '%s\n' "${WOODRIGHT_INSTALL_WR_ROOT:-/srv/woodright}"
}

wr_install_provenance_paths() {
  # Exports path variables for the current WR root (overridable in harness).
  local wr_root
  wr_root="$(wr_install_provenance_default_wr_root)"
  WR_GOVERNANCE_MARKER_CANONICAL="${WOODRIGHT_GOVERNANCE_MARKER:-$wr_root/tools/release/INSTALLED_ENV_GOVERNANCE_SHA.txt}"
  WR_GOVERNANCE_MARKER_LEGACY_CUTOVER="${WOODRIGHT_LEGACY_CUTOVER_HELPER_MARKER:-$wr_root/INSTALLED_PRODUCTION_CUTOVER_HELPER_SHA.txt}"
  WR_GOVERNANCE_MARKER_LEGACY_ROOT="${WOODRIGHT_LEGACY_ROOT_GOVERNANCE_MARKER:-$wr_root/INSTALLED_ENV_GOVERNANCE_SHA.txt}"
}

wr_install_provenance_read_sha_file() {
  local path="${1:-}"
  local raw=""
  [[ -n "$path" && -r "$path" ]] || return 1
  raw="$(tr -d '[:space:]' <"$path" 2>/dev/null || true)"
  [[ "$raw" =~ $WR_INSTALL_PROVENANCE_SHA_RE ]] || return 1
  printf '%s\n' "$raw"
}

# Classify one legacy path relative to canonical SHA.
# Prints: absent | match | mismatch | invalid
wr_install_provenance_classify_legacy() {
  local canonical="${1:-}"
  local legacy_path="${2:-}"
  local got=""
  if [[ ! -e "$legacy_path" ]]; then
    printf '%s\n' "absent"
    return 0
  fi
  if ! got="$(wr_install_provenance_read_sha_file "$legacy_path")"; then
    printf '%s\n' "invalid"
    return 0
  fi
  if [[ "$got" == "$canonical" ]]; then
    printf '%s\n' "match"
  else
    printf '%s\n' "mismatch"
  fi
}

# Resolve the installed governance/helper SHA.
#
# On success sets:
#   WR_INSTALLED_GOVERNANCE_SHA
#   WR_INSTALL_PROVENANCE_SOURCE          env|canonical
#   WR_INSTALL_PROVENANCE_LEGACY_CUTOVER  absent|match|mismatch|invalid
#   WR_INSTALL_PROVENANCE_LEGACY_ROOT     absent|match|mismatch|invalid
#   WR_INSTALL_PROVENANCE_OK               1|0
#
# Args:
#   --mutating   fail closed on missing/invalid canonical or any legacy mismatch/invalid
#   --dry-run    report mismatch; fail only on missing/invalid canonical (unless
#                WOODRIGHT_PROVENANCE_DRY_RUN_REPORT_MISMATCH=0, then also fail mismatch)
#
# Env override (harness / audited operators only):
#   WOODRIGHT_INSTALLED_GOVERNANCE_SHA / WOODRIGHT_HELPER_INSTALL_SHA
wr_resolve_installed_governance_sha() {
  local mode="mutating"
  local arg
  for arg in "$@"; do
    case "$arg" in
      --mutating) mode="mutating" ;;
      --dry-run) mode="dry-run" ;;
      *)
        wr_install_provenance_log "ERROR: unknown arg $arg"
        return 2
        ;;
    esac
  done

  wr_install_provenance_paths
  WR_INSTALLED_GOVERNANCE_SHA=""
  WR_INSTALL_PROVENANCE_SOURCE=""
  WR_INSTALL_PROVENANCE_LEGACY_CUTOVER="absent"
  WR_INSTALL_PROVENANCE_LEGACY_ROOT="absent"
  WR_INSTALL_PROVENANCE_OK=0

  local override="${WOODRIGHT_INSTALLED_GOVERNANCE_SHA:-${WOODRIGHT_HELPER_INSTALL_SHA:-}}"
  if [[ -n "$override" ]]; then
    if [[ ! "$override" =~ $WR_INSTALL_PROVENANCE_SHA_RE ]]; then
      wr_install_provenance_log "ERROR: override SHA must be full 40-hex (got '${override}')"
      return 2
    fi
    WR_INSTALLED_GOVERNANCE_SHA="$override"
    WR_INSTALL_PROVENANCE_SOURCE="env"
  else
    local canon=""
    if ! canon="$(wr_install_provenance_read_sha_file "$WR_GOVERNANCE_MARKER_CANONICAL")"; then
      wr_install_provenance_log "ERROR: missing/invalid canonical governance marker: $WR_GOVERNANCE_MARKER_CANONICAL"
      return 2
    fi
    WR_INSTALLED_GOVERNANCE_SHA="$canon"
    WR_INSTALL_PROVENANCE_SOURCE="canonical"
  fi

  WR_INSTALL_PROVENANCE_LEGACY_CUTOVER="$(wr_install_provenance_classify_legacy "$WR_INSTALLED_GOVERNANCE_SHA" "$WR_GOVERNANCE_MARKER_LEGACY_CUTOVER")"
  WR_INSTALL_PROVENANCE_LEGACY_ROOT="$(wr_install_provenance_classify_legacy "$WR_INSTALLED_GOVERNANCE_SHA" "$WR_GOVERNANCE_MARKER_LEGACY_ROOT")"

  local drift=0
  case "$WR_INSTALL_PROVENANCE_LEGACY_CUTOVER" in
    mismatch|invalid) drift=1 ;;
  esac
  case "$WR_INSTALL_PROVENANCE_LEGACY_ROOT" in
    mismatch|invalid) drift=1 ;;
  esac

  if [[ "$drift" == "1" ]]; then
    wr_install_provenance_log "marker_drift canonical=$WR_INSTALLED_GOVERNANCE_SHA source=$WR_INSTALL_PROVENANCE_SOURCE legacy_cutover=$WR_INSTALL_PROVENANCE_LEGACY_CUTOVER($WR_GOVERNANCE_MARKER_LEGACY_CUTOVER) legacy_root=$WR_INSTALL_PROVENANCE_LEGACY_ROOT($WR_GOVERNANCE_MARKER_LEGACY_ROOT)"
    if [[ "$mode" == "mutating" ]]; then
      wr_install_provenance_log "ERROR: legacy install marker diverges from canonical governance marker - refuse mutation (reinstall governance bundle or run metadata provenance correction)"
      return 3
    fi
    # dry-run: report; optionally fail if operator wants strict dry-run
    if [[ "${WOODRIGHT_PROVENANCE_DRY_RUN_REPORT_MISMATCH:-1}" != "1" ]]; then
      return 3
    fi
  fi

  WR_INSTALL_PROVENANCE_OK=1
  wr_install_provenance_log "resolved sha=$WR_INSTALLED_GOVERNANCE_SHA source=$WR_INSTALL_PROVENANCE_SOURCE legacy_cutover=$WR_INSTALL_PROVENANCE_LEGACY_CUTOVER legacy_root=$WR_INSTALL_PROVENANCE_LEGACY_ROOT"
  return 0
}

# Atomically write canonical + legacy compatibility mirrors to the same SHA.
# Used by install-environment-governance.sh after bundle verify.
wr_install_provenance_write_markers() {
  local sha="${1:-}"
  local wr_root="${2:-$WOODRIGHT_INSTALL_WR_ROOT}"
  local tools_root="${3:-$wr_root/tools/release}"
  [[ "$sha" =~ $WR_INSTALL_PROVENANCE_SHA_RE ]] || {
    wr_install_provenance_log "ERROR: refuse to write non-40-hex marker sha='$sha'"
    return 2
  }
  local canon="$tools_root/INSTALLED_ENV_GOVERNANCE_SHA.txt"
  local from="$tools_root/INSTALLED_FROM_MERGE_SHA.txt"
  local legacy_cutover="$wr_root/INSTALLED_PRODUCTION_CUTOVER_HELPER_SHA.txt"
  local legacy_root="$wr_root/INSTALLED_ENV_GOVERNANCE_SHA.txt"
  local tmpdir
  tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/wr-gov-markers.XXXXXX")"
  # shellcheck disable=SC2064
  trap "rm -rf '$tmpdir'" RETURN
  printf '%s\n' "$sha" >"$tmpdir/canon"
  printf '%s\n' "$sha" >"$tmpdir/from"
  printf '%s\n' "$sha" >"$tmpdir/legacy_cutover"
  printf '%s\n' "$sha" >"$tmpdir/legacy_root"
  mkdir -p "$tools_root" "$wr_root"
  # Install order: canonical first, then mirrors. On failure caller restores.
  cp "$tmpdir/canon" "$canon"
  cp "$tmpdir/from" "$from"
  cp "$tmpdir/legacy_cutover" "$legacy_cutover"
  cp "$tmpdir/legacy_root" "$legacy_root"
  chmod 0644 "$canon" "$from" "$legacy_cutover" "$legacy_root" 2>/dev/null || true
  wr_install_provenance_log "markers_written sha=$sha canonical=$canon legacy_cutover=$legacy_cutover legacy_root=$legacy_root"
}

# Verify legacy mirrors equal canonical (for bundle verify / post-install).
# Returns 0 when consistent (legacy absent is OK only if WOODRIGHT_PROVENANCE_ALLOW_ABSENT_LEGACY=1).
wr_install_provenance_verify_mirrors() {
  local sha="${1:-}"
  local wr_root="${2:-$WOODRIGHT_INSTALL_WR_ROOT}"
  local tools_root="${3:-$wr_root/tools/release}"
  local canon="$tools_root/INSTALLED_ENV_GOVERNANCE_SHA.txt"
  local legacy_cutover="$wr_root/INSTALLED_PRODUCTION_CUTOVER_HELPER_SHA.txt"
  local legacy_root="$wr_root/INSTALLED_ENV_GOVERNANCE_SHA.txt"
  local got=""
  local errors=0

  if [[ -z "$sha" ]]; then
    got="$(wr_install_provenance_read_sha_file "$canon")" || {
      echo "ERROR: canonical marker missing/invalid: $canon" >&2
      return 2
    }
    sha="$got"
  fi

  for pair in "legacy_cutover:$legacy_cutover" "legacy_root:$legacy_root"; do
    local label="${pair%%:*}"
    local path="${pair#*:}"
    if [[ ! -e "$path" ]]; then
      if [[ "${WOODRIGHT_PROVENANCE_ALLOW_ABSENT_LEGACY:-0}" == "1" ]]; then
        echo "NOTE: $label absent (allowed): $path"
        continue
      fi
      echo "ERROR: $label marker absent (required compatibility mirror): $path" >&2
      errors=1
      continue
    fi
    got="$(wr_install_provenance_read_sha_file "$path")" || {
      echo "ERROR: $label marker invalid: $path" >&2
      errors=1
      continue
    }
    if [[ "$got" != "$sha" ]]; then
      echo "ERROR: $label marker mismatch have=$got want=$sha path=$path" >&2
      errors=1
    fi
  done
  [[ "$errors" == "0" ]]
}
