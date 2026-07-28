#!/usr/bin/env bash
# Shared backup root guards. Source from backup scripts; do not execute alone.
# shellcheck shell=bash

wr_realpath() {
  readlink -f "$1" 2>/dev/null || python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$1"
}

wr_under_root() {
  local candidate="$1" root="${2:-${WR_BACKUP_ROOT_REAL:-}}"
  local real
  real=$(wr_realpath "$candidate")
  case "$real" in
    "$root"|"$root"/*) return 0 ;;
    *) return 1 ;;
  esac
}

# Validate BACKUP_ROOT; set WR_BACKUP_ROOT_REAL. No writes.
wr_assert_backup_root() {
  local root="${1:-${BACKUP_ROOT:-}}"
  [[ -n "$root" && "$root" != "/" ]] || { echo "ERROR: invalid BACKUP_ROOT" >&2; return 1; }
  if [[ "$root" != /srv/woodright/backups/* && "${WOODRIGHT_BACKUP_ALLOW_ALT_ROOT:-0}" != "1" ]]; then
    echo "ERROR: BACKUP_ROOT must be under /srv/woodright/backups" >&2
    return 1
  fi
  if [[ -L "$root" ]]; then
    echo "ERROR: BACKUP_ROOT must not be a symlink" >&2
    return 1
  fi
  WR_BACKUP_ROOT_REAL=$(wr_realpath "$root")
  if [[ "$WR_BACKUP_ROOT_REAL" != /srv/woodright/backups/* && "${WOODRIGHT_BACKUP_ALLOW_ALT_ROOT:-0}" != "1" ]]; then
    echo "ERROR: BACKUP_ROOT realpath escape: $WR_BACKUP_ROOT_REAL" >&2
    return 1
  fi
  BACKUP_ROOT="$root"
  return 0
}

# Ensure subdir exists as a real directory under root (refuse symlink escape).
wr_ensure_dir() {
  local path="$1"
  if [[ -L "$path" ]]; then
    echo "ERROR: refuse symlink directory: $path" >&2
    return 1
  fi
  if [[ -e "$path" && ! -d "$path" ]]; then
    echo "ERROR: not a directory: $path" >&2
    return 1
  fi
  mkdir -p "$path"
  if [[ -L "$path" ]] || ! wr_under_root "$path"; then
    echo "ERROR: directory escape: $path" >&2
    return 1
  fi
  chmod 0700 "$path" 2>/dev/null || true
}
