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
EXPECT_CURRENT_SF=""
EXPECT_CURRENT_BE=""
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
    --expected-current-storefront-digest) EXPECT_CURRENT_SF="${2:?}"; shift 2 ;;
    --expected-current-storefront-digest=*) EXPECT_CURRENT_SF="${1#--expected-current-storefront-digest=}"; shift ;;
    --expected-current-backend-digest) EXPECT_CURRENT_BE="${2:?}"; shift 2 ;;
    --expected-current-backend-digest=*) EXPECT_CURRENT_BE="${1#--expected-current-backend-digest=}"; shift ;;
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
case "$COMPONENT" in
  pair)
    [[ -z "$RETAINED_REV" && -z "$EXPECT_CURRENT_SF" && -z "$EXPECT_CURRENT_BE" ]] \
      || die "pair approval does not take retained-backend or expected-current fields"
    ;;
  storefront)
    [[ "$RETAINED_REV" =~ ^[0-9a-f]{40}$ ]] || die "retained-backend-revision must be full 40-hex"
    [[ "$EXPECT_CURRENT_SF" =~ ^sha256:[0-9a-f]{64}$ ]] || die "expected-current-storefront-digest invalid"
    [[ "$EXPECT_CURRENT_BE" =~ ^sha256:[0-9a-f]{64}$ ]] || die "expected-current-backend-digest invalid"
    [[ "$EXPECT_CURRENT_BE" == "$BE_DIGEST" ]] || die "expected-current-backend-digest must equal --backend-digest (the retained digest)"
    [[ "$EXPECT_CURRENT_SF" != "$SF_DIGEST" ]] || die "expected current storefront must differ from the candidate storefront digest"
    [[ "$RETAINED_REV" != "$APP_SHA" ]] || die "retained backend revision must differ from the new storefront source sha (use --component pair)"
    ;;
  *) die "component must be pair or storefront (got $COMPONENT)" ;;
esac
export WOODRIGHT_OWNER_APPROVAL_COMPONENT="$COMPONENT"
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
  "$OWNER_AUTH_ID" "$ISSUED_AT" "$PREV_SHA" "$EVIDENCE_REF" \
  "$COMPONENT" "$RETAINED_REV" "$EXPECT_CURRENT_SF" "$EXPECT_CURRENT_BE" <<'PY'
import json, sys
(path, env, sha, be, sf, auth, issued, prev, evid,
 component, retained_rev, expect_sf, expect_be) = sys.argv[1:14]
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
if component == "storefront":
  doc["component"] = "storefront"
  doc["retained_backend_revision"] = retained_rev
  doc["expected_current_storefront_digest"] = expect_sf
  doc["expected_current_backend_digest"] = expect_be
elif component != "pair":
  raise SystemExit("refused component")
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
# Storefront-only cannot require both release-sha labels to equal the new SHA:
# the retained backend keeps its older revision. CAS the retained backend and
# the current storefront instead. The candidate storefront is not live yet.
if [[ "$REQUIRE_LIVE_MATCH" == "1" && "$COMPONENT" == "storefront" ]]; then
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

mkdir -p "$DEST_DIR"
BACKUP=""
if [[ -f "$DEST" && ! -L "$DEST" ]]; then
  BACKUP="$EVIDENCE_DIR/json/OWNER_APPROVED_RELEASE.backup.json"
  cp -p "$DEST" "$BACKUP"
  printf '%s\n' "$(wr_owner_approved_sha256_file "$BACKUP")" >"$EVIDENCE_DIR/json/owner-approved-release.backup.sha256"
fi

# Canonical public_production approval is not operator-writable after issuance.
# The meta directory is not group-writable, so leonid cannot mv a new inode in.
# Install with sudo, then seal root:woodright-ops 0640. Tests retarget
# WOODRIGHT_META_ROOT and keep the unprivileged mv path.
if [[ "$WOODRIGHT_ENVIRONMENT" == "public_production" \
   && "${WOODRIGHT_META_ROOT:-/srv/woodright/meta}" == "/srv/woodright/meta" \
   && "$DEST" == "/srv/woodright/meta/public_production/OWNER_APPROVED_RELEASE.json" ]]; then
  # Sibling + rename. Copying onto the live path can tear the previous approval.
  SEAL_TMP="${DEST}.seal.$$"
  [[ ! -e "$SEAL_TMP" && ! -L "$SEAL_TMP" ]] || die "approval seal temp already exists"
  sudo -n cp "$STAGED" "$SEAL_TMP" || die "sudo stage of production approval failed"
  sudo -n chown root:woodright-ops "$SEAL_TMP" || { sudo -n rm -f "$SEAL_TMP"; die "approval seal chown failed"; }
  sudo -n chmod 0640 "$SEAL_TMP" || { sudo -n rm -f "$SEAL_TMP"; die "approval seal chmod failed"; }
  SEAL_CS="$(wr_owner_approved_sha256_file "$SEAL_TMP")"
  [[ "$SEAL_CS" == "$CS" ]] || { sudo -n rm -f "$SEAL_TMP"; die "approval seal checksum mismatch before rename"; }
  sudo -n mv -f "$SEAL_TMP" "$DEST" || die "atomic rename of production approval failed"
  wr_prod_ownership_apply_access "$DEST" || die "production approval seal failed (required root:woodright-ops 0640)"
else
  INSTALL_TMP="${DEST}.tmp.$$"
  cp "$STAGED" "$INSTALL_TMP"
  chmod 0644 "$INSTALL_TMP"
  if [[ "$(id -u)" -eq 0 ]]; then
    chown leonid:leonid "$INSTALL_TMP" 2>/dev/null || chown 1000:1000 "$INSTALL_TMP" 2>/dev/null || true
  fi
  mv -f "$INSTALL_TMP" "$DEST"
fi
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
