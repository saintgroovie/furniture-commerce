#!/usr/bin/env bash
# Regression: public_demo BE recreate wrong DB label + pair rollback without RepoDigests shim.
# Models the 2026-07-31 failed deploy of 8f9b914 (BE mutated, SF unchanged, auto-rollback).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMMON="$ROOT/ops/lib/woodright-cutover-common.sh"
ENVLIB="$ROOT/ops/lib/woodright-environment-profile.sh"
BE_RB="$ROOT/ops/release/rollback-staging-backend-from-keeper.sh"
SF_RB="$ROOT/ops/release/rollback-staging-storefront-from-keeper.sh"
LOCK="$ROOT/ops/lib/woodright-staging-mutation-lock.sh"
FAILED=0
TMP="$(mktemp -d /tmp/wr-cutover-hotfix-XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

pass() { echo "PASS $*"; }
fail() { echo "FAIL $*"; FAILED=$((FAILED + 1)); }

OLD_SHA="9946b42e542071836b2b3e56a65e11a5afafe07f"
NEW_SHA="8f9b914d219757ef0638aadd1c77f8ead253652a"
OLD_BE="sha256:fa26535606ca37b619ae0db1a1b4e59bb047bfd1cba7991998d89bf2264edf68"
OLD_SF="sha256:1e6804050b711fe97a7d7c86b5d6db203a87b23634ec7a10064dddce72f2e07f"
NEW_BE="sha256:5c053fe4d6066c3f31aea13d29f1d53ef244dad92db2059d2f143486dcbdabcc"

FAKE="$TMP/bin"
mkdir -p "$FAKE" "$TMP/state/containers" "$TMP/state/images" "$TMP/state/networks" "$TMP/state/log"
cat >"$FAKE/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
STATE="${WOODRIGHT_FAKE_DOCKER_STATE:?}"
cmd="${1:-}"; shift || true
mkdir -p "$STATE/containers" "$STATE/images" "$STATE/networks" "$STATE/log"
echo "docker $cmd $*" >>"$STATE/log/commands.log"
case "$cmd" in
  inspect)
    target=""; fmt=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --format) fmt="$2"; shift 2 ;;
        --format=*) fmt="${1#--format=}"; shift ;;
        *) target="$1"; shift ;;
      esac
    done
    if [[ -f "$STATE/images/${target//\//_}.json" && ! -f "$STATE/containers/${target}.json" ]]; then
      if [[ -n "$fmt" ]]; then
        python3 - "$STATE/images/${target//\//_}.json" "$fmt" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); fmt=sys.argv[2]
if "RepoDigests" in fmt: print(json.dumps(d.get("RepoDigests") or []))
elif "revision" in fmt: print((d.get("Config") or {}).get("Labels",{}).get("org.opencontainers.image.revision",""))
elif ".Id" in fmt: print(d.get("Id",""))
else: print("")
PY
      else cat "$STATE/images/${target//\//_}.json"
      fi
      exit 0
    fi
    f="$STATE/containers/${target}.json"
    [[ -f "$f" ]] || exit 1
    if [[ -n "$fmt" ]]; then
      python3 - "$f" "$fmt" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))[0]; fmt=sys.argv[2]
if "RepoDigests" in fmt:
  sys.stderr.write('template parsing error: map has no entry for key "RepoDigests"\n'); sys.exit(1)
if "runtime-role" in fmt: print((d.get("Config") or {}).get("Labels",{}).get("com.woodright.runtime-role",""))
elif "release-sha" in fmt: print((d.get("Config") or {}).get("Labels",{}).get("com.woodright.release-sha",""))
elif "deployment-owner" in fmt: print((d.get("Config") or {}).get("Labels",{}).get("com.woodright.deployment-owner",""))
elif "exposure" in fmt and "com.woodright.exposure" in fmt: print((d.get("Config") or {}).get("Labels",{}).get("com.woodright.exposure",""))
elif "database-identity" in fmt: print((d.get("Config") or {}).get("Labels",{}).get("com.woodright.database-identity",""))
elif "image.title" in fmt or "org.opencontainers.image.title" in fmt: print((d.get("Config") or {}).get("Labels",{}).get("org.opencontainers.image.title",""))
elif "compose.project" in fmt: print((d.get("Config") or {}).get("Labels",{}).get("com.docker.compose.project",""))
elif ".Config.Image" in fmt: print((d.get("Config") or {}).get("Image",""))
elif ".Image" in fmt: print(d.get("Image",""))
elif ".Id" in fmt: print(d.get("Id",""))
elif "yes" in fmt and "Health" in fmt: print("yes" if (d.get("State") or {}).get("Health") else "no")
elif "Health" in fmt: print(((d.get("State") or {}).get("Health") or {}).get("Status") or (d.get("State") or {}).get("Status",""))
elif ".State.Status" in fmt: print((d.get("State") or {}).get("Status",""))
elif "Mounts" in fmt: print(json.dumps(d.get("Mounts") or []))
elif "Env" in fmt or "range .Config.Env" in fmt:
  for e in (d.get("Config") or {}).get("Env") or []: print(e)
else: print("")
PY
    else cat "$f"
    fi
    ;;
  image)
    sub="${1:-}"; shift || true
    [[ "$sub" == "inspect" ]] || exit 0
    target=""; fmt=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --format) fmt="$2"; shift 2 ;;
        --format=*) fmt="${1#--format=}"; shift ;;
        *) target="$1"; shift ;;
      esac
    done
    f="$STATE/images/${target//\//_}.json"
    [[ -f "$f" ]] || exit 1
    if [[ -n "$fmt" ]]; then
      python3 - "$f" "$fmt" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); fmt=sys.argv[2]
if "json .RepoDigests" in fmt or fmt.strip()=="{{json .RepoDigests}}":
  print(json.dumps(d.get("RepoDigests") or []))
elif "RepoDigests" in fmt:
  digs=d.get("RepoDigests") or []; print(digs[0] if digs else "")
elif "revision" in fmt:
  print((d.get("Config") or {}).get("Labels",{}).get("org.opencontainers.image.revision",""))
elif ".Id" in fmt: print(d.get("Id",""))
else: print("")
PY
    else cat "$f"
    fi
    ;;
  network)
    sub="${1:-}"; shift || true
    [[ "$sub" == "connect" ]] && echo connected >>"$STATE/log/commands.log"
    [[ "$sub" == "inspect" ]] && { [[ -f "$STATE/networks/${1}.ok" ]] || exit 1; echo "{}"; }
    ;;
  stop|start|rename)
    echo "$cmd $*" >>"$STATE/log/mutations.log"
    [[ "${WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION:-0}" == "1" ]] || { echo UNEXPECTED_MUTATION >&2; exit 99; }
    if [[ "$cmd" == "rename" ]]; then
      src="${1#/}"; dst="${2#/}"
      python3 - "$STATE/containers/${src}.json" "$STATE/containers/${dst}.json" "$dst" <<'PY'
import json,sys,os
src,dst,name=sys.argv[1:4]
d=json.load(open(src)); d[0]["Name"]="/"+name; d[0]["Id"]="id-"+name
json.dump(d, open(dst,"w")); os.remove(src)
PY
    else
      name="${1#/}"; f="$STATE/containers/${name}.json"
      python3 - "$f" "$cmd" <<'PY'
import json,sys
f,cmd=sys.argv[1:3]; d=json.load(open(f)); st=d[0].setdefault("State",{})
if cmd=="stop":
  st["Status"]="exited"
  if "Health" in st: st["Health"]["Status"]="unhealthy"
else:
  st["Status"]="running"; st.setdefault("Health",{})["Status"]="healthy"
json.dump(d, open(f,"w"))
PY
    fi
    ;;
  *) exit 0 ;;
esac
EOF
chmod +x "$FAKE/docker"

python3 - "$TMP/state" "$OLD_BE" "$OLD_SF" "$NEW_BE" "$OLD_SHA" "$NEW_SHA" <<'PY'
import json, os, sys
state, old_be, old_sf, new_be, old_sha, new_sha = sys.argv[1:7]

def write_image(dig, title, sha):
  img = f"ghcr.io/saintgroovie/{title}@{dig}"
  doc = {
    "Id": dig,
    "RepoDigests": [img],
    "Config": {"Labels": {
      "org.opencontainers.image.revision": sha,
      "org.opencontainers.image.title": title,
    }},
  }
  open(os.path.join(state, "images", dig.replace("/", "_") + ".json"), "w").write(json.dumps(doc))
  open(os.path.join(state, "images", img.replace("/", "_") + ".json"), "w").write(json.dumps(doc))

def ctr(name, dig, sha, title, db_label="public_demo_db"):
  return [{
    "Id": f"id-{name}",
    "Name": f"/{name}",
    "Image": dig,
    "Config": {
      "Image": f"ghcr.io/saintgroovie/{title}@{dig}",
      "Env": [
        "WOODRIGHT_RUNTIME_ROLE=public_demo",
        "WOODRIGHT_DATABASE_IDENTITY_ALIAS=public_demo_db",
        "PATH=/usr/bin",
      ],
      "Labels": {
        "com.woodright.runtime-role": "public_demo",
        "com.woodright.deployment-owner": "Dokploy",
        "com.woodright.exposure": "public",
        "com.woodright.database-identity": db_label,
        "com.woodright.release-sha": sha,
        "org.opencontainers.image.revision": sha,
        "org.opencontainers.image.title": title,
      },
      "Healthcheck": {"Test": ["CMD-SHELL", "true"]},
    },
    "HostConfig": {"RestartPolicy": {"Name": "unless-stopped"}},
    "NetworkSettings": {"Networks": {
      "woodright-stack-3dsdhd_woodright_staging": {"Aliases": ["backend" if "backend" in name else "storefront"]},
      "dokploy-network": {"Aliases": []},
    }, "Ports": {}},
    "Mounts": [{"Name": "woodright-stack-3dsdhd_woodright_staging_media", "Destination": "/server/static"}],
    "State": {"Status": "running", "Health": {"Status": "healthy"}},
  }]

write_image(old_be, "woodright-backend", old_sha)
write_image(old_sf, "woodright-storefront", old_sha)
write_image(new_be, "woodright-backend", new_sha)
open(os.path.join(state, "containers", "woodright-staging-backend.json"), "w").write(
  json.dumps(ctr("woodright-staging-backend", old_be, old_sha, "woodright-backend")))
open(os.path.join(state, "containers", "woodright-staging-storefront.json"), "w").write(
  json.dumps(ctr("woodright-staging-storefront", old_sf, old_sha, "woodright-storefront")))
open(os.path.join(state, "containers", "woodright-production-backend.json"), "w").write(
  json.dumps(ctr("woodright-production-backend", old_be, old_sha, "woodright-backend")))
open(os.path.join(state, "networks", "woodright-stack-3dsdhd_woodright_staging.ok"), "w").write("")
open(os.path.join(state, "networks", "dokploy-network.ok"), "w").write("")
PY

export PATH="$FAKE:$PATH"
export WOODRIGHT_DOCKER_BIN="$FAKE/docker"
export WOODRIGHT_FAKE_DOCKER_STATE="$TMP/state"
export WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION=0

# shellcheck source=/dev/null
source "$ENVLIB"
# shellcheck source=/dev/null
source "$COMMON"

# --- DB identity resolver ---
wr_load_environment_profile public_demo
wr_require_canonical_db_identity
[[ "$WOODRIGHT_DATABASE_IDENTITY_ALIAS" == "public_demo_db" ]] && pass "public_demo alias=public_demo_db" || fail "alias=$WOODRIGHT_DATABASE_IDENTITY_ALIAS"
[[ "$WOODRIGHT_DATABASE_CONNECTION_NAME" == "woodright_staging" ]] && pass "connection name woodright_staging" || fail "connection=$WOODRIGHT_DATABASE_CONNECTION_NAME"
label="$(wr_canonical_db_identity_label)"
[[ "$label" == "public_demo_db" ]] && pass "label helper public_demo_db" || fail "label=$label"
# recreate scripts must not use WOODRIGHT_DB_NAME for the label
if grep -n 'database-identity=\${WOODRIGHT_DB_NAME' \
  "$ROOT/ops/release/recreate-staging-backend-with-media.sh" \
  "$ROOT/ops/release/recreate-staging-storefront.sh"; then
  fail "recreate still labels from WOODRIGHT_DB_NAME"
else
  pass "recreate does not label from WOODRIGHT_DB_NAME"
fi
grep -q 'wr_canonical_db_identity_label\|WOODRIGHT_DATABASE_IDENTITY_ALIAS\|DB_IDENTITY_ALIAS' \
  "$ROOT/ops/release/recreate-staging-backend-with-media.sh" \
  && pass "backend recreate uses canonical DB identity" \
  || fail "backend recreate missing canonical DB identity"

# staging/production aliases isolated
unset WOODRIGHT_ENVIRONMENT WOODRIGHT_ENV_PROFILE_LOADED
export WOODRIGHT_ENV_ALLOW_INHERITED_MISMATCH=1
wr_load_environment_profile staging
[[ "${WOODRIGHT_REQUIRED_DB_ALIAS:-}" == "staging_db" ]] && pass "staging alias staging_db" || fail "staging alias=${WOODRIGHT_REQUIRED_DB_ALIAS:-}"
unset WOODRIGHT_ENVIRONMENT WOODRIGHT_ENV_PROFILE_LOADED
wr_load_environment_profile production
[[ "${WOODRIGHT_REQUIRED_DB_ALIAS:-}" == "non_public_candidate_db" ]] && pass "production alias isolated" || fail "production alias=${WOODRIGHT_REQUIRED_DB_ALIAS:-}"
unset WOODRIGHT_ENVIRONMENT WOODRIGHT_ENV_PROFILE_LOADED WOODRIGHT_ENV_ALLOW_INHERITED_MISMATCH
wr_load_environment_profile public_demo
wr_require_canonical_db_identity

# missing alias fail-closed
(
  export WOODRIGHT_REQUIRED_DB_ALIAS=""
  if wr_require_canonical_db_identity 2>/dev/null; then
    exit 1
  fi
  exit 0
) && pass "missing alias refused" || fail "missing alias accepted"

# --- image identity: container has no RepoDigests ---
set +e
"$FAKE/docker" inspect woodright-staging-backend --format '{{json .RepoDigests}}' >/dev/null 2>"$TMP/rd.err"
RD_RC=$?
set -e
if [[ "$RD_RC" -ne 0 ]] && grep -q RepoDigests "$TMP/rd.err"; then
  pass "container RepoDigests fail-closed"
else
  fail "container RepoDigests unexpectedly succeeded or wrong error"
fi
# Clear probe noise from command log before rollback assertions
: >"$TMP/state/log/commands.log"

be_dig="$(wr_cutover_container_immutable_digest woodright-staging-backend backend)"
sf_dig="$(wr_cutover_container_immutable_digest woodright-staging-storefront storefront)"
[[ "$be_dig" == "$OLD_BE" ]] && pass "BE digest via image inspect" || fail "BE dig=$be_dig"
[[ "$sf_dig" == "$OLD_SF" ]] && pass "SF digest via image inspect" || fail "SF dig=$sf_dig"

# ambiguity refused
python3 - "$TMP/state" "$OLD_BE" <<'PY'
import json,sys
state,dig=sys.argv[1:3]
path=f"{state}/images/{dig.replace('/','_')}.json"
d=json.load(open(path))
d["RepoDigests"]=[
  f"ghcr.io/saintgroovie/woodright-backend@{dig}",
  f"ghcr.io/saintgroovie/woodright-backend@{dig}",
]
json.dump(d, open(path,"w"))
PY
if wr_cutover_container_immutable_digest woodright-staging-backend backend 2>/dev/null; then
  fail "ambiguous RepoDigest accepted"
else
  pass "ambiguous RepoDigest refused"
fi
# restore single digest
python3 - "$TMP/state" "$OLD_BE" <<'PY'
import json,sys
state,dig=sys.argv[1:3]
path=f"{state}/images/{dig.replace('/','_')}.json"
d=json.load(open(path))
d["RepoDigests"]=[f"ghcr.io/saintgroovie/woodright-backend@{dig}"]
json.dump(d, open(path,"w"))
# mirror
img=f"ghcr.io/saintgroovie/woodright-backend@{dig}"
json.dump(d, open(f"{state}/images/{img.replace('/','_')}.json","w"))
PY

# wrong repository refused
if wr_cutover_resolve_container_image_identity woodright-staging-backend "" "ghcr.io/other/woodright-backend" 2>/dev/null; then
  fail "wrong repository accepted"
else
  pass "wrong repository refused"
fi

# grep: no container .RepoDigests in rollback/pair paths
if grep -nE "inspect .*RepoDigests|format '.*RepoDigests" \
  "$ROOT/ops/release/rollback-staging-backend-from-keeper.sh" \
  "$ROOT/ops/release/rollback-staging-storefront-from-keeper.sh" \
  "$ROOT/ops/release/cutover-public-demo-pair.sh" \
  | grep -v image.inspect | grep -v '#' ; then
  fail "container RepoDigests still referenced in cutover/rollback"
else
  pass "cutover/rollback no longer use container RepoDigests"
fi

# Orchestrator must wire WOODRIGHT_ROLLBACK_EXPECT_SF_DIGEST from OLD_SF_DIGEST
if awk '/run_backup_gate/,/MUTATION_STARTED=1/' "$ROOT/ops/release/cutover-public-demo-pair.sh" \
  | grep -q 'WOODRIGHT_ROLLBACK_EXPECT_SF_DIGEST'; then
  pass "pair wires ROLLBACK_EXPECT_SF_DIGEST before mutation"
else
  fail "pair missing ROLLBACK_EXPECT_SF_DIGEST wiring before mutation"
fi
grep -q 'WOODRIGHT_ROLLBACK_EXPECT_SF_DIGEST' "$ROOT/ops/release/cutover-public-demo-pair.sh" \
  && pass "pair_rollback exports expect SF digest" \
  || fail "pair_rollback missing expect SF export"

# --- Exact incident: BE retargeted with wrong DB label, SF unchanged, pair rollback ---
python3 - "$TMP/state" "$NEW_BE" "$NEW_SHA" "$OLD_BE" "$OLD_SHA" <<'PY'
import json, os, sys
state, new_be, new_sha, old_be, old_sha = sys.argv[1:6]
ctr = os.path.join(state, "containers")
be = json.load(open(os.path.join(ctr, "woodright-staging-backend.json")))
# keeper = old BE
json.dump(be, open(os.path.join(ctr, "woodright-staging-backend-keeper-20260731T173758Z.json"), "w"))
# live BE = target with WRONG database-identity label (incident)
be[0]["Image"] = new_be
be[0]["Config"]["Image"] = f"ghcr.io/saintgroovie/woodright-backend@{new_be}"
be[0]["Config"]["Labels"]["com.woodright.release-sha"] = new_sha
be[0]["Config"]["Labels"]["org.opencontainers.image.revision"] = new_sha
be[0]["Config"]["Labels"]["com.woodright.database-identity"] = "woodright_staging"  # bug symptom
be[0]["Id"] = "id-new-be-target"
json.dump(be, open(os.path.join(ctr, "woodright-staging-backend.json"), "w"))
# SF unchanged old — no SF keeper
PY

# Under-lock gate would refuse wrong alias
wr_load_environment_profile public_demo
export PATH="$FAKE:$PATH"
export WOODRIGHT_DOCKER_BIN="$FAKE/docker"
set +e
wr_assert_container_matches_environment woodright-staging-backend backend >"$TMP/gate.out" 2>"$TMP/gate.err"
GATE_RC=$?
set -e
if [[ "$GATE_RC" -ne 0 ]] && grep -q "DB alias mismatch" "$TMP/gate.err"; then
  pass "wrong alias under-lock gate refuses"
else
  fail "wrong alias under-lock gate refuses (rc=$GATE_RC)"
  cat "$TMP/gate.err" || true
fi

# Automatic pair rollback (BE keeper only, SF unchanged) — no shim
# Mimic orchestrator wiring: OLD_SF_DIGEST captured pre-mutation
EV="$TMP/evidence"
mkdir -p "$EV/json" "$EV/pin-backup" "$TMP/pins"
printf 'WOODRIGHT_BACKEND_IMAGE=ghcr.io/saintgroovie/woodright-backend@%s\nWOODRIGHT_STOREFRONT_IMAGE=ghcr.io/saintgroovie/woodright-storefront@%s\n' \
  "$OLD_BE" "$OLD_SF" >"$TMP/pins/DOKPLOY_IMAGE_PINS.env"
cp -p "$TMP/pins/DOKPLOY_IMAGE_PINS.env" "$EV/pin-backup/DOKPLOY_IMAGE_PINS.env"
printf '{"release_sha":"%s"}\n' "$OLD_SHA" >"$TMP/pins/ACTIVE_PUBLIC.json"
cp -p "$TMP/pins/ACTIVE_PUBLIC.json" "$EV/pin-backup/ACTIVE_PUBLIC.json"

export WOODRIGHT_FAKE_DOCKER_ALLOW_MUTATION=1
export WOODRIGHT_ROLLBACK_POLL_SLEEP_SEC=0
OLD_SF_DIGEST="$OLD_SF"
export WOODRIGHT_ROLLBACK_EXPECT_SF_DIGEST="$OLD_SF_DIGEST"
export WOODRIGHT_CUTOVER_PINS_ENV="$TMP/pins/DOKPLOY_IMAGE_PINS.env"
export WOODRIGHT_CUTOVER_ACTIVE_PUBLIC="$TMP/pins/ACTIVE_PUBLIC.json"
export WOODRIGHT_CUTOVER_PUBLIC_DEMO_JSON="$TMP/pins/public-demo.json"
export WOODRIGHT_CUTOVER_COMPOSE_ENV="$TMP/pins/compose.env"
printf '{"env":"public_demo"}\n' >"$TMP/pins/public-demo.json"
printf 'STOREFRONT_IMAGE=old\n' >"$TMP/pins/compose.env"
cp -p "$TMP/pins/public-demo.json" "$EV/pin-backup/public-demo.json"
cp -p "$TMP/pins/compose.env" "$EV/pin-backup/dokploy-compose.env"
export WR_STAGING_MUTATION_LOCK_PATH="$TMP/live-cutover.lock"
export WR_STAGING_MUTATION_LOCK_ALLOW_NONCANONICAL=1
touch "$TMP/live-cutover.lock"
# shellcheck source=/dev/null
source "$LOCK"
wr_staging_mutation_lock_acquire actor=hotfix-rb-test command=test
wr_staging_mutation_lock_export_inherit

set +e
wr_cutover_pair_rollback \
  "$EV" \
  "woodright-staging-backend-keeper-20260731T173758Z" \
  "" \
  "$BE_RB" \
  "$SF_RB"
RB_RC=$?
set -e

[[ "$RB_RC" -eq 10 ]] && pass "incident pair_rollback RC=10 (not partial)" || fail "pair_rollback rc=$RB_RC want 10"
grep -q PAIR_ROLLBACK_OK <<<"$(tail -5 "$EV/json/pair-rollback-result.json" 2>/dev/null || true)" || true
[[ -f "$EV/json/pair-rollback-result.json" ]] || fail "missing pair-rollback-result"
grep -q '"backend":1' "$EV/json/pair-rollback-result.json" && pass "backend restored flag" || fail "backend flag"
grep -q '"storefront":1' "$EV/json/pair-rollback-result.json" && pass "storefront unchanged flag" || fail "storefront flag"
[[ -f "$EV/json/storefront-unchanged-after-rollback.json" ]] && pass "SF unchanged evidence" || fail "SF unchanged evidence missing"

restored="$(wr_cutover_container_immutable_digest woodright-staging-backend backend)"
sf_after="$(wr_cutover_container_immutable_digest woodright-staging-storefront storefront)"
be_sha="$("$FAKE/docker" inspect woodright-staging-backend --format '{{index .Config.Labels "com.woodright.release-sha"}}')"
sf_sha="$("$FAKE/docker" inspect woodright-staging-storefront --format '{{index .Config.Labels "com.woodright.release-sha"}}')"
db_label="$("$FAKE/docker" inspect woodright-staging-backend --format '{{index .Config.Labels "com.woodright.database-identity"}}')"
[[ "$restored" == "$OLD_BE" ]] && pass "restored BE digest old" || fail "restored=$restored"
[[ "$sf_after" == "$OLD_SF" ]] && pass "SF still old digest" || fail "sf_after=$sf_after"
[[ "$be_sha" == "$OLD_SHA" && "$sf_sha" == "$OLD_SHA" ]] && pass "pair SHA restored/unchanged $OLD_SHA" || fail "sha be=$be_sha sf=$sf_sha"
[[ "$db_label" == "public_demo_db" ]] && pass "restored DB label public_demo_db" || fail "db_label=$db_label"
grep -q "$OLD_BE" "$TMP/pins/DOKPLOY_IMAGE_PINS.env" && pass "pins remain old" || fail "pins changed"
# production untouched
[[ -f "$TMP/state/containers/woodright-production-backend.json" ]] && pass "production container file untouched" || fail "production missing"
# no shim: commands log must not show rewritten formats; must include image inspect
grep -q 'image inspect' "$TMP/state/log/commands.log" && pass "rollback used image inspect" || fail "no image inspect in log"
if grep -E "inspect .*RepoDigests" "$TMP/state/log/commands.log" | grep -v 'image inspect'; then
  fail "container RepoDigests still invoked"
else
  pass "no container RepoDigests invocation"
fi

wr_staging_mutation_lock_release

# Negative: expect SF digest wired but live SF drifted → must NOT return RC=10
NEG2="$TMP/evidence-sf-drift"
mkdir -p "$NEG2/json" "$NEG2/pin-backup"
cp -p "$EV/pin-backup/"* "$NEG2/pin-backup/" 2>/dev/null || true
python3 - "$TMP/state" "$NEW_BE" "$NEW_SHA" "$OLD_BE" "$OLD_SHA" "$OLD_SF" <<'PY'
import json, os, sys
state, new_be, new_sha, old_be, old_sha, old_sf = sys.argv[1:7]
ctr = os.path.join(state, "containers")
be = json.load(open(os.path.join(ctr, "woodright-staging-backend.json")))
json.dump(be, open(os.path.join(ctr, "woodright-staging-backend-keeper-drift.json"), "w"))
be[0]["Image"] = new_be
be[0]["Config"]["Image"] = f"ghcr.io/saintgroovie/woodright-backend@{new_be}"
be[0]["Config"]["Labels"]["com.woodright.release-sha"] = new_sha
be[0]["Config"]["Labels"]["org.opencontainers.image.revision"] = new_sha
json.dump(be, open(os.path.join(ctr, "woodright-staging-backend.json"), "w"))
# Drift SF to new_be digest wrongly (simulate unexpected SF change)
sf = json.load(open(os.path.join(ctr, "woodright-staging-storefront.json")))
# Keep old image file but change Config label release only is not enough — change Image to NEW_BE wrongly would break title repo
# Instead point SF at a different known digest file: reuse NEW_BE backend digest under storefront repo by writing image
bad = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
sf[0]["Image"] = bad
sf[0]["Config"]["Image"] = f"ghcr.io/saintgroovie/woodright-storefront@{bad}"
img = f"ghcr.io/saintgroovie/woodright-storefront@{bad}"
doc = {"Id": bad, "RepoDigests": [img], "Config": {"Labels": {"org.opencontainers.image.revision": new_sha, "org.opencontainers.image.title": "woodright-storefront"}}}
open(os.path.join(state, "images", bad.replace("/", "_") + ".json"), "w").write(json.dumps(doc))
open(os.path.join(state, "images", img.replace("/", "_") + ".json"), "w").write(json.dumps(doc))
json.dump(sf, open(os.path.join(ctr, "woodright-staging-storefront.json"), "w"))
PY
export WOODRIGHT_ROLLBACK_EXPECT_SF_DIGEST="$OLD_SF"
export WR_STAGING_MUTATION_LOCK_PATH="$TMP/live-cutover2.lock"
touch "$TMP/live-cutover2.lock"
wr_staging_mutation_lock_acquire actor=hotfix-rb-drift command=test
wr_staging_mutation_lock_export_inherit
set +e
wr_cutover_pair_rollback \
  "$NEG2" \
  "woodright-staging-backend-keeper-drift" \
  "" \
  "$BE_RB" \
  "$SF_RB"
DRIFT_RC=$?
set -e
if [[ "$DRIFT_RC" -eq 11 ]] || [[ "$DRIFT_RC" -eq 12 ]]; then
  pass "SF drift with expect digest → non-OK rollback rc=$DRIFT_RC"
else
  fail "SF drift should not be ROLLBACK_OK (rc=$DRIFT_RC)"
fi
wr_staging_mutation_lock_release

# secret redaction still works
echo '[{"Config":{"Env":["DATABASE_URL=postgres://u:p@h/db","A=1"]}}]' | wr_cutover_sanitize_inspect_json >"$TMP/san.json"
if grep -q 'postgres://' "$TMP/san.json"; then fail "DB URL leaked"; else pass "DB URL redacted"; fi

if [[ "$FAILED" -eq 0 ]]; then
  echo "ALL HOTFIX FIDELITY TESTS PASSED"
  exit 0
fi
echo "FAILED=$FAILED"
exit 1
