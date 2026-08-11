#!/usr/bin/env bash
# Helper: hold a bounded validation freeze for official QA/validation cycles.
# Usage:
#   source ops/lib/woodright-hold-validation-freeze.sh
#   wr_hold_validation_freeze_for_command <env> <actor> <cycle> <reason> <ttl_sec> -- <command...>
#
# Allowed <env>: staging | public_demo
# Buyer demo woodright-demo.ru is public_demo (not an alias of staging).
# Does not overwrite an active foreign lease (different actor/cycle/pid).
# Releases only the lease this call owns. Ordinary one-off curls need no freeze.
# Mutex uses Python fcntl LOCK_EX (Linux VM + macOS fidelity).
# Metadata is passed via environment variables (no shell interpolation into snippets).
# shellcheck shell=bash

_WR_HOLD_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=woodright-validation-freeze.sh
source "${_WR_HOLD_DIR}/woodright-validation-freeze.sh"

wr_validation_freeze_mutex_path() {
  local env_name="${1:?}"
  printf '%s/validation-freeze-%s.mutex\n' "${WOODRIGHT_VALIDATION_FREEZE_DIR%/}" "$env_name"
}

_wr_freeze_crit_acquire() {
  local env_name="${WOODRIGHT_FREEZE_CRIT_ENV:?}"
  local actor="${WOODRIGHT_FREEZE_CRIT_ACTOR:?}"
  local cycle="${WOODRIGHT_FREEZE_CRIT_CYCLE:?}"
  local reason="${WOODRIGHT_FREEZE_CRIT_REASON:?}"
  local ttl_sec="${WOODRIGHT_FREEZE_CRIT_TTL:?}"
  local owner_pid="${WOODRIGHT_FREEZE_CRIT_OWNER_PID:?}"
  local path foreign
  path="$(wr_validation_freeze_path "$env_name")"
  if wr_validation_freeze_active "$env_name"; then
    foreign="$(python3 - "$path" "$actor" "$cycle" "$owner_pid" <<'PY' 2>/dev/null || echo FOREIGN
import json,sys
d=json.load(open(sys.argv[1]))
actor,cycle,pid=sys.argv[2:5]
if d.get("actor")==actor and d.get("cycle")==cycle and str(d.get("pid"))==str(pid):
  print("SAME_HOLDER")
else:
  print("FOREIGN")
PY
)"
    if [[ "$foreign" == "FOREIGN" ]]; then
      echo "ERROR: active validation freeze owned by another holder; refuse overwrite" >&2
      return 1
    fi
  fi
  wr_validation_freeze_acquire "$env_name" "$actor" "$cycle" "$reason" "$ttl_sec"
  python3 - "$path" "$owner_pid" <<'PY'
import json,sys
path,pid=sys.argv[1:3]
d=json.load(open(path))
d["pid"]=int(pid)
open(path,"w",encoding="utf-8").write(json.dumps(d,indent=2)+"\n")
PY
}

_wr_freeze_crit_release() {
  local env_name="${WOODRIGHT_FREEZE_CRIT_ENV:?}"
  local actor="${WOODRIGHT_FREEZE_CRIT_ACTOR:?}"
  local cycle="${WOODRIGHT_FREEZE_CRIT_CYCLE:?}"
  local pid="${WOODRIGHT_FREEZE_CRIT_OWNER_PID:?}"
  local path
  path="$(wr_validation_freeze_path "$env_name")"
  [[ -f "$path" ]] || return 0
  if ! python3 - "$path" "$actor" "$cycle" "$pid" <<'PY'
import json,sys
path,actor,cycle,pid=sys.argv[1:5]
d=json.load(open(path))
if str(d.get("actor"))!=actor or str(d.get("cycle"))!=cycle or str(d.get("pid"))!=str(pid):
  raise SystemExit(1)
PY
  then
    echo "ERROR: refusing to release freeze lease without ownership match" >&2
    return 1
  fi
  rm -f "$path"
  echo "validation_freeze released (owned) path=$path" >&2
}

wr_validation_freeze_critical_env() {
  local mutex="$1"
  mkdir -p "$(dirname "$mutex")"
  WOODRIGHT_FREEZE_CRIT_LIB="${_WR_HOLD_DIR}" \
  python3 - "$mutex" <<'PY'
import fcntl, os, subprocess, sys
mutex = sys.argv[1]
lib = os.environ["WOODRIGHT_FREEZE_CRIT_LIB"]
op = os.environ["WOODRIGHT_FREEZE_CRIT_OP"]
with open(mutex, "a+", encoding="utf-8") as fh:
    fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
    cmd = (
        f"set -euo pipefail\n"
        f"source '{lib}/woodright-validation-freeze.sh'\n"
        f"source '{lib}/woodright-hold-validation-freeze.sh'\n"
        f"_wr_freeze_crit_{op}\n"
    )
    rc = subprocess.call(["bash", "-c", cmd], env=os.environ.copy())
    raise SystemExit(rc)
PY
}

wr_validation_freeze_acquire_owned() {
  local env_name="${1:?}"
  local actor="${2:?}"
  local cycle="${3:?}"
  local reason="${4:?}"
  local ttl_sec="${5:-1800}"
  local owner_pid="${6:-$$}"
  export WOODRIGHT_FREEZE_CRIT_OP=acquire
  export WOODRIGHT_FREEZE_CRIT_ENV="$env_name"
  export WOODRIGHT_FREEZE_CRIT_ACTOR="$actor"
  export WOODRIGHT_FREEZE_CRIT_CYCLE="$cycle"
  export WOODRIGHT_FREEZE_CRIT_REASON="$reason"
  export WOODRIGHT_FREEZE_CRIT_TTL="$ttl_sec"
  export WOODRIGHT_FREEZE_CRIT_OWNER_PID="$owner_pid"
  wr_validation_freeze_critical_env "$(wr_validation_freeze_mutex_path "$env_name")"
}

wr_validation_freeze_release_owned() {
  local env_name="${1:?}"
  local actor="${2:?}"
  local cycle="${3:?}"
  local pid="${4:?}"
  export WOODRIGHT_FREEZE_CRIT_OP=release
  export WOODRIGHT_FREEZE_CRIT_ENV="$env_name"
  export WOODRIGHT_FREEZE_CRIT_ACTOR="$actor"
  export WOODRIGHT_FREEZE_CRIT_CYCLE="$cycle"
  export WOODRIGHT_FREEZE_CRIT_OWNER_PID="$pid"
  wr_validation_freeze_critical_env "$(wr_validation_freeze_mutex_path "$env_name")"
}

wr_hold_validation_freeze_for_command() {
  local env_name="${1:?}"; shift
  local actor="${1:?}"; shift
  local cycle="${1:?}"; shift
  local reason="${1:?}"; shift
  local ttl_sec="${1:?}"; shift
  local rc=0
  local owner_pid
  local had_errexit=0
  [[ "${1:-}" == "--" ]] || {
    echo "usage: wr_hold_validation_freeze_for_command <env> <actor> <cycle> <reason> <ttl> -- <cmd...>" >&2
    return 2
  }
  shift
  case "$env_name" in
    staging|public_demo) ;;
    *)
      echo "ERROR: hold helper only supports staging|public_demo (got $env_name)" >&2
      return 1
      ;;
  esac
  wr_validation_freeze_acquire_owned "$env_name" "$actor" "$cycle" "$reason" "$ttl_sec" "$$" || return 1
  owner_pid=$$
  case $- in *e*) had_errexit=1 ;; esac
  if "$@"; then
    rc=0
  else
    rc=$?
  fi
  if [[ "$had_errexit" -eq 1 ]]; then set -e; else set +e; fi
  wr_validation_freeze_release_owned "$env_name" "$actor" "$cycle" "$owner_pid" || true
  return "$rc"
}
