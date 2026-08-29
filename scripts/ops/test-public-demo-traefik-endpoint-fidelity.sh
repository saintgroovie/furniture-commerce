#!/usr/bin/env bash
# Fidelity tests for public_demo Traefik endpoint authority (no live mutation).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMMON="$ROOT/ops/lib/woodright-cutover-common.sh"
PY="$ROOT/ops/lib/woodright-public-demo-traefik-endpoint.py"
APPLY="$ROOT/ops/release/apply-public-demo-traefik-endpoints.sh"
PAIR="$ROOT/ops/release/cutover-public-demo-pair.sh"
SF="$ROOT/ops/release/recreate-staging-storefront.sh"
BE="$ROOT/ops/release/recreate-staging-backend-with-media.sh"
FAILED=0
TMP="$(mktemp -d /tmp/wr-tf-ep-test-XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

pass() { echo "PASS $*"; }
fail() { echo "FAIL $*"; FAILED=$((FAILED + 1)); }

DD=dd304d1bf92d59c85795b5091ed0386365bcca6d
CAF=caf82b048b9caefae30679342aec3d4fc42a8d89
SF_DIG=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
BE_DIG=sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
SF_ID=c9b216f5ade0aa49a545583a9bbf0cc6f300bf6e3b7325c6e16cdc3c0b0fad70
BE_ID=c70eacb9be7b94a040722109226bf480e2302fe28ee513154f46bf62addad895
WRONG_ID=ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff

demo_yaml() {
  cat <<'EOF'
http:
  routers:
    woodright-api-https:
      rule: Host(`api.woodright-demo.ru`)
      service: woodright-backend
    woodright-sf-https:
      rule: Host(`woodright-demo.ru`)
      service: woodright-storefront
  services:
    woodright-backend:
      loadBalancer:
        servers:
          - url: "http://woodright-staging-backend:9000"
    woodright-storefront:
      loadBalancer:
        servers:
          - url: "http://woodright-staging-storefront:3002"
EOF
}

# --- static contracts ---
if grep -q 'wr_public_demo_nudge_edge_resolver' "$COMMON"; then
  fail "comment-only nudge helper must not remain"
else
  pass "comment-only nudge helper removed"
fi
grep -q 'wr_public_demo_apply_traefik_pair_endpoints' "$SF" \
  && grep -q 'wr_public_demo_apply_traefik_pair_endpoints' "$PAIR" \
  && pass "storefront+pair apply Traefik endpoints before settle" \
  || fail "endpoint apply not wired before settle"
grep -q 'wr_public_demo_detach_keeper_from_traefik_net' "$SF" \
  && grep -q 'wr_public_demo_detach_keeper_from_traefik_net' "$BE" \
  && pass "both recreates detach keeper from Traefik network" \
  || fail "keeper Traefik-net detach missing"
grep -q 'wr_public_demo_restore_traefik_hostnames' "$COMMON" \
  && grep -q 'WOODRIGHT_PUBLIC_DEMO_RESTORE_ENDPOINTS=1' "$COMMON" \
  && pass "pair rollback restores hostname endpoints" \
  || fail "rollback hostname restore missing"
if grep -q 'wr_public_demo_nudge_edge_resolver' "$SF" "$PAIR" "$COMMON"; then
  fail "nudge still referenced from live helpers"
else
  pass "live helpers no longer call comment nudge"
fi

# --- Case A exact target endpoint ---
demo_yaml >"$TMP/demo.yml"
python3 "$PY" rewrite --file "$TMP/demo.yml" \
  --sf-url "http://10.0.1.42:3002" --be-url "http://10.0.1.41:9000" >/dev/null
if grep -q 'http://10.0.1.42:3002' "$TMP/demo.yml" \
  && grep -q 'http://10.0.1.41:9000' "$TMP/demo.yml" \
  && grep -q 'Host(`woodright-demo.ru`)' "$TMP/demo.yml"; then
  pass "A exact target IPs written"
else
  fail "A rewrite did not pin target IPs"
fi

# --- Case H decoy ---
cat >"$TMP/decoy.yml" <<'EOF'
note: see woodright-demo.ru
container: woodright-staging-storefront
url: "http://woodright-staging-storefront:3002"
EOF
cp "$TMP/decoy.yml" "$TMP/decoy.before"
if python3 "$PY" rewrite --file "$TMP/decoy.yml" \
  --sf-url "http://10.0.1.9:3002" --be-url "http://10.0.1.8:9000" >/dev/null 2>"$TMP/decoy.err"; then
  fail "H decoy rewrite succeeded"
else
  cmp -s "$TMP/decoy.yml" "$TMP/decoy.before" && pass "H decoy unchanged" || fail "H decoy mutated"
fi

# --- Case I apex ---
cat >"$TMP/apex.yml" <<'EOF'
http:
  routers:
    woodright-sf-https:
      rule: Host(`woodright.ru`)
      service: woodright-storefront
    woodright-api-https:
      rule: Host(`api.woodright-demo.ru`)
      service: woodright-backend
  services:
    woodright-backend:
      loadBalancer:
        servers:
          - url: "http://woodright-staging-backend:9000"
    woodright-storefront:
      loadBalancer:
        servers:
          - url: "http://woodright-staging-storefront:3002"
EOF
cp "$TMP/apex.yml" "$TMP/apex.before"
if python3 "$PY" rewrite --file "$TMP/apex.yml" \
  --sf-url "http://10.0.1.42:3002" --be-url "http://10.0.1.41:9000" >/dev/null; then
  fail "I apex rewrite succeeded"
else
  cmp -s "$TMP/apex.yml" "$TMP/apex.before" && pass "I apex unchanged" || fail "I apex mutated"
fi

# --- Case J production ---
cat >"$TMP/prod.yml" <<'EOF'
http:
  routers:
    woodright-sf-https:
      rule: Host(`woodright-demo.ru`)
      service: woodright-storefront
    woodright-api-https:
      rule: Host(`api.woodright-demo.ru`)
      service: woodright-backend
  services:
    woodright-backend:
      loadBalancer:
        servers:
          - url: "http://woodright-staging-backend:9000"
    woodright-storefront:
      loadBalancer:
        servers:
          - url: "http://woodright-public-production-storefront:3000"
EOF
cp "$TMP/prod.yml" "$TMP/prod.before"
if python3 "$PY" rewrite --file "$TMP/prod.yml" \
  --sf-url "http://10.0.1.42:3002" --be-url "http://10.0.1.41:9000" >/dev/null; then
  fail "J production rewrite succeeded"
else
  cmp -s "$TMP/prod.yml" "$TMP/prod.before" && pass "J production/candidate-like file unchanged" || fail "J mutated"
fi

# --- Case G unexpected URL ---
demo_yaml >"$TMP/badurl.yml"
python3 -c 'from pathlib import Path; p=Path("'"$TMP"'/badurl.yml"); t=p.read_text(); p.write_text(t.replace("http://woodright-staging-storefront:3002","http://evil.example:3002"))'
if python3 "$PY" rewrite --file "$TMP/badurl.yml" \
  --sf-url "http://10.0.1.42:3002" --be-url "http://10.0.1.41:9000" >/dev/null; then
  fail "G unexpected URL was accepted"
else
  pass "G unexpected current URL refused"
fi

# --- public IP refused as desired ---
demo_yaml >"$TMP/pubip.yml"
if python3 "$PY" rewrite --file "$TMP/pubip.yml" \
  --sf-url "http://8.8.8.8:3002" --be-url "http://10.0.1.41:9000" >/dev/null; then
  fail "public desired IP accepted"
else
  pass "public desired IP refused"
fi

# --- Case K atomic / Case L CAS ---
demo_yaml >"$TMP/cas.yml"
export WOODRIGHT_PUBLIC_DEMO_ENDPOINT_CAS_INJECT=$'foreign: preserved\n'
set +e
CAS_JSON="$(python3 "$PY" rewrite --file "$TMP/cas.yml" --sf-url "http://10.0.1.42:3002" --be-url "http://10.0.1.41:9000")"
CAS_RC=$?
set -e
unset WOODRIGHT_PUBLIC_DEMO_ENDPOINT_CAS_INJECT
if [[ "$CAS_RC" -eq 3 ]] && grep -q 'foreign: preserved' "$TMP/cas.yml" \
  && ! grep -q '10.0.1.42' "$TMP/cas.yml"; then
  pass "L CAS skip preserves concurrent update"
else
  fail "L CAS rc=$CAS_RC json=$CAS_JSON body=$(cat "$TMP/cas.yml")"
fi

# --- Case M rollback hostnames ---
demo_yaml >"$TMP/rb.yml"
python3 "$PY" rewrite --file "$TMP/rb.yml" --sf-url "http://10.0.1.99:3002" --be-url "http://10.0.1.98:9000" >/dev/null
python3 "$PY" restore-hostnames --file "$TMP/rb.yml" >/dev/null
if grep -q 'http://woodright-staging-storefront:3002' "$TMP/rb.yml" \
  && grep -q 'http://woodright-staging-backend:9000' "$TMP/rb.yml" \
  && ! grep -q '10.0.1.99' "$TMP/rb.yml"; then
  pass "M hostname restore after target pin"
else
  fail "M restore did not return hostnames"
fi

# --- Case P idempotent ---
demo_yaml >"$TMP/idemp.yml"
python3 "$PY" rewrite --file "$TMP/idemp.yml" --sf-url "http://10.0.1.42:3002" --be-url "http://10.0.1.41:9000" >/dev/null
cp "$TMP/idemp.yml" "$TMP/idemp.after1"
python3 "$PY" rewrite --file "$TMP/idemp.yml" --sf-url "http://10.0.1.42:3002" --be-url "http://10.0.1.41:9000" >/dev/null
if cmp -s "$TMP/idemp.yml" "$TMP/idemp.after1"; then
  pass "P repeated pin is idempotent"
else
  fail "P second pin changed file"
fi

# --- comment nudge leftover is stripped, URLs updated ---
{
  echo "# woodright-edge-resolver-nudge: 2026-08-28T17:07:15Z"
  demo_yaml
} >"$TMP/nudge.yml"
python3 "$PY" rewrite --file "$TMP/nudge.yml" --sf-url "http://10.0.1.42:3002" --be-url "http://10.0.1.41:9000" >/dev/null
if ! grep -q 'woodright-edge-resolver-nudge' "$TMP/nudge.yml" \
  && grep -q 'http://10.0.1.42:3002' "$TMP/nudge.yml"; then
  pass "obsolete comment nudge stripped; URL authority changed"
else
  fail "nudge leftover not cleaned"
fi

# --- fake docker for Cases B C D E F N ---
FAKE="$TMP/bin"
mkdir -p "$FAKE" "$TMP/dock"
cat >"$FAKE/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
STATE="${WOODRIGHT_FAKE_DOCKER_STATE:?}"
cmd="${1:-}"; shift || true
case "$cmd" in
  inspect)
    fmt=""; target=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --format) fmt="$2"; shift 2 ;;
        --format=*) fmt="${1#--format=}"; shift ;;
        *) target="$1"; shift ;;
      esac
    done
    json="$STATE/containers/${target}.json"
    [[ -f "$json" ]] || { echo "Error: no such object: $target" >&2; exit 1; }
    if [[ -z "$fmt" ]]; then cat "$json"; exit 0; fi
    python3 - "$json" "$fmt" <<'PY'
import json, sys, re
obj = json.load(open(sys.argv[1]))
fmt = sys.argv[2]
if fmt == "{{.Id}}":
    print(obj["Id"]); raise SystemExit
if fmt == "{{.State.Status}}":
    print(obj["State"]["Status"]); raise SystemExit
if fmt == "{{if .State.Health}}{{.State.Health.Status}}{{end}}":
    print((obj.get("State") or {}).get("Health", {}).get("Status", "")); raise SystemExit
if "com.woodright.release-sha" in fmt:
    print(obj["Config"]["Labels"].get("com.woodright.release-sha", "")); raise SystemExit
if "com.woodright.runtime-role" in fmt:
    print(obj["Config"]["Labels"].get("com.woodright.runtime-role", "")); raise SystemExit
if "com.woodright.database-identity" in fmt:
    print(obj["Config"]["Labels"].get("com.woodright.database-identity", "")); raise SystemExit
m = re.search(r'Networks \\"([^\\]+)\\"\)\.IPAddress', fmt)
if not m:
    m = re.search(r"Networks \"([^\"]+)\"\)\.IPAddress", fmt)
if m:
    net = m.group(1)
    nets = (obj.get("NetworkSettings") or {}).get("Networks") or {}
    print((nets.get(net) or {}).get("IPAddress", ""))
    raise SystemExit
print("")
PY
    ;;
  image)
    # wr_cutover_container_immutable_digest uses image inspect via identity helper.
    echo "fake-docker image $*" >&2
    exit 1
    ;;
  *)
    echo "fake-docker unsupported: $cmd $*" >&2
    exit 1
    ;;
esac
EOF
chmod +x "$FAKE/docker"

write_ctr() {
  local name="$1" id="$2" sha="$3" dokploy_ip="$4" stack_ip="${5:-172.19.0.9}"
  python3 - "$TMP/dock/containers/${name}.json" "$name" "$id" "$sha" "$dokploy_ip" "$stack_ip" <<'PY'
import json, sys
path, name, cid, sha, dip, sip = sys.argv[1:]
obj = {
  "Id": cid,
  "Name": "/" + name,
  "State": {"Status": "running", "Health": {"Status": "healthy"}},
  "Config": {"Labels": {
    "com.woodright.release-sha": sha,
    "com.woodright.runtime-role": "public_demo",
    "com.woodright.database-identity": "public_demo_db",
    "org.opencontainers.image.revision": sha,
  }},
  "NetworkSettings": {"Networks": {
    "dokploy-network": {"IPAddress": dip, "DNSNames": [name]},
    "woodright-stack-3dsdhd_woodright_staging": {"IPAddress": sip, "DNSNames": [name, "storefront"]},
  }},
}
open(path, "w").write(json.dumps(obj))
PY
}

mkdir -p "$TMP/dock/containers"
write_ctr woodright-staging-storefront "$SF_ID" "$DD" "10.0.1.42" "172.19.0.5"
write_ctr woodright-staging-backend "$BE_ID" "$DD" "10.0.1.41" "172.19.0.4"
write_ctr dokploy-traefik "traefikid" "$DD" "10.0.1.9" "172.17.0.2"

# Digest helper needs wr_cutover_resolve_container_image_identity. Stub via env skip?
# We'll monkey-patch by exporting a tiny wrapper docker that also answers image inspect.
# Simpler: source common with a fake identity function after source? Can't override easily.
# Implement image inspect in fake docker using RepoDigests on a sidecar file.

cat >"$FAKE/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
STATE="${WOODRIGHT_FAKE_DOCKER_STATE:?}"
cmd="${1:-}"; shift || true
case "$cmd" in
  inspect)
    fmt=""; target=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --format) fmt="$2"; shift 2 ;;
        --format=*) fmt="${1#--format=}"; shift ;;
        *) target="$1"; shift ;;
      esac
    done
    json="$STATE/containers/${target}.json"
    [[ -f "$json" ]] || { echo "Error: no such object: $target" >&2; exit 1; }
    if [[ -z "$fmt" ]]; then cat "$json"; exit 0; fi
    python3 - "$json" "$fmt" <<'PY'
import json, sys
obj = json.load(open(sys.argv[1]))
fmt = sys.argv[2]
if fmt == "{{.Id}}":
    print(obj["Id"]); raise SystemExit
if fmt == "{{.State.Status}}":
    print(obj["State"]["Status"]); raise SystemExit
if fmt == "{{if .State.Health}}{{.State.Health.Status}}{{end}}":
    print((obj.get("State") or {}).get("Health", {}).get("Status", "")); raise SystemExit
if "com.woodright.release-sha" in fmt:
    print(obj["Config"]["Labels"].get("com.woodright.release-sha", "")); raise SystemExit
if "com.woodright.runtime-role" in fmt:
    print(obj["Config"]["Labels"].get("com.woodright.runtime-role", "")); raise SystemExit
if "com.woodright.database-identity" in fmt:
    print(obj["Config"]["Labels"].get("com.woodright.database-identity", "")); raise SystemExit
if "IPAddress" in fmt:
    nets = (obj.get("NetworkSettings") or {}).get("Networks") or {}
    for net_name, net in nets.items():
        if net_name and net_name in fmt:
            print((net or {}).get("IPAddress", ""))
            raise SystemExit
    print("")
    raise SystemExit
print("")
PY
    ;;
  image)
    sub="${1:-}"; shift || true
    if [[ "$sub" != "inspect" ]]; then echo "image $sub" >&2; exit 1; fi
    fmt=""; target=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --format) fmt="$2"; shift 2 ;;
        --format=*) fmt="${1#--format=}"; shift ;;
        *) target="$1"; shift ;;
      esac
    done
    dig="${WOODRIGHT_FAKE_IMAGE_DIGESTS:-}"
    # target is image id; map via sidecar
    map="$STATE/image-digests.tsv"
    if [[ -f "$map" ]]; then
      got="$(awk -F'\t' -v t="$target" '$1==t{print $2; exit}' "$map")"
      if [[ -n "$got" ]]; then
        if [[ "$fmt" == *RepoDigests* || "$fmt" == *Digest* || -n "$fmt" ]]; then
          echo "$got"
          exit 0
        fi
      fi
    fi
    echo "no image" >&2
    exit 1
    ;;
  *)
    echo "fake-docker unsupported: $cmd $*" >&2
    exit 1
    ;;
esac
EOF
chmod +x "$FAKE/docker"

# Identity helper talks to container inspect JSON then image. Read how resolve works.
# shellcheck source=../../ops/lib/woodright-cutover-common.sh
# We'll inspect wr_cutover_resolve_container_image_identity
source "$COMMON"

python3 - <<PY
import json, pathlib
for name, cid, dig in [
    ("woodright-staging-storefront", "$SF_ID", "$SF_DIG"),
    ("woodright-staging-backend", "$BE_ID", "$BE_DIG"),
]:
    p = pathlib.Path("$TMP/dock/containers") / f"{name}.json"
    obj = json.loads(p.read_text())
    obj["Image"] = "sha256:" + cid[:64]
    p.write_text(json.dumps(obj))
    pathlib.Path("$TMP/dock/image-digests.tsv").open("a").write(obj["Image"] + "\t" + dig + "\n")
PY

# Enhance fake docker image inspect to handle json format used by identity helper.
# Read identity helper quickly via grep in this test after source.

# For Cases B-F we call wr_public_demo_container_dokploy_ip with WOODRIGHT_DOCKER_BIN
# and stub wr_cutover_container_immutable_digest by defining it after source... 
# once sourced, we can redefine the function.

wr_cutover_container_immutable_digest() {
  local container="${1:?}"
  case "$container" in
    woodright-staging-storefront) printf '%s\n' "$SF_DIG" ;;
    woodright-staging-backend) printf '%s\n' "$BE_DIG" ;;
    *) return 1 ;;
  esac
}

export WOODRIGHT_DOCKER_BIN="$FAKE/docker"
export WOODRIGHT_FAKE_DOCKER_STATE="$TMP/dock"
export WOODRIGHT_PUBLIC_DEMO_SKIP_TRAEFIK_NET_CHECK=0

ip="$(wr_public_demo_container_dokploy_ip woodright-staging-storefront "$DD" "$SF_DIG" "$SF_ID" storefront)" || ip=""
if [[ "$ip" == "10.0.1.42" ]]; then
  pass "A/E dokploy-network IP selected (not stack 172.19.0.5)"
else
  fail "E got ip='$ip' want 10.0.1.42"
fi

# Case B wrong SHA
if wr_public_demo_container_dokploy_ip woodright-staging-storefront "$CAF" "$SF_DIG" "$SF_ID" storefront >/dev/null 2>"$TMP/b.err"; then
  fail "B wrong SHA accepted"
else
  pass "B wrong SHA refused"
fi

# Case C wrong digest
if wr_public_demo_container_dokploy_ip woodright-staging-storefront "$DD" "$BE_DIG" "$SF_ID" storefront >/dev/null 2>"$TMP/c.err"; then
  fail "C wrong digest accepted"
else
  pass "C wrong digest refused"
fi

# Case D wrong container id
if wr_public_demo_container_dokploy_ip woodright-staging-storefront "$DD" "$SF_DIG" "$WRONG_ID" storefront >/dev/null 2>"$TMP/d.err"; then
  fail "D wrong id accepted"
else
  pass "D container id CAS drift refused"
fi

# Case F missing network
python3 - <<PY
import json
p="$TMP/dock/containers/woodright-staging-storefront.json"
obj=json.load(open(p))
obj["NetworkSettings"]["Networks"].pop("dokploy-network", None)
open(p,"w").write(json.dumps(obj))
PY
if wr_public_demo_container_dokploy_ip woodright-staging-storefront "$DD" "$SF_DIG" "$SF_ID" storefront >/dev/null 2>"$TMP/f.err"; then
  fail "F missing network accepted"
else
  pass "F missing Traefik network refused"
fi
write_ctr woodright-staging-storefront "$SF_ID" "$DD" "10.0.1.42" "172.19.0.5"

# Case N pair apply both
demo_yaml >"$TMP/pair.yml"
export WOODRIGHT_PUBLIC_DEMO_EDGE_RESOLVER_FILE="$TMP/pair.yml"
wr_cutover_container_immutable_digest() {
  local container="${1:?}"
  case "$container" in
    woodright-staging-storefront) printf '%s\n' "$SF_DIG" ;;
    woodright-staging-backend) printf '%s\n' "$BE_DIG" ;;
    *) return 1 ;;
  esac
}
if wr_public_demo_apply_traefik_pair_endpoints \
  woodright-staging-storefront "$DD" "$SF_DIG" "$SF_ID" \
  woodright-staging-backend "$DD" "$BE_DIG" "$BE_ID"; then
  if grep -q 'http://10.0.1.42:3002' "$TMP/pair.yml" \
    && grep -q 'http://10.0.1.41:9000' "$TMP/pair.yml"; then
    pass "N pair pin writes both endpoints"
  else
    fail "N pair pin missing urls $(cat "$TMP/pair.yml")"
  fi
else
  fail "N pair apply failed"
fi

# Rollback restore on the pair file
export WOODRIGHT_PUBLIC_DEMO_RESTORE_ENDPOINTS=1
wr_public_demo_restore_traefik_hostnames || true
if grep -q 'http://woodright-staging-storefront:3002' "$TMP/pair.yml"; then
  pass "M/N restore hostnames after pair pin"
else
  fail "restore after pair pin failed"
fi
unset WOODRIGHT_PUBLIC_DEMO_RESTORE_ENDPOINTS

# Traefik not on network
python3 - <<PY
import json
p="$TMP/dock/containers/dokploy-traefik.json"
obj=json.load(open(p))
obj["NetworkSettings"]["Networks"].pop("dokploy-network", None)
open(p,"w").write(json.dumps(obj))
PY
if wr_public_demo_container_dokploy_ip woodright-staging-storefront "$DD" "$SF_DIG" "$SF_ID" storefront >/dev/null 2>"$TMP/tf.err"; then
  fail "Traefik off-network accepted"
else
  pass "Traefik missing dokploy-network refused"
fi

# apply helper --help
if bash "$APPLY" --help >/dev/null; then
  pass "apply helper --help"
else
  fail "apply helper --help failed"
fi
grep -q 'I_UNDERSTAND_PUBLIC_DEMO_TRAEFIK_ENDPOINT' "$APPLY" \
  && pass "apply helper has dedicated confirm token" \
  || fail "apply helper missing confirm token"
grep -q 'wr_public_demo_apply_traefik_pair_endpoints' "$APPLY" \
  && pass "standalone execute routes through guarded pair apply" \
  || fail "standalone execute bypasses final ID/IP CAS"

# Case O: settle still required (static)
grep -q 'wr_public_demo_wait_buyer_edge' "$SF" \
  && grep -q 'wr_public_demo_apply_traefik_pair_endpoints' "$SF" \
  && awk '/wr_public_demo_apply_traefik_pair_endpoints/{a=1} a && /wr_public_demo_wait_buyer_edge/{found=1} END{exit found?0:1}' "$SF" \
  && pass "O endpoint apply precedes HTTPS settle" \
  || fail "O settle/apply order wrong"

if grep -A8 'AUTO_ROLLBACK_FAILED' "$SF" | grep -q 'wr_public_demo_restore_traefik_hostnames'; then
  pass "storefront auto-rollback restores Traefik hostnames after keeper restore"
else
  fail "storefront recover must restore Traefik hostnames after pin"
fi
if grep -q 'container id changed before YAML commit' "$COMMON"; then
  pass "apply performs final container id CAS before YAML commit"
else
  fail "missing final id CAS before YAML commit"
fi

if grep -q 'wr_public_demo_privileged_apply_urls' "$COMMON" \
  && grep -q 'cmp -s "$orig" "$now"' "$COMMON"; then
  pass "privileged rewrite/restore uses byte-preserving dest CAS"
else
  fail "privileged CAS helper missing orig/now cmp"
fi
if grep -q 'container id changed before YAML commit' "$COMMON" \
  && grep -q 'container IP changed before YAML commit' "$COMMON"; then
  pass "apply refuses id/IP drift immediately before YAML commit"
else
  fail "missing final id/IP CAS before YAML commit"
fi

if [[ "$FAILED" -ne 0 ]]; then
  echo "FAILED=$FAILED"
  exit 1
fi
echo "ALL_PASS"
exit 0
