#!/usr/bin/env bash
# Woodright host-publish contract (environment-profile authority).
#
# Profile fields (tracked):
#   WOODRIGHT_HOST_PUBLISH_POLICY=deny|loopback_allowlist
#   WOODRIGHT_ALLOWED_HOST_BINDINGS=role:container_port/protocol=host_ip:host_port[,...]
#
# Legacy WOODRIGHT_ALLOW_HOST_PUBLISH / WOODRIGHT_ALLOWED_HOST_BIND_PREFIX are NOT authority.
# Inherited ALLOW_HOST_PUBLISH=1 cannot enable an exception.
#
# Binding token format is exact (no whitespace, no substring prefix matching):
#   storefront:3002/tcp=127.0.0.1:3200
#   backend:9000/tcp=127.0.0.1:9200
#
# shellcheck shell=bash

_WR_HP_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

wr_hp_die() {
  printf '%s wr_host_publish ERROR: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2
  return 1
}

wr_hp_log() {
  printf '%s wr_host_publish %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2
}

# Normalize / validate policy from loaded profile. Fail-closed if missing/unknown.
wr_hp_require_policy() {
  [[ "${WOODRIGHT_ENV_PROFILE_LOADED:-0}" == "1" ]] || {
    wr_hp_die "environment profile not loaded"
    return 1
  }
  local policy="${WOODRIGHT_HOST_PUBLISH_POLICY:-}"
  if [[ -z "$policy" ]]; then
    wr_hp_die "HOST_PUBLISH_POLICY_MISSING environment=${WOODRIGHT_ENVIRONMENT:-}"
    return 1
  fi
  case "$policy" in
    deny|loopback_allowlist) ;;
    *)
      wr_hp_die "HOST_PUBLISH_POLICY_INVALID policy='$policy'"
      return 1
      ;;
  esac
  # Explicitly deny boolean legacy authority even if set to 1.
  if [[ "${WOODRIGHT_ALLOW_HOST_PUBLISH:-}" == "1" && "$policy" == "deny" ]]; then
    wr_hp_log "note: ignoring inherited/legacy WOODRIGHT_ALLOW_HOST_PUBLISH=1 under policy=deny"
  fi
  return 0
}

# Python evaluator: shared Mode A / Mode B / fixture logic.
# Args via env:
#   WR_HP_MODE=planned|live
#   WR_HP_POLICY
#   WR_HP_ALLOWED
#   WR_HP_ROLE (optional filter: storefront|backend|all)
#   WR_HP_NETWORK_MODE
#   WR_HP_COMPOSE_PROJECT (actual)
#   WR_HP_EXPECTED_COMPOSE
#   WR_HP_REQUIRE_COMPOSE (0|1)
#   WR_HP_BINDINGS_JSON  - JSON list of {role,container_port,protocol,host_ip,host_port}
#     For live Mode B, pass docker-derived list (already role-tagged).
wr_hp_evaluate_python() {
  python3 - <<'PY'
import json, os, re, sys

TOKEN_RE = re.compile(
    r"^(storefront|backend):([0-9]{1,5})/(tcp|udp)=([0-9.]+|::1|::):([0-9]{1,5})$"
)

def fail(code, msg, **extra):
    out = {"ok": False, "verdict": code, "message": msg}
    out.update(extra)
    print(json.dumps(out, sort_keys=True))
    raise SystemExit(2)

def parse_allowlist(raw: str):
    raw = (raw or "").strip()
    if not raw:
        return []
    tokens = raw.split(",")
    seen = set()
    out = []
    for t in tokens:
        if not t or any(c.isspace() for c in t):
            fail("HOST_PUBLISH_ALLOWLIST_MALFORMED", f"whitespace_or_empty_token:{t!r}")
        m = TOKEN_RE.match(t)
        if not m:
            fail("HOST_PUBLISH_ALLOWLIST_MALFORMED", f"bad_token:{t}")
        role, cport, proto, hip, hport = m.groups()
        key = (role, cport, proto, hip, hport)
        if key in seen:
            fail("HOST_PUBLISH_DUPLICATE_ALLOWLIST", t)
        seen.add(key)
        # loopback-only allowlist: only 127.0.0.1 unless explicitly extended later
        if hip not in ("127.0.0.1",):
            fail("HOST_PUBLISH_NON_LOOPBACK_ALLOWLIST", t)
        if proto != "tcp":
            fail("HOST_PUBLISH_PROTOCOL_FORBIDDEN", t)
        out.append({
            "role": role,
            "container_port": cport,
            "protocol": proto,
            "host_ip": hip,
            "host_port": hport,
            "token": t,
        })
    return out

def normalize_actual(items):
    out = []
    seen = set()
    for b in items:
        role = str(b.get("role") or "")
        cport = str(b.get("container_port") or "")
        proto = str(b.get("protocol") or "tcp").lower()
        hip = b.get("host_ip")
        if hip is None:
            hip = ""
        hip = str(hip)
        hport = str(b.get("host_port") or "")
        if not role or not cport or not hport:
            fail("HOST_PUBLISH_BINDING_MALFORMED", json.dumps(b))
        # Empty HostIp == Docker wildcard (all interfaces)
        if hip == "":
            fail("HOST_PUBLISH_PUBLIC_BIND", "empty_HostIp_wildcard", binding=b)
        # Bracketed IPv6 wildcard representations
        if hip in ("0.0.0.0", "::", "[::]", "*"):
            fail("HOST_PUBLISH_PUBLIC_BIND", f"wildcard_ip={hip}", binding=b)
        if hip == "::1":
            fail("HOST_PUBLISH_IPV6_LOOPBACK_UNDECLARED", "ipv6_loopback_not_in_contract", binding=b)
        # Public-looking IPv4 (not loopback)
        if hip != "127.0.0.1":
            fail("HOST_PUBLISH_PUBLIC_BIND", f"non_loopback_host_ip={hip}", binding=b)
        if proto != "tcp":
            fail("HOST_PUBLISH_UNEXPECTED_PROTOCOL", f"proto={proto}", binding=b)
        key = (role, cport, proto, hip, hport)
        if key in seen:
            fail("HOST_PUBLISH_DUPLICATE_BINDING", json.dumps(b))
        seen.add(key)
        out.append({
            "role": role,
            "container_port": cport,
            "protocol": proto,
            "host_ip": hip,
            "host_port": hport,
        })
    return out

def as_set(items):
    return {(i["role"], i["container_port"], i["protocol"], i["host_ip"], i["host_port"]) for i in items}

policy = os.environ.get("WR_HP_POLICY", "").strip()
mode = os.environ.get("WR_HP_MODE", "live").strip()
allowed_raw = os.environ.get("WR_HP_ALLOWED", "")
role_filter = os.environ.get("WR_HP_ROLE", "all").strip() or "all"
network_mode = os.environ.get("WR_HP_NETWORK_MODE", "").strip()
compose_actual = os.environ.get("WR_HP_COMPOSE_PROJECT", "")
compose_expected = os.environ.get("WR_HP_EXPECTED_COMPOSE", "")
require_compose = os.environ.get("WR_HP_REQUIRE_COMPOSE", "0") == "1"
bindings_json = os.environ.get("WR_HP_BINDINGS_JSON", "[]")

if policy not in ("deny", "loopback_allowlist"):
    fail("HOST_PUBLISH_POLICY_INVALID", f"policy={policy!r}")

if network_mode == "host":
    fail("HOST_PUBLISH_HOST_NETWORK", "network_mode=host forbidden")

if require_compose:
    if not compose_actual:
        fail("HOST_PUBLISH_COMPOSE_MISSING", "compose project label missing")
    if compose_expected and compose_actual != compose_expected:
        fail("HOST_PUBLISH_COMPOSE_MISMATCH", f"have={compose_actual} want={compose_expected}")

try:
    actual_raw = json.loads(bindings_json)
except Exception as e:
    fail("HOST_PUBLISH_BINDINGS_PARSE_FAIL", str(e))

if not isinstance(actual_raw, list):
    fail("HOST_PUBLISH_BINDINGS_PARSE_FAIL", "bindings must be list")

actual = normalize_actual(actual_raw)
if role_filter in ("storefront", "backend"):
    actual = [a for a in actual if a["role"] == role_filter]
    # Also filter allowlist below

allowed = parse_allowlist(allowed_raw)
if role_filter in ("storefront", "backend"):
    allowed = [a for a in allowed if a["role"] == role_filter]

expected_set = as_set(allowed)
actual_set = as_set(actual)

result = {
    "ok": True,
    "verdict": "HOST_PUBLISH_PASS",
    "mode": mode,
    "policy": policy,
    "role_filter": role_filter,
    "expected_bindings": sorted(
        [{"role": r, "container_port": c, "protocol": p, "host_ip": hi, "host_port": hp}
         for (r, c, p, hi, hp) in expected_set],
        key=lambda x: (x["role"], x["host_port"]),
    ),
    "actual_bindings": sorted(actual, key=lambda x: (x["role"], x["host_port"])),
}

if policy == "deny":
    if allowed_raw.strip():
        fail(
            "HOST_PUBLISH_ALLOWLIST_UNEXPECTED",
            "policy=deny must not declare ALLOWED_HOST_BINDINGS",
            policy=policy,
            mode=mode,
        )
    if actual_set:
        fail(
            "HOST_PUBLISH_UNEXPECTED_PORT",
            "policy=deny requires zero published ports",
            expected_bindings=result["expected_bindings"],
            actual_bindings=result["actual_bindings"],
            policy=policy,
            mode=mode,
        )
    result["monitor_token"] = "host_publish_denied_pass"
    print(json.dumps(result, sort_keys=True))
    raise SystemExit(0)

# loopback_allowlist requires a non-empty exact allowlist
if not expected_set:
    fail(
        "HOST_PUBLISH_ALLOWLIST_EMPTY",
        "policy=loopback_allowlist requires non-empty ALLOWED_HOST_BINDINGS",
        policy=policy,
        mode=mode,
    )

# loopback_allowlist: exact set equality
if expected_set != actual_set:
    missing = sorted(expected_set - actual_set)
    extra = sorted(actual_set - expected_set)
    # role mismatch hint
    code = "HOST_PUBLISH_ALLOWLIST_MISMATCH"
    if extra and not missing:
        code = "HOST_PUBLISH_UNEXPECTED_PORT"
    elif missing and not extra:
        code = "HOST_PUBLISH_INCOMPLETE_BINDINGS"
    fail(
        code,
        f"expected={sorted(expected_set)} actual={sorted(actual_set)} missing={missing} extra={extra}",
        expected_bindings=result["expected_bindings"],
        actual_bindings=result["actual_bindings"],
        policy=policy,
        mode=mode,
    )

result["monitor_token"] = "host_publish_loopback_allowlist_pass"
print(json.dumps(result, sort_keys=True))
PY
}

# Convert Docker PortBindings / NetworkSettings.Ports JSON into role-tagged list.
# Usage: wr_hp_docker_bindings_json <container> <role>
wr_hp_docker_bindings_json() {
  local container="$1"
  local role="$2"
  local pb ports nm
  pb="$(docker inspect "$container" --format '{{json .HostConfig.PortBindings}}' 2>/dev/null || echo null)"
  ports="$(docker inspect "$container" --format '{{json .NetworkSettings.Ports}}' 2>/dev/null || echo null)"
  nm="$(docker inspect "$container" --format '{{.HostConfig.NetworkMode}}' 2>/dev/null || echo "")"
  export WR_HP_TMP_NETWORK_MODE="$nm"
  python3 - "$role" "$pb" "$ports" <<'PY'
import json,sys
role, pb_raw, ports_raw = sys.argv[1:4]

def fail_invalid(msg, **extra):
  out={"ok": False, "verdict": "PORT_BINDINGS_INSPECTION_INVALID", "message": msg, "role": role}
  out.update(extra)
  print(json.dumps(out, sort_keys=True), file=sys.stderr)
  raise SystemExit(2)

def collect(m, source):
  items=[]
  if m is None:
    return None
  if not isinstance(m, dict):
    fail_invalid(f"{source}_not_object", source=source)
  for k,v in m.items():
    if not v:
      continue
    if "/" not in str(k):
      fail_invalid(f"{source}_bad_key", key=str(k), source=source)
    cport, proto = str(k).split("/", 1)
    if not isinstance(v, list):
      fail_invalid(f"{source}_binding_not_list", key=str(k), source=source)
    for b in v:
      if not isinstance(b, dict):
        fail_invalid(f"{source}_binding_not_object", key=str(k), source=source)
      hip = b.get("HostIp")
      if hip is None:
        hip = ""
      hip = str(hip)
      hport = str(b.get("HostPort") or "")
      items.append({
        "role": role,
        "container_port": str(cport),
        "protocol": proto.lower(),
        "host_ip": hip,
        "host_port": hport,
        "source": source,
      })
  return items

try:
  pb=json.loads(pb_raw)
except Exception as e:
  fail_invalid("HostConfig.PortBindings_parse_fail", error=str(e))
try:
  ports=json.loads(ports_raw)
except Exception as e:
  fail_invalid("NetworkSettings.Ports_parse_fail", error=str(e))

pb_items = collect(pb, "HostConfig.PortBindings")
ports_items = collect(ports, "NetworkSettings.Ports")
if pb_items is None or ports_items is None:
  fail_invalid("bindings_null")

def keyset(items):
  return {(i["container_port"], i["protocol"], i["host_ip"], i["host_port"]) for i in items}

# Running publish contract: both representations must agree when either publishes.
if pb_items or ports_items:
  if keyset(pb_items) != keyset(ports_items):
    fail_invalid(
      "HostConfig.PortBindings_disagree_NetworkSettings.Ports",
      hostconfig=pb_items,
      networksettings=ports_items,
    )

# Prefer NetworkSettings.Ports when present; else HostConfig.PortBindings.
items = ports_items if ports_items else pb_items
print(json.dumps(items))
PY
}

# Mode B: assert live container(s) match profile policy.
# wr_hp_assert_live_role <container> <storefront|backend>
wr_hp_assert_live_role() {
  local container="$1"
  local role="$2"
  wr_hp_require_policy || return 1
  local bindings compose nm
  if ! bindings="$(wr_hp_docker_bindings_json "$container" "$role")"; then
    return 1
  fi
  nm="${WR_HP_TMP_NETWORK_MODE:-}"
  compose="$(docker inspect "$container" --format '{{index .Config.Labels "com.docker.compose.project"}}' 2>/dev/null || true)"
  export WR_HP_MODE=live
  export WR_HP_POLICY="${WOODRIGHT_HOST_PUBLISH_POLICY}"
  export WR_HP_ALLOWED="${WOODRIGHT_ALLOWED_HOST_BINDINGS:-}"
  export WR_HP_ROLE="$role"
  export WR_HP_NETWORK_MODE="$nm"
  export WR_HP_COMPOSE_PROJECT="$compose"
  export WR_HP_EXPECTED_COMPOSE="${WOODRIGHT_COMPOSE_PROJECT:-}"
  export WR_HP_REQUIRE_COMPOSE="${WOODRIGHT_REQUIRE_COMPOSE_LABEL:-0}"
  export WR_HP_BINDINGS_JSON="$bindings"
  local out
  if ! out="$(wr_hp_evaluate_python)"; then
    wr_hp_die "live host-publish fail role=$role container=$container detail=$out"
    return 1
  fi
  printf '%s\n' "$out"
  return 0
}

# Mode B both roles (SF+BE defaults from profile).
wr_hp_assert_live_pair() {
  local be="${1:-${WOODRIGHT_BE_CONTAINER_DEFAULT:-}}"
  local sf="${2:-${WOODRIGHT_SF_CONTAINER_DEFAULT:-}}"
  wr_hp_require_policy || return 1
  local be_b sf_b merged compose_be compose_sf nm_be nm_sf
  if ! be_b="$(wr_hp_docker_bindings_json "$be" backend)"; then
    return 1
  fi
  nm_be="${WR_HP_TMP_NETWORK_MODE:-}"
  if ! sf_b="$(wr_hp_docker_bindings_json "$sf" storefront)"; then
    return 1
  fi
  nm_sf="${WR_HP_TMP_NETWORK_MODE:-}"
  if [[ "$nm_be" == "host" || "$nm_sf" == "host" ]]; then
    wr_hp_die "HOST_PUBLISH_HOST_NETWORK"
    return 1
  fi
  compose_be="$(docker inspect "$be" --format '{{index .Config.Labels "com.docker.compose.project"}}' 2>/dev/null || true)"
  compose_sf="$(docker inspect "$sf" --format '{{index .Config.Labels "com.docker.compose.project"}}' 2>/dev/null || true)"
  merged="$(python3 -c 'import json,sys; a=json.loads(sys.argv[1]); b=json.loads(sys.argv[2]); print(json.dumps(a+b))' "$be_b" "$sf_b")"
  export WR_HP_MODE=live
  export WR_HP_POLICY="${WOODRIGHT_HOST_PUBLISH_POLICY}"
  export WR_HP_ALLOWED="${WOODRIGHT_ALLOWED_HOST_BINDINGS:-}"
  export WR_HP_ROLE=all
  export WR_HP_NETWORK_MODE="$nm_be"
  export WR_HP_COMPOSE_PROJECT="${compose_be:-$compose_sf}"
  export WR_HP_EXPECTED_COMPOSE="${WOODRIGHT_COMPOSE_PROJECT:-}"
  export WR_HP_REQUIRE_COMPOSE="${WOODRIGHT_REQUIRE_COMPOSE_LABEL:-0}"
  export WR_HP_BINDINGS_JSON="$merged"
  local out
  if ! out="$(wr_hp_evaluate_python)"; then
    wr_hp_die "live pair host-publish fail detail=$out"
    return 1
  fi
  printf '%s\n' "$out"
  return 0
}

# Mode A: planned bindings JSON (list) vs policy - before mutation.
wr_hp_assert_planned_bindings_json() {
  local planned_json="$1"
  local role_filter="${2:-all}"
  wr_hp_require_policy || return 1
  export WR_HP_MODE=planned
  export WR_HP_POLICY="${WOODRIGHT_HOST_PUBLISH_POLICY}"
  export WR_HP_ALLOWED="${WOODRIGHT_ALLOWED_HOST_BINDINGS:-}"
  export WR_HP_ROLE="$role_filter"
  export WR_HP_NETWORK_MODE="${WR_HP_PLANNED_NETWORK_MODE:-bridge}"
  export WR_HP_COMPOSE_PROJECT="${WR_HP_PLANNED_COMPOSE:-${WOODRIGHT_COMPOSE_PROJECT:-}}"
  export WR_HP_EXPECTED_COMPOSE="${WOODRIGHT_COMPOSE_PROJECT:-}"
  export WR_HP_REQUIRE_COMPOSE=0
  export WR_HP_BINDINGS_JSON="$planned_json"
  local out
  if ! out="$(wr_hp_evaluate_python)"; then
    wr_hp_die "planned host-publish fail detail=$out"
    return 1
  fi
  printf '%s\n' "$out"
  return 0
}

# Convenience for deny environments: planned empty publish.
wr_hp_assert_planned_deny() {
  wr_hp_assert_planned_bindings_json "[]" all
}

# Map evaluator verdict → monitor check name/severity.
wr_hp_monitor_token_for_verdict() {
  case "$1" in
    HOST_PUBLISH_PASS)
      if [[ "${WOODRIGHT_HOST_PUBLISH_POLICY}" == "deny" ]]; then
        echo host_publish_denied_pass
      else
        echo host_publish_loopback_allowlist_pass
      fi
      ;;
    HOST_PUBLISH_PUBLIC_BIND) echo host_publish_public_bind_critical ;;
    HOST_PUBLISH_UNEXPECTED_PORT) echo host_publish_unexpected_port_critical ;;
    HOST_PUBLISH_IPV6_*|HOST_PUBLISH_IPV6_LOOPBACK_UNDECLARED) echo host_publish_ipv6_wildcard_critical ;;
    HOST_PUBLISH_POLICY_MISSING|HOST_PUBLISH_POLICY_INVALID) echo host_publish_policy_missing_critical ;;
    HOST_PUBLISH_ALLOWLIST_MISMATCH|HOST_PUBLISH_INCOMPLETE_BINDINGS|HOST_PUBLISH_COMPOSE_*) echo host_publish_profile_mismatch_critical ;;
    *) echo host_publish_public_bind_critical ;;
  esac
}

# Reject docker create/run publish flags for deny-policy recreates.
# Usage: wr_hp_refuse_publish_flags "$@" before docker create
wr_hp_refuse_publish_flags() {
  local a
  for a in "$@"; do
    case "$a" in
      -P|--publish-all)
        wr_hp_die "HOST_PUBLISH_CREATE_PUBLISH_FLAG forbidden arg='$a'"
        return 1
        ;;
      -p|--publish|--publish=*|-p=*|-p?*|--publish-all=*)
        wr_hp_die "HOST_PUBLISH_CREATE_PUBLISH_FLAG forbidden arg='$a'"
        return 1
        ;;
    esac
  done
  return 0
}

# Fail-closed deny evaluator for monitors without a loaded profile:
# any published HostPort on the given role-tagged bindings JSON → fail.
wr_hp_fail_closed_deny_bindings_json() {
  local bindings_json="$1"
  export WR_HP_MODE=live
  export WR_HP_POLICY=deny
  export WR_HP_ALLOWED=""
  export WR_HP_ROLE=all
  export WR_HP_NETWORK_MODE=bridge
  export WR_HP_COMPOSE_PROJECT=""
  export WR_HP_EXPECTED_COMPOSE=""
  export WR_HP_REQUIRE_COMPOSE=0
  export WR_HP_BINDINGS_JSON="$bindings_json"
  wr_hp_evaluate_python
}

# Map host-publish evaluator / inspect failures to release-SHA reconcile tokens.
wr_hp_release_sha_bind_token() {
  local verdict="$1"
  case "$verdict" in
    HOST_PUBLISH_PUBLIC_BIND|HOST_PUBLISH_IPV6_*|HOST_PUBLISH_IPV6_LOOPBACK_UNDECLARED)
      echo PUBLIC_BIND_EXPOSURE
      ;;
    HOST_PUBLISH_ALLOWLIST_MISMATCH|HOST_PUBLISH_UNEXPECTED_PORT|HOST_PUBLISH_INCOMPLETE_BINDINGS|HOST_PUBLISH_DUPLICATE_BINDING|HOST_PUBLISH_UNEXPECTED_PROTOCOL)
      echo PRIVATE_BIND_CONTRACT_MISMATCH
      ;;
    PORT_BINDINGS_INSPECTION_INVALID|HOST_PUBLISH_BINDINGS_PARSE_FAIL|HOST_PUBLISH_BINDING_MALFORMED)
      echo PORT_BINDINGS_INSPECTION_INVALID
      ;;
    *)
      echo PRIVATE_BIND_CONTRACT_MISMATCH
      ;;
  esac
}
