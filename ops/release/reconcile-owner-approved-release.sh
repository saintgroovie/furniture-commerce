#!/usr/bin/env bash
# LIVE_MUTATING=false for dry-run; APPLY writes owner-approval metadata only.
#
# Atomically create/reconcile OWNER_APPROVED_RELEASE.json for public_demo or
# exact public_production. Does NOT mutate containers, pins, ACTIVE_* release
# state, legal tokens, DNS, or CS-Cart. The private-candidate alias
# --environment production is refused.
#
# Usage (dry-run default):
#   bash ops/release/reconcile-owner-approved-release.sh \
#     --environment public_demo \
#     --application-sha <40hex> \
#     --backend-digest sha256:<64hex> \
#     --storefront-digest sha256:<64hex> \
#     --owner-authorization-id <id> \
#     --evidence-reference <path-or-id> \
#     --evidence-dir <abs>
#
# Apply:
#   ... --apply --confirm-mutation I_UNDERSTAND_OWNER_APPROVAL_WRITE
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/woodright-environment-profile.sh
source "$HERE/../lib/woodright-environment-profile.sh"
# shellcheck source=../lib/woodright-owner-approved-release.sh
source "$HERE/../lib/woodright-owner-approved-release.sh"
# shellcheck source=../lib/woodright-staging-mutation-lock.sh
source "$HERE/../lib/woodright-staging-mutation-lock.sh"
# shellcheck source=../lib/woodright-production-ownership-access.sh
source "$HERE/../lib/woodright-production-ownership-access.sh"

APPLY=0
CONFIRM=""
CONFIRM_SHA=""
APP_SHA=""
BE_DIGEST=""
SF_DIGEST=""
OWNER_AUTH_ID=""
EVIDENCE_REF=""
EVIDENCE_DIR=""
PREV_SHA=""
ISSUED_AT=""
ALLOW_PREDEPLOY=0
COMPONENT="pair"
RETAINED_REV=""
RETAINED_SF_REV=""
EXPECT_CURRENT_SF=""
EXPECT_CURRENT_BE=""
EXPECT_CS=""
OPERATION="approve"
CANCEL_REASON=""
REQUIRE_LIVE_MATCH="${WOODRIGHT_OWNER_APPROVAL_REQUIRE_LIVE_MATCH:-1}"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $*"; exit 2; }

usage() {
  sed -n '1,30p' "$0"
}

FULL_ARGV=("$@")
while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --environment) shift 2 ;;
    --environment=*) shift ;;
    --apply) APPLY=1; shift ;;
    --allow-predeploy-approval) ALLOW_PREDEPLOY=1; shift ;;
    --confirm-mutation) CONFIRM="${2:?}"; shift 2 ;;
    --confirm-mutation=*) CONFIRM="${1#--confirm-mutation=}"; shift ;;
    --confirm-sha) CONFIRM_SHA="${2:?}"; shift 2 ;;
    --confirm-sha=*) CONFIRM_SHA="${1#--confirm-sha=}"; shift ;;
    --application-sha) APP_SHA="${2:?}"; shift 2 ;;
    --application-sha=*) APP_SHA="${1#--application-sha=}"; shift ;;
    --backend-digest) BE_DIGEST="${2:?}"; shift 2 ;;
    --backend-digest=*) BE_DIGEST="${1#--backend-digest=}"; shift ;;
    --storefront-digest) SF_DIGEST="${2:?}"; shift 2 ;;
    --storefront-digest=*) SF_DIGEST="${1#--storefront-digest=}"; shift ;;
    --owner-authorization-id) OWNER_AUTH_ID="${2:?}"; shift 2 ;;
    --owner-authorization-id=*) OWNER_AUTH_ID="${1#--owner-authorization-id=}"; shift ;;
    --evidence-reference) EVIDENCE_REF="${2:?}"; shift 2 ;;
    --evidence-reference=*) EVIDENCE_REF="${1#--evidence-reference=}"; shift ;;
    --evidence-dir) EVIDENCE_DIR="${2:?}"; shift 2 ;;
    --evidence-dir=*) EVIDENCE_DIR="${1#--evidence-dir=}"; shift ;;
    --previous-approved-sha) PREV_SHA="${2:?}"; shift 2 ;;
    --previous-approved-sha=*) PREV_SHA="${1#--previous-approved-sha=}"; shift ;;
    --issued-at) ISSUED_AT="${2:?}"; shift 2 ;;
    --issued-at=*) ISSUED_AT="${1#--issued-at=}"; shift ;;
    --component) COMPONENT="${2:?}"; shift 2 ;;
    --component=*) COMPONENT="${1#--component=}"; shift ;;
    --retained-backend-revision) RETAINED_REV="${2:?}"; shift 2 ;;
    --retained-backend-revision=*) RETAINED_REV="${1#--retained-backend-revision=}"; shift ;;
    --retained-storefront-revision) RETAINED_SF_REV="${2:?}"; shift 2 ;;
    --retained-storefront-revision=*) RETAINED_SF_REV="${1#--retained-storefront-revision=}"; shift ;;
    --expected-current-storefront-digest) EXPECT_CURRENT_SF="${2:?}"; shift 2 ;;
    --expected-current-storefront-digest=*) EXPECT_CURRENT_SF="${1#--expected-current-storefront-digest=}"; shift ;;
    --expected-current-backend-digest) EXPECT_CURRENT_BE="${2:?}"; shift 2 ;;
    --expected-current-backend-digest=*) EXPECT_CURRENT_BE="${1#--expected-current-backend-digest=}"; shift ;;
    --expected-previous-approval-checksum) EXPECT_CS="${2:?}"; shift 2 ;;
    --expected-previous-approval-checksum=*) EXPECT_CS="${1#--expected-previous-approval-checksum=}"; shift ;;
    --operation) OPERATION="${2:?}"; shift 2 ;;
    --operation=*) OPERATION="${1#--operation=}"; shift ;;
    --cancel-reason|--supersede-reason) CANCEL_REASON="${2:?}"; shift 2 ;;
    --cancel-reason=*|--supersede-reason=*) CANCEL_REASON="${1#*=}"; shift ;;
    *) die "unknown arg: $1" ;;
  esac
done

wr_require_environment_from_args "${FULL_ARGV[@]}" || exit 1
case "$WOODRIGHT_ENVIRONMENT" in
  public_demo) ;;
  public_production)
    # Exact target only. Never honor the private-candidate alias "production".
    ;;
  staging)
    die "use --environment public_demo (staging is not an approval write alias)"
    ;;
  production)
    die "refused --environment production (private candidate). public_production approval write requires --environment public_production"
    ;;
  *) die "unsupported environment=$WOODRIGHT_ENVIRONMENT (this helper writes public_demo or public_production only)" ;;
esac
if [[ "$WOODRIGHT_ENVIRONMENT" == "public_production" ]]; then
  export WOODRIGHT_OWNER_APPROVAL_STRICT_ENVIRONMENT=1
fi
case "$OPERATION" in
  approve|cancel|supersede) ;;
  *) die "operation must be approve, cancel, or supersede (got $OPERATION)" ;;
esac

if [[ "$OPERATION" == "cancel" ]]; then
  [[ ${#CANCEL_REASON} -ge 8 && ${#CANCEL_REASON} -le 160 ]] || die "cancel-reason must be 8-160 characters"
  case "$CANCEL_REASON" in
    *$'\n'*|*$'\r'*) die "cancel-reason must be one line" ;;
  esac
  [[ -n "$EVIDENCE_REF" && "$EVIDENCE_REF" == /* && -e "$EVIDENCE_REF" ]] \
    || die "evidence-reference must be an absolute existing path"
  [[ -n "$EVIDENCE_DIR" && "$EVIDENCE_DIR" == /* ]] || die "evidence-dir must be absolute"
else
[[ "$APP_SHA" =~ ^[0-9a-f]{40}$ ]] || die "application-sha must be full 40-hex"
[[ "$BE_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || die "backend-digest invalid"
[[ "$SF_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || die "storefront-digest invalid"
[[ "$BE_DIGEST" != "$SF_DIGEST" ]] || die "backend and storefront digests must differ"
case "$COMPONENT" in
  pair)
    [[ -z "$RETAINED_REV" && -z "$RETAINED_SF_REV" && -z "$EXPECT_CURRENT_SF" && -z "$EXPECT_CURRENT_BE" ]] \
      || die "pair approval does not take retained-backend or expected-current fields"
    ;;
  storefront)
    [[ -z "$RETAINED_SF_REV" ]] || die "storefront approval cannot retain a storefront"
    [[ "$RETAINED_REV" =~ ^[0-9a-f]{40}$ ]] || die "retained-backend-revision must be full 40-hex"
    [[ "$EXPECT_CURRENT_SF" =~ ^sha256:[0-9a-f]{64}$ ]] || die "expected-current-storefront-digest invalid"
    [[ "$EXPECT_CURRENT_BE" =~ ^sha256:[0-9a-f]{64}$ ]] || die "expected-current-backend-digest invalid"
    [[ "$EXPECT_CURRENT_BE" == "$BE_DIGEST" ]] || die "expected-current-backend-digest must equal --backend-digest (the retained digest)"
    [[ "$EXPECT_CURRENT_SF" != "$SF_DIGEST" ]] || die "expected current storefront must differ from the candidate storefront digest"
    [[ "$RETAINED_REV" != "$APP_SHA" ]] || die "retained backend revision must differ from the new storefront source sha (use --component pair)"
    ;;
  backend)
    [[ "$WOODRIGHT_ENVIRONMENT" == "public_production" ]] || die "backend approval requires exact public_production"
    [[ -z "$RETAINED_REV" ]] || die "backend approval cannot retain a backend"
    [[ "$RETAINED_SF_REV" =~ ^[0-9a-f]{40}$ ]] || die "retained-storefront-revision must be full 40-hex"
    [[ "$EXPECT_CURRENT_SF" =~ ^sha256:[0-9a-f]{64}$ ]] || die "expected-current-storefront-digest invalid"
    [[ "$EXPECT_CURRENT_BE" =~ ^sha256:[0-9a-f]{64}$ ]] || die "expected-current-backend-digest invalid"
    [[ "$EXPECT_CURRENT_SF" == "$SF_DIGEST" ]] || die "expected-current-storefront-digest must equal the retained storefront digest"
    [[ "$EXPECT_CURRENT_BE" != "$BE_DIGEST" ]] || die "candidate backend must differ from the current backend digest"
    [[ "$RETAINED_SF_REV" != "$APP_SHA" ]] || die "retained storefront revision must differ from the new backend source sha"
    ;;
  *) die "component must be pair, storefront or backend (got $COMPONENT)" ;;
esac
export WOODRIGHT_OWNER_APPROVAL_COMPONENT="$COMPONENT"
[[ "$OWNER_AUTH_ID" =~ ^OWNER-PASS-[A-Za-z0-9._:-]{8,128}$ ]] \
  || die "owner-authorization-id must match OWNER-PASS-<token> (8+ chars)"
[[ -n "$EVIDENCE_REF" && "$EVIDENCE_REF" == /* && -e "$EVIDENCE_REF" ]] \
  || die "evidence-reference must be an absolute existing path"
[[ -n "$EVIDENCE_DIR" && "$EVIDENCE_DIR" == /* ]] || die "evidence-dir must be absolute"
if [[ "$OPERATION" == "supersede" ]]; then
  [[ ${#CANCEL_REASON} -ge 8 && ${#CANCEL_REASON} -le 160 ]] || die "supersede-reason must be 8-160 characters"
  case "$CANCEL_REASON" in
    *$'\n'*|*$'\r'*) die "supersede-reason must be one line" ;;
  esac
fi
fi
ISSUED_AT="${ISSUED_AT:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"

# Never honor path override for writes - always canonical SoT.
unset WOODRIGHT_OWNER_APPROVED_RELEASE_PATH
unset WOODRIGHT_OWNER_APPROVAL_FIXTURE

DEST="$(wr_owner_approved_default_path "$WOODRIGHT_ENVIRONMENT")"
[[ -n "$DEST" ]] || die "cannot resolve approval path"
DEST_DIR="$(dirname "$DEST")"
mkdir -p "$EVIDENCE_DIR/json"

if [[ "$OPERATION" == "cancel" ]]; then
  if ! wr_owner_approved_cas_precheck "$WOODRIGHT_ENVIRONMENT" "$EXPECT_CS"; then
    die "cancel refused result=${WR_OWNER_APPROVAL_RESULT} expected=${EXPECT_CS:-<empty>}"
  fi
  if [[ "$APPLY" != "1" ]]; then
    log "PLANNED owner approval cancel env=$WOODRIGHT_ENVIRONMENT checksum=$EXPECT_CS"
    log "PLANNED no_container_mutation no_pin_write no_image_pull"
    log "DRY_RUN_OK (set --apply to write)"
    exit 0
  fi
  [[ "$CONFIRM" == "I_UNDERSTAND_OWNER_APPROVAL_CANCEL" ]] || die "confirm-mutation required for cancel"
  WR_STAGING_MUTATION_LOCK_DIR="$(dirname "$WR_STAGING_MUTATION_LOCK_PATH")"
  WR_STAGING_MUTATION_LOCK_META="${WR_STAGING_MUTATION_LOCK_PATH}.meta"
  wr_staging_mutation_lock_acquire \
    "actor=reconcile-owner-approved-release" \
    "command=$0 --environment $WOODRIGHT_ENVIRONMENT --operation cancel" \
    "target=cancel" \
    || exit 3
  if ! wr_owner_approved_cas_precheck "$WOODRIGHT_ENVIRONMENT" "$EXPECT_CS"; then
    die "cancel refused under lock result=${WR_OWNER_APPROVAL_RESULT}"
  fi
  case "${WR_OA_RESERVATION_STATE:-}" in
    reserved|legacy) ;;
    cancelled)
      log "OWNER_APPROVAL_UNCHANGED checksum=$WR_OA_CHECKSUM"
      exit 0
      ;;
    *) die "OWNER_APPROVAL_CANCEL_REFUSED state=${WR_OA_RESERVATION_STATE:-empty}" ;;
  esac
  PREVIOUS_CS="$WR_OA_CHECKSUM"
  PREVIOUS_GEN="${WR_OA_GENERATION:-}"
  export WR_OA_TRANSITION_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  export WR_OA_ACTOR="$(id -un)"
  export WR_OA_PREVIOUS_GENERATION="$PREVIOUS_GEN"
  # Private staging. The evidence copy is audit-only and is never installed.
  STAGED="$(mktemp "$EVIDENCE_DIR/json/owner-approved-release.staged.XXXXXX")"
  umask 027
  python3 - "$WR_OA_PATH" "$STAGED" "$CANCEL_REASON" "$EVIDENCE_REF" "$PREVIOUS_CS" <<'PY' || die "cancel document build failed"
import hashlib, json, os, sys
src, dest, reason, evid, previous_cs = sys.argv[1:6]
doc = json.loads(open(src, encoding="utf-8").read())
issued = os.environ["WR_OA_TRANSITION_AT"]
doc["reservation_state"] = "cancelled"
doc["owner_decision"] = "approved"
doc["reservation_transition_at"] = issued
doc["reservation_transition_reason"] = reason
doc["cancelled_by"] = os.environ.get("WR_OA_ACTOR", "")
doc["previous_approval_checksum"] = previous_cs
doc["evidence_reference"] = evid
doc["tooling_schema_version"] = "owner-approved-release-v2"
material = "|".join([
    doc.get("environment", ""),
    doc.get("component") or "pair",
    doc.get("application_sha", ""),
    previous_cs,
    "cancelled",
    issued,
    reason,
])
doc["approval_generation"] = "apr1-" + hashlib.sha256(material.encode()).hexdigest()[:32]
with open(dest, "w", encoding="utf-8") as handle:
    json.dump(doc, handle, indent=2, sort_keys=True)
    handle.write("\n")
    handle.flush()
    os.fsync(handle.fileno())
PY
  if [[ -f "$DEST" && ! -L "$DEST" ]]; then
    cp -p "$DEST" "$EVIDENCE_DIR/json/OWNER_APPROVED_RELEASE.backup.json"
    wr_owner_approved_sha256_file "$EVIDENCE_DIR/json/OWNER_APPROVED_RELEASE.backup.json" \
      >"$EVIDENCE_DIR/json/owner-approved-release.backup.sha256"
  fi
  CS="$(wr_owner_approved_sha256_file "$STAGED")"
  cp -p "$STAGED" "$EVIDENCE_DIR/json/OWNER_APPROVED_RELEASE.staged.json"
  wr_owner_approved_atomic_install "$STAGED" "$DEST" "$CS" \
    || die "atomic cancel install failed"
  wr_owner_approved_load "$WOODRIGHT_ENVIRONMENT" || die "cancel post-write load failed"
  wr_owner_approved_record_transition "$EVIDENCE_DIR" cancel "$PREVIOUS_CS" "$CS" "$CANCEL_REASON" || true
  log "OWNER_APPROVAL_CANCELLED path=$DEST checksum=$CS previous=$PREVIOUS_CS"
  exit 0
fi

STAGED="$(mktemp "$EVIDENCE_DIR/json/owner-approved-release.staged.XXXXXX")"
umask 027
python3 - "$STAGED" "$WOODRIGHT_ENVIRONMENT" "$APP_SHA" "$BE_DIGEST" "$SF_DIGEST" \
  "$OWNER_AUTH_ID" "$ISSUED_AT" "$PREV_SHA" "$EVIDENCE_REF" \
  "$COMPONENT" "$RETAINED_REV" "$EXPECT_CURRENT_SF" "$EXPECT_CURRENT_BE" \
  "$EXPECT_CS" "$OPERATION" "$CANCEL_REASON" "$RETAINED_SF_REV" <<'PY'
import hashlib, json, os, sys
(path, env, sha, be, sf, auth, issued, prev, evid,
 component, retained_rev, expect_sf, expect_be,
 previous_cs, operation, reason, retained_sf_rev) = sys.argv[1:18]
material = "|".join([env, component, sha, be, sf, issued, previous_cs, operation])
doc = {
  "schema_version": 1,
  "environment": env,
  "application_sha": sha,
  "backend_digest": be,
  "storefront_digest": sf,
  "owner_decision": "approved",
  "owner_authorization_id": auth,
  "issued_at": issued,
  "evidence_reference": evid,
  "tooling_schema_version": "owner-approved-release-v2",
  "approval_generation": "apr1-" + hashlib.sha256(material.encode()).hexdigest()[:32],
  "reservation_state": "reserved",
}
if previous_cs:
  doc["previous_approval_checksum"] = previous_cs
if operation == "supersede":
  doc["reservation_transition_reason"] = reason
  doc["supersedes_approval_checksum"] = previous_cs
if component == "storefront":
  doc["component"] = "storefront"
  doc["retained_backend_revision"] = retained_rev
  doc["expected_current_storefront_digest"] = expect_sf
  doc["expected_current_backend_digest"] = expect_be
elif component == "backend":
  doc["component"] = "backend"
  doc["retained_storefront_revision"] = retained_sf_rev
  doc["expected_current_storefront_digest"] = expect_sf
  doc["expected_current_backend_digest"] = expect_be
elif component != "pair":
  raise SystemExit("refused component")
if prev:
  doc["previous_approved_application_sha"] = prev
with open(path, "w", encoding="utf-8") as handle:
  json.dump(doc, handle, indent=2, sort_keys=True)
  handle.write("\n")
  handle.flush()
  os.fsync(handle.fileno())
PY
chmod 0644 "$STAGED"
CS="$(wr_owner_approved_sha256_file "$STAGED")"
# Audit snapshot only. Install stays on the private mktemp path above.
cp -p "$STAGED" "$EVIDENCE_DIR/json/OWNER_APPROVED_RELEASE.staged.json"
printf '%s\n' "$CS" >"$EVIDENCE_DIR/json/owner-approved-release.staged.sha256"
printf '%s\n' "$DEST" >"$EVIDENCE_DIR/json/owner-approved-release.dest-path.txt"

log "PLANNED owner approval write env=$WOODRIGHT_ENVIRONMENT sha=$APP_SHA dest=$DEST checksum=$CS operation=$OPERATION"
log "PLANNED no_container_mutation no_pin_write no_image_pull"
log "PLANNED require_live_match=$REQUIRE_LIVE_MATCH allow_predeploy=$ALLOW_PREDEPLOY"

if [[ "$APPLY" != "1" ]]; then
  if [[ -n "$EXPECT_CS" ]]; then
    if ! wr_owner_approved_cas_precheck "$WOODRIGHT_ENVIRONMENT" "$EXPECT_CS"; then
      die "dry-run CAS refused result=${WR_OWNER_APPROVAL_RESULT}"
    fi
    if [[ "$OPERATION" == "approve" && "${WR_OA_RESERVATION_STATE:-}" == "reserved" ]]; then
      if wr_owner_approved_same_candidate "$APP_SHA" "$BE_DIGEST" "$SF_DIGEST" "$COMPONENT" \
           "$RETAINED_REV" "$EXPECT_CURRENT_SF" "$EXPECT_CURRENT_BE" "$RETAINED_SF_REV"; then
        log "PLANNED OWNER_APPROVAL_UNCHANGED"
      else
        die "OWNER_APPROVAL_RESERVED checksum=$WR_OA_CHECKSUM"
      fi
    fi
    log "PLANNED cas_ok expected=$EXPECT_CS"
  else
    log "PLANNED cas=required_on_apply"
  fi
  log "DRY_RUN_OK (set --apply to write)"
  exit 0
fi

if [[ "$OPERATION" == "supersede" ]]; then
  [[ "$CONFIRM" == "I_UNDERSTAND_OWNER_APPROVAL_SUPERSEDE" ]] || die "confirm-mutation required for supersede"
else
  [[ "$CONFIRM" == "I_UNDERSTAND_OWNER_APPROVAL_WRITE" ]] || die "confirm-mutation required for apply"
fi
[[ "$CONFIRM_SHA" == "$APP_SHA" ]] || die "confirm-sha must exactly equal application-sha"
if ! wr_owner_approved_cas_precheck "$WOODRIGHT_ENVIRONMENT" "$EXPECT_CS"; then
  die "apply refused result=${WR_OWNER_APPROVAL_RESULT} expected=${EXPECT_CS:-<empty>}"
fi
if [[ "$ALLOW_PREDEPLOY" == "1" ]]; then
  REQUIRE_LIVE_MATCH=0
  log "WARN allow_predeploy_approval=1 live_match disabled"
fi

WR_STAGING_MUTATION_LOCK_DIR="$(dirname "$WR_STAGING_MUTATION_LOCK_PATH")"
WR_STAGING_MUTATION_LOCK_META="${WR_STAGING_MUTATION_LOCK_PATH}.meta"
wr_staging_mutation_lock_acquire \
  "actor=reconcile-owner-approved-release" \
  "command=$0 --environment $WOODRIGHT_ENVIRONMENT --apply" \
  "target=$APP_SHA" \
  || exit 3

# Default: only approve an identity that is already live (freeze owner-accepted baseline).
# Storefront-only cannot require both release-sha labels to equal the new SHA:
# the retained backend keeps its older revision. CAS the retained backend and
# the current storefront instead. The candidate storefront is not live yet.
if [[ "$COMPONENT" == "backend" ]]; then
  # Backend-only never permits predeploy approval to bypass the retained peer CAS.
  command -v docker >/dev/null 2>&1 || die "docker required for backend live CAS"
  wr_assert_environment_provisioned || exit 1
  live_be_img="$(docker inspect "${WOODRIGHT_BE_CONTAINER_DEFAULT}" --format '{{.Config.Image}}' 2>/dev/null || true)"
  live_sf_img="$(docker inspect "${WOODRIGHT_SF_CONTAINER_DEFAULT}" --format '{{.Config.Image}}' 2>/dev/null || true)"
  live_sf_rev="$(docker inspect "${WOODRIGHT_SF_CONTAINER_DEFAULT}" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null || true)"
  [[ "$live_be_img" == *"@$EXPECT_CURRENT_BE" ]] || die "live current backend digest mismatch"
  [[ "$live_sf_img" == *"@$SF_DIGEST" ]] || die "live retained storefront digest mismatch"
  [[ "$live_sf_rev" == "$RETAINED_SF_REV" ]] || die "live retained storefront revision mismatch"
  log "backend_live_cas_ok retained_storefront=$SF_DIGEST current_backend=$EXPECT_CURRENT_BE"
elif [[ "$REQUIRE_LIVE_MATCH" == "1" && "$COMPONENT" == "storefront" ]]; then
  command -v docker >/dev/null 2>&1 || die "docker required for live-match approval write"
  wr_assert_environment_provisioned || exit 1
  local_be="${WOODRIGHT_BE_CONTAINER_DEFAULT}"
  local_sf="${WOODRIGHT_SF_CONTAINER_DEFAULT}"
  live_be_img="$(docker inspect "$local_be" --format '{{.Config.Image}}' 2>/dev/null || true)"
  live_sf_img="$(docker inspect "$local_sf" --format '{{.Config.Image}}' 2>/dev/null || true)"
  live_be_rev="$(docker inspect "$local_be" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null || true)"
  [[ "$live_be_img" == *"$BE_DIGEST"* ]] || die "live retained backend digest mismatch image=$live_be_img want=$BE_DIGEST"
  [[ "$live_sf_img" == *"$EXPECT_CURRENT_SF"* ]] || die "live current storefront digest mismatch image=$live_sf_img want=$EXPECT_CURRENT_SF"
  [[ "$live_be_rev" == "$RETAINED_REV" ]] || die "live retained backend revision mismatch have=$live_be_rev want=$RETAINED_REV"
  [[ "$live_sf_img" != *"$SF_DIGEST"* ]] || die "candidate storefront digest is already live"
  log "storefront_live_cas_ok retained_backend=$BE_DIGEST current_storefront=$EXPECT_CURRENT_SF"
elif [[ "$REQUIRE_LIVE_MATCH" == "1" ]]; then
  command -v docker >/dev/null 2>&1 || die "docker required for live-match approval write"
  wr_assert_environment_provisioned || exit 1
  local_be="${WOODRIGHT_BE_CONTAINER_DEFAULT}"
  local_sf="${WOODRIGHT_SF_CONTAINER_DEFAULT}"
  live_sha_be="$(docker inspect "$local_be" --format '{{index .Config.Labels "com.woodright.release-sha"}}' 2>/dev/null || true)"
  live_sha_sf="$(docker inspect "$local_sf" --format '{{index .Config.Labels "com.woodright.release-sha"}}' 2>/dev/null || true)"
  [[ "$live_sha_be" == "$APP_SHA" && "$live_sha_sf" == "$APP_SHA" ]] \
    || die "live release-sha mismatch be=$live_sha_be sf=$live_sha_sf want=$APP_SHA (use --allow-predeploy-approval only with explicit OWNER intent)"
  # Digest via Config.Image substring
  live_be_img="$(docker inspect "$local_be" --format '{{.Config.Image}}' 2>/dev/null || true)"
  live_sf_img="$(docker inspect "$local_sf" --format '{{.Config.Image}}' 2>/dev/null || true)"
  [[ "$live_be_img" == *"$BE_DIGEST"* ]] || die "live backend digest mismatch image=$live_be_img want=$BE_DIGEST"
  [[ "$live_sf_img" == *"$SF_DIGEST"* ]] || die "live storefront digest mismatch image=$live_sf_img want=$SF_DIGEST"
  log "live_match_ok sha=$APP_SHA"
fi

if ! wr_owner_approved_cas_precheck "$WOODRIGHT_ENVIRONMENT" "$EXPECT_CS"; then
  die "apply refused under lock result=${WR_OWNER_APPROVAL_RESULT}"
fi
if [[ "${WR_OA_RESERVATION_STATE:-}" == "reserved" && "$OPERATION" != "supersede" ]]; then
  if wr_owner_approved_same_candidate "$APP_SHA" "$BE_DIGEST" "$SF_DIGEST" "$COMPONENT" \
       "$RETAINED_REV" "$EXPECT_CURRENT_SF" "$EXPECT_CURRENT_BE" "$RETAINED_SF_REV"; then
    log "OWNER_APPROVAL_UNCHANGED checksum=$WR_OA_CHECKSUM"
    exit 0
  fi
  die "OWNER_APPROVAL_RESERVED checksum=$WR_OA_CHECKSUM generation=${WR_OA_GENERATION:-legacy}"
fi
if [[ "$OPERATION" == "supersede" && "${WR_OA_RESERVATION_STATE:-}" != "reserved" ]]; then
  die "OWNER_APPROVAL_SUPERSEDE_REFUSED state=${WR_OA_RESERVATION_STATE:-absent} (supersede requires a reserved approval)"
fi

mkdir -p "$DEST_DIR"
BACKUP=""
if [[ -f "$DEST" && ! -L "$DEST" ]]; then
  BACKUP="$EVIDENCE_DIR/json/OWNER_APPROVED_RELEASE.backup.json"
  cp -p "$DEST" "$BACKUP"
  printf '%s\n' "$(wr_owner_approved_sha256_file "$BACKUP")" >"$EVIDENCE_DIR/json/owner-approved-release.backup.sha256"
fi

wr_owner_approved_atomic_install "$STAGED" "$DEST" "$CS" || die "atomic approval install failed"
FINAL_CS="$(wr_owner_approved_sha256_file "$DEST")"
[[ "$FINAL_CS" == "$CS" ]] || die "post-write checksum mismatch"
export WR_OA_ACTOR="$(id -un)"
export WR_OA_TRANSITION_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
export WR_OA_PREVIOUS_GENERATION="${WR_OA_GENERATION:-}"
wr_owner_approved_load "$WOODRIGHT_ENVIRONMENT" || die "post-write load failed result=${WR_OWNER_APPROVAL_RESULT}"
wr_owner_approved_record_transition "$EVIDENCE_DIR" "$OPERATION" "$EXPECT_CS" "$FINAL_CS" "$CANCEL_REASON" || true

unset WOODRIGHT_OWNER_APPROVED_RELEASE_PATH
unset WOODRIGHT_OWNER_APPROVAL_FIXTURE
if ! wr_require_owner_approved_release "$WOODRIGHT_ENVIRONMENT" "$APP_SHA" "$BE_DIGEST" "$SF_DIGEST" "$EVIDENCE_DIR" "post_write"; then
  die "post-write gate failed result=${WR_OWNER_APPROVAL_RESULT}"
fi

cat >"$EVIDENCE_DIR/json/owner-approval-write-result.json" <<EOF
{
  "result": "OWNER_APPROVAL_WRITTEN",
  "operation": "$OPERATION",
  "path": "$DEST",
  "checksum": "$FINAL_CS",
  "previous_approval_checksum": "$EXPECT_CS",
  "backup": "$BACKUP",
  "environment": "$WOODRIGHT_ENVIRONMENT",
  "component": "$COMPONENT",
  "application_sha": "$APP_SHA",
  "backend_digest": "$BE_DIGEST",
  "storefront_digest": "$SF_DIGEST",
  "reservation_state": "reserved",
  "require_live_match": "$REQUIRE_LIVE_MATCH",
  "timestamp_utc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

log "OWNER_APPROVAL_WRITTEN path=$DEST checksum=$FINAL_CS previous=$EXPECT_CS operation=$OPERATION"
exit 0
