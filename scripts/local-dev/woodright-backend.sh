#!/usr/bin/env bash
# Woodright local Medusa single-instance control (port 9000).
#
# Usage:
#   scripts/local-dev/woodright-backend.sh status
#   scripts/local-dev/woodright-backend.sh stop
#   scripts/local-dev/woodright-backend.sh start qa       # catalog/photo QA (needs build)
#   scripts/local-dev/woodright-backend.sh start develop  # Admin UI + backend reload
#   scripts/local-dev/woodright-backend.sh restart [qa|develop]
#   scripts/local-dev/woodright-backend.sh doctor-lite
#
# Env:
#   WOODRIGHT_REPO_ROOT  canonical repo (default below)
#   WOODRIGHT_QA_DIR     pid/log/state dir (default ~/.woodright/qa-dev-servers)
#   WOODRIGHT_BACKEND_PORT  default 9000
#   WOODRIGHT_WATCH_PATCH_REQUIRED=1  die if develop watch patch missing/incompatible
set -euo pipefail

export PATH="/usr/local/opt/node@22/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin${PATH:+:$PATH}"

REPO_ROOT="${WOODRIGHT_REPO_ROOT:-/Users/leonidmbp/Documents/projects/furniture-commerce}"
QA_DIR="${WOODRIGHT_QA_DIR:-$HOME/.woodright/qa-dev-servers}"
PORT="${WOODRIGHT_BACKEND_PORT:-9000}"
BACKEND_DIR="$REPO_ROOT/apps/backend"
STATE_FILE="$QA_DIR/backend-${PORT}.state"
PID_FILE="$QA_DIR/backend-${PORT}.pid" # legacy mirror of state pid=
LOCK_DIR="$QA_DIR/backend-${PORT}.lock"
OUT_LOG="$QA_DIR/backend-${PORT}.log"
ERR_LOG="$QA_DIR/backend-${PORT}.err.log"
HEALTH_URL="http://127.0.0.1:${PORT}/health"
WATCH_MARKER="Woodright: develop watch ignores"
DEVELOP_JS="$BACKEND_DIR/node_modules/@medusajs/medusa/dist/commands/develop.js"

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
      # Claim immediately to shrink empty-owner race window
      printf '%s\n' "$$" >"$LOCK_DIR/owner"
      pid_lstart "$$" >"$LOCK_DIR/owner_lstart" 2>/dev/null || true
      LOCK_HELD=1
      trap 'release_lock' EXIT
      return 0
    fi
    if [[ -d "$LOCK_DIR" ]]; then
      owner="$(tr -d '[:space:]' <"$LOCK_DIR/owner" 2>/dev/null || true)"
      owner_lstart="$(tr -d '\n' <"$LOCK_DIR/owner_lstart" 2>/dev/null || true)"
      if [[ -z "${owner:-}" ]]; then
        # Empty owner may be brand-new claim in progress - only reap if aged
        lock_age="$(perl -e 'print int((time - (stat(shift))[9]))' "$LOCK_DIR" 2>/dev/null || echo 0)"
        if [[ "${lock_age:-0}" -ge 3 ]]; then
          log "removing stale lock (empty owner, age=${lock_age}s)"
          rm -rf "$LOCK_DIR"
          continue
        fi
      elif ! kill -0 "$owner" 2>/dev/null; then
        log "removing stale lock (owner missing/dead)"
        rm -rf "$LOCK_DIR"
        continue
      elif [[ -n "${owner_lstart:-}" && "$(pid_lstart "$owner")" != "$owner_lstart" ]]; then
        log "removing stale lock (owner pid reused)"
        rm -rf "$LOCK_DIR"
        continue
      fi
    fi
    sleep 0.2
  done
  die "could not acquire lock $LOCK_DIR (another woodright-backend.sh start/stop/restart?)"
}

with_lock() {
  acquire_lock
  "$@"
  release_lock
  trap - EXIT
}

require_backend_dir() {
  [[ -d "$BACKEND_DIR" ]] || die "backend dir missing: $BACKEND_DIR"
  [[ -f "$BACKEND_DIR/node_modules/@medusajs/cli/cli.js" ]] || die "Medusa CLI missing under $BACKEND_DIR (yarn install?)"
}

listeners_on_port() {
  /usr/sbin/lsof -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $2}' | sort -u || true
}

health_code() {
  curl -s --max-time 5 -o /dev/null -w '%{http_code}' "$HEALTH_URL" 2>/dev/null || echo 000
}

pid_command() {
  ps -p "$1" -o command= 2>/dev/null || true
}

pid_lstart() {
  ps -p "$1" -o lstart= 2>/dev/null | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' || true
}

pid_cwd() {
  /usr/sbin/lsof -a -p "$1" -d cwd -Fn 2>/dev/null | awk '/^n/ {print substr($0,2); exit}' || true
}

# True if PID is Woodright Medusa for THIS REPO_ROOT (path or cwd under BACKEND_DIR).
is_our_medusa_pid() {
  local p="$1" cmd cwd
  [[ -n "$p" ]] || return 1
  kill -0 "$p" 2>/dev/null || return 1
  cmd="$(pid_command "$p")"
  [[ -n "$cmd" ]] || return 1
  [[ "$cmd" == *medusa* || "$cmd" == *@medusajs/cli* ]] || return 1
  [[ "$cmd" == *" develop"* || "$cmd" == *" start"* ]] || return 1
  if [[ "$cmd" == *"$BACKEND_DIR"* || "$cmd" == *"$REPO_ROOT"* ]]; then
    return 0
  fi
  cwd="$(pid_cwd "$p")"
  if [[ -n "$cwd" && ( "$cwd" == "$BACKEND_DIR" || "$cwd" == "$REPO_ROOT" || "$cwd" == "$BACKEND_DIR"/* || "$cwd" == "$REPO_ROOT"/* ) ]]; then
    return 0
  fi
  return 1
}

detect_mode_from_pid() {
  local p="$1" cmd
  cmd="$(pid_command "$p")"
  if [[ "$cmd" == *" develop"* ]]; then
    echo develop
  elif [[ "$cmd" == *" start"* ]]; then
    # develop spawns child `start`; prefer parent develop if present
    local ppid
    ppid="$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ' || true)"
    if [[ -n "$ppid" ]] && [[ "$(pid_command "$ppid")" == *" develop"* ]]; then
      echo develop
    else
      echo qa
    fi
  else
    echo unknown
  fi
}

is_in_process_tree() {
  local target="$1" root="$2" cur i
  cur="$target"
  for i in $(seq 1 24); do
    [[ "$cur" == "$root" ]] && return 0
    cur="$(ps -o ppid= -p "$cur" 2>/dev/null | tr -d ' ' || true)"
    [[ -z "$cur" || "$cur" == "0" || "$cur" == "1" ]] && break
  done
  return 1
}

watch_patch_status() {
  if [[ ! -f "$DEVELOP_JS" ]]; then
    echo missing_develop_js
    return
  fi
  if grep -Fq "$WATCH_MARKER" "$DEVELOP_JS" 2>/dev/null; then
    echo active
  else
    echo missing
  fi
}

write_state() {
  local pid="$1" mode="$2" root_pid="${3:-$1}"
  case "$mode" in
    develop|qa) ;;
    *) die "refusing to write invalid mode into state: $mode" ;;
  esac
  local lstart root_lstart
  lstart="$(pid_lstart "$pid")"
  root_lstart="$(pid_lstart "$root_pid")"
  cat >"$STATE_FILE" <<EOF
pid=$pid
root_pid=$root_pid
mode=$mode
repo=$REPO_ROOT
port=$PORT
lstart=$lstart
root_lstart=$root_lstart
written_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
  printf '%s\n' "$pid" >"$PID_FILE"
}

clear_state() {
  rm -f "$STATE_FILE" "$PID_FILE"
}

read_state_field() {
  local key="$1"
  [[ -f "$STATE_FILE" ]] || return 1
  awk -F= -v k="$key" '$1==k {sub(/^[^=]*=/,""); print; exit}' "$STATE_FILE"
}

state_matches_pid() {
  local p="$1" field_pid="${2:-pid}" field_lstart="${3:-lstart}"
  local sp sl
  sp="$(read_state_field "$field_pid" 2>/dev/null || true)"
  [[ "$sp" == "$p" ]] || return 1
  sl="$(read_state_field "$field_lstart" 2>/dev/null || true)"
  # Empty fingerprint is not a match (prevents accepting reused PIDs)
  [[ -n "$sl" ]] || return 1
  [[ "$(pid_lstart "$p")" == "$sl" ]]
}

# Confirm PID is still the same process we fingerprinted (lstart + our medusa).
confirm_target_pid() {
  local p="$1" expected_lstart="${2:-}"
  is_our_medusa_pid "$p" || return 1
  if [[ -n "$expected_lstart" ]]; then
    [[ "$(pid_lstart "$p")" == "$expected_lstart" ]] || return 1
  fi
  return 0
}

fingerprint_admin() {
  local admin_html admin_mode="unknown"
  admin_html="$(curl -s --max-time 8 "http://127.0.0.1:${PORT}/app/login" 2>/dev/null || true)"
  if [[ "$admin_html" == *"Cannot GET"* ]]; then
    admin_mode="broken_stub"
  elif [[ "$admin_html" == *"@vite/client"* || "$admin_html" == *"/app/entry.jsx"* ]]; then
    admin_mode="vite-dev"
  elif [[ "$admin_html" == *"/app/assets/"* ]]; then
    admin_mode="built"
  elif [[ -z "$admin_html" ]]; then
    admin_mode="unreachable"
  fi
  printf '%s' "$admin_mode"
}

cmd_status() {
  local pids code mode_guess="unknown" state_mode state_pid root_pid
  local identity="none" root_alive=0 owned_listen=0
  pids="$(listeners_on_port || true)"
  code="$(health_code)"
  log "repo:    $REPO_ROOT"
  log "port:    $PORT"
  log "health:  $code  ($HEALTH_URL)"
  if [[ -n "${pids:-}" ]]; then
    log "listen:  $pids"
    for p in $pids; do
      ps -p "$p" -o pid=,etime=,command= 2>/dev/null || true
      if is_our_medusa_pid "$p"; then
        owned_listen=1
        mode_guess="$(detect_mode_from_pid "$p")"
      fi
    done
  else
    log "listen:  (none)"
  fi
  if [[ -f "$STATE_FILE" ]]; then
    state_pid="$(read_state_field pid || true)"
    root_pid="$(read_state_field root_pid || true)"
    state_mode="$(read_state_field mode || true)"
    log "state:   file $STATE_FILE"
    log "         pid=$state_pid root=$root_pid mode=$state_mode repo=$(read_state_field repo || true)"
    if [[ -n "${state_pid:-}" ]] && state_matches_pid "$state_pid"; then
      identity="ok"
      log "         identity: ok"
      mode_guess="${state_mode:-$mode_guess}"
    else
      identity="stale_or_mismatch"
      log "         identity: stale_or_mismatch"
    fi
    if [[ -n "${root_pid:-}" ]] && kill -0 "$root_pid" 2>/dev/null && is_our_medusa_pid "$root_pid"; then
      root_alive=1
    fi
  else
    log "state:   (none)"
  fi
  case "${mode_guess:-}" in
    develop|qa) ;;
    *)
      if [[ -n "${state_mode:-}" ]]; then
        case "$state_mode" in
          develop|qa) mode_guess="$state_mode" ;;
          *) mode_guess="unknown" ;;
        esac
      else
        mode_guess="unknown"
      fi
      ;;
  esac
  log "mode:    $mode_guess"
  log "watch:   $(watch_patch_status)"
  log "admin:   $(fingerprint_admin)  (http://localhost:${PORT}/app/login)"

  # ready = owned LISTEN + /health 200. launchctl/supervisor alive alone is NOT buyer-ready.
  if [[ "$code" == "200" && "$owned_listen" -eq 1 ]]; then
    # LaunchAgent / medusa start may leave state pointing at a parent that exited;
    # heal when buyer is ready so stop/restart keep a live identity.
    if [[ "$identity" != "ok" ]]; then
      case "$mode_guess" in
        develop|qa)
          local listen_pid="" heal_root=""
          for p in $pids; do
            if is_our_medusa_pid "$p"; then
              listen_pid="$p"
              break
            fi
          done
          if [[ -n "$listen_pid" ]]; then
            heal_root="$(resolve_root_pid "$listen_pid")"
            write_state "$listen_pid" "$mode_guess" "$heal_root"
            log "         identity: healed -> pid=$listen_pid root=$heal_root mode=$mode_guess"
          fi
          ;;
      esac
    fi
    log "status:  ready"
    return 0
  fi
  if [[ "$root_alive" -eq 1 || "$identity" == "ok" ]]; then
    log "status:  starting"
    log "note:    supervisor/state alive but buyer not ready (no healthy owned :$PORT) - wait or run doctor; see $ERR_LOG"
    return 1
  fi
  log "status:  down"
  return 1
}

stop_pid_confirmed() {
  local p="$1" expected_lstart="$2" sig="${3:-TERM}"
  if ! confirm_target_pid "$p" "$expected_lstart"; then
    log "skip signal=$sig pid=$p (identity/lstart no longer matches)"
    return 1
  fi
  if [[ "$sig" == "KILL" ]]; then
    log "KILL confirmed pid=$p"
    kill -KILL "$p" 2>/dev/null || true
  else
    kill -TERM "$p" 2>/dev/null || true
  fi
  return 0
}

lookup_lstart() {
  local want="$1" line pid rest
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" ]] && continue
    pid="${line%%	*}"
    rest="${line#*	}"
    if [[ "$pid" == "$want" ]]; then
      printf '%s' "$rest"
      return 0
    fi
  done <<EOF
$TARGET_FINGERPRINTS
EOF
  return 1
}

cmd_stop() {
  local targets="" p still i child state_pid root_pid TARGET_FINGERPRINTS=""

  add_target() {
    local tp="$1" ls
    [[ -n "$tp" ]] || return 0
    is_our_medusa_pid "$tp" || return 0
    case " $targets " in
      *" $tp "*) return 0 ;;
    esac
    targets="$targets $tp"
    ls="$(pid_lstart "$tp")"
    TARGET_FINGERPRINTS+="${tp}"$'\t'"${ls}"$'\n'
  }

  if [[ -f "$STATE_FILE" ]]; then
    root_pid="$(read_state_field root_pid || true)"
    state_pid="$(read_state_field pid || true)"
    if [[ -n "${root_pid:-}" ]] && is_our_medusa_pid "$root_pid"; then
      if state_matches_pid "$root_pid" root_pid root_lstart; then
        add_target "$root_pid"
        for child in $(pgrep -P "$root_pid" 2>/dev/null || true); do
          add_target "$child"
        done
      else
        log "state root_pid=$root_pid ignored (root_lstart missing or mismatch)"
      fi
    fi
    if [[ -n "${state_pid:-}" ]] && is_our_medusa_pid "$state_pid"; then
      if state_matches_pid "$state_pid"; then
        add_target "$state_pid"
        for child in $(pgrep -P "$state_pid" 2>/dev/null || true); do
          add_target "$child"
        done
      else
        log "state pid=$state_pid ignored (not our live identity)"
      fi
    fi
  fi

  for p in $(listeners_on_port || true); do
    if is_our_medusa_pid "$p"; then
      add_target "$p"
      local cur pp
      cur="$p"
      for i in $(seq 1 8); do
        pp="$(ps -o ppid= -p "$cur" 2>/dev/null | tr -d ' ' || true)"
        [[ -z "$pp" || "$pp" == "0" || "$pp" == "1" ]] && break
        if is_our_medusa_pid "$pp"; then
          add_target "$pp"
          cur="$pp"
        else
          break
        fi
      done
    else
      die "foreign listener on :$PORT pid=$p - refusing stop. Inspect: ps -p $p -o pid,command="
    fi
  done

  targets="$(printf '%s\n' $targets | awk 'NF' | sort -u | tr '\n' ' ')"
  targets="${targets%" "}"

  if [[ -z "${targets:-}" ]]; then
    if [[ -n "$(listeners_on_port || true)" ]]; then
      die "listeners on :$PORT but none confirmed as Woodright for $REPO_ROOT"
    fi
    clear_state
    log "stopped :$PORT (already clear)"
    return 0
  fi

  log "stopping pids: $targets"
  if [[ -n "${root_pid:-}" ]]; then
    for p in $targets; do
      [[ "$p" == "$root_pid" ]] || continue
      stop_pid_confirmed "$p" "$(lookup_lstart "$p" || true)" TERM || true
    done
  fi
  for p in $targets; do
    [[ -n "${root_pid:-}" && "$p" == "$root_pid" ]] && continue
    stop_pid_confirmed "$p" "$(lookup_lstart "$p" || true)" TERM || true
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
    if kill -0 "$p" 2>/dev/null; then
      stop_pid_confirmed "$p" "$(lookup_lstart "$p" || true)" KILL || true
    fi
  done
  sleep 0.5
  for p in $(listeners_on_port || true); do
    if is_our_medusa_pid "$p"; then
      die "our listener pid=$p still on :$PORT after stop"
    fi
    die "foreign listener remains on :$PORT pid=$p after stop"
  done
  clear_state
  log "stopped :$PORT"
}

wait_health_owned() {
  local root_pid="$1"
  local i code p listeners
  for i in $(seq 1 48); do
    code="$(health_code)"
    if [[ "$code" == "200" ]]; then
      listeners="$(listeners_on_port || true)"
      if [[ -n "${listeners:-}" ]]; then
        local ok=1
        for p in $listeners; do
          if ! is_our_medusa_pid "$p"; then
            ok=0
            break
          fi
          # Listener must be the spawned pid or a descendant (develop -> child start).
          if [[ "$p" != "$root_pid" ]] && ! is_in_process_tree "$p" "$root_pid"; then
            ok=0
            break
          fi
        done
        if [[ "$ok" -eq 1 ]]; then
          # Prefer ready only after static sample responds (avoids doctor flake right after boot)
          local static_code
          static_code="$(curl -s --max-time 8 -o /dev/null -w '%{http_code}' \
            "http://127.0.0.1:${PORT}/static/products/oliver/ol-84-1-i2.jpg" 2>/dev/null || echo 000)"
          if [[ "$static_code" == "200" || "$static_code" == "304" ]]; then
            log "ready health=200 owned static=$static_code (try=$i) listeners=$listeners"
            return 0
          fi
          log "health owned but static=$static_code (try=$i)"
        fi
      fi
    fi
    if (( i % 4 == 0 )); then
      log "waiting health try=$i code=$code"
    fi
    # If our root died early, fail fast
    if ! kill -0 "$root_pid" 2>/dev/null; then
      # Child may have replaced tree; continue only if our listeners exist
      listeners="$(listeners_on_port || true)"
      local any=0
      for p in $listeners; do
        if is_our_medusa_pid "$p"; then
          any=1
          break
        fi
      done
      if [[ "$any" -eq 0 ]]; then
        die "started pid=$root_pid exited before healthy (see $ERR_LOG / $OUT_LOG)"
      fi
    fi
    sleep 5
  done
  die "backend did not become healthy/owned on $HEALTH_URL (see $ERR_LOG / $OUT_LOG)"
}

normalize_mode() {
  local mode="${1:-develop}"
  case "$mode" in
    develop) echo develop ;;
    qa) echo qa ;;
    *) die "unknown mode '$mode' (allowed: develop|qa)" ;;
  esac
}

reject_extra_args() {
  if [[ "$#" -gt 0 ]]; then
    die "unexpected extra args: $*"
  fi
}

require_qa_build() {
  # Medusa v2 emits backend under dist/. Admin may live under dist/public/admin
  # and/or public/admin (link-admin-build on trees that ship that script).
  # Older layouts used .medusa/server/ - accept either marker.
  local marker=""
  if [[ -f "$BACKEND_DIR/dist/package.json" ]]; then
    marker="$BACKEND_DIR/dist/package.json"
  elif [[ -f "$BACKEND_DIR/.medusa/server/package.json" ]]; then
    marker="$BACKEND_DIR/.medusa/server/package.json"
  else
    return 1
  fi
  local server_js="$BACKEND_DIR/.medusa/server/public/admin/index.html"
  local dist_admin="$BACKEND_DIR/dist/public/admin/index.html"
  local linked_admin="$BACKEND_DIR/public/admin/index.html"
  if [[ -f "$BACKEND_DIR/medusa-config.ts" && "$BACKEND_DIR/medusa-config.ts" -nt "$marker" ]]; then
    printf 'warn: medusa-config.ts is newer than qa build marker (%s) - consider rebuild before qa\n' "$marker" >&2
  fi
  if [[ ! -f "$server_js" && ! -f "$dist_admin" && ! -f "$linked_admin" ]]; then
    printf 'warn: admin index.html not found under dist/public/admin, public/admin, or .medusa/server/public/admin - /app may be Cannot GET in qa\n' >&2
  fi
  return 0
}

resolve_start_mode() {
  local mode="$1"
  if [[ "$mode" == "qa" ]]; then
    if require_qa_build; then
      printf '%s' qa
      return 0
    fi
    # Must not print to stdout - callers capture this function via $()
    printf 'warn: qa build missing (need dist/package.json from yarn build, or legacy .medusa/server) - falling back to develop so catalog/Admin stay up\n' >&2
    printf 'warn: to use qa later: cd apps/backend && yarn build && %s restart qa\n' "$0" >&2
    printf '%s' develop
    return 0
  fi
  printf '%s' "$mode"
}

ensure_watch_patch_for_develop() {
  local patch_js status
  # Prefer durable postinstall copy under runtime repo, then local-dev mirror.
  if [[ -f "$BACKEND_DIR/scripts/patch-medusa-develop-watch.mjs" ]]; then
    patch_js="$BACKEND_DIR/scripts/patch-medusa-develop-watch.mjs"
  else
    patch_js="$(cd "$(dirname "$0")" && pwd)/patch-medusa-develop-watch.mjs"
  fi
  if [[ -f "$patch_js" ]]; then
    if [[ "${WOODRIGHT_WATCH_PATCH_REQUIRED:-0}" == "1" ]]; then
      node "$patch_js" || die "develop watch patch failed (WOODRIGHT_WATCH_PATCH_REQUIRED=1)"
    else
      node "$patch_js" --warn-only || true
    fi
  fi
  status="$(watch_patch_status)"
  log "watch_patch=$status patch_js=$patch_js"
  if [[ "$status" != "active" && "${WOODRIGHT_WATCH_PATCH_REQUIRED:-0}" == "1" ]]; then
    die "develop watch patch not active ($status)"
  fi
}

# Walk parents to find develop supervisor, else return the pid itself.
resolve_root_pid() {
  local p="$1" cur pp best
  best="$p"
  cur="$p"
  local i
  for i in $(seq 1 8); do
    pp="$(ps -o ppid= -p "$cur" 2>/dev/null | tr -d ' ' || true)"
    [[ -z "$pp" || "$pp" == "0" || "$pp" == "1" ]] && break
    if is_our_medusa_pid "$pp"; then
      best="$pp"
      cur="$pp"
    else
      break
    fi
  done
  printf '%s' "$best"
}

cmd_start() {
  local mode requested
  requested="$(normalize_mode "${1:-develop}")"
  shift || true
  reject_extra_args "$@"
  require_backend_dir
  mode="$(resolve_start_mode "$requested")"

  local existing p running_mode code root
  existing="$(listeners_on_port || true)"
  if [[ -n "${existing:-}" ]]; then
    code="$(health_code)"
    if [[ "$code" != "200" ]]; then
      die "port $PORT has listener(s) but health=$code - run: $0 stop"
    fi
    for p in $existing; do
      if ! is_our_medusa_pid "$p"; then
        die "healthy :$PORT listener pid=$p is not Woodright for $REPO_ROOT - refusing reuse"
      fi
    done
    running_mode="unknown"
    if [[ -f "$STATE_FILE" ]]; then
      p="$(read_state_field pid || true)"
      if [[ -n "${p:-}" ]] && state_matches_pid "$p" && is_our_medusa_pid "$p"; then
        running_mode="$(read_state_field mode || true)"
        case "$running_mode" in
          develop|qa) ;;
          *) running_mode="unknown" ;;
        esac
      fi
    fi
    if [[ "$running_mode" == "unknown" || -z "$running_mode" ]]; then
      p="$(printf '%s\n' $existing | awk 'NR==1{print;exit}')"
      running_mode="$(detect_mode_from_pid "$p")"
    fi
    if [[ "$running_mode" != "$mode" ]]; then
      die "port $PORT already running mode=$running_mode (requested=$requested -> $mode). Use: $0 restart $mode"
    fi
    if [[ "$mode" == "develop" ]]; then
      ensure_watch_patch_for_develop
    fi
    p="$(printf '%s\n' $existing | awk 'NR==1{print;exit}')"
    root="$(resolve_root_pid "$p")"
    if [[ -f "$STATE_FILE" ]]; then
      local prev_root
      prev_root="$(read_state_field root_pid || true)"
      if [[ -n "${prev_root:-}" ]] \
        && is_our_medusa_pid "$prev_root" \
        && state_matches_pid "$prev_root" root_pid root_lstart \
        && { [[ "$p" == "$prev_root" ]] || is_in_process_tree "$p" "$prev_root"; }; then
        root="$prev_root"
      fi
    fi
    log "reuse healthy Woodright listener on :$PORT mode=$mode (pids: $existing root=$root)"
    write_state "$p" "$mode" "$root"
    cmd_status || true
    return 0
  fi

  # Fresh start path
  if [[ "$mode" == "develop" ]]; then
    ensure_watch_patch_for_develop
  fi

  : >"$OUT_LOG"
  : >"$ERR_LOG"

  # Do not `source .env` here: Medusa loadEnv in medusa-config.ts already loads it.
  # Sourcing fails under Cursor agent sandbox (".env: Operation not permitted").

  export MEDUSA_LOCAL_HTTP="${MEDUSA_LOCAL_HTTP:-1}"
  export PORT
  export ADMIN_VITE_HMR="${ADMIN_VITE_HMR:-0}"

  # LaunchAgent / explicit foreground: exec Medusa so KeepAlive watches the real server.
  # (Python setsid daemonize fails under launchd with PermissionError on execvp.)
  if [[ "${WOODRIGHT_START_FOREGROUND:-0}" == "1" || "${XPC_SERVICE_NAME:-}" == "com.woodright.medusa-backend" ]]; then
    write_state "$$" "$mode" "$$"
    log "foreground start pid=$$ mode=$mode (requested=$requested) logs=$OUT_LOG"
    release_lock
    trap - EXIT
    cd "$BACKEND_DIR" || die "backend dir missing: $BACKEND_DIR"
    exec >>"$OUT_LOG" 2>>"$ERR_LOG"
    if [[ "$mode" == "qa" ]]; then
      exec node node_modules/@medusajs/cli/cli.js start --no-types
    fi
    exec node node_modules/@medusajs/cli/cli.js develop --no-types
  fi

  # Interactive / agent: background + disown (uptime path is LaunchAgent + foreground).
  nohup bash -c '
    set -euo pipefail
    cd "$1" || exit 1
    export MEDUSA_LOCAL_HTTP="${MEDUSA_LOCAL_HTTP:-1}"
    export PORT="$2"
    export ADMIN_VITE_HMR="${ADMIN_VITE_HMR:-0}"
    if [[ "$3" == "qa" ]]; then
      exec node node_modules/@medusajs/cli/cli.js start --no-types
    else
      exec node node_modules/@medusajs/cli/cli.js develop --no-types
    fi
  ' bash "$BACKEND_DIR" "$PORT" "$mode" >>"$OUT_LOG" 2>>"$ERR_LOG" &
  local pid=$!
  disown "$pid" 2>/dev/null || true
  write_state "$pid" "$mode" "$pid"
  log "started pid=$pid mode=$mode (requested=$requested) logs=$OUT_LOG"
  wait_health_owned "$pid"
  local listener
  listener="$(listeners_on_port | awk 'NR==1{print;exit}')"
  if [[ -n "${listener:-}" ]] && is_our_medusa_pid "$listener"; then
    write_state "$listener" "$mode" "$pid"
  fi
  cmd_status || true
}

cmd_restart() {
  local mode
  mode="$(normalize_mode "${1:-develop}")"
  shift || true
  reject_extra_args "$@"
  cmd_stop
  cmd_start "$mode"
}

cmd_doctor_lite() {
  local code static_code
  code="$(health_code)"
  static_code="$(curl -s --max-time 8 -o /dev/null -w '%{http_code}' \
    "http://127.0.0.1:${PORT}/static/products/oliver/ol-84-1-i2.jpg" 2>/dev/null || echo 000)"
  log "health=$code static_sample=$static_code mode=$(read_state_field mode 2>/dev/null || echo unknown) listeners=$(listeners_on_port | tr '\n' ' ')"
  [[ "$code" == "200" && ( "$static_code" == "200" || "$static_code" == "304" ) ]]
}

usage() {
  cat <<EOF
Usage: $0 status|stop|start [develop|qa]|restart [develop|qa]|doctor-lite
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
    doctor-lite) cmd_doctor_lite ;;
    -h|--help|help) usage ;;
    *) usage; die "unknown command: $cmd" ;;
  esac
}

main "$@"
