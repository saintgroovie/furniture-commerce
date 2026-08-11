#!/usr/bin/env bash
# Woodright mutation process lifecycle helper (local phase control).
#
# Purpose: prevent AUTHORIZED_MUTATION_PROCESS_OUTLIVED_FOREGROUND_CONTROL_AND_RACED_NEXT_PHASE
# by tracking mutation phases and refusing advance/retry when completion is unknown.
#
# This is NOT a remote SSH orchestrator and does NOT prove a disconnected remote
# process was killed. Safety comes from durable phase state + fail-closed gates.
#
# Usage (source; do not enable set -e in this file):
#   source "$ROOT/ops/lib/woodright-mutation-process-lifecycle.sh"
#   wr_mutation_phase_begin run_id=... scope=... journal_dir=...
#   wr_mutation_phase_run_foreground -- command args...
#   wr_mutation_phase_assert_ready_to_advance
#   wr_mutation_phase_assert_ready_to_retry   # optional before retry
#
# States: NOT_STARTED | RUNNING | COMPLETED_SUCCESSFULLY | FAILED | ABORTED | COMPLETION_UNKNOWN

_WR_MUT_JOURNAL=""
_WR_MUT_RUN_ID=""
_WR_MUT_SCOPE=""
_WR_MUT_CHILD_PID=""
_WR_MUT_PGID=""

wr_mutation_phase_log() {
  printf '%s wr_mutation_lifecycle %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2
}

wr_mutation_phase_journal_path() {
  printf '%s/mutation-phase.json' "$_WR_MUT_JOURNAL"
}

wr_mutation_phase_write() {
  local state="$1"
  local exit_status="${2-}"
  local extra_note="${3-}"
  local path started completed pid pgid
  path="$(wr_mutation_phase_journal_path)"
  started="${_WR_MUT_STARTED_UTC:-}"
  completed="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  pid="${_WR_MUT_CHILD_PID:-}"
  pgid="${_WR_MUT_PGID:-}"
  umask 077
  mkdir -p "$_WR_MUT_JOURNAL" 2>/dev/null || true
  python3 - "$path" "$state" "$_WR_MUT_RUN_ID" "$_WR_MUT_SCOPE" "$started" "$completed" "$pid" "$pgid" "$exit_status" "$extra_note" <<'PY'
import json, sys
path, state, run_id, scope, started, completed, pid, pgid, exit_status, note = sys.argv[1:]
doc = {
  "run_id": run_id,
  "resource_scope": scope,
  "state": state,
  "started_at_utc": started or None,
  "completed_at_utc": completed if state != "RUNNING" else None,
  "wrapper_pid": None,
  "child_pid": int(pid) if pid.isdigit() else (pid or None),
  "child_pgid": int(pgid) if pgid.isdigit() else (pgid or None),
  "exit_status": None if exit_status == "" else int(exit_status) if exit_status.lstrip("-").isdigit() else exit_status,
  "completion_confidence": "high" if state in ("COMPLETED_SUCCESSFULLY", "FAILED", "ABORTED") else ("unknown" if state == "COMPLETION_UNKNOWN" else "n/a"),
  "note": note or None,
}
# preserve wrapper_pid if rewriting
try:
  prev = json.load(open(path))
  if prev.get("wrapper_pid") is not None:
    doc["wrapper_pid"] = prev.get("wrapper_pid")
except Exception:
  pass
if doc["wrapper_pid"] is None:
  import os
  doc["wrapper_pid"] = os.getpid()
open(path, "w").write(json.dumps(doc, indent=2) + "\n")
PY
}

wr_mutation_phase_read_state() {
  local path
  path="$(wr_mutation_phase_journal_path)"
  if [[ ! -f "$path" ]]; then
    printf 'NOT_STARTED'
    return 0
  fi
  python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("state") or "NOT_STARTED")' "$path"
}

wr_mutation_phase_begin() {
  local run_id="" scope="" journal_dir=""
  local arg
  for arg in "$@"; do
    case "$arg" in
      run_id=*) run_id="${arg#run_id=}" ;;
      scope=*) scope="${arg#scope=}" ;;
      journal_dir=*) journal_dir="${arg#journal_dir=}" ;;
      *)
        wr_mutation_phase_log "ERROR: unknown begin arg=$arg"
        return 2
        ;;
    esac
  done
  if [[ -z "$run_id" || -z "$scope" || -z "$journal_dir" ]]; then
    wr_mutation_phase_log "ERROR: require run_id= scope= journal_dir="
    return 2
  fi
  _WR_MUT_RUN_ID="$run_id"
  _WR_MUT_SCOPE="$scope"
  _WR_MUT_JOURNAL="$journal_dir"
  # Fail closed: do not clobber unresolved lifecycle evidence or a still-live child,
  # regardless of journal state label (including NOT_STARTED / unrecognized).
  if [[ -f "$(wr_mutation_phase_journal_path)" ]]; then
    local prior
    prior="$(wr_mutation_phase_read_state)"
    case "$prior" in
      RUNNING|COMPLETION_UNKNOWN)
        wr_mutation_phase_log "ERROR: refuse begin over unresolved state=$prior"
        return 15
        ;;
    esac
    if ! wr_mutation_phase_process_terminated; then
      wr_mutation_phase_log "ERROR: refuse begin; prior state=$prior but child/pg still alive"
      return 16
    fi
  fi
  _WR_MUT_CHILD_PID=""
  _WR_MUT_PGID=""
  _WR_MUT_STARTED_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  wr_mutation_phase_write "NOT_STARTED" "" "phase begin"
  wr_mutation_phase_log "begin run_id=$run_id scope=$scope journal=$journal_dir"
}

# Mark transport/control loss: never map to FAILED/SUCCESS.
wr_mutation_phase_mark_completion_unknown() {
  local reason="${1:-transport_or_control_channel_loss}"
  wr_mutation_phase_write "COMPLETION_UNKNOWN" "" "$reason"
  wr_mutation_phase_log "COMPLETION_UNKNOWN reason=$reason"
  return 0
}

wr_mutation_phase_pg_remaining() {
  local pgid="${1:-}"
  [[ -n "$pgid" ]] || return 1
  # macOS/Linux: any live member of the child process group.
  pgrep -g "$pgid" >/dev/null 2>&1
}

wr_mutation_phase_read_pgid() {
  python3 -c 'import json,sys; v=json.load(open(sys.argv[1])).get("child_pgid"); print(v if v not in (None,"") else "")' "$(wr_mutation_phase_journal_path)" 2>/dev/null || true
}

# Run command in foreground; wait; record exit. On waiter interruption, mark UNKNOWN.
wr_mutation_phase_run_foreground() {
  if [[ "${1:-}" == "--" ]]; then
    shift
  fi
  if [[ "$#" -lt 1 ]]; then
    wr_mutation_phase_log "ERROR: run_foreground requires a command"
    return 2
  fi
  # Enforce retry/overlap gate inside the entry point (not only via optional assert).
  # Capture status before `if !` — under bash, `return $?` after a successful `if !`
  # test would incorrectly return 0.
  local gate_rc=0
  wr_mutation_phase_assert_ready_to_retry || gate_rc=$?
  if [[ "$gate_rc" -ne 0 ]]; then
    return "$gate_rc"
  fi
  local state
  state="$(wr_mutation_phase_read_state)"
  if [[ "$state" == "RUNNING" ]]; then
    wr_mutation_phase_log "ERROR: mutation already RUNNING; refuse overlapping start"
    return 3
  fi
  if [[ "$state" == "COMPLETION_UNKNOWN" ]]; then
    wr_mutation_phase_log "ERROR: prior COMPLETION_UNKNOWN; reconcile before new run"
    return 4
  fi

  wr_mutation_phase_write "RUNNING" "" "foreground start"
  # Own process group via setpgrp (not shell job-control). Ready-file sync avoids
  # reading PGID before setpgrp runs (which falsely matched the wrapper PGID).
  local _wr_ready parent_pgid
  _wr_ready="$(mktemp "${TMPDIR:-/tmp}/wr-mut-ready.XXXXXX")"
  rm -f "$_wr_ready"
  parent_pgid="$(ps -o pgid= -p $$ 2>/dev/null | tr -d ' ')"
  python3 -c '
import os, sys
ready, cmd = sys.argv[1], sys.argv[2:]
os.setpgrp()
with open(ready, "w", encoding="utf-8") as f:
    f.write("%d\n%d\n" % (os.getpid(), os.getpgrp()))
    f.flush()
    os.fsync(f.fileno())
os.execvp(cmd[0], cmd)
' "$_wr_ready" "$@" &
  _WR_MUT_CHILD_PID=$!
  local _i
  for _i in $(seq 1 100); do
    if [[ -s "$_wr_ready" ]]; then
      break
    fi
    if ! kill -0 "$_WR_MUT_CHILD_PID" 2>/dev/null; then
      break
    fi
    sleep 0.02
  done
  if [[ -s "$_wr_ready" ]]; then
    _WR_MUT_PGID="$(sed -n '2p' "$_wr_ready" | tr -d '[:space:]')"
  else
    _WR_MUT_PGID="$(ps -o pgid= -p "$_WR_MUT_CHILD_PID" 2>/dev/null | tr -d ' ' || true)"
  fi
  rm -f "$_wr_ready"
  if [[ -z "${_WR_MUT_PGID:-}" ]]; then
    _WR_MUT_PGID="$_WR_MUT_CHILD_PID"
  fi
  # Refuse if child remained in the wrapper process group (setpgrp failed / raced).
  if [[ -n "$parent_pgid" && "$_WR_MUT_PGID" == "$parent_pgid" ]]; then
    wr_mutation_phase_log "ERROR: child remained in wrapper pgid=$parent_pgid; refuse"
    wait "$_WR_MUT_CHILD_PID" 2>/dev/null || true
    wr_mutation_phase_mark_completion_unknown "unsafe_pgid_shared_with_wrapper"
    _WR_MUT_CHILD_PID=""
    _WR_MUT_PGID=""
    return 18
  fi
  wr_mutation_phase_write "RUNNING" "" "foreground child_pid=$_WR_MUT_CHILD_PID pgid=${_WR_MUT_PGID:-}"

  # Errexit-safe status capture: never let bare `wait` abort the caller before journaling.
  local rc=0
  wait "$_WR_MUT_CHILD_PID" || rc=$?

  # Transport/control-loss class: never map to ordinary SUCCESS/FAILED.
  if [[ "$rc" -eq 129 || "$rc" -eq 130 || "$rc" -eq 137 || "$rc" -eq 143 || "$rc" -eq 255 ]]; then
    wr_mutation_phase_mark_completion_unknown "waiter_exit_$rc"
    return 5
  fi

  # Background-escape: leader exited but process-group members remain.
  if [[ -n "${_WR_MUT_PGID:-}" ]] && wr_mutation_phase_pg_remaining "$_WR_MUT_PGID"; then
    wr_mutation_phase_log "ERROR: descendant(s) outlived wrapper pgid=$_WR_MUT_PGID - fail closed"
    # Best-effort stop leftovers; still mark UNKNOWN (outcome of intended mutation not known).
    kill -TERM "-$_WR_MUT_PGID" 2>/dev/null || true
    sleep 0.2
    kill -KILL "-$_WR_MUT_PGID" 2>/dev/null || true
    wr_mutation_phase_mark_completion_unknown "background_escape_descendants_detected"
    _WR_MUT_CHILD_PID=""
    _WR_MUT_PGID=""
    return 17
  fi

  if [[ "$rc" -eq 0 ]]; then
    wr_mutation_phase_write "COMPLETED_SUCCESSFULLY" "$rc" "foreground exit"
  else
    wr_mutation_phase_write "FAILED" "$rc" "foreground exit"
  fi
  _WR_MUT_CHILD_PID=""
  _WR_MUT_PGID=""
  return "$rc"
}

# Simulate/record transport loss while RUNNING (tests / SSH wrappers).
wr_mutation_phase_signal_transport_loss() {
  local state
  state="$(wr_mutation_phase_read_state)"
  if [[ "$state" != "RUNNING" && "$state" != "NOT_STARTED" ]]; then
    wr_mutation_phase_log "WARN: transport loss in state=$state"
  fi
  wr_mutation_phase_mark_completion_unknown "broken_pipe_or_ssh_exit_255"
}

wr_mutation_phase_process_terminated() {
  local pid="${1:-}"
  local pgid=""
  if [[ -z "$pid" ]]; then
    pid="$(python3 -c 'import json,sys; v=json.load(open(sys.argv[1])).get("child_pid"); print(v if v not in (None,"") else "")' "$(wr_mutation_phase_journal_path)" 2>/dev/null || true)"
  fi
  pgid="$(wr_mutation_phase_read_pgid)"
  if [[ -n "$pgid" ]] && wr_mutation_phase_pg_remaining "$pgid"; then
    return 1
  fi
  if [[ -z "$pid" || "$pid" == "None" ]]; then
    # No child recorded: RUNNING is not terminated; COMPLETION_UNKNOWN means no
    # known live pid to wait on (caller must still reconcile outcome before retry).
    local state
    state="$(wr_mutation_phase_read_state)"
    case "$state" in
      COMPLETED_SUCCESSFULLY|FAILED|ABORTED|COMPLETION_UNKNOWN) return 0 ;;
      RUNNING) return 1 ;;
      *) return 0 ;;
    esac
  fi
  if kill -0 "$pid" 2>/dev/null; then
    return 1
  fi
  return 0
}

wr_mutation_phase_assert_ready_to_advance() {
  local state
  state="$(wr_mutation_phase_read_state)"
  case "$state" in
    COMPLETED_SUCCESSFULLY|FAILED|ABORTED)
      if wr_mutation_phase_process_terminated; then
        wr_mutation_phase_log "advance_ok state=$state"
        return 0
      fi
      wr_mutation_phase_log "ERROR: state=$state but child still alive"
      return 6
      ;;
    COMPLETION_UNKNOWN)
      wr_mutation_phase_log "ERROR: COMPLETION_UNKNOWN blocks advance/relock/verify"
      return 7
      ;;
    RUNNING)
      wr_mutation_phase_log "ERROR: RUNNING blocks advance (race with mutator)"
      return 8
      ;;
    NOT_STARTED)
      wr_mutation_phase_log "ERROR: NOT_STARTED — no mutation completion to advance from"
      return 9
      ;;
    *)
      wr_mutation_phase_log "ERROR: unknown state=$state"
      return 10
      ;;
  esac
}

wr_mutation_phase_assert_ready_to_retry() {
  local state
  state="$(wr_mutation_phase_read_state)"
  if [[ "$state" == "RUNNING" ]]; then
    wr_mutation_phase_log "ERROR: retry blocked while RUNNING"
    return 11
  fi
  if [[ "$state" == "COMPLETION_UNKNOWN" ]]; then
    local pid
    pid="$(python3 -c 'import json,sys; v=json.load(open(sys.argv[1])).get("child_pid"); print(v if v not in (None,"") else "")' "$(wr_mutation_phase_journal_path)" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      wr_mutation_phase_log "ERROR: retry blocked; COMPLETION_UNKNOWN and process still alive"
      return 12
    fi
    wr_mutation_phase_log "ERROR: retry blocked until COMPLETION_UNKNOWN reconciled to known terminal state"
    return 13
  fi
  if ! wr_mutation_phase_process_terminated; then
    wr_mutation_phase_log "ERROR: retry blocked; previous child still alive"
    return 14
  fi
  wr_mutation_phase_log "retry_ok state=$state"
  return 0
}

wr_mutation_phase_mark_aborted() {
  wr_mutation_phase_write "ABORTED" "" "${1:-aborted}"
}
