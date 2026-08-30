#!/usr/bin/env bash
# Fidelity: staging recreate helpers --mode dry-run is non-mutating; execute is explicit.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BE="$ROOT/ops/release/recreate-staging-backend-with-media.sh"
SF="$ROOT/ops/release/recreate-staging-storefront.sh"
MODE_LIB="$ROOT/ops/lib/woodright-recreate-mode.sh"
MEM_LIB="$ROOT/ops/lib/woodright-memory-limits.sh"
PAIR="$ROOT/ops/release/cutover-public-demo-pair.sh"
COMMON="$ROOT/ops/lib/woodright-cutover-common.sh"
FAILED=0
TMP="$(mktemp -d /tmp/wr-recreate-dry-run-safety-XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

pass() { echo "PASS $*"; }
fail() { echo "FAIL $*"; FAILED=$((FAILED + 1)); }

bash -n "$MODE_LIB" && pass "bash -n mode lib" || fail "bash -n mode lib"
bash -n "$BE" && pass "bash -n backend" || fail "bash -n backend"
bash -n "$SF" && pass "bash -n storefront" || fail "bash -n storefront"

# shellcheck source=/dev/null
source "$MODE_LIB"
# shellcheck source=/dev/null
source "$MEM_LIB"

# --- Mode parsing unit ---
if wr_recreate_parse_mode_from_args --environment public_demo 2>"$TMP/m0.err"; then
  fail "no mode accepted"
else
  grep -q RECREATE_MODE_REQUIRED "$TMP/m0.err" && pass "no mode → RECREATE_MODE_REQUIRED" || fail "no mode token"
fi
if wr_recreate_parse_mode_from_args --mode dry-run; then
  [[ "$WR_RECREATE_MODE" == "dry-run" ]] && pass "dry-run parse" || fail "dry-run value"
else
  fail "dry-run parse"
fi
if wr_recreate_parse_mode_from_args --mode execute; then
  [[ "$WR_RECREATE_MODE" == "execute" ]] && pass "execute parse" || fail "execute value"
else
  fail "execute parse"
fi
if wr_recreate_parse_mode_from_args --mode typo 2>/dev/null; then
  wr_recreate_require_allowed_mode "dry-run execute" 2>"$TMP/mtypo.err" && fail "typo allowed" || {
    grep -q INVALID_RECREATE_MODE "$TMP/mtypo.err" && pass "typo → INVALID" || fail "typo token"
  }
else
  fail "typo parse unexpected"
fi
if wr_recreate_parse_mode_from_args --mode 2>"$TMP/mempty.err"; then
  fail "empty mode accepted"
else
  grep -q INVALID_RECREATE_MODE "$TMP/mempty.err" && pass "empty mode → INVALID" || fail "empty token"
fi
if wr_recreate_parse_mode_from_args --mode= 2>"$TMP/mempty2.err"; then
  fail "empty --mode= accepted"
else
  grep -q INVALID_RECREATE_MODE "$TMP/mempty2.err" && pass "empty --mode= → INVALID" || fail "empty= token"
fi
if wr_recreate_parse_mode_from_args --mode dry-run --mode execute 2>"$TMP/mdup.err"; then
  fail "duplicate modes accepted"
else
  grep -q RECREATE_MODE_DUPLICATE "$TMP/mdup.err" && pass "duplicate → DUPLICATE" || fail "duplicate token"
fi

# Structural: backend dry-run exits before mutating verbs
awk '
  /DRY_RUN_OR_PREFLIGHT_OK/ { dry=NR }
  /docker stop/ { stop=NR }
  /docker rename/ { ren=NR }
  /docker create/ { cre=NR }
  /wr_public_demo_docker_create_sealed_env/ { cre=NR }
  END {
    if (!dry) exit 1
    if (!(stop>dry && ren>dry && cre>dry)) exit 2
  }
' "$BE" && pass "backend dry-run precedes stop/rename/create" || fail "backend dry-run order"

grep -q 'RECREATE_MODE_REQUIRED' "$MODE_LIB" && pass "mode required token" || fail "mode required token"
grep -q -- '--mode execute' "$PAIR" && pass "pair passes --mode execute to backend" || fail "pair backend mode"
grep -q 'MODE="execute"' "$SF" && fail "storefront still defaults MODE=execute" || pass "storefront no execute default"
grep -q 'woodright-recreate-mode.sh' "$BE" "$SF" && pass "helpers source mode lib" || fail "helpers source mode lib"

# Memory flags still planned / created
out_sf="$(wr_mem_docker_flags_storefront)"
echo "$out_sf" | tr '\n' ' ' | grep -qE -- '--memory-reservation 192m --memory 512m --memory-swap 512m' \
  && pass "sf memory triplet" || fail "sf memory triplet"
out_be="$(wr_mem_docker_flags_backend)"
echo "$out_be" | tr '\n' ' ' | grep -qE -- '--memory-reservation 640m --memory 1536m --memory-swap 1536m' \
  && pass "be memory triplet" || fail "be memory triplet"
grep -q 'wr_mem_docker_flags_backend' "$BE" && pass "be uses memory lib" || fail "be uses memory lib"
grep -q 'wr_mem_docker_flags_storefront' "$SF" && pass "sf uses memory lib" || fail "sf uses memory lib"

# --- Fake docker fixture (reuse pair-cutover pattern) ---
FAKE_DOCKER="$TMP/bin"
mkdir -p "$FAKE_DOCKER" "$TMP/state"
cat >"$FAKE_DOCKER/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
STATE="${WOODRIGHT_FAKE_DOCKER_STATE:?}"
cmd="${1:-}"
shift || true
mkdir -p "$STATE/containers" "$STATE/images" "$STATE/networks" "$STATE/volumes" "$STATE/log"
echo "docker $cmd $*" >>"$STATE/log/commands.log"
case "$cmd" in
  inspect)
    target="${1:-}"; fmt=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --format) fmt="$2"; shift 2 ;;
        --format=*) fmt="${1#--format=}"; shift ;;
        *) target="$1"; shift ;;
      esac
    done
    if [[ -f "$STATE/images/${target//\//_}.json" ]]; then
      if [[ -n "$fmt" ]]; then
        python3 - "$STATE/images/${target//\//_}.json" "$fmt" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); fmt=sys.argv[2]
print(d.get("Id","") if ".Id" in fmt else "")
PY
      else cat "$STATE/images/${target//\//_}.json"; fi
      exit 0
    fi
    name="${target#/}"; f="$STATE/containers/${name}.json"
    [[ -f "$f" ]] || exit 1
    if [[ -n "$fmt" ]]; then
      python3 - "$f" "$fmt" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))[0]; fmt=sys.argv[2]
if "runtime-role" in fmt: print((d.get("Config") or {}).get("Labels",{}).get("com.woodright.runtime-role",""))
elif "release-sha" in fmt: print((d.get("Config") or {}).get("Labels",{}).get("com.woodright.release-sha",""))
elif "deployment-owner" in fmt: print((d.get("Config") or {}).get("Labels",{}).get("com.woodright.deployment-owner",""))
elif "exposure" in fmt: print((d.get("Config") or {}).get("Labels",{}).get("com.woodright.exposure",""))
elif "database-identity" in fmt: print((d.get("Config") or {}).get("Labels",{}).get("com.woodright.database-identity",""))
elif "image.title" in fmt or "org.opencontainers.image.title" in fmt:
  print((d.get("Config") or {}).get("Labels",{}).get("org.opencontainers.image.title",""))
elif "compose.project" in fmt: print((d.get("Config") or {}).get("Labels",{}).get("com.docker.compose.project",""))
elif ".Image" in fmt and "Config" not in fmt: print(d.get("Image",""))
elif ".Config.Image" in fmt: print((d.get("Config") or {}).get("Image",""))
elif ".Id" in fmt: print(d.get("Id",""))
elif "Health" in fmt: print(((d.get("State") or {}).get("Health") or {}).get("Status") or "")
elif "StartedAt" in fmt: print((d.get("State") or {}).get("StartedAt",""))
elif "Mounts" in fmt: print(__import__("json").dumps(d.get("Mounts") or []))
else: print("")
PY
    else cat "$f"; fi
    ;;
  volume)
    sub="${1:-}"; shift || true
    [[ "$sub" == "inspect" ]] || exit 0
    [[ -f "$STATE/volumes/${1}.ok" ]] || exit 1
    echo "{}"
    ;;
  network)
    sub="${1:-}"; shift || true
    if [[ "$sub" == "inspect" ]]; then
      [[ -f "$STATE/networks/${1}.ok" ]] || exit 1
      echo "{}"
    elif [[ "$sub" == "connect" ]]; then
      echo "network connect $*" >>"$STATE/log/mutations.log"
      if [[ "${WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION:-0}" != "1" ]]; then
        echo "UNEXPECTED_MUTATION network_connect" >&2; exit 99
      fi
    fi
    ;;
  image)
    sub="${1:-}"; shift || true
    if [[ "$sub" == "inspect" ]]; then
      target="${1:-}"; f="$STATE/images/${target//\//_}.json"
      [[ -f "$f" ]] || exit 1
      if [[ "${2:-}" == "--format" ]]; then
        fmt="$3"
        python3 - "$f" "$fmt" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); fmt=sys.argv[2]
if "revision" in fmt: print((d.get("Config") or {}).get("Labels",{}).get("org.opencontainers.image.revision",""))
elif "RepoDigests" in fmt:
  digs=d.get("RepoDigests") or []; print(digs[0] if digs else "")
elif ".Id" in fmt: print(d.get("Id",""))
else: print("")
PY
      else cat "$f"; fi
    fi
    ;;
  stop|start|rename|create|rm|update|kill|cp|run)
    echo "$cmd $*" >>"$STATE/log/mutations.log"
    if [[ "${WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION:-0}" != "1" ]]; then
      echo "UNEXPECTED_MUTATION $cmd" >&2
      exit 99
    fi
    if [[ "$cmd" == "create" ]]; then
      echo "CREATE_ARGS $*" >>"$STATE/log/create_args.log"
      name=""
      img=""
      mount_src=""
      mount_dst=""
      prev=""
      for a in "$@"; do
        if [[ "$prev" == "--name" ]]; then name="$a"; fi
        if [[ "$a" == type=volume,* ]]; then
          # --mount type=volume,source=SRC,destination=DST
          IFS=',' read -r -a parts <<<"$a"
          for p in "${parts[@]}"; do
            case "$p" in
              source=*) mount_src="${p#source=}" ;;
              destination=*) mount_dst="${p#destination=}" ;;
            esac
          done
        fi
        prev="$a"
        case "$a" in
          ghcr.io/*@sha256:*|sha256:*) img="$a" ;;
        esac
      done
      [[ -n "$name" ]] || exit 1
      MOUNT_SRC="$mount_src" MOUNT_DST="$mount_dst" python3 - "$STATE" "$name" "$img" <<'PY'
import json,os,sys
state,name,img=sys.argv[1:4]
dig = img.split("@")[-1] if "@" in img else img
mounts=[]
src=os.environ.get("MOUNT_SRC") or ""
dst=os.environ.get("MOUNT_DST") or ""
if src and dst:
  mounts=[{"Type":"volume","Name":src,"Destination":dst}]
doc=[{
  "Id":"id-"+name,"Name":"/"+name,"Image": dig,
  "Config":{"Image":img,"Labels":{
    "com.woodright.runtime-role":"public_demo",
    "com.woodright.deployment-owner":"Dokploy",
    "com.woodright.exposure":"public",
    "com.woodright.database-identity":"public_demo_db",
    "com.woodright.release-sha": os.environ.get("WOODRIGHT_TARGET_SHA",""),
    "org.opencontainers.image.title":"woodright-backend" if "backend" in name else "woodright-storefront",
  },"Env":["PATH=/usr/bin"],"Healthcheck":{"Test":["CMD-SHELL","true"]}},
  "HostConfig":{"RestartPolicy":{"Name":"unless-stopped"}},
  "NetworkSettings":{"Networks":{}},
  "Mounts": mounts,
  "State":{"Status":"created","StartedAt":"","Health":{"Status":"starting"}}
}]
json.dump(doc, open(os.path.join(state,"containers",name+".json"),"w"))
PY
    elif [[ "$cmd" == "rename" ]]; then
      src="${1#/}"; dst="${2#/}"
      mv "$STATE/containers/${src}.json" "$STATE/containers/${dst}.json"
      python3 - "$STATE/containers/${dst}.json" "$dst" <<'PY'
import json,sys
f,name=sys.argv[1],sys.argv[2]
d=json.load(open(f)); d[0]["Name"]="/"+name; d[0]["Id"]="id-"+name
json.dump(d, open(f,"w"))
PY
    elif [[ "$cmd" == "stop" || "$cmd" == "start" ]]; then
      name="${1#/}"; f="$STATE/containers/${name}.json"
      python3 - "$f" "$cmd" <<'PY'
import json,sys
f,cmd=sys.argv[1],sys.argv[2]
d=json.load(open(f)); st=d[0].setdefault("State",{})
if cmd=="stop":
  st["Status"]="exited"
else:
  st["Status"]="running"; st.setdefault("Health",{})["Status"]="healthy"; st["StartedAt"]="2026-08-11T00:00:00Z"
json.dump(d, open(f,"w"))
PY
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

setup_state() {
  local state="$1"
  mkdir -p "$state/containers" "$state/images" "$state/networks" "$state/volumes"
  touch "$state/networks/woodright-stack-3dsdhd_woodright_staging.ok"
  touch "$state/networks/dokploy-network.ok"
  touch "$state/volumes/woodright-stack-3dsdhd_woodright_staging_media.ok"
  python3 - "$state" "$BE_DIG" "$SF_DIG" "$SHA40" <<'PY'
import json,sys,os
state,be,sf,sha=sys.argv[1:5]
def ctr(name, dig, title):
  return [{
    "Id": f"id-{name}",
    "Name": f"/{name}",
    "Image": dig,
    "Config": {
      "Image": f"ghcr.io/saintgroovie/{title}@{dig}",
      "Env": ["WOODRIGHT_RUNTIME_ROLE=public_demo","WOODRIGHT_DATABASE_IDENTITY_ALIAS=public_demo_db","MOCK_SECRET=should-not-leak"],
      "Labels": {
        "com.woodright.runtime-role": "public_demo",
        "com.woodright.deployment-owner": "Dokploy",
        "com.woodright.exposure": "public",
        "com.woodright.database-identity": "public_demo_db",
        "com.woodright.release-sha": sha,
        "org.opencontainers.image.revision": sha,
        "org.opencontainers.image.title": title,
      },
      "Cmd": ["node","server.js"],
      "Healthcheck": {"Test":["CMD-SHELL","true"]},
    },
    "HostConfig": {"RestartPolicy": {"Name": "unless-stopped"}, "Memory": 0, "MemoryReservation": 0, "MemorySwap": 0},
    "NetworkSettings": {"Networks": {
      "woodright-stack-3dsdhd_woodright_staging": {"Aliases":["storefront" if "storefront" in name else "backend"]},
      "dokploy-network": {"Aliases":[]},
    }},
    "Mounts": [{"Type":"volume","Name":"woodright-stack-3dsdhd_woodright_staging_media","Destination":"/server/static"}] if "backend" in name else [],
    "State": {"Status":"running","StartedAt":"2026-08-01T00:00:00Z","Health":{"Status":"healthy"}},
  }]
def write_image(dig, title):
  img=f"ghcr.io/saintgroovie/{title}@{dig}"
  doc={"Id": dig, "RepoDigests": [f"ghcr.io/saintgroovie/{title}@{dig}"], "Config": {"Labels": {
    "org.opencontainers.image.revision": sha,
    "org.opencontainers.image.title": title,
    "com.woodright.deployment-owner": "Dokploy",
  }}}
  open(os.path.join(state,"images",dig.replace("/","_")+".json"),"w").write(json.dumps(doc))
  open(os.path.join(state,"images",img.replace("/","_")+".json"),"w").write(json.dumps(doc))
open(os.path.join(state,"containers","woodright-staging-backend.json"),"w").write(json.dumps(ctr("woodright-staging-backend", be, "woodright-backend")))
open(os.path.join(state,"containers","woodright-staging-storefront.json"),"w").write(json.dumps(ctr("woodright-staging-storefront", sf, "woodright-storefront")))
write_image(be, "woodright-backend")
write_image(sf, "woodright-storefront")
PY
}

export PATH="$FAKE_DOCKER:$PATH"
export WOODRIGHT_DOCKER_BIN="$FAKE_DOCKER/docker"
export WOODRIGHT_FAKE_DOCKER_STATE="$TMP/state"
export WOODRIGHT_VALIDATION_FREEZE_DIR="$TMP/freeze"
export WOODRIGHT_META_ROOT="$TMP/meta"
mkdir -p "$TMP/freeze" "$TMP/meta/public_demo" "$TMP/own" "$TMP/gate"
cat >"$TMP/meta/public_demo/OWNER_APPROVED_RELEASE.json" <<EOF
{
  "schema_version": 1,
  "environment": "public_demo",
  "application_sha": "${SHA40}",
  "backend_digest": "${BE_DIG}",
  "storefront_digest": "${SF_DIG}",
  "owner_decision": "approved",
  "owner_authorization_id": "OWNER-PASS-fixture-recreate-dry-run-safety",
  "issued_at": "1970-01-01T00:00:00Z",
  "tooling_schema_version": "owner-approved-release-v1"
}
EOF
chmod 0644 "$TMP/meta/public_demo/OWNER_APPROVED_RELEASE.json"
unset WOODRIGHT_OWNER_APPROVED_RELEASE_PATH

# Overlay repo: real libs/config + stub media gate; helpers run from overlay so HERE resolves.
OVER="$TMP/repo_root"
mkdir -p "$OVER/ops/release" "$OVER/ops/lib" "$OVER/ops/config"
cp -a "$ROOT/ops/lib/." "$OVER/ops/lib/"
cp -a "$ROOT/ops/config/." "$OVER/ops/config/"
cp -a "$BE" "$SF" "$PAIR" \
  "$ROOT/ops/release/rollback-staging-backend-from-keeper.sh" \
  "$ROOT/ops/release/rollback-staging-storefront-from-keeper.sh" \
  "$OVER/ops/release/"
cat >"$OVER/ops/release/verify-backend-media-mount.sh" <<'EOF'
#!/usr/bin/env bash
# Test stub: always PASS (no live media mutation).
exit 0
EOF
chmod +x "$OVER/ops/release/"*.sh
BE="$OVER/ops/release/recreate-staging-backend-with-media.sh"
SF="$OVER/ops/release/recreate-staging-storefront.sh"
export WOODRIGHT_REPO_ROOT="$(cd "$OVER" && pwd -P)"
# macOS: /tmp → /private/tmp; profile allowlist compares realpath prefixes.
export WOODRIGHT_ENV_PROFILE_DIR="$(cd "$OVER/ops/config/runtime-environments" && pwd -P)"
# Fixture lock + ownership dirs (profile would otherwise force /srv paths).
mkdir -p "$TMP/locks" "$TMP/own"
LOCK_FIXTURE="$TMP/locks/live-cutover.lock"
: >"$LOCK_FIXTURE"
: >"$TMP/own/DEPLOY.lock"
python3 - "$OVER/ops/config/runtime-environments/public_demo.conf" "$LOCK_FIXTURE" "$TMP/own" <<'PY'
from pathlib import Path
import sys
path, lock, own = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
text = path.read_text()
out = []
for line in text.splitlines():
    if line.startswith("WOODRIGHT_MUTATION_LOCK_PATH="):
        out.append(f"WOODRIGHT_MUTATION_LOCK_PATH={lock}")
    elif line.startswith("WOODRIGHT_OWNERSHIP_DIR="):
        out.append(f"WOODRIGHT_OWNERSHIP_DIR={own}")
    else:
        out.append(line)
path.write_text("\n".join(out) + "\n")
PY
export WR_STAGING_MUTATION_LOCK_ALLOW_NONCANONICAL=1
export WR_STAGING_MUTATION_LOCK_PATH="$LOCK_FIXTURE"
export WOODRIGHT_OWNERSHIP_DIR="$TMP/own"

setup_state "$TMP/state"
ENVF="$TMP/app.env"
umask 077
printf 'WOODRIGHT_RUNTIME_ROLE=public_demo\nWOODRIGHT_RELEASE_SHA=%s\n' "$SHA40" >"$ENVF"
chmod 600 "$ENVF"

# Snapshot IDs / ACTIVE checksums (file fixtures)
ACTIVE_JSON="$TMP/ACTIVE_OWNER.json"
printf '{"approved_git_sha":"%s"}\n' "$SHA40" >"$ACTIVE_JSON"
EXPECTED_JSON="$TMP/EXPECTED_RELEASE.json"
printf '{"release_sha":"%s"}\n' "$SHA40" >"$EXPECTED_JSON"
CS_ACTIVE_BEFORE="$(sha256sum "$ACTIVE_JSON" | awk '{print $1}')"
CS_EXPECTED_BEFORE="$(sha256sum "$EXPECTED_JSON" | awk '{print $1}')"
ID_BE_BEFORE="$(docker inspect woodright-staging-backend --format '{{.Id}}')"
ID_SF_BEFORE="$(docker inspect woodright-staging-storefront --format '{{.Id}}')"
ST_BE_BEFORE="$(docker inspect woodright-staging-backend --format '{{.State.StartedAt}}')"
ST_SF_BEFORE="$(docker inspect woodright-staging-storefront --format '{{.State.StartedAt}}')"

rm -f "$TMP/state/log/mutations.log" "$TMP/state/log/commands.log"
EV_BE="$TMP/ev-be"; mkdir -p "$EV_BE"
set +e
IMAGE="ghcr.io/saintgroovie/woodright-backend@${BE_DIG}" \
EXPECTED_DIGEST="$BE_DIG" \
ENV_FILE="$ENVF" \
KEEP_NAME="woodright-staging-backend-keeper-dryrun" \
TARGET_SHA="$SHA40" \
WOODRIGHT_TARGET_SHA="$SHA40" \
WOODRIGHT_CUTOVER_EVIDENCE_DIR="$EV_BE" \
EVIDENCE_DIR="$EV_BE" \
REQUIRE_CURRENT_DIGEST=1 \
bash "$BE" --environment public_demo --component backend --mode dry-run \
  >"$TMP/be-dry.out" 2>&1
BE_DRY_RC=$?
set -e
if [[ "$BE_DRY_RC" -eq 0 ]] && grep -q 'DRY_RUN_OR_PREFLIGHT_OK' "$TMP/be-dry.out"; then
  pass "backend dry-run exit 0"
else
  fail "backend dry-run exit"; sed -n '1,80p' "$TMP/be-dry.out" || true
fi
grep -q 'PLANNED memory_flags=.*--memory-reservation 640m' "$TMP/be-dry.out" \
  && pass "backend dry-run plans BE memory" || fail "backend dry-run plans BE memory"
grep -q 'PLANNED keeper=' "$TMP/be-dry.out" && pass "backend dry-run keeper plan" || fail "backend dry-run keeper plan"
if [[ -f "$TMP/state/log/mutations.log" ]]; then fail "backend dry-run docker mutation"; else pass "backend dry-run zero mutations"; fi
if grep -E 'docker (stop|rename|create|start|rm|update|run|kill) ' "$TMP/state/log/commands.log" 2>/dev/null; then
  fail "backend dry-run mutating command logged"
else
  pass "backend dry-run no mutating commands"
fi
grep -q 'PLANNED media_gate=pre-promote' "$TMP/be-dry.out" \
  && pass "backend dry-run skips media gate docker run" || fail "backend dry-run skips media gate"

rm -f "$TMP/state/log/mutations.log"
EV_SF="$TMP/ev-sf"; mkdir -p "$EV_SF"
set +e
bash "$SF" --environment public_demo --component storefront --mode dry-run \
  --image "ghcr.io/saintgroovie/woodright-storefront@${SF_DIG}" \
  --digest "$SF_DIG" --target-sha "$SHA40" \
  --keep-name "woodright-staging-storefront-keeper-dryrun" \
  --env-file "$ENVF" --evidence-dir "$EV_SF" >"$TMP/sf-dry.out" 2>&1
SF_DRY_RC=$?
set -e
if [[ "$SF_DRY_RC" -eq 0 ]] && grep -q 'DRY_RUN_OR_PREFLIGHT_OK' "$TMP/sf-dry.out"; then
  pass "storefront dry-run exit 0"
else
  fail "storefront dry-run exit"; sed -n '1,80p' "$TMP/sf-dry.out" || true
fi
grep -qE 'PLANNED memory_flags=.*--memory-reservation 192m' "$TMP/sf-dry.out" \
  && pass "storefront dry-run plans SF memory" || {
  fail "storefront dry-run plans SF memory"
  grep 'memory' "$TMP/sf-dry.out" || true
}
if [[ -f "$TMP/state/log/mutations.log" ]]; then fail "storefront dry-run docker mutation"; else pass "storefront dry-run zero mutations"; fi

# State fidelity after dry-runs
[[ "$(docker inspect woodright-staging-backend --format '{{.Id}}')" == "$ID_BE_BEFORE" ]] && pass "BE id unchanged" || fail "BE id unchanged"
[[ "$(docker inspect woodright-staging-storefront --format '{{.Id}}')" == "$ID_SF_BEFORE" ]] && pass "SF id unchanged" || fail "SF id unchanged"
[[ "$(docker inspect woodright-staging-backend --format '{{.State.StartedAt}}')" == "$ST_BE_BEFORE" ]] && pass "BE StartedAt unchanged" || fail "BE StartedAt"
[[ "$(docker inspect woodright-staging-storefront --format '{{.State.StartedAt}}')" == "$ST_SF_BEFORE" ]] && pass "SF StartedAt unchanged" || fail "SF StartedAt"
[[ "$(sha256sum "$ACTIVE_JSON" | awk '{print $1}')" == "$CS_ACTIVE_BEFORE" ]] && pass "ACTIVE checksum same" || fail "ACTIVE checksum"
[[ "$(sha256sum "$EXPECTED_JSON" | awk '{print $1}')" == "$CS_EXPECTED_BEFORE" ]] && pass "EXPECTED checksum same" || fail "EXPECTED checksum"

# Execute fixture: allow mutation; backend should emit memory flags on create
export WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION=1
export WR_STAGING_MUTATION_LOCK_ALLOW_NONCANONICAL=1
export WR_STAGING_MUTATION_LOCK_PATH="$LOCK_FIXTURE"
export WOODRIGHT_OWNERSHIP_DIR="$TMP/own"

# Re-setup live containers (execute will rename BE)
setup_state "$TMP/state"
rm -f "$TMP/state/log/mutations.log" "$TMP/state/log/create_args.log"
EV_EX="$TMP/ev-ex"; mkdir -p "$EV_EX"
set +e
IMAGE="ghcr.io/saintgroovie/woodright-backend@${BE_DIG}" \
EXPECTED_DIGEST="$BE_DIG" \
ENV_FILE="$ENVF" \
KEEP_NAME="woodright-staging-backend-keeper-exec" \
TARGET_SHA="$SHA40" \
WOODRIGHT_TARGET_SHA="$SHA40" \
WOODRIGHT_CUTOVER_EVIDENCE_DIR="$EV_EX" \
EVIDENCE_DIR="$EV_EX" \
REQUIRE_CURRENT_DIGEST=1 \
WR_STAGING_MUTATION_LOCK_ALLOW_NONCANONICAL=1 \
WR_STAGING_MUTATION_LOCK_PATH="$LOCK_FIXTURE" \
bash "$BE" --environment public_demo --component backend --mode execute \
  >"$TMP/be-ex.out" 2>&1
BE_EX_RC=$?
set -e
if [[ "$BE_EX_RC" -eq 0 ]] && grep -q 'CREATED name=' "$TMP/be-ex.out"; then
  pass "backend execute reaches create"
else
  fail "backend execute"; sed -n '1,120p' "$TMP/be-ex.out" || true
fi
if [[ -f "$TMP/state/log/create_args.log" ]] && grep -q -- '--memory-reservation 640m' "$TMP/state/log/create_args.log" \
  && grep -q -- '--memory 1536m' "$TMP/state/log/create_args.log" \
  && grep -q -- '--memory-swap 1536m' "$TMP/state/log/create_args.log"; then
  pass "execute emits BE memory flags"
else
  fail "execute emits BE memory flags"; cat "$TMP/state/log/create_args.log" 2>/dev/null || true
fi
grep -q 'stop ' "$TMP/state/log/mutations.log" && pass "execute stop" || fail "execute stop"
grep -q 'rename ' "$TMP/state/log/mutations.log" && pass "execute rename" || fail "execute rename"
grep -q 'create ' "$TMP/state/log/mutations.log" && pass "execute create" || fail "execute create"

# Stale target ID / authority mismatch / unknown target
setup_state "$TMP/state"
export WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION=0
set +e
IMAGE="ghcr.io/saintgroovie/woodright-backend@${BE_DIG}" \
EXPECTED_DIGEST="$BE_DIG" ENV_FILE="$ENVF" KEEP_NAME="k" TARGET_SHA="$SHA40" WOODRIGHT_TARGET_SHA="$SHA40" \
REQUIRE_CURRENT_DIGEST=1 \
bash "$BE" --environment public_demo --component backend --mode dry-run \
  --mode execute >"$TMP/dup.out" 2>&1
DUP_RC=$?
set -e
[[ "$DUP_RC" -ne 0 ]] && grep -q RECREATE_MODE_DUPLICATE "$TMP/dup.out" && pass "conflicting modes fail" || fail "conflicting modes"

# Wrong digest authority
set +e
IMAGE="ghcr.io/saintgroovie/woodright-backend@${BE_DIG}" \
EXPECTED_DIGEST="sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
ENV_FILE="$ENVF" KEEP_NAME="k2" TARGET_SHA="$SHA40" WOODRIGHT_TARGET_SHA="$SHA40" \
bash "$BE" --environment public_demo --component backend --mode dry-run >"$TMP/auth.out" 2>&1
AUTH_RC=$?
set -e
[[ "$AUTH_RC" -ne 0 ]] && pass "authority/digest mismatch refused" || fail "authority mismatch"

# Unknown live target
rm -f "$TMP/state/containers/woodright-staging-backend.json"
set +e
IMAGE="ghcr.io/saintgroovie/woodright-backend@${BE_DIG}" \
EXPECTED_DIGEST="$BE_DIG" ENV_FILE="$ENVF" KEEP_NAME="k3" TARGET_SHA="$SHA40" WOODRIGHT_TARGET_SHA="$SHA40" \
bash "$BE" --environment public_demo --component backend --mode dry-run >"$TMP/miss.out" 2>&1
MISS_RC=$?
set -e
[[ "$MISS_RC" -ne 0 ]] && pass "unknown target fail" || fail "unknown target"

# Secrets: dry-run output must not leak env values
if grep -E 'MOCK_SECRET|PASSWORD=|BEGIN RSA' "$TMP/be-dry.out" "$TMP/sf-dry.out" 2>/dev/null; then
  fail "secret-like leak in dry-run output"
else
  pass "no secret leak in dry-run output"
fi
# Broad matching refusal (production name)
# shellcheck source=/dev/null
source "$COMMON"
if wr_cutover_refuse_production_name "woodright-production-backend" 2>/dev/null; then
  fail "production name accepted"
else
  pass "no broad production matching"
fi

if [[ "$FAILED" -ne 0 ]]; then
  echo "FAILED_COUNT=$FAILED"
  exit 1
fi
echo PASS_recreate_helper_dry_run_safety_fidelity
