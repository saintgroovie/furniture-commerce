#!/usr/bin/env bash
# Fidelity + failure-injection for ops/lib/woodright-mutation-process-lifecycle.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=/dev/null
source "$ROOT/ops/lib/woodright-mutation-process-lifecycle.sh"

PASS=0
FAIL=0
assert_eq() {
  local name="$1" got="$2" want="$3"
  if [[ "$got" == "$want" ]]; then
    echo "PASS $name"
    PASS=$((PASS + 1))
  else
    echo "FAIL $name got=$got want=$want"
    FAIL=$((FAIL + 1))
  fi
}
assert_rc() {
  local name="$1" got="$2" want="$3"
  if [[ "$got" -eq "$want" ]]; then
    echo "PASS $name rc=$got"
    PASS=$((PASS + 1))
  else
    echo "FAIL $name rc=$got want=$want"
    FAIL=$((FAIL + 1))
  fi
}

TMP="$(mktemp -d /tmp/wr-mut-lifecycle-XXXXXX)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

# --- Normal mutation completion ---
J1="$TMP/j1"
wr_mutation_phase_begin run_id=t1 scope=test-normal journal_dir="$J1"
set +e
wr_mutation_phase_run_foreground -- true
rc=$?
set -e
assert_rc normal_exit "$rc" 0
st="$(wr_mutation_phase_read_state)"
assert_eq normal_state "$st" "COMPLETED_SUCCESSFULLY"
set +e
wr_mutation_phase_assert_ready_to_advance
arc=$?
set -e
assert_rc normal_advance "$arc" 0

# --- Non-zero known failure (not UNKNOWN) ---
J2="$TMP/j2"
wr_mutation_phase_begin run_id=t2 scope=test-fail journal_dir="$J2"
set +e
wr_mutation_phase_run_foreground -- false
rc=$?
set -e
assert_rc fail_exit_nonzero "$rc" 1
st="$(wr_mutation_phase_read_state)"
assert_eq fail_state "$st" "FAILED"
set +e
wr_mutation_phase_assert_ready_to_advance
arc=$?
set -e
assert_rc fail_advance_allowed "$arc" 0

# --- SSH/transport failure simulation -> COMPLETION_UNKNOWN blocks advance ---
J3="$TMP/j3"
wr_mutation_phase_begin run_id=t3 scope=test-transport journal_dir="$J3"
wr_mutation_phase_write "RUNNING" "" "simulated"
wr_mutation_phase_signal_transport_loss
st="$(wr_mutation_phase_read_state)"
assert_eq transport_state "$st" "COMPLETION_UNKNOWN"
set +e
wr_mutation_phase_assert_ready_to_advance
arc=$?
set -e
assert_rc transport_blocks_advance "$arc" 7
set +e
wr_mutation_phase_assert_ready_to_retry
rrc=$?
set -e
# retry blocked while UNKNOWN even if no live pid
assert_rc transport_blocks_retry "$rrc" 13

# --- Long-running process: verifier must not race ---
J4="$TMP/j4"
wr_mutation_phase_begin run_id=t4 scope=test-race journal_dir="$J4"
# start sleeper as child via helper internals
(
  # shellcheck disable=SC2030
  wr_mutation_phase_write "RUNNING" "" "race"
  sleep 30 &
  echo $! >"$TMP/sleeper.pid"
  wr_mutation_phase_write "RUNNING" "" "race"
  # patch child_pid into journal
  python3 - "$J4/mutation-phase.json" "$(cat "$TMP/sleeper.pid")" <<'PY'
import json,sys
p,pid=sys.argv[1],int(sys.argv[2])
d=json.load(open(p)); d["child_pid"]=pid; d["state"]="RUNNING"
open(p,"w").write(json.dumps(d,indent=2)+"\n")
PY
)
set +e
wr_mutation_phase_assert_ready_to_advance
arc=$?
set -e
assert_rc race_blocks_advance "$arc" 8
# cleanup sleeper
kill "$(cat "$TMP/sleeper.pid")" 2>/dev/null || true
wait "$(cat "$TMP/sleeper.pid")" 2>/dev/null || true

# --- Retry while previous child alive ---
J5="$TMP/j5"
wr_mutation_phase_begin run_id=t5 scope=test-retry-alive journal_dir="$J5"
sleep 30 &
echo $! >"$TMP/alive.pid"
python3 - "$J5/mutation-phase.json" "$(cat "$TMP/alive.pid")" <<'PY'
import json,sys,os
p,pid=sys.argv[1],int(sys.argv[2])
d={"run_id":"t5","resource_scope":"test-retry-alive","state":"FAILED","child_pid":pid,"exit_status":1,"wrapper_pid":os.getpid(),"completion_confidence":"high"}
open(p,"w").write(json.dumps(d,indent=2)+"\n")
PY
_WR_MUT_JOURNAL="$J5"
set +e
wr_mutation_phase_assert_ready_to_retry
rrc=$?
set -e
assert_rc retry_blocked_while_alive "$rrc" 14
kill "$(cat "$TMP/alive.pid")" 2>/dev/null || true
wait "$(cat "$TMP/alive.pid")" 2>/dev/null || true
set +e
wr_mutation_phase_assert_ready_to_retry
rrc=$?
set -e
assert_rc retry_ok_after_dead "$rrc" 0

# --- Broken-pipe / exit 255 maps to COMPLETION_UNKNOWN via run_foreground ---
J6="$TMP/j6"
wr_mutation_phase_begin run_id=t6 scope=test-255 journal_dir="$J6"
set +e
wr_mutation_phase_run_foreground -- sh -c 'exit 255'
rc=$?
set -e
st="$(wr_mutation_phase_read_state)"
assert_eq exit255_state "$st" "COMPLETION_UNKNOWN"
assert_rc exit255_helper_rc "$rc" 5
set +e
wr_mutation_phase_assert_ready_to_advance
arc=$?
set -e
assert_rc exit255_blocks_advance "$arc" 7

# --- Real background-escape: leader exits while descendant remains ---
J7="$TMP/j7"
wr_mutation_phase_begin run_id=t7 scope=test-bg-escape journal_dir="$J7"
set +e
wr_mutation_phase_run_foreground -- sh -c 'sleep 60 >/dev/null 2>&1 & exit 0'
rc=$?
set -e
st="$(wr_mutation_phase_read_state)"
assert_eq bg_escape_state "$st" "COMPLETION_UNKNOWN"
assert_rc bg_escape_helper_rc "$rc" 17
set +e
wr_mutation_phase_assert_ready_to_advance
arc=$?
set -e
assert_rc bg_escape_blocks_advance "$arc" 7
set +e
wr_mutation_phase_assert_ready_to_retry
rrc=$?
set -e
assert_rc bg_escape_blocks_retry "$rrc" 13
# begin must refuse over unresolved UNKNOWN
set +e
wr_mutation_phase_begin run_id=t7b scope=test-bg-escape journal_dir="$J7"
brc=$?
set -e
assert_rc begin_refuses_unknown "$brc" 15

# --- run_foreground refuses retry while prior FAILED child still alive ---
J8="$TMP/j8"
wr_mutation_phase_begin run_id=t8 scope=test-run-overlap journal_dir="$J8"
sleep 30 &
echo $! >"$TMP/overlap.pid"
python3 - "$J8/mutation-phase.json" "$(cat "$TMP/overlap.pid")" <<'PY'
import json,sys,os
p,pid=sys.argv[1],int(sys.argv[2])
d={"run_id":"t8","resource_scope":"test-run-overlap","state":"FAILED","child_pid":pid,"exit_status":1,"wrapper_pid":os.getpid(),"completion_confidence":"high"}
open(p,"w").write(json.dumps(d,indent=2)+"\n")
PY
_WR_MUT_JOURNAL="$J8"
set +e
wr_mutation_phase_run_foreground -- true
orc=$?
set -e
assert_rc run_refuses_live_prior "$orc" 14
kill "$(cat "$TMP/overlap.pid")" 2>/dev/null || true
wait "$(cat "$TMP/overlap.pid")" 2>/dev/null || true

# --- begin refuses live child even when state label is NOT_STARTED ---
J9="$TMP/j9"
wr_mutation_phase_begin run_id=t9 scope=test-begin-live journal_dir="$J9"
sleep 30 &
echo $! >"$TMP/beginlive.pid"
python3 - "$J9/mutation-phase.json" "$(cat "$TMP/beginlive.pid")" <<'PY'
import json,sys,os
p,pid=sys.argv[1],int(sys.argv[2])
d={"run_id":"t9","resource_scope":"test-begin-live","state":"NOT_STARTED","child_pid":pid,"wrapper_pid":os.getpid(),"completion_confidence":"n/a"}
open(p,"w").write(json.dumps(d,indent=2)+"\n")
PY
_WR_MUT_JOURNAL="$J9"
set +e
wr_mutation_phase_begin run_id=t9b scope=test-begin-live journal_dir="$J9"
brc=$?
set -e
assert_rc begin_refuses_live_not_started "$brc" 16
kill "$(cat "$TMP/beginlive.pid")" 2>/dev/null || true
wait "$(cat "$TMP/beginlive.pid")" 2>/dev/null || true

# --- Timeout exit 124 maps to COMPLETION_UNKNOWN (not ordinary FAILED) ---
J10="$TMP/j10"
wr_mutation_phase_begin run_id=t10 scope=test-timeout-124 journal_dir="$J10"
set +e
wr_mutation_phase_run_foreground -- sh -c 'exit 124'
rc=$?
set -e
st="$(wr_mutation_phase_read_state)"
assert_eq timeout124_state "$st" "COMPLETION_UNKNOWN"
assert_rc timeout124_helper_rc "$rc" 5
set +e
wr_mutation_phase_assert_ready_to_advance
arc=$?
set -e
assert_rc timeout124_blocks_advance "$arc" 7

# --- COMPLETION_UNKNOWN cannot be laundered via mark_aborted without reconcile ---
J11="$TMP/j11"
wr_mutation_phase_begin run_id=t11 scope=test-abort-launder journal_dir="$J11"
wr_mutation_phase_write "RUNNING" "" "sim"
wr_mutation_phase_signal_transport_loss
set +e
wr_mutation_phase_mark_aborted "operator_wants_abort"
arc=$?
set -e
assert_rc abort_refuses_unknown_without_reconcile "$arc" 19
st="$(wr_mutation_phase_read_state)"
assert_eq abort_refused_state_still_unknown "$st" "COMPLETION_UNKNOWN"
set +e
wr_mutation_phase_assert_ready_to_retry
rrc=$?
set -e
assert_rc abort_launder_still_blocks_retry "$rrc" 13
# After explicit reconciliation token, abort is allowed; then retry may proceed.
wr_mutation_phase_mark_aborted "reconciled_no_remote_pid" "reconciled=true"
st="$(wr_mutation_phase_read_state)"
assert_eq abort_after_reconcile_state "$st" "ABORTED"
set +e
wr_mutation_phase_assert_ready_to_retry
rrc=$?
set -e
assert_rc retry_ok_after_reconciled_abort "$rrc" 0

# --- Background-child / forbidden pattern scan (ops mutation scripts) ---
# Allow reviewed lock-heartbeat patterns; flag dangerous detachers in mutation-capable paths.
SCAN_FAIL=0
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  # Skip the staging lock helper itself (known internal holder subprocess) and this new lifecycle file
  base="$(basename "$f")"
  if [[ "$base" == "woodright-staging-mutation-lock.sh" || "$base" == "woodright-mutation-process-lifecycle.sh" ]]; then
    continue
  fi
  if grep -nE '(^|[[:space:]])nohup[[:space:]]|([^[:alnum:]_]tmux([^[:alnum:]_]|$))|(^|[[:space:]])setsid[[:space:]]' "$f" >/dev/null 2>&1; then
    echo "SCAN_HIT_DETACH $f"
    SCAN_FAIL=$((SCAN_FAIL + 1))
  fi
  # Trailing background of ssh/docker mutation-ish lines (heuristic)
  if grep -nE '[[:space:]](ssh|docker[[:space:]]+rmi|docker[[:space:]]+image[[:space:]]+rm)[^&\n]*&[[:space:]]*$' "$f" >/dev/null 2>&1; then
    echo "SCAN_HIT_BG_MUTATION $f"
    SCAN_FAIL=$((SCAN_FAIL + 1))
  fi
done < <(find "$ROOT/ops" -type f \( -name '*.sh' -o -name '*.py' \) ! -path '*/node_modules/*')
assert_rc background_pattern_scan "$SCAN_FAIL" 0

echo "SUMMARY pass=$PASS fail=$FAIL"
if [[ "$FAIL" -ne 0 ]]; then
  exit 1
fi
exit 0
