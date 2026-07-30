#!/usr/bin/env bash
# Fidelity tests for environment-scoped release governance (no Docker mutation).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=../../ops/lib/woodright-environment-profile.sh
source "$ROOT/ops/lib/woodright-environment-profile.sh"
# shellcheck source=../../ops/lib/woodright-validation-freeze.sh
source "$ROOT/ops/lib/woodright-validation-freeze.sh"

PASS=0
fail() { echo "FAIL: $*"; exit 1; }
ok() { echo "PASS: $*"; PASS=$((PASS + 1)); }

# 1) no environment
if wr_load_environment_profile "" 2>/dev/null; then fail "empty env should fail"; else ok "empty env fails"; fi

# 2) unknown
if wr_load_environment_profile "preprod" 2>/dev/null; then fail "unknown env should fail"; else ok "unknown env fails"; fi

# 3) staging loads
unset WOODRIGHT_ENVIRONMENT WOODRIGHT_ENV_PROFILE_LOADED || true
wr_load_environment_profile staging || fail "staging load"
[[ "$WOODRIGHT_MUTATION_LOCK_PATH" == "/srv/woodright/locks/live-cutover.lock" ]] || fail "staging lock path"
[[ "$WOODRIGHT_OWNERSHIP_DIR" == "/srv/woodright/runtime-ownership" ]] || fail "staging ownership"
[[ "$WOODRIGHT_MEDIA_VOLUME" == *"staging_media" ]] || fail "staging media"
ok "staging profile loads exact pins"

# 4) production loads
unset WOODRIGHT_ENVIRONMENT WOODRIGHT_ENV_PROFILE_LOADED || true
wr_load_environment_profile production || fail "production load"
[[ "$WOODRIGHT_MUTATION_LOCK_PATH" == "/srv/woodright/locks/production-cutover.lock" ]] || fail "prod lock"
[[ "$WOODRIGHT_OWNERSHIP_DIR" == "/srv/woodright/runtime-ownership-production" ]] || fail "prod ownership"
[[ "$WOODRIGHT_COMPOSE_PROJECT" == "woodright-production" ]] || fail "prod compose"
ok "production profile loads exact pins"

# 5) inherited conflict
unset WOODRIGHT_ENV_PROFILE_LOADED || true
export WOODRIGHT_ENVIRONMENT=staging
if wr_load_environment_profile production 2>/dev/null; then fail "inherited conflict should fail"; else ok "inherited env conflict fails"; fi
unset WOODRIGHT_ENVIRONMENT || true

# 6) path traversal name
if wr_resolve_environment_profile_path "../staging" 2>/dev/null; then fail "traversal"; else ok "path traversal rejected"; fi

# 7) missing --environment on recreate dry parse
if bash "$ROOT/ops/release/recreate-staging-backend-with-media.sh" 2>/dev/null; then
  fail "recreate without --environment should fail"
else
  ok "recreate requires --environment"
fi

# 8) production env refused by staging recreate
if IMAGE=x ENV_FILE=/dev/null EXPECTED_DIGEST=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa KEEP_NAME=k \
  bash "$ROOT/ops/release/recreate-staging-backend-with-media.sh" --environment production 2>/dev/null; then
  fail "recreate should refuse production env"
else
  ok "recreate refuses --environment production"
fi

# 9) verify requires environment
if bash "$ROOT/ops/release/verify-backend-media-mount.sh" --compose-only 2>/dev/null; then
  fail "verify without env should fail"
else
  ok "verify requires --environment"
fi

# 10) staging compose-only works (file present)
if bash "$ROOT/ops/release/verify-backend-media-mount.sh" --environment staging --compose-only >/dev/null; then
  ok "staging compose-only PASS"
else
  fail "staging compose-only"
fi

# 11) production compose-only rejected
if bash "$ROOT/ops/release/verify-backend-media-mount.sh" --environment production --compose-only 2>/dev/null; then
  fail "production compose-only should fail"
else
  ok "production compose-only rejected"
fi

# 12) manifest path isolation
unset WOODRIGHT_ENVIRONMENT WOODRIGHT_ENV_PROFILE_LOADED || true
wr_load_environment_profile staging || fail staging
if wr_assert_manifest_path_for_environment "/srv/woodright/runtime-ownership-production/ACTIVE_OWNER.json" 2>/dev/null; then
  fail "staging must not write prod manifests"
else
  ok "staging cannot target production manifests"
fi
unset WOODRIGHT_ENVIRONMENT WOODRIGHT_ENV_PROFILE_LOADED || true
wr_load_environment_profile production || fail production
if wr_assert_manifest_path_for_environment "/srv/woodright/runtime-ownership/ACTIVE_OWNER.json" 2>/dev/null; then
  fail "production must not write staging manifests"
else
  ok "production cannot target staging manifests"
fi

# 13) media volume pin
unset WOODRIGHT_ENVIRONMENT WOODRIGHT_ENV_PROFILE_LOADED || true
wr_load_environment_profile staging || fail staging
if wr_assert_media_volume_for_environment "woodright-production_woodright-production_media" 2>/dev/null; then
  fail "wrong media should fail"
else
  ok "wrong media volume fails"
fi

# 14) validation freeze
TMPLEASE=$(mktemp -d)
export WOODRIGHT_VALIDATION_FREEZE_DIR="$TMPLEASE"
wr_validation_freeze_acquire staging "test-actor" "test-cycle" "qa" 60 || fail acquire
wr_validation_freeze_active staging || fail active
if wr_validation_freeze_assert_clear_for_mutation staging 2>/dev/null; then fail "freeze should block"; else ok "freeze blocks mutation"; fi
WOODRIGHT_VALIDATION_FREEZE_OVERRIDE=1 WOODRIGHT_VALIDATION_FREEZE_OVERRIDE_REASON=test \
  wr_validation_freeze_assert_clear_for_mutation staging || fail override
wr_validation_freeze_release staging || fail release
if wr_validation_freeze_active staging; then fail "should be clear"; else ok "freeze release clears"; fi
rm -rf "$TMPLEASE"

# 15) scripts mention environment requirement
grep -q 'wr_require_environment_from_args\|--environment' "$ROOT/ops/release/recreate-staging-backend-with-media.sh" || fail recreate grep
grep -q 'missing required --environment' "$ROOT/ops/release/reconcile-runtime-manifests.sh" || fail reconcile grep
grep -q 'manifests_absent\|manifests_inaccessible' "$ROOT/ops/monitoring/woodright-health-check.sh" || fail monitor grep
ok "script contracts grepped"

# 16) lock paths differ
unset WOODRIGHT_ENVIRONMENT WOODRIGHT_ENV_PROFILE_LOADED || true
wr_load_environment_profile staging
SLOCK=$WOODRIGHT_MUTATION_LOCK_PATH
unset WOODRIGHT_ENVIRONMENT WOODRIGHT_ENV_PROFILE_LOADED || true
wr_load_environment_profile production
PLOCK=$WOODRIGHT_MUTATION_LOCK_PATH
[[ "$SLOCK" != "$PLOCK" ]] || fail "locks must differ"
ok "staging and production locks differ ($SLOCK vs $PLOCK)"

# 17) empty REQUIRED_RUNTIME_ROLE must stay empty (production)
unset WOODRIGHT_ENVIRONMENT WOODRIGHT_ENV_PROFILE_LOADED || true
wr_load_environment_profile production || fail production
[[ -z "${WOODRIGHT_REQUIRED_RUNTIME_ROLE}" ]] || fail "production role must be empty string"
# simulate :- bug vs - : empty should not become public_demo
got="${WOODRIGHT_REQUIRED_RUNTIME_ROLE-public_demo}"
[[ -z "$got" ]] || fail "empty role expanded wrongly"
ok "production empty runtime role preserved"
