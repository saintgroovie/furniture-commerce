#!/usr/bin/env bash
# Fidelity: privileged candidate `docker compose --env-file` wrapper.
# Fake sudo / fake docker only. Never prints secret sentinels.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LIB="$ROOT/ops/lib/woodright-compose-env-authority.sh"
SENTINEL="THIS_MUST_NEVER_APPEAR_IN_OUTPUT"

FAILED=0
pass() { echo "PASS $*"; }
fail() { echo "FAIL $*"; FAILED=$((FAILED + 1)); }

# shellcheck source=../../ops/lib/woodright-compose-env-authority.sh
source "$LIB"

TMP_RAW="$(mktemp -d /tmp/wr-compose-env-compose-XXXXXX)" || exit 1
TMP="$(cd "$TMP_RAW" && pwd -P)" || exit 1
case "$TMP" in
  /tmp/wr-compose-env-compose-*|/private/tmp/wr-compose-env-compose-*) ;;
  *) echo "refusing unexpected tmp dir: $TMP" >&2; exit 1 ;;
esac
cleanup() {
  case "$TMP" in
    /tmp/wr-compose-env-compose-*|/private/tmp/wr-compose-env-compose-*) ;;
    *) echo "refusing cleanup of $TMP" >&2; return 1 ;;
  esac
  find "$TMP" -name '.env' -exec chmod u+rw {} + 2>/dev/null || true
  if [[ "$FAILED" -eq 0 ]]; then rm -rf "$TMP"
  else echo "harness kept: $TMP"; fi
}
trap cleanup EXIT

PARENT="$TMP/etc/dokploy/compose/woodright-production"
CODE="$PARENT/code"
ENV_FILE="$CODE/.env"
YML="$CODE/docker-compose.yml"
PUB="$TMP/etc/dokploy/compose/woodright-public-production/code"
BIN="$TMP/bin"
mkdir -p "$CODE" "$PUB" "$BIN" "$TMP/log"

printf 'services: {}\n' >"$YML"
cat >"$ENV_FILE" <<EOF
WOODRIGHT_BACKEND_IMAGE=ghcr.io/saintgroovie/woodright-backend@sha256:$(printf 'c%.0s' {1..64})
SECRET=${SENTINEL}
EOF
printf 'SECRET=%s\n' "$SENTINEL" >"$PUB/.env"

export WOODRIGHT_DOKPLOY_COMPOSE_DIR="$PARENT"
export WOODRIGHT_COMPOSE_ENV_FILE="$ENV_FILE"
export WOODRIGHT_COMPOSE_FILE="$YML"
export WOODRIGHT_COMPOSE_PROJECT="woodright-production"
export WOODRIGHT_DOCKER_BIN="$BIN/docker"

cat >"$BIN/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'docker %s\n' "$*" >>"${WR_COMPOSE_ARGV_LOG:?}"
if [[ "${1:-}" != "compose" ]]; then
  echo "unexpected docker verb $1" >&2
  exit 1
fi
shift
env_file=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file) env_file="$2"; shift 2 ;;
    --env-file=*) env_file="${1#--env-file=}"; shift ;;
    *) shift ;;
  esac
done
if [[ -n "$env_file" && ! -r "$env_file" ]]; then
  echo "open $env_file: permission denied" >&2
  exit 1
fi
exit 0
EOF
chmod +x "$BIN/docker"

cat >"$BIN/sudo" <<EOF
#!/usr/bin/env bash
set -euo pipefail
ENV_FILE=$(printf '%q' "$ENV_FILE")
DOCKER_BIN=$(printf '%q' "$BIN/docker")
LOG=$(printf '%q' "$TMP/log/sudo.log")
if [[ "\${1:-}" != "-n" ]]; then
  echo "unexpected sudo (want -n): \$*" >&2
  exit 1
fi
shift
cmd="\${1:-}"
shift || true
if [[ "\$cmd" != "/usr/bin/docker" ]]; then
  echo "unexpected sudo command: \$cmd \$*" >&2
  exit 1
fi
[[ "\${1:-}" == "compose" ]] || { echo "want compose" >&2; exit 1; }
printf 'sudo-docker-bin %s\n' "\$cmd" >>"\$LOG"
printf 'sudo-docker %s\n' "\$*" >>"\$LOG"
chmod u+rw "\$ENV_FILE" 2>/dev/null || true
set +e
"\$DOCKER_BIN" "\$@"
rc=\$?
set -e
chmod 000 "\$ENV_FILE" 2>/dev/null || true
exit \$rc
EOF
chmod +x "$BIN/sudo"

export WR_COMPOSE_ARGV_LOG="$TMP/log/docker.log"
export PATH="$BIN:$PATH"

canon_args() {
  wr_candidate_compose \
    --project-directory "$CODE" \
    -f "$YML" \
    --env-file "$ENV_FILE" \
    --project-name woodright-production \
    up -d --no-deps --force-recreate "$1"
}

assert_no_sentinel() {
  local label="$1"
  shift
  if printf '%s\n' "$@" | grep -F -q "$SENTINEL"; then
    fail "$label: sentinel leaked"
  else
    pass "$label: sentinel absent"
  fi
}

# Readable env: unprivileged docker compose (no sudo log).
: >"$TMP/log/docker.log"
: >"$TMP/log/sudo.log"
RC=0
canon_args backend >"$TMP/out-read.txt" 2>"$TMP/err-read.txt" || RC=$?
[[ "$RC" -eq 0 && "${WR_CANDIDATE_COMPOSE_METHOD:-}" == "unprivileged" ]] \
  && pass "readable env: unprivileged method" || fail "readable env: method=${WR_CANDIDATE_COMPOSE_METHOD:-} rc=$RC"
[[ ! -s "$TMP/log/sudo.log" ]] && pass "readable env: sudo not used" || fail "readable env: sudo used"
assert_no_sentinel "readable stdout" "$(cat "$TMP/out-read.txt")"
assert_no_sentinel "readable stderr" "$(cat "$TMP/err-read.txt")"

# Protected env: sudo -n <docker> compose.
chmod 000 "$ENV_FILE"
[[ ! -r "$ENV_FILE" ]] && pass "protected: DIRECT_READ_DENIED" || fail "protected: still readable"
: >"$TMP/log/docker.log"
: >"$TMP/log/sudo.log"
RC=0
canon_args storefront >"$TMP/out-priv.txt" 2>"$TMP/err-priv.txt" || RC=$?
[[ "$RC" -eq 0 && "${WR_CANDIDATE_COMPOSE_METHOD:-}" == "privileged" ]] \
  && pass "protected env: privileged method" || fail "protected env: method=${WR_CANDIDATE_COMPOSE_METHOD:-} rc=$RC"
grep -q 'sudo-docker' "$TMP/log/sudo.log" && pass "protected env: sudo docker compose" \
  || fail "protected env: sudo log missing"
grep -q -- '--project-name woodright-production' "$TMP/log/docker.log" \
  && grep -q -- '--project-directory' "$TMP/log/docker.log" \
  && pass "protected env: project identity explicit" || fail "protected env: project identity"
assert_no_sentinel "protected stdout" "$(cat "$TMP/out-priv.txt")"
assert_no_sentinel "protected stderr" "$(cat "$TMP/err-priv.txt")"

# Protected env ignores WOODRIGHT_DOCKER_BIN so it cannot become a sudo target.
mkdir -p "$TMP/evilbin"
cat >"$TMP/evilbin/docker" <<'EOF'
#!/usr/bin/env bash
echo "EVIL_DOCKER_RAN $*" >&2
exit 1
EOF
chmod +x "$TMP/evilbin/docker"
chmod 000 "$ENV_FILE"
: >"$TMP/log/docker.log"
: >"$TMP/log/sudo.log"
RC=0
WOODRIGHT_DOCKER_BIN="$TMP/evilbin/docker" canon_args backend \
  >"$TMP/out-dock-ignore.txt" 2>"$TMP/err-dock-ignore.txt" || RC=$?
[[ "$RC" -eq 0 && "${WR_CANDIDATE_COMPOSE_METHOD:-}" == "privileged" ]] \
  && pass "protected env: DOCKER_BIN override ignored" \
  || fail "protected env: DOCKER_BIN override method=${WR_CANDIDATE_COMPOSE_METHOD:-} rc=$RC"
if grep -q 'EVIL_DOCKER_RAN' "$TMP/out-dock-ignore.txt" "$TMP/err-dock-ignore.txt"; then
  fail "protected env: DOCKER_BIN override executed"
else
  pass "protected env: DOCKER_BIN override not executed"
fi
grep -q 'sudo-docker' "$TMP/log/sudo.log" \
  && pass "protected env: DOCKER_BIN ignore still used allowlisted docker" \
  || fail "protected env: DOCKER_BIN ignore missing sudo docker"

# PATH-selected docker must never be the sudo target on protected env.
mkdir -p "$TMP/pathbin"
cat >"$TMP/pathbin/docker" <<'EOF'
#!/usr/bin/env bash
echo "EVIL_PATH_DOCKER_RAN $*" >&2
exit 1
EOF
chmod +x "$TMP/pathbin/docker"
chmod 000 "$ENV_FILE"
: >"$TMP/log/docker.log"
: >"$TMP/log/sudo.log"
RC=0
PATH="$TMP/pathbin:$BIN:$PATH" canon_args backend \
  >"$TMP/out-path-docker.txt" 2>"$TMP/err-path-docker.txt" || RC=$?
[[ "$RC" -eq 0 && "${WR_CANDIDATE_COMPOSE_METHOD:-}" == "privileged" ]] \
  && pass "protected env: PATH docker ignored" \
  || fail "protected env: PATH docker method=${WR_CANDIDATE_COMPOSE_METHOD:-} rc=$RC"
if grep -q 'EVIL_PATH_DOCKER_RAN' "$TMP/out-path-docker.txt" "$TMP/err-path-docker.txt"; then
  fail "protected env: PATH docker executed"
else
  pass "protected env: PATH docker not executed"
fi
grep -q 'sudo-docker-bin /usr/bin/docker' "$TMP/log/sudo.log" \
  && pass "protected env: sudo target is /usr/bin/docker" \
  || fail "protected env: sudo target is not allowlisted /usr/bin/docker"

# No unprivileged fallback when sudo compose fails.
chmod 000 "$ENV_FILE"
cat >"$BIN/sudo" <<'EOF'
#!/usr/bin/env bash
echo "sudo compose unavailable" >&2
exit 1
EOF
chmod +x "$BIN/sudo"
RC=0
canon_args backend >"$TMP/out-fail.txt" 2>"$TMP/err-fail.txt" || RC=$?
[[ "$RC" -ne 0 ]] && pass "sudo compose fail: fail-closed" || fail "sudo compose fail: rc=$RC"
grep -q 'permission denied' "$TMP/out-fail.txt" && fail "sudo compose fail: unprivileged open attempted" \
  || pass "sudo compose fail: no unprivileged env open"
assert_no_sentinel "sudo fail" "$(cat "$TMP/out-fail.txt"; cat "$TMP/err-fail.txt")"

# Restore working sudo for remaining denials.
cat >"$BIN/sudo" <<EOF
#!/usr/bin/env bash
echo "sudo should not run for deny tests: \$*" >&2
exit 1
EOF
chmod +x "$BIN/sudo"
chmod u+rw "$ENV_FILE"

# config subcommand refused (secret interpolation).
RC=0
wr_candidate_compose --project-directory "$CODE" -f "$YML" --env-file "$ENV_FILE" \
  --project-name woodright-production config >"$TMP/out-config.txt" 2>"$TMP/err-config.txt" || RC=$?
[[ "$RC" -ne 0 ]] && pass "config: refused" || fail "config: allowed"
assert_no_sentinel "config" "$(cat "$TMP/out-config.txt"; cat "$TMP/err-config.txt")"

# Public-production env refused.
RC=0
WOODRIGHT_COMPOSE_ENV_FILE="$PUB/.env" WOODRIGHT_DOKPLOY_COMPOSE_DIR="$(dirname "$PUB")" \
  wr_candidate_compose --project-directory "$PUB" -f "$YML" --env-file "$PUB/.env" \
  --project-name woodright-production up -d --no-deps backend \
  >"$TMP/out-pub.txt" 2>"$TMP/err-pub.txt" || RC=$?
[[ "$RC" -ne 0 ]] && pass "public-production: denied" || fail "public-production: allowed"

# Public demo path refused.
RC=0
wr_candidate_compose --project-directory "$CODE" -f "$YML" --env-file \
  "$TMP/etc/dokploy/compose/woodright-stack-3dsdhd/code/.env" \
  --project-name woodright-production up -d --no-deps backend \
  >"$TMP/out-demo.txt" 2>"$TMP/err-demo.txt" || RC=$?
[[ "$RC" -ne 0 ]] && pass "public-demo path: denied" || fail "public-demo path: allowed"

# Symlink env refused.
ln -s "$ENV_FILE" "$CODE/link.env"
RC=0
wr_candidate_compose --project-directory "$CODE" -f "$YML" --env-file "$CODE/link.env" \
  --project-name woodright-production up -d --no-deps backend \
  >"$TMP/out-link.txt" 2>"$TMP/err-link.txt" || RC=$?
[[ "$RC" -ne 0 ]] && pass "symlink env: denied" || fail "symlink env: allowed"

# Wrong project name.
RC=0
wr_candidate_compose --project-directory "$CODE" -f "$YML" --env-file "$ENV_FILE" \
  --project-name woodright-public-production up -d --no-deps backend \
  >"$TMP/out-proj.txt" 2>"$TMP/err-proj.txt" || RC=$?
[[ "$RC" -ne 0 ]] && pass "wrong project: denied" || fail "wrong project: allowed"

# Wrong docker basename.
RC=0
WOODRIGHT_DOCKER_BIN="$BIN/sudo" wr_candidate_compose \
  --project-directory "$CODE" -f "$YML" --env-file "$ENV_FILE" \
  --project-name woodright-production up -d --no-deps backend \
  >"$TMP/out-dock.txt" 2>"$TMP/err-dock.txt" || RC=$?
[[ "$RC" -ne 0 ]] && pass "wrong docker bin: denied" || fail "wrong docker bin: allowed"

# COMPOSE_BIN must not contain sudo.
RC=0
WOODRIGHT_COMPOSE_BIN="sudo -n docker compose" wr_candidate_compose \
  --project-directory "$CODE" -f "$YML" --env-file "$ENV_FILE" \
  --project-name woodright-production up -d --no-deps backend \
  >"$TMP/out-hook.txt" 2>"$TMP/err-hook.txt" || RC=$?
[[ "$RC" -ne 0 ]] && pass "COMPOSE_BIN sudo: denied" || fail "COMPOSE_BIN sudo: allowed"

# postgres service refused.
RC=0
wr_candidate_compose --project-directory "$CODE" -f "$YML" --env-file "$ENV_FILE" \
  --project-name woodright-production up -d --no-deps postgres \
  >"$TMP/out-pg.txt" 2>"$TMP/err-pg.txt" || RC=$?
[[ "$RC" -ne 0 ]] && pass "postgres service: denied" || fail "postgres service: allowed"

assert_no_sentinel "deny stdout/err" "$(cat "$TMP"/out-*.txt "$TMP"/err-*.txt)"

if [[ "$FAILED" -eq 0 ]]; then
  echo "OK compose-env privileged compose"
  exit 0
fi
echo "FAILED count=$FAILED"
exit 1
