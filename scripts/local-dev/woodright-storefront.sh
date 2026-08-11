#!/usr/bin/env bash
# Woodright local storefront single-instance control (port 3002).
#
# Usage:
#   scripts/local-dev/woodright-storefront.sh status
#   scripts/local-dev/woodright-storefront.sh stop
#   scripts/local-dev/woodright-storefront.sh start [qa|develop]
#   scripts/local-dev/woodright-storefront.sh restart [qa|develop]
#
# Modes:
#   develop - next dev (.next-dev) — HMR; first hits compile ~15–30s
#   qa      - next start (.next-build) — buyer-uptime; needs yarn build first
#
# Env:
#   WOODRIGHT_REPO_ROOT
#   WOODRIGHT_QA_DIR
#   WOODRIGHT_STOREFRONT_PORT  default 3002
#   WOODRIGHT_STOREFRONT_MODE  default develop (LaunchAgent plist may set qa)
set -euo pipefail

export PATH="/usr/local/opt/node@22/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin${PATH:+:$PATH}"

REPO_ROOT="${WOODRIGHT_REPO_ROOT:-/Users/leonidmbp/Documents/projects/furniture-commerce}"
QA_DIR="${WOODRIGHT_QA_DIR:-$HOME/.woodright/qa-dev-servers}"
PORT="${WOODRIGHT_STOREFRONT_PORT:-3002}"
STORE_DIR="$REPO_ROOT/apps/storefront"
STATE_FILE="$QA_DIR/storefront-${PORT}.state"
PID_FILE="$QA_DIR/storefront-${PORT}.pid"
LOCK_DIR="$QA_DIR/storefront-${PORT}.lock"
OUT_LOG="$QA_DIR/storefront-${PORT}.log"
ERR_LOG="$QA_DIR/storefront-${PORT}.err.log"
HEALTH_URL="http://127.0.0.1:${PORT}/"
BUILD_MARKER="$STORE_DIR/.next-build/BUILD_ID"

mkdir -p "$QA_DIR"

log() { printf '%s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

LOCK_HELD=0
release_lock() {
  if [[ "$LOCK_HELD" -eq 1 ]]; then
    rm -rf "$LOCK_DIR" 2>/dev/null || true
    LOCK_HELD=0
  fi
}

acquire_lock() {
  local i owner owner_lstart lock_age
  for i in $(seq 1 75); do
    if mkdir "$LOCK_DIR" 2>/dev/null; then
      printf '%s\n' "$$" >"$LOCK_DIR/owner"
      ps -p "$$" -o lstart= 2>/dev/null | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' >"$LOCK_DIR/owner_lstart" || true
      LOCK_HELD=1
      trap 'release_lock' EXIT
      return 0
    fi
    if [[ -d "$LOCK_DIR" ]]; then
      owner="$(tr -d '[:space:]' <"$LOCK_DIR/owner" 2>/dev/null || true)"
      owner_lstart="$(tr -d '\n' <"$LOCK_DIR/owner_lstart" 2>/dev/null || true)"
      if [[ -z "${owner:-}" ]]; then
        lock_age="$(perl -e 'print int((time - (stat(shift))[9]))' "$LOCK_DIR" 2>/dev/null || echo 0)"
        if [[ "${lock_age:-0}" -ge 3 ]]; then
          rm -rf "$LOCK_DIR"
          continue
        fi
      elif ! kill -0 "$owner" 2>/dev/null; then
        rm -rf "$LOCK_DIR"
        continue
      elif [[ -n "${owner_lstart:-}" && "$(ps -p "$owner" -o lstart= 2>/dev/null | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')" != "$owner_lstart" ]]; then
        rm -rf "$LOCK_DIR"
        continue
      fi
    fi
    sleep 0.2
  done
  die "could not acquire lock $LOCK_DIR"
}

with_lock() {
  acquire_lock
  "$@"
  release_lock
  trap - EXIT
}

listeners_on_port() {
  /usr/sbin/lsof -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $2}' | sort -u || true
}

http_code() {
  curl -s --max-time 5 -o /dev/null -w '%{http_code}' "$1" 2>/dev/null || echo 000
}

pid_command() { ps -p "$1" -o command= 2>/dev/null || true; }
pid_lstart() { ps -p "$1" -o lstart= 2>/dev/null | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' || true; }
pid_cwd() {
  /usr/sbin/lsof -a -p "$1" -d cwd -Fn 2>/dev/null | awk '/^n/ {print substr($0,2); exit}' || true
}

is_our_storefront_pid() {
  local p="$1" cmd cwd
  [[ -n "$p" ]] || return 1
  kill -0 "$p" 2>/dev/null || return 1
  cmd="$(pid_command "$p")"
  [[ "$cmd" == *next* || "$cmd" == *"node_modules/next"* ]] || return 1
  if [[ "$cmd" == *"$STORE_DIR"* || "$cmd" == *"$REPO_ROOT"* ]]; then
    return 0
  fi
  cwd="$(pid_cwd "$p")"
  [[ -n "$cwd" && ( "$cwd" == "$STORE_DIR" || "$cwd" == "$STORE_DIR"/* ) ]]
}

normalize_mode() {
  case "${1:-}" in
    qa|QA) printf 'qa' ;;
    develop|dev|development|"") printf 'develop' ;;
    *) die "unknown storefront mode: $1 (use qa|develop)" ;;
  esac
}

require_qa_build() {
  [[ -f "$BUILD_MARKER" ]] || return 1
  return 0
}

resolve_start_mode() {
  local requested
  requested="$(normalize_mode "${1:-${WOODRIGHT_STOREFRONT_MODE:-develop}}")"
  if [[ "$requested" == "qa" ]]; then
    if require_qa_build; then
      printf '%s' qa
      return 0
    fi
    printf 'warn: qa build missing (need apps/storefront yarn build → .next-build/BUILD_ID) - falling back to develop\n' >&2
    printf 'warn: to use qa later: cd apps/storefront && yarn build && %s restart qa\n' "$0" >&2
    printf '%s' develop
    return 0
  fi
  printf '%s' develop
}

detect_mode_from_pid() {
  local p="$1" cmd cur pp i
  cur="$p"
  for i in 1 2 3 4 5 6 7 8; do
    cmd="$(pid_command "$cur")"
    if [[ "$cmd" == *" next start"* || "$cmd" == *"/next start"* || "$cmd" == *"next start --port"* ]]; then
      printf 'qa'
      return 0
    fi
    if [[ "$cmd" == *" next dev"* || "$cmd" == *"/next dev"* || "$cmd" == *"next dev --port"* ]]; then
      printf 'develop'
      return 0
    fi
    if [[ "$cmd" == *".next-build"* ]]; then
      printf 'qa'
      return 0
    fi
    if [[ "$cmd" == *".next-dev"* ]]; then
      printf 'develop'
      return 0
    fi
    # next-server child: infer from open dist dir
    if /usr/sbin/lsof -a -p "$cur" -d cwd -Fn 2>/dev/null | grep -Fq '.next-build'; then
      printf 'qa'
      return 0
    fi
    if /usr/sbin/lsof -p "$cur" 2>/dev/null | grep -E -q '/\.next-build(/|$)'; then
      printf 'qa'
      return 0
    fi
    if /usr/sbin/lsof -p "$cur" 2>/dev/null | grep -E -q '/\.next-dev(/|$)'; then
      printf 'develop'
      return 0
    fi
    pp="$(ps -o ppid= -p "$cur" 2>/dev/null | tr -d ' ' || true)"
    [[ -z "$pp" || "$pp" == "0" || "$pp" == "1" ]] && break
    cur="$pp"
  done
  # LaunchAgent env is authoritative when process tree is opaque
  if [[ -f "$HOME/Library/LaunchAgents/com.woodright.storefront-qa.plist" ]]; then
    local la_mode
    la_mode="$(plutil -extract EnvironmentVariables.WOODRIGHT_STOREFRONT_MODE raw "$HOME/Library/LaunchAgents/com.woodright.storefront-qa.plist" 2>/dev/null || true)"
    case "$la_mode" in
      qa|develop) printf '%s' "$la_mode"; return 0 ;;
    esac
  fi
  printf 'unknown'
}

write_state() {
  local pid="$1" mode="${2:-unknown}"
  case "$mode" in
    develop|qa|unknown) ;;
    *) mode=unknown ;;
  esac
  cat >"$STATE_FILE" <<EOF
pid=$pid
mode=$mode
repo=$REPO_ROOT
port=$PORT
lstart=$(pid_lstart "$pid")
written_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
  printf '%s\n' "$pid" >"$PID_FILE"
}

clear_state() { rm -f "$STATE_FILE" "$PID_FILE"; }

read_state_field() {
  local key="$1"
  [[ -f "$STATE_FILE" ]] || return 1
  awk -F= -v k="$key" '$1==k {sub(/^[^=]*=/,""); print; exit}' "$STATE_FILE"
}

state_matches_pid() {
  local p="$1" sp sl
  sp="$(read_state_field pid 2>/dev/null || true)"
  [[ "$sp" == "$p" ]] || return 1
  sl="$(read_state_field lstart 2>/dev/null || true)"
  [[ -n "$sl" ]] || return 1
  [[ "$(pid_lstart "$p")" == "$sl" ]]
}

confirm_target_pid() {
  local p="$1" expected_lstart="${2:-}"
  is_our_storefront_pid "$p" || return 1
  if [[ -n "$expected_lstart" ]]; then
    [[ "$(pid_lstart "$p")" == "$expected_lstart" ]] || return 1
  fi
  return 0
}

cmd_status() {
  local pids code identity="none" state_pid="" listen_pid="" owned=0
  local mode_guess="unknown" state_mode=""
  pids="$(listeners_on_port || true)"
  code="$(http_code "$HEALTH_URL")"
  log "repo:    $REPO_ROOT"
  log "port:    $PORT"
  log "http:    $code  ($HEALTH_URL)"
  if [[ -n "${pids:-}" ]]; then
    log "listen:  $pids"
    for p in $pids; do
      ps -p "$p" -o pid=,etime=,command= 2>/dev/null || true
      if is_our_storefront_pid "$p"; then
        owned=1
        [[ -z "$listen_pid" ]] && listen_pid="$p"
        mode_guess="$(detect_mode_from_pid "$p")"
      fi
    done
  else
    log "listen:  (none)"
  fi
  if [[ -f "$STATE_FILE" ]]; then
    state_pid="$(read_state_field pid || true)"
    state_mode="$(read_state_field mode || true)"
    if [[ -n "${state_pid:-}" ]] && state_matches_pid "$state_pid"; then
      identity="ok"
      # Prefer live detection; state mode only fills gaps.
      if [[ "$mode_guess" == "unknown" ]]; then
        case "$state_mode" in develop|qa) mode_guess="$state_mode" ;; esac
      fi
    else
      identity="stale"
    fi
    log "state:   pid=$state_pid mode=${state_mode:-?} identity=$identity"
  else
    log "state:   (none)"
  fi
  if [[ "$mode_guess" == "unknown" ]]; then
    case "${state_mode:-}" in
      develop|qa) mode_guess="$state_mode" ;;
    esac
  fi
  log "mode:    $mode_guess"
  if [[ "$mode_guess" == "qa" ]]; then
    log "compile: n/a (qa = next start; no mid-route compile)"
  elif [[ "$mode_guess" == "develop" ]]; then
    log "compile: on-demand (next dev; first route hits may take 15–30s)"
  fi
  if [[ "$code" != "000" && "$code" != "000000" ]]; then
    if [[ "$owned" -eq 1 && -n "$listen_pid" ]]; then
      case "$mode_guess" in develop|qa) ;; *) mode_guess="$(detect_mode_from_pid "$listen_pid")" ;; esac
      state_mode="$(read_state_field mode 2>/dev/null || true)"
      if [[ "$identity" != "ok" || ( "$mode_guess" == "develop" || "$mode_guess" == "qa" ) && "$state_mode" != "$mode_guess" ]]; then
        write_state "$listen_pid" "$mode_guess"
        log "state:   healed -> pid=$listen_pid mode=$mode_guess"
      fi
    fi
    log "status:  ok"
    return 0
  fi
  log "status:  down"
  return 1
}

cmd_stop() {
  local targets="" p TARGET_FINGERPRINTS="" still i

  add_target() {
    local tp="$1" ls
    [[ -n "$tp" ]] || return 0
    is_our_storefront_pid "$tp" || return 0
    case " $targets " in *" $tp "*) return 0 ;; esac
    targets="$targets $tp"
    ls="$(pid_lstart "$tp")"
    TARGET_FINGERPRINTS+="${tp}"$'\t'"${ls}"$'\n'
  }

  lookup_lstart() {
    local want="$1" line pid rest
    while IFS= read -r line || [[ -n "$line" ]]; do
      [[ -z "$line" ]] && continue
      pid="${line%%	*}"
      rest="${line#*	}"
      [[ "$pid" == "$want" ]] && { printf '%s' "$rest"; return 0; }
    done <<EOF
$TARGET_FINGERPRINTS
EOF
    return 1
  }

  if [[ -f "$STATE_FILE" ]]; then
    p="$(read_state_field pid || true)"
    if [[ -n "${p:-}" ]] && state_matches_pid "$p"; then
      add_target "$p"
    fi
  fi
  for p in $(listeners_on_port || true); do
    if is_our_storefront_pid "$p"; then
      add_target "$p"
    else
      die "foreign listener on :$PORT pid=$p - refusing stop"
    fi
  done
  targets="$(printf '%s\n' $targets | awk 'NF' | sort -u | tr '\n' ' ')"
  targets="${targets%" "}"
  if [[ -z "${targets:-}" ]]; then
    clear_state
    log "stopped :$PORT (already clear)"
    return 0
  fi
  log "stopping pids: $targets"
  for p in $targets; do
    confirm_target_pid "$p" "$(lookup_lstart "$p" || true)" || continue
    kill -TERM "$p" 2>/dev/null || true
  done
  for i in $(seq 1 20); do
    still=""
    for p in $targets; do
      if kill -0 "$p" 2>/dev/null && confirm_target_pid "$p" "$(lookup_lstart "$p" || true)"; then
        still="$still $p"
      fi
    done
    still="$(printf '%s\n' $still | awk 'NF' | sort -u | tr '\n' ' ')"
    still="${still%" "}"
    [[ -z "${still:-}" ]] && break
    sleep 0.5
  done
  for p in $targets; do
    if kill -0 "$p" 2>/dev/null && confirm_target_pid "$p" "$(lookup_lstart "$p" || true)"; then
      kill -KILL "$p" 2>/dev/null || true
    fi
  done
  sleep 0.5
  if [[ -n "$(listeners_on_port || true)" ]]; then
    die "port $PORT still has listeners after stop"
  fi
  clear_state
  log "stopped :$PORT"
}

cmd_start() {
  local mode
  mode="$(resolve_start_mode "${1:-${WOODRIGHT_STOREFRONT_MODE:-develop}}")"
  shift || true
  [[ $# -eq 0 ]] || die "unexpected args: $*"

  [[ -d "$STORE_DIR" ]] || die "storefront missing: $STORE_DIR"
  [[ -f "$STORE_DIR/node_modules/next/dist/bin/next" ]] || die "Next missing under $STORE_DIR (yarn install?)"

  local existing p code running_mode
  existing="$(listeners_on_port || true)"
  if [[ -n "${existing:-}" ]]; then
    code="$(http_code "$HEALTH_URL")"
    if [[ "$code" == "000" || "$code" == "000000" ]]; then
      die "port $PORT has listener(s) but http=$code - run: $0 stop"
    fi
    for p in $existing; do
      is_our_storefront_pid "$p" || die "healthy :$PORT listener pid=$p is not Woodright storefront for $REPO_ROOT"
    done
    p="$(printf '%s\n' $existing | awk 'NR==1{print;exit}')"
    running_mode="$(detect_mode_from_pid "$p")"
    if [[ "$running_mode" != "unknown" && "$running_mode" != "$mode" ]]; then
      die "mode conflict: :$PORT is $running_mode, requested $mode - run: $0 restart $mode"
    fi
    log "reuse healthy storefront on :$PORT mode=${running_mode:-?} (pids: $existing)"
    write_state "$p" "${running_mode:-$mode}"
    cmd_status || true
    return 0
  fi

  : >"$OUT_LOG"
  : >"$ERR_LOG"
  local runner="$QA_DIR/run-storefront.sh"
  if [[ ! -f "$runner" ]]; then
    runner="$(cd "$(dirname "$0")" && pwd)/run-storefront.sh"
  fi
  [[ -f "$runner" ]] || die "missing run-storefront.sh (install wrappers or keep scripts/local-dev/run-storefront.sh)"
  nohup env WOODRIGHT_STOREFRONT_MODE="$mode" \
    WOODRIGHT_REPO_ROOT="$REPO_ROOT" \
    WOODRIGHT_STOREFRONT_PORT="$PORT" \
    bash "$runner" >>"$OUT_LOG" 2>>"$ERR_LOG" &
  local pid=$!
  disown "$pid" 2>/dev/null || true
  write_state "$pid" "$mode"
  log "started pid=$pid mode=$mode logs=$OUT_LOG"
  local i
  for i in $(seq 1 60); do
    code="$(http_code "$HEALTH_URL")"
    if [[ "$code" != "000" && "$code" != "000000" ]]; then
      local listener
      listener="$(listeners_on_port | awk 'NR==1{print;exit}')"
      if [[ -n "${listener:-}" ]] && is_our_storefront_pid "$listener"; then
        write_state "$listener" "$mode"
        log "ready http=$code mode=$mode"
        cmd_status || true
        return 0
      fi
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
      die "storefront pid=$pid exited early (see $ERR_LOG)"
    fi
    sleep 2
  done
  die "storefront did not become ready on $HEALTH_URL"
}

cmd_restart() {
  local mode_arg="${1:-${WOODRIGHT_STOREFRONT_MODE:-develop}}"
  cmd_stop
  cmd_start "$mode_arg"
}

usage() {
  cat <<EOF
Usage: $0 status|stop|start [qa|develop]|restart [qa|develop]
  qa      - next start (.next-build) after: cd apps/storefront && yarn build
  develop - next dev (.next-dev); default
EOF
}

main() {
  local cmd="${1:-status}"
  shift || true
  case "$cmd" in
    status) cmd_status ;;
    stop) with_lock cmd_stop ;;
    start) with_lock cmd_start "$@" ;;
    restart) with_lock cmd_restart "$@" ;;
    -h|--help|help) usage ;;
    *) usage; die "unknown command: $cmd" ;;
  esac
}

main "$@"
