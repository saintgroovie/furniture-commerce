#!/usr/bin/env bash
# LIVE_MUTATING=true
# requires_global_lock=true
# Durable flock recreate for woodright-staging-storefront (public_demo / staging only).
# Exact digest + RELEASE_SHA; preserves Dokploy ownership labels and dual networks.
# Canonical lock: /srv/woodright/locks/live-cutover.lock (nestable under pair orchestrator).
# Requires: --environment public_demo --component storefront|pair
set -Eeuo pipefail
IFS=$'\n\t'

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/woodright-environment-profile.sh
source "$HERE/../lib/woodright-environment-profile.sh"
# shellcheck source=../lib/woodright-staging-mutation-lock.sh
source "$HERE/../lib/woodright-staging-mutation-lock.sh"
# shellcheck source=../lib/woodright-validation-freeze.sh
source "$HERE/../lib/woodright-validation-freeze.sh"
# shellcheck source=../lib/woodright-cutover-common.sh
source "$HERE/../lib/woodright-cutover-common.sh"
# shellcheck source=../lib/woodright-component-authority.sh
source "$HERE/../lib/woodright-component-authority.sh"
# shellcheck source=../lib/woodright-oci-provenance.sh
source "$HERE/../lib/woodright-oci-provenance.sh"
# shellcheck source=../lib/woodright-host-publish.sh
source "$HERE/../lib/woodright-host-publish.sh"
# shellcheck source=../lib/woodright-owner-approved-release.sh
source "$HERE/../lib/woodright-owner-approved-release.sh"

MODE="execute"
CONFIRM=""
IMAGE=""
EXPECTED_DIGEST=""
TARGET_SHA=""
KEEP_NAME=""
ENV_FILE=""
EVIDENCE_DIR=""
HEALTH_TIMEOUT_SEC="${HEALTH_TIMEOUT_SEC:-180}"
SKIP_PUBLIC_VERIFY="${SKIP_PUBLIC_VERIFY:-0}"
REQUIRE_CURRENT_DIGEST="${REQUIRE_CURRENT_DIGEST:-1}"
PHASE=0
RECOVERING=0

usage() {
  cat <<'EOF'
Usage: recreate-staging-storefront.sh --environment public_demo --component storefront|pair --mode <mode> [options]

Modes: dry-run | preflight | execute | rollback | verify

Required:
  --environment public_demo
  --component storefront|pair

Required (dry-run|preflight|execute):
  --image ghcr.io/.../woodright-storefront@sha256:<64hex>
  --digest sha256:<64hex>
  --target-sha <40hex>
  --keep-name <keeper>
  --env-file <path mode 600>
  --evidence-dir <absolute path>

Execute also requires:
  --confirm-mutation I_UNDERSTAND_PUBLIC_DEMO_CUTOVER

Rollback: --keep-name --evidence-dir
Verify: --digest --target-sha
EOF
}

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $*"; exit 2; }

recover() {
  local rc=${1:-1}
  [[ "$RECOVERING" -eq 1 ]] && return "$rc"
  RECOVERING=1
  log "RECOVER begin phase=$PHASE rc=$rc"
  if [[ "$PHASE" -eq 1 ]]; then
    wr_cutover_docker start "$NAME" || log "recover_restart_failed"
  elif [[ "$PHASE" -eq 2 ]]; then
    bash "$HERE/rollback-staging-storefront-from-keeper.sh" \
      --environment public_demo --keep-name "$KEEP_NAME" --evidence-dir "${EVIDENCE_DIR}" \
      || log "AUTO_ROLLBACK_FAILED"
  fi
  RECOVERING=0
  return "$rc"
}

on_err() {
  local rc=$?
  recover "$rc" || true
  exit "$rc"
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --help|-h) usage; exit 0 ;;
      --environment) shift; shift || true ;;
      --environment=*) shift ;;
      --component) shift; shift || true ;;
      --component=*) shift ;;
      --mode) MODE="${2:?}"; shift 2 ;;
      --mode=*) MODE="${1#--mode=}"; shift ;;
      --image) IMAGE="${2:?}"; shift 2 ;;
      --image=*) IMAGE="${1#--image=}"; shift ;;
      --digest) EXPECTED_DIGEST="${2:?}"; shift 2 ;;
      --digest=*) EXPECTED_DIGEST="${1#--digest=}"; shift ;;
      --target-sha) TARGET_SHA="${2:?}"; shift 2 ;;
      --target-sha=*) TARGET_SHA="${1#--target-sha=}"; shift ;;
      --keep-name) KEEP_NAME="${2:?}"; shift 2 ;;
      --keep-name=*) KEEP_NAME="${1#--keep-name=}"; shift ;;
      --env-file) ENV_FILE="${2:?}"; shift 2 ;;
      --env-file=*) ENV_FILE="${1#--env-file=}"; shift ;;
      --evidence-dir) EVIDENCE_DIR="${2:?}"; shift 2 ;;
      --evidence-dir=*) EVIDENCE_DIR="${1#--evidence-dir=}"; shift ;;
      --confirm-mutation) CONFIRM="${2:?}"; shift 2 ;;
      --confirm-mutation=*) CONFIRM="${1#--confirm-mutation=}"; shift ;;
      --health-timeout-sec) HEALTH_TIMEOUT_SEC="${2:?}"; shift 2 ;;
      *) shift ;;
    esac
  done
}

save_restore_manifest() {
  local out="$1"
  local bin="${WOODRIGHT_DOCKER_BIN:-docker}"
  local tmp
  tmp="$(mktemp)"
  "$bin" inspect "$NAME" >"$tmp"
  wr_cutover_sanitize_inspect_json <"$tmp" >"$EVIDENCE_DIR/sanitized/storefront-inspect-before.json"
  # Build restore manifest from sanitized inspect only (no secret env values persisted).
  python3 - "$EVIDENCE_DIR/sanitized/storefront-inspect-before.json" "$out" <<'PYI'
import json, sys
src, out = sys.argv[1], sys.argv[2]
data = json.load(open(src))
obj = data[0] if isinstance(data, list) else data
cfg = obj.get("Config") or {}
hc = obj.get("HostConfig") or {}
ns = obj.get("NetworkSettings") or {}
networks = ns.get("Networks") or {}
net_list = []
for net, meta in networks.items():
    net_list.append({
        "name": net,
        "aliases": (meta or {}).get("Aliases") or [],
    })
env_keys = []
for e in cfg.get("Env") or []:
    if isinstance(e, str) and "=" in e:
        env_keys.append(e.split("=", 1)[0])
    elif isinstance(e, str) and e.endswith("=***"):
        env_keys.append(e[:-4])
manifest = {
    "container_name": obj.get("Name", "").lstrip("/"),
    "id": obj.get("Id"),
    "image": cfg.get("Image"),
    "image_id": obj.get("Image"),
    "labels": cfg.get("Labels") or {},
    "cmd": cfg.get("Cmd"),
    "entrypoint": cfg.get("Entrypoint"),
    "workdir": cfg.get("WorkingDir"),
    "user": cfg.get("User"),
    "env_keys": env_keys,
    "restart_policy": (hc.get("RestartPolicy") or {}).get("Name"),
    "healthcheck": cfg.get("Healthcheck"),
    "mounts": obj.get("Mounts") or [],
    "networks": net_list,
}
json.dump(manifest, open(out, "w"), indent=2, sort_keys=True)
PYI
  rm -f "$tmp"
  wr_cutover_assert_no_secret_leak "$EVIDENCE_DIR/sanitized/storefront-inspect-before.json" || return 1
  wr_cutover_assert_no_secret_leak "$out" || return 1
}


create_storefront() {
  local image="$1"
  local db_identity_alias
  db_identity_alias="$(wr_canonical_db_identity_label)" || die "canonical DB identity unavailable"
  [[ "$db_identity_alias" == "public_demo_db" ]] || die "public_demo storefront requires database-identity=public_demo_db (got '$db_identity_alias')"
  if [[ -n "${EVIDENCE_DIR:-}" ]]; then
    mkdir -p "$EVIDENCE_DIR/json"
    printf '{"database_connection_name":"%s","database_identity_alias":"%s"}\n' \
      "${WOODRIGHT_DATABASE_CONNECTION_NAME:-}" "$db_identity_alias" \
      >"$EVIDENCE_DIR/json/database-identity-plan.json"
  fi
  log "PLANNED database_identity_alias=$db_identity_alias database_connection_name=${WOODRIGHT_DATABASE_CONNECTION_NAME:-none}"
  local -a create_args=(
    --name "$NAME"
    --restart unless-stopped
    --network "$NET_STACK"
    --network-alias storefront
    --label "com.woodright.deployment-owner=Dokploy"
    --label "com.woodright.runtime-role=public_demo"
    --label "com.woodright.exposure=public"
    --label "com.woodright.release-sha=${TARGET_SHA}"
    --label "com.woodright.database-identity=${db_identity_alias}"
    --env-file "$ENV_FILE"
    --health-cmd="node -e \"fetch('http://127.0.0.1:3002/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""
    --health-interval=30s
    --health-timeout=5s
    --health-retries=5
    --health-start-period=40s
    "$image"
  )
  wr_hp_refuse_publish_flags "${create_args[@]}" || return 1
  wr_cutover_docker create "${create_args[@]}"
  wr_cutover_docker network connect "$NET_DOKPLOY" "$NAME"
}

wait_healthy() {
  local deadline=$((SECONDS + HEALTH_TIMEOUT_SEC))
  local st
  while ((SECONDS < deadline)); do
    st="$(wr_cutover_docker inspect "$NAME" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}')"
    log "health status=$st"
    [[ "$st" == "healthy" ]] && return 0
    [[ "$st" == "exited" ]] && return 1
    sleep 5
  done
  return 1
}

verify_public_identity() {
  [[ "$SKIP_PUBLIC_VERIFY" == "1" ]] && return 0
  local host="${WOODRIGHT_BUYER_HOST%/}"
  local hdrs
  hdrs="$(curl -sS --max-time 20 -D - -o /dev/null "${host}/" || true)"
  printf '%s\n' "$hdrs" >"$EVIDENCE_DIR/raw/storefront-public-headers.txt"
  echo "$hdrs" | grep -qi "x-woodright-release-sha: ${TARGET_SHA}" || return 1
  echo "$hdrs" | grep -qi "x-woodright-runtime-role: public_demo" || return 1
  echo "$hdrs" | grep -qi "x-robots-tag:.*noindex" || return 1
}

run_rollback() {
  [[ -n "$KEEP_NAME" && -n "$EVIDENCE_DIR" ]] || die "rollback requires --keep-name and --evidence-dir"
  bash "$HERE/rollback-staging-storefront-from-keeper.sh" \
    --environment public_demo --keep-name "$KEEP_NAME" --evidence-dir "$EVIDENCE_DIR"
}

run_verify() {
  wr_cutover_require_digest "$EXPECTED_DIGEST" || exit 2
  wr_cutover_require_full_sha "$TARGET_SHA" || exit 2
  local digests role
  digests="$(wr_cutover_container_immutable_digest "$NAME" storefront)" || die "live digest resolve failed for $NAME"
  [[ "$digests" == "$EXPECTED_DIGEST" ]] || die "live digest mismatch for $NAME have=$digests want=$EXPECTED_DIGEST"
  role="$(wr_cutover_docker inspect "$NAME" --format '{{index .Config.Labels "com.woodright.runtime-role"}}')"
  [[ "$role" == "public_demo" ]] || die "runtime-role want public_demo have=$role"
  if [[ -z "$EVIDENCE_DIR" ]]; then
    EVIDENCE_DIR="$(mktemp -d /tmp/wr-sf-verify-XXXXXX)"
  fi
  wr_cutover_evidence_init "$EVIDENCE_DIR" "storefront-verify" || true
  verify_public_identity || die "public identity verify failed"
  log "VERIFY_OK name=$NAME digest=$EXPECTED_DIGEST sha=$TARGET_SHA"
}

FULL_ARGV=("$@")
wr_require_environment_from_args "${FULL_ARGV[@]}" || exit 1
[[ "${WOODRIGHT_ENVIRONMENT}" == "public_demo" ]] || die "only --environment public_demo allowed"
wr_assert_environment_provisioned || exit 1
wr_require_canonical_db_identity || exit 1
wr_hp_require_policy || die "host_publish_policy"
wr_hp_assert_planned_deny >/dev/null || die "HOST_PUBLISH_PLANNED_DENY_FAILED"
wr_require_component_from_args "${FULL_ARGV[@]}" || die "missing required --component <storefront|pair>"
[[ "${WOODRIGHT_COMPONENT_SCOPE}" == "storefront" || "${WOODRIGHT_COMPONENT_SCOPE}" == "pair" ]] \
  || die "storefront recreate requires --component storefront|pair"
wr_validation_freeze_assert_clear_for_mutation "$WOODRIGHT_ENVIRONMENT" || exit 1
wr_prelock_validate_environment_target || exit 1
parse_args "${FULL_ARGV[@]}"

NAME="${WOODRIGHT_SF_CONTAINER_DEFAULT}"
NET_STACK="${WOODRIGHT_NET_STACK}"
NET_DOKPLOY="${WOODRIGHT_NET_DOKPLOY:-dokploy-network}"
wr_cutover_refuse_production_name "$NAME" || exit 2

case "$MODE" in
  dry-run|preflight|execute|rollback|verify) ;;
  *) die "invalid --mode=$MODE" ;;
esac

case "$MODE" in
  rollback) run_rollback; exit $? ;;
  verify) run_verify; exit $? ;;
esac

[[ -n "$IMAGE" && -n "$EXPECTED_DIGEST" && -n "$TARGET_SHA" && -n "$KEEP_NAME" && -n "$ENV_FILE" && -n "$EVIDENCE_DIR" ]] \
  || die "missing required args for mode=$MODE"
wr_cutover_require_full_sha "$TARGET_SHA" || exit 2
wr_cutover_require_digest "$EXPECTED_DIGEST" || exit 2
# Gate A — before image inspect/pull planning. Peer BE digest optional for SF-only.
_oa_be="${WOODRIGHT_OWNER_APPROVAL_PEER_BE_DIGEST:-${EXPECTED_BACKEND_DIGEST:-${WOODRIGHT_FROZEN_BACKEND_DIGEST:-}}}"
OWNER_APPROVAL_CHECKSUM_GATE_A=""
if ! wr_require_owner_approved_release \
  "$WOODRIGHT_ENVIRONMENT" "$TARGET_SHA" "${_oa_be}" "$EXPECTED_DIGEST" "$EVIDENCE_DIR" "gate_a_storefront"; then
  die "OWNER_APPROVAL_DENIED result=${WR_OWNER_APPROVAL_RESULT:-unknown} (storefront recreate)"
fi
OWNER_APPROVAL_CHECKSUM_GATE_A="${WR_OA_CHECKSUM:-}"
unset _oa_be
wr_cutover_require_image_at_digest "$IMAGE" "$EXPECTED_DIGEST" || exit 2
wr_cutover_refuse_production_name "$KEEP_NAME" || exit 2
[[ "$KEEP_NAME" != "$NAME" ]] || die "KEEP_NAME must differ from live name"
[[ -f "$ENV_FILE" ]] || die "missing ENV_FILE=$ENV_FILE"
env_mode="$(stat -c '%a' "$ENV_FILE" 2>/dev/null || stat -f '%Lp' "$ENV_FILE")"
[[ "$env_mode" == "600" || "$env_mode" == "0600" ]] || die "ENV_FILE mode must be 600 (have $env_mode)"
log "env_file_path=$ENV_FILE mode=$env_mode (contents not logged)"

wr_cutover_evidence_init "$EVIDENCE_DIR" "storefront-$MODE" || exit 2

if wr_cutover_docker image inspect "$IMAGE" >/dev/null 2>&1; then
  wr_assert_component_provenance "$IMAGE" "$TARGET_SHA" "$EXPECTED_DIGEST" || die "OCI_PROVENANCE_FAILED"
  wr_cutover_assert_image_revision "$IMAGE" "$TARGET_SHA" || exit 2
  RESOLVED_ID="$(wr_cutover_docker image inspect "$IMAGE" --format '{{.Id}}')"
else
  [[ "$MODE" != "execute" ]] || die "image ref not local: $IMAGE"
  [[ "${WOODRIGHT_ALLOW_MISSING_LOCAL_IMAGE:-0}" == "1" ]] || die "image not local"
  RESOLVED_ID="missing-local"
fi

wr_cutover_docker network inspect "$NET_STACK" >/dev/null || die "missing network $NET_STACK"
wr_cutover_docker network inspect "$NET_DOKPLOY" >/dev/null || die "missing network $NET_DOKPLOY"
wr_cutover_docker inspect "$NAME" >/dev/null || die "live container missing: $NAME"
wr_assert_container_matches_environment "$NAME" storefront || die "storefront container environment mismatch"

# Storefront-only: freeze backend peer before any mutation planning.
if [[ "${WOODRIGHT_COMPONENT_SCOPE}" == "storefront" ]]; then
  wr_freeze_peer_digest backend "${WOODRIGHT_BE_CONTAINER_DEFAULT}" || die "cannot freeze backend peer"
  printf '%s\n' "${WOODRIGHT_FROZEN_BACKEND_DIGEST}" >"$EVIDENCE_DIR/json/frozen-backend-digest.txt"
fi

if [[ "$MODE" == "dry-run" || "$MODE" == "preflight" ]]; then
  log "PLANNED stop/rename/create/start name=$NAME image=$IMAGE keep=$KEEP_NAME sha=$TARGET_SHA component=${WOODRIGHT_COMPONENT_SCOPE}"
  log "PLANNED nets=$NET_STACK+$NET_DOKPLOY alias=storefront owner=Dokploy role=public_demo"
  if [[ "${WOODRIGHT_COMPONENT_SCOPE}" == "storefront" ]]; then
    log "PLANNED backend_frozen=${WOODRIGHT_FROZEN_BACKEND_DIGEST}"
  fi
  log "DRY_RUN_OR_PREFLIGHT_OK mode=$MODE (no mutation)"
  exit 0
fi

wr_cutover_require_confirm "$CONFIRM" || exit 2
trap on_err ERR

wr_staging_mutation_lock_acquire \
  "actor=recreate-staging-storefront" \
  "command=$0 --environment $WOODRIGHT_ENVIRONMENT --component $WOODRIGHT_COMPONENT_SCOPE" \
  "target=$EXPECTED_DIGEST" \
  || die "canonical live-cutover.lock busy/unavailable"
log "flock_acquired_or_inherited lock=$WR_STAGING_MUTATION_LOCK_PATH"
_oa_be="${WOODRIGHT_OWNER_APPROVAL_PEER_BE_DIGEST:-${EXPECTED_BACKEND_DIGEST:-${WOODRIGHT_FROZEN_BACKEND_DIGEST:-}}}"
if ! wr_require_owner_approved_release_under_lock \
  "$WOODRIGHT_ENVIRONMENT" "$TARGET_SHA" "${_oa_be}" "$EXPECTED_DIGEST" \
  "$EVIDENCE_DIR" "$OWNER_APPROVAL_CHECKSUM_GATE_A"; then
  die "OWNER_APPROVAL_DENIED result=${WR_OWNER_APPROVAL_RESULT:-unknown} (storefront gate_b)"
fi
unset _oa_be
wr_validation_freeze_assert_clear_for_mutation "$WOODRIGHT_ENVIRONMENT" || die "validation freeze active"
wr_prelock_validate_environment_target || die "under-lock environment retarget detected"
wr_assert_container_matches_environment "$NAME" storefront || die "under-lock storefront retarget"

if [[ "${WOODRIGHT_COMPONENT_SCOPE}" == "storefront" ]]; then
  wr_assert_peer_unchanged backend "${WOODRIGHT_BE_CONTAINER_DEFAULT}" || die "backend peer changed before storefront mutation"
fi

if wr_cutover_docker inspect "$KEEP_NAME" >/dev/null 2>&1; then
  die "keeper already exists: $KEEP_NAME"
fi
CUR_IMG="$(wr_cutover_docker inspect "$NAME" --format '{{.Image}}')"
if [[ "$REQUIRE_CURRENT_DIGEST" == "1" && "$RESOLVED_ID" != "missing-local" && "$CUR_IMG" != "$RESOLVED_ID" ]]; then
  die "live image id mismatch (set REQUIRE_CURRENT_DIGEST=0 for digest-advance)"
fi

save_restore_manifest "$EVIDENCE_DIR/json/storefront-restore-manifest.json" || die "manifest save failed"
printf '{"path":"%s","mode":"%s"}\n' "$ENV_FILE" "$env_mode" >"$EVIDENCE_DIR/json/env-file-meta.json"

wr_cutover_docker stop "$NAME"
PHASE=1
log "stopped_live $NAME"
wr_cutover_docker rename "$NAME" "$KEEP_NAME"
PHASE=2
log "renamed_to_keeper $KEEP_NAME"

create_storefront "$IMAGE"
wr_cutover_docker start "$NAME"
NEW_IMG="$(wr_cutover_docker inspect "$NAME" --format '{{.Image}}')"
[[ "$NEW_IMG" == "$RESOLVED_ID" ]] || die "new image id mismatch"
wait_healthy || die "not healthy after wait"
# Fail-closed: created container must carry canonical governance DB alias.
wr_assert_container_matches_environment "$NAME" storefront \
  || die "post-create storefront environment/DB-identity gate failed (keeper=$KEEP_NAME)"
verify_public_identity || die "public identity failed after recreate"
if [[ "${WOODRIGHT_COMPONENT_SCOPE}" == "storefront" ]]; then
  wr_assert_peer_unchanged backend "${WOODRIGHT_BE_CONTAINER_DEFAULT}" || die "backend peer changed during storefront-only"
fi

trap - ERR
PHASE=0
wr_cutover_docker inspect "$NAME" | wr_cutover_sanitize_inspect_json \
  >"$EVIDENCE_DIR/sanitized/storefront-inspect-after.json"
log "CREATED name=$NAME image=$IMAGE keeper=$KEEP_NAME sha=$TARGET_SHA component=${WOODRIGHT_COMPONENT_SCOPE}"
