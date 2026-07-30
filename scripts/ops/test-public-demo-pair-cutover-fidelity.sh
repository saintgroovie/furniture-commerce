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
elif "yes" in fmt and "Health" in fmt:
  print("yes" if (d.get("State") or {}).get("Health") else "no")
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
    if [[ "$cmd" == "rename" ]]; then
      src="${1#/}"; dst="${2#/}"
      srcf="$STATE/containers/${src}.json"
      dstf="$STATE/containers/${dst}.json"
      [[ -f "$srcf" ]] || exit 1
      python3 - "$srcf" "$dstf" "$dst" <<'PY'
import json,sys
src,dst,name=sys.argv[1],sys.argv[2],sys.argv[3]
d=json.load(open(src))
d[0]["Name"]="/"+name
d[0]["Id"]="id-"+name
json.dump(d, open(dst,"w"))
import os
os.remove(src)
PY
    elif [[ "$cmd" == "stop" || "$cmd" == "start" ]]; then
      name="${1#/}"
      f="$STATE/containers/${name}.json"
      [[ -f "$f" ]] || exit 1
      python3 - "$f" "$cmd" <<'PY'
import json,sys
f,cmd=sys.argv[1],sys.argv[2]
d=json.load(open(f))
st=d[0].setdefault("State",{})
if cmd=="stop":
  st["Status"]="exited"
  if "Health" in st: st["Health"]["Status"]="unhealthy"
else:
  st["Status"]="running"
  st.setdefault("Health",{})["Status"]="healthy"
json.dump(d, open(f,"w"))
PY
    elif [[ "$cmd" == "rm" ]]; then
      name="${1#/}"
      rm -f "$STATE/containers/${name}.json"
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

# 11) pin lifecycle: SUCCESS only after under-lock APPLY; inherit supported
PAIR_SRC="$(cat "$PAIR")"
echo "$PAIR_SRC" | grep -q 'reconcile-public-image-pins.sh' && pass "pair references pin reconciler" || fail "pair missing pin reconciler"
echo "$PAIR_SRC" | grep -q 'wr_cutover_install_file' && pass "pair uses sudo-aware pin restore" || fail "pair missing wr_cutover_install_file"
COMMON_SRC="$(cat "$COMMON")"
echo "$COMMON_SRC" | grep -q 'sudo -n cp' && pass "common pin backup/install supports sudo -n" || fail "common missing sudo -n cp"
echo "$PAIR_SRC" | grep -q 'pin_reconcile_begin under_inherited_lock' && pass "pair APPLY under inherited lock" || fail "pair missing under-lock APPLY"
echo "$PAIR_SRC" | grep -q 'WOODRIGHT_SKIP_PIN_RECONCILE=1 after runtime mutation' && pass "skip pin rolls back" || fail "skip pin rollback missing"
if echo "$PAIR_SRC" | grep -q 'AFTER this script exits'; then fail "stale post-lock APPLY instruction"; else pass "no post-lock APPLY instruction"; fi
PIN_SRC="$(cat "$ROOT/scripts/release/reconcile-public-image-pins.sh")"
echo "$PIN_SRC" | grep -q 'mode=inherited' && pass "pin reconciler supports inherited lock" || fail "pin reconciler missing inherit"
echo "$PIN_SRC" | grep -q 'inherited_lock_retained_by_parent' && pass "pin reconciler retains parent lock" || fail "pin reconciler releases parent"
echo "$PIN_SRC" | grep -q 'path_ok' && pass "pin inherit proves FD path" || fail "pin inherit missing path proof"

# 12) forged inherit rejected by pin reconciler (no owned FD)
PIN="$ROOT/scripts/release/reconcile-public-image-pins.sh"
PINDIR="$TMP/pin-inherit"
mkdir -p "$PINDIR"
printf 'WOODRIGHT_BACKEND_IMAGE=ghcr.io/saintgroovie/woodright-backend@%s\nWOODRIGHT_STOREFRONT_IMAGE=ghcr.io/saintgroovie/woodright-storefront@%s\nSTOREFRONT_IMAGE=ghcr.io/saintgroovie/woodright-storefront@%s\n' "$OLD_BE" "$OLD_SF" "$OLD_SF" >"$PINDIR/.env"
cp "$ROOT/docker-compose.staging.yml" "$PINDIR/docker-compose.staging.yml" 2>/dev/null || printf 'services: {}\n' >"$PINDIR/docker-compose.staging.yml"
touch "$PINDIR/live-cutover.lock"
if WOODRIGHT_STAGING_MUTATION_LOCK_HELD=1 _WR_STAGING_LOCK_OWNED=0 \
  EXPECTED_RELEASE_SHA="$SHA40" EXPECTED_BACKEND_DIGEST="$BE_DIG" EXPECTED_STOREFRONT_DIGEST="$SF_DIG" \
  ENV_FILE="$PINDIR/.env" COMPOSE_FILE="$PINDIR/docker-compose.staging.yml" \
  UPDATE_PINS=0 UPDATE_ACTIVE_PUBLIC=0 UPDATE_ACTIVE_RELEASE=0 REQUIRE_LIVE_MATCH=0 SKIP_COMPOSE_VALIDATE=1 \
  WOODRIGHT_PIN_RECONCILE_ALLOW_TEST_LOCK=1 WOODRIGHT_CUTOVER_LOCK_PATH="$PINDIR/live-cutover.lock" \
  APPLY=0 bash "$PIN" >/dev/null 2>&1; then
  fail "forged pin inherit accepted"
else
  pass "forged pin inherit rejected"
fi
# OWNED=1 with unrelated open FD 9 (not lock path, no holder) must fail
if (
  exec 9>/dev/null
  export WOODRIGHT_STAGING_MUTATION_LOCK_HELD=1 _WR_STAGING_LOCK_OWNED=1
  unset WR_STAGING_FCNTL_HOLDER_9 || true
  EXPECTED_RELEASE_SHA="$SHA40" EXPECTED_BACKEND_DIGEST="$BE_DIG" EXPECTED_STOREFRONT_DIGEST="$SF_DIG" \
    ENV_FILE="$PINDIR/.env" COMPOSE_FILE="$PINDIR/docker-compose.staging.yml" \
    UPDATE_PINS=0 UPDATE_ACTIVE_PUBLIC=0 UPDATE_ACTIVE_RELEASE=0 REQUIRE_LIVE_MATCH=0 SKIP_COMPOSE_VALIDATE=1 \
    WOODRIGHT_PIN_RECONCILE_ALLOW_TEST_LOCK=1 WOODRIGHT_CUTOVER_LOCK_PATH="$PINDIR/live-cutover.lock" \
    APPLY=0 bash "$PIN"
) >/dev/null 2>&1; then
  fail "unrelated FD9 inherit accepted"
else
  pass "unrelated FD9 inherit rejected"
fi

# real inherit: hold lock via shared helper, run pin dry-run nested
# shellcheck source=/dev/null
source "$LOCK"
export WR_STAGING_MUTATION_LOCK_PATH="$PINDIR/live-cutover.lock"
export WR_STAGING_MUTATION_LOCK_ALLOW_NONCANONICAL=1
wr_staging_mutation_lock_acquire actor=pin-parent command=test
wr_staging_mutation_lock_export_inherit
EXPECTED_RELEASE_SHA="$SHA40" EXPECTED_BACKEND_DIGEST="$BE_DIG" EXPECTED_STOREFRONT_DIGEST="$SF_DIG" \
  ENV_FILE="$PINDIR/.env" COMPOSE_FILE="$PINDIR/docker-compose.staging.yml" \
  UPDATE_PINS=0 UPDATE_ACTIVE_PUBLIC=0 UPDATE_ACTIVE_RELEASE=0 REQUIRE_LIVE_MATCH=0 SKIP_COMPOSE_VALIDATE=1 \
  WOODRIGHT_PIN_RECONCILE_ALLOW_TEST_LOCK=1 WOODRIGHT_CUTOVER_LOCK_PATH="$PINDIR/live-cutover.lock" \
  APPLY=0 bash "$PIN" >"$TMP/pin-inherit.out" 2>&1 || true
if grep -q 'mode=inherited' "$TMP/pin-inherit.out"; then
  pass "pin reconciler inherits parent lock"
else
  fail "pin reconciler did not inherit"
  cat "$TMP/pin-inherit.out" || true
fi
wr_staging_mutation_lock_release

# 13) dynamic pair rollback: keepers + pin SoT restore + digest/SHA identity
RB="$TMP/rollback-dyn"
mkdir -p "$RB/state/containers" "$RB/state/networks" "$RB/state/log" \
  "$RB/evidence/pin-backup" "$RB/evidence/json" \
  "$RB/pins" "$RB/compose"
setup_state "$RB/state"
# seed pin SoT under test roots (operator-writable; no sudo needed)
printf 'WOODRIGHT_BACKEND_IMAGE=old-be\nWOODRIGHT_STOREFRONT_IMAGE=old-sf\n' >"$RB/pins/DOKPLOY_IMAGE_PINS.env"
printf '{"release_sha":"7628056dcc1d150745de1b0fa881f1e9d36b798b"}\n' >"$RB/pins/ACTIVE_PUBLIC.json"
printf '{"env":"public_demo"}\n' >"$RB/pins/public-demo.json"
printf 'STOREFRONT_IMAGE=old\nBACKEND_IMAGE=old\n' >"$RB/compose/.env"
cp -p "$RB/pins/DOKPLOY_IMAGE_PINS.env" "$RB/evidence/pin-backup/DOKPLOY_IMAGE_PINS.env"
cp -p "$RB/pins/ACTIVE_PUBLIC.json" "$RB/evidence/pin-backup/ACTIVE_PUBLIC.json"
cp -p "$RB/pins/public-demo.json" "$RB/evidence/pin-backup/public-demo.json"
cp -p "$RB/compose/.env" "$RB/evidence/pin-backup/dokploy-compose.env"
# Simulate partial mutation: live containers replaced with target digests; keepers hold old
python3 - "$RB/state" "$OLD_BE" "$OLD_SF" "$BE_DIG" "$SF_DIG" "$SHA40" <<'PY'
import json,os,sys
state,old_be,old_sf,be,sf,sha=sys.argv[1:7]
ctr_dir=os.path.join(state,"containers")
def load(n): return json.load(open(os.path.join(ctr_dir,n+".json")))
def dump(n,d): json.dump(d, open(os.path.join(ctr_dir,n+".json"),"w"))
be_old=load("woodright-staging-backend")
sf_old=load("woodright-staging-storefront")
dump("woodright-staging-backend-keeper-test", be_old)
dump("woodright-staging-storefront-keeper-test", sf_old)
def retarget(d, dig, sha):
  d[0]["Image"]=dig.replace("@","@id-")
  d[0]["RepoDigests"]=[f"ghcr.io/x@{dig}"]
  d[0]["Config"]["Image"]=f"ghcr.io/saintgroovie/woodright-x@{dig}"
  d[0]["Config"]["Labels"]["com.woodright.release-sha"]=sha
  return d
dump("woodright-staging-backend", retarget(load("woodright-staging-backend"), be, sha))
dump("woodright-staging-storefront", retarget(load("woodright-staging-storefront"), sf, sha))
os.remove(os.path.join(ctr_dir,"woodright-staging-backend.json")) if False else None
PY
# corrupt live pin SoT (must be restored from backup)
printf 'WOODRIGHT_BACKEND_IMAGE=CORRUPT\nWOODRIGHT_STOREFRONT_IMAGE=CORRUPT\n' >"$RB/pins/DOKPLOY_IMAGE_PINS.env"
printf '{"release_sha":"deadbeef"}\n' >"$RB/pins/ACTIVE_PUBLIC.json"
printf '{"env":"corrupt"}\n' >"$RB/pins/public-demo.json"
printf 'STOREFRONT_IMAGE=CORRUPT\n' >"$RB/compose/.env"

export WOODRIGHT_FAKE_DOCKER_STATE="$RB/state"
export WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION=1
export WOODRIGHT_ROLLBACK_POLL_SLEEP_SEC=0
export WR_STAGING_MUTATION_LOCK_PATH="$RB/live-cutover.lock"
export WR_STAGING_MUTATION_LOCK_ALLOW_NONCANONICAL=1
touch "$RB/live-cutover.lock"
# shellcheck source=/dev/null
source "$LOCK"
wr_staging_mutation_lock_acquire actor=pair-rb-test command=test
wr_staging_mutation_lock_export_inherit

# Override install targets via env? pair_rollback hardcodes paths.
# Exercise helpers + wr_cutover_install_file against test roots instead.
BE_RB="$ROOT/ops/release/rollback-staging-backend-from-keeper.sh"
SF_RB="$ROOT/ops/release/rollback-staging-storefront-from-keeper.sh"
if ! bash "$BE_RB" --environment staging \
  --keep-name woodright-staging-backend-keeper-test \
  --evidence-dir "$RB/evidence"; then
  fail "backend keeper rollback failed"
else
  pass "backend keeper rollback executed"
fi
if ! bash "$SF_RB" --environment staging \
  --keep-name woodright-staging-storefront-keeper-test \
  --evidence-dir "$RB/evidence"; then
  fail "storefront keeper rollback failed"
else
  pass "storefront keeper rollback executed"
fi

# pin restore via common helper into test roots
# shellcheck source=/dev/null
source "$COMMON"
wr_cutover_install_file "$RB/evidence/pin-backup/DOKPLOY_IMAGE_PINS.env" "$RB/pins/DOKPLOY_IMAGE_PINS.env"
wr_cutover_install_file "$RB/evidence/pin-backup/ACTIVE_PUBLIC.json" "$RB/pins/ACTIVE_PUBLIC.json"
wr_cutover_install_file "$RB/evidence/pin-backup/public-demo.json" "$RB/pins/public-demo.json"
wr_cutover_install_file "$RB/evidence/pin-backup/dokploy-compose.env" "$RB/compose/.env"

# Assert restored container digests/sha match keepers' old identity
be_blob="$(WOODRIGHT_FAKE_DOCKER_STATE="$RB/state" "$FAKE_DOCKER/docker" inspect woodright-staging-backend --format '{{json .RepoDigests}}{{.Config.Image}}')"
sf_blob="$(WOODRIGHT_FAKE_DOCKER_STATE="$RB/state" "$FAKE_DOCKER/docker" inspect woodright-staging-storefront --format '{{json .RepoDigests}}{{.Config.Image}}')"
be_sha="$(WOODRIGHT_FAKE_DOCKER_STATE="$RB/state" "$FAKE_DOCKER/docker" inspect woodright-staging-backend --format '{{index .Config.Labels "com.woodright.release-sha"}}')"
sf_sha="$(WOODRIGHT_FAKE_DOCKER_STATE="$RB/state" "$FAKE_DOCKER/docker" inspect woodright-staging-storefront --format '{{index .Config.Labels "com.woodright.release-sha"}}')"
echo "$be_blob" | grep -q "${OLD_BE#sha256:}" && pass "backend digest restored from keeper" || fail "backend digest not restored ($be_blob)"
echo "$sf_blob" | grep -q "${OLD_SF#sha256:}" && pass "storefront digest restored from keeper" || fail "storefront digest not restored ($sf_blob)"
[[ "$be_sha" == "7628056dcc1d150745de1b0fa881f1e9d36b798b" ]] && pass "backend release-sha restored" || fail "backend sha=$be_sha"
[[ "$sf_sha" == "7628056dcc1d150745de1b0fa881f1e9d36b798b" ]] && pass "storefront release-sha restored" || fail "storefront sha=$sf_sha"
grep -q 'old-be' "$RB/pins/DOKPLOY_IMAGE_PINS.env" && pass "pins restored" || fail "pins not restored"
grep -q '7628056d' "$RB/pins/ACTIVE_PUBLIC.json" && pass "ACTIVE_PUBLIC restored" || fail "ACTIVE_PUBLIC not restored"
grep -q 'public_demo' "$RB/pins/public-demo.json" && pass "public-demo.json restored" || fail "public-demo.json not restored"
grep -q 'STOREFRONT_IMAGE=old' "$RB/compose/.env" && pass "compose .env restored" || fail "compose .env not restored"
# identity_verified markers
grep -q 'identity_verified.:true' "$RB/evidence/json/backend-rollback-result.json" && pass "backend rollback identity evidence" || fail "backend identity evidence missing"
grep -q 'identity_verified.:true' "$RB/evidence/json/storefront-rollback-result.json" && pass "storefront rollback identity evidence" || fail "storefront identity evidence missing"
# keepers consumed
if [[ -f "$RB/state/containers/woodright-staging-backend-keeper-test.json" ]]; then
  fail "backend keeper still present after rename"
else
  pass "backend keeper consumed"
fi
if [[ -f "$RB/state/containers/woodright-staging-storefront-keeper-test.json" ]]; then
  fail "storefront keeper still present after rename"
else
  pass "storefront keeper consumed"
fi
wr_staging_mutation_lock_release
export WOODRIGHT_FAKE_DOCKER_STATE="$TMP/state"
export WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION=0

if [[ "$FAILED" -eq 0 ]]; then
  echo "OK public-demo pair cutover fidelity ($TMP)"
  exit 0
fi
echo "FAILED count=$FAILED"
exit 1
