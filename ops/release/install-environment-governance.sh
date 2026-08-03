#!/usr/bin/env bash
# Install environment-governance helpers onto the Woodright VM ops tree.
# Does NOT recreate containers, change image digests, or rewrite application env SHA.
#
# Full-bundle atomic install:
#   - one --source-sha
#   - source must match clean git HEAD (or exact detached commit)
#   - refuse dirty tracked bundle files / source symlinks
#   - backup previous active files
#   - install entire FILES list
#   - verify checksums against source before writing marker
#   - write machine-readable bundle manifest
#   - on verify failure restore backup and leave marker unchanged
#
# Usage:
#   bash ops/release/install-environment-governance.sh \
#     --source-sha <40-hex-merged-main> \
#     [--repo-root /path/to/checkout] \
#     [--ops-root /srv/woodright/ops] \
#     [--dry-run]
set -euo pipefail

SOURCE_SHA=""
REPO_ROOT=""
OPS_ROOT="/srv/woodright/ops"
TOOLS_ROOT="/srv/woodright/tools/release"
DOCS_ROOT="/srv/woodright/docs/operator"
DRY_RUN=0
ALLOW_DIRTY_SOURCE="${WOODRIGHT_INSTALL_ALLOW_DIRTY_SOURCE:-0}"
MUTATION_STARTED=0
RESTORE_DONE=0
INSTALL_OK=0
INSTALL_LOCK_FD=200
INSTALL_FCNTL_HOLDER_PID=""

die() {
  echo "ERROR: $*" >&2
  if [[ "${MUTATION_STARTED:-0}" == "1" && "${RESTORE_DONE:-0}" != "1" ]]; then
    RESTORE_DONE=1
    # restore_previous_bundle is defined later; only called after install mutation starts.
    restore_previous_bundle || log "RESTORE_FAILED from die()"
  fi
  release_install_lock_holders 2>/dev/null || true
  exit 1
}
log() { echo "$*"; }

# Non-blocking exclusive lock helper (util-linux flock OR python fcntl).
# Usage: wr_try_flock_nb <path> <fd>  -> 0 if acquired, 1 if busy
wr_try_flock_nb() {
  local path="$1"
  local fd="$2"
  : >>"$path"
  if command -v flock >/dev/null 2>&1; then
    eval "exec ${fd}>>\"\$path\""
    if flock -n "$fd"; then
      return 0
    fi
    eval "exec ${fd}>&-" 2>/dev/null || true
    return 1
  fi
  local ready
  ready="$(mktemp)"
  python3 - "$path" "$ready" <<'PY' &
import fcntl, os, sys, time
path, ready = sys.argv[1], sys.argv[2]
fd = os.open(path, os.O_RDWR | os.O_CREAT, 0o644)
try:
    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    sys.exit(3)
open(ready, "w").write("1")
while True:
    time.sleep(3600)
PY
  local holder=$!
  local i=0
  while [[ ! -s "$ready" && "$i" -lt 40 ]]; do
    if ! kill -0 "$holder" 2>/dev/null; then
      rm -f "$ready"
      return 1
    fi
    sleep 0.05
    i=$((i + 1))
  done
  if [[ ! -s "$ready" ]]; then
    kill "$holder" 2>/dev/null || true
    rm -f "$ready"
    return 1
  fi
  rm -f "$ready"
  if [[ -n "${INSTALL_FCNTL_HOLDER_PID:-}" ]]; then
    INSTALL_FCNTL_HOLDER_PID="$INSTALL_FCNTL_HOLDER_PID $holder"
  else
    INSTALL_FCNTL_HOLDER_PID="$holder"
  fi
  return 0
}

wr_probe_lock_busy() {
  local path="$1"
  [[ -e "$path" ]] || return 1
  if command -v flock >/dev/null 2>&1; then
    if ! ( flock -n 9 ) 9>>"$path"; then
      return 0
    fi
    return 1
  fi
  python3 - "$path" <<'PY'
import fcntl, os, sys
path = sys.argv[1]
fd = os.open(path, os.O_RDWR | os.O_CREAT, 0o644)
try:
    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    sys.exit(0)
sys.exit(1)
PY
}

acquire_install_lock() {
  local lock_path="${WOODRIGHT_INSTALL_LOCK_PATH:-$WR_ROOT/locks/env-governance-install.lock}"
  mkdir -p "$(dirname "$lock_path")"
  if ! wr_try_flock_nb "$lock_path" 200; then
    die "env-governance install lock busy: $lock_path (refuse concurrent install)"
  fi
  log "install_lock_acquired path=$lock_path"
}

# Hold ALL runtime mutation locks for the whole install window (no TOCTOU probe-only).
RUNTIME_LOCK_NEXT_FD=201
hold_runtime_locks_for_install() {
  local p
  for p in \
    "$WR_ROOT/locks/public_demo/live-cutover.lock" \
    "$WR_ROOT/locks/staging/live-cutover.lock" \
    "$WR_ROOT/locks/production/live-cutover.lock" \
    "$WR_ROOT/locks/live-cutover.lock"
  do
    mkdir -p "$(dirname "$p")"
    : >>"$p"
    if ! wr_try_flock_nb "$p" "$RUNTIME_LOCK_NEXT_FD"; then
      die "refusing install while runtime mutation lock held: $p"
    fi
    log "runtime_lock_held path=$p fd=$RUNTIME_LOCK_NEXT_FD"
    RUNTIME_LOCK_NEXT_FD=$((RUNTIME_LOCK_NEXT_FD + 1))
  done
}

write_install_in_progress() {
  mkdir -p "$TOOLS_ROOT"
  cat >"$IN_PROGRESS_DST" <<EOF
{
  "schema_version": 1,
  "state": "in_progress",
  "source_sha": "$SOURCE_SHA",
  "pid": $$,
  "started_at_utc": "$TS",
  "backup": "$BACKUP"
}
EOF
  chmod 0644 "$IN_PROGRESS_DST"
  log "install_in_progress_written path=$IN_PROGRESS_DST"
}

clear_install_in_progress() {
  rm -f "$IN_PROGRESS_DST"
}

release_install_lock_holders() {
  if [[ -n "${INSTALL_FCNTL_HOLDER_PID:-}" ]]; then
    # May be a space-separated list when multiple fcntl holders are tracked.
    local pid
    for pid in $INSTALL_FCNTL_HOLDER_PID; do
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    done
    INSTALL_FCNTL_HOLDER_PID=""
  fi
  local fd
  for fd in 200 201 202 203 204 205; do
    eval "exec ${fd}>&-" 2>/dev/null || true
  done
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source-sha) SOURCE_SHA="$2"; shift 2 ;;
    --source-sha=*) SOURCE_SHA="${1#--source-sha=}"; shift ;;
    --repo-root) REPO_ROOT="$2"; shift 2 ;;
    --ops-root) OPS_ROOT="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) sed -n '1,30p' "$0"; exit 0 ;;
    *) die "unknown arg $1" ;;
  esac
done

[[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]] || die "missing/invalid --source-sha"
if [[ -z "$REPO_ROOT" ]]; then
  REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fi
[[ -d "$REPO_ROOT/ops/lib" ]] || die "repo root missing ops/lib: $REPO_ROOT"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
WR_ROOT="${WOODRIGHT_INSTALL_WR_ROOT:-/srv/woodright}"
if [[ "$OPS_ROOT" != "/srv/woodright/ops" ]]; then
  # Harness / alternate layout: derive WR_ROOT/tools/docs from --ops-root parent.
  WR_ROOT="${WOODRIGHT_INSTALL_WR_ROOT:-$(cd "$(dirname "$OPS_ROOT")" && pwd)}"
  TOOLS_ROOT="${WOODRIGHT_INSTALL_TOOLS_ROOT:-$WR_ROOT/tools/release}"
  DOCS_ROOT="${WOODRIGHT_INSTALL_DOCS_ROOT:-$WR_ROOT/docs/operator}"
fi
BACKUP_PARENT="${WOODRIGHT_INSTALL_BACKUP_ROOT:-$WR_ROOT/backups}"
BACKUP=""
MARKER="${TOOLS_ROOT}/INSTALLED_ENV_GOVERNANCE_SHA.txt"
# shellcheck source=ops/lib/woodright-install-provenance.sh
source "$REPO_ROOT/ops/lib/woodright-install-provenance.sh"
WOODRIGHT_INSTALL_WR_ROOT="$WR_ROOT"

MARKER_FROM="${TOOLS_ROOT}/INSTALLED_FROM_MERGE_SHA.txt"
TEXT_MANIFEST_DST="${TOOLS_ROOT}/ENV_GOVERNANCE_INSTALL_MANIFEST.txt"
BUNDLE_MANIFEST_DST="${TOOLS_ROOT}/ENV_GOVERNANCE_BUNDLE_MANIFEST.json"
IN_PROGRESS_DST="${TOOLS_ROOT}/ENV_GOVERNANCE_INSTALL_IN_PROGRESS.json"
CANONICAL_LAYOUT=0
[[ "$OPS_ROOT" == "/srv/woodright/ops" ]] && CANONICAL_LAYOUT=1

# Canonical bundle (single source SHA). Keep installer + verifier in-tree on VM.
FILES=(
  ops/lib/woodright-environment-profile.sh
  ops/lib/woodright-host-publish.sh
  ops/lib/woodright-component-authority.sh
  ops/lib/woodright-oci-provenance.sh
  ops/lib/woodright-validation-freeze.sh
  ops/lib/woodright-hold-validation-freeze.sh
  ops/lib/woodright-staging-mutation-lock.sh
  ops/lib/woodright-runtime-discovery.sh
  ops/lib/woodright-cutover-common.sh
  ops/lib/woodright-install-provenance.sh
  ops/lib/woodright-compose-service-recreate.sh
  ops/config/runtime-environments/public_demo.conf
  ops/config/runtime-environments/staging.conf
  ops/config/runtime-environments/production.conf
  ops/release/recreate-staging-backend-with-media.sh
  ops/release/recreate-staging-storefront.sh
  ops/release/cutover-public-demo-pair.sh
  ops/release/cutover-production-candidate.sh
  ops/release/recover-production-candidate-skew.sh
  ops/release/reconcile-production-candidate-metadata.sh
  ops/release/public-demo-critical-http-smoke.sh
  ops/release/rollback-staging-backend-from-keeper.sh
  ops/release/rollback-staging-storefront-from-keeper.sh
  ops/release/verify-backend-media-mount.sh
  ops/release/reconcile-runtime-manifests.sh
  ops/release/assert-manifest-update-allowed.sh
  ops/release/install-environment-governance.sh
  ops/release/verify-environment-governance-bundle.sh
  ops/monitoring/woodright-health-check.sh
  ops/monitoring/woodright-host-publish-check.sh
  ops/systemd/woodright-monitor.service
  scripts/release/reconcile-public-image-pins.sh
  docs/operator/environment-scoped-release-governance.md
  docs/operator/backend-media-promotion-gate.md
  docs/operator/production-candidate-rollback.md
  docs/operator/production-helper-install-provenance.md
)

role_for() {
  case "$1" in
    ops/release/cutover-public-demo-pair.sh) echo pair_orchestrator ;;
    ops/release/recreate-staging-backend-with-media.sh) echo backend_recreate ;;
    ops/release/recreate-staging-storefront.sh) echo storefront_recreate ;;
    ops/release/rollback-staging-backend-from-keeper.sh) echo backend_rollback ;;
    ops/release/rollback-staging-storefront-from-keeper.sh) echo storefront_rollback ;;
    ops/lib/woodright-cutover-common.sh) echo cutover_common ;;
    ops/lib/woodright-compose-service-recreate.sh) echo compose_service_recreate ;;
    ops/lib/woodright-environment-profile.sh) echo environment_profile ;;
    ops/lib/woodright-host-publish.sh) echo host_publish ;;
    ops/lib/woodright-component-authority.sh) echo component_authority ;;
    ops/release/reconcile-runtime-manifests.sh) echo runtime_manifest_reconciler ;;
    scripts/release/reconcile-public-image-pins.sh) echo pin_reconciler ;;
    ops/monitoring/*) echo monitor_helper ;;
    ops/systemd/*) echo systemd_unit ;;
    ops/release/install-environment-governance.sh) echo installer ;;
    ops/release/verify-environment-governance-bundle.sh) echo bundle_verifier ;;
    *) echo required ;;
  esac
}

dest_for() {
  local rel="$1"
  case "$rel" in
    ops/*) printf '%s\n' "$OPS_ROOT/${rel#ops/}" ;;
    scripts/release/*) printf '%s\n' "$TOOLS_ROOT/$(basename "$rel")" ;;
    docs/operator/*) printf '%s\n' "$DOCS_ROOT/$(basename "$rel")" ;;
    *) die "unmapped $rel" ;;
  esac
}

mode_for() {
  local rel="$1"
  case "$rel" in
    *.conf|*.md|ops/systemd/*) echo 0644 ;;
    *) echo 0755 ;;
  esac
}

checksums() {
  local f="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$f" | awk '{print $1}'
  else
    shasum -a 256 "$f" | awk '{print $1}'
  fi
}

assert_source_integrity() {
  command -v git >/dev/null 2>&1 || die "git required for source integrity"
  [[ -e "$REPO_ROOT/.git" || -d "$REPO_ROOT/.git" ]] || die "repo-root is not a git checkout: $REPO_ROOT"
  local head
  head="$(git -C "$REPO_ROOT" rev-parse HEAD)"
  [[ "$head" == "$SOURCE_SHA" ]] || die "source HEAD=$head != --source-sha=$SOURCE_SHA (refuse mixed checkout)"
  if [[ "$ALLOW_DIRTY_SOURCE" != "1" ]]; then
    local dirty
    dirty="$(git -C "$REPO_ROOT" status --porcelain --untracked-files=no -- "${FILES[@]}" 2>/dev/null || true)"
    # Also refuse dirty installer/verifier themselves if present in tree
    if [[ -n "$dirty" ]]; then
      die "source worktree has dirty tracked bundle files; refuse install. Set WOODRIGHT_INSTALL_ALLOW_DIRTY_SOURCE=1 only for harness."
    fi
  fi
  local rel src
  for rel in "${FILES[@]}"; do
    src="$REPO_ROOT/$rel"
    [[ -e "$src" ]] || die "missing source $src"
    [[ ! -L "$src" ]] || die "source symlink refused: $src"
    [[ -f "$src" ]] || die "source not a regular file: $src"
  done
}

log "install_plan source_sha=$SOURCE_SHA repo=$REPO_ROOT ops_root=$OPS_ROOT backup_parent=$BACKUP_PARENT dry_run=$DRY_RUN"

if [[ "$DRY_RUN" == "1" ]]; then
  assert_source_integrity
  printf '%s\n' "${FILES[@]}"
  exit 0
fi

assert_source_integrity
acquire_install_lock
hold_runtime_locks_for_install

mkdir -p "$BACKUP_PARENT"
BACKUP="$(mktemp -d "$BACKUP_PARENT/pre-env-gov-install-${SOURCE_SHA:0:12}-$TS.XXXXXX")"

mkdir -p \
  "$OPS_ROOT/lib" \
  "$OPS_ROOT/config/runtime-environments" \
  "$OPS_ROOT/release" \
  "$OPS_ROOT/monitoring" \
  "$OPS_ROOT/systemd" \
  "$TOOLS_ROOT" \
  "$DOCS_ROOT" \
  "$WR_ROOT/locks"

if [[ "$CANONICAL_LAYOUT" == "1" ]]; then
  mkdir -p \
    "$WR_ROOT/locks/public_demo" \
    "$WR_ROOT/locks/staging" \
    "$WR_ROOT/locks/production" \
    "$WR_ROOT/runtime-ownership-public-demo" \
    "$WR_ROOT/runtime-ownership-staging" \
    "$WR_ROOT/runtime-ownership-production" \
    "$WR_ROOT/runtime-identity-public-demo" \
    "$WR_ROOT/runtime-identity-staging" \
    "$WR_ROOT/runtime-identity-production" \
    "$WR_ROOT/reports/public_demo" \
    "$WR_ROOT/reports/staging" \
    "$WR_ROOT/reports/production"
  : >>"$WR_ROOT/locks/public_demo/live-cutover.lock"
  : >>"$WR_ROOT/locks/staging/live-cutover.lock"
  : >>"$WR_ROOT/locks/production/live-cutover.lock"
  if [[ ! -s "$WR_ROOT/locks/production/live-cutover.lock" && -e "$WR_ROOT/locks/production-cutover.lock" ]]; then
    log "note: legacy production-cutover.lock present; nested lock file created empty (flock path is nested)"
  fi
fi

# Preserve previous markers for restore-on-failure
PREV_MARKER=""
PREV_MARKER_FROM=""
PREV_TEXT_MANIFEST=""
PREV_BUNDLE_MANIFEST=""
PREV_LEGACY_CUTOVER=""
PREV_LEGACY_ROOT=""
LEGACY_CUTOVER_MARKER="${WR_ROOT}/INSTALLED_PRODUCTION_CUTOVER_HELPER_SHA.txt"
LEGACY_ROOT_MARKER="${WR_ROOT}/INSTALLED_ENV_GOVERNANCE_SHA.txt"
if [[ -f "$MARKER" ]]; then
  cp -a "$MARKER" "$BACKUP/INSTALLED_ENV_GOVERNANCE_SHA.txt"
  PREV_MARKER="$BACKUP/INSTALLED_ENV_GOVERNANCE_SHA.txt"
else
  : >"$BACKUP/marker_was_absent"
fi
if [[ -f "$MARKER_FROM" ]]; then
  cp -a "$MARKER_FROM" "$BACKUP/INSTALLED_FROM_MERGE_SHA.txt"
  PREV_MARKER_FROM="$BACKUP/INSTALLED_FROM_MERGE_SHA.txt"
else
  : >"$BACKUP/marker_from_was_absent"
fi
if [[ -f "$LEGACY_CUTOVER_MARKER" ]]; then
  cp -a "$LEGACY_CUTOVER_MARKER" "$BACKUP/INSTALLED_PRODUCTION_CUTOVER_HELPER_SHA.txt"
  PREV_LEGACY_CUTOVER="$BACKUP/INSTALLED_PRODUCTION_CUTOVER_HELPER_SHA.txt"
else
  : >"$BACKUP/legacy_cutover_was_absent"
fi
if [[ -f "$LEGACY_ROOT_MARKER" ]]; then
  cp -a "$LEGACY_ROOT_MARKER" "$BACKUP/INSTALLED_ENV_GOVERNANCE_SHA.root.txt"
  PREV_LEGACY_ROOT="$BACKUP/INSTALLED_ENV_GOVERNANCE_SHA.root.txt"
else
  : >"$BACKUP/legacy_root_was_absent"
fi
if [[ -f "$TEXT_MANIFEST_DST" ]]; then
  cp -a "$TEXT_MANIFEST_DST" "$BACKUP/ENV_GOVERNANCE_INSTALL_MANIFEST.txt"
  PREV_TEXT_MANIFEST="$BACKUP/ENV_GOVERNANCE_INSTALL_MANIFEST.txt"
else
  : >"$BACKUP/text_manifest_was_absent"
fi
if [[ -f "$BUNDLE_MANIFEST_DST" ]]; then
  cp -a "$BUNDLE_MANIFEST_DST" "$BACKUP/ENV_GOVERNANCE_BUNDLE_MANIFEST.json"
  PREV_BUNDLE_MANIFEST="$BACKUP/ENV_GOVERNANCE_BUNDLE_MANIFEST.json"
else
  : >"$BACKUP/bundle_manifest_was_absent"
fi

TEXT_MANIFEST="$BACKUP/INSTALL_MANIFEST.txt"
{
  echo "source_sha=$SOURCE_SHA"
  echo "installed_at_utc=$TS"
  echo "repo_root=$REPO_ROOT"
} >"$TEXT_MANIFEST"

restore_previous_bundle() {
  log "RESTORE_BEGIN backup=$BACKUP"
  local rel dest bak absent
  for rel in "${FILES[@]}"; do
    dest="$(dest_for "$rel")"
    bak="$BACKUP/$(echo "$rel" | tr '/' '_')"
    absent="$BACKUP/$(echo "$rel" | tr '/' '_').was_absent"
    if [[ -f "$bak" || -L "$bak" ]]; then
      mkdir -p "$(dirname "$dest")"
      cp -a "$bak" "$dest"
      log "restored $dest"
    elif [[ -f "$absent" ]]; then
      # This install created the path (it was absent before this run).
      if [[ -e "$dest" || -L "$dest" ]]; then
        rm -f "$dest"
        log "removed_new $dest"
      fi
    else
      # Not visited yet in this install loop - leave existing file alone.
      :
    fi
  done
  if [[ -n "$PREV_MARKER" && -f "$PREV_MARKER" ]]; then
    cp -a "$PREV_MARKER" "$MARKER"
  elif [[ -f "$BACKUP/marker_was_absent" ]]; then
    rm -f "$MARKER"
  fi
  if [[ -n "$PREV_MARKER_FROM" && -f "$PREV_MARKER_FROM" ]]; then
    cp -a "$PREV_MARKER_FROM" "$MARKER_FROM"
  elif [[ -f "$BACKUP/marker_from_was_absent" ]]; then
    rm -f "$MARKER_FROM"
  fi
  # Legacy compatibility mirrors must roll back with the canonical marker so a
  # failed install cannot leave diverging authorities.
  if [[ -n "$PREV_LEGACY_CUTOVER" && -f "$PREV_LEGACY_CUTOVER" ]]; then
    cp -a "$PREV_LEGACY_CUTOVER" "$LEGACY_CUTOVER_MARKER"
  elif [[ -f "$BACKUP/legacy_cutover_was_absent" ]]; then
    rm -f "$LEGACY_CUTOVER_MARKER"
  fi
  if [[ -n "$PREV_LEGACY_ROOT" && -f "$PREV_LEGACY_ROOT" ]]; then
    cp -a "$PREV_LEGACY_ROOT" "$LEGACY_ROOT_MARKER"
  elif [[ -f "$BACKUP/legacy_root_was_absent" ]]; then
    rm -f "$LEGACY_ROOT_MARKER"
  fi
  if [[ -n "$PREV_TEXT_MANIFEST" && -f "$PREV_TEXT_MANIFEST" ]]; then
    cp -a "$PREV_TEXT_MANIFEST" "$TEXT_MANIFEST_DST"
  elif [[ -f "$BACKUP/text_manifest_was_absent" ]]; then
    rm -f "$TEXT_MANIFEST_DST"
  fi
  if [[ -n "$PREV_BUNDLE_MANIFEST" && -f "$PREV_BUNDLE_MANIFEST" ]]; then
    cp -a "$PREV_BUNDLE_MANIFEST" "$BUNDLE_MANIFEST_DST"
  elif [[ -f "$BACKUP/bundle_manifest_was_absent" ]]; then
    rm -f "$BUNDLE_MANIFEST_DST"
  fi
  if [[ -f "$BACKUP/etc_systemd_woodright-monitor.service" && -d /etc/systemd/system ]]; then
    cp -a "$BACKUP/etc_systemd_woodright-monitor.service" /etc/systemd/system/woodright-monitor.service
  elif [[ "$CANONICAL_LAYOUT" == "1" && -f "$BACKUP/systemd_unit_was_absent" ]]; then
    rm -f /etc/systemd/system/woodright-monitor.service
  fi
  # Compat symlink restore/removal for scripts/release helpers.
  local base link_dst link_bak
  for base in reconcile-public-image-pins.sh; do
    link_dst="${WR_ROOT}/scripts/release/${base}"
    link_bak="$BACKUP/scripts_release_${base}.pre-symlink"
    if [[ -e "$link_bak" || -L "$link_bak" ]]; then
      mkdir -p "$(dirname "$link_dst")"
      cp -a "$link_bak" "$link_dst"
    elif [[ -f "$BACKUP/scripts_release_${base}.was_absent" ]]; then
      rm -f "$link_dst"
    fi
  done
  log "RESTORE_OK"
  clear_install_in_progress
}

MUTATION_STARTED=0
RESTORE_DONE=0
INSTALL_OK=0
on_install_err() {
  local rc=$?
  if [[ "$MUTATION_STARTED" == "1" && "$RESTORE_DONE" != "1" ]]; then
    RESTORE_DONE=1
    restore_previous_bundle || log "RESTORE_FAILED during ERR trap"
  fi
  exit "$rc"
}
on_install_interrupt() {
  local sig="${1:-INT}"
  log "INSTALL_INTERRUPTED signal=$sig mutation_started=$MUTATION_STARTED"
  if [[ "$MUTATION_STARTED" == "1" && "$RESTORE_DONE" != "1" ]]; then
    RESTORE_DONE=1
    restore_previous_bundle || log "RESTORE_FAILED during $sig trap"
  fi
  release_install_lock_holders
  case "$sig" in
    TERM) exit 143 ;;
    HUP) exit 129 ;;
    *) exit 130 ;;
  esac
}
on_install_exit() {
  # Runs on every exit path; restore only if mutation left an incomplete bundle.
  if [[ "$INSTALL_OK" != "1" ]]; then
    if [[ "$MUTATION_STARTED" == "1" && "$RESTORE_DONE" != "1" ]]; then
      RESTORE_DONE=1
      restore_previous_bundle || log "RESTORE_FAILED during EXIT trap"
    fi
  fi
  release_install_lock_holders
}
trap 'on_install_err' ERR
trap 'on_install_interrupt INT' INT
trap 'on_install_interrupt TERM' TERM
trap 'on_install_interrupt HUP' HUP
trap 'on_install_exit' EXIT

# Backup + install
write_install_in_progress
MUTATION_STARTED=1
for rel in "${FILES[@]}"; do
  src="$REPO_ROOT/$rel"
  dest="$(dest_for "$rel")"
  mode="$(mode_for "$rel")"
  mkdir -p "$(dirname "$dest")"
  if [[ -f "$dest" || -L "$dest" ]]; then
    [[ ! -L "$dest" || "$rel" == scripts/release/* ]] || die "refusing to overwrite unexpected symlink dest=$dest"
    cp -a "$dest" "$BACKUP/$(echo "$rel" | tr '/' '_')"
    echo "backup $dest -> $BACKUP sha=$(checksums "$dest")" >>"$TEXT_MANIFEST"
  else
    : >"$BACKUP/$(echo "$rel" | tr '/' '_').was_absent"
  fi
  install -m "$mode" "$src" "$dest"
  [[ ! -L "$dest" ]] || die "destination became symlink after install: $dest"
  got="$(checksums "$dest")"
  want="$(checksums "$src")"
  [[ "$got" == "$want" ]] || die "post-copy checksum mismatch for $rel"
  echo "install $rel -> $dest sha=$got mode=$mode" >>"$TEXT_MANIFEST"
  # Test-only fault injection (never set in production installs).
  if [[ -n "${WOODRIGHT_INSTALL_FORCE_FAIL_AFTER:-}" && "$rel" == "$WOODRIGHT_INSTALL_FORCE_FAIL_AFTER" ]]; then
    die "forced_fail_after=$rel"
  fi
  if [[ -n "${WOODRIGHT_INSTALL_SLEEP_AFTER:-}" && "$rel" == "$WOODRIGHT_INSTALL_SLEEP_AFTER" ]]; then
    sleep "${WOODRIGHT_INSTALL_SLEEP_SEC:-30}"
  fi

  if [[ "$rel" == scripts/release/* ]]; then
    scripts_release_dir="${WR_ROOT}/scripts/release"
    mkdir -p "$scripts_release_dir"
    local_link="$scripts_release_dir/$(basename "$rel")"
    if [[ -e "$local_link" || -L "$local_link" ]]; then
      cp -a "$local_link" "$BACKUP/scripts_release_$(basename "$rel").pre-symlink"
      if [[ -e "$local_link" && ! -L "$local_link" ]]; then
        echo "backup $local_link -> $BACKUP sha=$(checksums "$local_link")" >>"$TEXT_MANIFEST"
      else
        echo "backup $local_link -> $BACKUP sha=symlink-or-dangling" >>"$TEXT_MANIFEST"
      fi
    else
      : >"$BACKUP/scripts_release_$(basename "$rel").was_absent"
    fi
    ln -sfn "$dest" "$local_link"
    echo "symlink $local_link -> $dest" >>"$TEXT_MANIFEST"
  fi
done

# Live systemd unit (profile-aware monitor). Backup first; daemon-reload only.
if [[ "$CANONICAL_LAYOUT" == "1" && -d /etc/systemd/system ]]; then
  UNIT_SRC="$REPO_ROOT/ops/systemd/woodright-monitor.service"
  UNIT_DST=/etc/systemd/system/woodright-monitor.service
  if [[ -f "$UNIT_DST" ]]; then
    cp -a "$UNIT_DST" "$BACKUP/etc_systemd_woodright-monitor.service"
  else
    : >"$BACKUP/systemd_unit_was_absent"
  fi
  install -m 0644 "$UNIT_SRC" "$UNIT_DST"
  echo "install ops/systemd/woodright-monitor.service -> $UNIT_DST sha=$(checksums "$UNIT_DST")" >>"$TEXT_MANIFEST"
  if command -v systemctl >/dev/null 2>&1; then
    systemctl daemon-reload
    echo "systemctl_daemon_reload=1" >>"$TEXT_MANIFEST"
  fi
fi

# Build JSON bundle manifest from installed paths (must match source checksums).
BUNDLE_TMP="$BACKUP/ENV_GOVERNANCE_BUNDLE_MANIFEST.json"
OPS_ROOT="$OPS_ROOT" TOOLS_ROOT="$TOOLS_ROOT" DOCS_ROOT="$DOCS_ROOT" \
python3 - "$SOURCE_SHA" "$TS" "$BUNDLE_TMP" "${FILES[@]}" <<'PY'
import hashlib, json, os, sys
from pathlib import Path

source_sha, ts, out = sys.argv[1], sys.argv[2], sys.argv[3]
files = sys.argv[4:]
ops_root = os.environ["OPS_ROOT"]
tools_root = os.environ["TOOLS_ROOT"]
docs_root = os.environ["DOCS_ROOT"]

def dest_for(rel: str) -> str:
    if rel.startswith("ops/"):
        return str(Path(ops_root) / rel[len("ops/"):])
    if rel.startswith("scripts/release/"):
        return str(Path(tools_root) / Path(rel).name)
    if rel.startswith("docs/operator/"):
        return str(Path(docs_root) / Path(rel).name)
    raise SystemExit(f"unmapped {rel}")

def role_for(rel: str) -> str:
    mapping = {
        "ops/release/cutover-public-demo-pair.sh": "pair_orchestrator",
        "ops/release/recreate-staging-backend-with-media.sh": "backend_recreate",
        "ops/release/recreate-staging-storefront.sh": "storefront_recreate",
        "ops/release/rollback-staging-backend-from-keeper.sh": "backend_rollback",
        "ops/release/rollback-staging-storefront-from-keeper.sh": "storefront_rollback",
        "ops/lib/woodright-cutover-common.sh": "cutover_common",
        "ops/lib/woodright-compose-service-recreate.sh": "compose_service_recreate",
        "ops/lib/woodright-environment-profile.sh": "environment_profile",
        "ops/lib/woodright-host-publish.sh": "host_publish",
        "ops/lib/woodright-component-authority.sh": "component_authority",
        "ops/release/reconcile-runtime-manifests.sh": "runtime_manifest_reconciler",
        "scripts/release/reconcile-public-image-pins.sh": "pin_reconciler",
        "ops/release/install-environment-governance.sh": "installer",
        "ops/release/verify-environment-governance-bundle.sh": "bundle_verifier",
    }
    if rel in mapping:
        return mapping[rel]
    if rel.startswith("ops/monitoring/"):
        return "monitor_helper"
    if rel.startswith("ops/systemd/"):
        return "systemd_unit"
    return "required"

entries = []
for rel in files:
    dest = Path(dest_for(rel))
    if not dest.is_file() or dest.is_symlink():
        raise SystemExit(f"installed path invalid: {dest}")
    digest = hashlib.sha256(dest.read_bytes()).hexdigest()
    mode = oct(dest.stat().st_mode & 0o777)
    entries.append({
        "relative_path": rel,
        "installed_path": str(dest),
        "sha256": digest,
        "mode": mode,
        "role": role_for(rel),
        "required": True,
    })

Path(out).write_text(json.dumps({
    "schema_version": 1,
    "source_sha": source_sha,
    "installed_at_utc": ts,
    "files": entries,
}, indent=2, sort_keys=True) + "\n")
print(f"bundle_manifest_entries={len(entries)}")
PY

# Verify installed == source checksums before marker write
VERIFY_FAIL=0
for rel in "${FILES[@]}"; do
  src="$REPO_ROOT/$rel"
  dest="$(dest_for "$rel")"
  if [[ "$(checksums "$dest")" != "$(checksums "$src")" ]]; then
    log "VERIFY_MISMATCH $rel"
    VERIFY_FAIL=1
  fi
done
if [[ "$VERIFY_FAIL" != "0" ]]; then
  restore_previous_bundle
  RESTORE_DONE=1
  die "install verify failed; previous bundle restored; marker not updated"
fi

# Marker ONLY after full PASS (canonical tools/release + legacy compatibility mirrors)
mkdir -p "$TOOLS_ROOT"
cp "$TEXT_MANIFEST" "$TEXT_MANIFEST_DST"
cp "$BUNDLE_TMP" "$BUNDLE_MANIFEST_DST"
chmod 0644 "$TEXT_MANIFEST_DST" "$BUNDLE_MANIFEST_DST"
WOODRIGHT_INSTALL_WR_ROOT="$WR_ROOT" wr_install_provenance_write_markers "$SOURCE_SHA" "$WR_ROOT" "$TOOLS_ROOT"

# Final verifier (same SHA)
if ! bash "$OPS_ROOT/release/verify-environment-governance-bundle.sh" \
  --ops-root "$OPS_ROOT" \
  --expected-sha "$SOURCE_SHA" \
  --manifest "$BUNDLE_MANIFEST_DST" \
  --marker "$MARKER" \
  --allow-in-progress; then
  restore_previous_bundle
  RESTORE_DONE=1
  die "post-marker bundle verify failed; restored previous bundle"
fi
if ! WOODRIGHT_INSTALL_WR_ROOT="$WR_ROOT" wr_install_provenance_verify_mirrors "$SOURCE_SHA" "$WR_ROOT" "$TOOLS_ROOT"; then
  restore_previous_bundle
  RESTORE_DONE=1
  die "post-marker provenance mirror verify failed; restored previous bundle"
fi

# Seed public_demo ownership from legacy shared root if empty (metadata copy only)
if [[ "$CANONICAL_LAYOUT" == "1" ]]; then
  if [[ ! -f /srv/woodright/runtime-ownership-public-demo/ACTIVE_OWNER.json \
     && -f /srv/woodright/runtime-ownership/ACTIVE_OWNER.json ]]; then
    cp -a /srv/woodright/runtime-ownership/ACTIVE_OWNER.json \
      /srv/woodright/runtime-ownership-public-demo/ACTIVE_OWNER.json
    cp -a /srv/woodright/runtime-ownership/EXPECTED_RELEASE.json \
      /srv/woodright/runtime-ownership-public-demo/EXPECTED_RELEASE.json 2>/dev/null || true
    cp -a /srv/woodright/runtime-ownership/ACTIVE_RELEASE.json \
      /srv/woodright/runtime-ownership-public-demo/ACTIVE_RELEASE.json 2>/dev/null || true
    echo "seeded_public_demo_ownership_from_legacy=1" >>"$TEXT_MANIFEST"
  fi
  if [[ ! -f /srv/woodright/runtime-identity-public-demo/ACTIVE_PUBLIC.json \
     && -f /srv/woodright/runtime-identity/ACTIVE_PUBLIC.json ]]; then
    cp -a /srv/woodright/runtime-identity/ACTIVE_PUBLIC.json \
      /srv/woodright/runtime-identity-public-demo/ACTIVE_PUBLIC.json
    echo "seeded_public_demo_identity_from_legacy=1" >>"$TEXT_MANIFEST"
  fi
fi
cp "$TEXT_MANIFEST" "$TEXT_MANIFEST_DST"

clear_install_in_progress
INSTALL_OK=1
MUTATION_STARTED=0
log "INSTALL_OK source_sha=$SOURCE_SHA backup=$BACKUP bundle_manifest=$BUNDLE_MANIFEST_DST"
log "NOTE: application runtime unchanged; digests/containers not mutated"
