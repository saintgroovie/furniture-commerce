#!/usr/bin/env bash
# Shared canonical exclusive lock for ALL Woodright staging runtime/data mutators.
#
# Canonical path: /srv/woodright/locks/live-cutover.lock
# Metadata (non-mutex): /srv/woodright/locks/live-cutover.lock.meta
#
# Usage (source from mutator scripts):
#   source "$ROOT/ops/lib/woodright-staging-mutation-lock.sh"
#   wr_staging_mutation_lock_acquire actor=... command=... target=...
#
# Nested inherit is allowed ONLY when:
#   WOODRIGHT_STAGING_MUTATION_LOCK_HELD=1 AND lock FD is open AND _WR_STAGING_LOCK_OWNED=1
#   in this shell (or parent exported owned token). Forged env alone is rejected.
#
# Note: do not enable `set -e` here — this file is sourced.

WR_STAGING_MUTATION_LOCK_PATH="${WR_STAGING_MUTATION_LOCK_PATH:-/srv/woodright/locks/live-cutover.lock}"
WR_STAGING_MUTATION_LOCK_META="${WR_STAGING_MUTATION_LOCK_META:-${WR_STAGING_MUTATION_LOCK_PATH}.meta}"
WR_STAGING_MUTATION_LOCK_DIR="$(dirname "$WR_STAGING_MUTATION_LOCK_PATH")"
WR_STAGING_MUTATION_LOCK_TIMEOUT_SEC="${WR_STAGING_MUTATION_LOCK_TIMEOUT_SEC:-30}"
WR_STAGING_MUTATION_LOCK_FD="${WR_STAGING_MUTATION_LOCK_FD:-9}"

_WR_STAGING_LOCK_OWNED="${_WR_STAGING_LOCK_OWNED:-0}"
_WR_STAGING_PREV_TRAP_EXIT="${_WR_STAGING_PREV_TRAP_EXIT-}"
_WR_STAGING_PREV_TRAP_INT="${_WR_STAGING_PREV_TRAP_INT-}"
_WR_STAGING_PREV_TRAP_TERM="${_WR_STAGING_PREV_TRAP_TERM-}"

wr_staging_mutation_lock_log() {
  printf '%s wr_staging_lock %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2
}

wr_staging_mutation_lock_fd_is_open() {
  local fd="$WR_STAGING_MUTATION_LOCK_FD"
  { : >&"$fd"; } 2>/dev/null
}

wr_staging_mutation_lock_write_meta() {
  local actor="${1:-unknown}"
  local command="${2:-}"
  local target="${3:-}"
  local task="${4:-}"
  local env_name="${WOODRIGHT_ENVIRONMENT:-}"
  local hostname_s component digest compose_project be_name sf_name
  hostname_s="$(hostname 2>/dev/null || echo unknown)"
  component="${WOODRIGHT_COMPONENT_SCOPE:-}"
  digest="${WOODRIGHT_TARGET_DIGEST:-$target}"
  compose_project="${WOODRIGHT_COMPOSE_PROJECT:-}"
  be_name="${WOODRIGHT_BE_CONTAINER_DEFAULT:-}"
  sf_name="${WOODRIGHT_SF_CONTAINER_DEFAULT:-}"
  umask 077
  mkdir -p "$(dirname "$WR_STAGING_MUTATION_LOCK_META")" 2>/dev/null || true
  cat >"$WR_STAGING_MUTATION_LOCK_META" <<EOF
{
  "environment": $(printf '%s' "$env_name" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),
  "actor": $(printf '%s' "$actor" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),
  "command": $(printf '%s' "$command" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),
  "pid": $$,
  "ppid": $PPID,
  "uid": $(id -u),
  "user": $(printf '%s' "$(id -un)" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),
  "hostname": $(printf '%s' "$hostname_s" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),
  "started_at_utc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "target": $(printf '%s' "$target" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),
  "target_source_sha": $(printf '%s' "${WOODRIGHT_TARGET_SHA:-}" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),
  "target_component": $(printf '%s' "$component" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),
  "target_digest": $(printf '%s' "$digest" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),
  "compose_project": $(printf '%s' "$compose_project" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),
  "backend_container": $(printf '%s' "$be_name" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),
  "storefront_container": $(printf '%s' "$sf_name" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),
  "task_cycle": $(printf '%s' "$task" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),
  "approved_owner": "Dokploy",
  "lock_path": "$WR_STAGING_MUTATION_LOCK_PATH",
  "note": "metadata is not the mutex; flock on lock_path is authoritative"
}
EOF
  # Fail-closed: metadata environment must match loaded profile when set
  if [[ -n "$env_name" ]]; then
    local meta_env
    meta_env="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("environment") or "")' "$WR_STAGING_MUTATION_LOCK_META" 2>/dev/null || true)"
    if [[ "$meta_env" != "$env_name" ]]; then
      wr_staging_mutation_lock_log "ERROR: lock meta environment mismatch have=$meta_env want=$env_name"
      return 1
    fi
  fi
}

wr_staging_mutation_lock_mark_stale_meta() {
  if [[ -f "$WR_STAGING_MUTATION_LOCK_META" ]]; then
    printf '\n"stale_after_release_at_utc": "%s"\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >>"$WR_STAGING_MUTATION_LOCK_META" 2>/dev/null || true
  fi
}

wr_staging_mutation_lock_release() {
  if [[ "$_WR_STAGING_LOCK_OWNED" != "1" ]]; then
    return 0
  fi
  wr_staging_mutation_lock_mark_stale_meta || true
  local holder_var="WR_STAGING_FCNTL_HOLDER_${WR_STAGING_MUTATION_LOCK_FD}"
  local holder_pid="${!holder_var:-}"
  if [[ -n "$holder_pid" ]]; then
    kill "$holder_pid" 2>/dev/null || true
    wait "$holder_pid" 2>/dev/null || true
    unset "$holder_var" || true
  fi
  eval "exec ${WR_STAGING_MUTATION_LOCK_FD}>&-" 2>/dev/null || true
  _WR_STAGING_LOCK_OWNED=0
  unset WOODRIGHT_STAGING_MUTATION_LOCK_HELD || true
  wr_staging_mutation_lock_log "released path=$WR_STAGING_MUTATION_LOCK_PATH"
}

wr_staging_mutation_lock_on_exit() {
  local rc=$?
  wr_staging_mutation_lock_release || true
  if [[ -n "${_WR_STAGING_PREV_TRAP_EXIT:-}" && "${_WR_STAGING_PREV_TRAP_EXIT}" != "wr_staging_mutation_lock_on_exit" ]]; then
    eval "${_WR_STAGING_PREV_TRAP_EXIT}" || true
  fi
  return "$rc"
}

wr_staging_mutation_lock_on_int() {
  wr_staging_mutation_lock_release || true
  if [[ -n "${_WR_STAGING_PREV_TRAP_INT:-}" ]]; then
    eval "${_WR_STAGING_PREV_TRAP_INT}" || true
  fi
  trap - INT
  kill -INT $$
}

wr_staging_mutation_lock_on_term() {
  wr_staging_mutation_lock_release || true
  if [[ -n "${_WR_STAGING_PREV_TRAP_TERM:-}" ]]; then
    eval "${_WR_STAGING_PREV_TRAP_TERM}" || true
  fi
  trap - TERM
  kill -TERM $$
}

wr_staging_mutation_lock_install_traps() {
  # Preserve prior traps once per ownership acquisition.
  if [[ -z "${_WR_STAGING_TRAPS_INSTALLED:-}" ]]; then
    _WR_STAGING_PREV_TRAP_EXIT="$(trap -p EXIT | sed -n "s/trap -- '\\(.*\\)' EXIT/\\1/p")"
    _WR_STAGING_PREV_TRAP_INT="$(trap -p INT | sed -n "s/trap -- '\\(.*\\)' INT/\\1/p")"
    _WR_STAGING_PREV_TRAP_TERM="$(trap -p TERM | sed -n "s/trap -- '\\(.*\\)' TERM/\\1/p")"
    _WR_STAGING_TRAPS_INSTALLED=1
  fi
  trap 'wr_staging_mutation_lock_on_exit' EXIT
  trap 'wr_staging_mutation_lock_on_int' INT
  trap 'wr_staging_mutation_lock_on_term' TERM
}

wr_staging_mutation_lock_acquire() {
  local actor="unknown"
  local command=""
  local target=""
  local task="${WOODRIGHT_TASK_CYCLE:-}"
  local arg
  for arg in "$@"; do
    case "$arg" in
      actor=*) actor="${arg#actor=}" ;;
      command=*) command="${arg#command=}" ;;
      target=*) target="${arg#target=}" ;;
      task=*) task="${arg#task=}" ;;
    esac
  done

  # Unforgeable inherit: env flag alone is insufficient.
  if [[ "${WOODRIGHT_STAGING_MUTATION_LOCK_HELD:-0}" == "1" ]]; then
    if [[ "$_WR_STAGING_LOCK_OWNED" == "1" ]] && wr_staging_mutation_lock_fd_is_open; then
      wr_staging_mutation_lock_log "inherited_hold actor=$actor path=$WR_STAGING_MUTATION_LOCK_PATH"
      return 0
    fi
    # fcntl-holder path: owned flag set but FD may be unused — require holder pid alive
    local holder_var="WR_STAGING_FCNTL_HOLDER_${WR_STAGING_MUTATION_LOCK_FD}"
    local holder_pid="${!holder_var:-}"
    if [[ "$_WR_STAGING_LOCK_OWNED" == "1" && -n "$holder_pid" ]] && kill -0 "$holder_pid" 2>/dev/null; then
      wr_staging_mutation_lock_log "inherited_hold_fcntl actor=$actor holder=$holder_pid"
      return 0
    fi
    wr_staging_mutation_lock_log "ERROR forged_or_stale WOODRIGHT_STAGING_MUTATION_LOCK_HELD without owned lock FD/holder"
    return 4
  fi

  if [[ "${WR_STAGING_MUTATION_LOCK_ALLOW_NONCANONICAL:-0}" != "1" ]]; then
    case "$WR_STAGING_MUTATION_LOCK_PATH" in
      /srv/woodright/locks/public_demo/live-cutover.lock|\
      /srv/woodright/locks/staging/live-cutover.lock|\
      /srv/woodright/locks/production/live-cutover.lock|\
      /srv/woodright/locks/live-cutover.lock|\
      /srv/woodright/locks/production-cutover.lock) ;;
      *)
        wr_staging_mutation_lock_log "ERROR non-canonical lock path refused: $WR_STAGING_MUTATION_LOCK_PATH"
        return 4
        ;;
    esac
  fi

  mkdir -p "$WR_STAGING_MUTATION_LOCK_DIR" || {
    wr_staging_mutation_lock_log "ERROR cannot create lock dir $WR_STAGING_MUTATION_LOCK_DIR"
    return 4
  }
  : >>"$WR_STAGING_MUTATION_LOCK_PATH" || {
    wr_staging_mutation_lock_log "ERROR cannot create lock file $WR_STAGING_MUTATION_LOCK_PATH"
    return 4
  }

  if command -v flock >/dev/null 2>&1; then
    eval "exec ${WR_STAGING_MUTATION_LOCK_FD}>>\"\$WR_STAGING_MUTATION_LOCK_PATH\""
    if ! flock -x -w "$WR_STAGING_MUTATION_LOCK_TIMEOUT_SEC" "$WR_STAGING_MUTATION_LOCK_FD"; then
      wr_staging_mutation_lock_log "ERROR lock contention path=$WR_STAGING_MUTATION_LOCK_PATH timeout=${WR_STAGING_MUTATION_LOCK_TIMEOUT_SEC}s"
      if [[ -f "$WR_STAGING_MUTATION_LOCK_META" ]]; then
        wr_staging_mutation_lock_log "holder_meta=$(tr '\n' ' ' <"$WR_STAGING_MUTATION_LOCK_META" | head -c 400)"
      fi
      eval "exec ${WR_STAGING_MUTATION_LOCK_FD}>&-" 2>/dev/null || true
      return 3
    fi
  else
    local ready holder_pid
    ready="$(mktemp)"
    python3 - "$WR_STAGING_MUTATION_LOCK_PATH" "$ready" "$WR_STAGING_MUTATION_LOCK_TIMEOUT_SEC" <<'PY' &
import fcntl, os, sys, time
path, ready, timeout = sys.argv[1], sys.argv[2], float(sys.argv[3])
deadline = time.time() + timeout
fd = os.open(path, os.O_RDWR | os.O_CREAT, 0o644)
while True:
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        break
    except BlockingIOError:
        if time.time() >= deadline:
            sys.exit(3)
        time.sleep(0.05)
open(ready, "w").write("1")
while True:
    time.sleep(3600)
PY
    holder_pid=$!
    local waited=0
    while [[ ! -s "$ready" && "$waited" -lt $((WR_STAGING_MUTATION_LOCK_TIMEOUT_SEC * 20 + 5)) ]]; do
      if ! kill -0 "$holder_pid" 2>/dev/null; then
        rm -f "$ready"
        wr_staging_mutation_lock_log "ERROR lock contention (fcntl) path=$WR_STAGING_MUTATION_LOCK_PATH"
        return 3
      fi
      sleep 0.05
      waited=$((waited + 1))
    done
    if [[ ! -s "$ready" ]]; then
      kill "$holder_pid" 2>/dev/null || true
      rm -f "$ready"
      wr_staging_mutation_lock_log "ERROR lock contention (fcntl timeout) path=$WR_STAGING_MUTATION_LOCK_PATH"
      return 3
    fi
    rm -f "$ready"
    eval "WR_STAGING_FCNTL_HOLDER_${WR_STAGING_MUTATION_LOCK_FD}=$holder_pid"
    wr_staging_mutation_lock_log "acquired_via=fcntl_holder pid=$holder_pid"
  fi

  _WR_STAGING_LOCK_OWNED=1
  export WOODRIGHT_STAGING_MUTATION_LOCK_HELD=1
  wr_staging_mutation_lock_write_meta "$actor" "$command" "$target" "$task" || true
  wr_staging_mutation_lock_install_traps
  wr_staging_mutation_lock_log "acquired actor=$actor path=$WR_STAGING_MUTATION_LOCK_PATH pid=$$"
  return 0
}
