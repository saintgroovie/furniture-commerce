#!/usr/bin/env bash
# Woodright container memory limit policy (Wave 1 application SF/BE).
# Bytes and human units for Compose mem_* and docker --memory flags.
# Derived from VM measurement 2026-08-06 (~40 samples / 10m + smoke).
#
# Canonical resource contract (application SF/BE):
#   MemoryReservation / Memory / MemorySwap with MemorySwap == Memory
# Docker Engine rejects setting Memory>0 while MemorySwap remains 0; the
# companion --memory-swap must be passed in the same docker update/create.
#
# Platform limitation (Docker Engine 29.6.1 observed):
#   DOCKER29_RUNTIME_UNLIMITED_ROLLBACK_REQUIRES_RECREATE
#   limited → Memory=0 / MemorySwap=0 via docker update is NOT supported.
#
# Shellcheck: sourceable helpers only.
# shellcheck shell=bash

WOODRIGHT_STOREFRONT_MEMORY_RESERVATION="${WOODRIGHT_STOREFRONT_MEMORY_RESERVATION:-192m}"
WOODRIGHT_STOREFRONT_MEMORY_LIMIT="${WOODRIGHT_STOREFRONT_MEMORY_LIMIT:-512m}"
WOODRIGHT_STOREFRONT_MEMORY_SWAP="${WOODRIGHT_STOREFRONT_MEMORY_SWAP:-${WOODRIGHT_STOREFRONT_MEMORY_LIMIT}}"

WOODRIGHT_BACKEND_MEMORY_RESERVATION="${WOODRIGHT_BACKEND_MEMORY_RESERVATION:-640m}"
WOODRIGHT_BACKEND_MEMORY_LIMIT="${WOODRIGHT_BACKEND_MEMORY_LIMIT:-1536m}"
WOODRIGHT_BACKEND_MEMORY_SWAP="${WOODRIGHT_BACKEND_MEMORY_SWAP:-${WOODRIGHT_BACKEND_MEMORY_LIMIT}}"

WOODRIGHT_STOREFRONT_MEMORY_LIMIT_MIN_MIB=512
WOODRIGHT_BACKEND_MEMORY_LIMIT_MIN_MIB=1024
WOODRIGHT_HOST_MEMORY_RESERVE_MIN_MIB=1536

# Diagnostic token when resource-only unlimited rollback is requested
WOODRIGHT_RESOURCE_ROLLBACK_TO_UNLIMITED_TOKEN="RESOURCE_ROLLBACK_TO_UNLIMITED_REQUIRES_RECREATE"

wr_mem_parse_to_mib() {
  local raw="${1:-}"
  local num unit
  if [[ "$raw" =~ ^([0-9]+)([kKmMgG])[iI]?[bB]?$ ]]; then
    num="${BASH_REMATCH[1]}"
    unit="$(echo "${BASH_REMATCH[2]}" | tr '[:upper:]' '[:lower:]')"
  elif [[ "$raw" =~ ^([0-9]+)$ ]]; then
    echo $((raw / 1048576))
    return 0
  else
    echo "wr_mem: invalid memory value: $raw" >&2
    return 1
  fi
  case "$unit" in
    k) echo $((num / 1024)) ;;
    m) echo "$num" ;;
    g) echo $((num * 1024)) ;;
    *) echo "wr_mem: bad unit in $raw" >&2; return 1 ;;
  esac
}

wr_mem_to_bytes() {
  local mib
  mib="$(wr_mem_parse_to_mib "$1")" || return 1
  if ((mib <= 0)); then
    echo "wr_mem: non-positive MiB from $1" >&2
    return 1
  fi
  echo $((mib * 1048576))
}

# Validate reservation/limit/swap triplet. Accepted policy: swap == limit.
wr_mem_validate_triplet() {
  local kind="$1" reservation="$2" limit="$3" swap="${4:-}"
  local res_mib lim_mib swap_mib min_mib
  [[ -n "$reservation" && -n "$limit" && -n "$swap" ]] || {
    echo "wr_mem: missing reservation/limit/swap ($kind)" >&2
    return 1
  }
  res_mib="$(wr_mem_parse_to_mib "$reservation")" || return 1
  lim_mib="$(wr_mem_parse_to_mib "$limit")" || return 1
  swap_mib="$(wr_mem_parse_to_mib "$swap")" || return 1
  if ((res_mib <= 0 || lim_mib <= 0 || swap_mib <= 0)); then
    echo "wr_mem: zero/negative memory rejected ($kind)" >&2
    return 1
  fi
  if ((res_mib > lim_mib)); then
    echo "wr_mem: reservation $reservation > limit $limit ($kind)" >&2
    return 1
  fi
  if ((swap_mib < lim_mib)); then
    echo "wr_mem: memory_swap $swap < limit $limit ($kind)" >&2
    return 1
  fi
  if ((swap_mib != lim_mib)); then
    echo "wr_mem: accepted policy requires memory_swap == limit (got swap=$swap limit=$limit) ($kind)" >&2
    return 1
  fi
  case "$kind" in
    storefront) min_mib="$WOODRIGHT_STOREFRONT_MEMORY_LIMIT_MIN_MIB" ;;
    backend) min_mib="$WOODRIGHT_BACKEND_MEMORY_LIMIT_MIN_MIB" ;;
    *) echo "wr_mem: unknown kind $kind" >&2; return 1 ;;
  esac
  if ((lim_mib < min_mib)); then
    echo "wr_mem: hard limit $limit below minimum ${min_mib}m for $kind" >&2
    return 1
  fi
  return 0
}

wr_mem_validate_pair() {
  local kind="$1" reservation="$2" limit="$3"
  wr_mem_validate_triplet "$kind" "$reservation" "$limit" "$limit"
}

wr_mem_docker_flags_storefront() {
  local res lim swap
  res="$WOODRIGHT_STOREFRONT_MEMORY_RESERVATION"
  lim="$WOODRIGHT_STOREFRONT_MEMORY_LIMIT"
  swap="${WOODRIGHT_STOREFRONT_MEMORY_SWAP:-$lim}"
  wr_mem_validate_triplet storefront "$res" "$lim" "$swap" || return 1
  printf '%s\n' \
    --memory-reservation "$res" \
    --memory "$lim" \
    --memory-swap "$swap"
}

wr_mem_docker_flags_backend() {
  local res lim swap
  res="$WOODRIGHT_BACKEND_MEMORY_RESERVATION"
  lim="$WOODRIGHT_BACKEND_MEMORY_LIMIT"
  swap="${WOODRIGHT_BACKEND_MEMORY_SWAP:-$lim}"
  wr_mem_validate_triplet backend "$res" "$lim" "$swap" || return 1
  printf '%s\n' \
    --memory-reservation "$res" \
    --memory "$lim" \
    --memory-swap "$swap"
}

# Refuse fake unlimited rollback before any docker mutation.
# Returns 0 if desired is a supported nonzero triplet restore; 1 + token otherwise.
wr_mem_refuse_unlimited_rollback() {
  local cur_memory_bytes="${1:?}" desired_memory_bytes="${2:?}"
  if ((desired_memory_bytes == 0)); then
    if ((cur_memory_bytes > 0)); then
      echo "$WOODRIGHT_RESOURCE_ROLLBACK_TO_UNLIMITED_TOKEN" >&2
      echo "wr_mem: Docker Engine 29.x cannot clear Memory via docker update; recreate required" >&2
      return 1
    fi
  fi
  return 0
}

wr_mem_host_reserve_ok() {
  local total_mib="${1:?}" reservations_mib="${2:?}"
  local left=$((total_mib - reservations_mib))
  if ((left < WOODRIGHT_HOST_MEMORY_RESERVE_MIN_MIB)); then
    echo "wr_mem: host reserve ${left}MiB < min ${WOODRIGHT_HOST_MEMORY_RESERVE_MIN_MIB}MiB" >&2
    return 1
  fi
  return 0
}
