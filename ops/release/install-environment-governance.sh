#!/usr/bin/env bash
# Install environment-governance helpers onto the Woodright VM ops tree.
# Does NOT recreate containers, change image digests, or rewrite application env SHA.
#
# Usage:
#   bash ops/release/install-environment-governance.sh \
#     --source-sha <40-hex-merged-main> \
#     [--repo-root /path/to/checkout] \
#     [--ops-root /srv/woodright/ops]
set -euo pipefail

SOURCE_SHA=""
REPO_ROOT=""
OPS_ROOT="/srv/woodright/ops"
DRY_RUN=0

die() { echo "ERROR: $*" >&2; exit 1; }
log() { echo "$*"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source-sha) SOURCE_SHA="$2"; shift 2 ;;
    --source-sha=*) SOURCE_SHA="${1#--source-sha=}"; shift ;;
    --repo-root) REPO_ROOT="$2"; shift 2 ;;
    --ops-root) OPS_ROOT="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) sed -n '1,20p' "$0"; exit 0 ;;
    *) die "unknown arg $1" ;;
  esac
done

[[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]] || die "missing/invalid --source-sha"
if [[ -z "$REPO_ROOT" ]]; then
  REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fi
[[ -d "$REPO_ROOT/ops/lib" ]] || die "repo root missing ops/lib: $REPO_ROOT"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="/srv/woodright/backups/pre-env-gov-install-${SOURCE_SHA:0:12}-$TS"
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
  ops/config/runtime-environments/public_demo.conf
  ops/config/runtime-environments/staging.conf
  ops/config/runtime-environments/production.conf
  ops/release/recreate-staging-backend-with-media.sh
  ops/release/recreate-staging-storefront.sh
  ops/release/cutover-public-demo-pair.sh
  ops/release/cutover-production-candidate.sh
  ops/release/public-demo-critical-http-smoke.sh
  ops/release/rollback-staging-backend-from-keeper.sh
  ops/release/rollback-staging-storefront-from-keeper.sh
  ops/release/verify-backend-media-mount.sh
  ops/release/reconcile-runtime-manifests.sh
  ops/release/assert-manifest-update-allowed.sh
  ops/monitoring/woodright-health-check.sh
  ops/monitoring/woodright-host-publish-check.sh
  ops/systemd/woodright-monitor.service
  scripts/release/reconcile-public-image-pins.sh
  docs/operator/environment-scoped-release-governance.md
  docs/operator/backend-media-promotion-gate.md
)

log "install_plan source_sha=$SOURCE_SHA repo=$REPO_ROOT ops_root=$OPS_ROOT backup=$BACKUP dry_run=$DRY_RUN"

if [[ "$DRY_RUN" == "1" ]]; then
  printf '%s\n' "${FILES[@]}"
  exit 0
fi

mkdir -p "$BACKUP" \
  /srv/woodright/locks/public_demo \
  /srv/woodright/locks/staging \
  /srv/woodright/locks/production \
  /srv/woodright/runtime-ownership-public-demo \
  /srv/woodright/runtime-ownership-staging \
  /srv/woodright/runtime-ownership-production \
  /srv/woodright/runtime-identity-public-demo \
  /srv/woodright/runtime-identity-staging \
  /srv/woodright/runtime-identity-production \
  /srv/woodright/reports/public_demo \
  /srv/woodright/reports/staging \
  /srv/woodright/reports/production \
  "$OPS_ROOT/lib" \
  "$OPS_ROOT/config/runtime-environments" \
  "$OPS_ROOT/release" \
  /srv/woodright/tools/release \
  /srv/woodright/docs/operator

# Touch lock files (empty flock targets)
: >>/srv/woodright/locks/public_demo/live-cutover.lock
: >>/srv/woodright/locks/staging/live-cutover.lock
: >>/srv/woodright/locks/production/live-cutover.lock

# Compat: legacy production-cutover.lock → nested path if missing nested content
if [[ ! -s /srv/woodright/locks/production/live-cutover.lock && -e /srv/woodright/locks/production-cutover.lock ]]; then
  log "note: legacy production-cutover.lock present; nested lock file created empty (flock path is nested)"
fi

checksums() {
  local f="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$f" | awk '{print $1}'
  else
    shasum -a 256 "$f" | awk '{print $1}'
  fi
}

MANIFEST="$BACKUP/INSTALL_MANIFEST.txt"
{
  echo "source_sha=$SOURCE_SHA"
  echo "installed_at_utc=$TS"
  echo "repo_root=$REPO_ROOT"
} >"$MANIFEST"

for rel in "${FILES[@]}"; do
  src="$REPO_ROOT/$rel"
  [[ -f "$src" ]] || die "missing $src"
  case "$rel" in
    ops/*) dest="$OPS_ROOT/${rel#ops/}" ;;
    scripts/release/*) dest="/srv/woodright/tools/release/$(basename "$rel")" ;;
    docs/operator/*) dest="/srv/woodright/docs/operator/$(basename "$rel")" ;;
    *) die "unmapped $rel" ;;
  esac
  mkdir -p "$(dirname "$dest")"
  if [[ -f "$dest" || -L "$dest" ]]; then
    cp -a "$dest" "$BACKUP/$(echo "$rel" | tr '/' '_')"
    echo "backup $dest -> $BACKUP sha=$(checksums "$dest")" >>"$MANIFEST"
  fi
  install -m 0755 "$src" "$dest"
  # conf/docs not executable
  case "$rel" in
    *.conf|*.md) chmod 0644 "$dest" ;;
  esac
  echo "install $rel -> $dest sha=$(checksums "$dest")" >>"$MANIFEST"
  # Pair cutover historically looks under scripts/release; keep a stable symlink
  # from the install layout (tools/release) so both paths resolve.
  if [[ "$rel" == scripts/release/* ]]; then
    mkdir -p /srv/woodright/scripts/release
    local_link="/srv/woodright/scripts/release/$(basename "$rel")"
    if [[ -e "$local_link" || -L "$local_link" ]]; then
      cp -a "$local_link" "$BACKUP/scripts_release_$(basename "$rel").pre-symlink"
      if [[ -e "$local_link" ]]; then
        echo "backup $local_link -> $BACKUP sha=$(checksums "$local_link")" >>"$MANIFEST"
      else
        echo "backup $local_link -> $BACKUP sha=dangling-symlink" >>"$MANIFEST"
      fi
    fi
    ln -sfn "$dest" "$local_link"
    echo "symlink $local_link -> $dest" >>"$MANIFEST"
  fi
done

# Live systemd unit (profile-aware monitor). Backup first; daemon-reload only (no timer start/stop).
if [[ -d /etc/systemd/system ]]; then
  UNIT_SRC="$REPO_ROOT/ops/systemd/woodright-monitor.service"
  UNIT_DST=/etc/systemd/system/woodright-monitor.service
  if [[ -f "$UNIT_DST" ]]; then
    cp -a "$UNIT_DST" "$BACKUP/etc_systemd_woodright-monitor.service"
  fi
  install -m 0644 "$UNIT_SRC" "$UNIT_DST"
  echo "install ops/systemd/woodright-monitor.service -> $UNIT_DST sha=$(checksums "$UNIT_DST")" >>"$MANIFEST"
  if command -v systemctl >/dev/null 2>&1; then
    systemctl daemon-reload
    echo "systemctl_daemon_reload=1" >>"$MANIFEST"
  fi
fi

# Version markers
echo "$SOURCE_SHA" >/srv/woodright/tools/release/INSTALLED_ENV_GOVERNANCE_SHA.txt
echo "$SOURCE_SHA" >/srv/woodright/tools/release/INSTALLED_FROM_MERGE_SHA.txt
cp "$MANIFEST" /srv/woodright/tools/release/ENV_GOVERNANCE_INSTALL_MANIFEST.txt

# Seed public_demo ownership from legacy shared root if empty (metadata copy only)
if [[ ! -f /srv/woodright/runtime-ownership-public-demo/ACTIVE_OWNER.json \
   && -f /srv/woodright/runtime-ownership/ACTIVE_OWNER.json ]]; then
  cp -a /srv/woodright/runtime-ownership/ACTIVE_OWNER.json \
    /srv/woodright/runtime-ownership-public-demo/ACTIVE_OWNER.json
  cp -a /srv/woodright/runtime-ownership/EXPECTED_RELEASE.json \
    /srv/woodright/runtime-ownership-public-demo/EXPECTED_RELEASE.json 2>/dev/null || true
  cp -a /srv/woodright/runtime-ownership/ACTIVE_RELEASE.json \
    /srv/woodright/runtime-ownership-public-demo/ACTIVE_RELEASE.json 2>/dev/null || true
  echo "seeded_public_demo_ownership_from_legacy=1" >>"$MANIFEST"
fi
if [[ ! -f /srv/woodright/runtime-identity-public-demo/ACTIVE_PUBLIC.json \
   && -f /srv/woodright/runtime-identity/ACTIVE_PUBLIC.json ]]; then
  cp -a /srv/woodright/runtime-identity/ACTIVE_PUBLIC.json \
    /srv/woodright/runtime-identity-public-demo/ACTIVE_PUBLIC.json
  echo "seeded_public_demo_identity_from_legacy=1" >>"$MANIFEST"
fi

log "INSTALL_OK source_sha=$SOURCE_SHA backup=$BACKUP"
log "NOTE: application runtime unchanged; digests/containers not mutated"
