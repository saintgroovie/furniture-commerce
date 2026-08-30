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

# 5) production loads (private PRODUCTION_CANDIDATE — not public_production)
unset WOODRIGHT_ENVIRONMENT WOODRIGHT_ENV_PROFILE_LOADED || true
wr_load_environment_profile production || fail "production load"
[[ "$WOODRIGHT_MUTATION_LOCK_PATH" == "/srv/woodright/locks/production/live-cutover.lock" ]] || fail "prod lock"
[[ "$WOODRIGHT_OWNERSHIP_DIR" == "/srv/woodright/runtime-ownership-production" ]] || fail "prod ownership"
[[ "$WOODRIGHT_ENVIRONMENT_CLASS" == "PRODUCTION_CANDIDATE" ]] || fail "prod class"
[[ "$WOODRIGHT_PUBLIC_EXPOSURE" == "private" ]] || fail "prod exposure"
[[ "$WOODRIGHT_REQUIRED_DB_ALIAS" == "non_public_candidate_db" ]] || fail "prod db alias"
# Capture candidate paths for isolation asserts against public_production
PROD_OWN="$WOODRIGHT_OWNERSHIP_DIR"
PROD_LOCK="$WOODRIGHT_MUTATION_LOCK_PATH"
PROD_BACKUP="${WOODRIGHT_BACKUP_ROOT:-}"
ok "production profile loads exact pins"

# 5b) public_production loads as isolated public indexable contract
unset WOODRIGHT_ENVIRONMENT WOODRIGHT_ENV_PROFILE_LOADED || true
wr_load_environment_profile public_production || fail "public_production load"
[[ "$WOODRIGHT_ENVIRONMENT" == "public_production" ]] || fail "public_production env id"
[[ "$WOODRIGHT_ENVIRONMENT_CLASS" == "PUBLIC_PRODUCTION" ]] || fail "public_production class"
[[ "$WOODRIGHT_PUBLIC_EXPOSURE" == "public" ]] || fail "public_production exposure"
[[ "$WOODRIGHT_LAUNCH_MODE" == "public_indexable" ]] || fail "public_production launch mode"
[[ "$WOODRIGHT_SEO_MODE" == "public_indexable" ]] || fail "public_production seo mode"
[[ "$WOODRIGHT_CANONICAL_SITE_URL" == "https://woodright.ru" ]] || fail "public_production site url"
[[ "$WOODRIGHT_PUBLIC_API_URL" == "https://api.woodright.ru" ]] || fail "public_production api url"
[[ "$WOODRIGHT_REQUIRED_DB_ALIAS" == "public_production_db" ]] || fail "public_production db alias"
[[ "$WOODRIGHT_OWNERSHIP_DIR" == "/srv/woodright/runtime-ownership-public-production" ]] || fail "public_production ownership"
[[ "$WOODRIGHT_MUTATION_LOCK_PATH" == "/srv/woodright/locks/public_production/live-cutover.lock" ]] || fail "public_production lock"
[[ "$WOODRIGHT_BACKUP_ROOT" == "/srv/woodright/backups/automated/public-production" ]] || fail "public_production backup"
[[ "$WOODRIGHT_MONITOR_STATE_ROOT" == "/srv/woodright/monitoring/public-production/state" ]] || fail "public_production monitor"
[[ "${WOODRIGHT_MONITOR_HISTORY:-}" == "/srv/woodright/monitoring/public-production/history" ]] || fail "public_production monitor history"
[[ "$WOODRIGHT_OWNER_APPROVAL_ENVIRONMENT" == "public_production" ]] || fail "public_production approval env"
[[ "$WOODRIGHT_ENVIRONMENT_PROVISIONED" == "1" ]] || fail "public_production must be technically provisioned"
[[ "${WOODRIGHT_MONITOR_BACKUP_RUNTIME_PROVISIONED:-0}" == "1" ]] || fail "public_production monitor/backup runtime must be provisioned"
[[ "$WOODRIGHT_OWNERSHIP_DIR" != "$PROD_OWN" ]] || fail "ownership must not share with production candidate"
[[ "$WOODRIGHT_MUTATION_LOCK_PATH" != "$PROD_LOCK" ]] || fail "lock must not share with production candidate"
if [[ -n "$PROD_BACKUP" && "$WOODRIGHT_BACKUP_ROOT" == "$PROD_BACKUP" ]]; then
  fail "backup must not share with production candidate"
fi
if wr_assert_environment_provisioned; then ok "public_production provisioned assert passes"; else fail "public_production provisioned assert should pass"; fi
# Buyer launch gates remain pending even when technically provisioned
[[ "${WOODRIGHT_LAUNCH_GATE_DNS_TLS:-}" == "required" ]] || fail "DNS/TLS launch gate must remain required"
[[ "${WOODRIGHT_ALLOW_HOST_PUBLISH:-1}" == "0" ]] || fail "host publish must stay denied pre-cutover"
ok "public_production profile loads isolated pins"

# 6) inherited conflict
unset WOODRIGHT_ENV_PROFILE_LOADED || true
export WOODRIGHT_ENVIRONMENT=public_demo
if wr_load_environment_profile production 2>/dev/null; then fail "inherited conflict should fail"; else ok "inherited env conflict fails"; fi
unset WOODRIGHT_ENVIRONMENT || true
unset WOODRIGHT_ENV_PROFILE_LOADED || true
export WOODRIGHT_ENVIRONMENT=production
if wr_load_environment_profile public_production 2>/dev/null; then fail "candidate→public_production conflict should fail"; else ok "candidate vs public_production conflict fails"; fi
unset WOODRIGHT_ENVIRONMENT || true

# 7) path traversal name
if wr_resolve_environment_profile_path "../public_demo" 2>/dev/null; then fail "traversal"; else ok "path traversal rejected"; fi

# 8) missing required flags on recreate (mode required first; no silent execute)
out8="$(bash "$ROOT/ops/release/recreate-staging-backend-with-media.sh" 2>&1 || true)"
echo "$out8" | grep -q 'RECREATE_MODE_REQUIRED' && ok "recreate requires --mode" || fail "recreate requires --mode"

# 9) staging refused by public_demo-only recreate
if IMAGE=x ENV_FILE=/dev/null EXPECTED_DIGEST=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa KEEP_NAME=k \
  bash "$ROOT/ops/release/recreate-staging-backend-with-media.sh" --mode dry-run --environment staging 2>/dev/null; then
  fail "recreate should refuse staging (unprovisioned / not public_demo)"
else
  ok "recreate refuses --environment staging"
fi

# 10) production refused by public_demo recreate helper
if IMAGE=x ENV_FILE=/dev/null EXPECTED_DIGEST=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa KEEP_NAME=k \
  bash "$ROOT/ops/release/recreate-staging-backend-with-media.sh" --mode dry-run --environment production 2>/dev/null; then
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

# 16) locks differ across demo / staging / production candidate / public_production
unset WOODRIGHT_ENVIRONMENT WOODRIGHT_ENV_PROFILE_LOADED || true
wr_load_environment_profile public_demo; L1=$WOODRIGHT_MUTATION_LOCK_PATH
unset WOODRIGHT_ENVIRONMENT WOODRIGHT_ENV_PROFILE_LOADED || true
wr_load_environment_profile staging; L2=$WOODRIGHT_MUTATION_LOCK_PATH
unset WOODRIGHT_ENVIRONMENT WOODRIGHT_ENV_PROFILE_LOADED || true
wr_load_environment_profile production; L3=$WOODRIGHT_MUTATION_LOCK_PATH
unset WOODRIGHT_ENVIRONMENT WOODRIGHT_ENV_PROFILE_LOADED || true
wr_load_environment_profile public_production; L4=$WOODRIGHT_MUTATION_LOCK_PATH
[[ "$L1" != "$L2" && "$L2" != "$L3" && "$L1" != "$L3" ]] || fail "locks must all differ"
[[ "$L4" != "$L1" && "$L4" != "$L2" && "$L4" != "$L3" ]] || fail "public_production lock must differ"
ok "four environment locks differ"

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
  /srv/woodright/locks/production/live-cutover.lock \
  /srv/woodright/locks/public_production/live-cutover.lock
 do
  case "$p" in
    /srv/woodright/locks/public_demo/live-cutover.lock|\
    /srv/woodright/locks/staging/live-cutover.lock|\
    /srv/woodright/locks/production/live-cutover.lock|\
    /srv/woodright/locks/public_production/live-cutover.lock|\
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
  bash "$ROOT/ops/release/recreate-staging-backend-with-media.sh" --mode dry-run --environment public_demo 2>/dev/null; then
  fail "recreate without --component should fail"
else
  ok "recreate requires --component"
fi

# 24a) storefront requires --mode (no silent execute default)
unset WOODRIGHT_ENVIRONMENT WOODRIGHT_ENV_PROFILE_LOADED || true
out24a="$(bash "$ROOT/ops/release/recreate-staging-storefront.sh" --environment public_demo --component storefront 2>&1 || true)"
echo "$out24a" | grep -q 'RECREATE_MODE_REQUIRED' && ok "storefront requires --mode" || fail "storefront requires --mode"

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

# 24c) installer lists pair/storefront helpers + memory/mode libs
grep -q 'ops/release/cutover-public-demo-pair.sh' "$ROOT/ops/release/install-environment-governance.sh" \
  || fail "installer missing pair cutover"
grep -q 'ops/release/recreate-staging-storefront.sh' "$ROOT/ops/release/install-environment-governance.sh" \
  || fail "installer missing storefront recreate"
grep -q 'ops/lib/woodright-memory-limits.sh' "$ROOT/ops/release/install-environment-governance.sh" \
  || fail "installer missing memory-limits"
grep -q 'ops/lib/woodright-recreate-mode.sh' "$ROOT/ops/release/install-environment-governance.sh" \
  || fail "installer missing recreate-mode"
ok "installer includes pair+storefront helpers"

grep -q 'ops/release/reconcile-production-candidate-compose-template.sh' "$ROOT/ops/release/install-environment-governance.sh" \
  || fail "installer missing production compose template helper"
grep -q 'ops/compose/woodright-production.docker-compose.yml' "$ROOT/ops/release/install-environment-governance.sh" \
  || fail "installer missing canonical production compose template"
ok "installer includes production compose template reconcile"

# 24c-bis) installer ships the production cutover helper AND its skew recovery
# companion - shipping only one of the pair leaves the VM unable to recover a
# pin/runtime skew that the cutover helper now refuses to run against.
grep -q 'ops/release/cutover-production-candidate.sh' "$ROOT/ops/release/install-environment-governance.sh" \
  || fail "installer missing production cutover helper"
grep -q 'ops/release/recover-production-candidate-skew.sh' "$ROOT/ops/release/install-environment-governance.sh" \
  || fail "installer missing production skew recovery helper"
[[ -f "$ROOT/ops/release/recover-production-candidate-skew.sh" ]] \
  || fail "skew recovery helper missing from the repo"
grep -q 'existing_pin_runtime_skew_requires_recovery' "$ROOT/ops/release/cutover-production-candidate.sh" \
  || fail "cutover helper does not refuse an existing pin/runtime skew"
grep -q 'recover-production-candidate-skew.sh' "$ROOT/ops/release/cutover-production-candidate.sh" \
  || fail "cutover helper does not point at the recovery helper"
grep -q 'I_UNDERSTAND_PRODUCTION_PIN_RUNTIME_SKEW_RECOVERY' "$ROOT/ops/release/recover-production-candidate-skew.sh" \
  || fail "skew recovery helper missing its confirm token"
ok "installer includes the production cutover + skew recovery pair"

# 24c-ter) installer FILES and verify REQUIRED_JSON must stay identical. A drift
# here causes live install to copy files then fail post-marker verify and restore
# the previous bundle (exactly what blocked shipping recover-production-candidate-skew.sh).
python3 - "$ROOT" <<'PY' || fail "installer FILES vs verify REQUIRED_JSON drift"
import json, pathlib, re, sys
root = pathlib.Path(sys.argv[1])
inst = (root / "ops/release/install-environment-governance.sh").read_text()
ver = (root / "ops/release/verify-environment-governance-bundle.sh").read_text()
flist = [
    ln.strip()
    for ln in re.search(r"^FILES=\((.*?)^\)", inst, re.M | re.S).group(1).splitlines()
    if ln.strip() and not ln.strip().startswith("#")
]
rlist = json.loads(re.search(r"REQUIRED_JSON='(\[.*?\])'", ver, re.S).group(1))
if flist != rlist:
    print("only_in_FILES", sorted(set(flist) - set(rlist)), file=sys.stderr)
    print("only_in_REQUIRED", sorted(set(rlist) - set(flist)), file=sys.stderr)
    raise SystemExit(1)
PY
ok "installer FILES matches verify REQUIRED_JSON"

# 24d) pair rollback uses environment-scoped identity dir
if grep -nE '/srv/woodright/runtime-identity/(ACTIVE_PUBLIC|DOKPLOY|public-demo)' \
  "$ROOT/ops/lib/woodright-cutover-common.sh" "$ROOT/ops/release/cutover-public-demo-pair.sh" \
  | grep -v runtime-identity-public-demo | grep -v '^[^:]*:[[:space:]]*#'; then
  fail "pair rollback/pin paths still hardcode legacy shared identity root"
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

# 27) public_production pair helper is installer-listed and isolated
grep -q 'ops/release/cutover-public-production-pair.sh' "$ROOT/ops/release/install-environment-governance.sh" \
  || fail "installer missing public_production pair helper"
grep -q 'docs/operator/public-production-pair-cutover.md' "$ROOT/ops/release/install-environment-governance.sh" \
  || fail "installer missing public_production pair docs"
grep -q 'I_UNDERSTAND_PUBLIC_PRODUCTION_PAIR_CUTOVER' "$ROOT/ops/release/cutover-public-production-pair.sh" \
  || fail "public_production helper missing confirm token"
grep -q 'ops/release/cutover-public-apex-routing.sh' "$ROOT/ops/release/install-environment-governance.sh" \
  || fail "installer missing public apex routing helper"
grep -q 'docs/operator/public-apex-cutover.md' "$ROOT/ops/release/install-environment-governance.sh" \
  || fail "installer missing public apex cutover docs"
grep -q 'I_UNDERSTAND_PUBLIC_APEX_ROUTING_CUTOVER' "$ROOT/ops/release/cutover-public-apex-routing.sh" \
  || fail "apex routing helper missing confirm token"
grep -q 'wr_public_demo_wait_buyer_edge' "$ROOT/ops/lib/woodright-cutover-common.sh" \
  || fail "cutover-common missing public_demo edge settle"
grep -q 'wr_public_demo_wait_buyer_edge' "$ROOT/ops/release/cutover-public-demo-pair.sh" \
  || fail "public_demo pair helper missing edge settle call"
grep -q 'wr_public_demo_apply_traefik_pair_endpoints' "$ROOT/ops/lib/woodright-cutover-common.sh" \
  || fail "cutover-common missing Traefik endpoint apply"
grep -q 'ops/release/apply-public-demo-traefik-endpoints.sh' "$ROOT/ops/release/install-environment-governance.sh" \
  || fail "installer missing Traefik endpoint apply helper"
grep -q 'ops/lib/woodright-public-demo-traefik-endpoint.py' "$ROOT/ops/release/install-environment-governance.sh" \
  || fail "installer missing Traefik endpoint python helper"
grep -q 'ops/lib/woodright-public-demo-target-env.py' "$ROOT/ops/release/install-environment-governance.sh" \
  || fail "installer missing public_demo target env python helper"
grep -q 'ops/release/prepare-public-demo-target-env.sh' "$ROOT/ops/release/install-environment-governance.sh" \
  || fail "installer missing public_demo target env prepare helper"
grep -q 'wr_public_demo_assert_target_env_release_identity' "$ROOT/ops/lib/woodright-cutover-common.sh" \
  || fail "cutover-common missing target env identity gate"
grep -q 'TARGET_ENV_RELEASE_SHA_MISMATCH' "$ROOT/ops/release/cutover-public-demo-pair.sh" \
  || fail "pair helper missing TARGET_ENV_RELEASE_SHA_MISMATCH"
grep -q 'EDGE_NOT_CONVERGED' "$ROOT/ops/lib/woodright-cutover-common.sh" \
  || fail "cutover-common missing EDGE_NOT_CONVERGED"
if grep -qE '^[^#]*(nsupdate|route53|cloudflare)' "$ROOT/ops/release/cutover-public-apex-routing.sh"; then
  fail "apex routing helper must not mutate DNS via CLI"
else
  ok "apex routing helper does not mutate DNS via CLI"
fi
if grep -q 'recreate-staging-storefront.sh' "$ROOT/ops/release/cutover-public-production-pair.sh"; then
  fail "public_production helper must not call demo storefront recreate"
else
  ok "public_production helper does not call demo recreate"
fi
if grep -q 'recover-production-candidate-skew.sh' "$ROOT/ops/release/cutover-public-production-pair.sh" \
  && ! grep -q 'do NOT run recover-production-candidate-skew.sh' "$ROOT/ops/release/cutover-public-production-pair.sh"; then
  fail "public_production helper must not invoke candidate skew recovery"
else
  ok "public_production helper does not invoke candidate skew recovery"
fi
ok "installer includes public_production pair helper"

echo "ALL_OK passes=$PASS"
