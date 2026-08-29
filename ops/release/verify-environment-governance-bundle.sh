#!/usr/bin/env bash
# Verify installed environment-governance tooling matches one source SHA + bundle manifest.
# Fail-closed on mixed checksums, missing files, unexpected symlinks on critical paths,
# truncated manifests, redirected installed_path, or marker/manifest disagreement.
#
# Usage:
#   bash ops/release/verify-environment-governance-bundle.sh \
#     [--ops-root /srv/woodright/ops] \
#     [--expected-sha <40-hex>] \
#     [--manifest /srv/woodright/tools/release/ENV_GOVERNANCE_BUNDLE_MANIFEST.json]
set -euo pipefail

OPS_ROOT="/srv/woodright/ops"
TOOLS_ROOT="/srv/woodright/tools/release"
DOCS_ROOT="/srv/woodright/docs/operator"
EXPECTED_SHA=""
MANIFEST=""
MARKER=""
ALLOW_IN_PROGRESS=0

die() { echo "ERROR: $*" >&2; exit 2; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ops-root) OPS_ROOT="$2"; shift 2 ;;
    --ops-root=*) OPS_ROOT="${1#--ops-root=}"; shift ;;
    --expected-sha) EXPECTED_SHA="$2"; shift 2 ;;
    --expected-sha=*) EXPECTED_SHA="${1#--expected-sha=}"; shift ;;
    --manifest) MANIFEST="$2"; shift 2 ;;
    --manifest=*) MANIFEST="${1#--manifest=}"; shift ;;
    --marker) MARKER="$2"; shift 2 ;;
    --tools-root) TOOLS_ROOT="$2"; shift 2 ;;
    --docs-root) DOCS_ROOT="$2"; shift 2 ;;
    --allow-in-progress) ALLOW_IN_PROGRESS=1; shift ;;
    -h|--help) sed -n '1,20p' "$0"; exit 0 ;;
    *) die "unknown arg $1" ;;
  esac
done

if [[ "$OPS_ROOT" != "/srv/woodright/ops" ]]; then
  wr_parent="$(cd "$(dirname "$OPS_ROOT")" && pwd)"
  TOOLS_ROOT="${WOODRIGHT_INSTALL_TOOLS_ROOT:-$wr_parent/tools/release}"
  DOCS_ROOT="${WOODRIGHT_INSTALL_DOCS_ROOT:-$wr_parent/docs/operator}"
fi
[[ -n "$MANIFEST" ]] || MANIFEST="${TOOLS_ROOT}/ENV_GOVERNANCE_BUNDLE_MANIFEST.json"
[[ -n "$MARKER" ]] || MARKER="${TOOLS_ROOT}/INSTALLED_ENV_GOVERNANCE_SHA.txt"
IN_PROGRESS="${TOOLS_ROOT}/ENV_GOVERNANCE_INSTALL_IN_PROGRESS.json"

if [[ "$ALLOW_IN_PROGRESS" != "1" && -f "$IN_PROGRESS" ]]; then
  die "incomplete or in-progress governance install detected: $IN_PROGRESS (refuse verify until install completes or is restored)"
fi

[[ -f "$MARKER" ]] || die "missing marker: $MARKER"
[[ -f "$MANIFEST" ]] || die "missing bundle manifest: $MANIFEST"
[[ ! -L "$MARKER" ]] || die "marker must be regular file (symlink refused): $MARKER"
[[ ! -L "$MANIFEST" ]] || die "manifest must be regular file (symlink refused): $MANIFEST"

MARKER_SHA="$(tr -d '[:space:]' <"$MARKER")"
[[ "$MARKER_SHA" =~ ^[0-9a-f]{40}$ ]] || die "invalid marker sha: $MARKER_SHA"
if [[ -n "$EXPECTED_SHA" ]]; then
  [[ "$EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]] || die "invalid --expected-sha"
  [[ "$MARKER_SHA" == "$EXPECTED_SHA" ]] || die "marker mismatch have=$MARKER_SHA want=$EXPECTED_SHA"
fi

# Canonical required relative paths (must stay in sync with installer FILES).
REQUIRED_JSON='[
  "ops/lib/woodright-environment-profile.sh",
  "ops/lib/woodright-host-publish.sh",
  "ops/lib/woodright-component-authority.sh",
  "ops/lib/woodright-oci-provenance.sh",
  "ops/lib/woodright-validation-freeze.sh",
  "ops/lib/woodright-hold-validation-freeze.sh",
  "ops/lib/woodright-staging-mutation-lock.sh",
  "ops/lib/woodright-runtime-discovery.sh",
  "ops/lib/woodright-component-expected-identity.sh",
  "ops/lib/woodright-cutover-common.sh",
  "ops/lib/woodright-public-demo-traefik-endpoint.py",
  "ops/lib/woodright-install-provenance.sh",
  "ops/lib/woodright-compose-service-recreate.sh",
  "ops/lib/woodright-compose-env-authority.sh",
  "ops/lib/woodright-production-release-sha-reconcile.sh",
  "ops/lib/woodright-public-demo-metadata-authority.sh",
  "ops/lib/woodright-owner-approved-release.sh",
  "ops/lib/woodright-ops-path-isolation.sh",
  "ops/lib/woodright-alert-contract.sh",
  "ops/lib/woodright-recovery-point.sh",
  "ops/lib/woodright-memory-limits.sh",
  "ops/lib/woodright-recreate-mode.sh",
  "ops/lib/woodright-production-ownership-access.sh",
  "ops/lib/woodright-production-compose-template.py",
  "ops/config/runtime-environments/public_demo.conf",
  "ops/config/runtime-environments/staging.conf",
  "ops/config/runtime-environments/production.conf",
  "ops/config/runtime-environments/public_production.conf",
  "ops/compose/woodright-production.docker-compose.yml",
  "ops/release/recreate-staging-backend-with-media.sh",
  "ops/release/recreate-staging-storefront.sh",
  "ops/release/cutover-public-demo-pair.sh",
  "ops/release/apply-public-demo-traefik-endpoints.sh",
  "ops/release/cutover-production-candidate.sh",
  "ops/release/cutover-public-production-pair.sh",
  "ops/release/cutover-public-apex-routing.sh",
  "ops/config/public-launch/traefik-public-production.yml",
  "ops/release/recover-production-candidate-skew.sh",
  "ops/release/reconcile-production-candidate-metadata.sh",
  "ops/release/reconcile-production-candidate-component-identities.sh",
  "ops/release/reconcile-production-candidate-compose-template.sh",
  "ops/release/reconcile-production-release-sha.sh",
  "ops/release/reconcile-public-demo-metadata.sh",
  "ops/release/reconcile-owner-approved-release.sh",
  "ops/release/public-demo-critical-http-smoke.sh",
  "ops/release/rollback-staging-backend-from-keeper.sh",
  "ops/release/rollback-staging-storefront-from-keeper.sh",
  "ops/release/verify-backend-media-mount.sh",
  "ops/release/reconcile-runtime-manifests.sh",
  "ops/release/assert-manifest-update-allowed.sh",
  "ops/release/install-environment-governance.sh",
  "ops/release/verify-environment-governance-bundle.sh",
  "ops/monitoring/woodright-health-check.sh",
  "ops/monitoring/woodright-host-publish-check.sh",
  "ops/backup/lib/woodright-backup-root.sh",
  "ops/backup/woodright-postgres-backup.sh",
  "ops/backup/woodright-media-backup.sh",
  "ops/backup/woodright-backup-retention.sh",
  "ops/backup/woodright-public-production-backup-run.sh",
  "ops/backup/woodright-public-production-restore-rehearsal.sh",
  "ops/systemd/woodright-monitor.service",
  "ops/systemd/woodright-monitor-production-candidate.service",
  "ops/systemd/woodright-monitor-public-production.service",
  "ops/systemd/woodright-monitor-public-production.timer",
  "ops/systemd/woodright-backup-public-production.service",
  "ops/systemd/woodright-backup-public-production.timer",
  "ops/systemd/woodright-restore-rehearsal-public-production.service",
  "scripts/release/reconcile-public-image-pins.sh",
  "scripts/release/restart-active-digest-only.sh",
  "docs/operator/environment-scoped-release-governance.md",
  "docs/operator/backend-media-promotion-gate.md",
  "docs/operator/production-candidate-rollback.md",
  "docs/operator/public-production-pair-cutover.md",
  "docs/operator/public-apex-cutover.md",
  "docs/operator/production-helper-install-provenance.md",
  "docs/operator/production-candidate-authority-reconcile.md",
  "docs/operator/owner-approved-release-governance.md",
  "docs/operator/public-production-monitor-backup-recovery.md",
  "docs/operator/runtime-ownership.md"
]'

python3 - "$MANIFEST" "$MARKER_SHA" "$OPS_ROOT" "$TOOLS_ROOT" "$DOCS_ROOT" "$REQUIRED_JSON" <<'PY'
import hashlib, json, sys
from pathlib import Path

manifest_path, marker_sha, ops_root, tools_root, docs_root, required_json = sys.argv[1:7]
required = json.loads(required_json)
data = json.loads(Path(manifest_path).read_text())
src = data.get("source_sha") or ""
if src != marker_sha:
    print(f"ERROR: manifest source_sha={src} != marker={marker_sha}", file=sys.stderr)
    raise SystemExit(2)
files = data.get("files") or []
if not files:
    print("ERROR: empty bundle files list", file=sys.stderr)
    raise SystemExit(2)

def derived_dest(rel: str) -> str:
    if rel.startswith("ops/"):
        return str(Path(ops_root) / rel[len("ops/"):])
    if rel.startswith("scripts/release/"):
        return str(Path(tools_root) / Path(rel).name)
    if rel.startswith("docs/operator/"):
        return str(Path(docs_root) / Path(rel).name)
    raise ValueError(f"unmapped {rel}")

by_rel = {}
errors = []
for entry in files:
    rel = entry.get("relative_path") or ""
    if not rel:
        errors.append("entry missing relative_path")
        continue
    if rel in by_rel:
        errors.append(f"duplicate relative_path {rel}")
        continue
    by_rel[rel] = entry
    derived = derived_dest(rel)
    claimed = entry.get("installed_path") or ""
    if claimed and claimed != derived:
        errors.append(f"redirected installed_path refused {rel}: claimed={claimed} derived={derived}")
        continue
    want = entry.get("sha256") or ""
    p = Path(derived)
    if not p.exists():
        errors.append(f"missing {derived} ({rel})")
        continue
    if p.is_symlink():
        errors.append(f"symlink refused {derived}")
        continue
    got = hashlib.sha256(p.read_bytes()).hexdigest()
    if got != want:
        errors.append(f"checksum mismatch {rel}: have={got} want={want}")
        continue
    mode_want = entry.get("mode")
    if mode_want:
        try:
            if (p.stat().st_mode & 0o777) != int(str(mode_want), 8):
                errors.append(f"mode mismatch {rel}: have={oct(p.stat().st_mode & 0o777)} want={mode_want}")
        except ValueError:
            errors.append(f"mode parse failed {rel}: want={mode_want}")

missing_required = [r for r in required if r not in by_rel]
if missing_required:
    for r in missing_required:
        errors.append(f"manifest missing required relative_path {r}")

extra = [r for r in by_rel if r not in required]
if extra:
    for r in extra:
        errors.append(f"manifest extra relative_path refused {r}")

if len(by_rel) != len(required):
    errors.append(f"manifest_size_mismatch have={len(by_rel)} want={len(required)}")

if errors:
    print("VERIFY_FAIL mixed_or_corrupt_bundle:")
    for e in errors:
        print(f" - {e}")
    raise SystemExit(2)

print(f"VERIFY_OK source_sha={marker_sha} files={len(by_rel)}")
PY

# Legacy compatibility mirrors must equal the canonical governance marker.
# WR root is derived from --ops-root (parent of ops/), not from a stale
# WOODRIGHT_INSTALL_WR_ROOT inherited from the calling shell - harnesses and
# disposable installs would otherwise check /srv/woodright by accident.
if [[ -f "${OPS_ROOT}/lib/woodright-install-provenance.sh" ]]; then
  # shellcheck source=ops/lib/woodright-install-provenance.sh
  source "${OPS_ROOT}/lib/woodright-install-provenance.sh"
  WR_PARENT="$(cd "$(dirname "$OPS_ROOT")" && pwd)"
  if [[ "$OPS_ROOT" == "/srv/woodright/ops" ]]; then
    VERIFY_WR_ROOT="${WOODRIGHT_INSTALL_WR_ROOT:-/srv/woodright}"
  else
    VERIFY_WR_ROOT="$WR_PARENT"
  fi
  if ! wr_install_provenance_verify_mirrors "$MARKER_SHA" "$VERIFY_WR_ROOT" "$TOOLS_ROOT"; then
    die "governance provenance mirrors diverge from canonical marker $MARKER_SHA"
  fi
fi
