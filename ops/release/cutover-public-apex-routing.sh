#!/usr/bin/env bash
# LIVE_MUTATING=true
# requires_global_lock=true
#
# Public apex ROUTING cutover for accepted isolated public_production pair.
# This is NOT an application pair deploy and NOT a DNS mutation.
#
# What this helper can do (execute, owner-gated):
#   - CAS live pair identity (must match caller --source-sha / digests)
#   - CAS current public DNS still equals documented legacy A
#   - connect SF/BE to dokploy-network (Traefik reachability)
#   - install Traefik dynamic file for woodright.ru / www / api.woodright.ru
#   - automatic Traefik+network rollback on install failure
#
# What this helper never does:
#   - change ITB DNS records (no API in repo; operator panel)
#   - recreate / retag application containers
#   - mutate CS-Cart / legacy nginx on 79.133.175.43
#   - edit woodright-demo.yml
#   - expose raw :3300 / :9300 on 0.0.0.0
#   - publish admin.woodright.ru
#   - issue OWNER_LEGAL_CONTENT_APPROVED or apex owner tokens
#
# DNS remains a separate operator step in the ITB panel after Traefik is in
# place. ACME HTTP-01 cannot issue woodright.ru certs until A points at the
# new-stack VM. Helper execute is therefore "proxy ready", not "buyers moved".
#
# Confirm token: I_UNDERSTAND_PUBLIC_APEX_ROUTING_CUTOVER
# Lock: /srv/woodright/locks/public_production/apex-routing.lock
# Operator: docs/operator/public-apex-cutover.md
set -Eeuo pipefail
IFS=$'\n\t'

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
# shellcheck source=../lib/woodright-environment-profile.sh
source "$HERE/../lib/woodright-environment-profile.sh"

EXECUTE_CONFIRM_TOKEN="I_UNDERSTAND_PUBLIC_APEX_ROUTING_CUTOVER"
CANONICAL_LOCK_PATH="/srv/woodright/locks/public_production/apex-routing.lock"
PAIR_LOCK_PATH="/srv/woodright/locks/public_production/live-cutover.lock"
APPROVAL_PATH_DEFAULT="/srv/woodright/meta/public_production/OWNER_APPROVED_APEX_LAUNCH.json"
TRAEFIK_TEMPLATE_REL="ops/config/public-launch/traefik-public-production.yml"
TRAEFIK_DYNAMIC_DEFAULT="/etc/dokploy/traefik/dynamic/woodright-public-production.yml"
DEMO_TRAEFIK_DEFAULT="/etc/dokploy/traefik/dynamic/woodright-demo.yml"
DOKPLOY_NET="dokploy-network"
SF_NAME="woodright-public-production-storefront"
BE_NAME="woodright-public-production-backend"
LEGACY_APEX_A="79.133.175.43"
NEW_STACK_A="89.169.188.29"
ACCEPTED_SOURCE_SHA="ced25101f71f34caf98b62d1e7855be4f91ef977"
ACCEPTED_SF_DIGEST="sha256:39b244717c45249971cb55c7c702a2bbb9fad48a2d0fa7c5d55fca39ade05b9c"
ACCEPTED_BE_DIGEST="sha256:8f097c9d9f82a6cf79e9ee970ac96aed1577e37d75275e027cc0cef0ca845339"

MODE="dry-run"
CONFIRM=""
SOURCE_SHA=""
SF_DIGEST=""
BE_DIGEST=""
APPROVAL_PATH="$APPROVAL_PATH_DEFAULT"
TRAEFIK_CREATED=0
TRAEFIK_PREEXISTED=0
OWNED_STATE_DEFAULT="/srv/woodright/meta/public_production/APEX_ROUTING_OWNED.json"
EVIDENCE_DIR=""
TS_RUN="$(date -u +%Y%m%dT%H%M%SZ)"
LOCK_FD=9
MUTATED=0
NETWORKS_CONNECTED=()

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() {
  log "ERROR: $*"
  if [[ "${MODE:-}" == "execute" && "${MUTATED:-0}" == "1" && "${WOODRIGHT_APEX_IN_DIE_ROLLBACK:-0}" != "1" ]]; then
    WOODRIGHT_APEX_IN_DIE_ROLLBACK=1
    rollback_partial || true
  fi
  exit 2
}

usage() {
  cat <<'EOF'
Usage:
  bash ops/release/cutover-public-apex-routing.sh \
    --environment public_production \
    --mode dry-run|execute|rollback \
    --source-sha <40hex> \
    --storefront-digest sha256:<64hex> \
    --backend-digest sha256:<64hex> \
    [--confirm I_UNDERSTAND_PUBLIC_APEX_ROUTING_CUTOVER] \
    [--approval-path PATH]

execute requires owner approval JSON + confirm token.
This helper does not change DNS.
Rollback is refused until apex and www are the legacy A and api is empty.
EOF
}

json_get() {
  python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d.get(sys.argv[2],"") or "")' "$1" "$2"
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --environment)
        [[ "${2:-}" == "public_production" ]] || die "only --environment public_production is accepted"
        shift 2
        ;;
      --mode)
        MODE="${2:-}"
        shift 2
        ;;
      --source-sha)
        SOURCE_SHA="${2:-}"
        shift 2
        ;;
      --storefront-digest)
        SF_DIGEST="${2:-}"
        shift 2
        ;;
      --backend-digest)
        BE_DIGEST="${2:-}"
        shift 2
        ;;
      --confirm)
        CONFIRM="${2:-}"
        shift 2
        ;;
      --approval-path)
        APPROVAL_PATH="${2:-}"
        shift 2
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        die "unknown argument: $1"
        ;;
    esac
  done
}

require_sha() {
  [[ "$1" =~ ^[0-9a-f]{40}$ ]] || die "source-sha must be 40 lowercase hex (got '$1')"
}

require_digest() {
  [[ "$1" =~ ^sha256:[0-9a-f]{64}$ ]] || die "digest must be sha256:<64hex> (got '$1')"
}

apex_traefik_file() {
  printf '%s\n' "${WOODRIGHT_APEX_TRAEFIK_FILE:-$TRAEFIK_DYNAMIC_DEFAULT}"
}

demo_traefik_file() {
  printf '%s\n' "${WOODRIGHT_DEMO_TRAEFIK_FILE:-$DEMO_TRAEFIK_DEFAULT}"
}

dig_a() {
  local host="$1"
  if [[ -n "${WOODRIGHT_FAKE_DIG_A:-}" ]]; then
    python3 -c 'import json,os,sys; d=json.loads(os.environ["WOODRIGHT_FAKE_DIG_A"]); print(d.get(sys.argv[1],""))' "$host"
    return 0
  fi
  dig +short A "$host" | awk 'NF && $1 ~ /^[0-9.]+$/' | head -1
}

container_image_digest() {
  local name="$1" img digest
  img="$(docker inspect --format '{{.Config.Image}}' "$name" 2>/dev/null || true)"
  if [[ "$img" == *@sha256:* ]]; then
    printf '%s\n' "${img##*@}"
    return 0
  fi
  digest="$(docker inspect --format '{{index .RepoDigests 0}}' "$name" 2>/dev/null | awk -F@ '{print $2}')"
  printf '%s\n' "$digest"
}

container_release_sha() {
  local name="$1"
  docker inspect --format '{{index .Config.Labels "com.woodright.release-sha"}}' "$name" 2>/dev/null || true
}

container_restart_count() {
  docker inspect --format '{{.RestartCount}}' "$1" 2>/dev/null || echo 999
}

container_health() {
  docker inspect --format '{{.State.Health.Status}}' "$1" 2>/dev/null || echo missing
}

container_on_network() {
  local name="$1" net="$2"
  docker inspect --format '{{range $k,$v := .NetworkSettings.Networks}}{{println $k}}{{end}}' "$name" \
    | grep -Fx "$net" >/dev/null
}

assert_template_safe() {
  local tmpl="$REPO_ROOT/$TRAEFIK_TEMPLATE_REL"
  [[ -f "$tmpl" ]] || die "missing Traefik template $tmpl"
  grep -q 'Host(`admin.woodright.ru`)' "$tmpl" && die "template must not publish a public admin host"
  grep -q 'woodright-demo.ru' "$tmpl" && die "template must not include demo hosts"
  grep -q 'woodright-public-production-storefront:3002' "$tmpl" || die "template missing public_production storefront upstream"
  grep -q 'woodright-public-production-backend:9000' "$tmpl" || die "template missing public_production backend upstream"
  grep -q 'certResolver: letsencrypt' "$tmpl" || die "template missing letsencrypt resolver"
  if grep -q 'woodright-prod-buyer-noindex' "$tmpl"; then
    die "template must not noindex the buyer storefront"
  fi
}

cas_pair() {
  local live_sf live_be live_sha sf_h be_h sf_r be_r
  live_sf="$(container_image_digest "$SF_NAME")"
  live_be="$(container_image_digest "$BE_NAME")"
  live_sha="$(container_release_sha "$SF_NAME")"
  sf_h="$(container_health "$SF_NAME")"
  be_h="$(container_health "$BE_NAME")"
  sf_r="$(container_restart_count "$SF_NAME")"
  be_r="$(container_restart_count "$BE_NAME")"
  [[ "$live_sha" == "$SOURCE_SHA" ]] || die "CAS pair SHA mismatch live='$live_sha' expected='$SOURCE_SHA'"
  [[ "$live_sf" == "$SF_DIGEST" ]] || die "CAS storefront digest mismatch live='$live_sf' expected='$SF_DIGEST'"
  [[ "$live_be" == "$BE_DIGEST" ]] || die "CAS backend digest mismatch live='$live_be' expected='$BE_DIGEST'"
  [[ "$sf_h" == "healthy" ]] || die "storefront not healthy: $sf_h"
  [[ "$be_h" == "healthy" ]] || die "backend not healthy: $be_h"
  [[ "$sf_r" == "0" ]] || die "storefront RestartCount=$sf_r (require 0)"
  [[ "$be_r" == "0" ]] || die "backend RestartCount=$be_r (require 0)"
  log "CAS pair OK sha=${SOURCE_SHA:0:7} sf=$SF_DIGEST be=$BE_DIGEST restarts=0"
}

cas_dns_legacy() {
  local apex www api
  apex="$(dig_a woodright.ru)"
  www="$(dig_a www.woodright.ru)"
  api="$(dig_a api.woodright.ru)"
  [[ "$apex" == "$LEGACY_APEX_A" ]] || die "CAS DNS woodright.ru='$apex' expected legacy '$LEGACY_APEX_A' (external change; STOP)"
  [[ "$www" == "$LEGACY_APEX_A" ]] || die "CAS DNS www.woodright.ru='$www' expected legacy '$LEGACY_APEX_A'"
  if [[ -n "$api" ]]; then
    die "CAS DNS api.woodright.ru unexpectedly resolves to '$api' (expected empty before launch / before routing rollback)"
  fi
  log "CAS DNS legacy OK apex=$apex www=$www api=<empty>"
}

cas_demo_untouched() {
  local demo
  demo="$(demo_traefik_file)"
  [[ -f "$demo" ]] || { log "WARN demo Traefik file absent at $demo"; return 0; }
  grep -q 'woodright-demo.ru' "$demo" || die "demo Traefik file lost woodright-demo.ru identity"
}

cas_traefik_absent_or_ours() {
  local target tmpl
  target="$(apex_traefik_file)"
  tmpl="$REPO_ROOT/$TRAEFIK_TEMPLATE_REL"
  if [[ -e "$target" ]]; then
    if cmp -s "$target" "$tmpl"; then
      log "Traefik target already matches template (idempotent)"
      return 0
    fi
    die "CAS Traefik target exists and differs from template: $target (STOP, do not overwrite)"
  fi
}

read_approval() {
  local path="$1"
  [[ -f "$path" ]] || die "apex owner approval missing: $path"
  [[ ! -L "$path" ]] || die "apex owner approval must not be a symlink"
  local token env sha sf be
  token="$(json_get "$path" token)"
  env="$(json_get "$path" environment)"
  sha="$(json_get "$path" application_source_sha)"
  sf="$(json_get "$path" storefront_digest)"
  be="$(json_get "$path" backend_digest)"
  [[ "$token" == "OWNER_APPROVE_WOODRIGHT_APEX_LAUNCH_CED2510" ]] \
    || die "approval token mismatch (got '$token')"
  [[ "$env" == "public_production" ]] || die "approval environment mismatch: $env"
  [[ "$sha" == "$SOURCE_SHA" ]] || die "approval SHA mismatch"
  [[ "$sf" == "$SF_DIGEST" ]] || die "approval storefront digest mismatch"
  [[ "$be" == "$BE_DIGEST" ]] || die "approval backend digest mismatch"
  log "owner apex approval OK"
}

maybe_inject_fail() {
  local point="$1"
  if [[ "${WOODRIGHT_APEX_INJECT_FAIL:-}" == "$point" ]]; then
    die "injected failure at $point"
  fi
}

connect_network() {
  local name="$1"
  if container_on_network "$name" "$DOKPLOY_NET"; then
    log "network $DOKPLOY_NET already on $name"
    return 0
  fi
  docker network connect "$DOKPLOY_NET" "$name"
  NETWORKS_CONNECTED+=("$name")
  MUTATED=1
  log "connected $name to $DOKPLOY_NET"
}

disconnect_network_if_we_added() {
  local name
  for name in "${NETWORKS_CONNECTED[@]+"${NETWORKS_CONNECTED[@]}"}"; do
    docker network disconnect "$DOKPLOY_NET" "$name" || true
    log "disconnected $name from $DOKPLOY_NET"
  done
  NETWORKS_CONNECTED=()
}

install_traefik() {
  local target tmpl dir
  target="$(apex_traefik_file)"
  tmpl="$REPO_ROOT/$TRAEFIK_TEMPLATE_REL"
  dir="$(dirname "$target")"
  mkdir -p "$dir"
  if [[ -f "$target" ]]; then
    cp -a "$target" "$EVIDENCE_DIR/pre-traefik.yml"
    if cmp -s "$target" "$tmpl"; then
      TRAEFIK_PREEXISTED=1
      log "Traefik target already matched template; not treating as new write"
      return 0
    fi
    die "CAS Traefik target exists and differs from template: $target"
  else
    printf 'ABSENT\n' >"$EVIDENCE_DIR/pre-traefik.absent"
  fi
  local tmp="$dir/.woodright-public-production.yml.tmp.$$"
  install -m 0644 "$tmpl" "$tmp"
  cmp -s "$tmp" "$tmpl" || { rm -f "$tmp"; die "Traefik staging copy mismatch"; }
  mv -f "$tmp" "$target"
  TRAEFIK_CREATED=1
  MUTATED=1
  cp -a "$target" "$EVIDENCE_DIR/installed-traefik.yml"
  log "installed Traefik dynamic $target"
}

remove_created_traefik() {
  local target
  target="$(apex_traefik_file)"
  if [[ "$TRAEFIK_CREATED" == "1" && -f "$target" ]]; then
    rm -f "$target"
    log "removed Traefik dynamic created by this run $target"
  fi
}

owned_state_path() {
  printf '%s\n' "${WOODRIGHT_APEX_OWNED_STATE:-$OWNED_STATE_DEFAULT}"
}

write_owned_state() {
  local path
  local -a py_args
  path="$(owned_state_path)"
  mkdir -p "$(dirname "$path")"
  py_args=("$path" "$TRAEFIK_CREATED")
  if ((${#NETWORKS_CONNECTED[@]})); then
    py_args+=("${NETWORKS_CONNECTED[@]}")
  fi
  python3 - "${py_args[@]}" <<'PY'
import json, sys
path = sys.argv[1]
created = sys.argv[2] == "1"
new_nets = list(sys.argv[3:])
prev = {}
try:
    with open(path) as f:
        prev = json.load(f)
except Exception:
    prev = {}
old = prev.get("networks_added") or prev.get("networks_connected") or []
merged = []
for n in list(old) + new_nets:
    if n and n not in merged:
        merged.append(n)
doc = {
    "schema": "woodright.public_production.apex_routing_owned.v1",
    "traefik_created_by_helper": bool(prev.get("traefik_created_by_helper")) or created,
    "networks_added": merged,
}
with open(path, "w") as f:
    json.dump(doc, f, indent=2)
PY
  chmod 0600 "$path" 2>/dev/null || true
  cp -a "$path" "$EVIDENCE_DIR/owned.json" 2>/dev/null || true
}

write_evidence_pre() {
  mkdir -p "$EVIDENCE_DIR"
  cat >"$EVIDENCE_DIR/preflight.json" <<EOF
{
  "schema": "woodright.public_production.apex_routing.preflight.v1",
  "utc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "mode": "$MODE",
  "application_source_sha": "$SOURCE_SHA",
  "storefront_digest": "$SF_DIGEST",
  "backend_digest": "$BE_DIGEST",
  "legacy_apex_a": "$LEGACY_APEX_A",
  "new_stack_a": "$NEW_STACK_A",
  "dns_woodright_ru": "$(dig_a woodright.ru)",
  "dns_www": "$(dig_a www.woodright.ru)",
  "dns_api": "$(dig_a api.woodright.ru)",
  "traefik_target": "$(apex_traefik_file)",
  "dns_mutation": "NO",
  "application_redeploy": "NO"
}
EOF
}

acquire_lock() {
  local lock="${WOODRIGHT_APEX_LOCK_PATH:-$CANONICAL_LOCK_PATH}"
  mkdir -p "$(dirname "$lock")"
  if [[ "${WOODRIGHT_APEX_SKIP_FLOCK:-0}" == "1" ]]; then
    log "lock skipped WOODRIGHT_APEX_SKIP_FLOCK=1 path=$lock"
    return 0
  fi
  eval "exec ${LOCK_FD}>>\"\$lock\""
  flock -n "$LOCK_FD" || die "apex routing lock busy: $lock"
  local pair_lock="${WOODRIGHT_PAIR_LOCK_PATH:-$PAIR_LOCK_PATH}"
  mkdir -p "$(dirname "$pair_lock")"
  : >>"$pair_lock"
  flock -n 10 10<"$pair_lock" || die "pair live-cutover.lock is held; refuse concurrent apex routing"
  log "lock acquired $lock (pair lock free)"
}

rollback_partial() {
  log "automatic rollback of this helper's Traefik/network writes"
  remove_created_traefik
  disconnect_network_if_we_added
}

on_err() {
  local rc=$?
  if [[ "$MUTATED" == "1" && "$MODE" == "execute" ]]; then
    rollback_partial || true
    log "STATUS PUBLIC_APEX_ROUTING_ROLLED_BACK rc=$rc"
  fi
  exit "$rc"
}

probe_loopback() {
  local sf_code be_code host code
  if [[ "${WOODRIGHT_APEX_SKIP_HTTP_PROBE:-0}" == "1" ]]; then
    log "HTTP probes skipped WOODRIGHT_APEX_SKIP_HTTP_PROBE=1"
    return 0
  fi
  sf_code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 -H 'Host: woodright.ru' http://127.0.0.1:3300/ || true)"
  be_code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 http://127.0.0.1:9300/health || true)"
  [[ "$sf_code" == "200" ]] || die "loopback storefront probe failed: $sf_code"
  [[ "$be_code" == "200" ]] || die "loopback backend health failed: $be_code"
  log "loopback probes OK sf=$sf_code be=$be_code"
  if [[ "${WOODRIGHT_APEX_SKIP_TRAEFIK_PROBE:-0}" == "1" ]]; then
    log "Traefik HTTP probes skipped"
    return 0
  fi
  for host in woodright.ru www.woodright.ru api.woodright.ru; do
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 \
      --resolve "${host}:80:127.0.0.1" "http://${host}/" || true)"
    case "$code" in
      301|302|307|308) ;;
      *) die "Traefik HTTP probe for $host expected redirect, got $code (HTTPS/ACME still requires DNS)" ;;
    esac
    log "Traefik HTTP $host -> $code"
  done
}

print_dns_operator_steps() {
  cat <<EOF
# DNS is NOT mutated by this helper. Future owner-authorized ITB panel steps:
# 1. Keep MX / TXT / NS unchanged.
# 2. Create A api.woodright.ru -> ${NEW_STACK_A} TTL 300 (or current policy).
# 3. Retarget A woodright.ru ${LEGACY_APEX_A} -> ${NEW_STACK_A}.
# 4. Retarget A www.woodright.ru ${LEGACY_APEX_A} -> ${NEW_STACK_A}.
# Rollback DNS: restore both web A records to ${LEGACY_APEX_A}; delete api A.
# SPF has ip4:79.133.175.238 plus 'a'; changing web A expands 'a' to ${NEW_STACK_A}.
EOF
}

main() {
  parse_args "$@"
  wr_require_environment_from_args --environment public_production >/dev/null
  wr_load_environment_profile public_production || die "failed to load public_production profile"

  case "$MODE" in
    dry-run|execute|rollback) ;;
    *) die "mode must be dry-run|execute|rollback" ;;
  esac

  require_sha "$SOURCE_SHA"
  require_digest "$SF_DIGEST"
  require_digest "$BE_DIGEST"
  [[ "$SOURCE_SHA" == "$ACCEPTED_SOURCE_SHA" ]] || die "refusing non-accepted application SHA (launch candidate is ced2510)"
  [[ "$SF_DIGEST" == "$ACCEPTED_SF_DIGEST" ]] || die "refusing non-accepted storefront digest"
  [[ "$BE_DIGEST" == "$ACCEPTED_BE_DIGEST" ]] || die "refusing non-accepted backend digest"

  assert_template_safe
  EVIDENCE_DIR="${WOODRIGHT_APEX_EVIDENCE_DIR:-${WOODRIGHT_EVIDENCE_ROOT}/apex-routing-${TS_RUN}}"
  mkdir -p "$EVIDENCE_DIR"

  if [[ "$MODE" == "rollback" ]]; then
    acquire_lock
    cas_dns_legacy
    cas_demo_untouched
    local target tmpl owned
    target="$(apex_traefik_file)"
    tmpl="$REPO_ROOT/$TRAEFIK_TEMPLATE_REL"
    owned="$(owned_state_path)"
    if [[ -f "$target" ]]; then
      cmp -s "$target" "$tmpl" || die "CAS Traefik target differs from template; refuse delete"
      cp -a "$target" "$EVIDENCE_DIR/pre-rollback-traefik.yml"
    fi
    if [[ -f "$owned" ]]; then
      python3 - "$owned" "$target" "$DOKPLOY_NET" <<'PY'
import json, os, subprocess, sys
owned_path, target, net = sys.argv[1:4]
owned = json.load(open(owned_path))
if owned.get("traefik_created_by_helper") and os.path.isfile(target):
    os.remove(target)
    print("removed_traefik", target)
else:
    print("preserved_traefik")
for name in owned.get("networks_added") or []:
    subprocess.check_call(["docker", "network", "disconnect", net, name])
PY
      mv "$owned" "$EVIDENCE_DIR/owned-cleared.json"
    else
      log "no owned-state file; not deleting Traefik or disconnecting networks"
    fi
    cas_demo_untouched
    log "STATUS PUBLIC_APEX_ROUTING_ROLLBACK_OK"
    print_dns_operator_steps
    exit 0
  fi

  cas_pair
  cas_dns_legacy
  cas_demo_untouched
  cas_traefik_absent_or_ours
  probe_loopback
  write_evidence_pre
  print_dns_operator_steps

  if [[ "$MODE" == "dry-run" ]]; then
    log "STATUS PUBLIC_APEX_ROUTING_DRY_RUN_OK"
    echo "$EVIDENCE_DIR"
    exit 0
  fi

  [[ "$CONFIRM" == "$EXECUTE_CONFIRM_TOKEN" ]] || die "execute requires --confirm $EXECUTE_CONFIRM_TOKEN"
  read_approval "$APPROVAL_PATH"
  trap on_err ERR
  acquire_lock
  cas_pair
  cas_dns_legacy
  cas_demo_untouched
  cas_traefik_absent_or_ours
  connect_network "$SF_NAME"
  maybe_inject_fail after-first-network
  connect_network "$BE_NAME"
  maybe_inject_fail after-networks
  install_traefik
  maybe_inject_fail after-traefik
  write_owned_state
  cas_demo_untouched
  probe_loopback
  printf 'PUBLIC_APEX_ROUTING_PREPARE_OK\n' >"$EVIDENCE_DIR/status.txt"
  log "STATUS PUBLIC_APEX_ROUTING_PREPARE_OK (DNS still legacy; buyers unchanged)"
  echo "$EVIDENCE_DIR"
}

main "$@"
