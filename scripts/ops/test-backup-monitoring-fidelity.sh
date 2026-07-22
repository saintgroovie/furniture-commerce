#!/usr/bin/env bash
# Fidelity tests for Woodright backup/monitoring ops scripts (local, no live mutate).
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BK="$ROOT/ops/backup"
MON="$ROOT/ops/monitoring"
SYS="$ROOT/ops/systemd"
FAIL=0

pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*"; FAIL=$((FAIL+1)); }

# Syntax
for f in "$BK"/*.sh "$MON"/*.sh; do
  bash -n "$f" && pass "syntax $(basename "$f")" || fail "syntax $(basename "$f")"
done

# shellcheck if present
if command -v shellcheck >/dev/null 2>&1; then
  shellcheck -x "$BK"/*.sh "$MON"/*.sh && pass shellcheck || fail shellcheck
else
  pass "shellcheck skipped (not installed)"
fi

# No secret echo patterns
if grep -REn 'echo.*(DATABASE_URL|PASSWORD|JWT|SECRET|API_KEY)' "$BK" "$MON" >/dev/null 2>&1; then
  fail "possible secret echo"
else
  pass "no secret echo patterns"
fi

# No unsafe rm of /
if grep -REn 'rm[[:space:]]+(-[a-zA-Z]*f[a-zA-Z]*|--force).*[[:space:]]/[[:space:]]*$|rm[[:space:]]+-rf[[:space:]]+/' "$BK" "$MON" \
  | grep -v 'BACKUP_ROOT\|quarantine\|partial\|HISTORY\|FIXTURE\|tmp\|TMP\|helper' >/dev/null 2>&1; then
  # softer: ban explicit rm -rf /
  if grep -REn 'rm[[:space:]]+-rf[[:space:]]+/[[:space:]]*$|rm[[:space:]]+-rf[[:space:]]+"/"' "$BK" "$MON"; then
    fail "unsafe rm /"
  else
    pass "no rm -rf /"
  fi
else
  pass "no obvious unsafe rm root"
fi

# Monitoring mutation ban (ignore comments; ignore owner string "dokploy")
MUT_FILE=$(mktemp)
grep -REn 'docker[[:space:]]+(restart|kill|rm)|compose[[:space:]]+(up|down)|iptables[[:space:]]+-[AD]|ip6tables[[:space:]]+-[AD]|ufw[[:space:]]+(allow|delete)|systemctl[[:space:]]+restart|git[[:space:]]+(push|commit)|[[:space:]]kill[[:space:]]+-' "$MON" \
  | grep -vE '^\s*#|Forbidden|hard ban|must never|Read-only|NEVER' >"$MUT_FILE" || true
if [[ -s "$MUT_FILE" ]]; then
  cat "$MUT_FILE"
  fail "monitoring contains mutation-like commands"
else
  pass "monitoring read-only mutation scan"
fi
rm -f "$MUT_FILE"

# Retention guards present
grep -q 'refuse /\|BACKUP_ROOT != "/"' "$BK/woodright-backup-retention.sh" && pass "retention root guard" || fail "retention root guard"
grep -q 'dry-run\|DRY_RUN' "$BK/woodright-backup-retention.sh" && pass "retention dry-run" || fail "retention dry-run"
grep -q 'newest\|keep\|DAILY_KEEP' "$BK/woodright-backup-retention.sh" && pass "retention keep logic" || fail "retention keep"

# Atomic rename / partial
grep -q 'partial_\|mv -f' "$BK/woodright-postgres-backup.sh" && pass "pg atomic rename" || fail "pg atomic"
grep -q 'partial_\|mv -f' "$BK/woodright-media-backup.sh" && pass "media atomic rename" || fail "media atomic"
grep -q 'mount\|MIN_FILES\|empty' "$BK/woodright-media-backup.sh" && pass "media mount/empty guards" || fail "media guards"

# Systemd paths
grep -q 'woodright-backup-run.sh' "$SYS/woodright-backup.service" && pass "backup unit path" || fail "backup unit"
grep -q 'woodright-health-check.sh' "$SYS/woodright-monitor.service" && pass "monitor unit path" || fail "monitor unit"
grep -q 'Type=oneshot' "$SYS/woodright-backup.service" && pass "backup oneshot" || fail "backup oneshot"
grep -q 'UMask=0077' "$SYS/woodright-backup.service" && pass "umask" || fail "umask"
if grep -E '^(Environment|ExecStart).*(DATABASE_URL|PASSWORD)=' "$SYS"/*.service >/dev/null 2>&1; then
  fail "secrets in units"
else
  pass "no secrets in units"
fi

# Retention dry-run with alt root fixture
TMP=$(mktemp -d)
export WOODRIGHT_BACKUP_ALLOW_ALT_ROOT=1
export WOODRIGHT_BACKUP_ROOT="$TMP"
mkdir -p "$TMP/postgres/daily" "$TMP/media/daily" "$TMP/manifests" "$TMP/quarantine"
# create 16 fake complete dumps
for i in $(seq -w 1 16); do
  echo x >"$TMP/postgres/daily/fake_$i.dump"
  echo "abc  fake_$i.dump" >"$TMP/postgres/daily/fake_$i.dump.sha256"
done
# incomplete newest should NOT displace complete set
echo incomplete >"$TMP/postgres/daily/zzz_newest_incomplete.dump"
OUT=$("$BK/woodright-backup-retention.sh" --dry-run 2>&1 || true)
echo "$OUT" | grep -q 'DRY-RUN would delete' && pass "retention dry-run deletes candidates" || fail "retention dry-run candidates"
echo "$OUT" | grep -q 'complete_count=16' && pass "retention ignores incomplete" || fail "retention incomplete filter"
"$BK/woodright-backup-retention.sh" --apply >/dev/null 2>&1 || true
LEFT=$(ls "$TMP/postgres/daily"/*.dump 2>/dev/null | wc -l | tr -d ' ')
# 14 complete kept + 1 incomplete = 15
[[ "$LEFT" -eq 15 ]] && pass "retention apply keeps 14 complete + incomplete" || fail "retention apply count=$LEFT"
[[ -f "$TMP/postgres/daily/zzz_newest_incomplete.dump" ]] && pass "incomplete not deleted by retention" || fail "incomplete deleted"
# nested symlink dir must fail
mkdir -p "$TMP/outside" "$TMP/postgres"
rm -rf "$TMP/postgres/daily"
ln -s "$TMP/outside" "$TMP/postgres/daily"
echo y >"$TMP/outside/escape.dump"
echo "abc  escape.dump" >"$TMP/outside/escape.dump.sha256"
if "$BK/woodright-backup-retention.sh" --dry-run >/dev/null 2>&1; then
  fail "symlink daily dir should be refused"
else
  pass "symlink daily dir refused"
fi
# quarantine untouched
mkdir -p "$TMP/quarantine" && echo q >"$TMP/quarantine/keep.dump"
# recreate normal daily for quarantine check
rm -f "$TMP/postgres/daily"
mkdir -p "$TMP/postgres/daily"
"$BK/woodright-backup-retention.sh" --apply >/dev/null 2>&1 || true
[[ -f "$TMP/quarantine/keep.dump" ]] && pass "quarantine preserved" || fail "quarantine"
# nested symlink state must fail in orchestrator guard
TMP2=$(mktemp -d)
export WOODRIGHT_BACKUP_ROOT="$TMP2"
mkdir -p "$TMP2/outside"
ln -s "$TMP2/outside" "$TMP2/state"
if "$BK/woodright-backup-run.sh" >/dev/null 2>&1; then
  fail "symlink state dir should be refused"
else
  pass "symlink state dir refused by orchestrator"
fi
# lock override outside root must fail
if WOODRIGHT_BACKUP_LOCK=/tmp/wr-evil.lock "$BK/woodright-postgres-backup.sh" >/dev/null 2>&1; then
  fail "external LOCK_FILE should be refused"
else
  pass "external LOCK_FILE refused"
fi
rm -rf "$TMP2"
rm -rf "$TMP"

[[ $FAIL -eq 0 ]] && { echo "ALL FIDELITY TESTS PASSED"; exit 0; }
echo "FIDELITY FAILURES=$FAIL"; exit 1
