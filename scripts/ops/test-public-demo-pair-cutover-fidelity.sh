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
  # Real docker container inspect has no .RepoDigests — fail closed like Docker template error
  sys.stderr.write('template parsing error: map has no entry for key "RepoDigests"\n')
  sys.exit(1)
elif "runtime-role" in fmt:
  print((d.get("Config") or {}).get("Labels",{}).get("com.woodright.runtime-role",""))
elif "release-sha" in fmt:
  print((d.get("Config") or {}).get("Labels",{}).get("com.woodright.release-sha",""))
elif "deployment-owner" in fmt:
  print((d.get("Config") or {}).get("Labels",{}).get("com.woodright.deployment-owner",""))
elif "exposure" in fmt and "com.woodright.exposure" in fmt:
  print((d.get("Config") or {}).get("Labels",{}).get("com.woodright.exposure",""))
elif "database-identity" in fmt:
  print((d.get("Config") or {}).get("Labels",{}).get("com.woodright.database-identity",""))
elif "image.title" in fmt or "org.opencontainers.image.title" in fmt:
  print((d.get("Config") or {}).get("Labels",{}).get("org.opencontainers.image.title",""))
elif "compose.project" in fmt:
  print((d.get("Config") or {}).get("Labels",{}).get("com.docker.compose.project",""))
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
elif "RepoDigests" in fmt:
  digs=d.get("RepoDigests") or []
  print(digs[0] if digs else "")
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
import json,sys,os
src,dst,name=sys.argv[1],sys.argv[2],sys.argv[3]
d=json.load(open(src))
d[0]["Name"]="/"+name
d[0]["Id"]="id-"+name
if os.environ.get("WOODRIGHT_FAKE_DOCKER_CORRUPT_RENAME")=="1" and "keeper" in src:
  bad="sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  d[0]["Image"]=bad
  d[0].pop("RepoDigests", None)
  title="woodright-storefront" if "storefront" in name else "woodright-backend"
  d[0]["Config"]["Image"]=f"ghcr.io/saintgroovie/{title}@"+bad
json.dump(d, open(dst,"w"))
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
  title = "woodright-storefront" if "storefront" in name else "woodright-backend"
  return [{
    "Id": f"id-{name}",
    "Name": f"/{name}",
    "Image": image,
    "Config": {
      "Image": f"ghcr.io/saintgroovie/{title}@{image}",
      "Env": ["WOODRIGHT_RUNTIME_ROLE=public_demo","WOODRIGHT_DATABASE_IDENTITY_ALIAS=public_demo_db","MOCK_SECRET_VALUE=should-not-leak","PATH=/usr/bin"],
      "Labels": {
        "com.woodright.runtime-role": role,
        "com.woodright.deployment-owner": "Dokploy",
        "com.woodright.exposure": "public",
        "com.woodright.database-identity": "public_demo_db",
        "com.woodright.release-sha": "7628056dcc1d150745de1b0fa881f1e9d36b798b",
        "org.opencontainers.image.revision": "7628056dcc1d150745de1b0fa881f1e9d36b798b",
        "org.opencontainers.image.title": title,
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
def write_image(dig, title, sha="7628056dcc1d150745de1b0fa881f1e9d36b798b"):
  img=f"ghcr.io/saintgroovie/{title}@{dig}"
  doc={"Id": dig, "RepoDigests": [f"ghcr.io/saintgroovie/{title}@{dig}"], "Config": {"Labels": {
    "org.opencontainers.image.revision": sha,
    "org.opencontainers.image.title": title,
    "com.woodright.deployment-owner": "Dokploy",
  }}}
  open(os.path.join(state,"images",dig.replace("/","_")+".json"),"w").write(json.dumps(doc))
  open(os.path.join(state,"images",img.replace("/","_")+".json"),"w").write(json.dumps(doc))
open(os.path.join(state,"containers","woodright-staging-backend.json"),"w").write(json.dumps(ctr("woodright-staging-backend", old_be)))
open(os.path.join(state,"containers","woodright-staging-storefront.json"),"w").write(json.dumps(ctr("woodright-staging-storefront", old_sf)))
# production must exist for exclusion checks but never be target
open(os.path.join(state,"containers","woodright-production-backend.json"),"w").write(json.dumps(ctr("woodright-production-backend", old_be, role="production_candidate")))
write_image(old_be, "woodright-backend")
write_image(old_sf, "woodright-storefront")
PY
  # target images with revision labels
  python3 - "$state" "$BE_DIG" "$SF_DIG" "$SHA40" <<'PY'
import json,sys,os
state,be,sf,sha=sys.argv[1:5]
for dig,title in ((be,"woodright-backend"),(sf,"woodright-storefront")):
  img=f"ghcr.io/saintgroovie/{title}@{dig}"
  doc={"Id": dig, "RepoDigests": [f"ghcr.io/saintgroovie/{title}@{dig}"], "Config": {"Labels": {
    "org.opencontainers.image.revision": sha,
    "org.opencontainers.image.title": title,
    "com.woodright.deployment-owner": "Dokploy",
  }}}
  open(os.path.join(state,"images",dig.replace("/","_")+".json"),"w").write(json.dumps(doc))
  open(os.path.join(state,"images",img.replace("/","_")+".json"),"w").write(json.dumps(doc))
PY
}

export PATH="$FAKE_DOCKER:$PATH"
export WOODRIGHT_DOCKER_BIN="$FAKE_DOCKER/docker"
export WOODRIGHT_FAKE_DOCKER_STATE="$TMP/state"
export WOODRIGHT_ALLOW_MISSING_LOCAL_IMAGE=0
export SKIP_MONITOR=1
export SKIP_BACKUP=1
export SKIP_SMOKE=1
export WOODRIGHT_VALIDATION_FREEZE_DIR="$TMP/freeze"
mkdir -p "$TMP/freeze"

# Owner-approved fixture under WOODRIGHT_META_ROOT (canonical path layout).
mkdir -p "$TMP/meta/public_demo"
cat >"$TMP/meta/public_demo/OWNER_APPROVED_RELEASE.json" <<EOF
{
  "schema_version": 1,
  "environment": "public_demo",
  "application_sha": "${SHA40}",
  "backend_digest": "${BE_DIG}",
  "storefront_digest": "${SF_DIG}",
  "owner_decision": "approved",
  "owner_authorization_id": "OWNER-PASS-fixture-pair-cutover-fidelity",
  "issued_at": "1970-01-01T00:00:00Z",
  "tooling_schema_version": "owner-approved-release-v1"
}
EOF
chmod 0644 "$TMP/meta/public_demo/OWNER_APPROVED_RELEASE.json"
export WOODRIGHT_META_ROOT="$TMP/meta"
unset WOODRIGHT_OWNER_APPROVED_RELEASE_PATH
unset WOODRIGHT_OWNER_APPROVAL_FIXTURE

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
  bash "$SF" --environment public_demo --component storefront --mode dry-run \
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
if bash "$SF" --environment production --component storefront --mode dry-run \
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
# --expected-old-sha requires both commits in the local git object store.
# GitHub Actions shallow clones often lack historical SHAs; omit the gate arg
# when objects are missing so the rest of the dry-run still runs.
PAIR_DRY_EXTRA=()
OLD_SHA_FOR_GATE="7628056dcc1d150745de1b0fa881f1e9d36b798b"
if git -C "$ROOT" cat-file -e "${OLD_SHA_FOR_GATE}^{commit}" 2>/dev/null \
  && git -C "$ROOT" cat-file -e "${SHA40}^{commit}" 2>/dev/null; then
  PAIR_DRY_EXTRA=(--expected-old-sha "$OLD_SHA_FOR_GATE")
else
  echo "NOTE: skipping --expected-old-sha (git objects not present in this clone)" >&2
fi
if bash "$PAIR" --environment public_demo --component pair --mode dry-run \
  --target-sha "$SHA40" \
  --backend-digest "$BE_DIG" \
  --storefront-digest "$SF_DIG" \
  --evidence-dir "$EV2" \
  "${PAIR_DRY_EXTRA[@]}"; then
  pass "pair dry-run exit 0"
else
  fail "pair dry-run failed"
fi
if [[ -f "$TMP/state/log/mutations.log" ]]; then fail "pair dry-run mutated"; else pass "pair dry-run no mutation"; fi

# 5b) pair dry-run binds verified peer digests (release 74fbad4 regression)
if [[ -f "$EV2/json/owner-approval-peer-sf-digest.txt" ]] \
  && [[ "$(cat "$EV2/json/owner-approval-peer-sf-digest.txt")" == "$SF_DIG" ]] \
  && [[ -f "$EV2/json/owner-approval-peer-be-digest.txt" ]] \
  && [[ "$(cat "$EV2/json/owner-approval-peer-be-digest.txt")" == "$BE_DIG" ]]; then
  pass "pair dry-run wrote verified peer digest evidence"
else
  fail "pair dry-run missing/wrong peer digest evidence"
fi
# Nested BE gate under REQUIRE_PAIR must PASS using bound peer SF without manual export
# shellcheck source=/dev/null
source "$ROOT/ops/lib/woodright-owner-approved-release.sh"
export WOODRIGHT_OWNER_APPROVAL_REQUIRE_PAIR=1
unset WOODRIGHT_OWNER_APPROVAL_PEER_SF_DIGEST WOODRIGHT_OWNER_APPROVAL_PEER_BE_DIGEST
unset EXPECTED_STOREFRONT_DIGEST EXPECTED_BACKEND_DIGEST
# Simulate pre-fix nested call (empty peer) → MISMATCH
if wr_require_owner_approved_release public_demo "$SHA40" "$BE_DIG" "" "$TMP/ev-reg-empty" gate_a_backend 2>/dev/null; then
  fail "REQUIRE_PAIR with empty peer SF accepted (pre-fix bug still present)"
else
  [[ "${WR_OWNER_APPROVAL_RESULT:-}" == "OWNER_APPROVAL_MISMATCH" ]] \
    && pass "regression: empty peer SF under REQUIRE_PAIR → MISMATCH" \
    || fail "empty peer token=${WR_OWNER_APPROVAL_RESULT:-}"
fi
# After pair bind: peer SF = plan SF → PASS (manual env not required)
export WOODRIGHT_OWNER_APPROVAL_PEER_SF_DIGEST="$SF_DIG"
export WOODRIGHT_OWNER_APPROVAL_PEER_BE_DIGEST="$BE_DIG"
if wr_require_owner_approved_release public_demo "$SHA40" "$BE_DIG" "$WOODRIGHT_OWNER_APPROVAL_PEER_SF_DIGEST" "$TMP/ev-reg-ok" gate_a_backend; then
  pass "regression: nested BE gate PASS with pair-bound peer SF"
else
  fail "nested BE gate failed with bound peer SF result=${WR_OWNER_APPROVAL_RESULT:-}"
fi
if wr_require_owner_approved_release public_demo "$SHA40" "$WOODRIGHT_OWNER_APPROVAL_PEER_BE_DIGEST" "$SF_DIG" "$TMP/ev-reg-sf" gate_a_storefront; then
  pass "regression: nested SF gate PASS with pair-bound peer BE"
else
  fail "nested SF gate failed with bound peer BE result=${WR_OWNER_APPROVAL_RESULT:-}"
fi
unset WOODRIGHT_OWNER_APPROVAL_REQUIRE_PAIR
unset WOODRIGHT_OWNER_APPROVAL_PEER_SF_DIGEST WOODRIGHT_OWNER_APPROVAL_PEER_BE_DIGEST

# 5c) spoofed caller peer refused before mutation
EV_SPOOF="$TMP/ev-pair-spoof"
mkdir -p "$EV_SPOOF"
BAD_PEER="sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
set +e
WOODRIGHT_OWNER_APPROVAL_PEER_SF_DIGEST="$BAD_PEER" \
  bash "$PAIR" --environment public_demo --component pair --mode dry-run \
  --target-sha "$SHA40" --backend-digest "$BE_DIG" --storefront-digest "$SF_DIG" \
  --evidence-dir "$EV_SPOOF" >"$TMP/spoof.out" 2>&1
SPOOF_RC=$?
set -e
if [[ "$SPOOF_RC" -ne 0 ]] && grep -qi 'PEER_SF_DIGEST mismatch\|spoof\|mismatch vs pair plan' "$TMP/spoof.out"; then
  pass "spoofed caller peer SF refused"
else
  fail "spoofed caller peer SF accepted (rc=$SPOOF_RC)"
  cat "$TMP/spoof.out" || true
fi
if [[ -f "$TMP/state/log/mutations.log" ]]; then fail "spoof attempt mutated"; else pass "spoof attempt no mutation"; fi
# Matching caller peer is allowed (idempotent with plan)
EV_OKPEER="$TMP/ev-pair-okpeer"
mkdir -p "$EV_OKPEER"
if WOODRIGHT_OWNER_APPROVAL_PEER_SF_DIGEST="$SF_DIG" \
  WOODRIGHT_OWNER_APPROVAL_PEER_BE_DIGEST="$BE_DIG" \
  bash "$PAIR" --environment public_demo --component pair --mode dry-run \
  --target-sha "$SHA40" --backend-digest "$BE_DIG" --storefront-digest "$SF_DIG" \
  --evidence-dir "$EV_OKPEER"; then
  pass "matching caller peer env accepted"
else
  fail "matching caller peer env rejected"
fi

# 5d) single-component storefront still does not require pair peer when REQUIRE_PAIR unset
unset WOODRIGHT_OWNER_APPROVAL_REQUIRE_PAIR
unset WOODRIGHT_OWNER_APPROVAL_PEER_SF_DIGEST WOODRIGHT_OWNER_APPROVAL_PEER_BE_DIGEST
EV_SC="$TMP/ev-sf-single"
mkdir -p "$EV_SC"
rm -f "$TMP/state/log/mutations.log"
if WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION=0 \
  bash "$SF" --environment public_demo --component storefront --mode dry-run \
  --image "ghcr.io/saintgroovie/woodright-storefront@${SF_DIG}" \
  --digest "$SF_DIG" --target-sha "$SHA40" \
  --keep-name "woodright-staging-storefront-keeper-single" \
  --env-file "$ENVF" --evidence-dir "$EV_SC"; then
  pass "single-component SF dry-run still works without pair peer env"
else
  fail "single-component SF dry-run broken by pair peer fix"
fi

# 6) pair missing confirm on execute should fail before mutation
if bash "$PAIR" --environment public_demo --component pair --mode execute \
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
  grep -q 'LIVE_MUTATING=true' "$ROOT/$rel" && pass "$rel LIVE_MUTATING" || fail "$rel LIVE_MUTATING"
  grep -qE 'live-cutover\.lock|woodright-staging-mutation-lock' "$ROOT/$rel" && pass "$rel lock" || fail "$rel lock"
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
if WOODRIGHT_PENDING_MIGRATION=1 bash "$PAIR" --environment public_demo --component pair --mode dry-run \
  --target-sha "$SHA40" --backend-digest "$BE_DIG" --storefront-digest "$SF_DIG" \
  --evidence-dir "$EV3" 2>/dev/null; then
  fail "pending migration allowed"
else
  pass "pending migration refused"
fi

# 11) pin lifecycle: SUCCESS only after under-lock APPLY; inherit supported
grep -q 'UPDATE_ACTIVE_RELEASE=0' "$PAIR" && pass "pair forces UPDATE_ACTIVE_RELEASE=0" || fail "pair missing UPDATE_ACTIVE_RELEASE=0"
grep -q 'UPDATE_SCOPED_OWNERSHIP=1' "$PAIR" && pass "pair converges scoped OWNER/EXPECTED" || fail "pair missing UPDATE_SCOPED_OWNERSHIP=1"
grep -q 'wr_cutover_install_file\|wr_cutover_pair_rollback' "$PAIR" && pass "pair uses sudo-aware pin restore" || fail "pair missing wr_cutover_install_file"
grep -q 'sudo -n cp' "$COMMON" && pass "common pin backup/install supports sudo -n" || fail "common missing sudo -n cp"
grep -q 'pin_reconcile_begin under_inherited_lock' "$PAIR" && pass "pair APPLY under inherited lock" || fail "pair missing under-lock APPLY"
grep -q 'WOODRIGHT_SKIP_PIN_RECONCILE=1 after runtime mutation' "$PAIR" && pass "skip pin rolls back" || fail "skip pin rollback missing"
if grep -q 'AFTER this script exits' "$PAIR"; then fail "stale post-lock APPLY instruction"; else pass "no post-lock APPLY instruction"; fi
PIN="$ROOT/scripts/release/reconcile-public-image-pins.sh"
grep -q 'mode=inherited' "$PIN" && pass "pin reconciler supports inherited lock" || fail "pin reconciler missing inherit"
grep -q 'inherited_lock_retained_by_parent' "$PIN" && pass "pin reconciler retains parent lock" || fail "pin reconciler releases parent"
grep -q 'path_ok' "$PIN" && pass "pin inherit proves FD path" || fail "pin inherit missing path proof"

# 12) forged inherit rejected by pin reconciler (no owned FD)
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
  APPLY=0 bash "$PIN" --environment public_demo --component pair >/dev/null 2>&1; then
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
    APPLY=0 bash "$PIN" --environment public_demo --component pair
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
  APPLY=0 bash "$PIN" --environment public_demo --component pair >"$TMP/pin-inherit.out" 2>&1 || true
if grep -q 'mode=inherited' "$TMP/pin-inherit.out"; then
  pass "pin reconciler inherits parent lock"
else
  fail "pin reconciler did not inherit"
  cat "$TMP/pin-inherit.out" || true
fi
wr_staging_mutation_lock_release

# 13) dynamic pair_rollback orchestrator (keepers + pin SoT) + identity fail-closed
RB="$TMP/rollback-dyn"
mkdir -p "$RB/state/containers" "$RB/state/networks" "$RB/state/log" \
  "$RB/evidence/pin-backup" "$RB/evidence/json" \
  "$RB/pins" "$RB/compose" "$RB/own"
setup_state "$RB/state"
printf 'WOODRIGHT_BACKEND_IMAGE=old-be\nWOODRIGHT_STOREFRONT_IMAGE=old-sf\n' >"$RB/pins/DOKPLOY_IMAGE_PINS.env"
printf '{"release_sha":"7628056dcc1d150745de1b0fa881f1e9d36b798b"}\n' >"$RB/pins/ACTIVE_PUBLIC.json"
printf '{"env":"public_demo"}\n' >"$RB/pins/public-demo.json"
printf 'STOREFRONT_IMAGE=old\nBACKEND_IMAGE=old\n' >"$RB/compose/.env"
printf '{"approved_git_sha":"7628056dcc1d150745de1b0fa881f1e9d36b798b","desired_git_sha":"7628056dcc1d150745de1b0fa881f1e9d36b798b"}\n' >"$RB/own/ACTIVE_OWNER.json"
printf '{"application_source_sha":"7628056dcc1d150745de1b0fa881f1e9d36b798b","release_sha":"7628056dcc1d150745de1b0fa881f1e9d36b798b"}\n' >"$RB/own/EXPECTED_RELEASE.json"
cp -p "$RB/pins/DOKPLOY_IMAGE_PINS.env" "$RB/evidence/pin-backup/DOKPLOY_IMAGE_PINS.env"
cp -p "$RB/pins/ACTIVE_PUBLIC.json" "$RB/evidence/pin-backup/ACTIVE_PUBLIC.json"
cp -p "$RB/pins/public-demo.json" "$RB/evidence/pin-backup/public-demo.json"
cp -p "$RB/compose/.env" "$RB/evidence/pin-backup/dokploy-compose.env"
cp -p "$RB/own/ACTIVE_OWNER.json" "$RB/evidence/pin-backup/ACTIVE_OWNER.json"
cp -p "$RB/own/EXPECTED_RELEASE.json" "$RB/evidence/pin-backup/EXPECTED_RELEASE.json"
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
def retarget(d, dig, sha, title):
  d[0]["Image"]=dig
  d[0].pop("RepoDigests", None)
  d[0]["Config"]["Image"]=f"ghcr.io/saintgroovie/{title}@{dig}"
  d[0]["Config"]["Labels"]["com.woodright.release-sha"]=sha
  d[0]["Config"]["Labels"]["org.opencontainers.image.revision"]=sha
  img=f"ghcr.io/saintgroovie/{title}@{dig}"
  doc={"Id": dig, "RepoDigests": [img], "Config": {"Labels": {
    "org.opencontainers.image.revision": sha,
    "org.opencontainers.image.title": title,
  }}}
  imgdir=os.path.join(state,"images")
  open(os.path.join(imgdir, dig.replace("/","_")+".json"),"w").write(json.dumps(doc))
  open(os.path.join(imgdir, img.replace("/","_")+".json"),"w").write(json.dumps(doc))
  return d
dump("woodright-staging-backend", retarget(load("woodright-staging-backend"), be, sha, "woodright-backend"))
dump("woodright-staging-storefront", retarget(load("woodright-staging-storefront"), sf, sha, "woodright-storefront"))
PY
printf 'WOODRIGHT_BACKEND_IMAGE=CORRUPT\nWOODRIGHT_STOREFRONT_IMAGE=CORRUPT\n' >"$RB/pins/DOKPLOY_IMAGE_PINS.env"
printf '{"release_sha":"deadbeef"}\n' >"$RB/pins/ACTIVE_PUBLIC.json"
printf '{"env":"corrupt"}\n' >"$RB/pins/public-demo.json"
printf 'STOREFRONT_IMAGE=CORRUPT\n' >"$RB/compose/.env"
printf '{"approved_git_sha":"deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"}\n' >"$RB/own/ACTIVE_OWNER.json"
printf '{"application_source_sha":"deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"}\n' >"$RB/own/EXPECTED_RELEASE.json"

export WOODRIGHT_FAKE_DOCKER_STATE="$RB/state"
export WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION=1
export WOODRIGHT_ROLLBACK_POLL_SLEEP_SEC=0
export WOODRIGHT_CUTOVER_PINS_ENV="$RB/pins/DOKPLOY_IMAGE_PINS.env"
export WOODRIGHT_CUTOVER_ACTIVE_PUBLIC="$RB/pins/ACTIVE_PUBLIC.json"
export WOODRIGHT_CUTOVER_PUBLIC_DEMO_JSON="$RB/pins/public-demo.json"
export WOODRIGHT_CUTOVER_COMPOSE_ENV="$RB/compose/.env"
export WOODRIGHT_CUTOVER_ALLOW_TEST_PATHS=1
export WOODRIGHT_CUTOVER_ACTIVE_OWNER="$RB/own/ACTIVE_OWNER.json"
export WOODRIGHT_CUTOVER_EXPECTED_RELEASE="$RB/own/EXPECTED_RELEASE.json"
export WR_STAGING_MUTATION_LOCK_PATH="$RB/live-cutover.lock"
export WR_STAGING_MUTATION_LOCK_ALLOW_NONCANONICAL=1
touch "$RB/live-cutover.lock"
# shellcheck source=/dev/null
source "$LOCK"
# shellcheck source=/dev/null
source "$COMMON"
wr_staging_mutation_lock_acquire actor=pair-rb-test command=test
wr_staging_mutation_lock_export_inherit

set +e
wr_cutover_pair_rollback \
  "$RB/evidence" \
  "woodright-staging-backend-keeper-test" \
  "woodright-staging-storefront-keeper-test" \
  "$ROOT/ops/release/rollback-staging-backend-from-keeper.sh" \
  "$ROOT/ops/release/rollback-staging-storefront-from-keeper.sh"
RB_RC=$?
set -e
[[ "$RB_RC" -eq 10 ]] && pass "wr_cutover_pair_rollback RC=10" || fail "pair_rollback RC=$RB_RC want 10"
[[ -f "$RB/evidence/json/pair-rollback-result.json" ]] || fail "missing pair-rollback-result.json"
grep -q '"backend":1' "$RB/evidence/json/pair-rollback-result.json" && pass "pair-rollback backend ok flag" || fail "pair-rollback backend flag"
grep -q '"storefront":1' "$RB/evidence/json/pair-rollback-result.json" && pass "pair-rollback storefront ok flag" || fail "pair-rollback storefront flag"
grep -q '"pins":1' "$RB/evidence/json/pair-rollback-result.json" && pass "pair-rollback pins ok flag" || fail "pair-rollback pins flag"

be_dig="$(WOODRIGHT_DOCKER_BIN="$FAKE_DOCKER/docker" WOODRIGHT_FAKE_DOCKER_STATE="$RB/state" bash -c 'source "'"$COMMON"'"; wr_cutover_container_immutable_digest woodright-staging-backend backend')"
sf_dig="$(WOODRIGHT_DOCKER_BIN="$FAKE_DOCKER/docker" WOODRIGHT_FAKE_DOCKER_STATE="$RB/state" bash -c 'source "'"$COMMON"'"; wr_cutover_container_immutable_digest woodright-staging-storefront storefront')"
be_sha="$(WOODRIGHT_FAKE_DOCKER_STATE="$RB/state" "$FAKE_DOCKER/docker" inspect woodright-staging-backend --format '{{index .Config.Labels "com.woodright.release-sha"}}')"
sf_sha="$(WOODRIGHT_FAKE_DOCKER_STATE="$RB/state" "$FAKE_DOCKER/docker" inspect woodright-staging-storefront --format '{{index .Config.Labels "com.woodright.release-sha"}}')"
[[ "$be_dig" == "$OLD_BE" ]] && pass "backend digest restored via pair_rollback" || fail "backend digest not restored have=$be_dig"
[[ "$sf_dig" == "$OLD_SF" ]] && pass "storefront digest restored via pair_rollback" || fail "storefront digest not restored have=$sf_dig"
[[ "$be_sha" == "7628056dcc1d150745de1b0fa881f1e9d36b798b" ]] && pass "backend release-sha restored" || fail "backend sha=$be_sha"
[[ "$sf_sha" == "7628056dcc1d150745de1b0fa881f1e9d36b798b" ]] && pass "storefront release-sha restored" || fail "storefront sha=$sf_sha"
grep -q 'old-be' "$RB/pins/DOKPLOY_IMAGE_PINS.env" && pass "pins restored by pair_rollback" || fail "pins not restored"
grep -q '7628056d' "$RB/pins/ACTIVE_PUBLIC.json" && pass "ACTIVE_PUBLIC restored by pair_rollback" || fail "ACTIVE_PUBLIC not restored"
grep -q 'public_demo' "$RB/pins/public-demo.json" && pass "public-demo.json restored by pair_rollback" || fail "public-demo.json not restored"
grep -q 'STOREFRONT_IMAGE=old' "$RB/compose/.env" && pass "compose .env restored by pair_rollback" || fail "compose .env not restored"
grep -q '7628056d' "$RB/own/ACTIVE_OWNER.json" && pass "ACTIVE_OWNER restored by pair_rollback" || fail "ACTIVE_OWNER not restored"
grep -q '7628056d' "$RB/own/EXPECTED_RELEASE.json" && pass "EXPECTED_RELEASE restored by pair_rollback" || fail "EXPECTED_RELEASE not restored"
grep -q 'identity_verified.:true' "$RB/evidence/json/backend-rollback-result.json" && pass "backend identity evidence" || fail "backend identity evidence missing"
grep -q 'identity_verified.:true' "$RB/evidence/json/storefront-rollback-result.json" && pass "storefront identity evidence" || fail "storefront identity evidence missing"
[[ ! -f "$RB/state/containers/woodright-staging-backend-keeper-test.json" ]] && pass "backend keeper consumed" || fail "backend keeper remains"
[[ ! -f "$RB/state/containers/woodright-staging-storefront-keeper-test.json" ]] && pass "storefront keeper consumed" || fail "storefront keeper remains"
grep -q 'wr_cutover_pair_rollback' "$PAIR" && pass "pair script delegates to wr_cutover_pair_rollback" || fail "pair script missing wr_cutover_pair_rollback"
wr_staging_mutation_lock_release

# 14) negative: digest corruption on keeper rename must fail closed
NEG="$TMP/rollback-neg"
mkdir -p "$NEG/state" "$NEG/evidence/json"
setup_state "$NEG/state"
python3 - "$NEG/state" <<'PY'
import json,os,sys
state=sys.argv[1]
ctr=os.path.join(state,"containers")
sf=json.load(open(os.path.join(ctr,"woodright-staging-storefront.json")))
json.dump(sf, open(os.path.join(ctr,"woodright-staging-storefront-keeper-neg.json"),"w"))
# leave a bad live container that will be moved aside
PY
export WOODRIGHT_FAKE_DOCKER_STATE="$NEG/state"
export WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION=1
export WOODRIGHT_FAKE_DOCKER_CORRUPT_RENAME=1
export WR_STAGING_MUTATION_LOCK_PATH="$NEG/live-cutover.lock"
touch "$NEG/live-cutover.lock"
wr_staging_mutation_lock_acquire actor=neg-rb command=test
wr_staging_mutation_lock_export_inherit
set +e
bash "$ROOT/ops/release/rollback-staging-storefront-from-keeper.sh" \
  --environment public_demo \
  --keep-name woodright-staging-storefront-keeper-neg \
  --evidence-dir "$NEG/evidence" >"$NEG/out.txt" 2>&1
NEG_RC=$?
set -e
if [[ "$NEG_RC" -ne 0 ]] && grep -qiE 'digest identity mismatch|digest resolve failed|image missing|RepoDigest' "$NEG/out.txt"; then
  pass "storefront rollback fails closed on digest mismatch"
else
  fail "storefront rollback did not fail closed (rc=$NEG_RC)"
  cat "$NEG/out.txt" || true
fi
wr_staging_mutation_lock_release
unset WOODRIGHT_FAKE_DOCKER_CORRUPT_RENAME
export WOODRIGHT_FAKE_DOCKER_STATE="$TMP/state"
export WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION=0
unset WOODRIGHT_CUTOVER_PINS_ENV WOODRIGHT_CUTOVER_ACTIVE_PUBLIC WOODRIGHT_CUTOVER_PUBLIC_DEMO_JSON WOODRIGHT_CUTOVER_COMPOSE_ENV

# 15) monitor gate: read-only fail-closed; never exec HC from pair
grep -q 'assert_identity_stable_under_lock' "$PAIR" && pass "pair has TOCTOU identity gate" || fail "pair missing TOCTOU gate"
grep -q 'expected-old-backend-digest' "$PAIR" && pass "pair supports expected-old digests" || fail "pair missing expected-old digests"
grep -q 'last-status.json' "$PAIR" && pass "pair reads monitor state file" || fail "pair missing monitor state read"
if awk '
  /recreate-staging-backend-with-media.sh/ { be=1; next }
  be && /wr_assert_container_matches_environment.*backend/ { gate=1; next }
  be && /recreate-staging-storefront.sh/ { if (gate) exit 0; exit 1 }
' "$PAIR"; then
  pass "pair mid-cutover identity gate before storefront"
else
  fail "pair missing mid-cutover identity gate before storefront"
fi
# Under-lock monitor revalidation must appear after lock acquire and before MUTATION_STARTED
if awk '/wr_staging_mutation_lock_acquire/,/MUTATION_STARTED=1/' "$PAIR" | grep -q 'check_monitor'; then
  pass "check_monitor revalidated under lock before mutation"
else
  fail "check_monitor missing under lock before mutation"
fi
# Fail if check_monitor still invokes the monitor script (not merely comments)
if awk '/^check_monitor\(\)/,/^}/' "$PAIR" | grep -E '\$mon|/\s*ops/monitoring/woodright-health-check\.sh|bash .+woodright-health-check'; then
  fail "check_monitor still execs health-check"
else
  pass "check_monitor does not exec health-check"
fi
MON_EV="$TMP/ev-mon"
mkdir -p "$MON_EV" "$TMP/mon-state"
FRESH_TS="$(date -u +%Y%m%dT%H%M%SZ)"
printf '{"timestamp_utc":"%s","overall":"critical","exit_code":2,"checks":[]}\n' "$FRESH_TS" >"$TMP/mon-state/last-status.json"
setup_state "$TMP/state"
unset SKIP_MONITOR
export WOODRIGHT_MONITOR_STATE_JSON="$TMP/mon-state/last-status.json"
export WOODRIGHT_MONITOR_MAX_AGE_S=1800
set +e
bash "$PAIR" --environment public_demo --component pair --mode dry-run \
  --target-sha "$SHA40" --backend-digest "$BE_DIG" --storefront-digest "$SF_DIG" \
  --evidence-dir "$MON_EV" >"$TMP/mon-red.out" 2>&1
MON_RC=$?
set -e
if [[ "$MON_RC" -ne 0 ]] && grep -q 'monitor overall=critical' "$TMP/mon-red.out"; then
  pass "monitor critical fail-closed on dry-run"
else
  fail "monitor critical not refused (rc=$MON_RC)"
  cat "$TMP/mon-red.out" || true
fi
# future timestamp must fail closed
mkdir -p "$TMP/ev-mon-future"
printf '{"timestamp_utc":"20990101T000000Z","overall":"ok","exit_code":0,"checks":[]}\n' >"$TMP/mon-state/last-status.json"
set +e
bash "$PAIR" --environment public_demo --component pair --mode dry-run \
  --target-sha "$SHA40" --backend-digest "$BE_DIG" --storefront-digest "$SF_DIG" \
  --evidence-dir "$TMP/ev-mon-future" >"$TMP/mon-future.out" 2>&1
FUT_RC=$?
set -e
if [[ "$FUT_RC" -ne 0 ]] && grep -qi 'future\|timestamp' "$TMP/mon-future.out"; then
  pass "monitor future timestamp refused"
else
  fail "monitor future timestamp accepted (rc=$FUT_RC)"
  cat "$TMP/mon-future.out" || true
fi
printf '{"timestamp_utc":"%s","overall":"ok","exit_code":0,"checks":[]}\n' "$FRESH_TS" >"$TMP/mon-state/last-status.json"
MON_EV2="$TMP/ev-mon2"
mkdir -p "$MON_EV2"
if bash "$PAIR" --environment public_demo --component pair --mode dry-run \
  --target-sha "$SHA40" --backend-digest "$BE_DIG" --storefront-digest "$SF_DIG" \
  --evidence-dir "$MON_EV2" \
  --expected-old-backend-digest "$OLD_BE" \
  --expected-old-storefront-digest "$OLD_SF"; then
  pass "pair dry-run with expected-old digests + monitor ok"
else
  fail "pair dry-run with expected-old digests failed"
fi
export SKIP_MONITOR=1
unset WOODRIGHT_MONITOR_STATE_JSON

# 16) health-check non-root does not write state by default
HC="$ROOT/ops/monitoring/woodright-health-check.sh"
HC_STATE="$TMP/hc-state"
mkdir -p "$HC_STATE"
printf '{"timestamp_utc":"20000101T000000Z","overall":"ok","exit_code":0,"checks":[]}\n' >"$HC_STATE/last-status.json"
BEFORE_HC="$(sha256sum "$HC_STATE/last-status.json" | awk '{print $1}')"
# Force advisory path: non-write + fixture so script completes without live docker deps where possible
set +e
WOODRIGHT_MONITOR_WRITE=0 WOODRIGHT_MONITOR_STATE="$HC_STATE" WOODRIGHT_MONITOR_HISTORY="$TMP/hc-hist" \
  WOODRIGHT_FIXTURE_BACKUP_AGE_HOURS=1 WOODRIGHT_FIXTURE_DISK_PCT=10 \
  bash "$HC" >/dev/null 2>"$TMP/hc-adv.err"
set -e
AFTER_HC="$(sha256sum "$HC_STATE/last-status.json" | awk '{print $1}')"
if [[ "$BEFORE_HC" == "$AFTER_HC" ]] && grep -qi 'advisory\|state not written' "$TMP/hc-adv.err"; then
  pass "health-check advisory does not overwrite state"
else
  # If script failed early before write gate, still require state unchanged
  if [[ "$BEFORE_HC" == "$AFTER_HC" ]]; then
    pass "health-check advisory left state unchanged"
  else
    fail "health-check overwrote state in advisory mode"
  fi
fi

if [[ "$FAILED" -eq 0 ]]; then
  echo "OK public-demo pair cutover fidelity ($TMP)"
  exit 0
fi
echo "FAILED count=$FAILED"
exit 1
