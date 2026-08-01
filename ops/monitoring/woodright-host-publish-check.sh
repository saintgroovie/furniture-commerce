#!/usr/bin/env bash
# Environment-scoped host-publish monitor (read-only).
# Does not mutate Docker, firewall, manifests, or Git.
#
# Usage:
#   ops/monitoring/woodright-host-publish-check.sh --environment public_demo
#   ops/monitoring/woodright-host-publish-check.sh --environment production
#
# Exit 0 on pass; 2 on critical fail. Prints structured JSON on stdout.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
# shellcheck source=../lib/woodright-environment-profile.sh
source "$ROOT/ops/lib/woodright-environment-profile.sh"
# shellcheck source=../lib/woodright-host-publish.sh
source "$ROOT/ops/lib/woodright-host-publish.sh"

wr_require_environment_from_args "$@" || exit 2
wr_assert_environment_provisioned || exit 2
wr_hp_require_policy || exit 2

BE="${WOODRIGHT_BE_CONTAINER_DEFAULT:?}"
SF="${WOODRIGHT_SF_CONTAINER_DEFAULT:?}"

emit_fail() {
  local verdict="$1" message="$2"
  python3 -c 'import json,sys
print(json.dumps({
  "ok": False,
  "verdict": sys.argv[1],
  "message": sys.argv[2],
  "environment": sys.argv[3],
  "policy": sys.argv[4],
  "expected_bindings": [],
  "actual_bindings": [],
}, indent=2, sort_keys=True))' \
    "$verdict" "$message" "$WOODRIGHT_ENVIRONMENT" "${WOODRIGHT_HOST_PUBLISH_POLICY}"
  exit 2
}

docker inspect "$BE" >/dev/null 2>&1 || emit_fail HOST_PUBLISH_CONTAINER_MISSING "backend=$BE"
docker inspect "$SF" >/dev/null 2>&1 || emit_fail HOST_PUBLISH_CONTAINER_MISSING "storefront=$SF"
wr_assert_container_matches_environment "$BE" backend || emit_fail HOST_PUBLISH_PROFILE_MISMATCH "backend role/prefix"
wr_assert_container_matches_environment "$SF" storefront || emit_fail HOST_PUBLISH_PROFILE_MISMATCH "storefront role/prefix"

be_b="$(wr_hp_docker_bindings_json "$BE" backend)"
sf_b="$(wr_hp_docker_bindings_json "$SF" storefront)"
merged="$(python3 -c 'import json,sys; print(json.dumps(json.loads(sys.argv[1])+json.loads(sys.argv[2])))' "$be_b" "$sf_b")"
nm="$(docker inspect "$BE" --format '{{.HostConfig.NetworkMode}}')"
compose="$(docker inspect "$BE" --format '{{index .Config.Labels "com.docker.compose.project"}}' 2>/dev/null || true)"

export WR_HP_MODE=live
export WR_HP_POLICY="${WOODRIGHT_HOST_PUBLISH_POLICY}"
export WR_HP_ALLOWED="${WOODRIGHT_ALLOWED_HOST_BINDINGS:-}"
export WR_HP_ROLE=all
export WR_HP_NETWORK_MODE="$nm"
export WR_HP_COMPOSE_PROJECT="$compose"
export WR_HP_EXPECTED_COMPOSE="${WOODRIGHT_COMPOSE_PROJECT:-}"
export WR_HP_REQUIRE_COMPOSE="${WOODRIGHT_REQUIRE_COMPOSE_LABEL:-0}"
export WR_HP_BINDINGS_JSON="$merged"

set +e
OUT="$(wr_hp_evaluate_python 2>/dev/null)"
RC=$?
set -e

python3 -c '
import json,sys
d=json.loads(sys.argv[1] or "{}")
d["environment"]=sys.argv[2]
d["ok"]= bool(d.get("ok")) and sys.argv[3]=="0"
if "monitor_token" not in d:
  v=d.get("verdict") or ""
  if d.get("ok"):
    d["monitor_token"]="host_publish_loopback_allowlist_pass" if d.get("policy")=="loopback_allowlist" else "host_publish_denied_pass"
  elif v=="HOST_PUBLISH_PUBLIC_BIND":
    d["monitor_token"]="host_publish_public_bind_critical"
  elif v=="HOST_PUBLISH_UNEXPECTED_PORT":
    d["monitor_token"]="host_publish_unexpected_port_critical"
  elif "IPV6" in v:
    d["monitor_token"]="host_publish_ipv6_wildcard_critical"
  elif "POLICY" in v:
    d["monitor_token"]="host_publish_policy_missing_critical"
  else:
    d["monitor_token"]="host_publish_profile_mismatch_critical"
print(json.dumps(d, indent=2, sort_keys=True))
' "${OUT:-"{}"}" "$WOODRIGHT_ENVIRONMENT" "$RC"

[[ $RC -eq 0 ]] || exit 2
exit 0
