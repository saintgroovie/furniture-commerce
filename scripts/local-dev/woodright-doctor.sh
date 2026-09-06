#!/usr/bin/env bash
# Woodright local stack doctor (backend + admin + optional storefront).
#
# Usage:
#   scripts/local-dev/woodright-doctor.sh
#   scripts/local-dev/woodright-doctor.sh --backend-only
#   scripts/local-dev/woodright-doctor.sh --admin-only
#
# Exit 0 only when all required checks pass.
# Never prints secret values (publishable key name/status only).
set -euo pipefail

export PATH="/usr/local/opt/node@22/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin${PATH:+:$PATH}"

REPO_ROOT="${WOODRIGHT_REPO_ROOT:-/Users/leonidmbp/Documents/projects/furniture-commerce}"
PORT="${WOODRIGHT_BACKEND_PORT:-9000}"
STORE_PORT="${WOODRIGHT_STOREFRONT_PORT:-3002}"
ADMIN_ALT_PORT="${WOODRIGHT_ADMIN_ALT_PORT:-9001}"
BACKEND_ONLY=0
ADMIN_ONLY=0
FAILS=0

for arg in "$@"; do
  case "$arg" in
    --backend-only) BACKEND_ONLY=1 ;;
    --admin-only) ADMIN_ONLY=1 ;;
    -h|--help|help)
      cat <<EOF
Usage: $0 [--backend-only|--admin-only]
EOF
      exit 0
      ;;
    *)
      printf 'error: unexpected arg: %s\n' "$arg" >&2
      exit 1
      ;;
  esac
done

if [[ "$BACKEND_ONLY" -eq 1 && "$ADMIN_ONLY" -eq 1 ]]; then
  printf 'error: use only one of --backend-only / --admin-only\n' >&2
  exit 1
fi

log() { printf '%s\n' "$*"; }
pass() { log "PASS  $*"; }
fail() { log "FAIL  $*"; FAILS=$((FAILS + 1)); }
info() { log "INFO  $*"; }

http_meta() {
  # stdout: code:ctype:bytes
  local url="$1"
  shift || true
  curl -s --max-time 15 -o /dev/null -w '%{http_code}:%{content_type}:%{size_download}' "$@" "$url" 2>/dev/null \
    || echo "000::0"
}

# Retry flaky post-boot routes (store/static can hang briefly after develop child start).
http_meta_retry() {
  local url="$1"
  shift || true
  local i meta code
  for i in 1 2 3 4 5; do
    meta="$(http_meta "$url" "$@")"
    code="${meta%%:*}"
    if [[ "$code" != "000" && "$code" != "000000" ]]; then
      printf '%s' "$meta"
      return 0
    fi
    sleep 2
  done
  printf '%s' "${meta:-000::0}"
}

load_publishable_key() {
  local env_file="$REPO_ROOT/apps/storefront/.env.local"
  local key=""
  if [[ -f "$env_file" ]]; then
    key="$(
      awk -F= '
        /^[[:space:]]*NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY[[:space:]]*=/ {
          v=$0; sub(/^[^=]*=/, "", v);
          gsub(/^[[:space:]]+|[[:space:]]+$/, "", v);
          gsub(/^["'\'']|["'\'']$/, "", v);
          print v; exit
        }' "$env_file"
    )"
  fi
  if [[ -z "${key:-}" ]]; then
    key="${NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY:-}"
  fi
  printf '%s' "$key"
}

check_admin() {
  local login_url="http://127.0.0.1:${PORT}/app/login"
  local login_file
  login_file="$(mktemp -t woodright-doctor-admin.XXXXXX)"
  local login_code
  login_code="$(curl -s --max-time 12 -o "$login_file" -w '%{http_code}' "$login_url" 2>/dev/null || echo 000)"
  if [[ "$login_code" != "200" ]]; then
    fail "GET :$PORT/app/login -> $login_code (need 200)"
    rm -f "$login_file"
    return
  fi
  if grep -q 'Cannot GET' "$login_file"; then
    fail "GET :$PORT/app/login body has Cannot GET (wrong runtime / missing admin build)"
    rm -f "$login_file"
    return
  fi
  pass "GET :$PORT/app/login -> 200"

  local mode="unknown"
  if grep -q '@vite/client' "$login_file" || grep -q '/app/entry.jsx' "$login_file"; then
    mode="vite-dev"
  elif grep -qE '/app/assets/[^"]+\.js' "$login_file"; then
    mode="built"
  fi
  info "admin_mode=$mode (open via http://localhost:${PORT}/app/login - prefer localhost over 127.0.0.1)"

  local meta code rest ctype asset
  if [[ "$mode" == "vite-dev" ]]; then
    meta="$(http_meta "http://127.0.0.1:${PORT}/app/entry.jsx")"
    code="${meta%%:*}"
    rest="${meta#*:}"
    ctype="${rest%%:*}"
    if [[ "$code" == "200" && "$ctype" == *javascript* ]]; then
      pass "GET :$PORT/app/entry.jsx -> $code ($ctype)"
    else
      fail "GET :$PORT/app/entry.jsx -> $code ctype=$ctype (vite admin broken)"
    fi
    meta="$(http_meta "http://127.0.0.1:${PORT}/app/@vite/client")"
    code="${meta%%:*}"
    if [[ "$code" == "200" ]]; then
      pass "GET :$PORT/app/@vite/client -> $code"
    else
      fail "GET :$PORT/app/@vite/client -> $code"
    fi
  elif [[ "$mode" == "built" ]]; then
    asset="$(grep -oE '/app/assets/[^"]+\.js' "$login_file" | head -1 || true)"
    if [[ -n "${asset:-}" ]]; then
      meta="$(http_meta "http://127.0.0.1:${PORT}${asset}")"
      code="${meta%%:*}"
      if [[ "$code" == "200" ]]; then
        pass "GET :$PORT$asset -> $code (built admin)"
      else
        fail "GET :$PORT$asset -> $code (built admin asset missing)"
      fi
    else
      fail "built admin HTML has no /app/assets/*.js"
    fi
  else
    fail "could not fingerprint admin mode (neither vite-dev nor built assets)"
  fi
  rm -f "$login_file"

  # Experimental :9001 is allowed; report only (do not fail doctor).
  # lsof exits 1 when idle - must not trip set -o pipefail.
  local alt_pids alt_code
  alt_pids="$(/usr/sbin/lsof -nP -iTCP:"$ADMIN_ALT_PORT" -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $2}' | sort -u | tr '\n' ' ' || true)"
  alt_pids="${alt_pids%" "}"
  if [[ -n "${alt_pids:-}" ]]; then
    info "experimental :$ADMIN_ALT_PORT listener pids: $alt_pids (OK if admin-ux / dev:admin-local; do not mix cookies with :$PORT)"
    alt_code="$(curl -s --max-time 5 -o /dev/null -w '%{http_code}' "http://127.0.0.1:${ADMIN_ALT_PORT}/health" 2>/dev/null || echo 000)"
    info "GET :$ADMIN_ALT_PORT/health -> $alt_code"
  else
    info "no listener on :$ADMIN_ALT_PORT"
  fi
}

log "repo: $REPO_ROOT"
log "ports: backend=:$PORT storefront=:$STORE_PORT admin_alt=:$ADMIN_ALT_PORT"
log "---"

# 1) health
meta="$(http_meta "http://127.0.0.1:${PORT}/health")"
code="${meta%%:*}"
if [[ "$code" == "200" ]]; then
  pass "GET :$PORT/health -> $code"
else
  fail "GET :$PORT/health -> $code (need 200)"
  state_file="${WOODRIGHT_QA_DIR:-$HOME/.woodright/qa-dev-servers}/backend-${PORT}.state"
  if [[ -f "$state_file" ]]; then
    root_pid="$(awk -F= '$1=="root_pid"{print $2; exit}' "$state_file" 2>/dev/null || true)"
    if [[ -n "${root_pid:-}" ]] && kill -0 "$root_pid" 2>/dev/null; then
      info "supervisor/root_pid=$root_pid still alive - likely mid-boot/restart (status: starting); wait or check backend-${PORT}.err.log"
    fi
  fi
fi

# 2) single listener
listeners="$(/usr/sbin/lsof -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $2}' | sort -u | tr '\n' ' ' || true)"
listeners="${listeners%" "}"
count=0
if [[ -n "${listeners:-}" ]]; then
  count="$(printf '%s\n' $listeners | wc -l | tr -d ' ')"
fi
if [[ "$count" == "1" ]]; then
  pass "single listener on :$PORT (pid $listeners)"
elif [[ "$count" == "0" ]]; then
  fail "no listener on :$PORT"
else
  fail "multiple listeners on :$PORT (pids: $listeners) - stop extras"
fi

if [[ "$ADMIN_ONLY" -eq 1 ]]; then
  check_admin
  log "---"
  if [[ "$FAILS" -eq 0 ]]; then
    log "doctor: OK (admin-only)"
    exit 0
  fi
  log "doctor: FAILED ($FAILS check(s)) admin-only"
  exit 1
fi

# 3) store products (needs publishable key; never print value)
key="$(load_publishable_key)"
if [[ -z "$key" ]]; then
  fail "NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY not set (storefront .env.local or env)"
else
  pass "NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: set"
  meta="$(http_meta_retry "http://127.0.0.1:${PORT}/store/products?limit=1" \
    -H "x-publishable-api-key: $key")"
  code="${meta%%:*}"
  if [[ "$code" == "200" ]]; then
    pass "GET :$PORT/store/products?limit=1 -> $code"
  else
    fail "GET :$PORT/store/products?limit=1 -> $code (need 200)"
  fi
fi

# 4) static samples (Oliver + Willie Winkie) via Medusa static
oliver_path="products/oliver/ol-84-1-i2.jpg"
ww_path="products/willie-winkie/av-05-1-iso-1_il9e-v6.jpg"
for sample in "$oliver_path" "$ww_path"; do
  meta="$(http_meta_retry "http://127.0.0.1:${PORT}/static/$sample")"
  code="${meta%%:*}"
  rest="${meta#*:}"
  ctype="${rest%%:*}"
  if [[ "$code" == "200" || "$code" == "304" ]] && [[ "$ctype" == image/* ]]; then
    pass "GET :$PORT/static/$sample -> $code ($ctype)"
  else
    fail "GET :$PORT/static/$sample -> $code ctype=$ctype (need 200/304 image/*)"
  fi
done

# Catalog/API gate stops here. Admin is checked in full run and --admin-only only
# so `start qa` without admin build does not false-fail --backend-only.
if [[ "$BACKEND_ONLY" -eq 1 ]]; then
  log "---"
  if [[ "$FAILS" -eq 0 ]]; then
    log "doctor: OK (backend-only)"
    exit 0
  fi
  log "doctor: FAILED ($FAILS check(s)) backend-only"
  exit 1
fi

# 4b) Admin UI on same Medusa port (full doctor)
check_admin

# 5) storefront product-static proxy samples
for sample in "$oliver_path" "$ww_path"; do
  meta="$(http_meta "http://127.0.0.1:${STORE_PORT}/product-static/$sample")"
  code="${meta%%:*}"
  rest="${meta#*:}"
  ctype="${rest%%:*}"
  if [[ "$code" == "200" || "$code" == "304" ]] && [[ "$ctype" == image/* || "$ctype" == *"octet-stream"* ]]; then
    pass "GET :$STORE_PORT/product-static/$sample -> $code ($ctype)"
  else
    fail "GET :$STORE_PORT/product-static/$sample -> $code ctype=$ctype (need image via proxy; is Next on :$STORE_PORT?)"
  fi
done

# 6) kids catalog data-state (HTML sniff; no browser)
kids_url="http://127.0.0.1:${STORE_PORT}/kids/catalog"
html_file="$(mktemp -t woodright-doctor-kids.XXXXXX)"
kids_code="$(curl -s --max-time 20 -o "$html_file" -w '%{http_code}' "$kids_url" 2>/dev/null || echo 000)"
if [[ "$kids_code" != "200" ]]; then
  fail "GET :$STORE_PORT/kids/catalog -> $kids_code (need 200)"
  rm -f "$html_file"
else
  if grep -q 'data-state="error"' "$html_file" || grep -q "data-state='error'" "$html_file"; then
    fail "kids/catalog HTML contains data-state=error"
  elif grep -q 'data-state="ok"' "$html_file" || grep -q "data-state='ok'" "$html_file" \
    || grep -q 'data-state="ready"' "$html_file" || grep -q 'data-state="loaded"' "$html_file"; then
    pass "kids/catalog HTTP 200 and data-state is not error"
  else
    if grep -q 'Детский каталог не загрузился' "$html_file"; then
      fail "kids/catalog shows load-error copy"
    else
      pass "kids/catalog HTTP 200 (data-state attr not found in SSR HTML - check client if photos missing)"
    fi
  fi
  rm -f "$html_file"
fi

log "---"
if [[ "$FAILS" -eq 0 ]]; then
  log "doctor: OK"
  exit 0
fi
log "doctor: FAILED ($FAILS check(s))"
exit 1
