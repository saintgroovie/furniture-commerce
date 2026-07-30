#!/usr/bin/env bash
# Fidelity tests for public_demo pair cutover tooling (no live mutation).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMMON="$ROOT/ops/lib/woodright-cutover-common.sh"
PAIR="$ROOT/ops/release/cutover-public-demo-pair.sh"
SF="$ROOT/ops/release/recreate-staging-storefront.sh"
LOCK="$ROOT/ops/lib/woodright-staging-mutation-lock.sh"
FAILED=0
TMP="$(mktemp -d /tmp/wr-pair-cutover-test-XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

pass() { echo "PASS $*"; }
fail() { echo "FAIL $*"; FAILED=$((FAILED + 1)); }

# --- fake docker harness ---
FAKE_DOCKER="$TMP/bin"
mkdir -p "$FAKE_DOCKER" "$TMP/state"
cat >"$FAKE_DOCKER/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
STATE="${WOODRIGHT_FAKE_DOCKER_STATE:?}"
cmd="${1:-}"
shift || true
mkdir -p "$STATE/containers" "$STATE/images" "$STATE/networks" "$STATE/log"
echo "docker $cmd $*" >>"$STATE/log/commands.log"
case "$cmd" in
  inspect)
    target="${1:-}"
    # format flag
    fmt=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --format) fmt="$2"; shift 2 ;;
        --format=*) fmt="${1#--format=}"; shift ;;
        *) target="$1"; shift ;;
      esac
    done
    # image inspect
    if [[ -f "$STATE/images/${target//\//_}.json" ]]; then
      if [[ -n "$fmt" ]]; then
        python3 - "$STATE/images/${target//\//_}.json" "$fmt" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
fmt=sys.argv[2]
# minimal template support
if "Labels" in fmt and "revision" in fmt:
  print((d.get("Config") or {}).get("Labels",{}).get("org.opencontainers.image.revision",""))
elif ".Id" in fmt:
  print(d.get("Id",""))
else:
  print("")
PY
      else
        cat "$STATE/images/${target//\//_}.json"
      fi
      exit 0
    fi
    # container by name
    name="${target#/}"
    f="$STATE/containers/${name}.json"
    [[ -f "$f" ]] || exit 1
    if [[ -n "$fmt" ]]; then
      python3 - "$f" "$fmt" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))[0]
fmt=sys.argv[2]
if "RepoDigests" in fmt:
  print(json.dumps(d.get("RepoDigests") or []) + (d.get("Config") or {}).get("Image","") + str(d.get("Image","")))
elif "runtime-role" in fmt:
  print((d.get("Config") or {}).get("Labels",{}).get("com.woodright.runtime-role",""))
elif "release-sha" in fmt:
  print((d.get("Config") or {}).get("Labels",{}).get("com.woodright.release-sha",""))
elif "deployment-owner" in fmt:
  print((d.get("Config") or {}).get("Labels",{}).get("com.woodright.deployment-owner",""))
elif ".Image" in fmt and "Config" not in fmt:
  print(d.get("Image",""))
elif ".Config.Image" in fmt:
  print((d.get("Config") or {}).get("Image",""))
elif ".Id" in fmt:
  print(d.get("Id",""))
elif "Health" in fmt:
  print(((d.get("State") or {}).get("Health") or {}).get("Status") or (d.get("State") or {}).get("Status",""))
elif ".State.Status" in fmt:
  print((d.get("State") or {}).get("Status",""))
elif "Mounts" in fmt:
  print(json.dumps(d.get("Mounts") or []))
else:
  print("")
PY
    else
      cat "$f"
    fi
    ;;
  network)
    sub="${1:-}"; shift || true
    if [[ "$sub" == "inspect" ]]; then
      [[ -f "$STATE/networks/${1}.ok" ]] || exit 1
      echo "{}"
    elif [[ "$sub" == "connect" ]]; then
      echo "connected" >>"$STATE/log/commands.log"
    fi
    ;;
  image)
    sub="${1:-}"; shift || true
    if [[ "$sub" == "inspect" ]]; then
      target="${1:-}"
      f="$STATE/images/${target//\//_}.json"
      [[ -f "$f" ]] || exit 1
      if [[ "${2:-}" == "--format" ]]; then
        fmt="$3"
        python3 - "$f" "$fmt" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
fmt=sys.argv[2]
if "revision" in fmt:
  print((d.get("Config") or {}).get("Labels",{}).get("org.opencontainers.image.revision",""))
elif ".Id" in fmt:
  print(d.get("Id",""))
else:
  print("")
PY
      else
        cat "$f"
      fi
    fi
    ;;
  stop|start|rename|create|rm)
    echo "$cmd $*" >>"$STATE/log/mutations.log"
    if [[ "$cmd" == "stop" || "$cmd" == "start" || "$cmd" == "rename" || "$cmd" == "create" || "$cmd" == "rm" ]]; then
      if [[ "${WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION:-0}" != "1" ]]; then
        echo "UNEXPECTED_MUTATION $cmd" >&2
        exit 99
      fi
    fi
    ;;
  *)
    exit 0
    ;;
esac
EOF
chmod +x "$FAKE_DOCKER/docker"

SHA40="8f9b914d219757ef0638aadd1c77f8ead253652a"
BE_DIG="sha256:5c053fe4d6066c3f31aea13d29f1d53ef244dad92db2059d2f143486dcbdabcc"
SF_DIG="sha256:079c02c4defd4d1adb8506037058b25abc1cca810902c0d77d182c6b0fb8585a"
OLD_BE="sha256:39d79114efd4f0446385899f947faa51f6a5125ad507d09d9c667cd00aad9067"
OLD_SF="sha256:879406cfcad13b81f4761d999a17363b8ce1be252bbb2cebdedb8534e3a7b88c"

setup_state() {
  local state="$1"
  mkdir -p "$state/containers" "$state/images" "$state/networks"
  touch "$state/networks/woodright-stack-3dsdhd_woodright_staging.ok"
  touch "$state/networks/dokploy-network.ok"
  # containers
  python3 - "$state" "$OLD_BE" "$OLD_SF" <<'PY'
import json,sys,os
state,old_be,old_sf=sys.argv[1],sys.argv[2],sys.argv[3]
def ctr(name, image, role="public_demo"):
  return [{
    "Id": f"id-{name}",
    "Name": f"/{name}",
    "Image": image.replace("@","@id-"),
    "RepoDigests": [f"ghcr.io/x@{image}"],
    "Config": {
      "Image": f"ghcr.io/saintgroovie/woodright-x@{image}",
      "Env": ["WOODRIGHT_RUNTIME_ROLE=public_demo","MOCK_SECRET_VALUE=should-not-leak","PATH=/usr/bin"],
      "Labels": {
        "com.woodright.runtime-role": role,
        "com.woodright.deployment-owner": "Dokploy",
        "com.woodright.exposure": "public",
        "com.woodright.release-sha": "7628056dcc1d150745de1b0fa881f1e9d36b798b",
      },
      "Cmd": ["node","server.js"],
      "Healthcheck": {"Test":["CMD-SHELL","true"]},
    },
    "HostConfig": {"RestartPolicy": {"Name": "unless-stopped"}},
    "NetworkSettings": {"Networks": {
      "woodright-stack-3dsdhd_woodright_staging": {"Aliases":["storefront" if "storefront" in name else "backend"]},
      "dokploy-network": {"Aliases":[]},
    }, "Ports": {}},
    "Mounts": [],
    "State": {"Status":"running","Health":{"Status":"healthy"}},
  }]
open(os.path.join(state,"containers","woodright-staging-backend.json"),"w").write(json.dumps(ctr("woodright-staging-backend", old_be)))
open(os.path.join(state,"containers","woodright-staging-storefront.json"),"w").write(json.dumps(ctr("woodright-staging-storefront", old_sf)))
# production must exist for exclusion checks but never be target
open(os.path.join(state,"containers","woodright-production-backend.json"),"w").write(json.dumps(ctr("woodright-production-backend", old_be, role="production_candidate")))
PY
  # target images with revision labels
  python3 - "$state" "$BE_DIG" "$SF_DIG" "$SHA40" <<'PY'
import json,sys,os
state,be,sf,sha=sys.argv[1:5]
for dig,title in ((be,"woodright-backend"),(sf,"woodright-storefront")):
  img=f"ghcr.io/saintgroovie/{title}@{dig}"
  key=img.replace("/","_")
  doc={"Id": f"img-{dig[-12:]}", "Config": {"Labels": {
    "org.opencontainers.image.revision": sha,
    "org.opencontainers.image.title": title,
    "com.woodright.deployment-owner": "Dokploy",
  }}}
  open(os.path.join(state,"images",key+".json"),"w").write(json.dumps(doc))
PY
}

export PATH="$FAKE_DOCKER:$PATH"
export WOODRIGHT_DOCKER_BIN="$FAKE_DOCKER/docker"
export WOODRIGHT_FAKE_DOCKER_STATE="$TMP/state"
export WOODRIGHT_ALLOW_MISSING_LOCAL_IMAGE=0
export WOODRIGHT_CUTOVER_SKIP_MONITOR_EXEC=1
export SKIP_MONITOR=1
export SKIP_BACKUP=1
export SKIP_SMOKE=1
export WOODRIGHT_VALIDATION_FREEZE_DIR="$TMP/freeze"
mkdir -p "$TMP/freeze"

setup_state "$TMP/state"

# 1) common digest validation
# shellcheck source=/dev/null
source "$COMMON"
if wr_cutover_require_full_sha "abc" 2>/dev/null; then fail "short sha accepted"; else pass "short sha rejected"; fi
if wr_cutover_require_digest "sha256:dead" 2>/dev/null; then fail "short digest accepted"; else pass "short digest rejected"; fi
if wr_cutover_refuse_production_name "woodright-production-backend" 2>/dev/null; then fail "production name accepted"; else pass "production name rejected"; fi
if wr_cutover_require_confirm "nope" 2>/dev/null; then fail "bad confirm accepted"; else pass "bad confirm rejected"; fi

# 2) redaction
echo '[{"Config":{"Env":["TOKEN=MOCK_SECRET_VALUE","A=1"]}}]' | wr_cutover_sanitize_inspect_json >"$TMP/san.json"
if grep -q MOCK_SECRET_VALUE "$TMP/san.json"; then fail "secret leaked in sanitize"; else pass "sanitize redacts secrets"; fi

# 3) storefront dry-run no mutation
EV="$TMP/ev-sf"
mkdir -p "$EV"
# env file mode 600
ENVF="$TMP/sf.env"
umask 077
printf 'WOODRIGHT_RUNTIME_ROLE=public_demo\nWOODRIGHT_RELEASE_SHA=%s\n' "$SHA40" >"$ENVF"
chmod 600 "$ENVF"
rm -f "$TMP/state/log/mutations.log"
if WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION=0 \
  bash "$SF" --environment staging --mode dry-run \
  --image "ghcr.io/saintgroovie/woodright-storefront@${SF_DIG}" \
  --digest "$SF_DIG" --target-sha "$SHA40" \
  --keep-name "woodright-staging-storefront-keeper-test" \
  --env-file "$ENVF" --evidence-dir "$EV"; then
  pass "storefront dry-run exit 0"
else
  fail "storefront dry-run failed"
fi
if [[ -f "$TMP/state/log/mutations.log" ]]; then fail "dry-run mutated docker"; else pass "dry-run no docker mutation"; fi

# 4) refuse production environment for storefront helper
if bash "$SF" --environment production --mode dry-run \
  --image "ghcr.io/saintgroovie/woodright-storefront@${SF_DIG}" \
  --digest "$SF_DIG" --target-sha "$SHA40" \
  --keep-name "k" --env-file "$ENVF" --evidence-dir "$EV" 2>/dev/null; then
  fail "production env accepted by storefront helper"
else
  pass "production env rejected by storefront helper"
fi

# 5) pair dry-run
EV2="$TMP/ev-pair"
mkdir -p "$EV2"
rm -f "$TMP/state/log/mutations.log"
if bash "$PAIR" --environment staging --mode dry-run \
  --target-sha "$SHA40" \
  --backend-digest "$BE_DIG" \
  --storefront-digest "$SF_DIG" \
  --evidence-dir "$EV2" \
  --expected-old-sha "7628056dcc1d150745de1b0fa881f1e9d36b798b"; then
  pass "pair dry-run exit 0"
else
  fail "pair dry-run failed"
fi
if [[ -f "$TMP/state/log/mutations.log" ]]; then fail "pair dry-run mutated"; else pass "pair dry-run no mutation"; fi

# 6) pair missing confirm on execute should fail before mutation
if bash "$PAIR" --environment staging --mode execute \
  --target-sha "$SHA40" --backend-digest "$BE_DIG" --storefront-digest "$SF_DIG" \
  --evidence-dir "$EV2" --backend-env-file "$ENVF" --storefront-env-file "$ENVF" 2>/dev/null; then
  fail "execute without confirm succeeded"
else
  pass "execute without confirm rejected"
fi

# 7) lock export inherit
LOCKPATH="$TMP/test.lock"
export WR_STAGING_MUTATION_LOCK_PATH="$LOCKPATH"
export WR_STAGING_MUTATION_LOCK_ALLOW_NONCANONICAL=1
# shellcheck source=/dev/null
source "$LOCK"
wr_staging_mutation_lock_acquire actor=t command=t
wr_staging_mutation_lock_export_inherit
# nested acquire in same shell
wr_staging_mutation_lock_acquire actor=inner command=inner
pass "nested lock inherit + export"
wr_staging_mutation_lock_release

# 8) scripts declare LIVE_MUTATING + lock
for rel in \
  ops/release/recreate-staging-storefront.sh \
  ops/release/cutover-public-demo-pair.sh \
  ops/release/rollback-staging-storefront-from-keeper.sh \
  ops/release/rollback-staging-backend-from-keeper.sh
do
  t="$(cat "$ROOT/$rel")"
  echo "$t" | grep -q 'LIVE_MUTATING=true' && pass "$rel LIVE_MUTATING" || fail "$rel LIVE_MUTATING"
  echo "$t" | grep -q 'live-cutover.lock\|woodright-staging-mutation-lock' && pass "$rel lock" || fail "$rel lock"
done

# 9) global lock policy
if node "$ROOT/scripts/release/check-global-lock-policy.cjs" >/dev/null; then
  pass "global lock policy"
else
  fail "global lock policy"
fi

# 10) pending migration gate
EV3="$TMP/ev-mig"
mkdir -p "$EV3"
if WOODRIGHT_PENDING_MIGRATION=1 bash "$PAIR" --environment staging --mode dry-run \
  --target-sha "$SHA40" --backend-digest "$BE_DIG" --storefront-digest "$SF_DIG" \
  --evidence-dir "$EV3" 2>/dev/null; then
  fail "pending migration allowed"
else
  pass "pending migration refused"
fi

if [[ "$FAILED" -eq 0 ]]; then
  echo "OK public-demo pair cutover fidelity ($TMP)"
  exit 0
fi
echo "FAILED count=$FAILED"
exit 1
