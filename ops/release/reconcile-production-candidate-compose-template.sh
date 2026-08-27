#!/usr/bin/env bash
# LIVE_MUTATING=true
# requires_global_lock=true
#
# Governed apply of canonical production-candidate compose template onto the
# live Dokploy compose path. Never recreates containers. Never rewrites .env,
# image pins, or EXPECTED_RELEASE.
#
# Source authority: ops/compose/woodright-production.docker-compose.yml from a
# clean git checkout whose HEAD equals --source-sha.
# Target: WOODRIGHT_COMPOSE_FILE from the production profile (not CLI).
#
# Confirmation (execute):
#   I_UNDERSTAND_PRODUCTION_CANDIDATE_COMPOSE_TEMPLATE_RECONCILE
#
# Lock (execute): /srv/woodright/locks/production/live-cutover.lock (flock via
# wr_staging_mutation_lock_acquire). Also documents canonical
# /srv/woodright/locks/live-cutover.lock family.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/woodright-environment-profile.sh
source "$SCRIPT_DIR/../lib/woodright-environment-profile.sh"
# shellcheck source=../lib/woodright-staging-mutation-lock.sh
source "$SCRIPT_DIR/../lib/woodright-staging-mutation-lock.sh"
# shellcheck source=../lib/woodright-compose-env-authority.sh
source "$SCRIPT_DIR/../lib/woodright-compose-env-authority.sh"

CONFIRM_TOKEN='I_UNDERSTAND_PRODUCTION_CANDIDATE_COMPOSE_TEMPLATE_RECONCILE'
CLASSIFY_PY="$SCRIPT_DIR/../lib/woodright-production-compose-template.py"
CANONICAL_REL="ops/compose/woodright-production.docker-compose.yml"
LIVE_TARGET_SUFFIX="/etc/dokploy/compose/woodright-production/code/docker-compose.yml"
MODE="dry-run"
MODE_REQUESTS="|"
SOURCE_SHA=""
REPO_ROOT=""
CONFIRM=""
LOCK_HELD=0
EVIDENCE_DIR=""

die() { echo "ERROR: $*" >&2; exit 2; }
log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }

usage() {
  cat <<EOF
Usage: reconcile-production-candidate-compose-template.sh \\
  --environment production \\
  --source-sha <40-hex> \\
  --repo-root /path/to/clean/checkout \\
  [--dry-run|--execute] \\
  [--confirm-mutation $CONFIRM_TOKEN]

Applies canonical ops/compose/woodright-production.docker-compose.yml onto the
production profile compose file. Does not touch .env or recreate containers.
EOF
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

# Validate staged YAML via docker compose without reading live .env secrets.
validate_staged_compose() {
  local staged="$1"
  if ! command -v docker >/dev/null 2>&1; then
    if [[ "${WOODRIGHT_COMPOSE_TEMPLATE_ALLOW_SKIP_DOCKER_VALIDATE:-0}" == "1" \
      && "${WOODRIGHT_COMPOSE_TEMPLATE_ALLOW_PROFILE_PATH:-0}" == "1" ]]; then
      log "WARN docker not found; skip compose config (harness)"
      return 0
    fi
    die "docker not available for compose validation"
  fi
  local dummy="$EVIDENCE_DIR/compose-validate.env"
  python3 - "$staged" "$dummy" <<'PY'
import re, sys
from pathlib import Path
text = Path(sys.argv[1]).read_text(encoding="utf-8")
keys = sorted(set(re.findall(r"\$\{([A-Z][A-Z0-9_]*)(?::-[^}]*)?\}", text)))
lines = []
for k in keys:
    if "MEMORY" in k:
        val = "640m"
    elif k.endswith("_SOURCE_SHA"):
        val = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    elif k.endswith("_IMAGE"):
        val = "busybox:latest"
    else:
        val = "dummy"
    lines.append(f"{k}={val}\n")
Path(sys.argv[2]).write_text("".join(lines), encoding="utf-8")
PY
  if docker compose --env-file "$dummy" -f "$staged" config >/dev/null; then
    log "COMPOSE_CONFIG_OK staged=$staged"
    return 0
  fi
  die "docker compose config failed for staged template"
}

inspect_env_component_sha_keys() {
  local path="$1"
  local out="$EVIDENCE_DIR/env-component-sha-keys.json"
  local runner=(python3)
  if [[ ! -r "$path" ]] && command -v sudo >/dev/null 2>&1; then
    runner=(sudo -n python3)
  fi
  "${runner[@]}" - "$path" "$out" <<'PY'
import json, re, sys
path, out = sys.argv[1:3]
keys = ("WOODRIGHT_BACKEND_SOURCE_SHA", "WOODRIGHT_STOREFRONT_SOURCE_SHA")
sha40 = re.compile(r"^[0-9a-f]{40}$")
status = {}
try:
    text = open(path, "r", encoding="utf-8").read()
except OSError:
    json.dump({"ok": False, "reason": "unreadable", "keys": {}}, open(out, "w"))
    sys.exit(2)
for key in keys:
    hits = [ln.split("=", 1)[1] if "=" in ln else "" for ln in text.splitlines() if ln.startswith(key + "=")]
    if not hits:
        status[key] = "absent"
    elif len(hits) != 1:
        status[key] = "duplicate"
    elif sha40.fullmatch(hits[0].strip().strip('"').strip("'")):
        status[key] = "sha40"
    else:
        status[key] = "invalid"
json.dump({"ok": True, "reason": "inspected", "keys": status}, open(out, "w"), indent=2, sort_keys=True)
sys.exit(0)
PY
}

copy_file() {
  local src="$1" dest="$2"
  if cp -p "$src" "$dest" 2>/dev/null; then
    return 0
  fi
  if command -v sudo >/dev/null 2>&1 && sudo -n cp -p "$src" "$dest"; then
    return 0
  fi
  return 1
}

cleanup() {
  if [[ "$LOCK_HELD" == "1" ]]; then
    wr_staging_mutation_lock_release || true
    LOCK_HELD=0
  fi
}
trap cleanup EXIT

FULL_ARGV=("$@")
for wr_arg in "${FULL_ARGV[@]-}"; do
  case "$wr_arg" in -h|--help) usage; exit 0 ;; esac
done

wr_require_environment_from_args "${FULL_ARGV[@]}" || exit 1
[[ "${WOODRIGHT_ENVIRONMENT}" == "production" ]] \
  || die "refused --environment '${WOODRIGHT_ENVIRONMENT}' (production only)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --environment) shift 2 ;;
    --environment=*) shift ;;
    --source-sha) SOURCE_SHA="${2:?}"; shift 2 ;;
    --source-sha=*) SOURCE_SHA="${1#--source-sha=}"; shift ;;
    --repo-root) REPO_ROOT="${2:?}"; shift 2 ;;
    --repo-root=*) REPO_ROOT="${1#--repo-root=}"; shift ;;
    --dry-run) MODE="dry-run"; MODE_REQUESTS="${MODE_REQUESTS}dry-run|"; shift ;;
    --execute) MODE="execute"; MODE_REQUESTS="${MODE_REQUESTS}execute|"; shift ;;
    --confirm-mutation) CONFIRM="${2:?}"; shift 2 ;;
    --confirm-mutation=*) CONFIRM="${1#--confirm-mutation=}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown arg: $1" ;;
  esac
done

case "$MODE_REQUESTS" in
  *"|dry-run|"*)
    case "$MODE_REQUESTS" in *"|execute|"*) die "refused conflicting modes" ;; esac
    MODE="dry-run"
    ;;
  *"|execute|"*) MODE="execute" ;;
esac

[[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]] || die "missing/invalid --source-sha"
[[ -n "$REPO_ROOT" && -d "$REPO_ROOT" ]] || die "missing --repo-root"
[[ -e "$REPO_ROOT/.git" || -d "$REPO_ROOT/.git" ]] || die "repo-root is not a git checkout"
HEAD="$(git -C "$REPO_ROOT" rev-parse HEAD)"
[[ "$HEAD" == "$SOURCE_SHA" ]] || die "source HEAD=$HEAD != --source-sha=$SOURCE_SHA"
git -C "$REPO_ROOT" diff --quiet -- "$CANONICAL_REL" \
  || die "canonical compose working tree is dirty vs HEAD"
git -C "$REPO_ROOT" diff --cached --quiet -- "$CANONICAL_REL" \
  || die "canonical compose index is dirty"

[[ -n "${WOODRIGHT_EVIDENCE_ROOT:-}" ]] || die "profile missing WOODRIGHT_EVIDENCE_ROOT"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE_DIR="${WOODRIGHT_EVIDENCE_ROOT%/}/compose-template-reconcile-$TS-$$"
mkdir -p "$EVIDENCE_DIR"

CANONICAL="$EVIDENCE_DIR/canonical-from-git.docker-compose.yml"
if ! git -C "$REPO_ROOT" show "${SOURCE_SHA}:${CANONICAL_REL}" >"$CANONICAL"; then
  die "cannot read git blob ${SOURCE_SHA}:${CANONICAL_REL}"
fi
WT_CANON="$REPO_ROOT/$CANONICAL_REL"
[[ -f "$WT_CANON" && ! -L "$WT_CANON" ]] || die "working-tree canonical missing: $WT_CANON"
[[ "$(sha256_of "$WT_CANON")" == "$(sha256_of "$CANONICAL")" ]] \
  || die "working-tree canonical differs from git blob at $SOURCE_SHA"

TARGET="${WOODRIGHT_COMPOSE_FILE:-}"
[[ -n "$TARGET" ]] || die "profile missing WOODRIGHT_COMPOSE_FILE"
[[ -f "$TARGET" && ! -L "$TARGET" ]] || die "live compose missing or symlink: $TARGET"
RESOLVED="$(realpath "$TARGET" 2>/dev/null || true)"
[[ -n "$RESOLVED" && -f "$RESOLVED" && ! -L "$RESOLVED" ]] \
  || die "cannot resolve compose target to a regular non-symlink file"
case "$RESOLVED" in
  "$LIVE_TARGET_SUFFIX") ;;
  /tmp/*"$LIVE_TARGET_SUFFIX"|/private/tmp/*"$LIVE_TARGET_SUFFIX")
    [[ "${WOODRIGHT_COMPOSE_TEMPLATE_ALLOW_PROFILE_PATH:-0}" == "1" ]] \
      || die "refused non-canonical compose target: $RESOLVED"
    ;;
  *)
    die "refused compose target (must be Dokploy production compose path): $RESOLVED"
    ;;
esac
TARGET="$RESOLVED"

ENV_FILE="${WOODRIGHT_COMPOSE_ENV_FILE:-}"
[[ -n "$ENV_FILE" ]] || die "profile missing WOODRIGHT_COMPOSE_ENV_FILE"

python3 "$CLASSIFY_PY" required-keys "$CANONICAL" >/dev/null \
  || die "canonical compose missing required component SHA interpolations"

CLASS_JSON="$(python3 "$CLASSIFY_PY" classify "$TARGET" "$CANONICAL")"
CLASS="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["class"])' "$CLASS_JSON")"
LIVE_HASH="$(sha256_of "$TARGET")"
CANON_HASH="$(sha256_of "$CANONICAL")"
ENV_HASH_BEFORE=""
if [[ -r "$ENV_FILE" ]]; then
  ENV_HASH_BEFORE="$(sha256_of "$ENV_FILE")"
elif command -v sudo >/dev/null 2>&1; then
  ENV_HASH_BEFORE="$(sudo -n sha256sum "$ENV_FILE" 2>/dev/null | awk '{print $1}' || true)"
fi
inspect_env_component_sha_keys "$ENV_FILE" || true
ENV_KEYS_FILE="$EVIDENCE_DIR/env-component-sha-keys.json"
python3 - "$ENV_KEYS_FILE" <<'PY' || die "compose .env component SHA keys invalid (values not printed)"
import json, sys
from pathlib import Path
p = Path(sys.argv[1])
if not p.is_file():
    sys.exit(0)
data = json.loads(p.read_text())
keys = data.get("keys") or {}
bad = [k for k, v in keys.items() if v in ("invalid", "duplicate")]
sys.exit(1 if bad else 0)
PY

printf '%s\n' "$CLASS_JSON" >"$EVIDENCE_DIR/classify.json"
printf '%s\n' "$LIVE_HASH" >"$EVIDENCE_DIR/live-sha256-before.txt"
printf '%s\n' "$CANON_HASH" >"$EVIDENCE_DIR/canonical-sha256.txt"
cp -p "$CANONICAL" "$EVIDENCE_DIR/canonical.docker-compose.yml"
cp -p "$TARGET" "$EVIDENCE_DIR/live-before.docker-compose.yml"

emit_packet() {
  local verdict="$1" backup="${2:-}" after="${3:-$LIVE_HASH}"
  python3 - "$verdict" "$backup" "$after" <<PY
import json, os, sys
verdict, backup, after = sys.argv[1:4]
print(json.dumps({
  "tool": "reconcile-production-candidate-compose-template.sh",
  "mode": os.environ["WR_CT_MODE"],
  "verdict": verdict,
  "source_sha": os.environ["WR_CT_SHA"],
  "repo_root": os.environ["WR_CT_REPO"],
  "canonical_path": os.environ["WR_CT_CANON"],
  "target_path": os.environ["WR_CT_TARGET"],
  "env_file": os.environ["WR_CT_ENV"],
  "class": os.environ["WR_CT_CLASS"],
  "canonical_sha256": os.environ["WR_CT_CANON_HASH"],
  "live_sha256_before": os.environ["WR_CT_LIVE_BEFORE"],
  "live_sha256_after": after,
  "env_sha256_before": os.environ.get("WR_CT_ENV_HASH", ""),
  "env_sha256_known": bool(os.environ.get("WR_CT_ENV_HASH", "")),
  "component_sha_env_keys": (
    json.load(open(os.environ["WR_CT_ENV_KEYS_FILE"])).get("keys") or {}
    if os.environ.get("WR_CT_ENV_KEYS_FILE") and os.path.isfile(os.environ["WR_CT_ENV_KEYS_FILE"])
    else {}
  ),
  "backup_path": backup,
  "evidence_dir": os.environ["WR_CT_EVIDENCE"],
  "rollback": {
    "method": "wr_compose_env_atomic_install",
    "backup_path": backup,
    "target_path": os.environ["WR_CT_TARGET"],
    "allowed_parent": os.environ.get("WR_CT_PARENT", ""),
  },
  "containers_mutated": False,
  "env_file_mutated": False if os.environ.get("WR_CT_ENV_HASH") else None,
  "image_pins_mutated": False,
  "expected_release_mutated": False,
}, indent=2, sort_keys=True))
PY
}

export WR_CT_MODE="$MODE" WR_CT_SHA="$SOURCE_SHA" WR_CT_REPO="$REPO_ROOT" \
  WR_CT_CANON="$CANONICAL" WR_CT_TARGET="$TARGET" WR_CT_ENV="$ENV_FILE" \
  WR_CT_CLASS="$CLASS" WR_CT_CANON_HASH="$CANON_HASH" WR_CT_LIVE_BEFORE="$LIVE_HASH" \
  WR_CT_ENV_HASH="${ENV_HASH_BEFORE:-}" WR_CT_EVIDENCE="$EVIDENCE_DIR" \
  WR_CT_PARENT="$(dirname "$TARGET")" WR_CT_ENV_KEYS_FILE="${ENV_KEYS_FILE:-}"

case "$CLASS" in
  unexpected_drift)
    log "UNEXPECTED_LIVE_COMPOSE_DRIFT refusing apply"
    emit_packet "unexpected_drift"
    die "UNEXPECTED_LIVE_COMPOSE_DRIFT (see $EVIDENCE_DIR/classify.json)"
    ;;
  already_reconciled)
    log "already reconciled live=$LIVE_HASH canonical=$CANON_HASH"
    emit_packet "already_reconciled"
    exit 0
    ;;
  known_pre_reconcile_gap|allowed_cosmetic_drift) ;;
  *)
    die "unknown classify class: $CLASS"
    ;;
esac

if [[ "$MODE" == "dry-run" ]]; then
  log "DRY_RUN_OK would apply canonical compose sha256=$CANON_HASH onto $TARGET class=$CLASS"
  emit_packet "dry_run_ok"
  exit 0
fi

[[ "$CONFIRM" == "$CONFIRM_TOKEN" ]] || die "execute requires --confirm-mutation $CONFIRM_TOKEN"
[[ -n "$ENV_HASH_BEFORE" ]] || die "execute requires a sha256 of compose .env (hash only; sudo -n if needed)"

LOCK_PATH="${WOODRIGHT_MUTATION_LOCK_PATH:-/srv/woodright/locks/production/live-cutover.lock}"
case "$LOCK_PATH" in
  */locks/production/live-cutover.lock) ;;
  *) die "refused non-canonical production lock path: $LOCK_PATH" ;;
esac
export WR_STAGING_MUTATION_LOCK_PATH="$LOCK_PATH"
WR_STAGING_MUTATION_LOCK_DIR="$(dirname "$LOCK_PATH")"
WR_STAGING_MUTATION_LOCK_META="${LOCK_PATH}.meta"
wr_staging_mutation_lock_acquire \
  "actor=${WOODRIGHT_OPERATOR:-unknown}" \
  "command=$0 --environment production --execute" \
  "target=production-candidate-compose-template" \
  || die "could not acquire production mutation lock"
LOCK_HELD=1

# Re-classify under lock (CAS against unexpected edit).
CLASS_JSON="$(python3 "$CLASSIFY_PY" classify "$TARGET" "$CANONICAL")"
CLASS="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["class"])' "$CLASS_JSON")"
LIVE_HASH_LOCKED="$(sha256_of "$TARGET")"
[[ "$LIVE_HASH_LOCKED" == "$LIVE_HASH" ]] || die "LIVE_COMPOSE_HASH_DRIFT under lock before=$LIVE_HASH now=$LIVE_HASH_LOCKED"
case "$CLASS" in
  already_reconciled)
    wr_staging_mutation_lock_release || true
    LOCK_HELD=0
    emit_packet "already_reconciled"
    exit 0
    ;;
  known_pre_reconcile_gap|allowed_cosmetic_drift) ;;
  *) die "UNEXPECTED_LIVE_COMPOSE_DRIFT under lock class=$CLASS" ;;
esac

BACKUP="$EVIDENCE_DIR/docker-compose.yml.bak-$TS"
copy_file "$TARGET" "$BACKUP" || die "backup failed"
printf '%s\n' "$(sha256_of "$BACKUP")" >"$EVIDENCE_DIR/backup-sha256.txt"
[[ "$(sha256_of "$BACKUP")" == "$LIVE_HASH" ]] || die "backup hash mismatch"

STAGE="$EVIDENCE_DIR/docker-compose.yml.staged"
copy_file "$CANONICAL" "$STAGE" || die "stage canonical failed"
[[ "$(sha256_of "$STAGE")" == "$CANON_HASH" ]] || die "staged hash mismatch"
validate_staged_compose "$STAGE"

PARENT="$(dirname "$TARGET")"
wr_compose_env_atomic_install "$STAGE" "$TARGET" "$PARENT" \
  || die "atomic install of canonical compose failed"

AFTER="$(sha256_of "$TARGET")"
[[ "$AFTER" == "$CANON_HASH" ]] || die "post-apply hash mismatch have=$AFTER want=$CANON_HASH"

ENV_HASH_AFTER="${ENV_HASH_BEFORE:-}"
if [[ -n "$ENV_HASH_BEFORE" ]]; then
  if [[ -r "$ENV_FILE" ]]; then
    ENV_HASH_AFTER="$(sha256_of "$ENV_FILE")"
  elif command -v sudo >/dev/null 2>&1; then
    ENV_HASH_AFTER="$(sudo -n sha256sum "$ENV_FILE" 2>/dev/null | awk '{print $1}' || true)"
  fi
  [[ "$ENV_HASH_AFTER" == "$ENV_HASH_BEFORE" ]] || die "env file hash changed (refusing silent .env mutation)"
fi

printf '%s\n' "$AFTER" >"$EVIDENCE_DIR/live-sha256-after.txt"
log "APPLY_OK live=$AFTER backup=$BACKUP"
wr_staging_mutation_lock_release || true
LOCK_HELD=0
emit_packet "applied" "$BACKUP" "$AFTER"
exit 0
