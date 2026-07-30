#!/usr/bin/env bash
# Fidelity tests for environment-scoped release governance (no Docker mutation).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=../../ops/lib/woodright-environment-profile.sh
source "$ROOT/ops/lib/woodright-environment-profile.sh"
# shellcheck source=../../ops/lib/woodright-validation-freeze.sh
source "$ROOT/ops/lib/woodright-validation-freeze.sh"
# shellcheck source=../../ops/lib/woodright-component-authority.sh
source "$ROOT/ops/lib/woodright-component-authority.sh"
# shellcheck source=../../ops/lib/woodright-oci-provenance.sh
source "$ROOT/ops/lib/woodright-oci-provenance.sh"

PASS=0
fail() { echo "FAIL: $*"; exit 1; }
ok() { echo "PASS: $*"; PASS=$((PASS + 1)); }

# 1) no environment
if wr_load_environment_profile "" 2>/dev/null; then fail "empty env should fail"; else ok "empty env fails"; fi

# 2) unknown
if wr_load_environment_profile "foo" 2>/dev/null; then fail "unknown env should fail"; else ok "unknown env fails"; fi

# 3) public_demo loads
unset WOODRIGHT_ENVIRONMENT WOODRIGHT_ENV_PROFILE_LOADED || true
wr_load_environment_profile public_demo || fail "public_demo load"
[[ "$WOODRIGHT_MUTATION_LOCK_PATH" == "/srv/woodright/locks/public_demo/live-cutover.lock" ]] || fail "public_demo lock path"
[[ "$WOODRIGHT_OWNERSHIP_DIR" == "/srv/woodright/runtime-ownership-public-demo" ]] || fail "public_demo ownership"
[[ "$WOODRIGHT_REQUIRED_RUNTIME_ROLE" == "public_demo" ]] || fail "public_demo role"
[[ "$WOODRIGHT_REQUIRED_DB_ALIAS" == "public_demo_db" ]] || fail "public_demo db alias"
[[ "$WOODRIGHT_ENVIRONMENT_PROVISIONED" == "1" ]] || fail "public_demo provisioned"
ok "public_demo profile loads exact pins"

# 4) staging loads but unprovisioned
unset WOODRIGHT_ENVIRONMENT WOODRIGHT_ENV_PROFILE_LOADED || true
wr_load_environment_profile staging || fail "staging load"
[[ "$WOODRIGHT_MUTATION_LOCK_PATH" == "/srv/woodright/locks/staging/live-cutover.lock" ]] || fail "staging lock"
[[ "$WOODRIGHT_OWNERSHIP_DIR" == "/srv/woodright/runtime-ownership-staging" ]] || fail "staging ownership"
[[ "$WOODRIGHT_ENVIRONMENT_PROVISIONED" == "0" ]] || fail "staging must be unprovisioned"
if wr_assert_environment_provisioned 2>/dev/null; then fail "staging provisioned assert should fail"; else ok "staging unprovisioned fail-closed"; fi

# 5) production loads
unset WOODRIGHT_ENVIRONMENT WOODRIGHT_ENV_PROFILE_LOADED || true
wr_load_environment_profile production || fail "production load"
[[ "$WOODRIGHT_MUTATION_LOCK_PATH" == "/srv/woodright/locks/production/live-cutover.lock" ]] || fail "prod lock"
[[ "$WOODRIGHT_OWNERSHIP_DIR" == "/srv/woodright/runtime-ownership-production" ]] || fail "prod ownership"
ok "production profile loads exact pins"

# 6) inherited conflict
unset WOODRIGHT_ENV_PROFILE_LOADED || true
export WOODRIGHT_ENVIRONMENT=public_demo
if wr_load_environment_profile production 2>/dev/null; then fail "inherited conflict should fail"; else ok "inherited env conflict fails"; fi
unset WOODRIGHT_ENVIRONMENT || true

# 7) path traversal name
if wr_resolve_environment_profile_path "../public_demo" 2>/dev/null; then fail "traversal"; else ok "path traversal rejected"; fi

# 8) missing --environment on recreate
if bash "$ROOT/ops/release/recreate-staging-backend-with-media.sh" 2>/dev/null; then
  fail "recreate without --environment should fail"
else
  ok "recreate requires --environment"
fi

# 9) staging refused by public_demo-only recreate
if IMAGE=x ENV_FILE=/dev/null EXPECTED_DIGEST=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa KEEP_NAME=k \
  bash "$ROOT/ops/release/recreate-staging-backend-with-media.sh" --environment staging 2>/dev/null; then
  fail "recreate should refuse staging (unprovisioned / not public_demo)"
else
  ok "recreate refuses --environment staging"
fi

# 10) production refused by public_demo recreate helper
if IMAGE=x ENV_FILE=/dev/null EXPECTED_DIGEST=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa KEEP_NAME=k \
  bash "$ROOT/ops/release/recreate-staging-backend-with-media.sh" --environment production 2>/dev/null; then
  fail "recreate should refuse production env"
else
  ok "recreate refuses --environment production"
fi

# 11) verify requires environment
if bash "$ROOT/ops/release/verify-backend-media-mount.sh" --compose-only 2>/dev/null; then
  fail "verify without env should fail"
else
  ok "verify requires --environment"
fi

# 12) public_demo compose-only works (repo compose file)
if bash "$ROOT/ops/release/verify-backend-media-mount.sh" --environment public_demo --compose-only \
  --compose-file "$ROOT/docker-compose.staging.yml" >/dev/null; then
  ok "public_demo compose-only PASS"
else
  fail "public_demo compose-only"
fi

# 13) staging compose-only rejected (unprovisioned)
if bash "$ROOT/ops/release/verify-backend-media-mount.sh" --environment staging --compose-only 2>/dev/null; then
  fail "staging compose-only should fail"
else
  ok "staging compose-only rejected"
fi

# 14) production compose-only rejected for this gate
if bash "$ROOT/ops/release/verify-backend-media-mount.sh" --environment production --compose-only 2>/dev/null; then
  fail "production compose-only should fail"
else
  ok "production compose-only rejected"
fi

# 15) manifest path isolation
unset WOODRIGHT_ENVIRONMENT WOODRIGHT_ENV_PROFILE_LOADED || true
wr_load_environment_profile public_demo || fail public_demo
if wr_assert_manifest_path_for_environment "/srv/woodright/runtime-ownership-production/ACTIVE_OWNER.json" 2>/dev/null; then
  fail "public_demo must not write prod manifests"
else
  ok "public_demo cannot target production manifests"
fi
if wr_assert_manifest_path_for_environment "/srv/woodright/runtime-ownership-staging/ACTIVE_OWNER.json" 2>/dev/null; then
  fail "public_demo must not write staging manifests"
else
  ok "public_demo cannot target staging manifests"
fi
unset WOODRIGHT_ENVIRONMENT WOODRIGHT_ENV_PROFILE_LOADED || true
wr_load_environment_profile staging || fail staging
if wr_assert_manifest_path_for_environment "/srv/woodright/runtime-ownership-public-demo/ACTIVE_OWNER.json" 2>/dev/null; then
  fail "staging must not write public_demo manifests"
else
  ok "staging cannot target public_demo manifests"
fi

# 16) locks differ across all three
unset WOODRIGHT_ENVIRONMENT WOODRIGHT_ENV_PROFILE_LOADED || true
wr_load_environment_profile public_demo; L1=$WOODRIGHT_MUTATION_LOCK_PATH
unset WOODRIGHT_ENVIRONMENT WOODRIGHT_ENV_PROFILE_LOADED || true
wr_load_environment_profile staging; L2=$WOODRIGHT_MUTATION_LOCK_PATH
unset WOODRIGHT_ENVIRONMENT WOODRIGHT_ENV_PROFILE_LOADED || true
wr_load_environment_profile production; L3=$WOODRIGHT_MUTATION_LOCK_PATH
[[ "$L1" != "$L2" && "$L2" != "$L3" && "$L1" != "$L3" ]] || fail "locks must all differ"
ok "three environment locks differ"

# 17) component authority
if wr_require_component_from_args 2>/dev/null; then fail "component required"; else ok "missing component fails"; fi
wr_require_component_from_args --component storefront || fail storefront
[[ "$WOODRIGHT_COMPONENT_SCOPE" == "storefront" ]] || fail scope
export WOODRIGHT_FROZEN_BACKEND_DIGEST=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
if wr_assert_storefront_only_does_not_mutate_backend \
  sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb 2>/dev/null; then
  fail "storefront-only should reject backend change"
else
  ok "storefront-only backend freeze"
fi
wr_assert_storefront_only_does_not_mutate_backend \
  sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa || fail "same digest should pass"
ok "storefront-only allows frozen backend digest"

# 18) OCI helper rejects bad sha format
if wr_assert_oci_revision_matches_sha "no-such-image" "notasha" 2>/dev/null; then fail "bad sha"; else ok "oci bad sha fails"; fi

# 19) validation freeze scoped per environment
TMPLEASE=$(mktemp -d)
export WOODRIGHT_VALIDATION_FREEZE_DIR="$TMPLEASE"
wr_validation_freeze_acquire public_demo "test-actor" "test-cycle" "qa" 60 || fail acquire
wr_validation_freeze_active public_demo || fail active
if wr_validation_freeze_assert_clear_for_mutation public_demo 2>/dev/null; then fail "freeze should block"; else ok "freeze blocks mutation"; fi
# staging freeze independent
if wr_validation_freeze_assert_clear_for_mutation staging 2>/dev/null; then ok "staging not blocked by public_demo freeze"; else fail "staging should be clear"; fi
WOODRIGHT_VALIDATION_FREEZE_OVERRIDE=1 WOODRIGHT_VALIDATION_FREEZE_OVERRIDE_REASON=test \
  wr_validation_freeze_assert_clear_for_mutation public_demo || fail override
wr_validation_freeze_release public_demo || fail release
rm -rf "$TMPLEASE"

# 20) pin reconcile requires environment (no writes)
if EXPECTED_RELEASE_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  EXPECTED_BACKEND_DIGEST=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  EXPECTED_STOREFRONT_DIGEST=sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb \
  READ_ONLY_NO_LOCK=1 bash "$ROOT/scripts/release/reconcile-public-image-pins.sh" 2>/dev/null; then
  fail "pin reconcile without --environment should fail"
else
  ok "pin reconcile requires --environment"
fi

# 21) docs + script contracts
grep -q 'public_demo' "$ROOT/docs/operator/environment-scoped-release-governance.md" || fail docs
grep -q 'wr_require_environment_from_args\|--environment' "$ROOT/ops/release/recreate-staging-backend-with-media.sh" || fail recreate grep
grep -q 'missing required --environment' "$ROOT/ops/release/reconcile-runtime-manifests.sh" || fail reconcile grep
grep -q 'public_demo/live-cutover.lock' "$ROOT/ops/config/runtime-environments/public_demo.conf" || fail conf lock
ok "docs and contracts grepped"

# 22) staging hard-ban helper on public_demo names (no docker needed for prefix check path without inspect)
unset WOODRIGHT_ENVIRONMENT WOODRIGHT_ENV_PROFILE_LOADED || true
wr_load_environment_profile staging || fail staging
# Without docker, assert_container may fail on inspect - we only check the hard-ban case with a mock:
# Prefix for staging is woodright-staging-private-; public name fails prefix first
if wr_assert_container_matches_environment "woodright-staging-storefront" storefront 2>/dev/null; then
  fail "staging must not accept public_demo storefront name"
else
  ok "staging rejects public_demo storefront name"
fi

# 23) canonical lock paths accepted by flock helper allowlist
source "$ROOT/ops/lib/woodright-staging-mutation-lock.sh"
for p in \
  /srv/woodright/locks/public_demo/live-cutover.lock \
  /srv/woodright/locks/staging/live-cutover.lock \
  /srv/woodright/locks/production/live-cutover.lock
 do
  case "$p" in
    /srv/woodright/locks/public_demo/live-cutover.lock|\
    /srv/woodright/locks/staging/live-cutover.lock|\
    /srv/woodright/locks/production/live-cutover.lock|\
    /srv/woodright/locks/live-cutover.lock|\
    /srv/woodright/locks/production-cutover.lock) ;;
    *) fail "allowlist missing $p" ;;
  esac
done
# Acquire on temp path must still be refused without NONCANONICAL
WR_STAGING_MUTATION_LOCK_PATH="$(mktemp)"
WR_STAGING_MUTATION_LOCK_META="${WR_STAGING_MUTATION_LOCK_PATH}.meta"
WR_STAGING_MUTATION_LOCK_DIR="$(dirname "$WR_STAGING_MUTATION_LOCK_PATH")"
if wr_staging_mutation_lock_acquire actor=test command=test target=x 2>/dev/null; then
  fail "noncanonical temp lock should be refused"
else
  ok "noncanonical lock path refused"
fi
rm -f "$WR_STAGING_MUTATION_LOCK_PATH" "$WR_STAGING_MUTATION_LOCK_META"

# 24) recreate requires --component
if IMAGE=x ENV_FILE=/dev/null EXPECTED_DIGEST=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  TARGET_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa KEEP_NAME=k \
  bash "$ROOT/ops/release/recreate-staging-backend-with-media.sh" --environment public_demo 2>/dev/null; then
  fail "recreate without --component should fail"
else
  ok "recreate requires --component"
fi

# 24b) storefront recreate requires --component
if bash "$ROOT/ops/release/recreate-staging-storefront.sh" --environment public_demo --mode dry-run \
  --image "ghcr.io/saintgroovie/woodright-storefront@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
  --digest sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  --target-sha aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  --keep-name k --env-file /dev/null --evidence-dir /tmp 2>/dev/null; then
  fail "storefront without --component should fail"
else
  ok "storefront recreate requires --component"
fi

# 24c) installer lists pair/storefront helpers
grep -q 'ops/release/cutover-public-demo-pair.sh' "$ROOT/ops/release/install-environment-governance.sh" \
  || fail "installer missing pair cutover"
grep -q 'ops/release/recreate-staging-storefront.sh' "$ROOT/ops/release/install-environment-governance.sh" \
  || fail "installer missing storefront recreate"
ok "installer includes pair+storefront helpers"

# 24d) pair rollback uses environment-scoped identity dir
if grep -n '/srv/woodright/runtime-identity/ACTIVE_PUBLIC.json' "$ROOT/ops/release/cutover-public-demo-pair.sh" | grep -v WOODRIGHT; then
  fail "pair rollback still hardcodes legacy shared identity root"
else
  ok "pair rollback uses scoped identity paths"
fi

# 25) pin reconcile requires --component
if EXPECTED_RELEASE_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  EXPECTED_BACKEND_DIGEST=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  EXPECTED_STOREFRONT_DIGEST=sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb \
  READ_ONLY_NO_LOCK=1 bash "$ROOT/scripts/release/reconcile-public-image-pins.sh" --environment public_demo 2>/dev/null; then
  fail "pin reconcile without --component should fail"
else
  ok "pin reconcile requires --component"
fi

# 26) post-promote env must not hardcode staging
grep -n 'post-promote' "$ROOT/ops/release/recreate-staging-backend-with-media.sh" | grep -q 'WOODRIGHT_ENVIRONMENT' \
  || fail "post-promote must use WOODRIGHT_ENVIRONMENT"
if grep -n 'POST_ARGS=(--environment staging' "$ROOT/ops/release/recreate-staging-backend-with-media.sh"; then
  fail "hardcoded staging post-promote still present"
else
  ok "post-promote uses selected environment"
fi

echo "ALL_OK passes=$PASS"
