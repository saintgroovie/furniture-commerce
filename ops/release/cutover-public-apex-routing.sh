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
#   - wait (bounded) for Traefik file-provider Host routing to converge
#   - automatic Traefik+network+owned-state rollback on install/settle failure
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
#
# Dry-run writes evidence JSON only (routing-plan.json, preflight.json).
# It does not mutate Docker networks, Traefik files, application containers, or DNS.
set -Eeuo pipefail
IFS=$'\n\t'

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
# shellcheck source=../lib/woodright-environment-profile.sh
source "$HERE/../lib/woodright-environment-profile.sh"
# shellcheck source=../lib/woodright-owner-approved-release.sh
source "$HERE/../lib/woodright-owner-approved-release.sh"
# shellcheck source=../lib/woodright-recovery-point.sh
source "$HERE/../lib/woodright-recovery-point.sh"

EXECUTE_CONFIRM_TOKEN="I_UNDERSTAND_PUBLIC_APEX_ROUTING_CUTOVER"
# SHA-agnostic execute approval (must still match accepted live pair).
APEX_LAUNCH_APPROVAL_TOKEN="OWNER_APPROVE_WOODRIGHT_APEX_LAUNCH"
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
REQUIRED_BUILD_PROFILE="public_production"
REQUIRED_RUNTIME_ROLE="public_production"
REQUIRED_DB_ALIAS="public_production_db"
BACKUP_CRIT_H="${WOODRIGHT_BACKUP_CRIT_HOURS:-48}"
ACCEPTED_SOURCE_SHA=""
ACCEPTED_SF_DIGEST=""
ACCEPTED_BE_DIGEST=""
LIVE_SF_ID=""
LIVE_BE_ID=""
SF_CONNECT_REQUIRED=0
BE_CONNECT_REQUIRED=0
YAML_CHANGE_NEEDED=0
# File-provider watch can 404 after atomic install; poll until Host routing exists.
TRAEFIK_SETTLE_TIMEOUT_DEFAULT=45
TRAEFIK_SETTLE_INTERVAL_DEFAULT=1
# Two consecutive full-set successes reject mixed partial router loads.
TRAEFIK_SETTLE_STREAK_DEFAULT=2

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
    if ! rollback_partial; then
      log "ERROR automatic rollback incomplete; owned-state retained for explicit retry"
    fi
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
Accepted SHA/digests are derived from OWNER_APPROVED_RELEASE + EXPECTED_RELEASE +
ACTIVE_RELEASE + live Docker (not a hardcoded release constant).
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

container_id() {
  docker inspect --format '{{.Id}}' "$1" 2>/dev/null || true
}

container_oci_revision() {
  local name="$1" rev
  rev="$(docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$name" 2>/dev/null || true)"
  if [[ -z "$rev" ]]; then
    rev="$(docker inspect --format '{{index .Config.Labels "com.woodright.release-sha"}}' "$name" 2>/dev/null || true)"
  fi
  printf '%s\n' "$rev"
}

container_env() {
  local name="$1" key="$2"
  docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$name" 2>/dev/null \
    | awk -F= -v k="$key" '$1==k {print substr($0, index($0,"=")+1); exit}'
}

container_build_profile() {
  docker inspect --format '{{index .Config.Labels "woodright.image.build_profile"}}' "$1" 2>/dev/null || true
}

container_release_sha() {
  local name="$1" oci env_sha
  oci="$(container_oci_revision "$name")"
  env_sha="$(container_env "$name" WOODRIGHT_RELEASE_SHA)"
  if [[ -n "$oci" && -n "$env_sha" && "$oci" != "$env_sha" ]]; then
    die "CAS $name OCI revision '$oci' != WOODRIGHT_RELEASE_SHA '$env_sha'"
  fi
  if [[ -n "$oci" ]]; then
    printf '%s\n' "$oci"
    return 0
  fi
  printf '%s\n' "$env_sha"
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

json_file_get() {
  local path="$1" key="$2"
  [[ -f "$path" ]] || { printf '\n'; return 0; }
  python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d.get(sys.argv[2],"") or "")' "$path" "$key"
}

derive_accepted_authority() {
  local expected_path active_path expected_sha active_sha expected_sf expected_be active_sf_img active_be_img active_sf active_be active_state
  if ! wr_owner_approved_load public_production; then
    die "OWNER_APPROVED_RELEASE unusable: ${WR_OWNER_APPROVAL_RESULT:-missing} path=${WR_OA_PATH:-}"
  fi
  expected_path="${WOODRIGHT_EXPECTED_RELEASE}"
  active_path="${WOODRIGHT_ACTIVE_RELEASE}"
  [[ -f "$expected_path" ]] || die "EXPECTED_RELEASE missing: $expected_path"
  [[ -f "$active_path" ]] || die "ACTIVE_RELEASE missing: $active_path"
  expected_sha="$(json_file_get "$expected_path" application_source_sha)"
  active_sha="$(json_file_get "$active_path" application_source_sha)"
  expected_sf="$(json_file_get "$expected_path" storefront_digest)"
  expected_be="$(json_file_get "$expected_path" backend_digest)"
  active_sf_img="$(json_file_get "$active_path" storefront_image)"
  active_be_img="$(json_file_get "$active_path" backend_image)"
  active_state="$(json_file_get "$active_path" state)"
  active_sf="${active_sf_img##*@}"
  active_be="${active_be_img##*@}"
  [[ "$active_state" == "committed" ]] || die "ACTIVE_RELEASE.state='$active_state' (require committed)"
  [[ "$WR_OA_APPLICATION_SHA" == "$expected_sha" ]] || die "OWNER_APPROVED_RELEASE SHA != EXPECTED_RELEASE ($WR_OA_APPLICATION_SHA vs $expected_sha)"
  [[ "$WR_OA_APPLICATION_SHA" == "$active_sha" ]] || die "OWNER_APPROVED_RELEASE SHA != ACTIVE_RELEASE ($WR_OA_APPLICATION_SHA vs $active_sha)"
  [[ "$WR_OA_STOREFRONT_DIGEST" == "$expected_sf" && "$expected_sf" == "$active_sf" ]] \
    || die "storefront digest metadata mismatch approved=$WR_OA_STOREFRONT_DIGEST expected=$expected_sf active=$active_sf"
  [[ "$WR_OA_BACKEND_DIGEST" == "$expected_be" && "$expected_be" == "$active_be" ]] \
    || die "backend digest metadata mismatch approved=$WR_OA_BACKEND_DIGEST expected=$expected_be active=$active_be"
  ACCEPTED_SOURCE_SHA="$WR_OA_APPLICATION_SHA"
  ACCEPTED_SF_DIGEST="$WR_OA_STOREFRONT_DIGEST"
  ACCEPTED_BE_DIGEST="$WR_OA_BACKEND_DIGEST"
  [[ "$SOURCE_SHA" == "$ACCEPTED_SOURCE_SHA" ]] \
    || die "requested --source-sha '$SOURCE_SHA' != authoritative accepted SHA '$ACCEPTED_SOURCE_SHA'"
  [[ "$SF_DIGEST" == "$ACCEPTED_SF_DIGEST" ]] \
    || die "requested storefront digest != accepted $ACCEPTED_SF_DIGEST"
  [[ "$BE_DIGEST" == "$ACCEPTED_BE_DIGEST" ]] \
    || die "requested backend digest != accepted $ACCEPTED_BE_DIGEST"
  log "accepted authority OK sha=${ACCEPTED_SOURCE_SHA:0:7} sf=$ACCEPTED_SF_DIGEST be=$ACCEPTED_BE_DIGEST owner_approval=$WR_OA_PATH"
}

cas_recovery_point() {
  local glob latest age created env_rp db_alias app_sha
  if [[ "${WOODRIGHT_APEX_SKIP_RP_GATE:-0}" == "1" ]]; then
    [[ "$MODE" == "execute" ]] && die "WOODRIGHT_APEX_SKIP_RP_GATE is forbidden in execute"
    log "RP gate skipped WOODRIGHT_APEX_SKIP_RP_GATE=1"
    return 0
  fi
  glob="${WOODRIGHT_RECOVERY_MANIFEST_GLOB:-/srv/woodright/backups/automated/public-production/manifests/recovery-point-*.json}"
  latest="$(ls -1t $glob 2>/dev/null | head -1 || true)"
  [[ -n "$latest" && -f "$latest" ]] || die "FRESH_RECOVERY_POINT_REQUIRED no manifest matching $glob"
  wr_validate_recovery_point_manifest "$latest" || die "recovery-point manifest invalid: $latest"
  env_rp="$(json_file_get "$latest" environment)"
  app_sha="$(json_file_get "$latest" application_sha)"
  db_alias="$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print((d.get("db") or {}).get("alias") or "")' "$latest")"
  created="$(json_file_get "$latest" created_at_utc)"
  [[ "$env_rp" == "public_production" ]] || die "wrong-environment RP env=$env_rp"
  [[ "$app_sha" == "$SOURCE_SHA" ]] || die "RP application_sha=$app_sha != requested $SOURCE_SHA"
  [[ "$db_alias" == "$REQUIRED_DB_ALIAS" ]] || die "RP db alias='$db_alias' expected $REQUIRED_DB_ALIAS"
  age="$(python3 -c 'import datetime,sys
raw=sys.argv[1]
# 20260902T091459Z or ISO
for fmt in ("%Y%m%dT%H%M%SZ","%Y-%m-%dT%H:%M:%SZ"):
    try:
        ts=datetime.datetime.strptime(raw, fmt).replace(tzinfo=datetime.timezone.utc)
        break
    except ValueError:
        ts=None
if ts is None:
    raise SystemExit("unparsed")
age=int((datetime.datetime.now(datetime.timezone.utc)-ts).total_seconds()//3600)
print(age)' "$created")"
  [[ "$age" =~ ^[0-9]+$ ]] || die "RP age unparsed created=$created"
  if (( age > BACKUP_CRIT_H )); then
    die "stale RP age_h=$age crit_h=$BACKUP_CRIT_H path=$latest"
  fi
  log "RP gate OK id=$(json_file_get "$latest" recovery_point_id) age_h=$age path=$latest"
}

cas_alias_collision() {
  local net="$1" want="$2"
  if [[ "${WOODRIGHT_APEX_SKIP_ALIAS_GATE:-0}" == "1" ]]; then
    [[ "$MODE" == "execute" ]] && die "WOODRIGHT_APEX_SKIP_ALIAS_GATE is forbidden in execute"
    return 0
  fi
  python3 - "$net" "$want" <<'PY' || die "PUBLIC_PRODUCTION_NETWORK_ALIAS_CONFLICT alias=$want"
import json, subprocess, sys
net, want = sys.argv[1], sys.argv[2]
try:
    raw = subprocess.check_output(["docker", "network", "inspect", net], text=True)
except subprocess.CalledProcessError:
    # network missing is a later connect failure; collision check is empty
    sys.exit(0)
data = json.loads(raw)[0]
for cid, c in (data.get("Containers") or {}).items():
    name = c.get("Name") or ""
    aliases = c.get("Aliases") or []
    if name == want:
        continue
    if want in aliases or name.endswith("/" + want):
        print(f"conflict name={name} id={cid} aliases={aliases}", file=sys.stderr)
        sys.exit(1)
sys.exit(0)
PY
}

plan_network_membership() {
  SF_CONNECT_REQUIRED=0
  BE_CONNECT_REQUIRED=0
  if container_on_network "$SF_NAME" "$DOKPLOY_NET"; then
    log "SF already on $DOKPLOY_NET"
  else
    SF_CONNECT_REQUIRED=1
    log "SF connect required to $DOKPLOY_NET alias=$SF_NAME"
  fi
  if container_on_network "$BE_NAME" "$DOKPLOY_NET"; then
    log "BE already on $DOKPLOY_NET"
  else
    BE_CONNECT_REQUIRED=1
    log "BE connect required to $DOKPLOY_NET alias=$BE_NAME"
  fi
  cas_alias_collision "$DOKPLOY_NET" "$SF_NAME"
  cas_alias_collision "$DOKPLOY_NET" "$BE_NAME"
}

write_routing_plan() {
  local target tmpl yaml_needed="false"
  target="$(apex_traefik_file)"
  tmpl="$REPO_ROOT/$TRAEFIK_TEMPLATE_REL"
  YAML_CHANGE_NEEDED=0
  if [[ -f "$target" ]]; then
    if cmp -s "$target" "$tmpl"; then
      yaml_needed="false"
    else
      die "PUBLIC_APEX_TRAEFIK_AUTHORITY_DRIFT target differs from template: $target"
    fi
  else
    yaml_needed="true"
    YAML_CHANGE_NEEDED=1
  fi
  mkdir -p "$EVIDENCE_DIR"
  cat >"$EVIDENCE_DIR/routing-plan.json" <<EOF
{
  "schema": "woodright.public_production.apex_routing_plan.v1",
  "application_source_sha": "$SOURCE_SHA",
  "storefront_digest": "$SF_DIGEST",
  "backend_digest": "$BE_DIGEST",
  "storefront_id": "$LIVE_SF_ID",
  "backend_id": "$LIVE_BE_ID",
  "target_network": "$DOKPLOY_NET",
  "sf_connect_required": $([ "$SF_CONNECT_REQUIRED" = 1 ] && echo true || echo false),
  "be_connect_required": $([ "$BE_CONNECT_REQUIRED" = 1 ] && echo true || echo false),
  "aliases": ["$SF_NAME", "$BE_NAME"],
  "yaml_change_needed": $yaml_needed,
  "application_recreate": "NO",
  "dns_mutation": "NO",
  "docker_traefik_mutation": "NO_IN_DRY_RUN",
  "evidence_writes": "routing-plan.json preflight.json (not Docker/Traefik/DNS)",
  "host_route_plan": "execute polls Traefik Host woodright.ru/www/api on 127.0.0.1:80; dry-run skips uncreated routers",
  "rollback": "disconnect only transaction-added $DOKPLOY_NET memberships for journaled container IDs; preserve pre-existing membership"
}
EOF
  log "routing plan written yaml_change_needed=$yaml_needed sf_connect=$SF_CONNECT_REQUIRED be_connect=$BE_CONNECT_REQUIRED"
}

assert_template_safe() {
  local tmpl="$REPO_ROOT/$TRAEFIK_TEMPLATE_REL"
  [[ -f "$tmpl" ]] || die "missing Traefik template $tmpl"
  grep -q 'Host(`admin.woodright.ru`)' "$tmpl" && die "template must not publish a public admin host"
  grep -q 'woodright-demo.ru' "$tmpl" && die "template must not include demo hosts"
  grep -q 'woodright-public-production-storefront:3002' "$tmpl" || die "template missing public_production storefront upstream"
  grep -q 'woodright-public-production-backend:9000' "$tmpl" || die "template missing public_production backend upstream"
  grep -q 'certResolver: letsencrypt' "$tmpl" || die "template missing letsencrypt resolver"
  grep -Fq 'Host(`woodright.ru`)' "$tmpl" || die "template missing Host(woodright.ru)"
  grep -Fq 'Host(`www.woodright.ru`)' "$tmpl" || die "template missing Host(www.woodright.ru)"
  grep -Fq 'Host(`api.woodright.ru`)' "$tmpl" || die "template missing Host(api.woodright.ru)"
  grep -Fq 'replacement: "https://woodright.ru/${1}"' "$tmpl" || die "template missing www→apex HTTPS replacement"
  grep -Fq 'redirect-to-https' "$tmpl" || die "template missing HTTP→HTTPS middleware for apex/api"
  if grep -q 'woodright-prod-buyer-noindex' "$tmpl"; then
    die "template must not noindex the buyer storefront"
  fi
}

cas_pair() {
  local live_sf live_be live_sha_sf live_sha_be sf_h be_h sf_r be_r sf_role be_role sf_db be_db sf_prof be_prof
  live_sf="$(container_image_digest "$SF_NAME")"
  live_be="$(container_image_digest "$BE_NAME")"
  live_sha_sf="$(container_release_sha "$SF_NAME")"
  live_sha_be="$(container_release_sha "$BE_NAME")"
  LIVE_SF_ID="$(container_id "$SF_NAME")"
  LIVE_BE_ID="$(container_id "$BE_NAME")"
  sf_h="$(container_health "$SF_NAME")"
  be_h="$(container_health "$BE_NAME")"
  sf_r="$(container_restart_count "$SF_NAME")"
  be_r="$(container_restart_count "$BE_NAME")"
  sf_role="$(container_env "$SF_NAME" WOODRIGHT_RUNTIME_ROLE)"
  be_role="$(container_env "$BE_NAME" WOODRIGHT_RUNTIME_ROLE)"
  sf_db="$(container_env "$SF_NAME" WOODRIGHT_DATABASE_IDENTITY)"
  be_db="$(container_env "$BE_NAME" WOODRIGHT_DATABASE_IDENTITY)"
  sf_prof="$(container_build_profile "$SF_NAME")"
  be_prof="$(container_build_profile "$BE_NAME")"
  [[ -n "$LIVE_SF_ID" && -n "$LIVE_BE_ID" ]] || die "CAS missing container IDs"
  [[ "$live_sha_sf" == "$SOURCE_SHA" ]] || die "CAS storefront SHA mismatch live='$live_sha_sf' expected='$SOURCE_SHA'"
  [[ "$live_sha_be" == "$SOURCE_SHA" ]] || die "CAS backend SHA mismatch live='$live_sha_be' expected='$SOURCE_SHA'"
  [[ "$live_sf" == "$SF_DIGEST" ]] || die "CAS storefront digest mismatch live='$live_sf' expected='$SF_DIGEST'"
  [[ "$live_be" == "$BE_DIGEST" ]] || die "CAS backend digest mismatch live='$live_be' expected='$BE_DIGEST'"
  [[ "$sf_prof" == "$REQUIRED_BUILD_PROFILE" ]] || die "storefront build_profile='$sf_prof' expected $REQUIRED_BUILD_PROFILE"
  [[ "$be_prof" == "$REQUIRED_BUILD_PROFILE" ]] || die "backend build_profile='$be_prof' expected $REQUIRED_BUILD_PROFILE"
  [[ "$sf_role" == "$REQUIRED_RUNTIME_ROLE" ]] || die "storefront role='$sf_role' expected $REQUIRED_RUNTIME_ROLE"
  [[ "$be_role" == "$REQUIRED_RUNTIME_ROLE" ]] || die "backend role='$be_role' expected $REQUIRED_RUNTIME_ROLE"
  [[ "$sf_db" == "$REQUIRED_DB_ALIAS" ]] || die "storefront db='$sf_db' expected $REQUIRED_DB_ALIAS"
  [[ "$be_db" == "$REQUIRED_DB_ALIAS" ]] || die "backend db='$be_db' expected $REQUIRED_DB_ALIAS"
  [[ "$sf_h" == "healthy" ]] || die "storefront not healthy: $sf_h"
  [[ "$be_h" == "healthy" ]] || die "backend not healthy: $be_h"
  [[ "$sf_r" == "0" ]] || die "storefront RestartCount=$sf_r (require 0)"
  [[ "$be_r" == "0" ]] || die "backend RestartCount=$be_r (require 0)"
  log "CAS pair OK sha=${SOURCE_SHA:0:7} sf_id=${LIVE_SF_ID:0:12} be_id=${LIVE_BE_ID:0:12} profile=$REQUIRED_BUILD_PROFILE"
}

assert_container_id_unchanged() {
  local name="$1" expected="$2" now
  now="$(container_id "$name")"
  [[ "$now" == "$expected" ]] || die "CAS container $name changed id live='$now' expected='$expected'"
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
  [[ "$token" == "$APEX_LAUNCH_APPROVAL_TOKEN" ]] \
    || die "approval token mismatch (got '$token' expected $APEX_LAUNCH_APPROVAL_TOKEN)"
  [[ "$env" == "public_production" ]] || die "approval environment mismatch: $env"
  [[ "$sha" == "$SOURCE_SHA" ]] || die "approval SHA mismatch"
  [[ "$sf" == "$SF_DIGEST" ]] || die "approval storefront digest mismatch"
  [[ "$be" == "$BE_DIGEST" ]] || die "approval backend digest mismatch"
  log "owner apex approval OK"
}

maybe_inject_fail() {
  local point="$1"
  if [[ "${WOODRIGHT_APEX_INJECT_FAIL:-}" != "$point" ]]; then
    return 0
  fi
  if [[ "$point" == "after-owned-replace-traefik" ]]; then
    printf '# foreign unowned replacement\n' >"$(apex_traefik_file)"
  fi
  if [[ "$point" == "after-lock-expected-drift" ]]; then
    python3 - "${WOODRIGHT_EXPECTED_RELEASE}" <<'PY'
import json, sys
p = sys.argv[1]
d = json.load(open(p))
d["application_source_sha"] = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
json.dump(d, open(p, "w"))
PY
    return 0
  fi
  die "injected failure at $point"
}

connect_network() {
  local name="$1" expected_id="$2"
  assert_container_id_unchanged "$name" "$expected_id"
  if container_on_network "$name" "$DOKPLOY_NET"; then
    log "network $DOKPLOY_NET already on $name (pre-existing; not transaction-owned)"
    return 0
  fi
  cas_alias_collision "$DOKPLOY_NET" "$name"
  docker network connect --alias "$name" "$DOKPLOY_NET" "$expected_id"
  NETWORKS_CONNECTED+=("${name}|${expected_id}")
  MUTATED=1
  log "connected $name id=${expected_id:0:12} to $DOKPLOY_NET alias=$name"
}

# Treat "already not attached" as success so rollback can retry after a partial disconnect.
# Journaled container ID is required: refuse if the live name now points at a different ID.
disconnect_one_idempotent() {
  local name="$1"
  local net="$2"
  local expected_id="${3:-}"
  local live_id out rc=0
  live_id="$(container_id "$name")"
  if [[ -z "$live_id" ]]; then
    log "container $name absent; treating $net membership as already gone"
    return 0
  fi
  if [[ -z "$expected_id" ]]; then
    log "ERROR refusing nameless/ID-less rollback for $name (owned-state must journal container id)"
    return 1
  fi
  if [[ "$live_id" != "$expected_id" ]]; then
    log "ERROR PUBLIC_APEX_ROUTING_ROLLBACK_IDENTITY_MISMATCH name=$name live=${live_id:0:12} expected=${expected_id:0:12}"
    return 1
  fi
  out="$(docker network disconnect "$net" "$expected_id" 2>&1)" && {
    log "disconnected $name id=${expected_id:0:12} from $net"
    return 0
  }
  rc=$?
  if printf '%s\n' "$out" | grep -qiE 'is not connected|not connected to (the )?network|No such container'; then
    log "network $net already absent on $name"
    return 0
  fi
  log "ERROR docker network disconnect $name $net rc=$rc: $out"
  return "$rc"
}

iter_owned_network_records() {
  local owned="$1"
  python3 - "$owned" <<'PY'
import json, sys
owned = json.load(open(sys.argv[1]))
for item in owned.get("networks_added") or []:
    if isinstance(item, str):
        if "|" in item:
            name, cid = item.split("|", 1)
        else:
            name, cid = item, ""
    else:
        name, cid = item.get("name") or "", item.get("id") or ""
    if name:
        print(f"{name}\t{cid}")
PY
}

preflight_owned_network_identities() {
  local owned="$1" rec name expected_id live_id
  [[ -f "$owned" ]] || return 0
  while IFS= read -r rec; do
    [[ -n "$rec" ]] || continue
    name="${rec%%$'\t'*}"
    expected_id="${rec#*$'\t'}"
    [[ -n "$expected_id" ]] || die "owned-state missing container id for $name; refuse rollback mutation"
    live_id="$(container_id "$name")"
    if [[ -z "$live_id" ]]; then
      log "preflight $name absent; network membership already gone"
      continue
    fi
    if [[ "$live_id" != "$expected_id" ]]; then
      die "PUBLIC_APEX_ROUTING_ROLLBACK_IDENTITY_MISMATCH name=$name live=${live_id:0:12} expected=${expected_id:0:12}"
    fi
  done < <(iter_owned_network_records "$owned")
  log "owned network identity preflight OK"
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
  local target tmpl
  target="$(apex_traefik_file)"
  tmpl="$REPO_ROOT/$TRAEFIK_TEMPLATE_REL"
  if [[ "$TRAEFIK_CREATED" != "1" ]]; then
    return 0
  fi
  if [[ ! -f "$target" ]]; then
    log "Traefik dynamic already absent $target"
    return 0
  fi
  if [[ "${WOODRIGHT_APEX_INJECT_FAIL:-}" == "partial-skip-traefik-rm" ]]; then
    log "injected skip of Traefik file removal"
    return 0
  fi
  if ! cmp -s "$target" "$tmpl"; then
    log "ERROR refusing to delete Traefik file that no longer matches helper template: $target"
    return 1
  fi
  rm -f "$target"
  log "removed Traefik dynamic created by this run $target"
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

def norm(item):
    if isinstance(item, str):
        if "|" in item:
            name, cid = item.split("|", 1)
            return {"name": name, "id": cid}
        return {"name": item, "id": ""}
    if isinstance(item, dict) and item.get("name"):
        return {"name": item["name"], "id": item.get("id") or ""}
    return None

new_nets = [n for n in (norm(x) for x in sys.argv[3:]) if n]
prev = {}
try:
    with open(path) as f:
        prev = json.load(f)
except Exception:
    prev = {}
merged = []
seen = set()
for item in list(prev.get("networks_added") or []) + new_nets:
    rec = norm(item)
    if not rec or rec["name"] in seen:
        if rec and rec["name"] in seen and rec.get("id"):
            for m in merged:
                if m["name"] == rec["name"] and rec["id"]:
                    m["id"] = rec["id"]
        continue
    seen.add(rec["name"])
    merged.append(rec)
doc = {
    "schema": "woodright.public_production.apex_routing_owned.v1",
    "traefik_created_by_helper": bool(prev.get("traefik_created_by_helper")) or created,
    "networks_added": merged,
}
with open(path, "w") as f:
    json.dump(doc, f, indent=2)
    f.write("\n")
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

reconcile_owned_after_partial() {
  local traefik_removed="$1"
  shift
  local -a removed_nets=()
  if (($#)); then
    removed_nets=("$@")
  fi
  local owned
  owned="$(owned_state_path)"
  if [[ ! -f "$owned" ]]; then
    log "owned-state absent after partial rollback"
    return 0
  fi
  python3 - "$owned" "$EVIDENCE_DIR" "$traefik_removed" ${removed_nets[@]+"${removed_nets[@]}"} <<'PY'
import json, os, shutil, sys
owned_path = sys.argv[1]
evidence_dir = sys.argv[2]
traefik_removed = sys.argv[3] == "1"
removed_raw = [n for n in sys.argv[4:] if n]
removed_names = set()
for item in removed_raw:
    if "|" in item:
        removed_names.add(item.split("|", 1)[0])
    else:
        removed_names.add(item)

def rec_name(item):
    if isinstance(item, str):
        return item.split("|", 1)[0]
    if isinstance(item, dict):
        return item.get("name") or ""
    return ""

os.makedirs(evidence_dir, exist_ok=True)
with open(owned_path) as f:
    doc = json.load(f)
if traefik_removed:
    doc["traefik_created_by_helper"] = False
nets = [n for n in (doc.get("networks_added") or []) if rec_name(n) not in removed_names]
doc["networks_added"] = nets
if (not doc.get("traefik_created_by_helper")) and not nets:
    shutil.copy2(owned_path, os.path.join(evidence_dir, "owned-partial-cleared.json"))
    os.remove(owned_path)
    print("owned_cleared")
else:
    with open(owned_path, "w") as f:
        json.dump(doc, f, indent=2)
        f.write("\n")
    shutil.copy2(owned_path, os.path.join(evidence_dir, "owned-partial-remaining.json"))
    print("owned_updated")
PY
}

rollback_partial() {
  log "automatic rollback of this helper's Traefik/network writes"
  local created="$TRAEFIK_CREATED"
  local -a attempted=()
  local -a verified=()
  local name
  local traefik_removed=0
  local rc=0
  if ((${#NETWORKS_CONNECTED[@]})); then
    attempted=("${NETWORKS_CONNECTED[@]}")
  fi
  if [[ "$created" == "1" ]]; then
    remove_created_traefik || true
    if [[ ! -f "$(apex_traefik_file)" ]]; then
      traefik_removed=1
    else
      log "ERROR Traefik file still present after automatic rollback"
      rc=1
    fi
  fi
  for rec in "${attempted[@]+"${attempted[@]}"}"; do
    name="${rec%%|*}"
    expected_id="${rec#*|}"
    if [[ "$name" == "$expected_id" ]]; then
      expected_id=""
    fi
    if disconnect_one_idempotent "$name" "$DOKPLOY_NET" "$expected_id"; then
      verified+=("$rec")
    else
      log "ERROR network disconnect failed for $name; keeping owned-state"
      rc=1
    fi
  done
  NETWORKS_CONNECTED=()
  if [[ "$created" == "1" || ${#attempted[@]} -gt 0 ]]; then
    reconcile_owned_after_partial "$traefik_removed" ${verified[@]+"${verified[@]}"}
  fi
  if [[ "$rc" != "0" ]]; then
    log "STATUS PUBLIC_APEX_ROUTING_PARTIAL_ROLLBACK_INCOMPLETE"
  fi
  return "$rc"
}

on_err() {
  local rc=$?
  if [[ "${WOODRIGHT_APEX_IN_DIE_ROLLBACK:-0}" == "1" ]]; then
    exit "$rc"
  fi
  if [[ "$MUTATED" == "1" && "$MODE" == "execute" ]]; then
    if ! rollback_partial; then
      log "ERROR automatic rollback incomplete; owned-state retained for explicit retry"
    fi
    log "STATUS PUBLIC_APEX_ROUTING_ROLLED_BACK rc=$rc"
  fi
  exit "$rc"
}

apex_positive_int() {
  local raw="$1" default="$2"
  if [[ "$raw" =~ ^[1-9][0-9]*$ ]]; then
    printf '%s\n' "$raw"
  else
    printf '%s\n' "$default"
  fi
}

apex_nonneg_int() {
  local raw="$1" default="$2"
  if [[ "$raw" =~ ^[0-9]+$ ]]; then
    printf '%s\n' "$raw"
  else
    printf '%s\n' "$default"
  fi
}

apex_expected_https_origin() {
  case "$1" in
    woodright.ru|www.woodright.ru) printf 'https://woodright.ru' ;;
    api.woodright.ru) printf 'https://api.woodright.ru' ;;
    *) return 1 ;;
  esac
}

apex_location_matches() {
  local host="$1" loc="$2" exp
  loc="${loc//$'\r'/}"
  loc="${loc%%[[:space:]]*}"
  exp="$(apex_expected_https_origin "$host")" || return 1
  [[ -n "$loc" ]] || return 1
  [[ "$loc" == "$exp" || "$loc" == "$exp/" || "$loc" == "$exp/"* ]]
}

traefik_http_probe_one() {
  local host="$1" attempt="$2" out
  if [[ -n "${WOODRIGHT_APEX_TRAEFIK_HTTP_GET:-}" ]]; then
    out="$("${WOODRIGHT_APEX_TRAEFIK_HTTP_GET}" "$host" "$attempt" || true)"
    printf '%s\n' "$out"
    return 0
  fi
  out="$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 8 \
    --resolve "${host}:80:127.0.0.1" "http://${host}/" || true)"
  if [[ -z "$out" ]]; then
    printf '000\n'
    return 0
  fi
  printf '%s\n' "$out"
}

wait_traefik_http_converged() {
  local target timeout interval streak start now elapsed attempt consecutive
  local host raw code location class round_ok round_retry hard_reason file_exists
  local never_left_404=1 saw_5xx=0 saw_wrong_redirect=0 saw_connect=0
  target="$(apex_traefik_file)"
  timeout="$(apex_positive_int "${WOODRIGHT_APEX_TRAEFIK_SETTLE_TIMEOUT_SEC:-}" "$TRAEFIK_SETTLE_TIMEOUT_DEFAULT")"
  interval="$(apex_nonneg_int "${WOODRIGHT_APEX_TRAEFIK_SETTLE_INTERVAL_SEC:-}" "$TRAEFIK_SETTLE_INTERVAL_DEFAULT")"
  streak="$(apex_positive_int "${WOODRIGHT_APEX_TRAEFIK_SETTLE_REQUIRED_STREAK:-}" "$TRAEFIK_SETTLE_STREAK_DEFAULT")"
  start="$(date +%s)"
  attempt=0
  consecutive=0
  hard_reason=""
  log "Traefik settle start timeout=${timeout}s interval=${interval}s streak=${streak} file=$target"
  while true; do
    now="$(date +%s)"
    elapsed=$((now - start))
    attempt=$((attempt + 1))
    if [[ -f "$target" ]]; then
      file_exists=yes
    else
      die "Traefik dynamic file missing during settle: $target elapsed=${elapsed}s attempt=$attempt"
    fi
    round_ok=1
    round_retry=0
    for host in woodright.ru www.woodright.ru api.woodright.ru; do
      raw="$(traefik_http_probe_one "$host" "$attempt")"
      code="${raw%% *}"
      location="${raw#"$code"}"
      location="${location## }"
      location="${location//$'\r'/}"
      case "$code" in
        301|302|307|308)
          if apex_location_matches "$host" "$location"; then
            class=ok
            never_left_404=0
          else
            class=fail
            saw_wrong_redirect=1
            hard_reason="wrong_redirect host=$host status=$code location=$location"
          fi
          ;;
        404)
          class=retry
          round_retry=1
          ;;
        000|"")
          class=retry
          round_retry=1
          saw_connect=1
          code="${code:-000}"
          ;;
        5*)
          class=fail
          saw_5xx=1
          hard_reason="http_5xx host=$host status=$code"
          ;;
        *)
          class=fail
          hard_reason="unexpected_status host=$host status=$code location=$location"
          ;;
      esac
      log "Traefik settle attempt=$attempt elapsed=${elapsed}s host=$host status=$code expected=3xx-to-$(apex_expected_https_origin "$host") location=${location:-none} file=$file_exists class=$class"
      if [[ "$class" == "fail" ]]; then
        die "Traefik Host probe failed closed: $hard_reason (not a file-provider lag)"
      fi
      if [[ "$class" != "ok" ]]; then
        round_ok=0
      fi
    done
    if [[ "$round_ok" == "1" ]]; then
      consecutive=$((consecutive + 1))
      log "Traefik settle consecutive_ok=$consecutive/$streak attempt=$attempt elapsed=${elapsed}s"
      if ((consecutive >= streak)); then
        log "Traefik settle OK attempts=$attempt elapsed=${elapsed}s"
        return 0
      fi
    else
      consecutive=0
    fi
    now="$(date +%s)"
    elapsed=$((now - start))
    if ((elapsed >= timeout)); then
      die "Traefik file-provider convergence deadline ${timeout}s exceeded attempts=$attempt last_elapsed=${elapsed}s never_left_404=$never_left_404 saw_5xx=$saw_5xx saw_wrong_redirect=$saw_wrong_redirect saw_connect=$saw_connect retryable=${round_retry}"
    fi
    sleep "$interval"
  done
}

probe_loopback() {
  local sf_code be_code
  if [[ "${WOODRIGHT_APEX_SKIP_HTTP_PROBE:-0}" == "1" ]]; then
    log "HTTP probes skipped WOODRIGHT_APEX_SKIP_HTTP_PROBE=1"
    return 0
  fi
  if [[ "${WOODRIGHT_APEX_SKIP_LOOPBACK_PROBE:-0}" == "1" ]]; then
    log "loopback HTTP probes skipped WOODRIGHT_APEX_SKIP_LOOPBACK_PROBE=1"
  else
    sf_code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 -H 'Host: woodright.ru' http://127.0.0.1:3300/ || true)"
    be_code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 http://127.0.0.1:9300/health || true)"
    [[ "$sf_code" == "200" ]] || die "loopback storefront probe failed: $sf_code"
    [[ "$be_code" == "200" ]] || die "loopback backend health failed: $be_code"
    log "loopback probes OK sf=$sf_code be=$be_code"
  fi
  if [[ "${WOODRIGHT_APEX_SKIP_TRAEFIK_PROBE:-0}" == "1" ]]; then
    log "Traefik HTTP probes skipped"
    return 0
  fi
  # Dry-run (and execute before the helper writes its Traefik file) must not
  # treat the pre-existing Traefik 404 default as a launch defect.
  if [[ "$MODE" == "dry-run" ]]; then
    log "Traefik HTTP probes skipped in dry-run (helper-owned routers not installed yet)"
    return 0
  fi
  local target
  target="$(apex_traefik_file)"
  if [[ ! -f "$target" ]]; then
    log "Traefik HTTP probes skipped; dynamic file absent"
    return 0
  fi
  wait_traefik_http_converged
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
      preflight_owned_network_identities "$owned"
      python3 - "$owned" "$target" <<'PY'
import json, os, sys
owned_path, target = sys.argv[1:3]
owned = json.load(open(owned_path))
if owned.get("traefik_created_by_helper") and os.path.isfile(target):
    os.remove(target)
    print("removed_traefik", target)
else:
    print("preserved_traefik")
PY
      local rec name expected_id saw_first=0
      while IFS= read -r rec; do
        [[ -n "$rec" ]] || continue
        name="${rec%%$'\t'*}"
        expected_id="${rec#*$'\t'}"
        disconnect_one_idempotent "$name" "$DOKPLOY_NET" "$expected_id" || die "rollback network disconnect failed for $name"
        if [[ "${WOODRIGHT_APEX_INJECT_FAIL:-}" == "rollback-after-first-disconnect" && "$saw_first" == "0" ]]; then
          die "injected failure at rollback-after-first-disconnect"
        fi
        saw_first=1
      done < <(iter_owned_network_records "$owned")
      mv "$owned" "$EVIDENCE_DIR/owned-cleared.json"
    else
      log "no owned-state file; not deleting Traefik or disconnecting networks"
    fi
    cas_demo_untouched
    log "STATUS PUBLIC_APEX_ROUTING_ROLLBACK_OK"
    print_dns_operator_steps
    exit 0
  fi

  derive_accepted_authority
  cas_pair
  cas_recovery_point
  cas_dns_legacy
  cas_demo_untouched
  cas_traefik_absent_or_ours
  plan_network_membership
  write_routing_plan
  probe_loopback
  write_evidence_pre
  print_dns_operator_steps

  if [[ "$MODE" == "dry-run" ]]; then
    log "STATUS PUBLIC_APEX_ROUTING_DRY_RUN_OK"
    log "dry-run Docker/Traefik/DNS mutation=NO; evidence files written under $EVIDENCE_DIR"
    if [[ "$SOURCE_SHA" == "caf82b048b9caefae30679342aec3d4fc42a8d89" ]]; then
      log "STATUS PUBLIC_APEX_ROUTING_CAF82B0_DRY_RUN_PASS sha=${SOURCE_SHA:0:7}"
    fi
    echo "$EVIDENCE_DIR"
    exit 0
  fi

  [[ "$CONFIRM" == "$EXECUTE_CONFIRM_TOKEN" ]] || die "execute requires --confirm $EXECUTE_CONFIRM_TOKEN"
  read_approval "$APPROVAL_PATH"
  trap on_err ERR
  acquire_lock
  maybe_inject_fail after-lock-expected-drift
  derive_accepted_authority
  read_approval "$APPROVAL_PATH"
  cas_pair
  cas_recovery_point
  cas_dns_legacy
  cas_demo_untouched
  cas_traefik_absent_or_ours
  plan_network_membership
  connect_network "$SF_NAME" "$LIVE_SF_ID"
  write_owned_state
  maybe_inject_fail after-first-network
  connect_network "$BE_NAME" "$LIVE_BE_ID"
  write_owned_state
  maybe_inject_fail after-networks
  install_traefik
  write_owned_state
  maybe_inject_fail after-traefik
  maybe_inject_fail after-owned-replace-traefik
  cas_demo_untouched
  probe_loopback
  printf 'PUBLIC_APEX_ROUTING_PREPARE_OK\n' >"$EVIDENCE_DIR/status.txt"
  log "STATUS PUBLIC_APEX_ROUTING_PREPARE_OK (DNS still legacy; buyers unchanged)"
  echo "$EVIDENCE_DIR"
}

main "$@"
