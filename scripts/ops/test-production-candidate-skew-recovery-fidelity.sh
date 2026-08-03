#!/usr/bin/env bash
# Fidelity tests for ops/release/recover-production-candidate-skew.sh - the only
# supported way to converge a PRIVATE production-candidate stack whose compose
# .env pins and running containers disagree.
#
# The fixture is the real incident shape: the containers already run the
# candidate pair, while the pin file still names the previous pair. Everything
# runs against a throwaway filesystem under /tmp with the shared fake docker /
# compose shims. No real container, pin file, lock or VM is touched, and the
# public_demo roots are asserted to stay byte-identical throughout.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/ops/release/recover-production-candidate-skew.sh"
REAL_CONF="$ROOT/ops/config/runtime-environments/production.conf"

FAILED=0
pass() { echo "PASS $*"; }
fail() { echo "FAIL $*"; FAILED=$((FAILED + 1)); }

TMP="$(cd "$(mktemp -d /tmp/wr-prod-skew-recovery-XXXXXX)" && pwd -P)"
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
OLD_APP_SHA="0000000000000000000000000000000000000000"
HELPER_SHA="2222222222222222222222222222222222222222"
# LIVE = what the containers actually run. PINNED = what the .env still says.
LIVE_BE_DIG="sha256:$(printf 'a%.0s' {1..64})"
LIVE_SF_DIG="sha256:$(printf 'b%.0s' {1..64})"
PIN_BE_DIG="sha256:$(printf 'c%.0s' {1..64})"
PIN_SF_DIG="sha256:$(printf 'd%.0s' {1..64})"
LIVE_BE_REF="ghcr.io/saintgroovie/woodright-backend@${LIVE_BE_DIG}"
LIVE_SF_REF="ghcr.io/saintgroovie/woodright-storefront@${LIVE_SF_DIG}"
PIN_BE_REF="ghcr.io/saintgroovie/woodright-backend@${PIN_BE_DIG}"
PIN_SF_REF="ghcr.io/saintgroovie/woodright-storefront@${PIN_SF_DIG}"
CONFIRM="I_UNDERSTAND_PRODUCTION_PIN_RUNTIME_SKEW_RECOVERY"
MEDIA_VOL="woodright-production_woodright-production_media"

mkdir -p "$BIN" "$STATE" "$PROFILES" "$COMPOSE_DIR" "$OWN_DIR" \
  "$SRV/locks/production" "$SRV/locks/public_demo" "$SRV/reports/production" \
  "$PD_OWN_DIR" "$PD_ID_DIR" "$SRV/runtime-identity-production"

sed -e "s#=/srv/#=${TMP}/srv/#g" -e "s#=/etc/dokploy/#=${TMP}/etc/dokploy/#g" \
  "$REAL_CONF" >"$CONF"
grep -q "WOODRIGHT_MUTATION_LOCK_PATH=${LOCK}$" "$CONF" \
  && pass "harness profile re-roots the production lock into TMP" \
  || fail "harness profile lock path not re-rooted"

printf 'services:\n  backend: {}\n  storefront: {}\n  postgres: {}\n  redis: {}\n' \
  >"$COMPOSE_DIR/docker-compose.yml"
: >"$LOCK"
: >"$PD_LOCK"

# shellcheck source=lib/woodright-production-fake-runtime.sh
source "$ROOT/scripts/ops/lib/woodright-production-fake-runtime.sh"
wr_fake_runtime_install "$BIN"

# --------------------------------------------------------------------------
# harness state helpers
# --------------------------------------------------------------------------
write_container() {
  local service="$1" digest="$2" host_ip="${3:-127.0.0.1}" traefik="${4:-0}" health="${5:-healthy}"
  python3 - "$STATE" "$service" "$digest" "$host_ip" "$traefik" "$health" <<'PY'
import json, os, sys
state, service, digest, host_ip, traefik, health = sys.argv[1:7]
name = f"woodright-production-{service}"
title = "woodright-backend" if service == "backend" else "woodright-storefront"
labels = {
    "com.woodright.deployment-owner": "Dokploy",
    "com.woodright.exposure": "private",
    "com.woodright.database-identity": "non_public_candidate_db",
    "org.opencontainers.image.title": title,
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
        "Health": {"Status": health},
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

# The skew fixture: pins name the previous pair, containers run the candidates.
reset_harness() {
  rm -rf "$STATE"
  mkdir -p "$STATE/containers" "$STATE/images" "$STATE/volumes" "$STATE/log" \
    "$STATE/health-ready-at" "$STATE/deployed"
  touch "$STATE/volumes/${MEDIA_VOL}.ok"
  write_container backend "$LIVE_BE_DIG"
  write_container storefront "$LIVE_SF_DIG"
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
  write_image "$LIVE_BE_REF" woodright-backend production_candidate "$APP_SHA"
  write_image "$LIVE_SF_REF" woodright-storefront production_candidate "$APP_SHA"
  # The pinned (previous) pair predates the build-profile label - deliberately
  # NOT production_candidate, to prove restore mode does not demand it.
  write_image "$PIN_BE_REF" woodright-backend "" "$OLD_APP_SHA"
  write_image "$PIN_SF_REF" woodright-storefront "" "$OLD_APP_SHA"

  mkdir -p "$COMPOSE_DIR"
  cat >"$ENV_FILE" <<EOF
# Dokploy compose environment (harness copy)
WOODRIGHT_BACKEND_IMAGE=${PIN_BE_REF}
WOODRIGHT_STOREFRONT_IMAGE=${PIN_SF_REF}
POSTGRES_PASSWORD=MOCK_SECRET_VALUE
UNRELATED_KEY=keep-me
EOF

  rm -rf "$OWN_DIR"
  mkdir -p "$OWN_DIR"
  printf '{"schema":"pre-existing","application_source_sha":"%s"}\n' "$OLD_APP_SHA" \
    >"$OWN_DIR/ACTIVE_RELEASE.json"

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
started_at_of() {
  WOODRIGHT_FAKE_DOCKER_STATE="$STATE" "$BIN/docker" inspect "$1" --format '{{.State.StartedAt}}' 2>/dev/null || true
}
state_file() { cat "$1/state.txt" 2>/dev/null || echo "<none>"; }

assert_public_demo_untouched() {
  local label="$1" now
  now="$(cat "$PD_OWN_DIR/ACTIVE_OWNER.json" "$PD_ID_DIR/ACTIVE_PUBLIC.json" "$PD_LOCK")"
  [[ "$now" == "$PD_CANARY" ]] && pass "$label: public_demo roots untouched" || fail "$label: public_demo roots changed"
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
    "WR_STAGING_MUTATION_LOCK_ALLOW_NONCANONICAL=1" \
    "WR_STAGING_MUTATION_LOCK_TIMEOUT_SEC=5" \
    "WOODRIGHT_CUTOVER_POLL_INTERVAL_SEC=1" \
    "WOODRIGHT_CUTOVER_READY_DEADLINE_SEC=8"
}

REFS=(
  --live-backend-ref "$LIVE_BE_REF"
  --live-storefront-ref "$LIVE_SF_REF"
  --pinned-backend-ref "$PIN_BE_REF"
  --pinned-storefront-ref "$PIN_SF_REF"
)

RC=0
# run_recovery <mode> <recovery-mode> <out> [extra env...] [-- extra args...]
run_recovery() {
  local mode="$1" recovery_mode="$2" out="$3"
  shift 3
  local -a envs=() extra_args=() line
  while IFS= read -r line; do envs+=("$line"); done < <(base_env)
  local seen_sep=0 a
  for a in "$@"; do
    if [[ "$a" == "--" ]]; then seen_sep=1; continue; fi
    if [[ "$seen_sep" == "1" ]]; then extra_args+=("$a"); else envs+=("$a"); fi
  done
  local -a mode_args=()
  if [[ "$mode" == "execute" ]]; then
    envs+=("WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION=1")
    mode_args=(--execute --confirm-mutation "$CONFIRM")
  else
    envs+=("WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION=0")
    mode_args=(--dry-run)
  fi
  set +e
  env "${envs[@]}" bash "$SCRIPT" \
    --environment production --recovery-mode "$recovery_mode" \
    --application-source-sha "$APP_SHA" "${REFS[@]}" \
    "${mode_args[@]}" "${extra_args[@]+"${extra_args[@]}"}" >"$out" 2>&1
  RC=$?
  set -e
}

# ==========================================================================
# 1) adopt-live-candidates dry-run: read-only, and the plan says "no restart"
# ==========================================================================
reset_harness
if command -v shasum >/dev/null 2>&1; then
  tree_hash() { find "$TMP/srv" "$TMP/etc" -type f -exec shasum -a 256 {} \; | sort; }
else
  tree_hash() { find "$TMP/srv" "$TMP/etc" -type f -exec sha256sum {} \; | sort; }
fi
BEFORE_TREE="$(tree_hash)"
run_recovery dry-run adopt-live-candidates "$TMP/out-adopt-dry.txt"
[[ "$RC" -eq 0 ]] && pass "adopt dry-run: exit 0" || { fail "adopt dry-run: rc=$RC"; sed -n '1,40p' "$TMP/out-adopt-dry.txt"; }
[[ "$BEFORE_TREE" == "$(tree_hash)" ]] && pass "adopt dry-run: zero writes under srv/ and etc/" || fail "adopt dry-run: filesystem changed"
[[ ! -f "$STATE/log/mutations.log" ]] && pass "adopt dry-run: no docker mutation" || fail "adopt dry-run: docker mutated"
lock_is_free "$LOCK" && pass "adopt dry-run: no lock held" || fail "adopt dry-run: lock held"
python3 - "$TMP/out-adopt-dry.txt" "$APP_SHA" "$HELPER_SHA" "$LIVE_BE_REF" "$PIN_BE_REF" <<'PY' \
  && pass "adopt dry-run: packet describes a pin-only convergence" || fail "adopt dry-run: packet fields"
import json, sys
# The capture interleaves the packet (stdout) with the helper's log lines
# (stderr), so decode just the first JSON document.
raw = open(sys.argv[1]).read()
packet, _ = json.JSONDecoder().raw_decode(raw[raw.index("{"):])
app, helper, live_be, pinned_be = sys.argv[2:6]
assert packet["mode"] == "dry-run", packet["mode"]
assert packet["recovery_mode"] == "adopt-live-candidates", packet
assert packet["application_source_sha"] == app
assert packet["helper_install_sha"] == helper
assert packet["application_source_sha"] != packet["helper_install_sha"]
assert packet["verification_mismatch"] is False, packet
assert packet["declared"]["live"]["backend"] == live_be
assert packet["declared"]["pinned"]["backend"] == pinned_be
assert packet["observed"]["runtime"]["backend"] == live_be
assert packet["observed"]["pins"]["backend"] == pinned_be
plan = packet["planned_mutation"]
assert plan["container_recreate_planned"] is False, plan
assert plan["StartedAt_expected_unchanged"] is True, plan
assert plan["converge_on"]["backend"] == live_be, plan
assert plan["recreate"]["order"] == [], plan
assert plan["no_pin_rollback_after_write"] is True, plan
assert "14" in plan["exit_codes"], plan
assert packet["no_mutation_performed"] is True
assert packet["no_pin_writes"] is True
PY
assert_public_demo_untouched "adopt dry-run"

# ==========================================================================
# 2) adopt-live-candidates execute: pins move, containers do not
# ==========================================================================
reset_harness
BE_ID_BEFORE="$(id_of woodright-production-backend)"
SF_ID_BEFORE="$(id_of woodright-production-storefront)"
BE_START_BEFORE="$(started_at_of woodright-production-backend)"
EV="$TMP/ev-adopt"
run_recovery execute adopt-live-candidates "$TMP/out-adopt.txt" "WOODRIGHT_EVIDENCE_DIR=$EV"
[[ "$RC" -eq 0 ]] && pass "adopt execute: exit 0" || { fail "adopt execute: rc=$RC"; sed -n '1,60p' "$TMP/out-adopt.txt"; }
[[ "$(state_file "$EV")" == "recovery_committed" ]] && pass "adopt execute: state recovery_committed" || fail "adopt execute: state=$(state_file "$EV")"
[[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$LIVE_BE_REF" ]] && pass "adopt execute: backend pin adopted the live ref" || fail "adopt execute: backend pin=$(pin_of WOODRIGHT_BACKEND_IMAGE)"
[[ "$(pin_of WOODRIGHT_STOREFRONT_IMAGE)" == "$LIVE_SF_REF" ]] && pass "adopt execute: storefront pin adopted the live ref" || fail "adopt execute: storefront pin"
[[ "$(pin_of UNRELATED_KEY)" == "keep-me" ]] && pass "adopt execute: unrelated compose keys preserved" || fail "adopt execute: unrelated key lost"
[[ ! -f "$STATE/log/mutations.log" ]] && pass "adopt execute: no container was recreated" || fail "adopt execute: docker mutated ($(cat "$STATE/log/mutations.log"))"
[[ "$(id_of woodright-production-backend)" == "$BE_ID_BEFORE" ]] && pass "adopt execute: backend container id unchanged" || fail "adopt execute: backend id changed"
[[ "$(id_of woodright-production-storefront)" == "$SF_ID_BEFORE" ]] && pass "adopt execute: storefront container id unchanged" || fail "adopt execute: storefront id changed"
[[ "$(started_at_of woodright-production-backend)" == "$BE_START_BEFORE" ]] && pass "adopt execute: StartedAt unchanged (zero buyer-visible restart)" || fail "adopt execute: StartedAt moved"
EXPECTED_STATES=$'prepared\npins_written\nmetadata_written\nrecovery_committed'
ACTUAL_STATES="$(awk '{print $2}' "$EV/state-transitions.log" | awk '!seen[$0]++')"
[[ "$ACTUAL_STATES" == "$EXPECTED_STATES" ]] \
  && pass "adopt execute: state machine prepared->pins->metadata->committed" \
  || fail "adopt execute: state order = $(echo "$ACTUAL_STATES" | tr '\n' ',')"
python3 - "$OWN_DIR" "$APP_SHA" "$HELPER_SHA" "$LIVE_BE_REF" "$LIVE_SF_REF" <<'PY' \
  && pass "adopt execute: ownership metadata describes the adopted pair" || fail "adopt execute: ownership metadata"
import json, os, sys
own, app, helper, be, sf = sys.argv[1:6]
for name in ("ACTIVE_OWNER.json", "EXPECTED_RELEASE.json", "ACTIVE_RELEASE.json"):
    doc = json.load(open(os.path.join(own, name)))
    assert doc["application_source_sha"] == app, (name, doc)
    assert doc["helper_install_sha"] == helper, (name, doc)
    assert doc["environment"] == "production", (name, doc)
    assert doc["public_exposure"] == "private", (name, doc)
expected = json.load(open(os.path.join(own, "EXPECTED_RELEASE.json")))
assert expected["backend_image"] == be and expected["storefront_image"] == sf, expected
assert expected["backend_digest"] == be.split("@")[-1], expected
active = json.load(open(os.path.join(own, "ACTIVE_RELEASE.json")))
assert active["backend_image"] == be and active["storefront_image"] == sf, active
assert active["recovery_mode"] == "adopt-live-candidates", active
assert active["state"] == "committed", active
PY
grep -q 'converged backend pin==runtime==' "$TMP/out-adopt.txt" \
  && pass "adopt execute: convergence was verified, not assumed" || fail "adopt execute: no convergence proof"
[[ -f "$EV/pin-backup/dokploy-compose.env" ]] && pass "adopt execute: pin file backed up before the write" || fail "adopt execute: no pin backup"
[[ -f "$EV/json/freeze.json" ]] && pass "adopt execute: runtime frozen under the lock" || fail "adopt execute: no freeze evidence"
lock_is_free "$LOCK" && pass "adopt execute: lock released" || fail "adopt execute: lock still held"
if grep -rl 'MOCK_SECRET_VALUE' "$EV" 2>/dev/null | grep -v '/pin-backup/' | grep -q .; then
  fail "adopt execute: secret material leaked outside the pin backup"
else
  pass "adopt execute: no secret material outside the pin backup"
fi
assert_public_demo_untouched "adopt execute"

# ==========================================================================
# 3) adopt refuses when the declared live ref is not what is running
# ==========================================================================
reset_harness
write_container backend "$PIN_BE_DIG"   # backend actually runs the OLD image
run_recovery dry-run adopt-live-candidates "$TMP/out-adopt-wrongdigest.txt"
[[ "$RC" -eq 4 ]] && pass "adopt wrong digest: dry-run mismatch exit 4" || fail "adopt wrong digest: rc=$RC"
grep -q 'does not match --live-backend-ref' "$TMP/out-adopt-wrongdigest.txt" \
  && pass "adopt wrong digest: names the disagreement" || fail "adopt wrong digest: not named"
run_recovery execute adopt-live-candidates "$TMP/out-adopt-wrongdigest-exec.txt"
[[ "$RC" -eq 2 ]] && pass "adopt wrong digest: execute refuses with exit 2" || fail "adopt wrong digest execute: rc=$RC"
[[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$PIN_BE_REF" ]] && pass "adopt wrong digest: pins untouched" || fail "adopt wrong digest: pins changed"
lock_is_free "$LOCK" && pass "adopt wrong digest: lock released" || fail "adopt wrong digest: lock held"

# ==========================================================================
# 4) adopt refuses an unhealthy runtime
# ==========================================================================
reset_harness
write_container storefront "$LIVE_SF_DIG" 127.0.0.1 0 unhealthy
run_recovery execute adopt-live-candidates "$TMP/out-adopt-unhealthy.txt"
[[ "$RC" -eq 2 ]] && pass "adopt unhealthy: refused with exit 2" || fail "adopt unhealthy: rc=$RC"
grep -q 'is not running+healthy' "$TMP/out-adopt-unhealthy.txt" \
  && pass "adopt unhealthy: reported" || fail "adopt unhealthy: not reported"
[[ "$(pin_of WOODRIGHT_STOREFRONT_IMAGE)" == "$PIN_SF_REF" ]] && pass "adopt unhealthy: pins untouched" || fail "adopt unhealthy: pins changed"

# ==========================================================================
# 5) adopt refuses images whose OCI revision is not the declared release
# ==========================================================================
reset_harness
write_image "$LIVE_BE_REF" woodright-backend production_candidate "9999999999999999999999999999999999999999"
run_recovery execute adopt-live-candidates "$TMP/out-adopt-wrongoci.txt"
[[ "$RC" -eq 2 ]] && pass "adopt wrong OCI revision: refused with exit 2" || fail "adopt wrong OCI: rc=$RC"
grep -q 'oci_revision' "$TMP/out-adopt-wrongoci.txt" && pass "adopt wrong OCI revision: reported" || fail "adopt wrong OCI: not reported"

# a live image built under the wrong profile is refused as well
reset_harness
write_image "$LIVE_SF_REF" woodright-storefront public_demo "$APP_SHA"
run_recovery execute adopt-live-candidates "$TMP/out-adopt-wrongprofile.txt"
[[ "$RC" -eq 2 ]] && pass "adopt wrong build profile: refused with exit 2" || fail "adopt wrong profile: rc=$RC"
grep -q 'build_profile' "$TMP/out-adopt-wrongprofile.txt" && pass "adopt wrong build profile: reported" || fail "adopt wrong profile: not reported"

# ==========================================================================
# 6) adopt refuses a publicly bound container
# ==========================================================================
reset_harness
write_container storefront "$LIVE_SF_DIG" "0.0.0.0"
run_recovery execute adopt-live-candidates "$TMP/out-adopt-publicbind.txt"
[[ "$RC" -eq 2 ]] && pass "adopt public bind: refused with exit 2" || fail "adopt public bind: rc=$RC"
grep -q 'PUBLIC_BIND' "$TMP/out-adopt-publicbind.txt" && pass "adopt public bind: reported" || fail "adopt public bind: not reported"
[[ ! -f "$STATE/log/mutations.log" ]] && pass "adopt public bind: nothing mutated" || fail "adopt public bind: mutated"

# public Traefik exposure is equally disqualifying
reset_harness
write_container storefront "$LIVE_SF_DIG" "127.0.0.1" 1
run_recovery execute adopt-live-candidates "$TMP/out-adopt-traefik.txt"
[[ "$RC" -eq 2 ]] && pass "adopt public traefik: refused with exit 2" || fail "adopt public traefik: rc=$RC"
grep -q 'PUBLIC_EXPOSURE' "$TMP/out-adopt-traefik.txt" && pass "adopt public traefik: reported" || fail "adopt public traefik: not reported"

# ==========================================================================
# 7) adopt: metadata write fails after the pins moved
#    -> recovery_incomplete (14), and the stale pins are NOT put back
# ==========================================================================
reset_harness
EV="$TMP/ev-adopt-meta"
run_recovery execute adopt-live-candidates "$TMP/out-adopt-meta.txt" \
  "WOODRIGHT_EVIDENCE_DIR=$EV" "WOODRIGHT_RECOVERY_FAULT=metadata_write"
[[ "$RC" -eq 14 ]] && pass "adopt metadata failure: exit 14" || fail "adopt metadata failure: rc=$RC"
[[ "$(state_file "$EV")" == "recovery_incomplete" ]] && pass "adopt metadata failure: state recovery_incomplete" \
  || fail "adopt metadata failure: state=$(state_file "$EV")"
[[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$LIVE_BE_REF" ]] \
  && pass "adopt metadata failure: pins stay on the live refs (no re-skew)" || fail "adopt metadata failure: pins reverted"
grep -q 'pre-existing' "$OWN_DIR/ACTIVE_RELEASE.json" \
  && pass "adopt metadata failure: previous ACTIVE_RELEASE left intact" || fail "adopt metadata failure: ACTIVE_RELEASE clobbered"
grep -q 'RECOVERY_INCOMPLETE' "$TMP/out-adopt-meta.txt" \
  && pass "adopt metadata failure: never claims success" || fail "adopt metadata failure: no explicit report"
[[ ! -f "$STATE/log/mutations.log" ]] && pass "adopt metadata failure: still no container recreated" || fail "adopt metadata failure: docker mutated"
lock_is_free "$LOCK" && pass "adopt metadata failure: lock released" || fail "adopt metadata failure: lock held"

# ==========================================================================
# 7b) adopt: pin install fails before publication
#     -> failed_before_mutation (NOT recovery_incomplete), stale pins untouched
# ==========================================================================
reset_harness
EV="$TMP/ev-adopt-pinfail"
run_recovery execute adopt-live-candidates "$TMP/out-adopt-pinfail.txt" \
  "WOODRIGHT_EVIDENCE_DIR=$EV" "WOODRIGHT_RECOVERY_FAULT=pin_write"
[[ "$RC" -eq 2 || "$RC" -eq 1 ]] && pass "adopt pin install failure: non-zero exit" \
  || fail "adopt pin install failure: rc=$RC"
# Must NOT claim recovery_incomplete / "pins now describe the runtime"
if grep -q 'RECOVERY_INCOMPLETE\|pins now describe the runtime' "$TMP/out-adopt-pinfail.txt"; then
  fail "adopt pin install failure: falsely claimed recovery_incomplete with pins published"
else
  pass "adopt pin install failure: did not claim pins describe the runtime"
fi
[[ "$(state_file "$EV")" == "failed_before_mutation" || "$(state_file "$EV")" == "pins_written" ]] \
  && pass "adopt pin install failure: state is pre-publication ($(state_file "$EV"))" \
  || fail "adopt pin install failure: unexpected state=$(state_file "$EV")"
# If state is pins_written from the armed phase but install failed, pins must still be stale.
[[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$PIN_BE_REF" ]] \
  && pass "adopt pin install failure: stale pins unchanged" || fail "adopt pin install failure: pins moved"
[[ "$(pin_of WOODRIGHT_STOREFRONT_IMAGE)" == "$PIN_SF_REF" ]] \
  && pass "adopt pin install failure: storefront pin unchanged" || fail "adopt pin install failure: SF pin moved"
[[ ! -f "$STATE/log/mutations.log" ]] && pass "adopt pin install failure: no container recreate" \
  || fail "adopt pin install failure: docker mutated"
lock_is_free "$LOCK" && pass "adopt pin install failure: lock released" || fail "adopt pin install failure: lock held"

# ==========================================================================
# 7c) adopt: pin file published (PINS_INSTALLED=1), then intentional post-flag fault
#     -> recovery_incomplete / exit 14 via PINS_INSTALLED authority (not failed_before_mutation)
# ==========================================================================
reset_harness
EV="$TMP/ev-adopt-pinafter"
run_recovery execute adopt-live-candidates "$TMP/out-adopt-pinafter.txt" \
  "WOODRIGHT_EVIDENCE_DIR=$EV" "WOODRIGHT_RECOVERY_FAULT=pin_install_after_publish"
[[ "$RC" -eq 14 ]] && pass "adopt pin-after-publish fault: exit 14" || fail "adopt pin-after-publish fault: rc=$RC"
[[ "$(state_file "$EV")" == "recovery_incomplete" ]] && pass "adopt pin-after-publish fault: state recovery_incomplete" \
  || fail "adopt pin-after-publish fault: state=$(state_file "$EV")"
[[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$LIVE_BE_REF" ]] \
  && pass "adopt pin-after-publish fault: pins stay on live refs" || fail "adopt pin-after-publish fault: pins wrong"
grep -q 'RECOVERY_INCOMPLETE' "$TMP/out-adopt-pinafter.txt" \
  && pass "adopt pin-after-publish fault: explicit incomplete report" || fail "adopt pin-after-publish fault: no report"
[[ ! -f "$STATE/log/mutations.log" ]] && pass "adopt pin-after-publish fault: no container recreate" \
  || fail "adopt pin-after-publish fault: docker mutated"
lock_is_free "$LOCK" && pass "adopt pin-after-publish fault: lock released" || fail "adopt pin-after-publish fault: lock held"

# restore-pinned: pin_write before install must NOT claim recovery_incomplete
# merely because pins already equal the recovery targets.
reset_harness
EV="$TMP/ev-restore-pinfail"
run_recovery execute restore-pinned-runtime "$TMP/out-restore-pinfail.txt" \
  "WOODRIGHT_EVIDENCE_DIR=$EV" "WOODRIGHT_RECOVERY_FAULT=pin_write"
[[ "$RC" -ne 0 ]] && pass "restore pin_write before install: non-zero" || fail "restore pin_write: unexpected 0"
[[ "$(state_file "$EV")" == "failed_before_mutation" ]] \
  && pass "restore pin_write before install: failed_before_mutation (not incomplete)" \
  || fail "restore pin_write: state=$(state_file "$EV")"
if grep -q 'RECOVERY_INCOMPLETE\|pins now describe the runtime' "$TMP/out-restore-pinfail.txt"; then
  fail "restore pin_write: falsely claimed recovery_incomplete"
else
  pass "restore pin_write: did not claim pins describe the runtime"
fi
[[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$PIN_BE_REF" ]] \
  && pass "restore pin_write: pins unchanged" || fail "restore pin_write: pins changed"
lock_is_free "$LOCK" && pass "restore pin_write: lock released" || fail "restore pin_write: lock held"

# ==========================================================================
# 8) restore-pinned-runtime: runtime is recreated onto the pinned pair
# ==========================================================================
reset_harness
EV="$TMP/ev-restore"
run_recovery execute restore-pinned-runtime "$TMP/out-restore.txt" "WOODRIGHT_EVIDENCE_DIR=$EV"
[[ "$RC" -eq 0 ]] && pass "restore: exit 0" || { fail "restore: rc=$RC"; sed -n '1,60p' "$TMP/out-restore.txt"; }
[[ "$(state_file "$EV")" == "recovery_committed" ]] && pass "restore: state recovery_committed" || fail "restore: state=$(state_file "$EV")"
[[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$PIN_BE_REF" ]] && pass "restore: backend pin stays the pinned ref" || fail "restore: backend pin"
[[ "$(digest_of woodright-production-backend)" == "$PIN_BE_DIG" ]] && pass "restore: backend runtime is back on the pinned digest" || fail "restore: backend digest"
[[ "$(digest_of woodright-production-storefront)" == "$PIN_SF_DIG" ]] && pass "restore: storefront runtime is back on the pinned digest" || fail "restore: storefront digest"
JOURNAL="$(cat "$STATE/log/journal.log")"
[[ "$JOURNAL" == $'compose_up backend\ncompose_up storefront' ]] \
  && pass "restore: backend recreated before storefront, nothing else touched" \
  || fail "restore: mutation order = $(echo "$JOURNAL" | tr '\n' '|')"
grep -qE 'compose_up backend .*force=1' "$STATE/log/mutations.log" \
  && pass "restore: recreate is forced so Compose cannot call it up to date" || fail "restore: not force-recreated"
if grep -qE 'postgres|redis' "$STATE/log/mutations.log"; then
  fail "restore: postgres/redis were touched"
else
  pass "restore: postgres/redis never recreated"
fi
python3 - "$OWN_DIR" "$PIN_BE_REF" "$PIN_SF_REF" <<'PY' \
  && pass "restore: ownership metadata describes the pinned pair" || fail "restore: ownership metadata"
import json, os, sys
own, be, sf = sys.argv[1:4]
active = json.load(open(os.path.join(own, "ACTIVE_RELEASE.json")))
assert active["backend_image"] == be and active["storefront_image"] == sf, active
assert active["recovery_mode"] == "restore-pinned-runtime", active
PY
lock_is_free "$LOCK" && pass "restore: lock released" || fail "restore: lock held"
assert_public_demo_untouched "restore"

# restore mode does not require the old images to carry production_candidate
grep -q 'build_profile' "$TMP/out-restore.txt" \
  && fail "restore: demanded a build profile from the rollback images" \
  || pass "restore: rollback images are accepted on digest authority alone"

# ==========================================================================
# 9) restore-pinned-runtime: recreate fails -> exit 15, never a false success
# ==========================================================================
reset_harness
EV="$TMP/ev-restore-fail"
run_recovery execute restore-pinned-runtime "$TMP/out-restore-fail.txt" \
  "WOODRIGHT_EVIDENCE_DIR=$EV" "WOODRIGHT_FAKE_COMPOSE_FAIL=backend"
[[ "$RC" -eq 15 ]] && pass "restore failure: exit 15" || fail "restore failure: rc=$RC"
[[ "$(state_file "$EV")" == "recovery_incomplete" ]] && pass "restore failure: state recovery_incomplete" \
  || fail "restore failure: state=$(state_file "$EV")"
grep -q 'RECOVERY_RUNTIME_RESTORE_FAILED' "$TMP/out-restore-fail.txt" \
  && pass "restore failure: reported explicitly" || fail "restore failure: not reported"
[[ ! -f "$OWN_DIR/ACTIVE_OWNER.json" ]] && pass "restore failure: no ownership metadata published" || fail "restore failure: ACTIVE_OWNER written"
[[ "$(digest_of woodright-production-backend)" == "$LIVE_BE_DIG" ]] \
  && pass "restore failure: runtime is provably still the candidate" || fail "restore failure: backend digest"
lock_is_free "$LOCK" && pass "restore failure: lock released" || fail "restore failure: lock held"

# ==========================================================================
# 10) the recovery helper takes the same lock as the cutover helper
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
run_recovery execute adopt-live-candidates "$TMP/out-lock.txt" "WR_STAGING_MUTATION_LOCK_TIMEOUT_SEC=2"
[[ "$RC" -eq 3 ]] && pass "lock contention: blocked with exit 3" || fail "lock contention: rc=$RC"
[[ "$(pin_of WOODRIGHT_BACKEND_IMAGE)" == "$PIN_BE_REF" ]] && pass "lock contention: pins untouched" || fail "lock contention: pins changed"
[[ ! -f "$STATE/log/mutations.log" ]] && pass "lock contention: nothing mutated while blocked" || fail "lock contention: mutated"
kill "$HOLD_PID" 2>/dev/null || true
wait "$HOLD_PID" 2>/dev/null || true

# ==========================================================================
# 11) refusals: non-production environments, bad tokens, mutable refs
# ==========================================================================
reset_harness
for bad in public_demo staging; do
  ENVS=()
  while IFS= read -r line; do ENVS+=("$line"); done < <(base_env)
  ENVS+=("WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION=0")
  set +e
  env "${ENVS[@]}" bash "$SCRIPT" --environment "$bad" \
    --recovery-mode adopt-live-candidates --application-source-sha "$APP_SHA" \
    "${REFS[@]}" --execute --confirm-mutation "$CONFIRM" >"$TMP/out-badenv.txt" 2>&1
  RC=$?
  set -e
  [[ "$RC" -ne 0 ]] && pass "refusal: --environment $bad rejected" || fail "refusal: --environment $bad accepted"
done
lock_is_free "$PD_LOCK" && pass "refusal: public_demo lock never taken" || fail "refusal: public_demo lock held"

ENVS=()
while IFS= read -r line; do ENVS+=("$line"); done < <(base_env)
ENVS+=("WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION=0")
set +e
env "${ENVS[@]}" bash "$SCRIPT" --environment production \
  --recovery-mode adopt-live-candidates --application-source-sha "$APP_SHA" \
  "${REFS[@]}" --execute >"$TMP/out-noconfirm.txt" 2>&1
RC=$?
set -e
[[ "$RC" -eq 2 ]] && pass "refusal: execute without the confirm token rejected" || fail "refusal: missing token rc=$RC"

set +e
env "${ENVS[@]}" bash "$SCRIPT" --environment production \
  --recovery-mode adopt-live-candidates --application-source-sha "$APP_SHA" \
  "${REFS[@]}" --execute --confirm-mutation WRONG >"$TMP/out-badtoken.txt" 2>&1
RC=$?
set -e
[[ "$RC" -eq 2 ]] && pass "refusal: wrong confirm token rejected" || fail "refusal: wrong token rc=$RC"

set +e
env "${ENVS[@]}" bash "$SCRIPT" --environment production \
  --recovery-mode adopt-live-candidates --application-source-sha "$APP_SHA" \
  --live-backend-ref "ghcr.io/saintgroovie/woodright-backend:latest" \
  --live-storefront-ref "$LIVE_SF_REF" \
  --pinned-backend-ref "$PIN_BE_REF" --pinned-storefront-ref "$PIN_SF_REF" \
  --dry-run >"$TMP/out-mutable.txt" 2>&1
RC=$?
set -e
[[ "$RC" -eq 2 ]] && pass "refusal: mutable tag fails closed" || fail "refusal: mutable tag rc=$RC"

set +e
env "${ENVS[@]}" bash "$SCRIPT" --environment production \
  --recovery-mode adopt-live-candidates --application-source-sha "abc1234" \
  "${REFS[@]}" --dry-run >"$TMP/out-shortsha.txt" 2>&1
RC=$?
set -e
[[ "$RC" -eq 2 ]] && pass "refusal: short application SHA fails closed" || fail "refusal: short sha rc=$RC"

set +e
env "${ENVS[@]}" bash "$SCRIPT" --environment production \
  --recovery-mode rewrite-everything --application-source-sha "$APP_SHA" \
  "${REFS[@]}" --dry-run >"$TMP/out-badmode.txt" 2>&1
RC=$?
set -e
[[ "$RC" -eq 2 ]] && pass "refusal: unknown --recovery-mode rejected" || fail "refusal: bad recovery mode rc=$RC"

set +e
env "${ENVS[@]}" bash "$SCRIPT" --environment production \
  --recovery-mode adopt-live-candidates --application-source-sha "$APP_SHA" \
  "${REFS[@]}" --dry-run --execute --confirm-mutation "$CONFIRM" >"$TMP/out-bothmodes.txt" 2>&1
RC=$?
set -e
[[ "$RC" -eq 2 ]] && pass "refusal: --dry-run with --execute rejected" || fail "refusal: both modes rc=$RC"
[[ ! -f "$STATE/log/mutations.log" ]] && pass "refusal: no refusal path mutated anything" || fail "refusal: something mutated"

# lock path outside /locks/production/ is refused
BADLOCK_DIR="$TMP/profiles-badlock"
mkdir -p "$BADLOCK_DIR"
sed "s#WOODRIGHT_MUTATION_LOCK_PATH=.*#WOODRIGHT_MUTATION_LOCK_PATH=$SRV/locks/public_demo/live-cutover.lock#" \
  "$CONF" >"$BADLOCK_DIR/production.conf"
ENVS=()
while IFS= read -r line; do ENVS+=("$line"); done < <(base_env)
ENVS+=("WOODRIGHT_ENV_PROFILE_DIR=$BADLOCK_DIR" "WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION=0")
set +e
env "${ENVS[@]}" bash "$SCRIPT" --environment production \
  --recovery-mode adopt-live-candidates --application-source-sha "$APP_SHA" \
  "${REFS[@]}" --execute --confirm-mutation "$CONFIRM" >"$TMP/out-badlock.txt" 2>&1
RC=$?
set -e
[[ "$RC" -eq 2 ]] && pass "refusal: non-production lock path rejected" || fail "refusal: bad lock rc=$RC"
grep -q 'locks/production/live-cutover.lock' "$TMP/out-badlock.txt" \
  && pass "refusal: names the only allowed lock" || fail "refusal: lock message"
lock_is_free "$PD_LOCK" && pass "refusal: public_demo lock still untouched" || fail "refusal: public_demo lock held"

# ==========================================================================
# 12) static contract checks
# ==========================================================================
grep -q '^# LIVE_MUTATING=true' "$SCRIPT" && pass "static: header declares LIVE_MUTATING=true" || fail "static: LIVE_MUTATING header"
grep -q '^# requires_global_lock=true' "$SCRIPT" && pass "static: header declares requires_global_lock=true" || fail "static: requires_global_lock header"
grep -q '/srv/woodright/locks/production/live-cutover.lock' "$SCRIPT" \
  && pass "static: names the canonical production lock" || fail "static: canonical lock path"
grep -q 'wr_staging_mutation_lock_acquire' "$SCRIPT" && pass "static: uses the shared flock helper" || fail "static: lock helper"
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
grep -q 'ops/release/recover-production-candidate-skew.sh' "$ROOT/ops/release/install-environment-governance.sh" \
  && pass "static: the installer ships this helper" || fail "static: helper missing from the installer"
grep -q 'recover-production-candidate-skew.sh' "$ROOT/docs/operator/production-candidate-rollback.md" \
  && pass "static: the operator doc points at this helper" || fail "static: operator doc reference"
node "$ROOT/scripts/release/check-global-lock-policy.cjs" ops/release >/dev/null 2>&1 \
  && pass "static: global lock policy passes for ops/release" || fail "static: global lock policy"

if [[ "$FAILED" -eq 0 ]]; then
  echo "OK production-candidate skew recovery fidelity"
  exit 0
fi
echo "FAILED count=$FAILED"
exit 1
