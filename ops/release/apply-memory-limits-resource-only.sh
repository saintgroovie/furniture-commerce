#!/usr/bin/env bash
# Resource-only memory limit apply for Wave 1 SF/BE.
# Uses `docker update` - does NOT rewrite ACTIVE/EXPECTED, digests, env, mounts, or networks.
# Syncs mem_* into live Compose files when paths are provided so future recreates keep limits.
#
# Canonical triplet: MemoryReservation / Memory / MemorySwap with MemorySwap == Memory
#
# Modes:
#   dry-run|execute  - apply accepted Wave 1 limits (with --memory-swap companion)
#   rollback-nonzero - restore a previously captured nonzero triplet (env PREV_*)
#   rollback         - alias that refuses unlimited (0/0/0) on Docker 29.x
#
# Usage:
#   ops/release/apply-memory-limits-resource-only.sh --mode dry-run|execute|rollback \
#     --targets public_demo|production|all \
#     [--production-compose ...] [--demo-compose ...] \
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
    -h|--help) sed -n '1,30p' "$0"; exit 0 ;;
    *) die "unknown arg: $1" ;;
  esac
done

[[ "$MODE" == "dry-run" || "$MODE" == "execute" || "$MODE" == "rollback" || "$MODE" == "rollback-nonzero" ]] \
  || die "mode must be dry-run|execute|rollback|rollback-nonzero"
[[ "$TARGETS" == "public_demo" || "$TARGETS" == "production" || "$TARGETS" == "all" \
  || "$TARGETS" == "woodright-staging-storefront" || "$TARGETS" == "woodright-staging-backend" \
  || "$TARGETS" == "woodright-production-storefront" || "$TARGETS" == "woodright-production-backend" ]] \
  || die "targets must be public_demo|production|all|<exact allowlisted container name>"

if [[ "$MODE" == "execute" || "$MODE" == "rollback" || "$MODE" == "rollback-nonzero" ]]; then
  [[ "$CONFIRM" == "$EXECUTE_TOKEN" ]] || die "mutation modes require --confirm-mutation $EXECUTE_TOKEN"
fi

declare -a NAMES=()
case "$TARGETS" in
  public_demo) NAMES=(woodright-staging-storefront woodright-staging-backend) ;;
  production) NAMES=(woodright-production-storefront woodright-production-backend) ;;
  all) NAMES=(woodright-staging-storefront woodright-staging-backend woodright-production-storefront woodright-production-backend) ;;
  woodright-staging-storefront|woodright-staging-backend|woodright-production-storefront|woodright-production-backend)
    NAMES=("$TARGETS")
    ;;
  *) die "targets must be public_demo|production|all|<exact allowlisted container name>" ;;
esac

want_bytes() { wr_mem_to_bytes "$1"; }

inspect_triplet() {
  local name="$1"
  docker inspect -f '{{.HostConfig.Memory}} {{.HostConfig.MemoryReservation}} {{.HostConfig.MemorySwap}}' "$name"
}

apply_one() {
  local name="$1" kind="$2"
  local res lim swap res_b lim_b swap_b cur_m cur_r cur_s
  if [[ "$kind" == storefront ]]; then
    res="$WOODRIGHT_STOREFRONT_MEMORY_RESERVATION"
    lim="$WOODRIGHT_STOREFRONT_MEMORY_LIMIT"
    swap="${WOODRIGHT_STOREFRONT_MEMORY_SWAP:-$lim}"
  else
    res="$WOODRIGHT_BACKEND_MEMORY_RESERVATION"
    lim="$WOODRIGHT_BACKEND_MEMORY_LIMIT"
    swap="${WOODRIGHT_BACKEND_MEMORY_SWAP:-$lim}"
  fi
  wr_mem_validate_triplet "$kind" "$res" "$lim" "$swap" || return 1
  res_b="$(want_bytes "$res")"
  lim_b="$(want_bytes "$lim")"
  swap_b="$(want_bytes "$swap")"
  read -r cur_m cur_r cur_s <<<"$(inspect_triplet "$name")"
  log "target=$name kind=$kind want=$lim_b/$res_b/$swap_b have=$cur_m/$cur_r/$cur_s"
  if [[ "$MODE" == "dry-run" ]]; then
    log "DRY_RUN docker update --memory-reservation $res --memory $lim --memory-swap $swap $name"
    return 0
  fi
  if [[ "$cur_m" == "$lim_b" && "$cur_r" == "$res_b" && "$cur_s" == "$swap_b" ]]; then
    log "NOOP already exact $name"
    return 0
  fi
  local before_id before_started
  before_id="$(docker inspect -f '{{.Id}}' "$name")"
  before_started="$(docker inspect -f '{{.State.StartedAt}}' "$name")"
  docker update --memory-reservation "$res" --memory "$lim" --memory-swap "$swap" "$name"
  local after_id after_started after_m after_r after_s
  after_id="$(docker inspect -f '{{.Id}}' "$name")"
  after_started="$(docker inspect -f '{{.State.StartedAt}}' "$name")"
  read -r after_m after_r after_s <<<"$(inspect_triplet "$name")"
  [[ "$after_id" == "$before_id" ]] || die "container id changed on docker update"
  [[ "$after_started" == "$before_started" ]] || die "StartedAt changed on docker update"
  [[ "$after_m" == "$lim_b" && "$after_r" == "$res_b" && "$after_s" == "$swap_b" ]] \
    || die "triplet not applied on $name have=$after_m/$after_r/$after_s"
  log "APPLIED $name memory=$after_m reservation=$after_r swap=$after_s"
}

# Resolve per-container previous nonzero triplet (bytes).
# Prefer WR_MEM_PREV_<NAME>_MEMORY|RESERVATION|SWAP (name with hyphens→underscores),
# else require exactly one target when using global WR_MEM_PREV_*.
resolve_prev_triplet() {
  local name="$1"
  local key prefix want_m want_r want_s
  key="$(echo "$name" | tr '-' '_')"
  prefix="WR_MEM_PREV_${key}"
  want_m="$(eval "echo \"\${${prefix}_MEMORY:-}\"")"
  want_r="$(eval "echo \"\${${prefix}_RESERVATION:-}\"")"
  want_s="$(eval "echo \"\${${prefix}_SWAP:-}\"")"
  if [[ -z "$want_m" && -z "$want_r" && -z "$want_s" ]]; then
    if [[ "${#NAMES[@]}" -ne 1 ]]; then
      die "rollback-nonzero with global WR_MEM_PREV_* requires exactly one --targets container (or set per-container WR_MEM_PREV_<name>_*)"
    fi
    want_m="${WR_MEM_PREV_MEMORY:?set WR_MEM_PREV_MEMORY or per-container vars}"
    want_r="${WR_MEM_PREV_RESERVATION:?}"
    want_s="${WR_MEM_PREV_SWAP:?}"
  fi
  [[ -n "$want_m" && -n "$want_r" && -n "$want_s" ]] || die "incomplete previous triplet for $name"
  # Unconditional reject of non-positive components (no docker mutation)
  if ! [[ "$want_m" =~ ^[0-9]+$ && "$want_r" =~ ^[0-9]+$ && "$want_s" =~ ^[0-9]+$ ]]; then
    die "previous triplet for $name must be integer bytes"
  fi
  if ((want_m <= 0 || want_r < 0 || want_s <= 0)); then
    echo "$WOODRIGHT_RESOURCE_ROLLBACK_TO_UNLIMITED_TOKEN" >&2
    die "rollback-nonzero refuses non-positive memory/swap for $name (want=$want_m/$want_r/$want_s)"
  fi
  if ((want_r > want_m)); then
    die "previous reservation > memory for $name"
  fi
  if ((want_s != want_m)); then
    die "previous MemorySwap must equal Memory for accepted policy ($name want_swap=$want_s want_mem=$want_m)"
  fi
  printf '%s %s %s' "$want_m" "$want_r" "$want_s"
}

# Restore previous nonzero triplet for one container.
restore_nonzero_one() {
  local name="$1"
  local want_m want_r want_s cur_m cur_r cur_s resolved
  # Do NOT run resolve in $(...) alone - die() in subshell would be swallowed.
  if ! resolved="$(resolve_prev_triplet "$name")"; then
    die "previous triplet resolution failed for $name"
  fi
  # shellcheck disable=SC2086
  read -r want_m want_r want_s <<<"$resolved"
  [[ -n "$want_m" && -n "$want_r" && -n "$want_s" ]] || die "empty previous triplet for $name"
  if ((want_m <= 0 || want_s <= 0)); then
    echo "$WOODRIGHT_RESOURCE_ROLLBACK_TO_UNLIMITED_TOKEN" >&2
    die "refusing non-positive restore for $name (pre-mutation guard)"
  fi
  read -r cur_m cur_r cur_s <<<"$(inspect_triplet "$name")"
  log "restore-nonzero target=$name want=$want_m/$want_r/$want_s have=$cur_m/$cur_r/$cur_s"
  if [[ "$MODE" == "dry-run" ]]; then
    log "DRY_RUN docker update --memory-reservation $want_r --memory $want_m --memory-swap $want_s $name"
    return 0
  fi
  if [[ "$cur_m" == "$want_m" && "$cur_r" == "$want_r" && "$cur_s" == "$want_s" ]]; then
    log "NOOP already at previous triplet $name"
    return 0
  fi
  local before_id before_started
  before_id="$(docker inspect -f '{{.Id}}' "$name")"
  before_started="$(docker inspect -f '{{.State.StartedAt}}' "$name")"
  docker update --memory-reservation "${want_r}" --memory "${want_m}" --memory-swap "${want_s}" "$name"
  local after_id after_started after_m after_r after_s
  after_id="$(docker inspect -f '{{.Id}}' "$name")"
  after_started="$(docker inspect -f '{{.State.StartedAt}}' "$name")"
  read -r after_m after_r after_s <<<"$(inspect_triplet "$name")"
  [[ "$after_id" == "$before_id" && "$after_started" == "$before_started" ]] || die "identity changed on restore"
  [[ "$after_m" == "$want_m" && "$after_r" == "$want_r" && "$after_s" == "$want_s" ]] \
    || die "nonzero restore failed on $name"
  log "RESTORED_NONZERO $name"
}

rollback_unlimited_refused() {
  local name="$1"
  local cur_m cur_r cur_s
  read -r cur_m cur_r cur_s <<<"$(inspect_triplet "$name")"
  log "rollback-unlimited requested for $name have=$cur_m/$cur_r/$cur_s"
  # Fail-closed BEFORE any docker mutation
  wr_mem_refuse_unlimited_rollback "$cur_m" 0 || return 1
  # Already unlimited - noop
  log "NOOP already unlimited $name"
  return 0
}

patch_compose_mem() {
  local file="$1"
  [[ -n "$file" && -f "$file" ]] || return 0
  if [[ "$MODE" == "dry-run" ]]; then
    log "DRY_RUN would ensure mem_* + memswap_limit on backend+storefront in $file"
    return 0
  fi
  WOODRIGHT_BACKEND_MEMORY_RESERVATION="$WOODRIGHT_BACKEND_MEMORY_RESERVATION" \
  WOODRIGHT_BACKEND_MEMORY_LIMIT="$WOODRIGHT_BACKEND_MEMORY_LIMIT" \
  WOODRIGHT_BACKEND_MEMORY_SWAP="${WOODRIGHT_BACKEND_MEMORY_SWAP:-$WOODRIGHT_BACKEND_MEMORY_LIMIT}" \
  WOODRIGHT_STOREFRONT_MEMORY_RESERVATION="$WOODRIGHT_STOREFRONT_MEMORY_RESERVATION" \
  WOODRIGHT_STOREFRONT_MEMORY_LIMIT="$WOODRIGHT_STOREFRONT_MEMORY_LIMIT" \
  WOODRIGHT_STOREFRONT_MEMORY_SWAP="${WOODRIGHT_STOREFRONT_MEMORY_SWAP:-$WOODRIGHT_STOREFRONT_MEMORY_LIMIT}" \
  python3 - "$file" <<'PY'
import sys, re, os
path = sys.argv[1]
text = open(path).read()
BE_RES = os.environ["WOODRIGHT_BACKEND_MEMORY_RESERVATION"]
BE_LIM = os.environ["WOODRIGHT_BACKEND_MEMORY_LIMIT"]
BE_SWAP = os.environ["WOODRIGHT_BACKEND_MEMORY_SWAP"]
SF_RES = os.environ["WOODRIGHT_STOREFRONT_MEMORY_RESERVATION"]
SF_LIM = os.environ["WOODRIGHT_STOREFRONT_MEMORY_LIMIT"]
SF_SWAP = os.environ["WOODRIGHT_STOREFRONT_MEMORY_SWAP"]

def service_block(src, service):
    m = re.search(rf"(^  {service}:\n)(.*?)(?=^  [a-zA-Z]|\Z)", src, flags=re.M | re.S)
    if not m:
        raise SystemExit(f"missing service {service} in {path}")
    return m.start(), m.end(), m.group(0)

def ensure_mem(service, res, lim, swap, src):
    start, end, block = service_block(src, service)
    has_lim = bool(re.search(r"^\s+mem_limit:\s*", block, flags=re.M))
    has_res = bool(re.search(r"^\s+mem_reservation:\s*", block, flags=re.M))
    has_swap = bool(re.search(r"^\s+memswap_limit:\s*", block, flags=re.M))
    if has_lim and has_res and has_swap:
        block2 = re.sub(r"^(\s+mem_reservation:\s*).*$", rf'\1"{res}"', block, count=1, flags=re.M)
        block2 = re.sub(r"^(\s+mem_limit:\s*).*$", rf'\1"{lim}"', block2, count=1, flags=re.M)
        block2 = re.sub(r"^(\s+memswap_limit:\s*).*$", rf'\1"{swap}"', block2, count=1, flags=re.M)
        print(f"ok normalized mem+swap for {service}")
        return src[:start] + block2 + src[end:]
    block2 = re.sub(r"^\s+mem_reservation:\s*.*\n", "", block, flags=re.M)
    block2 = re.sub(r"^\s+mem_limit:\s*.*\n", "", block2, flags=re.M)
    block2 = re.sub(r"^\s+memswap_limit:\s*.*\n", "", block2, flags=re.M)
    m = re.search(r"(^\s+restart: unless-stopped\n)", block2, flags=re.M)
    if not m:
        raise SystemExit(f"no restart line for {service} in {path}")
    insert = (
        m.group(1)
        + f'    mem_reservation: "{res}"\n'
        + f'    mem_limit: "{lim}"\n'
        + f'    memswap_limit: "{swap}"\n'
    )
    block2 = block2[: m.start()] + insert + block2[m.end() :]
    print(f"injected mem+swap for {service}")
    return src[:start] + block2 + src[end:]

def service_has_mem(src, service):
    _, _, block = service_block(src, service)
    return all(
        re.search(rf"^\s+{k}:\s*", block, flags=re.M)
        for k in ("mem_limit", "mem_reservation", "memswap_limit")
    )

out = text
out = ensure_mem("backend", BE_RES, BE_LIM, BE_SWAP, out)
out = ensure_mem("storefront", SF_RES, SF_LIM, SF_SWAP, out)
for svc in ("backend", "storefront"):
    if not service_has_mem(out, svc):
        raise SystemExit(f"compose still missing mem triplet for {svc}")
open(path, "w").write(out)
print("patched", path)
PY
}

TOTAL_MIB=7940
RES_TOTAL=$((192 + 192 + 640 + 640))
wr_mem_host_reserve_ok "$TOTAL_MIB" "$RES_TOTAL" || die "capacity model rejected"

# Preflight all targets exist; for rollback-nonzero resolve every triplet BEFORE any mutation
for name in "${NAMES[@]}"; do
  [[ "$name" == "woodright-staging-storefront" || "$name" == "woodright-staging-backend" \
    || "$name" == "woodright-production-storefront" || "$name" == "woodright-production-backend" ]] \
    || die "refusing non-allowlisted target name=$name"
  docker inspect "$name" >/dev/null 2>&1 || die "missing container $name"
done
if [[ "$MODE" == "rollback-nonzero" ]]; then
  for name in "${NAMES[@]}"; do
    if ! resolved="$(resolve_prev_triplet "$name")"; then
      die "preflight previous triplet failed for $name (no mutations performed)"
    fi
    read -r _m _r _s <<<"$resolved"
    [[ -n "$_m" && "$_m" -gt 0 && -n "$_s" && "$_s" -gt 0 ]] \
      || die "preflight refused non-positive triplet for $name (no mutations performed)"
  done
  log "preflight rollback-nonzero: all ${#NAMES[@]} triplets valid"
fi

for name in "${NAMES[@]}"; do
  case "$MODE" in
    rollback)
      rollback_unlimited_refused "$name" || die "unsupported unlimited rollback for $name"
      ;;
    rollback-nonzero)
      restore_nonzero_one "$name" || die "nonzero restore failed for $name"
      ;;
    *)
      if [[ "$name" == *storefront* ]]; then
        apply_one "$name" storefront
      else
        apply_one "$name" backend
      fi
      ;;
  esac
done

if [[ "$MODE" == "dry-run" || "$MODE" == "execute" ]]; then
  if [[ "$TARGETS" == "production" || "$TARGETS" == "all" ]]; then
    patch_compose_mem "$PROD_COMPOSE"
  fi
  if [[ "$TARGETS" == "public_demo" || "$TARGETS" == "all" ]]; then
    patch_compose_mem "$DEMO_COMPOSE"
  fi
fi

log "DONE mode=$MODE targets=$TARGETS"
