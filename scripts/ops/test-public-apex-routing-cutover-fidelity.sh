#!/usr/bin/env bash
# Fidelity tests for ops/release/cutover-public-apex-routing.sh
# Fake docker/dig/filesystem only. No VM, DNS, or Traefik mutation.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/ops/release/cutover-public-apex-routing.sh"
REAL_CONF="$ROOT/ops/config/runtime-environments/public_production.conf"
TMPL="$ROOT/ops/config/public-launch/traefik-public-production.yml"

FAILED=0
pass() { echo "PASS $*"; }
fail() { echo "FAIL $*"; FAILED=$((FAILED + 1)); }

TMP_RAW="$(mktemp -d "${TMPDIR:-/tmp}/wr-apex-routing-XXXXXX")" || {
  echo "FAIL mktemp for apex routing harness" >&2
  exit 1
}
TMP="$(cd "$TMP_RAW" && pwd -P)"
case "$TMP" in
  *wr-apex-routing*)
    if [[ "$TMP" == "$ROOT" || "$TMP" == "/" || -z "$TMP" ]]; then
      echo "FAIL harness TMP resolved to unsafe path: $TMP" >&2
      exit 1
    fi
    ;;
  *)
    echo "FAIL harness TMP missing wr-apex-routing prefix: $TMP" >&2
    exit 1
    ;;
esac
cleanup() {
  case "${TMP:-}" in
    *wr-apex-routing*)
      if [[ "$TMP" == "$ROOT" || "$TMP" == "/" ]]; then
        echo "cleanup refused unsafe path: $TMP" >&2
        return 1
      fi
      if [[ "$FAILED" -eq 0 ]]; then
        rm -rf "$TMP"
      else
        echo "harness kept for inspection: $TMP"
      fi
      ;;
    *)
      echo "cleanup refused unexpected TMP=${TMP:-empty}" >&2
      ;;
  esac
}
trap cleanup EXIT

BIN="$TMP/bin"
STATE="$TMP/state"
PROFILES="$TMP/profiles"
SRV="$TMP/srv/woodright"
TRAEFIK_DIR="$TMP/etc/dokploy/traefik/dynamic"
COMPOSE_DIR="$TMP/etc/dokploy/compose/woodright-public-production/code"
CONF="$PROFILES/public_production.conf"
LOCK="$SRV/locks/public_production/apex-routing.lock"
TARGET="$TRAEFIK_DIR/woodright-public-production.yml"
DEMO="$TRAEFIK_DIR/woodright-demo.yml"
APPROVAL="$SRV/meta/public_production/OWNER_APPROVED_APEX_LAUNCH.json"

SHA="ced25101f71f34caf98b62d1e7855be4f91ef977"
SF_DIG="sha256:39b244717c45249971cb55c7c702a2bbb9fad48a2d0fa7c5d55fca39ade05b9c"
BE_DIG="sha256:8f097c9d9f82a6cf79e9ee970ac96aed1577e37d75275e027cc0cef0ca845339"
CONFIRM="I_UNDERSTAND_PUBLIC_APEX_ROUTING_CUTOVER"

mkdir -p "$BIN" "$STATE" "$PROFILES" "$TRAEFIK_DIR" "$COMPOSE_DIR" \
  "$SRV/locks/public_production" "$SRV/meta/public_production" \
  "$SRV/reports/public_production" "$SRV/runtime-ownership-public-production"

sed -e "s#=/srv/#=${SRV}/#g" -e "s#=/etc/dokploy/#=${TMP}/etc/dokploy/#g" \
  "$REAL_CONF" >"$CONF"

cat >"$DEMO" <<'EOF'
http:
  routers:
    woodright-sf-https:
      rule: Host(`woodright-demo.ru`)
EOF

write_approval() {
  cat >"$APPROVAL" <<EOF
{
  "schema": "woodright.public_production.apex_launch_approval.v1",
  "token": "OWNER_APPROVE_WOODRIGHT_APEX_LAUNCH_CED2510",
  "environment": "public_production",
  "application_source_sha": "$SHA",
  "storefront_digest": "$SF_DIG",
  "backend_digest": "$BE_DIG"
}
EOF
}

cat >"$BIN/docker" <<'PY'
#!/usr/bin/env python3
import json, os, sys
state = os.environ["WR_FAKE_DOCKER_STATE"]
st = json.load(open(state))
args = sys.argv[1:]
def save():
    json.dump(st, open(os.environ["WR_FAKE_DOCKER_STATE"], "w"), indent=2)

if args[:1] == ["inspect"]:
    fmt = ""
    name = ""
    i = 1
    while i < len(args):
        if args[i] == "--format":
            fmt = args[i + 1]
            i += 2
            continue
        name = args[i]
        i += 1
    c = st["containers"].get(name)
    if not c:
        sys.exit(1)
    if "Config.Image" in fmt:
        print(c["image"])
    elif "RestartCount" in fmt:
        print(c.get("restarts", 0))
    elif "release-sha" in fmt:
        print(c["sha"])
    elif "Health.Status" in fmt:
        print(c["health"])
    elif "Networks" in fmt:
        for n in c.get("networks", []):
            print(n)
    else:
        print("")
    sys.exit(0)

if args[:2] == ["network", "connect"]:
    net, name = args[2], args[3]
    c = st["containers"][name]
    if net in c.get("networks", []):
        print(f"Error: endpoint with name {name} already exists", file=sys.stderr)
        sys.exit(1)
    c.setdefault("networks", []).append(net)
    st.setdefault("mutations", []).append(f"connect {name} {net}")
    save()
    sys.exit(0)

if args[:2] == ["network", "disconnect"]:
    net, name = args[2], args[3]
    fail_name = os.environ.get("WR_FAKE_DOCKER_DISCONNECT_FAIL", "")
    if fail_name and name == fail_name:
        print(f"Error: injected disconnect failure for {name}", file=sys.stderr)
        sys.exit(1)
    c = st["containers"].get(name)
    if not c:
        print(f"Error: No such container: {name}", file=sys.stderr)
        sys.exit(1)
    if net not in c.get("networks", []):
        print(
            f"Error response from daemon: container {name} is not connected to the network {net}",
            file=sys.stderr,
        )
        sys.exit(1)
    c["networks"] = [n for n in c.get("networks") if n != net]
    st.setdefault("mutations", []).append(f"disconnect {name} {net}")
    save()
    sys.exit(0)

print("unexpected docker", args, file=sys.stderr)
sys.exit(99)
PY
chmod +x "$BIN/docker"

init_state() {
  python3 - "$STATE/docker.json" "$SHA" "$SF_DIG" "$BE_DIG" <<'PY'
import json, sys
path, sha, sf, be = sys.argv[1:5]
json.dump({
  "mutations": [],
  "containers": {
    "woodright-public-production-storefront": {
      "image": f"ghcr.io/saintgroovie/woodright-storefront@{sf}",
      "sha": sha, "health": "healthy", "restarts": 0, "networks": []
    },
    "woodright-public-production-backend": {
      "image": f"ghcr.io/saintgroovie/woodright-backend@{be}",
      "sha": sha, "health": "healthy", "restarts": 0, "networks": []
    }
  }
}, open(path, "w"), indent=2)
PY
}

export PATH="$BIN:$PATH"
export WR_FAKE_DOCKER_STATE="$STATE/docker.json"
export WOODRIGHT_ENV_PROFILE_DIR="$PROFILES"
export WOODRIGHT_APEX_TRAEFIK_FILE="$TARGET"
export WOODRIGHT_DEMO_TRAEFIK_FILE="$DEMO"
export WOODRIGHT_APEX_LOCK_PATH="$LOCK"
export WOODRIGHT_APEX_EVIDENCE_DIR="$TMP/evidence"
export WOODRIGHT_APEX_SKIP_FLOCK=1
export WOODRIGHT_APEX_SKIP_HTTP_PROBE=1
export WOODRIGHT_APEX_OWNED_STATE="$SRV/meta/public_production/APEX_ROUTING_OWNED.json"
export WOODRIGHT_FAKE_DIG_A='{"woodright.ru":"79.133.175.43","www.woodright.ru":"79.133.175.43","api.woodright.ru":""}'

run() {
  env WOODRIGHT_ENVIRONMENT=public_production \
    bash "$SCRIPT" --environment public_production "$@"
}

init_state

# template safety
grep -q 'Host(`admin.woodright.ru`)' "$TMPL" && fail "template publishes admin" || pass "template has no admin host"
grep -q 'woodright-demo.ru' "$TMPL" && fail "template includes demo" || pass "template has no demo host"
grep -q 'woodright-public-production-storefront:3002' "$TMPL" || fail "template missing SF upstream"
grep -q 'woodright-prod-buyer-noindex' "$TMPL" && fail "buyer noindex leaked" || pass "no buyer noindex"
grep -Fq 'Host(`woodright.ru`)' "$TMPL" && pass "template Host apex" || fail "template missing Host(woodright.ru)"
grep -Fq 'Host(`www.woodright.ru`)' "$TMPL" && pass "template Host www" || fail "template missing Host(www.woodright.ru)"
grep -Fq 'Host(`api.woodright.ru`)' "$TMPL" && pass "template Host api" || fail "template missing Host(api.woodright.ru)"
grep -Fq 'replacement: "https://woodright.ru/${1}"' "$TMPL" && pass "template www→apex HTTPS replacement" \
  || fail "template missing www→apex replacement"
grep -q 'redirect-to-https' "$TMPL" && pass "template HTTP→HTTPS middleware" || fail "template missing redirect-to-https"
grep -F 'woodright.ru|www.woodright.ru) printf' "$SCRIPT" | grep -q 'https://woodright.ru' \
  && pass "settle origin matches apex/www template" || fail "helper settle origin drifted from template"
grep -F 'api.woodright.ru) printf' "$SCRIPT" | grep -q 'https://api.woodright.ru' \
  && pass "settle origin matches api template" || fail "helper api settle origin drifted from template"

# wrong environment
if bash "$SCRIPT" --environment production --mode dry-run --source-sha "$SHA" \
    --storefront-digest "$SF_DIG" --backend-digest "$BE_DIG" >/dev/null 2>"$TMP/wrong-env.txt"; then
  fail "production env should be refused"
else
  pass "wrong environment refused"
fi

# wrong SHA
if run --mode dry-run --source-sha 1111111111111111111111111111111111111111 \
    --storefront-digest "$SF_DIG" --backend-digest "$BE_DIG" >/dev/null 2>"$TMP/wrong-sha.txt"; then
  fail "wrong SHA should be refused"
else
  pass "wrong application SHA refused"
fi

# stale DNS
export WOODRIGHT_FAKE_DIG_A='{"woodright.ru":"1.2.3.4","www.woodright.ru":"79.133.175.43","api.woodright.ru":""}'
if run --mode dry-run --source-sha "$SHA" --storefront-digest "$SF_DIG" --backend-digest "$BE_DIG" \
    >/dev/null 2>"$TMP/stale-dns.txt"; then
  fail "stale DNS should STOP"
else
  grep -q 'CAS DNS' "$TMP/stale-dns.txt" && pass "stale DNS CAS stop" || fail "stale DNS message missing"
fi
export WOODRIGHT_FAKE_DIG_A='{"woodright.ru":"79.133.175.43","www.woodright.ru":"79.133.175.43","api.woodright.ru":""}'

# unexpected api DNS
export WOODRIGHT_FAKE_DIG_A='{"woodright.ru":"79.133.175.43","www.woodright.ru":"79.133.175.43","api.woodright.ru":"9.9.9.9"}'
if run --mode dry-run --source-sha "$SHA" --storefront-digest "$SF_DIG" --backend-digest "$BE_DIG" \
    >/dev/null 2>"$TMP/api-dns.txt"; then
  fail "existing api DNS should STOP"
else
  pass "unexpected api DNS refused"
fi
export WOODRIGHT_FAKE_DIG_A='{"woodright.ru":"79.133.175.43","www.woodright.ru":"79.133.175.43","api.woodright.ru":""}'

# unhealthy pair
python3 - "$STATE/docker.json" <<'PY'
import json,sys
p=sys.argv[1]; d=json.load(open(p)); d["containers"]["woodright-public-production-storefront"]["health"]="unhealthy"; json.dump(d, open(p,"w"), indent=2)
PY
if run --mode dry-run --source-sha "$SHA" --storefront-digest "$SF_DIG" --backend-digest "$BE_DIG" \
    >/dev/null 2>"$TMP/unhealthy.txt"; then
  fail "unhealthy pair should be refused"
else
  pass "unhealthy pair refused"
fi
# restart count
python3 - "$STATE/docker.json" <<'PY'
import json,sys
p=sys.argv[1]; d=json.load(open(p)); d["containers"]["woodright-public-production-storefront"]["restarts"]=3; json.dump(d, open(p,"w"), indent=2)
PY
if run --mode dry-run --source-sha "$SHA" --storefront-digest "$SF_DIG" --backend-digest "$BE_DIG" \
    >/dev/null 2>"$TMP/restarts.txt"; then
  fail "RestartCount!=0 should be refused"
else
  pass "RestartCount gate refused"
fi
init_state
rm -rf "$WOODRIGHT_APEX_EVIDENCE_DIR"
if run --mode dry-run --source-sha "$SHA" --storefront-digest "$SF_DIG" --backend-digest "$BE_DIG" \
    >"$TMP/dry-out.txt" 2>"$TMP/dry-err.txt"; then
  grep -q 'PUBLIC_APEX_ROUTING_DRY_RUN_OK' "$TMP/dry-err.txt" && pass "dry-run OK" || fail "dry-run status missing"
else
  fail "dry-run should pass"
  cat "$TMP/dry-err.txt"
fi
[[ ! -f "$TARGET" ]] && pass "dry-run did not write Traefik" || fail "dry-run wrote Traefik"
python3 - "$STATE/docker.json" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
assert d.get("mutations")==[]
print("ok")
PY
pass "dry-run docker mutations empty"

# execute without confirm / approval
if run --mode execute --source-sha "$SHA" --storefront-digest "$SF_DIG" --backend-digest "$BE_DIG" \
    >/dev/null 2>"$TMP/no-confirm.txt"; then
  fail "execute without confirm should fail"
else
  pass "execute without confirm refused"
fi
[[ ! -f "$TARGET" ]] && pass "no Traefik after unconfirmed execute" || fail "unconfirmed execute wrote Traefik"

write_approval
if run --mode execute --source-sha "$SHA" --storefront-digest "$SF_DIG" --backend-digest "$BE_DIG" \
    --confirm WRONGTOKEN >/dev/null 2>"$TMP/bad-confirm.txt"; then
  fail "bad confirm should fail"
else
  pass "bad confirm refused"
fi

# pre-existing different Traefik file
echo 'unexpected: true' >"$TARGET"
if run --mode dry-run --source-sha "$SHA" --storefront-digest "$SF_DIG" --backend-digest "$BE_DIG" \
    >/dev/null 2>"$TMP/preexisting.txt"; then
  fail "different Traefik target should CAS-stop"
else
  pass "pre-existing different Traefik CAS stop"
fi
rm -f "$TARGET"

# execute success
export WOODRIGHT_APEX_EVIDENCE_DIR="$TMP/evidence-exec"
write_approval
if run --mode execute --source-sha "$SHA" --storefront-digest "$SF_DIG" --backend-digest "$BE_DIG" \
    --confirm "$CONFIRM" --approval-path "$APPROVAL" \
    >"$TMP/exec-out.txt" 2>"$TMP/exec-err.txt"; then
  grep -q 'PUBLIC_APEX_ROUTING_PREPARE_OK' "$TMP/exec-err.txt" && pass "execute prepare OK" || fail "execute status missing"
else
  fail "execute should pass"
  cat "$TMP/exec-err.txt"
fi
cmp -s "$TARGET" "$TMPL" && pass "Traefik file matches template" || fail "Traefik file mismatch"
grep -q 'woodright-demo.ru' "$DEMO" && pass "demo Traefik untouched" || fail "demo Traefik mutated"
python3 - "$STATE/docker.json" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
sf=d["containers"]["woodright-public-production-storefront"]["networks"]
be=d["containers"]["woodright-public-production-backend"]["networks"]
assert "dokploy-network" in sf and "dokploy-network" in be, (sf, be)
print("ok")
PY
pass "both containers connected to dokploy-network"

export WOODRIGHT_APEX_EVIDENCE_DIR="$TMP/evidence-exec2"
if run --mode execute --source-sha "$SHA" --storefront-digest "$SF_DIG" --backend-digest "$BE_DIG" \
    --confirm "$CONFIRM" --approval-path "$APPROVAL" \
    >"$TMP/exec2-out.txt" 2>"$TMP/exec2-err.txt"; then
  grep -q 'PUBLIC_APEX_ROUTING_PREPARE_OK' "$TMP/exec2-err.txt" && pass "second execute idempotent OK" || fail "second execute status missing"
else
  fail "second execute should pass"
  cat "$TMP/exec2-err.txt"
fi
python3 - "$WOODRIGHT_APEX_OWNED_STATE" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
nets=d.get("networks_added") or []
assert "woodright-public-production-storefront" in nets, nets
assert "woodright-public-production-backend" in nets, nets
assert d.get("traefik_created_by_helper") is True
print("ok")
PY
pass "owned-state preserved after idempotent execute"

# live DNS rollback refuse (apex OR www OR api)
export WOODRIGHT_FAKE_DIG_A='{"woodright.ru":"89.169.188.29","www.woodright.ru":"89.169.188.29","api.woodright.ru":"89.169.188.29"}'
if run --mode rollback --source-sha "$SHA" --storefront-digest "$SF_DIG" --backend-digest "$BE_DIG" \
    >/dev/null 2>"$TMP/rb-live.txt"; then
  fail "rollback while DNS is new-stack should refuse"
else
  pass "rollback refused while apex DNS is live new-stack"
fi
[[ -f "$TARGET" ]] && pass "Traefik kept after refused rollback" || fail "refused rollback deleted Traefik"

export WOODRIGHT_FAKE_DIG_A='{"woodright.ru":"79.133.175.43","www.woodright.ru":"89.169.188.29","api.woodright.ru":""}'
if run --mode rollback --source-sha "$SHA" --storefront-digest "$SF_DIG" --backend-digest "$BE_DIG" \
    >/dev/null 2>"$TMP/rb-www.txt"; then
  fail "rollback while www DNS is new-stack should refuse"
else
  pass "rollback refused while www still points at new-stack"
fi

# interrupted rollback then retry (owned network already absent must not block)
export WOODRIGHT_FAKE_DIG_A='{"woodright.ru":"79.133.175.43","www.woodright.ru":"79.133.175.43","api.woodright.ru":""}'
export WOODRIGHT_APEX_EVIDENCE_DIR="$TMP/evidence-rb-interrupt"
export WOODRIGHT_APEX_INJECT_FAIL=rollback-after-first-disconnect
if run --mode rollback --source-sha "$SHA" --storefront-digest "$SF_DIG" --backend-digest "$BE_DIG" \
    >/dev/null 2>"$TMP/rb-interrupt.txt"; then
  fail "interrupted rollback should fail closed"
else
  grep -q 'rollback-after-first-disconnect' "$TMP/rb-interrupt.txt" \
    && pass "interrupted rollback failed after first disconnect" \
    || fail "interrupt token missing"
fi
unset WOODRIGHT_APEX_INJECT_FAIL
[[ -f "$WOODRIGHT_APEX_OWNED_STATE" ]] && pass "owned-state kept after interrupted rollback" \
  || fail "interrupted rollback cleared owned-state"
python3 - "$STATE/docker.json" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
sf=d["containers"]["woodright-public-production-storefront"]["networks"]
be=d["containers"]["woodright-public-production-backend"]["networks"]
assert "dokploy-network" not in sf
assert "dokploy-network" in be
print("ok")
PY
pass "interrupted rollback left remaining owned attachment"

export WOODRIGHT_APEX_EVIDENCE_DIR="$TMP/evidence-rb"
if run --mode rollback --source-sha "$SHA" --storefront-digest "$SF_DIG" --backend-digest "$BE_DIG" \
    >"$TMP/rb-out.txt" 2>"$TMP/rb-err.txt"; then
  grep -q 'PUBLIC_APEX_ROUTING_ROLLBACK_OK' "$TMP/rb-err.txt" && pass "rollback OK" || fail "rollback status missing"
else
  fail "rollback retry after interrupt should pass"
  cat "$TMP/rb-err.txt"
fi
[[ ! -f "$TARGET" ]] && pass "Traefik removed on rollback" || fail "Traefik remained"
[[ ! -f "$WOODRIGHT_APEX_OWNED_STATE" ]] && pass "owned-state cleared on rollback retry" \
  || fail "owned-state remained after rollback retry"
python3 - "$STATE/docker.json" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
assert "dokploy-network" not in d["containers"]["woodright-public-production-storefront"]["networks"]
assert "dokploy-network" not in d["containers"]["woodright-public-production-backend"]["networks"]
print("ok")
PY
pass "networks disconnected on rollback"
grep -q 'woodright-demo.ru' "$DEMO" && pass "demo still present after rollback" || fail "demo lost"

# injected failure after first network connect
init_state
write_approval
rm -f "$TARGET"
export WOODRIGHT_APEX_INJECT_FAIL=after-first-network
if run --mode execute --source-sha "$SHA" --storefront-digest "$SF_DIG" --backend-digest "$BE_DIG" \
    --confirm "$CONFIRM" --approval-path "$APPROVAL" >/dev/null 2>"$TMP/inj-net.txt"; then
  fail "injected after-first-network should fail"
else
  pass "injected after-first-network failed closed"
fi
unset WOODRIGHT_APEX_INJECT_FAIL
[[ ! -f "$TARGET" ]] && pass "injected net fail did not leave Traefik" || fail "injected net fail left Traefik"
python3 - "$STATE/docker.json" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
assert "dokploy-network" not in d["containers"]["woodright-public-production-storefront"]["networks"]
assert "dokploy-network" not in d["containers"]["woodright-public-production-backend"]["networks"]
print("ok")
PY
pass "injected net fail disconnected first container"

init_state
write_approval
rm -f "$TARGET"
export WOODRIGHT_APEX_INJECT_FAIL=after-traefik
if run --mode execute --source-sha "$SHA" --storefront-digest "$SF_DIG" --backend-digest "$BE_DIG" \
    --confirm "$CONFIRM" --approval-path "$APPROVAL" >/dev/null 2>"$TMP/inj-tr.txt"; then
  fail "injected after-traefik should fail"
else
  pass "injected after-traefik failed closed"
fi
unset WOODRIGHT_APEX_INJECT_FAIL
[[ ! -f "$TARGET" ]] && pass "injected traefik fail removed Traefik" || fail "injected traefik fail left Traefik"
python3 - "$STATE/docker.json" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
assert "dokploy-network" not in d["containers"]["woodright-public-production-storefront"]["networks"]
assert "dokploy-network" not in d["containers"]["woodright-public-production-backend"]["networks"]
print("ok")
PY
pass "injected traefik fail disconnected networks"

# helper must not recreate app
if grep -E 'compose .*up|service recreate|docker compose' "$SCRIPT" | grep -vq '^#'; then
  # allow comments only; fail if compose recreate invoked
  if grep -E '^[^#]*(docker compose|compose_service_recreate|recreate-staging)' "$SCRIPT"; then
    fail "apex helper must not recreate application"
  else
    pass "no application recreate"
  fi
else
  pass "no application recreate"
fi
grep -q 'nsupdate' "$SCRIPT" && fail "must not call nsupdate" || pass "no DNS CLI mutation"
grep -q 'I_UNDERSTAND_PUBLIC_APEX_ROUTING_CUTOVER' "$SCRIPT" || fail "missing confirm token"
grep -q 'Traefik HTTP probes skipped in dry-run' "$SCRIPT" \
  && pass "dry-run skips Traefik Host probe before routers exist" \
  || fail "dry-run must skip Traefik probe until helper-owned file exists"

init_state
cp "$TMPL" "$TARGET"
rm -f "$WOODRIGHT_APEX_OWNED_STATE"
export WOODRIGHT_FAKE_DIG_A='{"woodright.ru":"79.133.175.43","www.woodright.ru":"79.133.175.43","api.woodright.ru":""}'
if run --mode rollback --source-sha "$SHA" --storefront-digest "$SF_DIG" --backend-digest "$BE_DIG" \
    >/dev/null 2>"$TMP/rb-unowned.txt"; then
  pass "unowned rollback allowed"
else
  fail "unowned rollback should pass without deleting"
  cat "$TMP/rb-unowned.txt"
fi
[[ -f "$TARGET" ]] && pass "unowned matching Traefik preserved" || fail "unowned rollback deleted Traefik"

# --- Traefik file-provider settle + rollback_partial owned cleanup ---
cat >"$BIN/apex-traefik-http-get" <<'PY'
#!/usr/bin/env python3
import json, os, sys
host = sys.argv[1]
attempt = int(sys.argv[2])
path = os.environ["WOODRIGHT_APEX_TRAEFIK_FAKE_HTTP_STATE"]
st = json.load(open(path))
rounds = st["rounds"]
idx = min(max(attempt, 1) - 1, len(rounds) - 1)
item = rounds[idx]
if host in item:
    row = item[host]
elif "*" in item:
    row = item["*"]
else:
    row = {"code": "404", "location": ""}
code = str(row.get("code", "404"))
loc = str(row.get("location", ""))
print(f"{code} {loc}".rstrip())
PY
chmod +x "$BIN/apex-traefik-http-get"

write_http_rounds() {
  python3 - "$STATE/traefik-http.json" "$1" <<'PY'
import json, sys
path, raw = sys.argv[1], sys.argv[2]
json.dump({"rounds": json.loads(raw)}, open(path, "w"))
PY
}

ok_round='{"*":{"code":"301","location":"https://woodright.ru/"},"api.woodright.ru":{"code":"301","location":"https://api.woodright.ru/"}}'
nf_round='{"*":{"code":"404","location":""}}'

enable_settle_harness() {
  unset WOODRIGHT_APEX_SKIP_HTTP_PROBE
  export WOODRIGHT_APEX_SKIP_LOOPBACK_PROBE=1
  export WOODRIGHT_APEX_TRAEFIK_HTTP_GET="$BIN/apex-traefik-http-get"
  export WOODRIGHT_APEX_TRAEFIK_FAKE_HTTP_STATE="$STATE/traefik-http.json"
  export WOODRIGHT_APEX_TRAEFIK_SETTLE_TIMEOUT_SEC="${1:-4}"
  export WOODRIGHT_APEX_TRAEFIK_SETTLE_INTERVAL_SEC="${2:-0}"
  export WOODRIGHT_APEX_TRAEFIK_SETTLE_REQUIRED_STREAK="${3:-2}"
}

disable_settle_harness() {
  unset WOODRIGHT_APEX_SKIP_LOOPBACK_PROBE
  unset WOODRIGHT_APEX_TRAEFIK_HTTP_GET
  unset WOODRIGHT_APEX_TRAEFIK_FAKE_HTTP_STATE
  unset WOODRIGHT_APEX_TRAEFIK_SETTLE_TIMEOUT_SEC
  unset WOODRIGHT_APEX_TRAEFIK_SETTLE_INTERVAL_SEC
  unset WOODRIGHT_APEX_TRAEFIK_SETTLE_REQUIRED_STREAK
  export WOODRIGHT_APEX_SKIP_HTTP_PROBE=1
}

assert_rolled_back_clean() {
  local label="$1"
  [[ ! -f "$TARGET" ]] && pass "$label Traefik absent" || fail "$label left Traefik"
  [[ ! -f "$WOODRIGHT_APEX_OWNED_STATE" ]] && pass "$label owned-state absent" || fail "$label left owned-state"
  python3 - "$STATE/docker.json" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
assert "dokploy-network" not in d["containers"]["woodright-public-production-storefront"]["networks"]
assert "dokploy-network" not in d["containers"]["woodright-public-production-backend"]["networks"]
print("ok")
PY
  pass "$label networks disconnected"
}

prep_settle_execute() {
  init_state
  write_approval
  rm -f "$TARGET" "$WOODRIGHT_APEX_OWNED_STATE"
  export WOODRIGHT_FAKE_DIG_A='{"woodright.ru":"79.133.175.43","www.woodright.ru":"79.133.175.43","api.woodright.ru":""}'
}

# A. Immediate expected redirect (streak 2, both attempts ok)
prep_settle_execute
enable_settle_harness 4 0 2
write_http_rounds "[${ok_round},${ok_round}]"
export WOODRIGHT_APEX_EVIDENCE_DIR="$TMP/evidence-settle-a"
if run --mode execute --source-sha "$SHA" --storefront-digest "$SF_DIG" --backend-digest "$BE_DIG" \
    --confirm "$CONFIRM" --approval-path "$APPROVAL" \
    >"$TMP/settle-a-out.txt" 2>"$TMP/settle-a-err.txt"; then
  grep -q 'PUBLIC_APEX_ROUTING_PREPARE_OK' "$TMP/settle-a-err.txt" \
    && pass "A immediate Traefik success" || fail "A missing prepare status"
else
  fail "A immediate success should pass"
  cat "$TMP/settle-a-err.txt"
fi
[[ -f "$TARGET" ]] && pass "A Traefik kept" || fail "A Traefik missing"
[[ -f "$WOODRIGHT_APEX_OWNED_STATE" ]] && pass "A owned-state present" || fail "A owned-state missing"

# B. Production reproduction: first 404, then expected
prep_settle_execute
enable_settle_harness 4 0 2
write_http_rounds "[${nf_round},${ok_round},${ok_round}]"
export WOODRIGHT_APEX_EVIDENCE_DIR="$TMP/evidence-settle-b"
if run --mode execute --source-sha "$SHA" --storefront-digest "$SF_DIG" --backend-digest "$BE_DIG" \
    --confirm "$CONFIRM" --approval-path "$APPROVAL" \
    >"$TMP/settle-b-out.txt" 2>"$TMP/settle-b-err.txt"; then
  grep -q 'status=404' "$TMP/settle-b-err.txt" && grep -q 'PUBLIC_APEX_ROUTING_PREPARE_OK' "$TMP/settle-b-err.txt" \
    && pass "B 404 then expected route" || fail "B missing 404-then-ok evidence"
else
  fail "B first-404 should converge"
  cat "$TMP/settle-b-err.txt"
fi

# C. Several 404s then expected
prep_settle_execute
enable_settle_harness 4 0 2
write_http_rounds "[${nf_round},${nf_round},${nf_round},${ok_round},${ok_round}]"
export WOODRIGHT_APEX_EVIDENCE_DIR="$TMP/evidence-settle-c"
if run --mode execute --source-sha "$SHA" --storefront-digest "$SF_DIG" --backend-digest "$BE_DIG" \
    --confirm "$CONFIRM" --approval-path "$APPROVAL" \
    >"$TMP/settle-c-out.txt" 2>"$TMP/settle-c-err.txt"; then
  grep -q 'PUBLIC_APEX_ROUTING_PREPARE_OK' "$TMP/settle-c-err.txt" \
    && pass "C multiple 404 then expected" || fail "C missing prepare status"
else
  fail "C multi-404 should converge"
  cat "$TMP/settle-c-err.txt"
fi

# D + I. Persistent 404 until deadline → rollback_partial cleans owned-state
prep_settle_execute
enable_settle_harness 1 0.2 2
write_http_rounds "[${nf_round}]"
export WOODRIGHT_APEX_EVIDENCE_DIR="$TMP/evidence-settle-d"
if run --mode execute --source-sha "$SHA" --storefront-digest "$SF_DIG" --backend-digest "$BE_DIG" \
    --confirm "$CONFIRM" --approval-path "$APPROVAL" \
    >"$TMP/settle-d-out.txt" 2>"$TMP/settle-d-err.txt"; then
  fail "D persistent 404 should fail"
else
  grep -q 'convergence deadline' "$TMP/settle-d-err.txt" \
    && pass "D persistent 404 failed closed" || fail "D missing deadline token"
fi
assert_rolled_back_clean "D/I auto-rollback"

# J. Explicit rollback after automatic rollback is idempotent
export WOODRIGHT_APEX_EVIDENCE_DIR="$TMP/evidence-settle-j"
disable_settle_harness
if run --mode rollback --source-sha "$SHA" --storefront-digest "$SF_DIG" --backend-digest "$BE_DIG" \
    >"$TMP/settle-j-out.txt" 2>"$TMP/settle-j-err.txt"; then
  grep -q 'PUBLIC_APEX_ROUTING_ROLLBACK_OK' "$TMP/settle-j-err.txt" \
    && pass "J explicit rollback after auto-rollback" || fail "J missing rollback status"
else
  fail "J explicit rollback should be idempotent"
  cat "$TMP/settle-j-err.txt"
fi
[[ ! -f "$TARGET" ]] && pass "J Traefik still absent" || fail "J recreated Traefik"

# E. Connection 000 then expected route
prep_settle_execute
enable_settle_harness 4 0 2
conn_round='{"*":{"code":"000","location":""}}'
write_http_rounds "[${conn_round},${ok_round},${ok_round}]"
export WOODRIGHT_APEX_EVIDENCE_DIR="$TMP/evidence-settle-e"
if run --mode execute --source-sha "$SHA" --storefront-digest "$SF_DIG" --backend-digest "$BE_DIG" \
    --confirm "$CONFIRM" --approval-path "$APPROVAL" \
    >"$TMP/settle-e-out.txt" 2>"$TMP/settle-e-err.txt"; then
  grep -q 'status=000' "$TMP/settle-e-err.txt" && grep -q 'PUBLIC_APEX_ROUTING_PREPARE_OK' "$TMP/settle-e-err.txt" \
    && pass "E connection transient then expected" || fail "E missing 000-then-ok evidence"
else
  fail "E connection transient should converge"
  cat "$TMP/settle-e-err.txt"
fi

# F. Persistent 5xx never accepted
prep_settle_execute
enable_settle_harness 8 0 2
write_http_rounds '[{"*":{"code":"503","location":""}}]'
export WOODRIGHT_APEX_EVIDENCE_DIR="$TMP/evidence-settle-f"
if run --mode execute --source-sha "$SHA" --storefront-digest "$SF_DIG" --backend-digest "$BE_DIG" \
    --confirm "$CONFIRM" --approval-path "$APPROVAL" \
    >"$TMP/settle-f-out.txt" 2>"$TMP/settle-f-err.txt"; then
  fail "F 5xx should fail"
else
  grep -q 'http_5xx' "$TMP/settle-f-err.txt" && grep -vq 'convergence deadline' "$TMP/settle-f-err.txt" \
    && pass "F 5xx fail-closed without treating as lag" || fail "F 5xx not classified"
fi
assert_rolled_back_clean "F 5xx rollback"

# G. Wrong redirect Location
prep_settle_execute
enable_settle_harness 8 0 2
write_http_rounds '[{"*":{"code":"301","location":"https://woodright-demo.ru/"}}]'
export WOODRIGHT_APEX_EVIDENCE_DIR="$TMP/evidence-settle-g"
if run --mode execute --source-sha "$SHA" --storefront-digest "$SF_DIG" --backend-digest "$BE_DIG" \
    --confirm "$CONFIRM" --approval-path "$APPROVAL" \
    >"$TMP/settle-g-out.txt" 2>"$TMP/settle-g-err.txt"; then
  fail "G wrong redirect should fail"
else
  grep -q 'wrong_redirect' "$TMP/settle-g-err.txt" \
    && pass "G wrong Location fail-closed" || fail "G wrong redirect not classified"
fi
assert_rolled_back_clean "G wrong-redirect rollback"

# H. Deadline is finite (no infinite retry)
prep_settle_execute
enable_settle_harness 1 0.2 2
write_http_rounds "[${nf_round}]"
export WOODRIGHT_APEX_EVIDENCE_DIR="$TMP/evidence-settle-h"
if run --mode execute --source-sha "$SHA" --storefront-digest "$SF_DIG" --backend-digest "$BE_DIG" \
    --confirm "$CONFIRM" --approval-path "$APPROVAL" \
    >"$TMP/settle-h-out.txt" 2>"$TMP/settle-h-err.txt"; then
  fail "H timeout should fail"
else
  grep -q 'convergence deadline' "$TMP/settle-h-err.txt" \
    && pass "H bounded timeout" || fail "H missing deadline"
fi

disable_settle_harness

# K. Dry-run still skips Traefik Host probe (PR #209)
init_state
rm -f "$TARGET"
unset WOODRIGHT_APEX_SKIP_HTTP_PROBE
export WOODRIGHT_APEX_SKIP_LOOPBACK_PROBE=1
export WOODRIGHT_APEX_EVIDENCE_DIR="$TMP/evidence-settle-k"
if run --mode dry-run --source-sha "$SHA" --storefront-digest "$SF_DIG" --backend-digest "$BE_DIG" \
    >"$TMP/settle-k-out.txt" 2>"$TMP/settle-k-err.txt"; then
  grep -q 'Traefik HTTP probes skipped in dry-run' "$TMP/settle-k-err.txt" \
    && grep -q 'PUBLIC_APEX_ROUTING_DRY_RUN_OK' "$TMP/settle-k-err.txt" \
    && pass "K dry-run skips uncreated Traefik routers" || fail "K dry-run probe contract"
else
  fail "K dry-run should pass"
  cat "$TMP/settle-k-err.txt"
fi
[[ ! -f "$TARGET" ]] && pass "K dry-run still non-mutating" || fail "K dry-run wrote Traefik"
unset WOODRIGHT_APEX_SKIP_LOOPBACK_PROBE
export WOODRIGHT_APEX_SKIP_HTTP_PROBE=1

# M. Failed network disconnect keeps remaining owned-state (Codex P0)
prep_settle_execute
enable_settle_harness 1 0.2 2
write_http_rounds "[${nf_round}]"
export WR_FAKE_DOCKER_DISCONNECT_FAIL="woodright-public-production-storefront"
export WOODRIGHT_APEX_EVIDENCE_DIR="$TMP/evidence-settle-m"
if run --mode execute --source-sha "$SHA" --storefront-digest "$SF_DIG" --backend-digest "$BE_DIG" \
    --confirm "$CONFIRM" --approval-path "$APPROVAL" \
    >"$TMP/settle-m-out.txt" 2>"$TMP/settle-m-err.txt"; then
  fail "M persistent 404 should fail"
else
  grep -q 'PARTIAL_ROLLBACK_INCOMPLETE' "$TMP/settle-m-err.txt" \
    && pass "M incomplete auto-rollback reported" || fail "M missing incomplete token"
fi
[[ ! -f "$TARGET" ]] && pass "M Traefik removed" || fail "M Traefik remained"
[[ -f "$WOODRIGHT_APEX_OWNED_STATE" ]] && pass "M owned-state retained" || fail "M owned-state wiped after failed disconnect"
python3 - "$WOODRIGHT_APEX_OWNED_STATE" "$STATE/docker.json" <<'PY'
import json,sys
owned=json.load(open(sys.argv[1]))
d=json.load(open(sys.argv[2]))
assert owned.get("traefik_created_by_helper") is False
assert "woodright-public-production-storefront" in (owned.get("networks_added") or [])
assert "woodright-public-production-backend" not in (owned.get("networks_added") or [])
assert "dokploy-network" in d["containers"]["woodright-public-production-storefront"]["networks"]
assert "dokploy-network" not in d["containers"]["woodright-public-production-backend"]["networks"]
print("ok")
PY
pass "M remaining owned network matches live attachment"
unset WR_FAKE_DOCKER_DISCONNECT_FAIL
disable_settle_harness
export WOODRIGHT_APEX_EVIDENCE_DIR="$TMP/evidence-settle-m-rb"
if run --mode rollback --source-sha "$SHA" --storefront-digest "$SF_DIG" --backend-digest "$BE_DIG" \
    >"$TMP/settle-m-rb-out.txt" 2>"$TMP/settle-m-rb-err.txt"; then
  grep -q 'PUBLIC_APEX_ROUTING_ROLLBACK_OK' "$TMP/settle-m-rb-err.txt" \
    && pass "M explicit rollback finished leftover network" || fail "M explicit rollback status"
else
  fail "M explicit rollback should complete leftover cleanup"
  cat "$TMP/settle-m-rb-err.txt"
fi
[[ ! -f "$WOODRIGHT_APEX_OWNED_STATE" ]] && pass "M owned-state cleared after explicit rollback" \
  || fail "M owned-state remained after explicit rollback"

# N. Failed Traefik rm keeps traefik ownership proof
prep_settle_execute
enable_settle_harness 1 0.2 2
write_http_rounds "[${nf_round}]"
export WOODRIGHT_APEX_INJECT_FAIL=partial-skip-traefik-rm
export WOODRIGHT_APEX_EVIDENCE_DIR="$TMP/evidence-settle-n"
if run --mode execute --source-sha "$SHA" --storefront-digest "$SF_DIG" --backend-digest "$BE_DIG" \
    --confirm "$CONFIRM" --approval-path "$APPROVAL" \
    >"$TMP/settle-n-out.txt" 2>"$TMP/settle-n-err.txt"; then
  fail "N persistent 404 should fail"
else
  grep -q 'PARTIAL_ROLLBACK_INCOMPLETE' "$TMP/settle-n-err.txt" \
    && pass "N incomplete Traefik rm reported" || fail "N missing incomplete token"
fi
[[ -f "$TARGET" ]] && pass "N Traefik file retained" || fail "N Traefik was deleted despite skip"
[[ -f "$WOODRIGHT_APEX_OWNED_STATE" ]] && pass "N owned-state retained" || fail "N owned-state wiped after skipped rm"
python3 - "$WOODRIGHT_APEX_OWNED_STATE" "$STATE/docker.json" <<'PY'
import json,sys
owned=json.load(open(sys.argv[1]))
d=json.load(open(sys.argv[2]))
assert owned.get("traefik_created_by_helper") is True
assert owned.get("networks_added") == []
assert "dokploy-network" not in d["containers"]["woodright-public-production-storefront"]["networks"]
assert "dokploy-network" not in d["containers"]["woodright-public-production-backend"]["networks"]
print("ok")
PY
pass "N owned Traefik flag remains while networks cleaned"
unset WOODRIGHT_APEX_INJECT_FAIL
disable_settle_harness
export WOODRIGHT_APEX_EVIDENCE_DIR="$TMP/evidence-settle-n-rb"
if run --mode rollback --source-sha "$SHA" --storefront-digest "$SF_DIG" --backend-digest "$BE_DIG" \
    >"$TMP/settle-n-rb-out.txt" 2>"$TMP/settle-n-rb-err.txt"; then
  grep -q 'PUBLIC_APEX_ROUTING_ROLLBACK_OK' "$TMP/settle-n-rb-err.txt" \
    && pass "N explicit rollback removed leftover Traefik" || fail "N explicit rollback status"
else
  fail "N explicit rollback should delete leftover Traefik"
  cat "$TMP/settle-n-rb-err.txt"
fi
[[ ! -f "$TARGET" ]] && pass "N Traefik removed by explicit rollback" || fail "N Traefik remained"
[[ ! -f "$WOODRIGHT_APEX_OWNED_STATE" ]] && pass "N owned-state cleared after explicit rollback" \
  || fail "N owned-state remained after explicit rollback"

# O. Replaced Traefik file is not deleted by automatic rollback (Codex P1)
prep_settle_execute
export WOODRIGHT_APEX_INJECT_FAIL=after-owned-replace-traefik
export WOODRIGHT_APEX_EVIDENCE_DIR="$TMP/evidence-settle-o"
if run --mode execute --source-sha "$SHA" --storefront-digest "$SF_DIG" --backend-digest "$BE_DIG" \
    --confirm "$CONFIRM" --approval-path "$APPROVAL" \
    >"$TMP/settle-o-out.txt" 2>"$TMP/settle-o-err.txt"; then
  fail "O injected replace should fail"
else
  grep -q 'no longer matches helper template' "$TMP/settle-o-err.txt" \
    && grep -q 'PARTIAL_ROLLBACK_INCOMPLETE' "$TMP/settle-o-err.txt" \
    && pass "O CAS refused unowned Traefik delete" || fail "O missing CAS refuse"
fi
grep -q 'foreign unowned replacement' "$TARGET" && pass "O foreign Traefik preserved" \
  || fail "O Traefik was deleted or overwritten"
[[ -f "$WOODRIGHT_APEX_OWNED_STATE" ]] && pass "O owned-state retained" || fail "O owned-state wiped"
python3 - "$WOODRIGHT_APEX_OWNED_STATE" <<'PY'
import json,sys
owned=json.load(open(sys.argv[1]))
assert owned.get("traefik_created_by_helper") is True
print("ok")
PY
pass "O traefik ownership flag remains"
unset WOODRIGHT_APEX_INJECT_FAIL
export WOODRIGHT_APEX_EVIDENCE_DIR="$TMP/evidence-settle-o-rb"
if run --mode rollback --source-sha "$SHA" --storefront-digest "$SF_DIG" --backend-digest "$BE_DIG" \
    >"$TMP/settle-o-rb-out.txt" 2>"$TMP/settle-o-rb-err.txt"; then
  fail "O explicit rollback must refuse foreign Traefik delete"
else
  grep -q 'CAS Traefik target differs from template' "$TMP/settle-o-rb-err.txt" \
    && pass "O explicit rollback CAS-refused foreign file" || fail "O explicit rollback message"
fi
grep -q 'foreign unowned replacement' "$TARGET" && pass "O foreign Traefik still present after refused rollback" \
  || fail "O explicit rollback deleted foreign Traefik"

# P. Journaled ownership in the early mutation window (Codex P1)
init_state
write_approval
rm -f "$TARGET" "$WOODRIGHT_APEX_OWNED_STATE"
export WOODRIGHT_APEX_INJECT_FAIL=after-first-network
export WR_FAKE_DOCKER_DISCONNECT_FAIL="woodright-public-production-storefront"
export WOODRIGHT_APEX_EVIDENCE_DIR="$TMP/evidence-settle-p"
if run --mode execute --source-sha "$SHA" --storefront-digest "$SF_DIG" --backend-digest "$BE_DIG" \
    --confirm "$CONFIRM" --approval-path "$APPROVAL" \
    >"$TMP/settle-p-out.txt" 2>"$TMP/settle-p-err.txt"; then
  fail "P after-first-network should fail"
else
  grep -q 'PARTIAL_ROLLBACK_INCOMPLETE' "$TMP/settle-p-err.txt" \
    && pass "P incomplete auto-rollback in early window" || fail "P missing incomplete token"
fi
[[ ! -f "$TARGET" ]] && pass "P Traefik absent" || fail "P Traefik present"
[[ -f "$WOODRIGHT_APEX_OWNED_STATE" ]] && pass "P owned-state retained for leftover network" \
  || fail "P owned-state absent after early-window disconnect fail"
python3 - "$WOODRIGHT_APEX_OWNED_STATE" "$STATE/docker.json" <<'PY'
import json,sys
owned=json.load(open(sys.argv[1]))
d=json.load(open(sys.argv[2]))
assert owned.get("traefik_created_by_helper") is False
assert owned.get("networks_added") == ["woodright-public-production-storefront"]
assert "dokploy-network" in d["containers"]["woodright-public-production-storefront"]["networks"]
assert "dokploy-network" not in d["containers"]["woodright-public-production-backend"]["networks"]
print("ok")
PY
pass "P leftover network still recorded"
unset WOODRIGHT_APEX_INJECT_FAIL
unset WR_FAKE_DOCKER_DISCONNECT_FAIL
export WOODRIGHT_APEX_EVIDENCE_DIR="$TMP/evidence-settle-p-rb"
if run --mode rollback --source-sha "$SHA" --storefront-digest "$SF_DIG" --backend-digest "$BE_DIG" \
    >"$TMP/settle-p-rb-out.txt" 2>"$TMP/settle-p-rb-err.txt"; then
  grep -q 'PUBLIC_APEX_ROUTING_ROLLBACK_OK' "$TMP/settle-p-rb-err.txt" \
    && pass "P explicit rollback finished early-window leftover" || fail "P explicit rollback status"
else
  fail "P explicit rollback should complete leftover cleanup"
  cat "$TMP/settle-p-rb-err.txt"
fi
[[ ! -f "$WOODRIGHT_APEX_OWNED_STATE" ]] && pass "P owned-state cleared after explicit rollback" \
  || fail "P owned-state remained after explicit rollback"

if [[ "$FAILED" -ne 0 ]]; then
  echo "FAILED=$FAILED"
  exit 1
fi
echo "ALL_PASS"
