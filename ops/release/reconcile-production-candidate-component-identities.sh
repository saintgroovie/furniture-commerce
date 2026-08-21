#!/usr/bin/env bash
# LIVE_MUTATING=true
# requires_global_lock=true
#
# Lock: wr_staging_mutation_lock_acquire (flock/fcntl) on the production
# live-cutover.lock from the loaded profile.
#
# Metadata-only rebind of production-candidate EXPECTED_RELEASE component
# identities. Does not recreate containers, rewrite compose pins, or deploy.
#
# Use after a single-component cutover that blanked the untouched peer in
# EXPECTED_RELEASE, once live digest + OCI revision have been proven.
#
# Confirmation (execute):
#   I_UNDERSTAND_PRODUCTION_COMPONENT_IDENTITY_REBIND
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/woodright-environment-profile.sh
source "$SCRIPT_DIR/../lib/woodright-environment-profile.sh"
# shellcheck source=../lib/woodright-staging-mutation-lock.sh
source "$SCRIPT_DIR/../lib/woodright-staging-mutation-lock.sh"
# shellcheck source=../lib/woodright-production-ownership-access.sh
source "$SCRIPT_DIR/../lib/woodright-production-ownership-access.sh"
# shellcheck source=../lib/woodright-cutover-common.sh
source "$SCRIPT_DIR/../lib/woodright-cutover-common.sh"

CONFIRM_TOKEN='I_UNDERSTAND_PRODUCTION_COMPONENT_IDENTITY_REBIND'
MODE="dry-run"
MODE_REQUESTS="|"
SF_REF=""
BE_REF=""
SF_SHA=""
BE_SHA=""
APP_SHA=""
CONFIRM=""
LOCK_HELD=0
EVIDENCE_DIR=""
STATE="prepared"

die() { echo "ERROR: $*" >&2; exit 2; }
log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }

usage() {
  cat <<EOF
Usage: reconcile-production-candidate-component-identities.sh \\
  --environment production \\
  --storefront-ref ghcr.io/saintgroovie/woodright-storefront@sha256:<64hex> \\
  --backend-ref ghcr.io/saintgroovie/woodright-backend@sha256:<64hex> \\
  --storefront-source-sha <40hex> \\
  --backend-source-sha <40hex> \\
  --application-source-sha <40hex> \\
  [--dry-run|--execute] \\
  [--confirm-mutation $CONFIRM_TOKEN]

CAS: each ref and source SHA must match the live container Config.Image digest
and org.opencontainers.image.revision. Disagreement is LIVE_COMPONENT_IDENTITY_DRIFT.
No container recreate. No compose pin rewrite.
EOF
}

require_full_sha() {
  [[ "${1:-}" =~ ^[0-9a-f]{40}$ ]] || die "refused non-40-hex SHA for $2: '${1:-}'"
}

require_immutable_ref() {
  local ref="${1:-}" kind="${2:-}"
  [[ "$ref" == ghcr.io/saintgroovie/woodright-*@sha256:* ]] || die "refused mutable/non-ghcr $kind ref"
  local dig="${ref##*@}"
  [[ "$dig" =~ ^sha256:[0-9a-f]{64}$ ]] || die "refused non-digest $kind ref"
}

record_state() {
  STATE="$1"
  [[ -n "$EVIDENCE_DIR" ]] || return 0
  mkdir -p "$EVIDENCE_DIR" 2>/dev/null || true
  printf '%s\n' "$STATE" >"$EVIDENCE_DIR/state.txt"
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$STATE" >>"$EVIDENCE_DIR/state-transitions.log"
}

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
    --storefront-ref) SF_REF="${2:?}"; shift 2 ;;
    --storefront-ref=*) SF_REF="${1#--storefront-ref=}"; shift ;;
    --backend-ref) BE_REF="${2:?}"; shift 2 ;;
    --backend-ref=*) BE_REF="${1#--backend-ref=}"; shift ;;
    --storefront-source-sha) SF_SHA="${2:?}"; shift 2 ;;
    --storefront-source-sha=*) SF_SHA="${1#--storefront-source-sha=}"; shift ;;
    --backend-source-sha) BE_SHA="${2:?}"; shift 2 ;;
    --backend-source-sha=*) BE_SHA="${1#--backend-source-sha=}"; shift ;;
    --application-source-sha) APP_SHA="${2:?}"; shift 2 ;;
    --application-source-sha=*) APP_SHA="${1#--application-source-sha=}"; shift ;;
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

require_immutable_ref "$SF_REF" storefront
require_immutable_ref "$BE_REF" backend
require_full_sha "$SF_SHA" storefront-source-sha
require_full_sha "$BE_SHA" backend-source-sha
require_full_sha "$APP_SHA" application-source-sha
[[ "$APP_SHA" == "$SF_SHA" || "$APP_SHA" == "$BE_SHA" ]] \
  || die "application_source_sha must equal storefront_source_sha or backend_source_sha (informational mutated SHA)"
[[ "${SF_REF##*@}" != "${BE_REF##*@}" ]] || die "backend and storefront digests must differ"

if [[ "$MODE" == "execute" ]]; then
  [[ "$CONFIRM" == "$CONFIRM_TOKEN" ]] || die "execute requires --confirm-mutation $CONFIRM_TOKEN"
fi

LOCK_PATH="${WOODRIGHT_MUTATION_LOCK_PATH:-/srv/woodright/locks/production/live-cutover.lock}"
case "$LOCK_PATH" in
  */locks/production/live-cutover.lock) ;;
  *) die "refused non-canonical production lock path: $LOCK_PATH" ;;
esac
export WR_STAGING_MUTATION_LOCK_PATH="$LOCK_PATH"
WR_STAGING_MUTATION_LOCK_DIR="$(dirname "$LOCK_PATH")"
WR_STAGING_MUTATION_LOCK_META="${LOCK_PATH}.meta"
OWN_DIR="${WOODRIGHT_OWNERSHIP_DIR%/}"
SF_NAME="${WOODRIGHT_SF_CONTAINER_DEFAULT}"
BE_NAME="${WOODRIGHT_BE_CONTAINER_DEFAULT}"
[[ -n "$OWN_DIR" && -n "$SF_NAME" && -n "$BE_NAME" ]] || die "production profile incomplete"

live_ref() {
  local name="$1"
  local ref
  ref="$("${WOODRIGHT_DOCKER_BIN:-docker}" inspect "$name" --format '{{.Config.Image}}' 2>/dev/null || true)"
  printf '%s\n' "$ref"
}

live_rev() {
  "${WOODRIGHT_DOCKER_BIN:-docker}" inspect "$1" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null || true
}

cas_live() {
  local kind="$1" name="$2" want_ref="$3" want_sha="$4"
  local have_ref have_sha
  have_ref="$(live_ref "$name")"
  have_sha="$(live_rev "$name")"
  if [[ "$have_ref" != "$want_ref" ]]; then
    log "LIVE_COMPONENT_IDENTITY_DRIFT $kind ref live='$have_ref' want='$want_ref'"
    return 1
  fi
  if [[ "$have_sha" != "$want_sha" ]]; then
    log "LIVE_COMPONENT_IDENTITY_DRIFT $kind revision live='$have_sha' want='$want_sha'"
    return 1
  fi
  return 0
}

cas_live storefront "$SF_NAME" "$SF_REF" "$SF_SHA" || die "LIVE_COMPONENT_IDENTITY_DRIFT storefront"
cas_live backend "$BE_NAME" "$BE_REF" "$BE_SHA" || die "LIVE_COMPONENT_IDENTITY_DRIFT backend"

if [[ "$MODE" == "dry-run" ]]; then
  log "DRY_RUN_OK component identity rebind would write EXPECTED pair without mutating containers"
  python3 - <<PY
import json
print(json.dumps({
  "verdict": "DRY_RUN_OK",
  "storefront_image": "$SF_REF",
  "storefront_source_sha": "$SF_SHA",
  "backend_image": "$BE_REF",
  "backend_source_sha": "$BE_SHA",
  "application_source_sha": "$APP_SHA",
  "no_lock_held": True,
}, indent=2))
PY
  exit 0
fi

TS="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE_DIR="${WOODRIGHT_EVIDENCE_DIR:-/srv/woodright/reports/production/component-identity-rebind-$TS}"
mkdir -p "$EVIDENCE_DIR"/{json,before,after,staging}
record_state prepared

for f in ACTIVE_RELEASE.json ACTIVE_OWNER.json EXPECTED_RELEASE.json; do
  [[ -f "$OWN_DIR/$f" ]] || die "missing $OWN_DIR/$f"
done

if [[ "${WOODRIGHT_REBIND_FAULT:-}" == "prelock_expected_swap" ]]; then
  python3 - "$OWN_DIR/EXPECTED_RELEASE.json" <<'PY'
import json, sys
path = sys.argv[1]
doc = json.load(open(path))
doc["helper_install_sha"] = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
json.dump(doc, open(path, "w"), indent=2)
PY
fi

wr_staging_mutation_lock_acquire actor=reconcile-production-candidate-component-identities command="$0" || die "lock contention"
LOCK_HELD=1
trap 'if [[ "$LOCK_HELD" == "1" ]]; then wr_staging_mutation_lock_release || true; LOCK_HELD=0; fi' EXIT

cas_live storefront "$SF_NAME" "$SF_REF" "$SF_SHA" || die "LIVE_COMPONENT_IDENTITY_DRIFT storefront under lock"
cas_live backend "$BE_NAME" "$BE_REF" "$BE_SHA" || die "LIVE_COMPONENT_IDENTITY_DRIFT backend under lock"

for f in ACTIVE_RELEASE.json ACTIVE_OWNER.json EXPECTED_RELEASE.json; do
  cp -a "$OWN_DIR/$f" "$EVIDENCE_DIR/before/$f"
done

python3 - "$OWN_DIR" "$EVIDENCE_DIR/staging" "$APP_SHA" "$SF_REF" "$SF_SHA" "$BE_REF" "$BE_SHA" <<'PY'
import json, pathlib, sys, datetime, re
own, staging, app, sf_ref, sf_sha, be_ref, be_sha = sys.argv[1:8]
DIGEST_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
SHA_RE = re.compile(r"^[0-9a-f]{40}$")
assert DIGEST_RE.match(sf_ref.split("@")[-1]) and DIGEST_RE.match(be_ref.split("@")[-1])
assert SHA_RE.match(sf_sha) and SHA_RE.match(be_sha) and SHA_RE.match(app)
staging = pathlib.Path(staging)
staging.mkdir(parents=True, exist_ok=True)
now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
for name in ("ACTIVE_RELEASE.json", "ACTIVE_OWNER.json", "EXPECTED_RELEASE.json"):
    doc = json.loads((pathlib.Path(own) / name).read_text())
    doc["application_source_sha"] = app
    doc["updated_at_utc"] = now
    doc["metadata_correction_reason"] = "component_identity_rebind"
    doc["metadata_correction_at_utc"] = now
    if name != "ACTIVE_OWNER.json":
        doc["storefront_image"] = sf_ref
        doc["backend_image"] = be_ref
    if name == "EXPECTED_RELEASE.json":
        doc["storefront_digest"] = sf_ref.split("@")[-1]
        doc["backend_digest"] = be_ref.split("@")[-1]
        doc["storefront_source_sha"] = sf_sha
        doc["backend_source_sha"] = be_sha
        doc["schema"] = doc.get("schema") or "woodright.production_candidate.expected_release.v1"
    out = staging / name
    out.write_text(json.dumps(doc, indent=2, sort_keys=True) + "\n")
    out.chmod(0o600)
print("staged_ok")
PY

atomic_install() {
  local src="$1" dest="$2"
  local tmp
  tmp="$(mktemp "${dest}.tmp.XXXXXX")"
  cp "$src" "$tmp"
  chmod 0600 "$tmp"
  mv -f "$tmp" "$dest"
  wr_prod_ownership_apply_access "$dest" || return 1
}

restore_before() {
  local f
  for f in ACTIVE_RELEASE.json ACTIVE_OWNER.json EXPECTED_RELEASE.json; do
    if [[ -f "$EVIDENCE_DIR/before/$f" ]]; then
      atomic_install "$EVIDENCE_DIR/before/$f" "$OWN_DIR/$f" || return 1
    fi
  done
}

INSTALLED=0
for f in ACTIVE_OWNER.json EXPECTED_RELEASE.json ACTIVE_RELEASE.json; do
  atomic_install "$EVIDENCE_DIR/staging/$f" "$OWN_DIR/$f" || {
    restore_before || true
    die "ownership install failed for $f"
  }
  INSTALLED=1
  cp -a "$OWN_DIR/$f" "$EVIDENCE_DIR/after/$f"
done

set +e
python3 - "$OWN_DIR/EXPECTED_RELEASE.json" "$SF_REF" "$SF_SHA" "$BE_REF" "$BE_SHA" <<'PY'
import json, sys
doc, sf_ref, sf_sha, be_ref, be_sha = sys.argv[1:6]
d = json.load(open(doc))
assert d["storefront_digest"] == sf_ref.split("@")[-1]
assert d["backend_digest"] == be_ref.split("@")[-1]
assert d["storefront_source_sha"] == sf_sha
assert d["backend_source_sha"] == be_sha
assert d["storefront_image"] == sf_ref
assert d["backend_image"] == be_ref
PY
wr_verify_rc=$?
set -e
if [[ "$wr_verify_rc" -ne 0 ]]; then
  restore_before || true
  die "post-install EXPECTED_RELEASE verification failed"
fi

if ! cas_live storefront "$SF_NAME" "$SF_REF" "$SF_SHA" \
  || ! cas_live backend "$BE_NAME" "$BE_REF" "$BE_SHA"; then
  restore_before || true
  die "LIVE_COMPONENT_IDENTITY_DRIFT after metadata install - restored before snapshots"
fi

record_state committed
log "PRODUCTION_COMPONENT_IDENTITY_REBIND_OK"
wr_staging_mutation_lock_release || true
LOCK_HELD=0
exit 0
