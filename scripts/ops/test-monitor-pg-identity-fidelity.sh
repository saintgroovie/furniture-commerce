#!/usr/bin/env bash
# Fidelity: health-check PostgreSQL identity must follow environment profile
# (WOODRIGHT_DB_USER + WOODRIGHT_DB_NAME), never a shared hardcoded role "woodright".
# Fail-closed on missing user, cross-stack identity, and wrong role/db.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HC="$ROOT/ops/monitoring/woodright-health-check.sh"
PROD_CONF="$ROOT/ops/config/runtime-environments/production.conf"
DEMO_CONF="$ROOT/ops/config/runtime-environments/public_demo.conf"
FAIL=0
pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

# --- Static contract ---
if grep -nE 'pg_isready -U woodright|psql -U woodright' "$HC" >/dev/null 2>&1; then
  fail "hardcoded -U woodright still present in health-check"
else
  pass "no hardcoded -U woodright"
fi
grep -q 'WOODRIGHT_MONITOR_PG_USER\|MONITOR_PG_USER' "$HC" && pass "uses MONITOR_PG_USER" || fail "missing MONITOR_PG_USER wiring"
grep -q 'missing_db_user\|identity_mismatch' "$HC" && pass "fail-closed identity tokens present" || fail "missing fail-closed tokens"

for conf in "$PROD_CONF" "$DEMO_CONF" "$ROOT/ops/config/runtime-environments/public_production.conf"; do
  grep -q '^WOODRIGHT_DB_USER=' "$conf" && pass "$(basename "$conf") has WOODRIGHT_DB_USER" \
    || fail "$(basename "$conf") missing WOODRIGHT_DB_USER"
done
for conf in "$PROD_CONF" "$DEMO_CONF" "$ROOT/ops/config/runtime-environments/public_production.conf"; do
  grep -q '^WOODRIGHT_REDIS_CONTAINER_DEFAULT=' "$conf" && pass "$(basename "$conf") has REDIS default" \
    || fail "$(basename "$conf") missing REDIS default"
done

PROD_USER="$(awk -F= '/^WOODRIGHT_DB_USER=/{print $2; exit}' "$PROD_CONF")"
PROD_DB="$(awk -F= '/^WOODRIGHT_DB_NAME=/{print $2; exit}' "$PROD_CONF")"
DEMO_USER="$(awk -F= '/^WOODRIGHT_DB_USER=/{print $2; exit}' "$DEMO_CONF")"
DEMO_DB="$(awk -F= '/^WOODRIGHT_DB_NAME=/{print $2; exit}' "$DEMO_CONF")"
PROD_PG="$(awk -F= '/^WOODRIGHT_PG_CONTAINER_PREFIX=/{print $2; exit}' "$PROD_CONF")"
DEMO_PG="$(awk -F= '/^WOODRIGHT_PG_CONTAINER_PREFIX=/{print $2; exit}' "$DEMO_CONF")"
PROD_REDIS="$(awk -F= '/^WOODRIGHT_REDIS_CONTAINER_DEFAULT=/{print $2; exit}' "$PROD_CONF")"
DEMO_REDIS="$(awk -F= '/^WOODRIGHT_REDIS_CONTAINER_DEFAULT=/{print $2; exit}' "$DEMO_CONF")"

[[ "$PROD_USER" == "woodright_production" && "$PROD_DB" == "woodright_production" ]] \
  && pass "production identity map user/db" || fail "production identity unexpected user=$PROD_USER db=$PROD_DB"
[[ "$DEMO_USER" == "woodright" && "$DEMO_DB" == "woodright_staging" ]] \
  && pass "public_demo identity map user/db" || fail "public_demo identity unexpected user=$DEMO_USER db=$DEMO_DB"
[[ "$PROD_USER" != "$DEMO_USER" || "$PROD_DB" != "$DEMO_DB" ]] \
  && pass "production and public_demo identities differ" || fail "identities unexpectedly identical"
[[ "$DEMO_PG" == *"-1" || "$DEMO_PG" == *"postgres-1" ]] \
  && pass "public_demo PG prefix is exact container name" || fail "public_demo PG prefix missing -1: $DEMO_PG"
[[ "$PROD_REDIS" == "woodright-production-redis" ]] && pass "production redis default" || fail "production redis=$PROD_REDIS"
[[ "$DEMO_REDIS" == "woodright-stack-3dsdhd-redis-1" ]] && pass "public_demo redis default" || fail "demo redis=$DEMO_REDIS"

# --- Docker shim for identity probes ---
TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT
BIN="$TMP/bin"
mkdir -p "$BIN"

# Expected identity for the shim (set per case via env)
cat >"$BIN/docker" <<'EOF'
#!/usr/bin/env bash
# Shim: validate postgres identity args; refuse wrong role/db/container.
set -euo pipefail
cmd="${1:-}"
if [[ "$cmd" == "ps" || "$cmd" == "inspect" || "$cmd" == "images" ]]; then
  exit 0
fi
if [[ "$cmd" != "exec" ]]; then
  exit 0
fi
shift
container="${1:-}"
shift || true
# Remaining: optional -i flags then binary
# Normalize: docker exec <ctr> pg_isready -U <user>
#            docker exec <ctr> psql -U <user> -d <db> ...
bin=""
args=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -i|-it|-t|--interactive|--tty) shift ;;
    *) bin="$1"; shift; args=("$@"); break ;;
  esac
done

expect_ctr="${WR_SHIM_EXPECT_PG:-}"
expect_user="${WR_SHIM_EXPECT_USER:-}"
expect_db="${WR_SHIM_EXPECT_DB:-}"
mode="${WR_SHIM_MODE:-match}" # match|deny_user|deny_db|deny_ctr|exited_keeper

if [[ "$mode" == "exited_keeper" ]]; then
  # Exited keepers must not look ready
  exit 1
fi

if [[ -n "$expect_ctr" && "$container" != "$expect_ctr" ]]; then
  echo "shim: wrong container got=$container want=$expect_ctr" >&2
  exit 1
fi

user=""
db=""
i=0
while [[ $i -lt ${#args[@]} ]]; do
  a="${args[$i]}"
  if [[ "$a" == "-U" ]]; then
    i=$((i + 1)); user="${args[$i]:-}"
  elif [[ "$a" == "-d" ]]; then
    i=$((i + 1)); db="${args[$i]:-}"
  fi
  i=$((i + 1))
done

if [[ "$bin" == "pg_isready" ]]; then
  if [[ "$mode" == "deny_user" && "$user" == "$expect_user" ]]; then
    # Simulate: wrong caller still using expected user against broken role — unused
    :
  fi
  if [[ -n "$expect_user" && "$user" != "$expect_user" ]]; then
    exit 1
  fi
  if [[ "$mode" == "deny_user" ]]; then
    exit 1
  fi
  exit 0
fi

if [[ "$bin" == "psql" ]]; then
  if [[ "$mode" == "deny_user" ]]; then
    echo "FATAL: role \"$user\" does not exist" >&2
    exit 1
  fi
  if [[ "$mode" == "deny_db" ]]; then
    echo "FATAL: database \"$db\" does not exist" >&2
    exit 1
  fi
  if [[ -n "$expect_user" && "$user" != "$expect_user" ]]; then
    echo "FATAL: role \"$user\" does not exist" >&2
    exit 1
  fi
  if [[ -n "$expect_db" && "$db" != "$expect_db" ]]; then
    echo "FATAL: database \"$db\" does not exist" >&2
    exit 1
  fi
  # Return trivial numeric results for stats queries / SELECT 1
  echo "1"
  exit 0
fi

if [[ "$bin" == "redis-cli" ]]; then
  if [[ "${1:-}" == "ping" ]] || [[ "${args[0]:-}" == "ping" ]]; then
    echo PONG
    exit 0
  fi
  echo "used_memory_human:1.0M"
  exit 0
fi
exit 0
EOF
chmod +x "$BIN/docker"

# curl shim: always 200 / safe headers for buyer/api probes
cat >"$BIN/curl" <<'EOF'
#!/usr/bin/env bash
# Minimal: --write-out %{http_code} → 200; -I headers for HSTS/robots
if printf '%s\n' "$@" | grep -q '%{http_code}'; then
  echo 200
  exit 0
fi
if [[ "$*" == *"-I"* ]] || [[ "$*" == *"-sSI"* ]]; then
  echo "HTTP/1.1 200 OK"
  echo "strict-transport-security: max-age=31536000"
  echo "x-robots-tag: noindex"
  echo
  exit 0
fi
echo OK
exit 0
EOF
chmod +x "$BIN/curl"

extract_pg() {
  python3 - "$1" <<'PY'
import json,sys
text=open(sys.argv[1]).read()
i=text.find("{")
if i<0:
  print("missing|||"); raise SystemExit
obj,_=json.JSONDecoder().raw_decode(text[i:])
found=False
for c in obj.get("checks") or []:
  if c.get("name")=="postgres_ready":
    print("|".join([
      str(c.get("status") or ""),
      str(c.get("severity") or ""),
      str(c.get("detail") or ""),
    ]))
    found=True
    break
if not found:
  print("missing|||")
print("OVERALL="+obj.get("overall","?")+" EXIT="+str(obj.get("exit_code","?")))
leak=0
low=text.lower()
if "database_url=" in low or "postgresql://" in low or "postgres://" in low:
  leak=1
if "begin rsa" in low or "private key" in low:
  leak=1
if "password=" in low:
  leak=1
print("LEAK="+str(leak))
PY
}

# Shared env for fixture runs (correct fixture key names from health-check.sh).
run_hc() {
  # Usage: run_hc [ENV=val ...] -- bash "$HC" ...
  local -a env_vars=()
  while [[ $# -gt 0 && "$1" != "--" ]]; do
    env_vars+=("$1")
    shift
  done
  if [[ "${1:-}" == "--" ]]; then
    shift
  fi
  env \
    PATH="$BIN:$PATH" \
    WOODRIGHT_MONITOR_WRITE=0 \
    WOODRIGHT_FIXTURE_BE_DISCOVERY_OK=1 \
    WOODRIGHT_FIXTURE_SF_DISCOVERY_OK=1 \
    WOODRIGHT_FIXTURE_BACKUP_AGE_HOURS=1 \
    WOODRIGHT_FIXTURE_DISK_PCT=10 \
    WOODRIGHT_ACTIVE_OWNER="$TMP/active.json" \
    WOODRIGHT_EXPECTED_RELEASE="$TMP/expected.json" \
    "${env_vars[@]}" \
    "$@"
}

run_case() {
  local name="$1" env_name="$2" mode="$3" expect_status="$4"
  local out detail status_line pg_status pg_sev pg_detail rc
  out="$(mktemp)"
  local expect_user expect_db expect_pg
  if [[ "$env_name" == "production" ]]; then
    expect_user="$PROD_USER"; expect_db="$PROD_DB"; expect_pg="$PROD_PG"
  else
    expect_user="$DEMO_USER"; expect_db="$DEMO_DB"; expect_pg="$DEMO_PG"
  fi
  set +e
  run_hc \
    "WR_SHIM_MODE=$mode" \
    "WR_SHIM_EXPECT_USER=$expect_user" \
    "WR_SHIM_EXPECT_DB=$expect_db" \
    "WR_SHIM_EXPECT_PG=$expect_pg" \
    -- bash "$HC" --environment "$env_name" >"$out" 2>/dev/null
  rc=$?
  set -e
  status_line="$(extract_pg "$out")"
  detail="$(printf '%s\n' "$status_line" | head -1)"
  pg_status="${detail%%|*}"
  rest="${detail#*|}"
  pg_sev="${rest%%|*}"
  pg_detail="${rest#*|}"
  if printf '%s\n' "$status_line" | grep -q 'LEAK=1'; then
    fail "$name secret leak in output"
  else
    pass "$name no secret leak"
  fi
  # Process exit may be non-zero due to incomplete docker inspect shim for non-PG checks.
  # Contract under test: postgres_ready status/severity + JSON exit_code reflects critical PG fail.
  local json_exit
  json_exit="$(printf '%s\n' "$status_line" | sed -n 's/^OVERALL=.* EXIT=//p' | head -1)"
  if [[ "$expect_status" == "pass" ]]; then
    if [[ "$pg_status" == "pass" ]]; then
      pass "$name postgres=pass|$pg_detail (proc_rc=$rc json_exit=$json_exit)"
    else
      fail "$name expected pass got $detail"
    fi
  else
    if [[ "$pg_status" == "fail" && "$pg_sev" == "critical" ]]; then
      pass "$name postgres=fail|$pg_detail (proc_rc=$rc json_exit=$json_exit)"
    else
      fail "$name expected critical fail got $detail"
    fi
    if [[ "$json_exit" =~ ^[0-9]+$ && "$json_exit" -ge 2 ]]; then
      pass "$name json exit_code critical ($json_exit)"
    else
      fail "$name expected json exit_code>=2 got $json_exit"
    fi
  fi
  rm -f "$out"
}

# Minimal ownership fixtures so digest/owner checks do not explode when present
printf '%s\n' '{"owner":"test","ok":true}' >"$TMP/active.json"
printf '%s\n' '{"release_sha":"deadbeef","ok":true}' >"$TMP/expected.json"

# 1) Production correct identity → pass
run_case "prod_match" production match pass
# 2) Public_demo correct identity → pass
run_case "demo_match" public_demo match pass
# 3) Production with deny_user (role mismatch) → fail
run_case "prod_bad_user" production deny_user fail
# 4) Public_demo with deny_db → fail
run_case "demo_bad_db" public_demo deny_db fail
# 5) Exited keeper not ready → fail
run_case "prod_exited_keeper" production exited_keeper fail

# 6) No --environment and no WOODRIGHT_MONITOR_PG_USER → fail-closed (missing_db_user)
out="$(mktemp)"
set +e
run_hc \
  "WOODRIGHT_PG_CONTAINER=$PROD_PG" \
  "WOODRIGHT_REDIS_CONTAINER=$PROD_REDIS" \
  "WOODRIGHT_MONITOR_PG_DB=$PROD_DB" \
  "WR_SHIM_MODE=match" \
  "WR_SHIM_EXPECT_USER=$PROD_USER" \
  "WR_SHIM_EXPECT_DB=$PROD_DB" \
  "WR_SHIM_EXPECT_PG=$PROD_PG" \
  -- bash "$HC" >"$out" 2>/dev/null
set -e
status_line="$(extract_pg "$out")"
detail="$(printf '%s\n' "$status_line" | head -1)"
json_exit="$(printf '%s\n' "$status_line" | sed -n 's/^OVERALL=.* EXIT=//p' | head -1)"
pg_status="${detail%%|*}"
rest="${detail#*|}"
pg_sev="${rest%%|*}"
pg_detail="${rest#*|}"
if [[ "$pg_status" == "fail" && "$pg_sev" == "critical" && "$pg_detail" == *missing_db_user* ]]; then
  pass "no-profile missing_db_user fail-closed ($detail)"
else
  fail "no-profile should fail-closed without user got $detail"
fi
if [[ "$json_exit" =~ ^[0-9]+$ && "$json_exit" -ge 2 ]]; then
  pass "no-profile json exit_code critical ($json_exit)"
else
  fail "no-profile expected json exit_code>=2 got $json_exit"
fi
rm -f "$out"

# 7) Cross-stack: production monitor against shim that only accepts public_demo identity
out="$(mktemp)"
set +e
run_hc \
  "WR_SHIM_MODE=match" \
  "WR_SHIM_EXPECT_USER=$DEMO_USER" \
  "WR_SHIM_EXPECT_DB=$DEMO_DB" \
  "WR_SHIM_EXPECT_PG=$DEMO_PG" \
  -- bash "$HC" --environment production >"$out" 2>/dev/null
set -e
status_line="$(extract_pg "$out")"
detail="$(printf '%s\n' "$status_line" | head -1)"
json_exit="$(printf '%s\n' "$status_line" | sed -n 's/^OVERALL=.* EXIT=//p' | head -1)"
pg_status="${detail%%|*}"
rest="${detail#*|}"
pg_sev="${rest%%|*}"
if [[ "$pg_status" == "fail" && "$pg_sev" == "critical" ]]; then
  pass "prod_monitor_vs_demo_observed fail ($detail)"
else
  fail "prod vs demo observed should fail got $detail"
fi
if [[ "$json_exit" =~ ^[0-9]+$ && "$json_exit" -ge 2 ]]; then
  pass "prod_vs_demo json exit_code critical ($json_exit)"
else
  fail "prod_vs_demo expected json exit_code>=2 got $json_exit"
fi
rm -f "$out"

# 8) Cross-stack: public_demo monitor against shim that only accepts production identity
out="$(mktemp)"
set +e
run_hc \
  "WR_SHIM_MODE=match" \
  "WR_SHIM_EXPECT_USER=$PROD_USER" \
  "WR_SHIM_EXPECT_DB=$PROD_DB" \
  "WR_SHIM_EXPECT_PG=$PROD_PG" \
  -- bash "$HC" --environment public_demo >"$out" 2>/dev/null
set -e
status_line="$(extract_pg "$out")"
detail="$(printf '%s\n' "$status_line" | head -1)"
json_exit="$(printf '%s\n' "$status_line" | sed -n 's/^OVERALL=.* EXIT=//p' | head -1)"
pg_status="${detail%%|*}"
rest="${detail#*|}"
pg_sev="${rest%%|*}"
if [[ "$pg_status" == "fail" && "$pg_sev" == "critical" ]]; then
  pass "demo_monitor_vs_prod_observed fail ($detail)"
else
  fail "demo vs prod observed should fail got $detail"
fi
if [[ "$json_exit" =~ ^[0-9]+$ && "$json_exit" -ge 2 ]]; then
  pass "demo_vs_prod json exit_code critical ($json_exit)"
else
  fail "demo_vs_prod expected json exit_code>=2 got $json_exit"
fi
rm -f "$out"

if [[ "$FAIL" -ne 0 ]]; then
  echo "RESULT: FAIL count=$FAIL"
  exit 1
fi
echo "RESULT: PASS"
exit 0
