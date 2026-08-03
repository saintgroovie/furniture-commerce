#!/usr/bin/env bash
# Fidelity: production-candidate media monitor must use governed profile volume,
# not a hardcoded staging substring. Fail-closed on missing/wrong mounts.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HC="$ROOT/ops/monitoring/woodright-health-check.sh"
FAIL=0
pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

# Old regression: hardcoded staging substring must be gone.
if grep -n "woodright_staging_media /server/static" "$HC" >/dev/null 2>&1; then
  fail "old hardcoded staging media_mount grep still present"
else
  pass "old hardcoded staging media_mount grep removed"
fi
grep -q 'WOODRIGHT_MEDIA_VOLUME' "$HC" && pass "uses WOODRIGHT_MEDIA_VOLUME" || fail "missing WOODRIGHT_MEDIA_VOLUME"
grep -q 'WOODRIGHT_FIXTURE_MEDIA_MOUNTS_JSON\|Type.*volume' "$HC" \
  && pass "structural mount check present" || fail "structural mount check missing"

PROD_VOL="woodright-production_woodright-production_media"
DEMO_VOL="woodright-stack-3dsdhd_woodright_staging_media"
DEST="/server/static"

run_case() {
  local name="$1" env_name="$2" fixture="$3" expect="$4"
  local out rc=0
  out="$(mktemp)"
  set +e
  WOODRIGHT_MONITOR_WRITE=0 \
  WOODRIGHT_FIXTURE_MEDIA_MOUNTS_JSON="$fixture" \
  WOODRIGHT_BE_CONTAINER=woodright-fake-backend \
  WOODRIGHT_SF_CONTAINER=woodright-fake-storefront \
  bash "$HC" --environment "$env_name" >"$out" 2>/dev/null
  rc=$?
  set -e
  if grep -q "\"name\": \"media_mount\"" "$out"; then
    local status detail
    status="$(python3 - "$out" <<'PY'
import json,sys
doc=json.load(open(sys.argv[1]))
for c in doc.get("checks") or []:
  if c.get("name")=="media_mount":
    print(c.get("status"), c.get("detail",""))
    break
PY
)"
    if [[ "$expect" == "pass" ]]; then
      [[ "$status" == pass* ]] && pass "$name -> pass ($status)" || fail "$name expected pass got $status"
    else
      [[ "$status" == fail* ]] && pass "$name -> fail ($status)" || fail "$name expected fail got $status"
    fi
  else
    # Discovery may fail without docker; still require media_mount when fixture set via BE discovery fail path
    if grep -q 'skipped_undiscovered_backend\|media_mount' "$out"; then
      if [[ "$expect" == "pass" ]]; then
        fail "$name: no usable media_mount result (discovery?)"
      else
        pass "$name: fail-closed without discovery ($expect)"
      fi
    else
      fail "$name: media_mount check missing from output"
    fi
  fi
  rm -f "$out"
}

# Direct unit of the python contract via exported fixture + forced discovery skip workaround:
# Invoke the embedded checker by sourcing is heavy; instead call python contract through HC
# with mocked discovery by setting containers and a docker shim.

TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT
BIN="$TMP/bin"
mkdir -p "$BIN"

cat >"$BIN/docker" <<'EOF'
#!/usr/bin/env bash
# Minimal shim: "inspect <name>" returns mounts from WOODRIGHT_FAKE_MOUNTS_JSON
if [[ "$1" == "inspect" ]]; then
  if [[ -n "${WOODRIGHT_FAKE_MOUNTS_JSON:-}" ]]; then
    python3 - <<'PY'
import json, os
mounts = json.loads(os.environ["WOODRIGHT_FAKE_MOUNTS_JSON"])
print(json.dumps([{
  "Id": "id-be",
  "Name": "/woodright-production-backend",
  "Image": "sha256:" + "a"*64,
  "RestartCount": 0,
  "State": {"Status": "running", "Health": {"Status": "healthy"}},
  "Config": {"Labels": {}, "Image": "x"},
  "HostConfig": {"PortBindings": {}},
  "Mounts": mounts,
  "NetworkSettings": {"Networks": {}, "Ports": {}},
}]))
PY
    exit 0
  fi
fi
# ps / other: empty
exit 0
EOF
chmod +x "$BIN/docker"

run_shim() {
  local name="$1" env_name="$2" mounts_json="$3" expect_status="$4"
  local out media
  out="$(mktemp)"
  set +e
  PATH="$BIN:$PATH" \
  WOODRIGHT_MONITOR_WRITE=0 \
  WOODRIGHT_FIXTURE_BE_DISCOVERY_OK=1 \
  WOODRIGHT_FIXTURE_SF_DISCOVERY_OK=1 \
  WOODRIGHT_BE_CONTAINER=woodright-production-backend \
  WOODRIGHT_SF_CONTAINER=woodright-production-storefront \
  WOODRIGHT_FAKE_MOUNTS_JSON="$mounts_json" \
  WOODRIGHT_PG_CONTAINER=skip-pg \
  WOODRIGHT_REDIS_CONTAINER=skip-redis \
  WOODRIGHT_FIXTURE_BACKUP_AGE_H=1 \
  WOODRIGHT_FIXTURE_DISK_PCT=10 \
  bash "$HC" --environment "$env_name" >"$out" 2>/dev/null
  set -e
  media="$(python3 - "$out" <<'PY'
import json,sys
text=open(sys.argv[1]).read()
i=text.find("{")
if i<0:
  print("missing|"); raise SystemExit
obj,_=json.JSONDecoder().raw_decode(text[i:])
for c in obj.get("checks") or []:
  if c.get("name")=="media_mount":
    print(c.get("status")+"|"+c.get("detail",""))
    break
else:
  print("missing|")
PY
)"
  if [[ "$expect_status" == "pass" ]]; then
    [[ "$media" == pass* ]] && pass "$name media=$media" || fail "$name media=$media"
  else
    [[ "$media" == fail* ]] && pass "$name media=$media" || fail "$name expected fail media=$media"
  fi
  rm -f "$out"
}

PC_OK="$(python3 - <<PY
import json
print(json.dumps([{"Type":"volume","Name":"$PROD_VOL","Destination":"$DEST","RW":True}]))
PY
)"
PC_STAGING_HARDCODE="$(python3 - <<PY
import json
print(json.dumps([{"Type":"volume","Name":"$DEMO_VOL","Destination":"$DEST","RW":True}]))
PY
)"
PC_WRONG="$(python3 - <<PY
import json
print(json.dumps([{"Type":"volume","Name":"other_media","Destination":"$DEST","RW":True}]))
PY
)"
PC_WRONG_DEST="$(python3 - <<PY
import json
print(json.dumps([{"Type":"volume","Name":"$PROD_VOL","Destination":"/wrong","RW":True}]))
PY
)"
PC_BIND="$(python3 - <<PY
import json
print(json.dumps([{"Type":"bind","Source":"/tmp/x","Destination":"$DEST","RW":True}]))
PY
)"
PC_MULTI="$(python3 - <<PY
import json
print(json.dumps([
  {"Type":"volume","Name":"$PROD_VOL","Destination":"$DEST","RW":True},
  {"Type":"volume","Name":"$PROD_VOL","Destination":"$DEST","RW":True},
]))
PY
)"
PC_EMPTY='[]'
DEMO_OK="$(python3 - <<PY
import json
print(json.dumps([{"Type":"volume","Name":"$DEMO_VOL","Destination":"$DEST","RW":True}]))
PY
)"

# Discovery may still fail for SF; media check only needs BE. Force BE name via profile defaults.
# For public_demo profile, container names in fixture should match demo defaults.
run_shim_demo() {
  local name="$1" mounts_json="$2" expect_status="$3"
  local out media
  out="$(mktemp)"
  set +e
  PATH="$BIN:$PATH" \
  WOODRIGHT_MONITOR_WRITE=0 \
  WOODRIGHT_FIXTURE_BE_DISCOVERY_OK=1 \
  WOODRIGHT_FIXTURE_SF_DISCOVERY_OK=1 \
  WOODRIGHT_BE_CONTAINER=woodright-staging-backend \
  WOODRIGHT_SF_CONTAINER=woodright-staging-storefront \
  WOODRIGHT_FAKE_MOUNTS_JSON="$mounts_json" \
  WOODRIGHT_PG_CONTAINER=skip-pg \
  WOODRIGHT_REDIS_CONTAINER=skip-redis \
  WOODRIGHT_FIXTURE_BACKUP_AGE_H=1 \
  WOODRIGHT_FIXTURE_DISK_PCT=10 \
  bash "$HC" --environment public_demo >"$out" 2>/dev/null
  set -e
  media="$(python3 - "$out" <<'PY'
import json,sys
text=open(sys.argv[1]).read()
i=text.find("{")
obj,_=json.JSONDecoder().raw_decode(text[i:])
for c in obj.get("checks") or []:
  if c.get("name")=="media_mount":
    print(c.get("status")+"|"+c.get("detail",""))
    break
else:
  print("missing|")
PY
)"
  if [[ "$expect_status" == "pass" ]]; then
    [[ "$media" == pass* ]] && pass "$name media=$media" || fail "$name media=$media"
  else
    [[ "$media" == fail* ]] && pass "$name media=$media" || fail "$name expected fail media=$media"
  fi
  rm -f "$out"
}

run_shim "pc_correct_volume" production "$PC_OK" pass
run_shim "pc_staging_volume_on_pc_profile" production "$PC_STAGING_HARDCODE" fail
run_shim "pc_wrong_volume" production "$PC_WRONG" fail
run_shim "pc_wrong_dest" production "$PC_WRONG_DEST" fail
run_shim "pc_bind_mount" production "$PC_BIND" fail
run_shim "pc_ambiguous" production "$PC_MULTI" fail
run_shim "pc_absent" production "$PC_EMPTY" fail
run_shim_demo "public_demo_correct" "$DEMO_OK" pass
run_shim_demo "public_demo_rejects_production_volume" "$PC_OK" fail

# Missing profile identity: unset by running without --environment and without MEDIA_VOLUME
out="$(mktemp)"
set +e
PATH="$BIN:$PATH" WOODRIGHT_MONITOR_WRITE=0 \
  WOODRIGHT_FIXTURE_BE_DISCOVERY_OK=1 WOODRIGHT_BE_CONTAINER=x \
  WOODRIGHT_FIXTURE_SF_DISCOVERY_OK=1 WOODRIGHT_SF_CONTAINER=y \
  WOODRIGHT_FAKE_MOUNTS_JSON="$PC_OK" \
  WOODRIGHT_FIXTURE_BACKUP_AGE_H=1 WOODRIGHT_FIXTURE_DISK_PCT=10 \
  bash "$HC" >"$out" 2>/dev/null
set -e
media="$(python3 - "$out" <<'PY'
import json,sys
text=open(sys.argv[1]).read()
i=text.find("{")
obj,_=json.JSONDecoder().raw_decode(text[i:])
for c in obj.get("checks") or []:
  if c.get("name")=="media_mount":
    print(c.get("status")+"|"+c.get("detail",""))
    break
else:
  print("missing|")
PY
)"
[[ "$media" == fail*missing_expected* || "$media" == fail* ]] \
  && pass "no_profile_missing_expected ($media)" \
  || fail "no_profile should fail-closed ($media)"
rm -f "$out"

if [[ "$FAIL" -eq 0 ]]; then
  echo "ALL_MEDIA_MONITOR_PASS"
  exit 0
fi
echo "FAILED=$FAIL"
exit 1
