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

[[ "$APP_SHA" =~ ^[0-9a-f]{40}$ ]] || die "application-sha must be full 40-hex"
[[ "$BE_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || die "backend-digest invalid"
[[ "$SF_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || die "storefront-digest invalid"
[[ "$BE_DIGEST" != "$SF_DIGEST" ]] || die "backend and storefront digests must differ"
[[ "$OWNER_AUTH_ID" =~ ^OWNER-PASS-[A-Za-z0-9._:-]{8,128}$ ]] \
  || die "owner-authorization-id must match OWNER-PASS-<token> (8+ chars)"
[[ -n "$EVIDENCE_REF" && "$EVIDENCE_REF" == /* && -e "$EVIDENCE_REF" ]] \
  || die "evidence-reference must be an absolute existing path"
[[ -n "$EVIDENCE_DIR" && "$EVIDENCE_DIR" == /* ]] || die "evidence-dir must be absolute"
ISSUED_AT="${ISSUED_AT:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"

# Never honor path override for writes - always canonical SoT.
unset WOODRIGHT_OWNER_APPROVED_RELEASE_PATH
unset WOODRIGHT_OWNER_APPROVAL_FIXTURE

DEST="$(wr_owner_approved_default_path "$WOODRIGHT_ENVIRONMENT")"
[[ -n "$DEST" ]] || die "cannot resolve approval path"
DEST_DIR="$(dirname "$DEST")"
mkdir -p "$EVIDENCE_DIR/json"

STAGED="$EVIDENCE_DIR/json/OWNER_APPROVED_RELEASE.staged.json"
umask 027
python3 - "$STAGED" "$WOODRIGHT_ENVIRONMENT" "$APP_SHA" "$BE_DIGEST" "$SF_DIGEST" \
  "$OWNER_AUTH_ID" "$ISSUED_AT" "$PREV_SHA" "$EVIDENCE_REF" <<'PY'
import json, sys
path, env, sha, be, sf, auth, issued, prev, evid = sys.argv[1:10]
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
  "tooling_schema_version": "owner-approved-release-v1",
}
if prev:
  doc["previous_approved_application_sha"] = prev
with open(path, "w", encoding="utf-8") as f:
  json.dump(doc, f, indent=2, sort_keys=True)
  f.write("\n")
PY
chmod 0644 "$STAGED"
CS="$(wr_owner_approved_sha256_file "$STAGED")"
printf '%s\n' "$CS" >"$EVIDENCE_DIR/json/owner-approved-release.staged.sha256"
printf '%s\n' "$DEST" >"$EVIDENCE_DIR/json/owner-approved-release.dest-path.txt"

log "PLANNED owner approval write env=$WOODRIGHT_ENVIRONMENT sha=$APP_SHA dest=$DEST checksum=$CS"
log "PLANNED no_container_mutation no_pin_write no_image_pull"
log "PLANNED require_live_match=$REQUIRE_LIVE_MATCH allow_predeploy=$ALLOW_PREDEPLOY"

if [[ "$APPLY" != "1" ]]; then
  log "DRY_RUN_OK (set --apply to write)"
  exit 0
fi

[[ "$CONFIRM" == "I_UNDERSTAND_OWNER_APPROVAL_WRITE" ]] || die "confirm-mutation required for apply"
[[ "$CONFIRM_SHA" == "$APP_SHA" ]] || die "confirm-sha must exactly equal application-sha"
if [[ "$ALLOW_PREDEPLOY" == "1" ]]; then
  REQUIRE_LIVE_MATCH=0
  log "WARN allow_predeploy_approval=1 live_match disabled"
fi

wr_staging_mutation_lock_acquire \
  "actor=reconcile-owner-approved-release" \
  "command=$0 --environment $WOODRIGHT_ENVIRONMENT --apply" \
  "target=$APP_SHA" \
  || exit 3

# Default: only approve an identity that is already live (freeze owner-accepted baseline).
if [[ "$REQUIRE_LIVE_MATCH" == "1" ]]; then
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

mkdir -p "$DEST_DIR"
BACKUP=""
if [[ -f "$DEST" && ! -L "$DEST" ]]; then
  BACKUP="$EVIDENCE_DIR/json/OWNER_APPROVED_RELEASE.backup.json"
  cp -p "$DEST" "$BACKUP"
  printf '%s\n' "$(wr_owner_approved_sha256_file "$BACKUP")" >"$EVIDENCE_DIR/json/owner-approved-release.backup.sha256"
fi

INSTALL_TMP="${DEST}.tmp.$$"
cp "$STAGED" "$INSTALL_TMP"
chmod 0644 "$INSTALL_TMP"
if [[ "$(id -u)" -eq 0 ]]; then
  chown leonid:leonid "$INSTALL_TMP" 2>/dev/null || chown 1000:1000 "$INSTALL_TMP" 2>/dev/null || true
fi
mv -f "$INSTALL_TMP" "$DEST"
FINAL_CS="$(wr_owner_approved_sha256_file "$DEST")"
[[ "$FINAL_CS" == "$CS" ]] || die "post-write checksum mismatch"
[[ ! -L "$DEST" ]] || die "dest became symlink"

# Post-write gate uses canonical path only (no fixture override).
unset WOODRIGHT_OWNER_APPROVED_RELEASE_PATH
unset WOODRIGHT_OWNER_APPROVAL_FIXTURE
if ! wr_require_owner_approved_release "$WOODRIGHT_ENVIRONMENT" "$APP_SHA" "$BE_DIGEST" "$SF_DIGEST" "$EVIDENCE_DIR" "post_write"; then
  die "post-write gate failed result=${WR_OWNER_APPROVAL_RESULT}"
fi

cat >"$EVIDENCE_DIR/json/owner-approval-write-result.json" <<EOF
{
  "result": "OWNER_APPROVAL_WRITTEN",
  "path": "$DEST",
  "checksum": "$FINAL_CS",
  "backup": "$BACKUP",
  "environment": "$WOODRIGHT_ENVIRONMENT",
  "application_sha": "$APP_SHA",
  "backend_digest": "$BE_DIGEST",
  "storefront_digest": "$SF_DIGEST",
  "owner_authorization_id": "$OWNER_AUTH_ID",
  "require_live_match": "$REQUIRE_LIVE_MATCH",
  "timestamp_utc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

log "OWNER_APPROVAL_WRITTEN path=$DEST checksum=$FINAL_CS"
exit 0
