#!/usr/bin/env bash
# Woodright container memory limit policy (Wave 1 application SF/BE).
# Bytes and human units for Compose mem_* and docker --memory flags.
# Derived from VM measurement 2026-08-06 (~40 samples / 10m + smoke):
#   storefront cgroup peak ~189 - 193 MiB; backend cgroup peak ~576 - 638 MiB.
# Shellcheck: sourceable helpers only.
# shellcheck shell=bash

# Storefront (Next.js): reservation >= 1.25×P95; hard >= max(1.75×peak, 512MiB)
WOODRIGHT_STOREFRONT_MEMORY_RESERVATION="${WOODRIGHT_STOREFRONT_MEMORY_RESERVATION:-192m}"
WOODRIGHT_STOREFRONT_MEMORY_LIMIT="${WOODRIGHT_STOREFRONT_MEMORY_LIMIT:-512m}"

# Medusa backend: reservation >= 1.25×P95; hard >= max(2×peak, 1GiB) → 1536m headroom
WOODRIGHT_BACKEND_MEMORY_RESERVATION="${WOODRIGHT_BACKEND_MEMORY_RESERVATION:-640m}"
WOODRIGHT_BACKEND_MEMORY_LIMIT="${WOODRIGHT_BACKEND_MEMORY_LIMIT:-1536m}"

# Minimum accepted hard limits (fail-closed validation)
WOODRIGHT_STOREFRONT_MEMORY_LIMIT_MIN_MIB=512
WOODRIGHT_BACKEND_MEMORY_LIMIT_MIN_MIB=1024

# Host reserve target for capacity tests (MiB) on ~8 GiB dual-stack VM
WOODRIGHT_HOST_MEMORY_RESERVE_MIN_MIB=1536

wr_mem_parse_to_mib() {
  local raw="${1:-}"
  local num unit
  if [[ "$raw" =~ ^([0-9]+)([kKmMgG])[iI]?[bB]?$ ]]; then
    num="${BASH_REMATCH[1]}"
    unit="$(echo "${BASH_REMATCH[2]}" | tr '[:upper:]' '[:lower:]')"
  elif [[ "$raw" =~ ^([0-9]+)$ ]]; then
    # bare integer = bytes
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

wr_mem_validate_pair() {
  local kind="$1" reservation="$2" limit="$3"
  local res_mib lim_mib min_mib
  res_mib="$(wr_mem_parse_to_mib "$reservation")" || return 1
  lim_mib="$(wr_mem_parse_to_mib "$limit")" || return 1
  if ((res_mib <= 0 || lim_mib <= 0)); then
    echo "wr_mem: zero/negative memory rejected ($kind)" >&2
    return 1
  fi
  if ((res_mib > lim_mib)); then
    echo "wr_mem: reservation $reservation > limit $limit ($kind)" >&2
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

wr_mem_docker_flags_storefront() {
  wr_mem_validate_pair storefront \
    "$WOODRIGHT_STOREFRONT_MEMORY_RESERVATION" \
    "$WOODRIGHT_STOREFRONT_MEMORY_LIMIT" || return 1
  printf '%s\n' \
    --memory-reservation "$WOODRIGHT_STOREFRONT_MEMORY_RESERVATION" \
    --memory "$WOODRIGHT_STOREFRONT_MEMORY_LIMIT"
}

wr_mem_docker_flags_backend() {
  wr_mem_validate_pair backend \
    "$WOODRIGHT_BACKEND_MEMORY_RESERVATION" \
    "$WOODRIGHT_BACKEND_MEMORY_LIMIT" || return 1
  printf '%s\n' \
    --memory-reservation "$WOODRIGHT_BACKEND_MEMORY_RESERVATION" \
    --memory "$WOODRIGHT_BACKEND_MEMORY_LIMIT"
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
