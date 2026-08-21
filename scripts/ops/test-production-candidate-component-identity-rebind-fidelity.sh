#!/usr/bin/env bash
# Fidelity: metadata-only production-candidate component identity rebind.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/ops/release/reconcile-production-candidate-component-identities.sh"
REAL_CONF="$ROOT/ops/config/runtime-environments/production.conf"

FAILED=0
pass() { echo "PASS $*"; }
fail() { echo "FAIL $*"; FAILED=$((FAILED + 1)); }

TMP="$(cd "$(mktemp -d /tmp/wr-n14-rebind-XXXXXX)" && pwd -P)"
cleanup() {
  if [[ "$FAILED" -eq 0 ]]; then rm -rf "$TMP"; else echo "harness kept: $TMP"; fi
}
trap cleanup EXIT

BIN="$TMP/bin"
STATE="$TMP/state"
PROFILES="$TMP/profiles"
SRV="$TMP/srv/woodright"
COMPOSE_DIR="$TMP/etc/dokploy/compose/woodright-production/code"
ENV_FILE="$COMPOSE_DIR/.env"
OWN_DIR="$SRV/runtime-ownership-production"
LOCK="$SRV/locks/production/live-cutover.lock"
CONF="$PROFILES/production.conf"

SF_SHA="0b9adc9aeab12dab3bdbba741e65e254075b37b2"
BE_SHA="4533c5334b75eab8e353b69c14d894fed0d423ae"
SF_DIG="sha256:$(printf 'b%.0s' {1..64})"
BE_DIG="sha256:$(printf 'c%.0s' {1..64})"
SF_REF="ghcr.io/saintgroovie/woodright-storefront@${SF_DIG}"
BE_REF="ghcr.io/saintgroovie/woodright-backend@${BE_DIG}"
CONFIRM="I_UNDERSTAND_PRODUCTION_COMPONENT_IDENTITY_REBIND"

mkdir -p "$BIN" "$STATE/containers" "$PROFILES" "$COMPOSE_DIR" "$OWN_DIR" \
  "$SRV/locks/production" "$SRV/reports/production"
sed -e "s#=/srv/#=${TMP}/srv/#g" -e "s#=/etc/dokploy/#=${TMP}/etc/dokploy/#g" \
  "$REAL_CONF" >"$CONF"
: >"$LOCK"
printf 'WOODRIGHT_BACKEND_IMAGE=%s\nWOODRIGHT_STOREFRONT_IMAGE=%s\n' "$BE_REF" "$SF_REF" >"$ENV_FILE"

# shellcheck source=lib/woodright-production-fake-runtime.sh
source "$ROOT/scripts/ops/lib/woodright-production-fake-runtime.sh"
wr_fake_runtime_install "$BIN"

write_container() {
  local service="$1" digest="$2" revision="$3"
  python3 - "$STATE" "$service" "$digest" "$revision" <<'PY'
import json, os, sys
state, service, digest, revision = sys.argv[1:5]
name = f"woodright-production-{service}"
title = "woodright-backend" if service == "backend" else "woodright-storefront"
doc = [{
  "Id": f"id-{service}",
  "Name": f"/{name}",
  "Config": {
    "Image": f"ghcr.io/saintgroovie/{title}@{digest}",
    "Labels": {
      "org.opencontainers.image.revision": revision,
      "org.opencontainers.image.title": title,
      "com.woodright.deployment-owner": "Dokploy",
    },
  },
  "State": {"Status": "running", "Health": {"Status": "healthy"}},
}]
json.dump(doc, open(os.path.join(state, "containers", f"{name}.json"), "w"))
props = os.path.join(state, "containers", f"{name}.props")
if os.path.exists(props):
    os.remove(props)
PY
}

write_container backend "$BE_DIG" "$BE_SHA"
write_container storefront "$SF_DIG" "$SF_SHA"

python3 - "$OWN_DIR" "$SF_SHA" "$SF_DIG" <<'PY'
import json, os, sys
own, app, sf_dig = sys.argv[1:4]
for name, extra in (
    ("ACTIVE_OWNER.json", {"schema": "woodright.production_candidate.active_owner.v1"}),
    ("ACTIVE_RELEASE.json", {"schema": "woodright.production_candidate.active_release.v1", "state": "committed", "storefront_image": "", "backend_image": ""}),
    ("EXPECTED_RELEASE.json", {
        "schema": "woodright.production_candidate.expected_release.v1",
        "storefront_digest": sf_dig,
        "storefront_image": "ghcr.io/saintgroovie/woodright-storefront@" + sf_dig,
        "backend_digest": "",
        "backend_image": "",
    }),
):
    doc = {"application_source_sha": app, "helper_install_sha": "74fbad4b4247653278517ead3826548e3f44ed6b", **extra}
    json.dump(doc, open(os.path.join(own, name), "w"), indent=2)
PY

base_env() {
  printf '%s\n' \
    "PATH=$BIN:$PATH" \
    "WOODRIGHT_ENV_PROFILE_DIR=$PROFILES" \
    "WOODRIGHT_DOCKER_BIN=$BIN/docker" \
    "WOODRIGHT_FAKE_DOCKER_STATE=$STATE" \
    "WR_STAGING_MUTATION_LOCK_ALLOW_NONCANONICAL=1" \
    "WOODRIGHT_PRODUCTION_OWNERSHIP_OWNER=$(id -un)" \
    "WOODRIGHT_PRODUCTION_OWNERSHIP_GROUP=$(id -gn)" \
    "WOODRIGHT_PRODUCTION_OWNERSHIP_MODE=0640"
}

ENVS=()
while IFS= read -r line; do ENVS+=("$line"); done < <(base_env)

set +e
env "${ENVS[@]}" bash "$SCRIPT" \
  --environment production \
  --storefront-ref "$SF_REF" --backend-ref "$BE_REF" \
  --storefront-source-sha "$SF_SHA" --backend-source-sha "$BE_SHA" \
  --application-source-sha "$SF_SHA" \
  --dry-run >"$TMP/out-dry.txt" 2>"$TMP/err-dry.txt"
RC=$?
set -e
[[ "$RC" -eq 0 ]] && pass "dry-run exit 0" || { fail "dry-run rc=$RC"; cat "$TMP/err-dry.txt"; }
grep -q 'DRY_RUN_OK' "$TMP/err-dry.txt" "$TMP/out-dry.txt" && pass "dry-run token" || fail "dry-run token"
python3 - "$OWN_DIR/EXPECTED_RELEASE.json" <<'PY' && pass "dry-run did not write EXPECTED" || fail "dry-run mutated EXPECTED"
import json, sys
d=json.load(open(sys.argv[1]))
assert d.get("backend_digest") == ""
PY

set +e
env "${ENVS[@]}" bash "$SCRIPT" \
  --environment production \
  --storefront-ref "$SF_REF" --backend-ref "$BE_REF" \
  --storefront-source-sha "$SF_SHA" --backend-source-sha "$BE_SHA" \
  --application-source-sha "$SF_SHA" \
  --execute --confirm-mutation WRONG >"$TMP/out-confirm.txt" 2>"$TMP/err-confirm.txt"
RC=$?
set -e
[[ "$RC" -ne 0 ]] && pass "wrong confirm refused" || fail "wrong confirm rc=$RC"

EV="$TMP/ev-rebind"
set +e
env "${ENVS[@]}" WOODRIGHT_EVIDENCE_DIR="$EV" WOODRIGHT_REBIND_FAULT=prelock_expected_swap bash "$SCRIPT" \
  --environment production \
  --storefront-ref "$SF_REF" --backend-ref "$BE_REF" \
  --storefront-source-sha "$SF_SHA" --backend-source-sha "$BE_SHA" \
  --application-source-sha "$SF_SHA" \
  --execute --confirm-mutation "$CONFIRM" >"$TMP/out-ok.txt" 2>"$TMP/err-ok.txt"
RC=$?
set -e
[[ "$RC" -eq 0 ]] && pass "execute exit 0" || { fail "execute rc=$RC"; cat "$TMP/err-ok.txt"; }
python3 - "$OWN_DIR/EXPECTED_RELEASE.json" "$SF_DIG" "$SF_SHA" "$BE_DIG" "$BE_SHA" "$SF_REF" "$BE_REF" <<'PY' \
  && pass "execute wrote complete pair" || fail "execute EXPECTED"
import json, sys
d=json.load(open(sys.argv[1]))
assert d["storefront_digest"]==sys.argv[2]
assert d["storefront_source_sha"]==sys.argv[3]
assert d["backend_digest"]==sys.argv[4]
assert d["backend_source_sha"]==sys.argv[5]
assert d["storefront_image"]==sys.argv[6]
assert d["backend_image"]==sys.argv[7]
assert d["application_source_sha"]==sys.argv[3]
assert d["helper_install_sha"]=="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", d.get("helper_install_sha")
PY
python3 - "$EV/before/EXPECTED_RELEASE.json" <<'PY' && pass "prelock swap captured under lock not stale snapshot" || fail "before snapshot stale"
import json, sys
d=json.load(open(sys.argv[1]))
assert d["helper_install_sha"]=="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
PY

write_container backend "$BE_DIG" "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
set +e
env "${ENVS[@]}" WOODRIGHT_EVIDENCE_DIR="$TMP/ev-drift" bash "$SCRIPT" \
  --environment production \
  --storefront-ref "$SF_REF" --backend-ref "$BE_REF" \
  --storefront-source-sha "$SF_SHA" --backend-source-sha "$BE_SHA" \
  --application-source-sha "$SF_SHA" \
  --execute --confirm-mutation "$CONFIRM" >"$TMP/out-drift.txt" 2>"$TMP/err-drift.txt"
RC=$?
set -e
[[ "$RC" -ne 0 ]] && pass "revision drift refused" || fail "revision drift rc=$RC"
grep -q 'LIVE_COMPONENT_IDENTITY_DRIFT' "$TMP/err-drift.txt" && pass "drift token" || fail "drift token"

SPOOF_BE="ghcr.io/saintgroovie/woodright-backend@sha256:$(printf 'a%.0s' {1..64})"
write_container backend "$BE_DIG" "$BE_SHA"
set +e
env "${ENVS[@]}" bash "$SCRIPT" \
  --environment production \
  --storefront-ref "$SF_REF" --backend-ref "$SPOOF_BE" \
  --storefront-source-sha "$SF_SHA" --backend-source-sha "$BE_SHA" \
  --application-source-sha "$SF_SHA" \
  --dry-run >"$TMP/out-spoof.txt" 2>"$TMP/err-spoof.txt"
RC=$?
set -e
[[ "$RC" -ne 0 ]] && pass "spoof backend ref refused" || fail "spoof rc=$RC"

bash -n "$SCRIPT" && pass "syntax rebind helper" || fail "syntax rebind helper"

if [[ "$FAILED" -eq 0 ]]; then
  echo "OK production-candidate component identity rebind fidelity"
  exit 0
fi
echo "FAILED count=$FAILED"
exit 1
