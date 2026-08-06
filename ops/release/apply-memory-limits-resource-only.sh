#!/usr/bin/env bash
# Resource-only memory limit apply for Wave 1 SF/BE.
# Uses `docker update`  -  does NOT rewrite ACTIVE/EXPECTED, digests, env, mounts, or networks.
# Syncs mem_* into live Compose files when paths are provided so future recreates keep limits.
#
# Usage:
#   ops/release/apply-memory-limits-resource-only.sh --mode dry-run|execute \
#     --targets public_demo|production|all \
#     [--production-compose /etc/dokploy/compose/woodright-production/code/docker-compose.yml] \
#     [--demo-compose /etc/dokploy/compose/woodright-stack-3dsdhd/code/docker-compose.staging.yml] \
#     [--confirm-mutation I_UNDERSTAND_MEMORY_LIMITS_RESOURCE_ONLY]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=ops/lib/woodright-memory-limits.sh
source "$ROOT/ops/lib/woodright-memory-limits.sh"

MODE=dry-run
TARGETS=all
CONFIRM=""
PROD_COMPOSE=""
DEMO_COMPOSE=""
EXECUTE_TOKEN="I_UNDERSTAND_MEMORY_LIMITS_RESOURCE_ONLY"

die() { echo "ERROR: $*" >&2; exit 2; }
log() { echo "[wr-mem-apply] $*"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="${2:?}"; shift 2 ;;
    --mode=*) MODE="${1#--mode=}"; shift ;;
    --targets) TARGETS="${2:?}"; shift 2 ;;
    --targets=*) TARGETS="${1#--targets=}"; shift ;;
    --production-compose) PROD_COMPOSE="${2:?}"; shift 2 ;;
    --demo-compose) DEMO_COMPOSE="${2:?}"; shift 2 ;;
    --confirm-mutation) CONFIRM="${2:?}"; shift 2 ;;
    --confirm-mutation=*) CONFIRM="${1#--confirm-mutation=}"; shift ;;
    -h|--help) sed -n '1,20p' "$0"; exit 0 ;;
    *) die "unknown arg: $1" ;;
  esac
done

[[ "$MODE" == "dry-run" || "$MODE" == "execute" ]] || die "mode must be dry-run|execute"
[[ "$TARGETS" == "public_demo" || "$TARGETS" == "production" || "$TARGETS" == "all" ]] \
  || die "targets must be public_demo|production|all"

if [[ "$MODE" == "execute" ]]; then
  [[ "$CONFIRM" == "$EXECUTE_TOKEN" ]] || die "execute requires --confirm-mutation $EXECUTE_TOKEN"
fi

declare -a NAMES=()
case "$TARGETS" in
  public_demo) NAMES=(woodright-staging-storefront woodright-staging-backend) ;;
  production) NAMES=(woodright-production-storefront woodright-production-backend) ;;
  all) NAMES=(woodright-staging-storefront woodright-staging-backend woodright-production-storefront woodright-production-backend) ;;
esac

want_bytes() {
  local mib
  mib="$(wr_mem_parse_to_mib "$1")" || return 1
  echo $((mib * 1048576))
}

apply_one() {
  local name="$1" kind="$2"
  local res lim res_b lim_b cur_m cur_r
  if [[ "$kind" == storefront ]]; then
    res="$WOODRIGHT_STOREFRONT_MEMORY_RESERVATION"
    lim="$WOODRIGHT_STOREFRONT_MEMORY_LIMIT"
  else
    res="$WOODRIGHT_BACKEND_MEMORY_RESERVATION"
    lim="$WOODRIGHT_BACKEND_MEMORY_LIMIT"
  fi
  wr_mem_validate_pair "$kind" "$res" "$lim" || return 1
  res_b="$(want_bytes "$res")"
  lim_b="$(want_bytes "$lim")"
  cur_m="$(docker inspect -f '{{.HostConfig.Memory}}' "$name")"
  cur_r="$(docker inspect -f '{{.HostConfig.MemoryReservation}}' "$name")"
  log "target=$name kind=$kind want_limit=$lim ($lim_b) want_res=$res ($res_b) have_limit=$cur_m have_res=$cur_r"
  if [[ "$MODE" == "dry-run" ]]; then
    log "DRY_RUN docker update --memory-reservation $res --memory $lim $name"
    return 0
  fi
  # Preflight: digest/image unchanged after update (update does not change image)
  local dig before_id
  before_id="$(docker inspect -f '{{.Id}}' "$name")"
  dig="$(docker inspect -f '{{index .RepoDigests 0}}' "$(docker inspect -f '{{.Image}}' "$name")" 2>/dev/null || true)"
  docker update --memory-reservation "$res" --memory "$lim" "$name"
  local after_id after_m after_r
  after_id="$(docker inspect -f '{{.Id}}' "$name")"
  after_m="$(docker inspect -f '{{.HostConfig.Memory}}' "$name")"
  after_r="$(docker inspect -f '{{.HostConfig.MemoryReservation}}' "$name")"
  [[ "$after_id" == "$before_id" ]] || die "container id changed unexpectedly on docker update"
  [[ "$after_m" == "$lim_b" ]] || die "Memory not applied on $name have=$after_m want=$lim_b"
  [[ "$after_r" == "$res_b" ]] || die "MemoryReservation not applied on $name have=$after_r want=$res_b"
  log "APPLIED $name memory=$after_m reservation=$after_r digest_hint=${dig:-n/a}"
}

patch_compose_mem() {
  local file="$1"
  [[ -n "$file" && -f "$file" ]] || return 0
  if [[ "$MODE" == "dry-run" ]]; then
    log "DRY_RUN would ensure mem_* on backend+storefront in $file"
    return 0
  fi
  WOODRIGHT_BACKEND_MEMORY_RESERVATION="$WOODRIGHT_BACKEND_MEMORY_RESERVATION" \
  WOODRIGHT_BACKEND_MEMORY_LIMIT="$WOODRIGHT_BACKEND_MEMORY_LIMIT" \
  WOODRIGHT_STOREFRONT_MEMORY_RESERVATION="$WOODRIGHT_STOREFRONT_MEMORY_RESERVATION" \
  WOODRIGHT_STOREFRONT_MEMORY_LIMIT="$WOODRIGHT_STOREFRONT_MEMORY_LIMIT" \
  python3 - "$file" <<'PY'
import sys, re, os
path = sys.argv[1]
text = open(path).read()
BE_RES = os.environ["WOODRIGHT_BACKEND_MEMORY_RESERVATION"]
BE_LIM = os.environ["WOODRIGHT_BACKEND_MEMORY_LIMIT"]
SF_RES = os.environ["WOODRIGHT_STOREFRONT_MEMORY_RESERVATION"]
SF_LIM = os.environ["WOODRIGHT_STOREFRONT_MEMORY_LIMIT"]

def service_block(src, service):
    m = re.search(rf"(^  {service}:\n)(.*?)(?=^  [a-zA-Z]|\Z)", src, flags=re.M | re.S)
    if not m:
        raise SystemExit(f"missing service {service} in {path}")
    return m.start(), m.end(), m.group(0)

def ensure_mem(service, res, lim, src):
    start, end, block = service_block(src, service)
    has_lim = bool(re.search(r"^\s+mem_limit:\s*", block, flags=re.M))
    has_res = bool(re.search(r"^\s+mem_reservation:\s*", block, flags=re.M))
    if has_lim and has_res:
        block2 = re.sub(
            r"^(\s+mem_reservation:\s*).*$",
            rf'\1"{res}"',
            block,
            count=1,
            flags=re.M,
        )
        block2 = re.sub(
            r"^(\s+mem_limit:\s*).*$",
            rf'\1"{lim}"',
            block2,
            count=1,
            flags=re.M,
        )
        print(f"ok normalized mem for {service}")
        return src[:start] + block2 + src[end:]

    block2 = re.sub(r"^\s+mem_reservation:\s*.*\n", "", block, flags=re.M)
    block2 = re.sub(r"^\s+mem_limit:\s*.*\n", "", block2, flags=re.M)
    m = re.search(r"(^\s+restart: unless-stopped\n)", block2, flags=re.M)
    if not m:
        raise SystemExit(f"no restart line for {service} in {path}")
    insert = (
        m.group(1)
        + f'    mem_reservation: "{res}"\n'
        + f'    mem_limit: "{lim}"\n'
    )
    block2 = block2[: m.start()] + insert + block2[m.end() :]
    print(f"injected mem for {service} (partial_had_lim={has_lim} partial_had_res={has_res})")
    return src[:start] + block2 + src[end:]

def service_has_mem(src, service):
    _, _, block = service_block(src, service)
    return bool(re.search(r"^\s+mem_limit:\s*", block, flags=re.M)) and bool(
        re.search(r"^\s+mem_reservation:\s*", block, flags=re.M)
    )

out = text
out = ensure_mem("backend", BE_RES, BE_LIM, out)
out = ensure_mem("storefront", SF_RES, SF_LIM, out)
for svc in ("backend", "storefront"):
    if not service_has_mem(out, svc):
        raise SystemExit(f"compose still missing mem for {svc}")
    _, _, block = service_block(out, svc)
    if len(re.findall(r"^\s+mem_limit:\s*", block, flags=re.M)) != 1:
        raise SystemExit(f"duplicate mem_limit in {svc}")
    if len(re.findall(r"^\s+mem_reservation:\s*", block, flags=re.M)) != 1:
        raise SystemExit(f"duplicate mem_reservation in {svc}")
open(path, "w").write(out)
print("patched", path)
PY
}

# Capacity gate: dual-stack reservations must leave host reserve
TOTAL_MIB=7940  # ~7.75 GiB
RES_TOTAL=$((192 + 192 + 640 + 640))
wr_mem_host_reserve_ok "$TOTAL_MIB" "$RES_TOTAL" || die "capacity model rejected"

for name in "${NAMES[@]}"; do
  docker inspect "$name" >/dev/null 2>&1 || die "missing container $name"
  if [[ "$name" == *storefront* ]]; then
    apply_one "$name" storefront
  else
    apply_one "$name" backend
  fi
done

if [[ "$TARGETS" == "production" || "$TARGETS" == "all" ]]; then
  patch_compose_mem "$PROD_COMPOSE"
fi
if [[ "$TARGETS" == "public_demo" || "$TARGETS" == "all" ]]; then
  patch_compose_mem "$DEMO_COMPOSE"
fi

log "DONE mode=$MODE targets=$TARGETS"
