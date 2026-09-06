#!/usr/bin/env bash
# LIVE_MUTATING=true
# requires_global_lock=true
#
# Identity-preserving public_production storefront owner-env reconcile.
# Injects already-recorded owner legal keys into the live Dokploy compose
# interpolation so a same-image / same-SHA storefront recreate can see them.
#
# This is NOT:
#   - DNS / ITB / TTL mutation
#   - Traefik YAML write
#   - pair cutover / image pin change / SHA change
#   - backend recreate
#   - public_demo or production_candidate mutation
#   - notification runtime inject (monitor/profile only)
#   - payment env mutate (monitor/profile already accepted_manual)
#   - docker restart as a substitute (restart does not inject changed env)
#
# Dry-run (default): read-only. No lock. No compose write. No recreate.
# Execute: requires --confirm-mutation I_UNDERSTAND_PUBLIC_PRODUCTION_OWNER_ENV_RECONCILE
#          under /srv/woodright/locks/public_production/live-cutover.lock.
#
# Operator: docs/operator/public-production-owner-env-reconcile.md
# Fidelity: scripts/release/reconcile-public-production-owner-env.fidelity.test.cjs
set -Eeuo pipefail
IFS=$'\n\t'

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
# shellcheck source=../lib/woodright-environment-profile.sh
source "$HERE/../lib/woodright-environment-profile.sh"
# shellcheck source=../lib/woodright-compose-env-authority.sh
source "$HERE/../lib/woodright-compose-env-authority.sh"
# shellcheck source=../lib/woodright-compose-service-recreate.sh
source "$HERE/../lib/woodright-compose-service-recreate.sh"
# shellcheck source=../lib/woodright-staging-mutation-lock.sh
source "$HERE/../lib/woodright-staging-mutation-lock.sh"

EXECUTE_CONFIRM_TOKEN="I_UNDERSTAND_PUBLIC_PRODUCTION_OWNER_ENV_RECONCILE"
CANONICAL_LOCK_PATH="/srv/woodright/locks/public_production/live-cutover.lock"
PLANNER="$HERE/../lib/woodright-public-production-owner-env.py"
TARGET_LEGAL_STATUS="approved"
TARGET_PACK_TOKEN="OWNER_LEGAL_CONTENT_APPROVED"
TRAEFIK_FILE_DEFAULT="/etc/dokploy/traefik/dynamic/woodright-public-production.yml"
OWNER_ENV_LIVE_JSON=""
OWNER_ENV_PLAN_JSON=""
OWNER_ENV_PACKET=""
OWNER_ENV_LOCK_HELD=0

cleanup_owner_env_tmps() {
  rm -f "${OWNER_ENV_LIVE_JSON:-}" "${OWNER_ENV_PLAN_JSON:-}" "${OWNER_ENV_PACKET:-}"
  if [[ "${OWNER_ENV_LOCK_HELD:-0}" == "1" ]]; then
    wr_staging_mutation_lock_release || true
    OWNER_ENV_LOCK_HELD=0
  fi
}
trap cleanup_owner_env_tmps EXIT

MODE="dry-run"
MODE_REQUESTS=""
CONFIRM=""
COMPONENT=""
HARNESS=0

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() { log "ERROR: $*"; exit 2; }

usage() {
  cat <<'EOF'
Usage: reconcile-public-production-owner-env.sh --environment public_production --component storefront [options]

Required:
  --environment public_production
  --component storefront

Optional:
  --mode dry-run|execute   (default dry-run; --dry-run / --execute also accepted)
  --confirm-mutation <token>
      execute only: I_UNDERSTAND_PUBLIC_PRODUCTION_OWNER_ENV_RECONCILE

Dry-run: read-only CAS + plan. No lock, no compose write, no recreate, no DNS.
Execute: acquire public_production live-cutover.lock BEFORE inspect/plan, then
         same-image storefront recreate only; reconnect dokploy-network alias
         if Compose drops it; restore previous compose YAML + .env + recreate
         on failure, with rollback yaml/env hashes verified.

Exit: 0 ok | 2 validation | 3 lock
EOF
}

record_mode_request() {
  case "$MODE_REQUESTS" in
    *"|$1|"*) return 0 ;;
  esac
  MODE_REQUESTS="${MODE_REQUESTS}|$1|"
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --help|-h) usage; exit 0 ;;
      --environment) shift 2 ;;
      --environment=*) shift ;;
      --component) COMPONENT="${2:?}"; shift 2 ;;
      --component=*) COMPONENT="${1#--component=}"; shift ;;
      --mode) MODE="${2:?}"; record_mode_request "$MODE"; shift 2 ;;
      --mode=*) MODE="${1#--mode=}"; record_mode_request "$MODE"; shift ;;
      --dry-run) MODE="dry-run"; record_mode_request dry-run; shift ;;
      --execute) MODE="execute"; record_mode_request execute; shift ;;
      --confirm-mutation) CONFIRM="${2:?}"; shift 2 ;;
      --confirm-mutation=*) CONFIRM="${1#--confirm-mutation=}"; shift ;;
      *) die "unknown arg $1" ;;
    esac
  done
}

harness_enabled() {
  [[ "${WOODRIGHT_OWNER_ENV_HARNESS:-0}" == "1" ]]
}

assert_lock_path() {
  local path="${WOODRIGHT_MUTATION_LOCK_PATH:-$CANONICAL_LOCK_PATH}"
  case "$path" in
    */locks/public_production/live-cutover.lock) ;;
    *) die "refused lock path '$path' (must end in /locks/public_production/live-cutover.lock)" ;;
  esac
}

sha256_file() {
  local path="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$path" | awk '{print $1}'
  else
    shasum -a 256 "$path" | awk '{print $1}'
  fi
}

env_map_to_json() {
  python3 - "$1" <<'PY'
import json, sys
path = sys.argv[1]
out = {}
for raw in open(path, encoding="utf-8"):
    line = raw.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    out[k] = v
json.dump(out, sys.stdout)
PY
}

container_env_json() {
  local name="$1"
  docker inspect --format '{{json .Config.Env}}' "$name" | python3 -c '
import json, sys
arr = json.load(sys.stdin)
out = {}
for item in arr:
    if "=" not in item:
        continue
    k, v = item.split("=", 1)
    out[k] = v
json.dump(out, sys.stdout)
'
}

container_id() {
  docker inspect --format '{{.Id}}' "$1"
}

container_digest() {
  local name="$1" img digests
  img="$(docker inspect --format '{{.Image}}' "$name")"
  digests="$(docker image inspect "$img" --format '{{range .RepoDigests}}{{println .}}{{end}}' 2>/dev/null || true)"
  python3 - "$img" "$digests" <<'PY'
import sys
img, digests = sys.argv[1], sys.argv[2]
for line in digests.splitlines():
    if "@sha256:" in line:
        print("sha256:" + line.split("@sha256:", 1)[1].strip())
        raise SystemExit(0)
if img.startswith("sha256:"):
    print(img)
    raise SystemExit(0)
print("")
PY
}

container_on_network() {
  local name="$1" net="$2"
  docker inspect --format '{{json .NetworkSettings.Networks}}' "$name" \
    | python3 -c 'import json,sys; nets=json.load(sys.stdin); raise SystemExit(0 if sys.argv[1] in nets else 1)' "$net"
}

network_aliases() {
  local name="$1" net="$2"
  docker inspect --format '{{json .NetworkSettings.Networks}}' "$name" \
    | python3 -c 'import json,sys; nets=json.load(sys.stdin); n=nets.get(sys.argv[1]) or {}; print(" ".join(n.get("Aliases") or []))' "$net"
}

atomic_install_file() {
  local src="${1:?}" dest="${2:?}"
  local dir published
  dir="$(dirname "$dest")"
  published="${dest}.wr-owner-env-$$"
  if [[ -d "$dir" && -w "$dir" ]]; then
    cp -p "$src" "$published" || return 1
    mv -f "$published" "$dest" || { rm -f "$published"; return 1; }
    return 0
  fi
  if command -v sudo >/dev/null 2>&1; then
    sudo -n cp -p "$src" "$published" || return 1
    sudo -n mv -f "$published" "$dest" || { sudo -n rm -f "$published" 2>/dev/null || true; return 1; }
    return 0
  fi
  log "cannot atomically install $src -> $dest"
  return 1
}

wr_compose_up_impl() {
  local service="$1"
  shift
  docker compose -f "${WOODRIGHT_COMPOSE_FILE}" --env-file "${WOODRIGHT_COMPOSE_ENV_FILE}" \
    --project-name "${WOODRIGHT_COMPOSE_PROJECT}" up -d --no-deps "$@" "$service"
}

reconnect_dokploy() {
  local name="$1" expected_id="$2" alias_want="$3"
  if container_on_network "$name" "${WOODRIGHT_NET_DOKPLOY}"; then
    log "dokploy-network already on $name"
    return 0
  fi
  docker network connect --alias "$alias_want" "${WOODRIGHT_NET_DOKPLOY}" "$expected_id"
  log "connected $name to ${WOODRIGHT_NET_DOKPLOY} alias=$alias_want"
}

emit_packet() {
  python3 - "$1" <<'PY'
import json, sys
print(json.dumps(json.load(open(sys.argv[1])), indent=2, ensure_ascii=False))
PY
}

assert_identity() {
  local role="$1" db="$2" when="$3"
  local want_role="${WOODRIGHT_REQUIRED_RUNTIME_ROLE:-public_production}"
  local want_db="${WOODRIGHT_REQUIRED_DB_ALIAS:-public_production_db}"
  if [[ "$role" != "$want_role" ]]; then
    log "ERROR: $when role mismatch have='$role' want='$want_role'"
    return 1
  fi
  if [[ "$db" != "$want_db" ]]; then
    log "ERROR: $when db mismatch have='$db' want='$want_db'"
    return 1
  fi
  return 0
}

acquire_execute_lock() {
  WR_STAGING_MUTATION_LOCK_PATH="${WOODRIGHT_MUTATION_LOCK_PATH:-$CANONICAL_LOCK_PATH}"
  WR_STAGING_MUTATION_LOCK_DIR="$(dirname "$WR_STAGING_MUTATION_LOCK_PATH")"
  WR_STAGING_MUTATION_LOCK_META="${WR_STAGING_MUTATION_LOCK_PATH}.meta"
  if [[ "$HARNESS" -eq 1 ]]; then
    export WR_STAGING_MUTATION_LOCK_ALLOW_NONCANONICAL=1
  fi
  wr_staging_mutation_lock_acquire \
    actor=reconcile-public-production-owner-env \
    command=reconcile-public-production-owner-env.sh \
    target=storefront \
    || { log "ERROR: lock busy"; exit 3; }
  OWNER_ENV_LOCK_HELD=1
}

main() {
  parse_args "$@"
  local lock_override="${WOODRIGHT_OWNER_ENV_LOCK_PATH:-}"
  wr_require_environment_from_args "$@" || die "environment required"
  [[ "${WOODRIGHT_ENVIRONMENT}" == "public_production" ]] \
    || die "refused environment=${WOODRIGHT_ENVIRONMENT} (only public_production)"
  [[ "$COMPONENT" == "storefront" ]] || die "refused --component '${COMPONENT}' (only storefront)"
  case "$MODE" in
    dry-run|execute) ;;
    *) die "invalid --mode $MODE" ;;
  esac
  [[ -f "$PLANNER" ]] || die "missing planner $PLANNER"
  if [[ -n "$lock_override" ]]; then
    WOODRIGHT_MUTATION_LOCK_PATH="$lock_override"
  fi
  assert_lock_path

  if [[ "$MODE" == "execute" ]]; then
    [[ "$CONFIRM" == "$EXECUTE_CONFIRM_TOKEN" ]] \
      || die "execute requires --confirm-mutation $EXECUTE_CONFIRM_TOKEN"
  fi

  if harness_enabled; then
    HARNESS=1
    [[ -n "${WOODRIGHT_OWNER_ENV_FIXTURE_DIR:-}" ]] || die "harness requires WOODRIGHT_OWNER_ENV_FIXTURE_DIR"
    if [[ "$MODE" == "execute" && "${WOODRIGHT_OWNER_ENV_HARNESS_EXECUTE:-0}" != "1" ]]; then
      die "harness execute requires WOODRIGHT_OWNER_ENV_HARNESS_EXECUTE=1"
    fi
  elif [[ "$MODE" == "execute" ]]; then
    wr_assert_environment_provisioned || die "unprovisioned"
  fi

  local compose_yml compose_env traefik_file sf_name be_name
  if [[ "$HARNESS" -eq 1 ]]; then
    compose_yml="${WOODRIGHT_OWNER_ENV_FIXTURE_DIR}/docker-compose.yml"
    compose_env="${WOODRIGHT_OWNER_ENV_FIXTURE_DIR}/.env"
    traefik_file="${WOODRIGHT_OWNER_ENV_FIXTURE_DIR}/traefik.yml"
    sf_name="woodright-public-production-storefront"
    be_name="woodright-public-production-backend"
  else
    wr_assert_environment_provisioned || die "unprovisioned"
    compose_yml="${WOODRIGHT_COMPOSE_FILE}"
    compose_env="${WOODRIGHT_COMPOSE_ENV_FILE}"
    traefik_file="${WOODRIGHT_PUBLIC_TRAEFIK_FILE:-$TRAEFIK_FILE_DEFAULT}"
    sf_name="${WOODRIGHT_SF_CONTAINER_DEFAULT}"
    be_name="${WOODRIGHT_BE_CONTAINER_DEFAULT}"
  fi
  [[ -f "$compose_yml" ]] || die "missing compose yaml $compose_yml"
  [[ -f "$compose_env" ]] || die "missing compose env $compose_env"

  if [[ "$MODE" == "execute" ]]; then
    acquire_execute_lock
  fi

  OWNER_ENV_LIVE_JSON="$(mktemp)"

  local sf_id be_id sf_digest be_digest sf_role sf_db dokploy_attached compose_attached aliases traefik_hash
  if [[ "$HARNESS" -eq 1 ]]; then
    cp "${WOODRIGHT_OWNER_ENV_FIXTURE_DIR}/live.json" "$OWNER_ENV_LIVE_JSON"
    sf_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("id",""))' "$OWNER_ENV_LIVE_JSON")"
    be_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("backend_id",""))' "$OWNER_ENV_LIVE_JSON")"
    sf_digest="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("digest",""))' "$OWNER_ENV_LIVE_JSON")"
    be_digest="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("backend_digest",""))' "$OWNER_ENV_LIVE_JSON")"
    sf_role="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("role",""))' "$OWNER_ENV_LIVE_JSON")"
    sf_db="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("db",""))' "$OWNER_ENV_LIVE_JSON")"
    traefik_hash="$(sha256_file "$traefik_file")"
  else
    docker inspect "$sf_name" >/dev/null 2>&1 || die "storefront missing: $sf_name"
    docker inspect "$be_name" >/dev/null 2>&1 || die "backend missing: $be_name"
    sf_id="$(container_id "$sf_name")"
    be_id="$(container_id "$be_name")"
    sf_digest="$(container_digest "$sf_name")"
    be_digest="$(container_digest "$be_name")"
    sf_role="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$sf_name" | awk -F= '$1=="WOODRIGHT_RUNTIME_ROLE"{print $2; exit}')"
    sf_db="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$sf_name" | awk -F= '$1=="WOODRIGHT_DATABASE_IDENTITY_ALIAS"{print $2; exit}')"
    [[ -z "$sf_db" ]] && sf_db="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$sf_name" | awk -F= '$1=="WOODRIGHT_DATABASE_IDENTITY"{print $2; exit}')"
    dokploy_attached=false
    compose_attached=false
    container_on_network "$sf_name" "${WOODRIGHT_NET_DOKPLOY}" && dokploy_attached=true
    container_on_network "$sf_name" "${WOODRIGHT_NET_STACK}" && compose_attached=true
    aliases="$(network_aliases "$sf_name" "${WOODRIGHT_NET_DOKPLOY}")"
    traefik_hash="$(sha256_file "$traefik_file")"
    local env_json
    env_json="$(mktemp)"
    container_env_json "$sf_name" >"$env_json"
    python3 "$PLANNER" assemble-live \
      --env-json "$env_json" \
      --out "$OWNER_ENV_LIVE_JSON" \
      --id "$sf_id" \
      --digest "$sf_digest" \
      --role "$sf_role" \
      --db "$sf_db" \
      --dokploy-attached "$dokploy_attached" \
      --aliases "$aliases" \
      --compose-net-attached "$compose_attached" \
      --traefik-hash "$traefik_hash" \
      --backend-id "$be_id" \
      --backend-digest "$be_digest" \
      || { rm -f "$env_json"; die "assemble-live failed"; }
    rm -f "$env_json"
  fi

  wr_compose_env_assert_no_duplicate_governed_keys "$compose_env" >/dev/null \
    || die "compose env governed-key contract failed"

  OWNER_ENV_PLAN_JSON="$(mktemp)"
  python3 "$PLANNER" plan --compose-yml "$compose_yml" --compose-env "$compose_env" --live-json "$OWNER_ENV_LIVE_JSON" >"$OWNER_ENV_PLAN_JSON" \
    || die "planner failed"

  local already yaml_needs pin_sf pin_be pin_sha live_sha
  already="$(python3 -c 'import json,sys; print("true" if json.load(open(sys.argv[1])).get("already_applied") else "false")' "$OWNER_ENV_PLAN_JSON")"
  yaml_needs="$(python3 -c 'import json,sys; print("true" if json.load(open(sys.argv[1])).get("yaml_needs_pack_token_line") else "false")' "$OWNER_ENV_PLAN_JSON")"
  pin_sf="$(awk -F= '$1=="WOODRIGHT_STOREFRONT_IMAGE"{print $2; exit}' "$compose_env")"
  pin_be="$(awk -F= '$1=="WOODRIGHT_BACKEND_IMAGE"{print $2; exit}' "$compose_env")"
  pin_sha="$(awk -F= '$1=="WOODRIGHT_RELEASE_SHA"{print $2; exit}' "$compose_env")"
  live_sha="$(python3 -c 'import json,sys; print((json.load(open(sys.argv[1])).get("env") or {}).get("WOODRIGHT_RELEASE_SHA") or "")' "$OWNER_ENV_LIVE_JSON")"

  [[ -n "$pin_sf" && -n "$pin_be" && -n "$pin_sha" ]] || die "compose env missing image/SHA pins"
  [[ "$live_sha" == "$pin_sha" ]] || die "live WOODRIGHT_RELEASE_SHA != compose pin"
  [[ "$sf_digest" == *"${pin_sf##*@}"* || "$pin_sf" == *"$sf_digest"* ]] \
    || die "storefront live digest does not match WOODRIGHT_STOREFRONT_IMAGE pin"
  assert_identity "$sf_role" "$sf_db" "pre-recreate" || die "pre-recreate identity mismatch"
  export WR_OWNER_ENV_ROLE="$sf_role"
  export WR_OWNER_ENV_DB="$sf_db"

  OWNER_ENV_PACKET="$(mktemp)"
  python3 - "$OWNER_ENV_PACKET" "$OWNER_ENV_PLAN_JSON" "$MODE" "$sf_id" "$be_id" "$sf_digest" "$be_digest" \
    "$traefik_hash" "$already" "$yaml_needs" "$compose_yml" "$compose_env" \
    "${WOODRIGHT_MUTATION_LOCK_PATH:-$CANONICAL_LOCK_PATH}" "$EXECUTE_CONFIRM_TOKEN" <<'PY'
import json, os, sys
(
  packet, plan_path, mode, sf_id, be_id, sf_digest, be_digest,
  traefik_hash, already, yaml_needs, compose_yml, compose_env,
  lock_path, confirm_token,
) = sys.argv[1:]
plan = json.load(open(plan_path))
ok = (
  plan.get("backend_recreate") is False
  and plan.get("dns_mutation") is False
  and plan.get("payment_env_mutate") is False
  and plan.get("notification_runtime_inject") is False
  and plan.get("planned_env", {}).get("WOODRIGHT_LEGAL_PACK_TOKEN") == "OWNER_LEGAL_CONTENT_APPROVED"
  and plan.get("planned_env", {}).get("WOODRIGHT_LEGAL_CONTENT_STATUS") == "approved"
)
token = "PUBLIC_PRODUCTION_OWNER_ENV_RECONCILE_DRY_RUN_PASS" if mode == "dry-run" and ok else None
if mode == "execute" and ok:
    token = "PUBLIC_PRODUCTION_OWNER_ENV_RECONCILE_EXECUTE_PASS"
out = {
  "tool": "reconcile-public-production-owner-env.sh",
  "mode": mode,
  "environment": "public_production",
  "component": "storefront",
  "mutation": False if mode == "dry-run" else True,
  "confirm_token_required": confirm_token,
  "lock_path": lock_path,
  "already_applied": already == "true",
  "yaml_needs_pack_token_line": yaml_needs == "true",
  "same_images": True,
  "same_SHA": True,
  "identity_role": os.environ.get("WR_OWNER_ENV_ROLE", ""),
  "identity_db": os.environ.get("WR_OWNER_ENV_DB", ""),
  "backend_recreate": False,
  "dns_mutation": False,
  "traefik_write": False,
  "traefik_hash": traefik_hash,
  "storefront": {"id": sf_id, "digest": sf_digest},
  "backend": {"id": be_id, "digest": be_digest},
  "compose_yml": compose_yml,
  "compose_env": compose_env,
  "rollback": {
    "method": "restore_compose_yml_and_env_then_storefront_force_recreate_then_dokploy_reconnect",
    "constructible": True,
  },
  "reconnect_dokploy_if_dropped": True,
  "plan": plan,
  "result_token": token,
}
json.dump(out, open(packet, "w"), indent=2)
json.dump(out, sys.stdout, indent=2)
print()
PY

  if [[ "$MODE" != "execute" ]]; then
    return 0
  fi

  if [[ "$already" == "true" ]]; then
    log "already applied; execute is a no-op"
    wr_staging_mutation_lock_release || true
    OWNER_ENV_LOCK_HELD=0
    return 0
  fi

  local evidence
  if [[ "$HARNESS" -eq 1 ]]; then
    evidence="${WOODRIGHT_OWNER_ENV_FIXTURE_DIR}/evidence"
  else
    evidence="/srv/woodright/reports/public_production/owner-env-reconcile/$(date -u +%Y%m%dT%H%M%SZ)"
  fi
  mkdir -p "$evidence/backup"
  cp -p "$compose_yml" "$evidence/backup/docker-compose.yml"
  cp -p "$compose_env" "$evidence/backup/.env"
  [[ "$HARNESS" -eq 1 ]] && cp -p "${WOODRIGHT_OWNER_ENV_FIXTURE_DIR}/live.json" "$evidence/backup/live.json"
  printf '%s\n' "$sf_id" >"$evidence/backup/storefront.id"
  printf '%s\n' "$be_id" >"$evidence/backup/backend.id"
  printf '%s\n' "$traefik_hash" >"$evidence/backup/traefik.sha256"
  printf '%s\n' "$sf_role" >"$evidence/backup/role.txt"
  printf '%s\n' "$sf_db" >"$evidence/backup/db.txt"

  rollback_owner_env() {
    log "ROLLBACK restoring compose yaml + env"
    local rc=0
    atomic_install_file "$evidence/backup/docker-compose.yml" "$compose_yml" || rc=1
    wr_compose_env_atomic_install "$evidence/backup/.env" "$compose_env" "$(dirname "$compose_env")" || rc=1
    if [[ "$HARNESS" -eq 1 ]]; then
      cp -p "$evidence/backup/live.json" "${WOODRIGHT_OWNER_ENV_FIXTURE_DIR}/live.json" || rc=1
    else
      wr_compose_force_recreate_service storefront || rc=1
      local restored_id
      restored_id="$(container_id "$sf_name" 2>/dev/null || true)"
      if [[ -z "$restored_id" ]]; then
        rc=1
      else
        reconnect_dokploy "$sf_name" "$restored_id" "$sf_name" || rc=1
        container_on_network "$sf_name" "${WOODRIGHT_NET_STACK}" || rc=1
        [[ "$(container_digest "$sf_name")" == "$sf_digest" ]] || rc=1
        [[ "$(container_id "$be_name")" == "$be_id" ]] || rc=1
        [[ "$(sha256_file "$traefik_file")" == "$traefik_hash" ]] || rc=1
        local restored_role restored_db
        restored_role="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$sf_name" | awk -F= '$1=="WOODRIGHT_RUNTIME_ROLE"{print $2; exit}')"
        restored_db="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$sf_name" | awk -F= '$1=="WOODRIGHT_DATABASE_IDENTITY_ALIAS"{print $2; exit}')"
        [[ "$restored_role" == "$sf_role" && "$restored_db" == "$sf_db" ]] || rc=1
      fi
    fi
    if [[ "$rc" -ne 0 ]]; then
      log "ERROR ROLLBACK_FAILED"
      return 1
    fi
    if [[ "$(sha256_file "$compose_yml")" != "$(sha256_file "$evidence/backup/docker-compose.yml")" ]]; then
      log "ERROR ROLLBACK yaml hash mismatch"
      return 1
    fi
    if [[ "$(sha256_file "$compose_env")" != "$(sha256_file "$evidence/backup/.env")" ]]; then
      log "ERROR ROLLBACK env hash mismatch"
      return 1
    fi
    if ! grep -q "^WOODRIGHT_STOREFRONT_IMAGE=${pin_sf}$" "$compose_env"; then
      log "ERROR ROLLBACK pin/storefront image not restored"
      return 1
    fi
    if ! grep -q "^WOODRIGHT_RELEASE_SHA=${pin_sha}$" "$compose_env"; then
      log "ERROR ROLLBACK SHA pin not restored"
      return 1
    fi
    [[ "$(sha256_file "$traefik_file")" == "$traefik_hash" ]] || { log "ERROR ROLLBACK Traefik changed"; return 1; }
    log "ROLLBACK verified yaml/env/pins/traefik"
    return 0
  }

  fail_after_mutation() {
    local msg="$1"
    if rollback_owner_env; then
      die "$msg (rollback verified)"
    fi
    die "ROLLBACK_FAILED after: $msg"
  }

  local staged_yml staged_env
  staged_yml="$(mktemp)"
  staged_env="$(mktemp)"
  if [[ "$yaml_needs" == "true" ]]; then
    python3 "$PLANNER" apply-yaml --compose-yml "$compose_yml" --out "$staged_yml" \
      || fail_after_mutation "yaml patch failed"
    atomic_install_file "$staged_yml" "$compose_yml" || fail_after_mutation "yaml install failed"
  fi
  wr_compose_env_render_keys "$compose_env" "$staged_env" \
    WOODRIGHT_LEGAL_CONTENT_STATUS "$TARGET_LEGAL_STATUS" \
    WOODRIGHT_LEGAL_PACK_TOKEN "$TARGET_PACK_TOKEN" \
    || fail_after_mutation "env render failed"
  wr_compose_env_validate_keys "$staged_env" \
    WOODRIGHT_LEGAL_CONTENT_STATUS "$TARGET_LEGAL_STATUS" \
    WOODRIGHT_LEGAL_PACK_TOKEN "$TARGET_PACK_TOKEN" \
    WOODRIGHT_STOREFRONT_IMAGE "$pin_sf" \
    WOODRIGHT_BACKEND_IMAGE "$pin_be" \
    WOODRIGHT_RELEASE_SHA "$pin_sha" \
    >/dev/null \
    || fail_after_mutation "env validate failed (pins must stay exact)"
  wr_compose_env_atomic_install "$staged_env" "$compose_env" "$(dirname "$compose_env")" \
    || fail_after_mutation "env install failed"

  if [[ "${WOODRIGHT_OWNER_ENV_INJECT_FAIL:-}" == "after-env" ]]; then
    fail_after_mutation "injected failure after env write"
  fi

  if [[ "$HARNESS" -eq 1 ]]; then
    python3 - "${WOODRIGHT_OWNER_ENV_FIXTURE_DIR}/live.json" "$sf_digest" "$be_id" "$be_digest" "$sf_role" "$sf_db" "$traefik_hash" "$TARGET_LEGAL_STATUS" "$TARGET_PACK_TOKEN" <<'PY'
import json, sys
path, digest, be_id, be_digest, role, db, traefik, status, token = sys.argv[1:10]
data = json.load(open(path))
data["id"] = "c" * 64
data["digest"] = digest
data["backend_id"] = be_id
data["backend_digest"] = be_digest
data["role"] = role
data["db"] = db
data["traefik_hash"] = traefik
data["dokploy_attached"] = True
data["compose_net_attached"] = True
env = dict(data.get("env") or {})
env["WOODRIGHT_LEGAL_CONTENT_STATUS"] = status
env["WOODRIGHT_LEGAL_PACK_TOKEN"] = token
data["env"] = env
json.dump(data, open(path, "w"), indent=2)
open(path, "a").write("\n")
PY
    local h_role h_db h_digest h_be h_hash h_token
    h_role="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("role",""))' "${WOODRIGHT_OWNER_ENV_FIXTURE_DIR}/live.json")"
    h_db="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("db",""))' "${WOODRIGHT_OWNER_ENV_FIXTURE_DIR}/live.json")"
    h_digest="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("digest",""))' "${WOODRIGHT_OWNER_ENV_FIXTURE_DIR}/live.json")"
    h_be="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("backend_id",""))' "${WOODRIGHT_OWNER_ENV_FIXTURE_DIR}/live.json")"
    h_hash="$(sha256_file "$traefik_file")"
    h_token="$(awk -F= '$1=="WOODRIGHT_LEGAL_PACK_TOKEN"{print $2; exit}' "$compose_env")"
    [[ "$h_digest" == "$sf_digest" ]] || fail_after_mutation "harness digest changed"
    [[ "$h_be" == "$be_id" ]] || fail_after_mutation "harness backend id changed"
    [[ "$h_hash" == "$traefik_hash" ]] || fail_after_mutation "harness Traefik changed"
    [[ "$h_token" == "$TARGET_PACK_TOKEN" ]] || fail_after_mutation "harness pack token missing"
    if [[ "${WOODRIGHT_OWNER_ENV_INJECT_FAIL:-}" == "post-identity" ]]; then
      h_role="public_demo"
    fi
    assert_identity "$h_role" "$h_db" "post-recreate" || fail_after_mutation "post-recreate identity mismatch"
    grep -q "^WOODRIGHT_STOREFRONT_IMAGE=${pin_sf}$" "$compose_env" || fail_after_mutation "harness image pin drifted"
    grep -q "^WOODRIGHT_RELEASE_SHA=${pin_sha}$" "$compose_env" || fail_after_mutation "harness SHA pin drifted"
  else
    wr_compose_force_recreate_service storefront || fail_after_mutation "storefront recreate failed"
    wr_compose_verify_recreate_postconditions \
      storefront "$sf_name" "$sf_id" "$sf_digest" "${WOODRIGHT_COMPOSE_PROJECT}" \
      || fail_after_mutation "recreate postconditions failed"
    local new_sf_id new_be_id new_digest new_hash new_token new_role new_db
    new_sf_id="$(container_id "$sf_name")"
    new_be_id="$(container_id "$be_name")"
    [[ "$new_be_id" == "$be_id" ]] || fail_after_mutation "backend ID changed (forbidden)"
    reconnect_dokploy "$sf_name" "$new_sf_id" "$sf_name" || fail_after_mutation "dokploy reconnect failed"
    container_on_network "$sf_name" "${WOODRIGHT_NET_STACK}" || fail_after_mutation "compose network missing after recreate"
    new_digest="$(container_digest "$sf_name")"
    [[ "$new_digest" == "$sf_digest" ]] || fail_after_mutation "storefront digest changed"
    new_hash="$(sha256_file "$traefik_file")"
    [[ "$new_hash" == "$traefik_hash" ]] || fail_after_mutation "Traefik YAML changed"
    new_token="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$sf_name" | awk -F= '$1=="WOODRIGHT_LEGAL_PACK_TOKEN"{print $2; exit}')"
    [[ "$new_token" == "$TARGET_PACK_TOKEN" ]] || fail_after_mutation "live pack token missing after recreate"
    new_role="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$sf_name" | awk -F= '$1=="WOODRIGHT_RUNTIME_ROLE"{print $2; exit}')"
    new_db="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$sf_name" | awk -F= '$1=="WOODRIGHT_DATABASE_IDENTITY_ALIAS"{print $2; exit}')"
    assert_identity "$new_role" "$new_db" "post-recreate" || fail_after_mutation "post-recreate identity mismatch"
  fi

  wr_staging_mutation_lock_release || true
  OWNER_ENV_LOCK_HELD=0
  log "EXECUTE_OK evidence=$evidence"
  return 0
}

main "$@"
