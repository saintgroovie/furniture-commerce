#!/usr/bin/env bash
# Fidelity tests for the PRIVATE production-candidate execute path
# (ops/release/cutover-production-candidate.sh).
#
# Everything runs against a throwaway filesystem under /tmp with a fake docker
# / docker compose shim. No real container, pin file, lock or VM is touched,
# and the public_demo roots are asserted to stay byte-identical throughout.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/ops/release/cutover-production-candidate.sh"
REAL_CONF="$ROOT/ops/config/runtime-environments/production.conf"

FAILED=0
pass() { echo "PASS $*"; }
fail() { echo "FAIL $*"; FAILED=$((FAILED + 1)); }

# Real path (macOS /tmp -> /private/tmp): the profile loader resolves the
# profile with realpath and requires it to stay inside WOODRIGHT_ENV_PROFILE_DIR.
TMP="$(cd "$(mktemp -d /tmp/wr-prod-cutover-exec-XXXXXX)" && pwd -P)"
cleanup() {
  if [[ "$FAILED" -eq 0 ]]; then
    rm -rf "$TMP"
  else
    echo "harness kept for inspection: $TMP"
  fi
}
trap cleanup EXIT

BIN="$TMP/bin"
STATE="$TMP/state"
PROFILES="$TMP/profiles"
SRV="$TMP/srv/woodright"
COMPOSE_DIR="$TMP/etc/dokploy/compose/woodright-production/code"
ENV_FILE="$COMPOSE_DIR/.env"
OWN_DIR="$SRV/runtime-ownership-production"
PD_OWN_DIR="$SRV/runtime-ownership-public-demo"
PD_ID_DIR="$SRV/runtime-identity-public-demo"
PD_LOCK="$SRV/locks/public_demo/live-cutover.lock"
LOCK="$SRV/locks/production/live-cutover.lock"
CONF="$PROFILES/production.conf"

APP_SHA="1111111111111111111111111111111111111111"
HELPER_SHA="2222222222222222222222222222222222222222"
NEW_BE_DIG="sha256:$(printf 'a%.0s' {1..64})"
NEW_SF_DIG="sha256:$(printf 'b%.0s' {1..64})"
OLD_BE_DIG="sha256:$(printf 'c%.0s' {1..64})"
OLD_SF_DIG="sha256:$(printf 'd%.0s' {1..64})"
OLD_PEER_SHA="0000000000000000000000000000000000000000"
BE_REF="ghcr.io/saintgroovie/woodright-backend@${NEW_BE_DIG}"
SF_REF="ghcr.io/saintgroovie/woodright-storefront@${NEW_SF_DIG}"
OLD_BE_REF="ghcr.io/saintgroovie/woodright-backend@${OLD_BE_DIG}"
OLD_SF_REF="ghcr.io/saintgroovie/woodright-storefront@${OLD_SF_DIG}"
CONFIRM="I_UNDERSTAND_PRIVATE_PRODUCTION_CANDIDATE_CUTOVER"
MEDIA_VOL="woodright-production_woodright-production_media"

mkdir -p "$BIN" "$STATE" "$PROFILES" "$COMPOSE_DIR" "$OWN_DIR" \
  "$SRV/locks/production" "$SRV/locks/public_demo" "$SRV/reports/production" \
  "$PD_OWN_DIR" "$PD_ID_DIR" "$SRV/runtime-identity-production"

# --------------------------------------------------------------------------
# Production profile: the real conf with every absolute path re-rooted in TMP.
# --------------------------------------------------------------------------
sed -e "s#=/srv/#=${TMP}/srv/#g" -e "s#=/etc/dokploy/#=${TMP}/etc/dokploy/#g" \
  "$REAL_CONF" >"$CONF"
grep -q "WOODRIGHT_MUTATION_LOCK_PATH=${LOCK}$" "$CONF" \
  && pass "harness profile re-roots the production lock into TMP" \
  || fail "harness profile lock path not re-rooted"
grep -q "WOODRIGHT_COMPOSE_ENV_FILE=${ENV_FILE}$" "$CONF" \
  && pass "harness profile re-roots the compose .env into TMP" \
  || fail "harness profile compose .env not re-rooted"

printf 'services:\n  backend: {}\n  storefront: {}\n  postgres: {}\n  redis: {}\n' \
  >"$COMPOSE_DIR/docker-compose.yml"
: >"$LOCK"
: >"$PD_LOCK"

# --------------------------------------------------------------------------
# fake docker / docker compose / http (shared with the skew recovery harness)
# --------------------------------------------------------------------------
# shellcheck source=lib/woodright-production-fake-runtime.sh
source "$ROOT/scripts/ops/lib/woodright-production-fake-runtime.sh"
wr_fake_runtime_install "$BIN"

# --------------------------------------------------------------------------
# harness state helpers
# --------------------------------------------------------------------------
write_container() {
  local service="$1" digest="$2" host_ip="${3:-127.0.0.1}" traefik="${4:-0}" revision="${5:-0000000000000000000000000000000000000000}"
  python3 - "$STATE" "$service" "$digest" "$host_ip" "$traefik" "$revision" <<'PY'
import json, os, sys, time
state, service, digest, host_ip, traefik, revision = sys.argv[1:7]
name = f"woodright-production-{service}"
title = "woodright-backend" if service == "backend" else "woodright-storefront"
labels = {
    "com.woodright.deployment-owner": "Dokploy",
    "com.woodright.exposure": "private",
    "com.woodright.database-identity": "non_public_candidate_db",
    "org.opencontainers.image.title": title,
    "org.opencontainers.image.revision": revision,
    "com.docker.compose.project": "woodright-production",
    "com.docker.compose.service": service,
    "com.docker.compose.container-number": "1",
}
if traefik == "1":
    labels["traefik.enable"] = "true"
    labels["traefik.http.routers.wr.rule"] = "Host(`woodright.ru`)"
doc = [{
    "Id": f"id-{service}-live",
    "Name": f"/{name}",
    "Image": digest,
    "RepoDigests": [f"ghcr.io/saintgroovie/{title}@{digest}"],
    "RestartCount": 0,
    "Config": {
        "Image": f"ghcr.io/saintgroovie/{title}@{digest}",
        "Env": [
            "WOODRIGHT_EXPOSURE=private",
            "WOODRIGHT_DATABASE_IDENTITY_ALIAS=non_public_candidate_db",
            "PGPASSWORD=MOCK_SECRET_VALUE",
        ],
        "Labels": labels,
        "Healthcheck": {"Test": ["CMD-SHELL", "true"]},
    },
    "HostConfig": {
        "Binds": [],
        "PortBindings": {
            ("9000/tcp" if service == "backend" else "3000/tcp"): [
                {"HostIp": host_ip, "HostPort": ("9200" if service == "backend" else "3200")}
            ]
        },
    },
    "Mounts": (
        [{"Type": "volume", "Name": "woodright-production_woodright-production_media",
          "Destination": "/server/static"}] if service == "backend" else []
    ),
    "State": {
        "Status": "running",
        "StartedAt": "2026-08-01T00:00:00.000000000Z",
        "Health": {"Status": "healthy"},
    },
    "NetworkSettings": {"Networks": {"dokploy-network": {}}, "Ports": {}},
}]
json.dump(doc, open(os.path.join(state, "containers", f"{name}.json"), "w"))
props = os.path.join(state, "containers", f"{name}.props")
if os.path.exists(props):
    os.remove(props)
os.makedirs(os.path.join(state, "deployed"), exist_ok=True)
open(os.path.join(state, "deployed", service), "w").write(digest)
PY
}

write_image() {
  local ref="$1" title="$2" profile="${3:-production_candidate}" revision="${4:-$APP_SHA}"
  python3 - "$STATE" "$ref" "$title" "$profile" "$revision" <<'PY'
import json, os, sys
state, ref, title, profile, revision = sys.argv[1:6]
doc = {
    "Id": ref.split("@")[-1],
    "RepoDigests": [ref],
    "Config": {
        "Labels": {
            "org.opencontainers.image.revision": revision,
            "org.opencontainers.image.title": title,
            "woodright.image.build_profile": profile,
            "com.woodright.deployment-owner": "Dokploy",
        }
    },
}
json.dump(doc, open(os.path.join(state, "images", ref.replace("/", "_") + ".json"), "w"))
PY
}

reset_harness() {
  rm -rf "$STATE"
  mkdir -p "$STATE/containers" "$STATE/images" "$STATE/volumes" "$STATE/log" \
    "$STATE/health-ready-at" "$STATE/deployed"
  touch "$STATE/volumes/${MEDIA_VOL}.ok"
  write_container backend "$OLD_BE_DIG"
  write_container storefront "$OLD_SF_DIG"
  # A public_demo container exists on the host and must never be selected.
  python3 - "$STATE" <<'PY'
import json, os, sys
state = sys.argv[1]
for name in ("woodright-staging-backend", "woodright-staging-storefront"):
    doc = [{"Id": f"id-{name}", "Name": f"/{name}",
            "Config": {"Image": "ghcr.io/x@sha256:" + "e" * 64, "Labels": {
                "com.woodright.runtime-role": "public_demo"}},
            "State": {"Status": "running"}}]
    json.dump(doc, open(os.path.join(state, "containers", f"{name}.json"), "w"))
PY
  write_image "$BE_REF" woodright-backend
  write_image "$SF_REF" woodright-storefront
  write_image "$OLD_BE_REF" woodright-backend production_candidate "0000000000000000000000000000000000000000"
  write_image "$OLD_SF_REF" woodright-storefront production_candidate "0000000000000000000000000000000000000000"

  mkdir -p "$COMPOSE_DIR"
  cat >"$ENV_FILE" <<EOF
# Dokploy compose environment (harness copy)
WOODRIGHT_BACKEND_IMAGE=${OLD_BE_REF}
WOODRIGHT_STOREFRONT_IMAGE=${OLD_SF_REF}
WOODRIGHT_RELEASE_SHA=9946b42aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
POSTGRES_PASSWORD=MOCK_SECRET_VALUE
UNRELATED_KEY=keep-me
EOF

  rm -rf "$OWN_DIR"
  mkdir -p "$OWN_DIR"
  printf '{"schema":"pre-existing","application_source_sha":"0000000000000000000000000000000000000000"}\n' \
    >"$OWN_DIR/ACTIVE_RELEASE.json"

  # public_demo canaries
  rm -rf "$PD_OWN_DIR" "$PD_ID_DIR"
  mkdir -p "$PD_OWN_DIR" "$PD_ID_DIR"
  printf '{"env":"public_demo","untouched":true}\n' >"$PD_OWN_DIR/ACTIVE_OWNER.json"
  printf '{"env":"public_demo","untouched":true}\n' >"$PD_ID_DIR/ACTIVE_PUBLIC.json"
  PD_CANARY="$(cat "$PD_OWN_DIR/ACTIVE_OWNER.json" "$PD_ID_DIR/ACTIVE_PUBLIC.json" "$PD_LOCK")"
}

pin_of() { awk -F= -v k="$1" '$1==k {sub(/^[^=]*=/,""); print; exit}' "$ENV_FILE"; }
digest_of() {
  WOODRIGHT_FAKE_DOCKER_STATE="$STATE" "$BIN/docker" inspect "$1" --format '{{.Config.Image}}' 2>/dev/null \
    | grep -oE 'sha256:[0-9a-f]{64}' | head -1 || true
}
id_of() {
  WOODRIGHT_FAKE_DOCKER_STATE="$STATE" "$BIN/docker" inspect "$1" --format '{{.Id}}' 2>/dev/null || true
}
container_exists() { [[ -f "$STATE/containers/$1.json" ]]; }
# Keepers are gone for good: the helper must never rename a live container aside.
keeper_count() { find "$STATE/containers" -name '*keeper*' | wc -l | tr -d ' '; }
assert_no_keepers() {
  local label="$1"
  if [[ "$(keeper_count)" == "0" ]] && ! grep -q 'rename' "$STATE/log/journal.log" 2>/dev/null; then
    pass "$label: no keeper container was created or renamed"
  else
    fail "$label: keeper artefacts present ($(keeper_count) containers)"
  fi
}

assert_public_demo_untouched() {
  local label="$1" now
  now="$(cat "$PD_OWN_DIR/ACTIVE_OWNER.json" "$PD_ID_DIR/ACTIVE_PUBLIC.json" "$PD_LOCK")"
  if [[ "$now" == "$PD_CANARY" ]]; then
    pass "$label: public_demo roots untouched"
  else
    fail "$label: public_demo roots changed"
  fi
  if grep -qE 'staging|public-demo|public_demo' "$STATE/log/commands.log" 2>/dev/null; then
    fail "$label: public_demo containers were addressed by docker"
  else
    pass "$label: no public_demo container was ever selected"
  fi
}

lock_is_free() {
  python3 - "$1" <<'PY'
import fcntl, os, sys
fd = os.open(sys.argv[1], os.O_RDWR | os.O_CREAT)
try:
    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    sys.exit(1)
sys.exit(0)
PY
}

base_env() {
  printf '%s\n' \
    "PATH=$BIN:$PATH" \
    "WOODRIGHT_ENV_PROFILE_DIR=$PROFILES" \
    "WOODRIGHT_DOCKER_BIN=$BIN/docker" \
    "WOODRIGHT_FAKE_DOCKER_STATE=$STATE" \
    "WOODRIGHT_FAKE_COMPOSE_BIN=$BIN/compose" \
    "WOODRIGHT_CUTOVER_HARNESS=1" \
    "WOODRIGHT_FAKE_HTTP_BIN=$BIN/http" \
    "WOODRIGHT_HELPER_INSTALL_SHA=$HELPER_SHA" \
    "WOODRIGHT_PROVENANCE_ALLOW_ENV_OVERRIDE=1" \
    "WR_STAGING_MUTATION_LOCK_ALLOW_NONCANONICAL=1" \
    "WR_STAGING_MUTATION_LOCK_TIMEOUT_SEC=5" \
    "WOODRIGHT_CUTOVER_POLL_INTERVAL_SEC=1" \
    "WOODRIGHT_CUTOVER_READY_DEADLINE_SEC=8" \
    "WOODRIGHT_FAKE_COMPOSE_DEFECT_DIGESTS=$NEW_BE_DIG,$NEW_SF_DIG" \
    "WOODRIGHT_PRODUCTION_OWNERSHIP_OWNER=$(id -un)" \
    "WOODRIGHT_PRODUCTION_OWNERSHIP_GROUP=$(id -gn)" \
    "WOODRIGHT_PRODUCTION_OWNERSHIP_MODE=0640"
}

# run_exec <evidence-dir> <out-file> [extra env assignments...]
RC=0
run_exec() {
  local ev="$1" out="$2"
  shift 2
  local -a envs=()
  while IFS= read -r line; do envs+=("$line"); done < <(base_env)
  envs+=("WOODRIGHT_EVIDENCE_DIR=$ev" "WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION=1")
  local a
  for a in "$@"; do envs+=("$a"); done
  set +e
  env "${envs[@]}" bash "$SCRIPT" \
    --environment production --component pair --source-sha "$APP_SHA" \
    --backend-ref "$BE_REF" --storefront-ref "$SF_REF" \
    --mode execute --confirm-mutation "$CONFIRM" >"$out" 2>&1
  RC=$?
  set -e
}

run_exec_component() {
  local ev="$1" out="$2" component="$3"
  local -a envs=()
  while IFS= read -r line; do envs+=("$line"); done < <(base_env)
  envs+=("WOODRIGHT_EVIDENCE_DIR=$ev" "WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION=1")
  local -a refs=()
  if [[ "$component" == "storefront" || "$component" == "pair" ]]; then
    refs+=(--storefront-ref "$SF_REF")
  fi
  if [[ "$component" == "backend" || "$component" == "pair" ]]; then
    refs+=(--backend-ref "$BE_REF")
  fi
  set +e
  env "${envs[@]}" bash "$SCRIPT" \
    --environment production --component "$component" --source-sha "$APP_SHA" \
    "${refs[@]}" \
    --mode execute --confirm-mutation "$CONFIRM" >"$out" 2>&1
  RC=$?
  set -e
}

state_file() { cat "$1/state.txt" 2>/dev/null || echo "<none>"; }

# ==========================================================================
# 1) successful pair execute
# ==========================================================================
reset_harness
EV="$TMP/ev-success"
run_exec "$EV" "$TMP/out-success.txt"
[[ "$RC" -eq 0 ]] && pass "success: exit 0" || { fail "success: rc=$RC"; sed -n '1,60p' "$TMP/out-success.txt"; }
[[ "$(state_file "$EV")" == "committed" ]] && pass "success: state committed" || fail "success: state=$(state_file "$EV")"
[[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$BE_REF" ]] && pass "success: backend pin advanced" || fail "success: backend pin=$(pin_of WOODRIGHT_BACKEND_IMAGE)"
[[ "$(pin_of WOODRIGHT_STOREFRONT_IMAGE)" == "$SF_REF" ]] && pass "success: storefront pin advanced" || fail "success: storefront pin"
[[ "$(pin_of WOODRIGHT_RELEASE_SHA)" == "$APP_SHA" ]] && pass "success: common WOODRIGHT_RELEASE_SHA advanced" || fail "success: RELEASE_SHA=$(pin_of WOODRIGHT_RELEASE_SHA)"
[[ "$(pin_of WOODRIGHT_BACKEND_SOURCE_SHA)" == "$APP_SHA" ]] && pass "success: backend source SHA pinned" || fail "success: BE_SOURCE_SHA=$(pin_of WOODRIGHT_BACKEND_SOURCE_SHA)"
[[ "$(pin_of WOODRIGHT_STOREFRONT_SOURCE_SHA)" == "$APP_SHA" ]] && pass "success: storefront source SHA pinned" || fail "success: SF_SOURCE_SHA=$(pin_of WOODRIGHT_STOREFRONT_SOURCE_SHA)"
[[ "$(pin_of UNRELATED_KEY)" == "keep-me" ]] && pass "success: unrelated compose keys preserved" || fail "success: unrelated key lost"
[[ "$(digest_of woodright-production-backend)" == "$NEW_BE_DIG" ]] && pass "success: backend runs the new digest" || fail "success: backend digest"
[[ "$(digest_of woodright-production-storefront)" == "$NEW_SF_DIG" ]] && pass "success: storefront runs the new digest" || fail "success: storefront digest"

EXPECTED_STATES=$'prepared\npins_written\ncontainers_recreated\nhealth_passed\nacceptance_passed\ncommitted'
ACTUAL_STATES="$(awk '{print $2}' "$EV/state-transitions.log" | awk '!seen[$0]++')"
[[ "$ACTUAL_STATES" == "$EXPECTED_STATES" ]] \
  && pass "success: state machine order prepared->pins->recreate->health->acceptance->commit" \
  || fail "success: state order = $(echo "$ACTUAL_STATES" | tr '\n' ',')"

JOURNAL="$(cat "$STATE/log/journal.log")"
if [[ "$JOURNAL" == $'compose_up backend\ncompose_up storefront' ]]; then
  pass "success: compose up only, backend before storefront (no keeper rename)"
else
  fail "success: mutation order = $(echo "$JOURNAL" | tr '\n' '|')"
fi
assert_no_keepers "success"
grep -qE 'compose_up backend .*force=1' "$STATE/log/mutations.log" \
  && pass "success: forward recreate always uses --force-recreate" \
  || fail "success: forward recreate missing --force-recreate"
grep -q 'no keeper container created' "$TMP/out-success.txt" \
  && pass "success: recreate log states no keeper was created" || fail "success: keeper wording missing"
[[ -f "$EV/json/rollback-anchors.json" ]] \
  && pass "success: pre-mutation rollback anchors recorded" || fail "success: rollback anchors missing"
python3 - "$EV/json/rollback-anchors.json" "$OLD_BE_REF" "$OLD_SF_REF" <<'PY' \
  && pass "success: anchors are the exact pre-cutover immutable refs" || fail "success: anchor refs wrong"
import json, sys
doc = json.load(open(sys.argv[1]))
assert doc["backend"]["ref"] == sys.argv[2], doc
assert doc["storefront"]["ref"] == sys.argv[3], doc
assert doc["backend"]["image_present_locally"] is True
assert doc["storefront"]["image_present_locally"] is True
assert doc["method"] == "restore_pins_then_compose_recreate"
assert doc["keepers_used"] is False
PY
[[ -s "$EV/raw/health-poll-backend.txt" ]] \
  && pass "success: readiness polling evidence written for backend" || fail "success: no backend poll evidence"
[[ -s "$EV/raw/health-poll-storefront.txt" ]] \
  && pass "success: readiness polling evidence written for storefront" || fail "success: no storefront poll evidence"
if grep -qE 'postgres|redis' "$STATE/log/mutations.log"; then
  fail "success: postgres/redis were touched"
else
  pass "success: postgres/redis never recreated"
fi
grep -q '"application_source_sha": "'"$APP_SHA"'"' "$OWN_DIR/ACTIVE_RELEASE.json" \
  && pass "success: ACTIVE_RELEASE carries the application SHA" || fail "success: ACTIVE_RELEASE app sha"
grep -q '"helper_install_sha": "'"$HELPER_SHA"'"' "$OWN_DIR/ACTIVE_RELEASE.json" \
  && pass "success: ACTIVE_RELEASE carries the helper SHA separately" || fail "success: ACTIVE_RELEASE helper sha"
for f in ACTIVE_OWNER.json EXPECTED_RELEASE.json ACTIVE_RELEASE.json; do
  [[ -f "$OWN_DIR/$f" ]] || fail "success: missing $f"
done
pass "success: scoped ownership metadata written"
python3 - "$OWN_DIR" <<'PY' && pass "success: ownership access mode 0640 non-world" || fail "success: ownership access mode"
import os, stat, sys
own = sys.argv[1]
for name in ("ACTIVE_OWNER.json", "EXPECTED_RELEASE.json", "ACTIVE_RELEASE.json"):
    st = os.stat(os.path.join(own, name))
    mode = stat.S_IMODE(st.st_mode)
    assert mode == 0o640, (name, oct(mode))
    assert (mode & 0o007) == 0, (name, oct(mode))
print("ok")
PY
lock_is_free "$LOCK" && pass "success: production lock released" || fail "success: lock still held"
grep -q 'application_source_sha=' "${LOCK}.meta" && pass "success: lock metadata records both SHAs" || fail "success: lock metadata"
grep -q "helper_install_sha=$HELPER_SHA" "${LOCK}.meta" && pass "success: lock metadata names the helper SHA" || fail "success: lock metadata helper sha"
if grep -rl 'MOCK_SECRET_VALUE' "$EV" 2>/dev/null | grep -v '/pin-backup/' | grep -q .; then
  fail "success: secret material leaked outside the pin backup"
else
  pass "success: no secret material outside the pin backup"
fi
assert_public_demo_untouched "success"

# ==========================================================================
# 2) first pin write fails -> no recreate, original pins
# ==========================================================================
reset_harness
EV="$TMP/ev-first-pin"
run_exec "$EV" "$TMP/out-first-pin.txt" "WOODRIGHT_CUTOVER_FAULT=first_pin"
[[ "$RC" -ne 0 ]] && pass "first_pin: non-zero exit ($RC)" || fail "first_pin: unexpected success"
[[ "$(state_file "$EV")" == "failed_before_mutation" ]] && pass "first_pin: failed_before_mutation" || fail "first_pin: state=$(state_file "$EV")"
[[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$OLD_BE_REF" ]] && pass "first_pin: backend pin untouched" || fail "first_pin: backend pin changed"
[[ "$(pin_of WOODRIGHT_STOREFRONT_IMAGE)" == "$OLD_SF_REF" ]] && pass "first_pin: storefront pin untouched" || fail "first_pin: storefront pin changed"
[[ ! -f "$STATE/log/mutations.log" ]] && pass "first_pin: nothing recreated" || fail "first_pin: docker mutated"
lock_is_free "$LOCK" && pass "first_pin: lock released" || fail "first_pin: lock held"

# ==========================================================================
# 3) second_pin fault (legacy name) - with atomic pair pin write this fails
#    BEFORE any live install, same as first_pin (no mixed pins possible).
# ==========================================================================
reset_harness
EV="$TMP/ev-second-pin"
run_exec "$EV" "$TMP/out-second-pin.txt" "WOODRIGHT_CUTOVER_FAULT=second_pin"
[[ "$RC" -ne 0 ]] && pass "second_pin: non-zero exit ($RC)" || fail "second_pin: unexpected success"
[[ "$(state_file "$EV")" == "failed_before_mutation" ]] && pass "second_pin: failed_before_mutation (atomic, no mixed pins)" || fail "second_pin: state=$(state_file "$EV")"
[[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$OLD_BE_REF" ]] && pass "second_pin: backend pin untouched" || fail "second_pin: backend pin changed"
[[ "$(pin_of WOODRIGHT_STOREFRONT_IMAGE)" == "$OLD_SF_REF" ]] && pass "second_pin: storefront pin untouched" || fail "second_pin: storefront pin"
[[ ! -f "$STATE/log/mutations.log" ]] && pass "second_pin: nothing recreated" || fail "second_pin: docker mutated"
lock_is_free "$LOCK" && pass "second_pin: lock released" || fail "second_pin: lock held"

# ==========================================================================
# 4) backend recreate fails -> pins restored, runtime never left the old digest
# ==========================================================================
reset_harness
EV="$TMP/ev-be-recreate"
run_exec "$EV" "$TMP/out-be-recreate.txt" "WOODRIGHT_FAKE_COMPOSE_FAIL=backend"
[[ "$RC" -eq 10 ]] && pass "backend_recreate: rollback_ok exit 10" || fail "backend_recreate: rc=$RC"
[[ "$(state_file "$EV")" == "rolled_back" ]] && pass "backend_recreate: rolled_back" || fail "backend_recreate: state"
[[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$OLD_BE_REF" ]] && pass "backend_recreate: pins restored" || fail "backend_recreate: pins not restored"
[[ "$(pin_of WOODRIGHT_RELEASE_SHA)" == "9946b42aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" ]] \
  && pass "backend_recreate: RELEASE_SHA restored from backup" || fail "backend_recreate: RELEASE_SHA not restored"
[[ "$(digest_of woodright-production-backend)" == "$OLD_BE_DIG" ]] && pass "backend_recreate: backend still on the pre-cutover digest" || fail "backend_recreate: live digest wrong"
[[ "$(id_of woodright-production-backend)" == "id-backend-live" ]] && pass "backend_recreate: original container never replaced" || fail "backend_recreate: id mismatch"
assert_no_keepers "backend_recreate"
grep -q 'no recreate needed' "$TMP/out-be-recreate.txt" \
  && pass "backend_recreate: rollback skipped a needless recreate (runtime already on the pin)" \
  || fail "backend_recreate: rollback recreated an already-correct container"
container_exists woodright-production-storefront && pass "backend_recreate: storefront never touched" || fail "backend_recreate: storefront missing"
[[ "$(digest_of woodright-production-storefront)" == "$OLD_SF_DIG" ]] && pass "backend_recreate: storefront digest unchanged" || fail "backend_recreate: storefront digest"
python3 - "$EV/json/rollback-result.json" <<'PY' \
  && pass "backend_recreate: rollback result records verified postconditions" || fail "backend_recreate: rollback result"
import json, sys
doc = json.load(open(sys.argv[1]))
assert doc["keepers_used"] is False, doc
assert doc["method"] == "restore_pins_then_compose_recreate", doc
for key in ("pins", "runtime_recreate", "pins_equal_runtime", "release_sha", "exposure", "http", "metadata"):
    assert doc[key] == 1, (key, doc)
PY

# ==========================================================================
# 4b) images restored but RELEASE_SHA mismatch -> rollback_incomplete (not rolled_back)
# ==========================================================================
reset_harness
EV="$TMP/ev-rb-release-mismatch"
run_exec "$EV" "$TMP/out-rb-release-mismatch.txt" \
  "WOODRIGHT_FAKE_COMPOSE_FAIL=backend" \
  "WOODRIGHT_CUTOVER_FAULT=rollback_release_sha_mismatch"
[[ "$RC" -eq 13 ]] && pass "rb_release_mismatch: exit 13 incomplete" || fail "rb_release_mismatch: rc=$RC"
[[ "$(state_file "$EV")" == "rollback_incomplete" ]] \
  && pass "rb_release_mismatch: state rollback_incomplete" \
  || fail "rb_release_mismatch: state=$(state_file "$EV")"
[[ "$(state_file "$EV")" != "rolled_back" ]] \
  && pass "rb_release_mismatch: not false rolled_back" \
  || fail "rb_release_mismatch: false rolled_back"
[[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$OLD_BE_REF" ]] \
  && pass "rb_release_mismatch: image pins restored" \
  || fail "rb_release_mismatch: backend pin wrong"
[[ "$(pin_of WOODRIGHT_RELEASE_SHA)" == "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef" ]] \
  && pass "rb_release_mismatch: marker left corrupted by harness" \
  || fail "rb_release_mismatch: unexpected RELEASE_SHA=$(pin_of WOODRIGHT_RELEASE_SHA)"
python3 - "$EV/json/rollback-result.json" <<'PY' \
  && pass "rb_release_mismatch: evidence records release_sha=0" || fail "rb_release_mismatch: evidence"
import json, sys
doc = json.load(open(sys.argv[1]))
assert doc["pins"] == 1, doc
assert doc["release_sha"] == 0, doc
assert doc["pins_equal_runtime"] == 1, doc
PY
grep -q 'RELEASE_SHA MISMATCH' "$TMP/out-rb-release-mismatch.txt" \
  && pass "rb_release_mismatch: mismatch named in log" \
  || fail "rb_release_mismatch: mismatch not logged"
assert_public_demo_untouched "rb_release_mismatch"
lock_is_free "$LOCK" && pass "rb_release_mismatch: lock released" || fail "rb_release_mismatch: lock held"

# ==========================================================================
# 5) backend unhealthy -> rollback
# ==========================================================================
reset_harness
EV="$TMP/ev-be-health"
run_exec "$EV" "$TMP/out-be-health.txt" "WOODRIGHT_FAKE_COMPOSE_UNHEALTHY=backend"
[[ "$RC" -eq 10 ]] && pass "backend_health: rollback_ok exit 10" || fail "backend_health: rc=$RC"
[[ "$(digest_of woodright-production-backend)" == "$OLD_BE_DIG" ]] && pass "backend_health: backend rolled back" || fail "backend_health: backend digest"
[[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$OLD_BE_REF" ]] && pass "backend_health: pins restored" || fail "backend_health: pins"
[[ ! -f "$OWN_DIR/ACTIVE_OWNER.json" ]] && pass "backend_health: no ACTIVE written before health passed" || fail "backend_health: ACTIVE_OWNER written"

# ==========================================================================
# 6) storefront recreate fails -> pair rollback (backend too)
# ==========================================================================
reset_harness
EV="$TMP/ev-sf-recreate"
run_exec "$EV" "$TMP/out-sf-recreate.txt" "WOODRIGHT_FAKE_COMPOSE_FAIL=storefront"
[[ "$RC" -eq 10 ]] && pass "storefront_recreate: rollback_ok exit 10" || fail "storefront_recreate: rc=$RC"
[[ "$(digest_of woodright-production-backend)" == "$OLD_BE_DIG" ]] && pass "storefront_recreate: backend rolled back too" || fail "storefront_recreate: backend digest"
[[ "$(digest_of woodright-production-storefront)" == "$OLD_SF_DIG" ]] && pass "storefront_recreate: storefront restored" || fail "storefront_recreate: storefront digest"
[[ "$(pin_of WOODRIGHT_STOREFRONT_IMAGE)" == "$OLD_SF_REF" ]] && pass "storefront_recreate: pins restored" || fail "storefront_recreate: pins"
[[ "$(pin_of WOODRIGHT_BACKEND_SOURCE_SHA)" == "$OLD_PEER_SHA" ]] && pass "storefront_recreate: backend SOURCE_SHA restored from live OCI" || fail "storefront_recreate: BE_SOURCE_SHA=$(pin_of WOODRIGHT_BACKEND_SOURCE_SHA)"
[[ "$(pin_of WOODRIGHT_STOREFRONT_SOURCE_SHA)" == "$OLD_PEER_SHA" ]] && pass "storefront_recreate: storefront SOURCE_SHA restored from live OCI" || fail "storefront_recreate: SF_SOURCE_SHA=$(pin_of WOODRIGHT_STOREFRONT_SOURCE_SHA)"
assert_no_keepers "storefront_recreate"

# ==========================================================================
# 7) storefront route/http fails -> rollback
# ==========================================================================
reset_harness
EV="$TMP/ev-sf-http"
run_exec "$EV" "$TMP/out-sf-http.txt" "WOODRIGHT_FAKE_HTTP_FAIL=3200"
[[ "$RC" -eq 10 ]] && pass "storefront_http: rollback_ok exit 10" || fail "storefront_http: rc=$RC"
grep -qE 'HTTP gate timed out|http gate FAILED storefront' "$TMP/out-sf-http.txt" \
  && pass "storefront_http: failure reported after polling to the deadline" || fail "storefront_http: gate not reported"
grep -q 'attempt=' "$EV/raw/health-poll-storefront.txt" \
  && pass "storefront_http: HTTP was retried, not read once" || fail "storefront_http: no retry evidence"
[[ "$(digest_of woodright-production-storefront)" == "$OLD_SF_DIG" ]] && pass "storefront_http: storefront rolled back" || fail "storefront_http: sf digest"
[[ "$(digest_of woodright-production-backend)" == "$OLD_BE_DIG" ]] && pass "storefront_http: backend rolled back" || fail "storefront_http: be digest"
[[ ! -f "$OWN_DIR/ACTIVE_OWNER.json" ]] && pass "storefront_http: ACTIVE not written" || fail "storefront_http: ACTIVE written"

# same failure through the documented script-level fault switch
reset_harness
EV="$TMP/ev-sf-http-fault"
run_exec "$EV" "$TMP/out-sf-http-fault.txt" "WOODRIGHT_CUTOVER_FAULT=storefront_http"
[[ "$RC" -eq 10 ]] && pass "storefront_http fault: rollback_ok exit 10" || fail "storefront_http fault: rc=$RC"

# ==========================================================================
# 8) wrong digest after recreate -> rollback
# ==========================================================================
reset_harness
EV="$TMP/ev-wrong-digest"
run_exec "$EV" "$TMP/out-wrong-digest.txt" "WOODRIGHT_FAKE_COMPOSE_WRONG_DIGEST=backend"
[[ "$RC" -eq 10 ]] && pass "wrong_digest: rollback_ok exit 10" || fail "wrong_digest: rc=$RC"
grep -qE 'digest mismatch after recreate|digest mismatch on woodright-production-backend' "$TMP/out-wrong-digest.txt" \
  && pass "wrong_digest: mismatch reported" || fail "wrong_digest: not reported"
[[ "$(digest_of woodright-production-backend)" == "$OLD_BE_DIG" ]] && pass "wrong_digest: backend rolled back" || fail "wrong_digest: backend digest"
[[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$OLD_BE_REF" ]] && pass "wrong_digest: pins restored" || fail "wrong_digest: pins"

# ==========================================================================
# 9) missing media volume -> fail closed before any mutation
# ==========================================================================
reset_harness
rm -f "$STATE/volumes/${MEDIA_VOL}.ok"
EV="$TMP/ev-no-volume"
run_exec "$EV" "$TMP/out-no-volume.txt"
[[ "$RC" -eq 2 ]] && pass "missing_volume: fail closed exit 2" || fail "missing_volume: rc=$RC"
grep -q 'media volume missing' "$TMP/out-no-volume.txt" && pass "missing_volume: reported" || fail "missing_volume: not reported"
[[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$OLD_BE_REF" ]] && pass "missing_volume: pins untouched" || fail "missing_volume: pins changed"
[[ ! -f "$STATE/log/mutations.log" ]] && pass "missing_volume: nothing mutated" || fail "missing_volume: mutated"
[[ ! -d "$EV" ]] && pass "missing_volume: refused before taking the lock" || fail "missing_volume: evidence created"

# ==========================================================================
# 10) public bind detected
# ==========================================================================
reset_harness
write_container storefront "$OLD_SF_DIG" "0.0.0.0"
EV="$TMP/ev-public-bind"
run_exec "$EV" "$TMP/out-public-bind.txt"
[[ "$RC" -eq 2 ]] && pass "public_bind pre-lock: fail closed exit 2" || fail "public_bind pre-lock: rc=$RC"
grep -q 'PUBLIC_BIND' "$TMP/out-public-bind.txt" && pass "public_bind pre-lock: reported" || fail "public_bind pre-lock: not reported"
[[ ! -f "$STATE/log/mutations.log" ]] && pass "public_bind pre-lock: nothing mutated" || fail "public_bind pre-lock: mutated"

reset_harness
EV="$TMP/ev-public-bind-post"
run_exec "$EV" "$TMP/out-public-bind-post.txt" "WOODRIGHT_FAKE_COMPOSE_PUBLIC_BIND=storefront"
[[ "$RC" -eq 10 ]] && pass "public_bind post-recreate: rollback_ok exit 10" || fail "public_bind post-recreate: rc=$RC"
[[ "$(digest_of woodright-production-storefront)" == "$OLD_SF_DIG" ]] && pass "public_bind post-recreate: rolled back" || fail "public_bind post-recreate: sf digest"
[[ ! -f "$OWN_DIR/ACTIVE_OWNER.json" ]] && pass "public_bind post-recreate: ACTIVE not written" || fail "public_bind post-recreate: ACTIVE written"

# ==========================================================================
# 11) public Traefik label detected
# ==========================================================================
reset_harness
write_container storefront "$OLD_SF_DIG" "127.0.0.1" 1
EV="$TMP/ev-public-traefik"
run_exec "$EV" "$TMP/out-public-traefik.txt"
[[ "$RC" -eq 2 ]] && pass "public_traefik pre-lock: fail closed exit 2" || fail "public_traefik pre-lock: rc=$RC"
grep -q 'PUBLIC_EXPOSURE' "$TMP/out-public-traefik.txt" && pass "public_traefik pre-lock: reported" || fail "public_traefik pre-lock: not reported"
[[ ! -f "$STATE/log/mutations.log" ]] && pass "public_traefik pre-lock: nothing mutated" || fail "public_traefik pre-lock: mutated"

reset_harness
EV="$TMP/ev-public-traefik-post"
run_exec "$EV" "$TMP/out-public-traefik-post.txt" "WOODRIGHT_FAKE_COMPOSE_PUBLIC_TRAEFIK=storefront"
[[ "$RC" -eq 10 ]] && pass "public_traefik post-recreate: rollback_ok exit 10" || fail "public_traefik post-recreate: rc=$RC"
[[ "$(digest_of woodright-production-storefront)" == "$OLD_SF_DIG" ]] && pass "public_traefik post-recreate: rolled back" || fail "public_traefik post-recreate: sf digest"

# ==========================================================================
# 12) scoped metadata write fails -> rollback
# ==========================================================================
reset_harness
EV="$TMP/ev-metadata"
run_exec "$EV" "$TMP/out-metadata.txt" "WOODRIGHT_CUTOVER_FAULT=metadata_write"
[[ "$RC" -eq 10 ]] && pass "metadata_write: rollback_ok exit 10" || fail "metadata_write: rc=$RC"
[[ "$(digest_of woodright-production-backend)" == "$OLD_BE_DIG" ]] && pass "metadata_write: backend rolled back" || fail "metadata_write: be digest"
[[ "$(digest_of woodright-production-storefront)" == "$OLD_SF_DIG" ]] && pass "metadata_write: storefront rolled back" || fail "metadata_write: sf digest"
[[ "$(pin_of WOODRIGHT_STOREFRONT_IMAGE)" == "$OLD_SF_REF" ]] && pass "metadata_write: pins restored" || fail "metadata_write: pins"
grep -q 'pre-existing' "$OWN_DIR/ACTIVE_RELEASE.json" && pass "metadata_write: previous ACTIVE_RELEASE intact" || fail "metadata_write: ACTIVE_RELEASE clobbered"

# ==========================================================================
# 12b) metadata_install fault after staging but before/during live install
#      - METADATA_WRITTEN is armed so rollback restores prior ownership
# ==========================================================================
reset_harness
EV="$TMP/ev-metadata-install"
run_exec "$EV" "$TMP/out-metadata-install.txt" "WOODRIGHT_CUTOVER_FAULT=metadata_install"
[[ "$RC" -eq 10 ]] && pass "metadata_install: rollback_ok exit 10" || fail "metadata_install: rc=$RC"
[[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$OLD_BE_REF" ]] && pass "metadata_install: pins restored" || fail "metadata_install: pins"
grep -q 'pre-existing' "$OWN_DIR/ACTIVE_RELEASE.json" && pass "metadata_install: previous ACTIVE_RELEASE intact" || fail "metadata_install: ACTIVE_RELEASE clobbered"
[[ "$(digest_of woodright-production-backend)" == "$OLD_BE_DIG" ]] && pass "metadata_install: containers rolled back" || fail "metadata_install: be digest"
lock_is_free "$LOCK" && pass "metadata_install: lock released" || fail "metadata_install: lock held"

# ==========================================================================
# 13) SIGTERM after the pin write -> rollback + lock released
# ==========================================================================
reset_harness
EV="$TMP/ev-sigterm-after"
ENVS=()
while IFS= read -r line; do ENVS+=("$line"); done < <(base_env)
ENVS+=("WOODRIGHT_EVIDENCE_DIR=$EV" "WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION=1"
  "WOODRIGHT_CUTOVER_TEST_PAUSE_AT=pins_written" "WOODRIGHT_CUTOVER_TEST_PAUSE_SEC=20")
env "${ENVS[@]}" bash "$SCRIPT" \
  --environment production --component pair --source-sha "$APP_SHA" \
  --backend-ref "$BE_REF" --storefront-ref "$SF_REF" \
  --mode execute --confirm-mutation "$CONFIRM" >"$TMP/out-sigterm-after.txt" 2>&1 &
SIG_PID=$!
for _ in $(seq 1 150); do
  [[ -f "$EV/state.txt" ]] && grep -q pins_written "$EV/state.txt" && break
  sleep 0.1
done
kill -TERM "$SIG_PID" 2>/dev/null || true
set +e
wait "$SIG_PID"
RC=$?
set -e
[[ "$RC" -eq 10 ]] && pass "sigterm_after_pins: rollback_ok exit 10" || fail "sigterm_after_pins: rc=$RC"
[[ "$(state_file "$EV")" == "rolled_back" ]] && pass "sigterm_after_pins: rolled_back" || fail "sigterm_after_pins: state=$(state_file "$EV")"
[[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$OLD_BE_REF" ]] && pass "sigterm_after_pins: pins restored" || fail "sigterm_after_pins: pins"
lock_is_free "$LOCK" && pass "sigterm_after_pins: lock released" || fail "sigterm_after_pins: lock held"

# ==========================================================================
# 14) SIGTERM before the first write -> no rollback, lock released
# ==========================================================================
reset_harness
EV="$TMP/ev-sigterm-before"
ENVS=()
while IFS= read -r line; do ENVS+=("$line"); done < <(base_env)
ENVS+=("WOODRIGHT_EVIDENCE_DIR=$EV" "WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION=1"
  "WOODRIGHT_CUTOVER_TEST_PAUSE_AT=prepared" "WOODRIGHT_CUTOVER_TEST_PAUSE_SEC=20")
env "${ENVS[@]}" bash "$SCRIPT" \
  --environment production --component pair --source-sha "$APP_SHA" \
  --backend-ref "$BE_REF" --storefront-ref "$SF_REF" \
  --mode execute --confirm-mutation "$CONFIRM" >"$TMP/out-sigterm-before.txt" 2>&1 &
SIG_PID=$!
for _ in $(seq 1 150); do
  [[ -f "$EV/state.txt" ]] && grep -q prepared "$EV/state.txt" && break
  sleep 0.1
done
kill -TERM "$SIG_PID" 2>/dev/null || true
set +e
wait "$SIG_PID"
RC=$?
set -e
[[ "$RC" -eq 143 ]] && pass "sigterm_before_write: exits 143 without rollback" || fail "sigterm_before_write: rc=$RC"
[[ "$(state_file "$EV")" == "failed_before_mutation" ]] && pass "sigterm_before_write: failed_before_mutation" || fail "sigterm_before_write: state=$(state_file "$EV")"
[[ ! -f "$EV/json/rollback-result.json" ]] && pass "sigterm_before_write: no rollback performed" || fail "sigterm_before_write: rollback ran"
[[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$OLD_BE_REF" ]] && pass "sigterm_before_write: pins untouched" || fail "sigterm_before_write: pins"
[[ ! -f "$STATE/log/mutations.log" ]] && pass "sigterm_before_write: nothing recreated" || fail "sigterm_before_write: mutated"
lock_is_free "$LOCK" && pass "sigterm_before_write: lock released" || fail "sigterm_before_write: lock held"

# ==========================================================================
# 15) concurrent same-environment execute is blocked by the lock
# ==========================================================================
reset_harness
HOLD_READY="$TMP/hold.ready"
rm -f "$HOLD_READY"
python3 - "$LOCK" "$HOLD_READY" <<'PY' &
import fcntl, os, sys, time
fd = os.open(sys.argv[1], os.O_RDWR | os.O_CREAT)
fcntl.flock(fd, fcntl.LOCK_EX)
open(sys.argv[2], "w").write("1")
time.sleep(60)
PY
HOLD_PID=$!
for _ in $(seq 1 100); do [[ -s "$HOLD_READY" ]] && break; sleep 0.1; done
EV="$TMP/ev-concurrent"
run_exec "$EV" "$TMP/out-concurrent.txt" "WR_STAGING_MUTATION_LOCK_TIMEOUT_SEC=2"
[[ "$RC" -eq 3 ]] && pass "concurrent: blocked with exit 3" || fail "concurrent: rc=$RC"
[[ ! -f "$STATE/log/mutations.log" ]] && pass "concurrent: nothing mutated while blocked" || fail "concurrent: mutated"
[[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$OLD_BE_REF" ]] && pass "concurrent: pins untouched" || fail "concurrent: pins changed"
kill "$HOLD_PID" 2>/dev/null || true
wait "$HOLD_PID" 2>/dev/null || true

# ==========================================================================
# 16) cross-environment isolation (already asserted per-case; explicit here)
# ==========================================================================
reset_harness
EV="$TMP/ev-crossenv"
run_exec "$EV" "$TMP/out-crossenv.txt"
[[ "$RC" -eq 0 ]] && pass "crossenv: execute succeeded" || fail "crossenv: rc=$RC"
assert_public_demo_untouched "crossenv"
if grep -rq 'public_demo\|public-demo' "$OWN_DIR" 2>/dev/null; then
  fail "crossenv: production metadata mentions public_demo"
else
  pass "crossenv: production metadata is production-scoped"
fi
grep -q '"environment": "production"' "$OWN_DIR/ACTIVE_OWNER.json" \
  && pass "crossenv: ACTIVE_OWNER is production-scoped" || fail "crossenv: ACTIVE_OWNER environment"

# ==========================================================================
# 17) dry-run performs zero writes
# ==========================================================================
reset_harness
# macOS ships shasum, Linux runners ship sha256sum - accept either.
if command -v shasum >/dev/null 2>&1; then
  tree_hash() { find "$TMP/srv" "$TMP/etc" -type f -exec shasum -a 256 {} \; | sort; }
else
  tree_hash() { find "$TMP/srv" "$TMP/etc" -type f -exec sha256sum {} \; | sort; }
fi
BEFORE_TREE="$(tree_hash)"
ENVS=()
while IFS= read -r line; do ENVS+=("$line"); done < <(base_env)
ENVS+=("WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION=0")
set +e
env "${ENVS[@]}" bash "$SCRIPT" \
  --environment production --component pair --source-sha "$APP_SHA" \
  --backend-ref "$BE_REF" --storefront-ref "$SF_REF" >"$TMP/out-dryrun.txt" 2>"$TMP/err-dryrun.txt"
RC=$?
set -e
[[ "$RC" -eq 0 ]] && pass "dry-run: exit 0" || { fail "dry-run: rc=$RC"; cat "$TMP/err-dryrun.txt"; }
AFTER_TREE="$(tree_hash)"
[[ "$BEFORE_TREE" == "$AFTER_TREE" ]] && pass "dry-run: zero writes under srv/ and etc/" || fail "dry-run: filesystem changed"
[[ ! -f "$STATE/log/mutations.log" ]] && pass "dry-run: no docker mutation" || fail "dry-run: docker mutated"
python3 - "$TMP/out-dryrun.txt" "$APP_SHA" "$HELPER_SHA" <<'PY' && pass "dry-run: packet separates application and helper SHAs" || fail "dry-run: packet SHA fields"
import json, sys
raw = open(sys.argv[1]).read()
packet = json.loads(raw[raw.index("{"):])
assert packet["mode"] == "dry-run", packet["mode"]
assert packet["application_source_sha"] == sys.argv[2]
assert packet["helper_install_sha"] == sys.argv[3]
assert packet["application_source_sha"] != packet["helper_install_sha"]
plan = packet["planned_mutation"]
assert plan["recreate"]["order"] == ["backend", "storefront"], plan["recreate"]["order"]
assert plan["pin_plan"]["keys"]["WOODRIGHT_BACKEND_IMAGE"].endswith("a" * 64)
assert plan["pin_plan"]["keys"]["WOODRIGHT_RELEASE_SHA"] == sys.argv[2], plan["pin_plan"]["keys"]
assert plan["pin_plan"]["common_release_sha"] == sys.argv[2]
assert "WOODRIGHT_RELEASE_SHA" in plan["pin_plan"]["write_order"]
assert plan["pin_plan"]["keys"]["WOODRIGHT_BACKEND_SOURCE_SHA"] == sys.argv[2]
assert plan["pin_plan"]["keys"]["WOODRIGHT_STOREFRONT_SOURCE_SHA"] == sys.argv[2]
assert plan["recreate"]["order"] == ["backend", "storefront"]
assert "prepared" in plan["state_machine"]
assert packet["no_mutation_performed"] is True

# Stale informational marker is reported but does not block a valid plan.
crs = packet["compose_release_sha"]
assert crs["informational_drift"] is True, crs
assert crs["current"] == "9946b42aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", crs
assert crs["proposed"] == sys.argv[2], crs
assert crs["blocks_valid_pair_cutover"] is False, crs
assert crs["is_deploy_or_rollback_authority"] is False, crs

# Rollback is anchored on the live digests, never on keeper containers.
assert plan["container_recreate_uses_keepers"] is False, plan
assert "keeper_names" not in json.dumps(plan), "packet still advertises keepers"
rb = plan["rollback_refs"]
assert rb["method"].startswith("restore_pins_then_compose_recreate"), rb
assert rb["backend_ref"].endswith("c" * 64), rb
assert rb["storefront_ref"].endswith("d" * 64), rb
assert rb["backend_source_sha"] == "0" * 40, rb
assert rb["storefront_source_sha"] == "0" * 40, rb
assert rb["backend_source_sha"] != sys.argv[2], rb
assert rb["component_source_sha_seed_authority"] == "live_oci_revision", rb
assert rb["pre_cutover_env_backend_source_sha_present"] is False, rb
assert rb["pre_cutover_env_storefront_source_sha_present"] is False, rb
assert rb["rollback_env_satisfies_compose_required_interpolation"] is True, rb
assert "component_source_sha_keys_restored_from_live_oci_seed" in rb["postconditions"], rb
assert rb["images_present_locally"] is True, rb
assert "pins_restored" in rb["postconditions"], rb
assert "runtime_repo_digests_equal_restored_pins" in rb["postconditions"], rb
assert "compose_release_sha_restored_from_pin_backup" in rb["postconditions"], rb
assert rb["release_sha_is_rollback_authority"] is False, rb

# Readiness is a poll to a deadline, not a one-shot health read.
poll = plan["health_plan"]
assert int(poll["poll_interval_sec"]) >= 1, poll
assert int(poll["deadline_sec"]["backend"]) >= 1, poll
assert int(poll["deadline_sec"]["storefront"]) >= 1, poll
assert "starting" in poll["transient_docker_states"], poll
assert "exited" in poll["terminal_docker_states"], poll
assert "dead" in poll["terminal_docker_states"], poll
assert plan["recreate"]["flags"][-1] == "--force-recreate", plan["recreate"]

# Documented exit codes include the honest-rollback ones.
codes = plan["exit_codes"]
assert codes["10"].startswith("rollback"), codes
assert "13" in codes and "incomplete" in codes["13"], codes

# No pre-existing skew in this fixture.
assert packet["existing_pin_runtime_skew"] is False, packet
assert packet["normal_execute_blocked"] is False, packet
PY

# ==========================================================================
# 18) wrong / missing execute confirmation
# ==========================================================================
reset_harness
for confirm_args in "--mode execute" "--mode execute --confirm-mutation WRONG_TOKEN"; do
  ENVS=()
  while IFS= read -r line; do ENVS+=("$line"); done < <(base_env)
  ENVS+=("WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION=0" "WOODRIGHT_EVIDENCE_DIR=$TMP/ev-confirm")
  set +e
  # shellcheck disable=SC2086
  env "${ENVS[@]}" bash "$SCRIPT" \
    --environment production --component pair --source-sha "$APP_SHA" \
    --backend-ref "$BE_REF" --storefront-ref "$SF_REF" $confirm_args \
    >"$TMP/out-confirm.txt" 2>&1
  RC=$?
  set -e
  [[ "$RC" -eq 2 ]] && pass "confirm gate: '$confirm_args' refused with exit 2" || fail "confirm gate: '$confirm_args' rc=$RC"
done
[[ ! -f "$STATE/log/mutations.log" ]] && pass "confirm gate: nothing mutated" || fail "confirm gate: mutated"
[[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$OLD_BE_REF" ]] && pass "confirm gate: pins untouched" || fail "confirm gate: pins changed"

# ==========================================================================
# 19) helper install SHA is recorded next to - never instead of - the app SHA
# ==========================================================================
reset_harness
EV="$TMP/ev-sha-separation"
run_exec "$EV" "$TMP/out-sha-separation.txt"
[[ "$RC" -eq 0 ]] && pass "sha_separation: execute succeeded" || fail "sha_separation: rc=$RC"
python3 - "$OWN_DIR" "$APP_SHA" "$HELPER_SHA" <<'PY' && pass "sha_separation: ACTIVE/EXPECTED store the application SHA, helper SHA separately" || fail "sha_separation: metadata SHA fields"
import json, os, sys
own, app, helper = sys.argv[1:4]
assert app != helper
for name in ("ACTIVE_OWNER.json", "EXPECTED_RELEASE.json", "ACTIVE_RELEASE.json"):
    doc = json.load(open(os.path.join(own, name)))
    assert doc["application_source_sha"] == app, (name, doc["application_source_sha"])
    assert doc["helper_install_sha"] == helper, (name, doc["helper_install_sha"])
    # Alias field: same operation helper SHA may appear twice (helper_install_sha +
    # operation_helper_install_sha). Never substitute the application SHA.
    op = doc.get("operation_helper_install_sha", helper)
    assert op == helper, (name, op)
    blob = json.dumps(doc)
    assert blob.count(helper) in (1, 2), f"{name} unexpected helper SHA count={blob.count(helper)}"
    assert app not in (doc["helper_install_sha"], op)
expected = json.load(open(os.path.join(own, "EXPECTED_RELEASE.json")))
assert expected["backend_digest"].startswith("sha256:")
assert expected["backend_source_sha"] == app
assert expected["storefront_source_sha"] == app
assert expected["storefront_digest"].startswith("sha256:")
PY
grep -q "$HELPER_SHA" "$EV/json/helper-install-sha.txt" && pass "sha_separation: evidence records the helper SHA" || fail "sha_separation: evidence helper sha"
grep -q "$APP_SHA" "$EV/json/application-source-sha.txt" && pass "sha_separation: evidence records the application SHA" || fail "sha_separation: evidence app sha"

# Missing install provenance must fail closed - never fall back to application SHA
# and never commit with an empty helper field.
reset_harness
EV="$TMP/ev-no-helper-sha"
ENVS=()
while IFS= read -r line; do ENVS+=("$line"); done < <(base_env)
ENVS+=("WOODRIGHT_EVIDENCE_DIR=$EV" "WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION=1"
  "WOODRIGHT_HELPER_INSTALL_SHA=" "WOODRIGHT_INSTALLED_GOVERNANCE_SHA="
  "WOODRIGHT_INSTALL_WR_ROOT=$TMP/wr-no-gov-root")
mkdir -p "$TMP/wr-no-gov-root/tools/release"
set +e
env "${ENVS[@]}" bash "$SCRIPT" \
  --environment production --component pair --source-sha "$APP_SHA" \
  --backend-ref "$BE_REF" --storefront-ref "$SF_REF" \
  --mode execute --confirm-mutation "$CONFIRM" >"$TMP/out-no-helper-sha.txt" 2>&1
RC=$?
set -e
[[ "$RC" -ne 0 ]] && pass "no_helper_sha: execute fail-closed" || fail "no_helper_sha: rc=$RC (expected non-zero)"
grep -qE 'provenance unresolved|missing/invalid canonical' "$TMP/out-no-helper-sha.txt" \
  && pass "no_helper_sha: reports missing canonical provenance" || fail "no_helper_sha: error text"
[[ ! -f "$OWN_DIR/ACTIVE_OWNER.json" ]] \
  && pass "no_helper_sha: no ACTIVE_OWNER written" || fail "no_helper_sha: ACTIVE_OWNER written despite fail-closed"
grep -q 'pre-existing' "$OWN_DIR/ACTIVE_RELEASE.json" \
  && pass "no_helper_sha: pre-existing ACTIVE_RELEASE intact" || fail "no_helper_sha: ACTIVE_RELEASE clobbered"
# Guard: application SHA must not appear as a substitute helper value in any stdout JSON
if grep -q "\"helper_install_sha\": \"$APP_SHA\"" "$TMP/out-no-helper-sha.txt"; then
  fail "no_helper_sha: application SHA substituted into helper field"
else
  pass "no_helper_sha: application SHA not substituted for helper"
fi

# ==========================================================================
# 20) WOODRIGHT_COMPOSE_BIN override is honoured
# ==========================================================================
reset_harness
EV="$TMP/ev-compose-bin"
run_exec "$EV" "$TMP/out-compose-bin.txt" "WOODRIGHT_COMPOSE_BIN=$BIN/compose"
[[ "$RC" -eq 0 ]] && pass "compose_bin: execute succeeded through the override" || fail "compose_bin: rc=$RC"
grep -q 'compose_up storefront' "$STATE/log/journal.log" && pass "compose_bin: override journalled the recreate" || fail "compose_bin: no journal entry"

# ==========================================================================
# 21) refusals that must never reach the lock
# ==========================================================================
reset_harness
for bad in "--environment public_demo" "--environment staging"; do
  ENVS=()
  while IFS= read -r line; do ENVS+=("$line"); done < <(base_env)
  ENVS+=("WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION=0")
  set +e
  # shellcheck disable=SC2086
  env "${ENVS[@]}" bash "$SCRIPT" $bad --component pair --source-sha "$APP_SHA" \
    --backend-ref "$BE_REF" --storefront-ref "$SF_REF" \
    --mode execute --confirm-mutation "$CONFIRM" >"$TMP/out-badenv.txt" 2>&1
  RC=$?
  set -e
  [[ "$RC" -ne 0 ]] && pass "refusal: '$bad' rejected" || fail "refusal: '$bad' accepted"
done
ENVS=()
while IFS= read -r line; do ENVS+=("$line"); done < <(base_env)
ENVS+=("WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION=0")
set +e
env "${ENVS[@]}" bash "$SCRIPT" --environment production --component pair \
  --source-sha "$APP_SHA" --backend-ref "$BE_REF" --storefront-ref "$SF_REF" \
  --dry-run --execute --confirm-mutation "$CONFIRM" >"$TMP/out-bothmodes.txt" 2>&1
RC=$?
set -e
[[ "$RC" -eq 2 ]] && pass "refusal: --dry-run with --execute rejected" || fail "refusal: both modes rc=$RC"

# execute must refuse a lock path outside /locks/production/
BADLOCK_CONF="$PROFILES/production.conf.badlock"
sed "s#WOODRIGHT_MUTATION_LOCK_PATH=.*#WOODRIGHT_MUTATION_LOCK_PATH=$SRV/locks/public_demo/live-cutover.lock#" \
  "$CONF" >"$BADLOCK_CONF"
mkdir -p "$TMP/profiles-badlock"
cp "$BADLOCK_CONF" "$TMP/profiles-badlock/production.conf"
ENVS=()
while IFS= read -r line; do ENVS+=("$line"); done < <(base_env)
ENVS+=("WOODRIGHT_ENV_PROFILE_DIR=$TMP/profiles-badlock" "WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION=0")
set +e
env "${ENVS[@]}" bash "$SCRIPT" --environment production --component pair \
  --source-sha "$APP_SHA" --backend-ref "$BE_REF" --storefront-ref "$SF_REF" \
  --mode execute --confirm-mutation "$CONFIRM" >"$TMP/out-badlock.txt" 2>&1
RC=$?
set -e
[[ "$RC" -eq 2 ]] && pass "refusal: non-production lock path rejected" || fail "refusal: bad lock rc=$RC"
grep -q 'locks/production/live-cutover.lock' "$TMP/out-badlock.txt" \
  && pass "refusal: names the only allowed lock" || fail "refusal: lock message"
lock_is_free "$PD_LOCK" && pass "refusal: public_demo lock never taken" || fail "refusal: public_demo lock held"

# ==========================================================================
# 22) readiness: Docker health "starting" is transient, not a failure
#     (backend HEALTHCHECK --start-period=60s in production)
# ==========================================================================
reset_harness
EV="$TMP/ev-starting"
run_exec "$EV" "$TMP/out-starting.txt" \
  "WOODRIGHT_FAKE_COMPOSE_STARTING=backend" "WOODRIGHT_FAKE_COMPOSE_STARTING_SEC=3"
[[ "$RC" -eq 0 ]] && pass "starting_then_healthy: committed, starting was not treated as failure" \
  || { fail "starting_then_healthy: rc=$RC"; sed -n '1,40p' "$TMP/out-starting.txt"; }
[[ "$(state_file "$EV")" == "committed" ]] && pass "starting_then_healthy: state committed" || fail "starting_then_healthy: state=$(state_file "$EV")"
grep -q 'health=starting' "$EV/raw/health-poll-backend.txt" \
  && pass "starting_then_healthy: poll evidence records the starting window" || fail "starting_then_healthy: no starting attempt recorded"
grep -q 'health=healthy' "$EV/raw/health-poll-backend.txt" \
  && pass "starting_then_healthy: poll evidence records the healthy flip" || fail "starting_then_healthy: no healthy attempt recorded"
[[ "$(digest_of woodright-production-backend)" == "$NEW_BE_DIG" ]] \
  && pass "starting_then_healthy: backend advanced" || fail "starting_then_healthy: backend digest"

# ==========================================================================
# 23) readiness: health never becomes healthy -> deadline -> verified rollback
# ==========================================================================
reset_harness
EV="$TMP/ev-health-timeout"
run_exec "$EV" "$TMP/out-health-timeout.txt" \
  "WOODRIGHT_FAKE_COMPOSE_UNHEALTHY=storefront" "WOODRIGHT_CUTOVER_READY_DEADLINE_SEC=4"
[[ "$RC" -eq 10 ]] && pass "health_timeout: rollback_ok exit 10" || fail "health_timeout: rc=$RC"
grep -q 'docker gate timed out' "$TMP/out-health-timeout.txt" \
  && pass "health_timeout: reported as a deadline, not a single failed read" || fail "health_timeout: no deadline message"
POLL_ATTEMPTS="$(grep -c 'attempt=' "$EV/raw/health-poll-storefront.txt" || true)"
[[ "$POLL_ATTEMPTS" -ge 2 ]] && pass "health_timeout: polled $POLL_ATTEMPTS times before giving up" \
  || fail "health_timeout: only $POLL_ATTEMPTS attempt(s) - still one-shot"
[[ "$(digest_of woodright-production-storefront)" == "$OLD_SF_DIG" ]] \
  && pass "health_timeout: storefront recreated back onto the pre-cutover digest" || fail "health_timeout: sf digest"
[[ "$(digest_of woodright-production-backend)" == "$OLD_BE_DIG" ]] \
  && pass "health_timeout: backend rolled back too" || fail "health_timeout: be digest"
[[ "$(pin_of WOODRIGHT_STOREFRONT_IMAGE)" == "$OLD_SF_REF" ]] && pass "health_timeout: pins restored" || fail "health_timeout: pins"
grep -q 'ROLLBACK_VERIFY storefront ok pin==runtime' "$TMP/out-health-timeout.txt" \
  && pass "health_timeout: postcondition pins==runtime was actually evaluated" || fail "health_timeout: no postcondition proof"
assert_no_keepers "health_timeout"

# ==========================================================================
# 24) readiness: HTTP is flaky at first, then 200 -> commit (no rollback)
# ==========================================================================
reset_harness
EV="$TMP/ev-http-flaky"
run_exec "$EV" "$TMP/out-http-flaky.txt" \
  "WOODRIGHT_FAKE_HTTP_FLAKY_PORT=3200" "WOODRIGHT_FAKE_HTTP_FLAKY_TIMES=2"
[[ "$RC" -eq 0 ]] && pass "http_flaky: transient 503s did not trigger a rollback" \
  || { fail "http_flaky: rc=$RC"; sed -n '1,40p' "$TMP/out-http-flaky.txt"; }
grep -q 'code=503' "$EV/raw/health-poll-storefront.txt" \
  && pass "http_flaky: the transient failures were observed" || fail "http_flaky: no 503 recorded"
grep -q 'code=200' "$EV/raw/health-poll-storefront.txt" \
  && pass "http_flaky: readiness proceeded on the first 200" || fail "http_flaky: no 200 recorded"
[[ "$(state_file "$EV")" == "committed" ]] && pass "http_flaky: committed" || fail "http_flaky: state=$(state_file "$EV")"

# ==========================================================================
# 25) pins restored but the runtime is still the candidate
#     -> rollback_incomplete exit 13, never a false ROLLBACK_OK
# ==========================================================================
reset_harness
EV="$TMP/ev-rollback-incomplete"
run_exec "$EV" "$TMP/out-rollback-incomplete.txt" \
  "WOODRIGHT_FAKE_COMPOSE_UNHEALTHY=storefront" "WOODRIGHT_CUTOVER_READY_DEADLINE_SEC=3" \
  "WOODRIGHT_CUTOVER_ROLLBACK_SKIP_RECREATE=1"
[[ "$RC" -eq 13 ]] && pass "rollback_incomplete: exit 13 (not 10)" || fail "rollback_incomplete: rc=$RC"
[[ "$(state_file "$EV")" == "rollback_incomplete" ]] && pass "rollback_incomplete: state rollback_incomplete" \
  || fail "rollback_incomplete: state=$(state_file "$EV")"
grep -q 'ROLLBACK_INCOMPLETE' "$TMP/out-rollback-incomplete.txt" \
  && pass "rollback_incomplete: reported explicitly" || fail "rollback_incomplete: not reported"
grep -q 'ROLLBACK_OK (pins restored' "$TMP/out-rollback-incomplete.txt" \
  && fail "rollback_incomplete: claimed ROLLBACK_OK anyway" || pass "rollback_incomplete: never claims ROLLBACK_OK"
[[ "$(pin_of WOODRIGHT_STOREFRONT_IMAGE)" == "$OLD_SF_REF" ]] \
  && pass "rollback_incomplete: pins were restored" || fail "rollback_incomplete: pins not restored"
[[ "$(digest_of woodright-production-storefront)" == "$NEW_SF_DIG" ]] \
  && pass "rollback_incomplete: runtime is provably still the candidate" || fail "rollback_incomplete: sf digest"
grep -q 'ROLLBACK_VERIFY storefront MISMATCH' "$TMP/out-rollback-incomplete.txt" \
  && pass "rollback_incomplete: the pin/runtime mismatch is named" || fail "rollback_incomplete: mismatch not named"
python3 - "$EV/json/rollback-result.json" <<'PY' \
  && pass "rollback_incomplete: evidence separates what held from what did not" || fail "rollback_incomplete: evidence"
import json, sys
doc = json.load(open(sys.argv[1]))
assert doc["pins"] == 1, doc
assert doc["pins_equal_runtime"] == 0, doc
assert doc["keepers_used"] is False, doc
PY
[[ ! -f "$OWN_DIR/ACTIVE_OWNER.json" ]] && pass "rollback_incomplete: no release published" || fail "rollback_incomplete: ACTIVE_OWNER written"
lock_is_free "$LOCK" && pass "rollback_incomplete: lock released" || fail "rollback_incomplete: lock held"

# ==========================================================================
# 26) pre-existing pin/runtime skew: execute dies before the lock and any write
# ==========================================================================
reset_harness
# Runtime moved to the candidate digests while the pins still name the old pair.
write_container backend "$NEW_BE_DIG"
write_container storefront "$NEW_SF_DIG"
EV="$TMP/ev-existing-skew"
run_exec "$EV" "$TMP/out-existing-skew.txt"
[[ "$RC" -eq 2 ]] && pass "existing_skew: refused with exit 2" || fail "existing_skew: rc=$RC"
grep -q 'existing_pin_runtime_skew_requires_recovery' "$TMP/out-existing-skew.txt" \
  && pass "existing_skew: names the blocking token" || fail "existing_skew: token missing"
grep -q 'recover-production-candidate-skew.sh' "$TMP/out-existing-skew.txt" \
  && pass "existing_skew: points at the recovery helper" || fail "existing_skew: no recovery pointer"
[[ ! -f "$STATE/log/mutations.log" ]] && pass "existing_skew: nothing was recreated" || fail "existing_skew: docker mutated"
[[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$OLD_BE_REF" ]] && pass "existing_skew: pins untouched" || fail "existing_skew: pins changed"
[[ ! -d "$EV" ]] && pass "existing_skew: refused before evidence/lock" || fail "existing_skew: evidence dir created"
lock_is_free "$LOCK" && pass "existing_skew: lock never taken" || fail "existing_skew: lock held"

# the same skew must be visible - and non-fatal - in the read-only dry-run
ENVS=()
while IFS= read -r line; do ENVS+=("$line"); done < <(base_env)
ENVS+=("WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION=0")
set +e
env "${ENVS[@]}" bash "$SCRIPT" \
  --environment production --component pair --source-sha "$APP_SHA" \
  --backend-ref "$BE_REF" --storefront-ref "$SF_REF" >"$TMP/out-skew-dryrun.txt" 2>"$TMP/err-skew-dryrun.txt"
RC=$?
set -e
python3 - "$TMP/out-skew-dryrun.txt" <<'PY' \
  && pass "existing_skew: dry-run packet reports the skew and the block" || fail "existing_skew: dry-run packet fields"
import json, sys
raw = open(sys.argv[1]).read()
packet = json.loads(raw[raw.index("{"):])
assert packet["existing_pin_runtime_skew"] is True, packet
assert packet["normal_execute_blocked"] is True, packet
cmp = packet["pin_runtime_comparison"]
assert cmp["backend"]["verdict"] == "skew", cmp
assert cmp["recovery_helper"].endswith("recover-production-candidate-skew.sh"), cmp
assert cmp["blocking_token"] == "existing_pin_runtime_skew_requires_recovery", cmp
PY
[[ ! -f "$STATE/log/mutations.log" ]] && pass "existing_skew: dry-run stayed read-only" || fail "existing_skew: dry-run mutated"

# ==========================================================================
# 26b) storefront-only / backend-only pair identity + fail-closed peer CAS
# ==========================================================================
reset_harness
EV="$TMP/ev-sf-only"
run_exec_component "$EV" "$TMP/out-sf-only.txt" storefront
[[ "$RC" -eq 0 ]] && pass "sf_only: exit 0" || { fail "sf_only: rc=$RC"; sed -n '1,80p' "$TMP/out-sf-only.txt"; }
python3 - "$OWN_DIR/EXPECTED_RELEASE.json" "$NEW_SF_DIG" "$APP_SHA" "$OLD_BE_DIG" "$OLD_PEER_SHA" "$OLD_BE_REF" "$SF_REF" <<'PY' \
  && pass "sf_only: EXPECTED keeps frozen backend identity" || fail "sf_only: EXPECTED pair identity"
import json, sys
doc, sf_dig, sf_sha, be_dig, be_sha, be_ref, sf_ref = sys.argv[1:8]
d = json.load(open(doc))
assert d["storefront_digest"] == sf_dig, d
assert d["storefront_source_sha"] == sf_sha, d
assert d["backend_digest"] == be_dig, d
assert d["backend_source_sha"] == be_sha, d
assert d["backend_image"] == be_ref
assert d["storefront_image"] == sf_ref
assert d["application_source_sha"] == sf_sha
assert d["backend_digest"] and d["storefront_digest"]
PY
[[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$OLD_BE_REF" ]] && pass "sf_only: backend pin frozen" || fail "sf_only: backend pin changed"
[[ "$(digest_of woodright-production-backend)" == "$OLD_BE_DIG" ]] && pass "sf_only: backend digest frozen" || fail "sf_only: backend runtime moved"
[[ "$(digest_of woodright-production-storefront)" == "$NEW_SF_DIG" ]] && pass "sf_only: storefront advanced" || fail "sf_only: storefront digest"
[[ "$(pin_of WOODRIGHT_STOREFRONT_SOURCE_SHA)" == "$APP_SHA" ]] && pass "sf_only: storefront source SHA mutated" || fail "sf_only: SF_SOURCE_SHA=$(pin_of WOODRIGHT_STOREFRONT_SOURCE_SHA)"
[[ "$(pin_of WOODRIGHT_BACKEND_SOURCE_SHA)" == "$OLD_PEER_SHA" ]] && pass "sf_only: backend source SHA from live peer" || fail "sf_only: BE_SOURCE_SHA=$(pin_of WOODRIGHT_BACKEND_SOURCE_SHA)"
[[ "$(pin_of WOODRIGHT_RELEASE_SHA)" == "9946b42aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" ]] \
  && pass "sf_only: global RELEASE_SHA not rewritten" || fail "sf_only: RELEASE_SHA=$(pin_of WOODRIGHT_RELEASE_SHA)"
grep -qE 'compose_up backend' "$STATE/log/journal.log" \
  && grep -qE 'compose_up storefront' "$STATE/log/journal.log" \
  && pass "sf_only: both services recreated for identity env" || fail "sf_only: journal=$(tr '\n' '|' <"$STATE/log/journal.log")"

reset_harness
EV="$TMP/ev-be-only"
run_exec_component "$EV" "$TMP/out-be-only.txt" backend
[[ "$RC" -eq 0 ]] && pass "be_only: exit 0" || { fail "be_only: rc=$RC"; sed -n '1,80p' "$TMP/out-be-only.txt"; }
python3 - "$OWN_DIR/EXPECTED_RELEASE.json" "$NEW_BE_DIG" "$APP_SHA" "$OLD_SF_DIG" "$OLD_PEER_SHA" "$OLD_SF_REF" "$BE_REF" <<'PY' \
  && pass "be_only: EXPECTED keeps frozen storefront identity" || fail "be_only: EXPECTED pair identity"
import json, sys
doc, be_dig, be_sha, sf_dig, sf_sha, sf_ref, be_ref = sys.argv[1:8]
d = json.load(open(doc))
assert d["backend_digest"] == be_dig
assert d["backend_source_sha"] == be_sha
assert d["storefront_digest"] == sf_dig
assert d["storefront_source_sha"] == sf_sha
assert d["storefront_image"] == sf_ref
assert d["backend_image"] == be_ref
PY
[[ "$(pin_of WOODRIGHT_STOREFRONT_IMAGE)" == "$OLD_SF_REF" ]] && pass "be_only: storefront pin frozen" || fail "be_only: storefront pin changed"
[[ "$(digest_of woodright-production-storefront)" == "$OLD_SF_DIG" ]] && pass "be_only: storefront digest frozen" || fail "be_only: storefront runtime moved"
[[ "$(digest_of woodright-production-backend)" == "$NEW_BE_DIG" ]] && pass "be_only: backend advanced" || fail "be_only: backend digest"
[[ "$(pin_of WOODRIGHT_BACKEND_SOURCE_SHA)" == "$APP_SHA" ]] && pass "be_only: backend source SHA mutated" || fail "be_only: BE_SOURCE_SHA=$(pin_of WOODRIGHT_BACKEND_SOURCE_SHA)"
[[ "$(pin_of WOODRIGHT_STOREFRONT_SOURCE_SHA)" == "$OLD_PEER_SHA" ]] && pass "be_only: storefront source SHA from live peer" || fail "be_only: SF_SOURCE_SHA=$(pin_of WOODRIGHT_STOREFRONT_SOURCE_SHA)"
[[ "$(pin_of WOODRIGHT_RELEASE_SHA)" == "9946b42aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" ]] \
  && pass "be_only: global RELEASE_SHA not rewritten" || fail "be_only: RELEASE_SHA=$(pin_of WOODRIGHT_RELEASE_SHA)"

# 26c) backend-only that unifies the pair: live storefront OCI already == SOURCE_SHA
reset_harness
write_container storefront "$OLD_SF_DIG" "127.0.0.1" "0" "$APP_SHA"
write_image "$OLD_SF_REF" woodright-storefront production_candidate "$APP_SHA"
EV="$TMP/ev-be-only-unify"
run_exec_component "$EV" "$TMP/out-be-only-unify.txt" backend
[[ "$RC" -eq 0 ]] && pass "be_only_unify: exit 0" || { fail "be_only_unify: rc=$RC"; sed -n '1,80p' "$TMP/out-be-only-unify.txt"; }
[[ "$(pin_of WOODRIGHT_STOREFRONT_IMAGE)" == "$OLD_SF_REF" ]] && pass "be_only_unify: storefront pin frozen" || fail "be_only_unify: storefront pin changed"
[[ "$(digest_of woodright-production-storefront)" == "$OLD_SF_DIG" ]] && pass "be_only_unify: storefront digest frozen" || fail "be_only_unify: storefront runtime moved"
[[ "$(digest_of woodright-production-backend)" == "$NEW_BE_DIG" ]] && pass "be_only_unify: backend advanced" || fail "be_only_unify: backend digest"
[[ "$(pin_of WOODRIGHT_BACKEND_SOURCE_SHA)" == "$APP_SHA" ]] && pass "be_only_unify: backend source SHA" || fail "be_only_unify: BE_SOURCE_SHA=$(pin_of WOODRIGHT_BACKEND_SOURCE_SHA)"
[[ "$(pin_of WOODRIGHT_STOREFRONT_SOURCE_SHA)" == "$APP_SHA" ]] && pass "be_only_unify: storefront source SHA already matched" || fail "be_only_unify: SF_SOURCE_SHA=$(pin_of WOODRIGHT_STOREFRONT_SOURCE_SHA)"
[[ "$(pin_of WOODRIGHT_RELEASE_SHA)" == "$APP_SHA" ]] && pass "be_only_unify: unified RELEASE_SHA written" || fail "be_only_unify: RELEASE_SHA=$(pin_of WOODRIGHT_RELEASE_SHA)"

reset_harness
EV="$TMP/ev-sf-spoof"
ENVS=()
while IFS= read -r line; do ENVS+=("$line"); done < <(base_env)
ENVS+=("WOODRIGHT_EVIDENCE_DIR=$EV" "WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION=1")
set +e
env "${ENVS[@]}" bash "$SCRIPT" \
  --environment production --component storefront --source-sha "$APP_SHA" \
  --storefront-ref "$SF_REF" --backend-ref "$BE_REF" \
  --mode execute --confirm-mutation "$CONFIRM" >"$TMP/out-sf-spoof.txt" 2>&1
RC=$?
set -e
[[ "$RC" -ne 0 ]] && pass "sf_spoof: refused caller peer ref" || fail "sf_spoof: rc=$RC"
grep -qE 'peer backend ref refused|LIVE_COMPONENT_IDENTITY_DRIFT' "$TMP/out-sf-spoof.txt" \
  && pass "sf_spoof: drift/spoof token" || fail "sf_spoof: error text"
[[ "$(pin_of WOODRIGHT_STOREFRONT_IMAGE)" == "$OLD_SF_REF" ]] && pass "sf_spoof: no pin write" || fail "sf_spoof: pins mutated"

reset_harness
python3 - "$OWN_DIR/EXPECTED_RELEASE.json" "$NEW_BE_DIG" "$APP_SHA" "$OLD_SF_DIG" "$OLD_PEER_SHA" <<'PY'
import json, sys
path, be_dig, app, sf_dig, sf_sha = sys.argv[1:6]
json.dump({
  "schema": "woodright.production_candidate.expected_release.v1",
  "application_source_sha": app,
  "backend_digest": be_dig,
  "backend_source_sha": app,
  "storefront_digest": sf_dig,
  "storefront_source_sha": sf_sha,
}, open(path, "w"))
PY
EV="$TMP/ev-stale-expected"
run_exec_component "$EV" "$TMP/out-stale-expected.txt" storefront
[[ "$RC" -ne 0 ]] && pass "stale_expected: refused" || fail "stale_expected: rc=$RC"
grep -q 'LIVE_COMPONENT_IDENTITY_DRIFT' "$TMP/out-stale-expected.txt" \
  && pass "stale_expected: drift token" || fail "stale_expected: error text"

reset_harness
python3 - "$OWN_DIR/EXPECTED_RELEASE.json" "$OLD_BE_DIG" "$APP_SHA" "$OLD_SF_DIG" "$OLD_PEER_SHA" <<'PY'
import json, sys
path, be_dig, app, sf_dig, sf_sha = sys.argv[1:6]
json.dump({
  "schema": "woodright.production_candidate.expected_release.v1",
  "application_source_sha": app,
  "backend_digest": be_dig,
  "backend_source_sha": app,
  "storefront_digest": sf_dig,
  "storefront_source_sha": sf_sha,
}, open(path, "w"))
PY
EV="$TMP/ev-rev-disagree"
run_exec_component "$EV" "$TMP/out-rev-disagree.txt" storefront
[[ "$RC" -ne 0 ]] && pass "rev_disagree: refused" || fail "rev_disagree: rc=$RC"
grep -q 'LIVE_COMPONENT_IDENTITY_DRIFT' "$TMP/out-rev-disagree.txt" \
  && pass "rev_disagree: drift token" || fail "rev_disagree: error text"

reset_harness
python3 - "$OWN_DIR/EXPECTED_RELEASE.json" "$OLD_BE_DIG" "$OLD_PEER_SHA" <<'PY'
import json, sys
path, be_dig, be_sha = sys.argv[1:4]
json.dump({
  "backend_digest": be_dig,
  "backend_source_sha": "not-a-sha",
}, open(path, "w"))
PY
EV="$TMP/ev-malformed-peer-sha"
run_exec_component "$EV" "$TMP/out-malformed-peer-sha.txt" storefront
[[ "$RC" -ne 0 ]] && pass "malformed_peer_sha: refused" || fail "malformed_peer_sha: rc=$RC"

reset_harness
EV="$TMP/ev-peer-change"
ENVS=()
while IFS= read -r line; do ENVS+=("$line"); done < <(base_env)
ENVS+=("WOODRIGHT_EVIDENCE_DIR=$EV" "WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION=1" "WOODRIGHT_CUTOVER_FAULT=peer_change")
set +e
env "${ENVS[@]}" bash "$SCRIPT" \
  --environment production --component storefront --source-sha "$APP_SHA" \
  --storefront-ref "$SF_REF" \
  --mode execute --confirm-mutation "$CONFIRM" >"$TMP/out-peer-change.txt" 2>&1
RC=$?
set -e
[[ "$RC" -ne 0 ]] && pass "peer_change: refused before metadata commit" || fail "peer_change: rc=$RC"
grep -q 'LIVE_COMPONENT_IDENTITY_DRIFT' "$TMP/out-peer-change.txt" \
  && pass "peer_change: drift token" || fail "peer_change: error text"

# ==========================================================================
# 26b) rollback component SOURCE_SHA seed (PR #208)
# ==========================================================================
OLD_BE_SHA="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
OLD_SF_SHA="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

install_split_live_pair() {
  write_container backend "$OLD_BE_DIG" "127.0.0.1" 0 "$OLD_BE_SHA"
  write_container storefront "$OLD_SF_DIG" "127.0.0.1" 0 "$OLD_SF_SHA"
  write_image "$OLD_BE_REF" woodright-backend production_candidate "$OLD_BE_SHA"
  write_image "$OLD_SF_REF" woodright-storefront production_candidate "$OLD_SF_SHA"
}

blank_live_oci_revision() {
  local service="$1" value="${2-}"
  python3 - "$STATE" "$service" "$value" <<'PY'
import json, os, sys
state, service, value = sys.argv[1:4]
name = f"woodright-production-{service}"
path = os.path.join(state, "containers", f"{name}.json")
doc = json.load(open(path))
target = doc[0] if isinstance(doc, list) else doc
target.setdefault("Config", {}).setdefault("Labels", {})
target["Config"]["Labels"]["org.opencontainers.image.revision"] = value
json.dump(doc, open(path, "w"))
props = os.path.join(state, "containers", f"{name}.props")
if os.path.exists(props):
    os.remove(props)
PY
}

# Case 1: split live pair, old .env missing component SHA keys.
reset_harness
install_split_live_pair
EV="$TMP/ev-seed-split-missing"
run_exec "$EV" "$TMP/out-seed-split-missing.txt" "WOODRIGHT_FAKE_COMPOSE_FAIL=storefront"
[[ "$RC" -eq 10 ]] && pass "seed_split: rollback_ok exit 10" || fail "seed_split: rc=$RC"
[[ -f "$EV/pin-backup/dokploy-compose.env" ]] && pass "seed_split: pin backup present" || fail "seed_split: no pin backup"
[[ "$(awk -F= '$1=="WOODRIGHT_BACKEND_SOURCE_SHA"{print $2; exit}' "$EV/pin-backup/dokploy-compose.env")" == "$OLD_BE_SHA" ]] \
  && pass "seed_split: backup backend SHA from live OCI" || fail "seed_split: backup BE SHA"
[[ "$(awk -F= '$1=="WOODRIGHT_STOREFRONT_SOURCE_SHA"{print $2; exit}' "$EV/pin-backup/dokploy-compose.env")" == "$OLD_SF_SHA" ]] \
  && pass "seed_split: backup storefront SHA from live OCI" || fail "seed_split: backup SF SHA"
if grep -q "$APP_SHA" "$EV/pin-backup/dokploy-compose.env"; then
  fail "seed_split: candidate SHA leaked into rollback backup"
else
  pass "seed_split: candidate SHA absent from rollback backup"
fi
[[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$OLD_BE_REF" ]] && pass "seed_split: backend digest restored" || fail "seed_split: backend pin"
[[ "$(pin_of WOODRIGHT_STOREFRONT_IMAGE)" == "$OLD_SF_REF" ]] && pass "seed_split: storefront digest restored" || fail "seed_split: storefront pin"
[[ "$(pin_of WOODRIGHT_BACKEND_SOURCE_SHA)" == "$OLD_BE_SHA" ]] && pass "seed_split: live env backend SHA restored" || fail "seed_split: live BE SHA=$(pin_of WOODRIGHT_BACKEND_SOURCE_SHA)"
[[ "$(pin_of WOODRIGHT_STOREFRONT_SOURCE_SHA)" == "$OLD_SF_SHA" ]] && pass "seed_split: live env storefront SHA restored" || fail "seed_split: live SF SHA=$(pin_of WOODRIGHT_STOREFRONT_SOURCE_SHA)"
[[ "$(pin_of WOODRIGHT_RELEASE_SHA)" == "9946b42aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" ]] \
  && pass "seed_split: old global marker preserved, not fabricated unified SHA" \
  || fail "seed_split: RELEASE_SHA=$(pin_of WOODRIGHT_RELEASE_SHA)"
python3 - "$EV/json/rollback-result.json" <<'PY' \
  && pass "seed_split: rollback result component_source_sha=1" || fail "seed_split: rollback result"
import json, sys
doc = json.load(open(sys.argv[1]))
assert doc["component_source_sha"] == 1, doc
assert doc["pins"] == 1, doc
PY

# Case 3: missing live OCI revision fails before mutation.
reset_harness
install_split_live_pair
blank_live_oci_revision backend ""
EV="$TMP/ev-missing-oci"
run_exec "$EV" "$TMP/out-missing-oci.txt"
[[ "$RC" -ne 0 ]] && pass "missing_oci: refused" || fail "missing_oci: rc=$RC"
[[ "$(state_file "$EV")" == "failed_before_mutation" ]] && pass "missing_oci: failed_before_mutation" || fail "missing_oci: state=$(state_file "$EV")"
[[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$OLD_BE_REF" ]] && pass "missing_oci: pins untouched" || fail "missing_oci: pins changed"
[[ ! -f "$STATE/log/mutations.log" ]] && pass "missing_oci: nothing recreated" || fail "missing_oci: mutated"
grep -qE 'cannot seed backup: live backend OCI revision missing|LIVE_COMPONENT_IDENTITY_DRIFT' "$TMP/out-missing-oci.txt" \
  && pass "missing_oci: fail-closed named" || fail "missing_oci: error text"

# Case 4: malformed live OCI revision fails before mutation.
reset_harness
install_split_live_pair
blank_live_oci_revision storefront "not-a-revision"
EV="$TMP/ev-malformed-oci"
run_exec "$EV" "$TMP/out-malformed-oci.txt"
[[ "$RC" -ne 0 ]] && pass "malformed_oci: refused" || fail "malformed_oci: rc=$RC"
[[ "$(state_file "$EV")" == "failed_before_mutation" ]] && pass "malformed_oci: failed_before_mutation" || fail "malformed_oci: state=$(state_file "$EV")"
[[ "$(pin_of WOODRIGHT_STOREFRONT_IMAGE)" == "$OLD_SF_REF" ]] && pass "malformed_oci: pins untouched" || fail "malformed_oci: pins changed"
[[ ! -f "$STATE/log/mutations.log" ]] && pass "malformed_oci: nothing recreated" || fail "malformed_oci: mutated"

# Case 5: valid pre-existing component SHA keys that match live are preserved.
reset_harness
install_split_live_pair
cat >>"$ENV_FILE" <<EOF
WOODRIGHT_BACKEND_SOURCE_SHA=${OLD_BE_SHA}
WOODRIGHT_STOREFRONT_SOURCE_SHA=${OLD_SF_SHA}
EOF
EV="$TMP/ev-preserve-sha"
run_exec "$EV" "$TMP/out-preserve-sha.txt" "WOODRIGHT_FAKE_COMPOSE_FAIL=storefront"
[[ "$RC" -eq 10 ]] && pass "preserve_sha: rollback_ok" || fail "preserve_sha: rc=$RC"
[[ "$(awk -F= '$1=="WOODRIGHT_BACKEND_SOURCE_SHA"{print $2; exit}' "$EV/pin-backup/dokploy-compose.env")" == "$OLD_BE_SHA" ]] \
  && pass "preserve_sha: backup kept live backend SHA" || fail "preserve_sha: backup BE"
[[ "$(pin_of WOODRIGHT_BACKEND_SOURCE_SHA)" == "$OLD_BE_SHA" ]] && pass "preserve_sha: restored backend SHA" || fail "preserve_sha: live BE"

# Case 5b: pre-existing SHA that disagrees with live OCI fails closed (no candidate spoof).
reset_harness
install_split_live_pair
cat >>"$ENV_FILE" <<EOF
WOODRIGHT_BACKEND_SOURCE_SHA=${APP_SHA}
WOODRIGHT_STOREFRONT_SOURCE_SHA=${OLD_SF_SHA}
EOF
EV="$TMP/ev-spoof-sha"
run_exec "$EV" "$TMP/out-spoof-sha.txt"
[[ "$RC" -ne 0 ]] && pass "spoof_sha: refused" || fail "spoof_sha: rc=$RC"
[[ "$(state_file "$EV")" == "failed_before_mutation" ]] && pass "spoof_sha: failed_before_mutation" || fail "spoof_sha: state=$(state_file "$EV")"
[[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$OLD_BE_REF" ]] && pass "spoof_sha: pins untouched" || fail "spoof_sha: pins changed"
[[ ! -f "$STATE/log/mutations.log" ]] && pass "spoof_sha: nothing recreated" || fail "spoof_sha: mutated"
grep -q 'disagrees with live OCI revision' "$TMP/out-spoof-sha.txt" \
  && pass "spoof_sha: mismatch named" || fail "spoof_sha: error text"

# Case 6: unified old pair still rolls back with matching component SHAs.
reset_harness
UNIFIED_OLD="cccccccccccccccccccccccccccccccccccccccc"
write_container backend "$OLD_BE_DIG" "127.0.0.1" 0 "$UNIFIED_OLD"
write_container storefront "$OLD_SF_DIG" "127.0.0.1" 0 "$UNIFIED_OLD"
write_image "$OLD_BE_REF" woodright-backend production_candidate "$UNIFIED_OLD"
write_image "$OLD_SF_REF" woodright-storefront production_candidate "$UNIFIED_OLD"
python3 - "$ENV_FILE" "$UNIFIED_OLD" <<'PY'
from pathlib import Path
import sys
path, sha = Path(sys.argv[1]), sys.argv[2]
text = path.read_text(encoding="utf-8")
text = text.replace(
    "WOODRIGHT_RELEASE_SHA=9946b42aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    f"WOODRIGHT_RELEASE_SHA={sha}",
)
path.write_text(text, encoding="utf-8")
PY
EV="$TMP/ev-unified-old"
run_exec "$EV" "$TMP/out-unified-old.txt" "WOODRIGHT_FAKE_COMPOSE_FAIL=storefront"
[[ "$RC" -eq 10 ]] && pass "unified_old: rollback_ok" || fail "unified_old: rc=$RC"
[[ "$(pin_of WOODRIGHT_BACKEND_SOURCE_SHA)" == "$UNIFIED_OLD" ]] && pass "unified_old: backend SHA restored" || fail "unified_old: BE SHA"
[[ "$(pin_of WOODRIGHT_STOREFRONT_SOURCE_SHA)" == "$UNIFIED_OLD" ]] && pass "unified_old: storefront SHA restored" || fail "unified_old: SF SHA"
[[ "$(pin_of WOODRIGHT_RELEASE_SHA)" == "$UNIFIED_OLD" ]] && pass "unified_old: global marker restored" || fail "unified_old: RELEASE_SHA=$(pin_of WOODRIGHT_RELEASE_SHA)"

# ==========================================================================
# 27) static contract checks
# ==========================================================================
grep -q '^# LIVE_MUTATING=true' "$SCRIPT" && pass "static: header declares LIVE_MUTATING=true" || fail "static: LIVE_MUTATING header"
grep -q '^# requires_global_lock=true' "$SCRIPT" && pass "static: header declares requires_global_lock=true" || fail "static: requires_global_lock header"
grep -q '/srv/woodright/locks/production/live-cutover.lock' "$SCRIPT" && pass "static: names the canonical production lock" || fail "static: canonical lock path"
grep -q 'wr_staging_mutation_lock_acquire' "$SCRIPT" && pass "static: uses the shared flock helper" || fail "static: lock helper"
if grep -qE 'keeper' "$SCRIPT"; then
  # Prose about why keepers are gone is fine; creating one is not.
  if grep -qE '^\s*(prod_docker|docker) rename|KEEPER_(BE|SF)=' "$SCRIPT"; then
    fail "static: script still renames containers into keepers"
  else
    pass "static: keeper mentions are documentation only, no rename path"
  fi
else
  pass "static: no keeper references at all"
fi
grep -q 'wait_component_ready' "$SCRIPT" && pass "static: readiness is a polling helper" || fail "static: no wait_component_ready"
if grep -qE '^[[:space:]]*docker_health_ok[[:space:]]*(\(\)|")' "$SCRIPT"; then
  fail "static: one-shot docker_health_ok is still defined or called"
else
  pass "static: one-shot docker_health_ok is gone (mentions are prose only)"
fi
grep -q 'recover-production-candidate-skew.sh' "$SCRIPT" \
  && pass "static: refers operators to the skew recovery helper" || fail "static: no recovery helper reference"
[[ -x "$ROOT/ops/release/recover-production-candidate-skew.sh" || -f "$ROOT/ops/release/recover-production-candidate-skew.sh" ]] \
  && pass "static: the skew recovery helper exists" || fail "static: recovery helper missing"
if grep -qE 'db:migrate|medusa exec|--seed|docker (system )?prune' "$SCRIPT"; then
  fail "static: script references migrations/seeds/prune"
else
  pass "static: no migration/seed/prune paths"
fi
if grep -qE 'recreate-staging-(backend|storefront)|reconcile-public-image-pins' "$SCRIPT"; then
  fail "static: reuses public_demo-only helpers"
else
  pass "static: does not call public_demo-only helpers"
fi
grep -q 'public_demo' "$ROOT/scripts/release/reconcile-public-image-pins.sh" \
  && pass "static: pin reconciler stays public_demo-only" || fail "static: pin reconciler scope"
if grep -qE '^\s*(production\|)?production\)' "$ROOT/scripts/release/reconcile-public-image-pins.sh"; then
  fail "static: pin reconciler now accepts production"
else
  pass "static: pin reconciler does not accept production"
fi
grep -q 'ensure_pin_backup_component_source_shas' "$SCRIPT" \
  && pass "static: pin-backup component SHA seed helper exists" || fail "static: seed helper missing"
if awk '/^ensure_pin_backup_component_source_shas\(\)/,/^resolve_pair_expected_identities$/' "$SCRIPT" \
  | grep -qE 'SOURCE_SHA|BE_REF|SF_REF'; then
  # The function may mention WOODRIGHT_*_SOURCE_SHA keys (expected) but must
  # not assign them from the candidate SOURCE_SHA / caller refs.
  if awk '/^ensure_pin_backup_component_source_shas\(\)/,/^resolve_pair_expected_identities$/' "$SCRIPT" \
    | grep -qE 'live_oci_revision'; then
    pass "static: pin-backup seed authority is live_oci_revision"
  else
    fail "static: pin-backup seed does not call live_oci_revision"
  fi
else
  pass "static: pin-backup seed does not mention caller refs"
fi
if grep -q 'ensure_pin_backup_component_source_shas' "$SCRIPT" \
  && grep -A2 'be_sha="$(live_oci_revision' "$SCRIPT" | grep -q 'sf_sha="$(live_oci_revision'; then
  pass "static: both component SHAs seeded from live OCI"
else
  fail "static: seed does not read both live OCI revisions"
fi
( cd "$ROOT" && node scripts/release/check-global-lock-policy.cjs ops/release >/dev/null 2>&1 ) \
  && pass "static: global lock policy passes for ops/release" || fail "static: global lock policy"

if [[ "$FAILED" -eq 0 ]]; then
  echo "OK production-candidate cutover execute fidelity"
  exit 0
fi
echo "FAILED count=$FAILED"
exit 1
