#!/usr/bin/env bash
# Verify installed environment-governance tooling matches one source SHA + bundle manifest.
# Fail-closed on mixed checksums, missing files, unexpected symlinks on critical paths,
# or marker/manifest disagreement.
#
# Usage:
#   bash ops/release/verify-environment-governance-bundle.sh \
#     [--ops-root /srv/woodright/ops] \
#     [--expected-sha <40-hex>] \
#     [--manifest /srv/woodright/tools/release/ENV_GOVERNANCE_BUNDLE_MANIFEST.json]
set -euo pipefail

OPS_ROOT="/srv/woodright/ops"
TOOLS_ROOT="/srv/woodright/tools/release"
EXPECTED_SHA=""
MANIFEST=""
MARKER="${TOOLS_ROOT}/INSTALLED_ENV_GOVERNANCE_SHA.txt"

die() { echo "ERROR: $*" >&2; exit 2; }
log() { echo "$*"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ops-root) OPS_ROOT="$2"; shift 2 ;;
    --ops-root=*) OPS_ROOT="${1#--ops-root=}"; shift ;;
    --expected-sha) EXPECTED_SHA="$2"; shift 2 ;;
    --expected-sha=*) EXPECTED_SHA="${1#--expected-sha=}"; shift ;;
    --manifest) MANIFEST="$2"; shift 2 ;;
    --manifest=*) MANIFEST="${1#--manifest=}"; shift ;;
    --marker) MARKER="$2"; shift 2 ;;
    -h|--help) sed -n '1,20p' "$0"; exit 0 ;;
    *) die "unknown arg $1" ;;
  esac
done

[[ -z "$MANIFEST" ]] && MANIFEST="${TOOLS_ROOT}/ENV_GOVERNANCE_BUNDLE_MANIFEST.json"

checksums() {
  local f="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$f" | awk '{print $1}'
  else
    shasum -a 256 "$f" | awk '{print $1}'
  fi
}

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

python3 - "$MANIFEST" "$MARKER_SHA" "$OPS_ROOT" "$TOOLS_ROOT" <<'PY'
import hashlib, json, os, sys
from pathlib import Path

manifest_path, marker_sha, ops_root, tools_root = sys.argv[1:5]
data = json.loads(Path(manifest_path).read_text())
src = data.get("source_sha") or ""
if src != marker_sha:
    print(f"ERROR: manifest source_sha={src} != marker={marker_sha}", file=sys.stderr)
    raise SystemExit(2)
files = data.get("files") or []
if not files:
    print("ERROR: empty bundle files list", file=sys.stderr)
    raise SystemExit(2)

errors = []
for entry in files:
    rel = entry.get("relative_path") or ""
    want = entry.get("sha256") or ""
    role = entry.get("role") or "required"
    dest = entry.get("installed_path") or ""
    if not dest:
        if rel.startswith("ops/"):
            dest = str(Path(ops_root) / rel[len("ops/"):])
        elif rel.startswith("scripts/release/"):
            dest = str(Path(tools_root) / Path(rel).name)
        elif rel.startswith("docs/operator/"):
            dest = f"/srv/woodright/docs/operator/{Path(rel).name}"
        else:
            errors.append(f"unmapped {rel}")
            continue
    p = Path(dest)
    if not p.exists():
        if role == "optional":
            continue
        errors.append(f"missing {dest} ({rel})")
        continue
    if p.is_symlink():
        # Allowed only for documented tools/release compat links, never for critical ops scripts.
        if not str(p).startswith(str(Path(tools_root).parent / "scripts" / "release")):
            errors.append(f"symlink refused {dest}")
            continue
    raw = p.read_bytes()
    got = hashlib.sha256(raw).hexdigest()
    if got != want:
        errors.append(f"checksum mismatch {rel}: have={got} want={want}")
        continue
    mode_want = entry.get("mode")
    if mode_want:
        mode_got = oct(p.stat().st_mode & 0o777)
        if mode_got != mode_want and mode_got != mode_want.lstrip("0") and f"0o{int(mode_want, 8):o}" != mode_got:
            # compare as ints
            try:
                if (p.stat().st_mode & 0o777) != int(str(mode_want), 8):
                    errors.append(f"mode mismatch {rel}: have={mode_got} want={mode_want}")
            except ValueError:
                errors.append(f"mode parse failed {rel}: want={mode_want}")

if errors:
    print("VERIFY_FAIL mixed_or_corrupt_bundle:")
    for e in errors:
        print(f" - {e}")
    raise SystemExit(2)

print(f"VERIFY_OK source_sha={marker_sha} files={len(files)}")
PY
