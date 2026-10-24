#!/usr/bin/env bash
# Safe retention for Woodright automated backups. Never touches manual P0 / quarantine / newest success.
set -Eeuo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CATALOG="$SCRIPT_DIR/retention_catalog.py"
[[ -f "$CATALOG" && ! -L "$CATALOG" ]] || { echo "retention catalog missing/unsafe" >&2; exit 1; }

BACKUP_ROOT="${WOODRIGHT_BACKUP_ROOT:-/srv/woodright/backups/automated}"
DAILY_KEEP="${WOODRIGHT_DAILY_KEEP:-14}"
WEEKLY_KEEP="${WOODRIGHT_WEEKLY_KEEP:-4}"
DRY_RUN=1
APPLY=0

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

usage() {
  cat <<EOF
Usage: $0 [--dry-run|--apply]
  --dry-run  list deletion candidates (default)
  --apply    delete allowlisted complete backups only
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; APPLY=0; shift ;;
    --apply) DRY_RUN=0; APPLY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown arg: $1" ;;
  esac
done

realpath_of() {
  readlink -f "$1" 2>/dev/null || python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$1"
}

under_root() {
  local candidate="$1"
  local real
  real=$(realpath_of "$candidate")
  case "$real" in
    "$REAL"|"$REAL"/*) return 0 ;;
    *) return 1 ;;
  esac
}

# Path guards
[[ -n "$BACKUP_ROOT" ]] || die "empty BACKUP_ROOT"
[[ "$BACKUP_ROOT" != "/" ]] || die "refuse /"
[[ "$BACKUP_ROOT" == /srv/woodright/backups/automated || "$BACKUP_ROOT" == /srv/woodright/backups/automated/* \
  || "${WOODRIGHT_BACKUP_ALLOW_ALT_ROOT:-0}" == "1" ]] \
  || die "BACKUP_ROOT not allowlisted: $BACKUP_ROOT"
if [[ -L "$BACKUP_ROOT" ]]; then
  die "BACKUP_ROOT must not be a symlink"
fi
REAL=$(realpath_of "$BACKUP_ROOT")
[[ "$REAL" == /srv/woodright/backups/automated || "$REAL" == /srv/woodright/backups/automated/* \
  || "${WOODRIGHT_BACKUP_ALLOW_ALT_ROOT:-0}" == "1" ]] \
  || die "realpath escape: $REAL"
# For alt-root tests, REAL itself is the allowlisted root.
ROOT_PREFIX="$REAL"

# Never delete paths matching manual P0 naming
is_protected() {
  local f="$1"
  local pinned
  for pinned in "${PINNED[@]:-}"; do [[ "$pinned" == "$f" ]] && return 0; done
  case "$f" in
    *p0-*|*manual*|*quarantine*|*/state/*|*/logs/*) return 0 ;;
  esac
  return 1
}

assert_safe_target() {
  local f="$1"
  [[ -e "$f" || -L "$f" ]] || return 1
  if [[ -L "$f" ]]; then
    die "refuse symlink target: $f"
  fi
  under_root "$f" || die "path escape: $f"
  local parent
  parent=$(dirname "$f")
  if [[ -L "$parent" ]]; then
    die "refuse symlink parent: $parent"
  fi
  under_root "$parent" || die "parent escape: $parent"
}

# Preservation pins protect the pre-migration recovery history and both object copies.
PINNED=()
PIN_FILE="${WOODRIGHT_RETENTION_PIN_FILE:-$BACKUP_ROOT/state/media-dedup-preservation.json}"
REQUIRE_PINS="${WOODRIGHT_MEDIA_DEDUP_ENABLED:-0}"
case "$REAL" in
  /srv/woodright/backups/automated|/srv/woodright/backups/automated/public-production) REQUIRE_PINS=1 ;;
esac
if [[ "$REQUIRE_PINS" == "1" || -e "$PIN_FILE" || -L "$PIN_FILE" ]]; then
  assert_safe_target "$PIN_FILE" || die "required preservation pins missing"
  PIN_OUTPUT=$(python3 "$CATALOG" pins "$PIN_FILE" "$BACKUP_ROOT") || die "preservation pins invalid"
  while IFS= read -r pinned_path; do
    [[ -n "$pinned_path" ]] && PINNED+=("$pinned_path")
  done <<< "$PIN_OUTPUT"
fi

# Immutable archive/manifest timestamps, never inode mtime (which hardlinks share).
collect_complete() {
  python3 "$CATALOG" complete "$1" "$2"
}

retain_dir() {
  local dir="$1" pattern="$2" keep="$3"
  [[ -d "$dir" ]] || return 0
  if [[ -L "$dir" ]]; then
    die "refuse symlink directory: $dir"
  fi
  under_root "$dir" || die "dir escape: $dir"

  local files=()
  local f
  local collected
  collected=$(collect_complete "$dir" "$pattern") || die "backup catalog failed"
  while IFS= read -r f; do
    [[ -n "$f" ]] && files+=("$f")
  done <<< "$collected"

  local total=${#files[@]}
  log "retain scan dir=$dir pattern=$pattern complete_count=$total keep=$keep"
  if [[ "$total" -le "$keep" ]]; then
    return 0
  fi
  local i
  for ((i=keep; i<total; i++)); do
    f="${files[$i]}"
    [[ -n "$f" && -f "$f" ]] || continue
    is_protected "$f" && { log "skip protected $f"; continue; }
    assert_safe_target "$f"
    local sha="${f}.sha256"
    assert_safe_target "$sha"
    if [[ "$APPLY" -eq 1 ]]; then
      log "DELETE $f sha=$(awk '{print $1}' "$sha")"
      rm -f -- "$f" "$sha"
      local list="${f%.dump}.list.txt"
      if [[ -f "$list" && ! -L "$list" ]]; then
        assert_safe_target "$list"
        rm -f -- "$list"
      fi
      list="${f%.tar.gz}.list.txt"
      if [[ -f "$list" && ! -L "$list" ]]; then
        assert_safe_target "$list"
        rm -f -- "$list"
      fi
    else
      log "DRY-RUN would delete $f sha=$(awk '{print $1}' "$sha")"
    fi
  done
}

log "retention mode=$([[ $APPLY -eq 1 ]] && echo apply || echo dry-run) root=$BACKUP_ROOT daily=$DAILY_KEEP weekly=$WEEKLY_KEEP"

retain_dir "$BACKUP_ROOT/postgres/daily" "*.dump" "$DAILY_KEEP"
retain_dir "$BACKUP_ROOT/postgres/weekly" "*.dump" "$WEEKLY_KEEP"
retain_dir "$BACKUP_ROOT/media/daily" "*.tar.gz" "$DAILY_KEEP"
retain_dir "$BACKUP_ROOT/media/weekly" "*.tar.gz" "$WEEKLY_KEEP"

# Prune old recovery-point manifests (keep 30) - only regular files under root
if [[ -d "$BACKUP_ROOT/manifests" && ! -L "$BACKUP_ROOT/manifests" ]]; then
  under_root "$BACKUP_ROOT/manifests" || die "manifests dir escape"
  mans=()
  MAN_OUTPUT=$(python3 "$CATALOG" manifests "$BACKUP_ROOT/manifests") || die "manifest catalog failed"
  while IFS= read -r f; do
    [[ -n "$f" && -f "$f" && ! -L "$f" ]] || continue
    under_root "$f" || continue
    mans+=("$f")
  done <<< "$MAN_OUTPUT"
  local_total=${#mans[@]}
  if [[ "$local_total" -gt 30 ]]; then
    for ((i=30; i<local_total; i++)); do
      f="${mans[$i]}"
      is_protected "$f" && { log "skip protected manifest $f"; continue; }
      assert_safe_target "$f"
      if [[ "$APPLY" -eq 1 ]]; then
        log "DELETE manifest $f"
        rm -f -- "$f"
      else
        log "DRY-RUN would delete manifest $f"
      fi
    done
  fi
fi

log "retention complete"
