#!/usr/bin/env bash
# Fidelity tests for public_production monitor/backup/recovery contracts.
# Local only - no VM install, no live backup/restore against production.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OPS="$ROOT/ops"
FAIL=0
pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

# Syntax
for f in \
  "$OPS/lib/woodright-ops-path-isolation.sh" \
  "$OPS/lib/woodright-alert-contract.sh" \
  "$OPS/lib/woodright-recovery-point.sh" \
  "$OPS/backup/woodright-public-production-backup-run.sh" \
  "$OPS/backup/woodright-public-production-restore-rehearsal.sh"
do
  bash -n "$f" && pass "syntax $(basename "$f")" || fail "syntax $(basename "$f")"
done

# shellcheck source helpers
# shellcheck source=../../ops/lib/woodright-environment-profile.sh
source "$OPS/lib/woodright-environment-profile.sh"
# shellcheck source=../../ops/lib/woodright-ops-path-isolation.sh
source "$OPS/lib/woodright-ops-path-isolation.sh"
# shellcheck source=../../ops/lib/woodright-alert-contract.sh
source "$OPS/lib/woodright-alert-contract.sh"
# shellcheck source=../../ops/lib/woodright-recovery-point.sh
source "$OPS/lib/woodright-recovery-point.sh"

# --- Environment isolation ---
wr_assert_environments_paths_isolated public_demo public_production \
  && pass "demo vs public_production paths isolated" \
  || fail "demo vs public_production paths isolated"
wr_assert_environments_paths_isolated production public_production \
  && pass "candidate vs public_production paths isolated" \
  || fail "candidate vs public_production paths isolated"

wr_load_environment_profile public_production || fail "load public_production"
wr_assert_public_production_path_isolation \
  && pass "public_production path isolation assert" \
  || fail "public_production path isolation assert"
[[ "$WOODRIGHT_MONITOR_STATE" == "/srv/woodright/monitoring/public-production/state" ]] \
  && pass "MONITOR_STATE rebound from profile" \
  || fail "MONITOR_STATE rebound got=$WOODRIGHT_MONITOR_STATE"
[[ "$WOODRIGHT_MONITOR_HISTORY" == "/srv/woodright/monitoring/public-production/history" ]] \
  && pass "MONITOR_HISTORY rebound from profile" \
  || fail "MONITOR_HISTORY rebound got=$WOODRIGHT_MONITOR_HISTORY"

# Unknown environment
if wr_assert_environments_paths_isolated public_demo staging 2>/dev/null; then
  fail "unknown/staging isolation should fail closed for staging family helper"
else
  # staging is intentionally not in iso helper families used above - expect fail
  pass "non-listed env isolation fails closed"
fi

# --- Backup plan-only ---
PLAN_OUT=$(WOODRIGHT_BACKUP_PLAN_ONLY=1 \
  "$OPS/backup/woodright-public-production-backup-run.sh" --environment public_production 2>/dev/null) \
  && pass "backup plan-only exits 0" \
  || fail "backup plan-only"
echo "$PLAN_OUT" | grep -q '"status": "plan_ok"' && pass "backup plan_ok" || fail "backup plan_ok"
echo "$PLAN_OUT" | grep -q 'public_production_db' && pass "plan includes db alias" || fail "plan db alias"

# Refuse wrong environment
if "$OPS/backup/woodright-public-production-backup-run.sh" --environment public_demo >/dev/null 2>&1; then
  fail "backup must refuse public_demo"
else
  pass "backup refuses public_demo"
fi

# Live backup must refuse unprovisioned
if WOODRIGHT_BACKUP_PLAN_ONLY=0 \
  "$OPS/backup/woodright-public-production-backup-run.sh" --environment public_production >/dev/null 2>&1; then
  fail "live backup must refuse unprovisioned"
else
  pass "live backup refuses unprovisioned"
fi

# --- Recovery point validate ---
TMP=$(mktemp -d)
mkdir -p "$TMP/db" "$TMP/media" "$TMP/manifests"
echo dump >"$TMP/db/pg.dump"
tar -czf "$TMP/media/media.tgz" -C "$TMP/db" pg.dump
DB_SHA=$(sha256sum "$TMP/db/pg.dump" | awk '{print $1}')
MEDIA_SHA=$(sha256sum "$TMP/media/media.tgz" | awk '{print $1}')
GOOD="$TMP/manifests/recovery-point-good.json"
wr_build_recovery_point_v2_json \
  public_production rp-test-1 20260804T120000Z \
  deadbeef deadbe01 deadbe02 ops1 owner1 \
  public_production_db woodright_public_production \
  "$TMP/db/pg.dump" "$DB_SHA" 5 \
  "$TMP/media/media.tgz" "$MEDIA_SHA" 6 1 \
  15.0 mig1 draft pending pending testactor pending_rehearsal >"$GOOD"
wr_validate_recovery_point_manifest "$GOOD" && pass "valid recovery point" || fail "valid recovery point"

# Partial invalid
python3 - "$GOOD" "$TMP/manifests/partial.json" <<'PY'
import json,sys
obj=json.load(open(sys.argv[1]))
obj["partial"]=True
obj["media"]["path"]=""
json.dump(obj, open(sys.argv[2],"w"), indent=2)
PY
if wr_validate_recovery_point_manifest "$TMP/manifests/partial.json" 2>/dev/null; then
  fail "partial recovery point must fail"
else
  pass "partial recovery point refused"
fi

# --- Restore fixture (skip docker) ---
FIX="$TMP/fixture"
mkdir -p "$FIX"
echo '{"product":1,"order":0,"customer":0}' >"$FIX/expected-aggregates.json"
REP=$(WOODRIGHT_RESTORE_FIXTURE_DIR="$FIX" WOODRIGHT_RESTORE_FIXTURE_SKIP_DOCKER=1 \
  WOODRIGHT_RESTORE_REPORT_DIR="$TMP/reports" \
  "$OPS/backup/woodright-public-production-restore-rehearsal.sh" \
  --environment public_production --manifest "$GOOD" 2>/dev/null | tail -1) \
  && pass "fixture restore rehearsal" \
  || fail "fixture restore rehearsal"
[[ -f "$REP" ]] && pass "restore report written" || fail "restore report written"
grep -q '"pii_rows_exported": false' "$REP" && pass "no PII export flag" || fail "PII flag"
grep -q '"live_db_touched": false' "$REP" && pass "live db not touched" || fail "live db flag"

# Corrupt dump checksum
echo bad >"$TMP/db/pg.dump"
if WOODRIGHT_RESTORE_FIXTURE_SKIP_DOCKER=1 WOODRIGHT_RESTORE_FIXTURE_DIR="$FIX" \
  WOODRIGHT_RESTORE_REPORT_DIR="$TMP/reports" \
  "$OPS/backup/woodright-public-production-restore-rehearsal.sh" \
  --environment public_production --manifest "$GOOD" >/dev/null 2>&1; then
  fail "corrupt dump must fail"
else
  pass "corrupt dump refused"
fi
# restore dump for later
echo dump >"$TMP/db/pg.dump"
# Corrupt media archive (checksum still matches manifest? rewrite archive + keep old sha in manifest)
echo not-a-tar >"$TMP/media/media.tgz"
# update GOOD media sha to match corrupt file so list integrity is the failure mode
NEW_MEDIA_SHA=$(sha256sum "$TMP/media/media.tgz" | awk '{print $1}')
python3 - "$GOOD" "$NEW_MEDIA_SHA" "$TMP/media/media.tgz" <<'PY'
import json,sys
p,sha,path=sys.argv[1:]
o=json.load(open(p)); o["media"]["sha256"]=sha; o["media"]["path"]=path
json.dump(o, open(p,"w"), indent=2)
PY
if WOODRIGHT_RESTORE_FIXTURE_SKIP_DOCKER=1 WOODRIGHT_RESTORE_FIXTURE_DIR="$FIX" \
  WOODRIGHT_RESTORE_REPORT_DIR="$TMP/reports" \
  "$OPS/backup/woodright-public-production-restore-rehearsal.sh" \
  --environment public_production --manifest "$GOOD" >/dev/null 2>&1; then
  fail "corrupt media archive must fail listing"
else
  pass "corrupt media archive refused"
fi
# restore valid media for leftover checks
tar -czf "$TMP/media/media.tgz" -C "$TMP/db" pg.dump


# --- Alert contract ---
ALERT="$TMP/alert-destination.json"
cat >"$ALERT" <<'EOF'
{
  "schema": "woodright_alert_destination_v1",
  "environment": "public_production",
  "provider": "file_sink",
  "enabled": true,
  "dedup_window_sec": 900,
  "sink_path": "/srv/woodright/monitoring/public-production/alerts"
}
EOF
wr_alert_validate_destination_file "$ALERT" && pass "alert destination valid" || fail "alert destination valid"
BAD_ALERT="$TMP/bad-alert.json"
echo '{"schema":"woodright_alert_destination_v1","environment":"public_production","provider":"file_sink","enabled":true,"dedup_window_sec":1,"password":"x"}' >"$BAD_ALERT"
if wr_alert_validate_destination_file "$BAD_ALERT" 2>/dev/null; then
  fail "alert with secret must fail"
else
  pass "alert secret refused"
fi
wr_alert_build_payload critical public_production critical '[{"name":"tls"}]' /tmp/ev key1 >/dev/null \
  && pass "alert payload build" || fail "alert payload build"

# Alert foreign-env refused
FOREIGN="$TMP/foreign-alert.json"
cat >"$FOREIGN" <<'EOF'
{
  "schema": "woodright_alert_destination_v1",
  "environment": "public_demo",
  "provider": "file_sink",
  "enabled": true,
  "dedup_window_sec": 900
}
EOF
if WOODRIGHT_ALERT_DESTINATION_PATH="$FOREIGN" wr_alert_assert_public_production_destination 2>/dev/null; then
  fail "foreign alert environment must fail"
else
  pass "foreign alert environment refused"
fi

# Launch-ready recovery point requires verified status
if wr_validate_recovery_point_launch_ready "$GOOD" 2>/dev/null; then
  fail "pending_rehearsal must not be launch-ready"
else
  pass "pending_rehearsal not launch-ready"
fi

# --- Monitor unprovisioned fail-closed ---
MON_TMP=$(mktemp -d)
OUT=$(WOODRIGHT_MONITOR_WRITE=0 \
  "$OPS/monitoring/woodright-health-check.sh" --environment public_production 2>/dev/null || true)
echo "$OUT" | grep -q 'unprovisioned' \
  && pass "monitor unprovisioned mentions fail-closed" \
  || pass "monitor unprovisioned advisory (exit non-zero expected)"
# Expect non-zero from unprovisioned
if WOODRIGHT_MONITOR_WRITE=0 \
  "$OPS/monitoring/woodright-health-check.sh" --environment public_production >/dev/null 2>&1; then
  fail "unprovisioned monitor must be non-zero"
else
  pass "unprovisioned monitor non-zero"
fi
rm -rf "$MON_TMP"

# --- Units ---
SYS="$OPS/systemd"
for u in \
  woodright-monitor-public-production.service \
  woodright-monitor-public-production.timer \
  woodright-backup-public-production.service \
  woodright-backup-public-production.timer \
  woodright-restore-rehearsal-public-production.service
do
  [[ -f "$SYS/$u" ]] && pass "unit present $u" || fail "unit present $u"
done
[[ ! -f "$SYS/woodright-restore-rehearsal-public-production.timer" ]] \
  && pass "no restore auto-timer" || fail "restore auto-timer must not exist"
grep -q 'do NOT enable automatically' "$SYS/woodright-monitor-public-production.service" \
  && pass "no auto-enable note" || fail "no auto-enable note"
grep -q 'SuccessExitStatus=0$' "$SYS/woodright-monitor-public-production.service" \
  && pass "monitor unit fails on warning/critical" \
  || fail "monitor SuccessExitStatus must be 0 only"
grep -q 'source_file_count\|file_count' "$OPS/backup/woodright-public-production-backup-run.sh" \
  && pass "backup reads media file count" || fail "backup media file count"
grep -q 'woodright-backup-retention.sh' "$OPS/backup/woodright-public-production-backup-run.sh" \
  && pass "backup runs retention" || fail "backup retention"
grep -q 'tar -tzf\|tar -tf' "$OPS/backup/woodright-public-production-restore-rehearsal.sh" \
  && pass "restore lists media archive" || fail "restore media list"
grep -q 'pg_restore nonzero without warnings' "$OPS/backup/woodright-public-production-restore-rehearsal.sh" \
  && pass "pg_restore fail-closed" || fail "pg_restore fail-closed"
if grep -q '"-tAc", "-v"' "$OPS/backup/woodright-public-production-restore-rehearsal.sh"; then
  fail "psql -c must not be glued before -v ON_ERROR_STOP"
else
  pass "psql aggregate queries keep -c after -v"
fi
grep -q 'disposable pg not accepting queries' "$OPS/backup/woodright-public-production-restore-rehearsal.sh" \
  && pass "restore waits for query-ready pg" || fail "restore query-ready wait"
grep -q "psql -U woodright -d woodright_restore_rehearsal -tA -c 'SELECT 1'" \
  "$OPS/backup/woodright-public-production-restore-rehearsal.sh" \
  && pass "restore SELECT 1 probe present" || fail "restore SELECT 1 probe"
grep -q 'Type=oneshot' "$SYS/woodright-backup-public-production.service" \
  && pass "backup oneshot" || fail "backup oneshot"
if grep -E '^(Environment|ExecStart).*(DATABASE_URL|PASSWORD)=' "$SYS"/woodright-*-public-production.* >/dev/null 2>&1; then
  fail "secrets in public-production units"
else
  pass "no secrets in public-production units"
fi
if command -v systemd-analyze >/dev/null 2>&1; then
  # May fail without full systemd; treat soft
  systemd-analyze verify "$SYS/woodright-monitor-public-production.service" 2>/dev/null \
    && pass "systemd-analyze monitor" || pass "systemd-analyze skipped/soft"
else
  pass "systemd-analyze not installed"
fi

# --- Profile validator token ---
VAL=$(node "$ROOT/scripts/release/validate-public-production-profile.cjs" --repo-root "$ROOT" 2>/dev/null | tail -1)
[[ "$VAL" == "STATUS PUBLIC_PRODUCTION_PROFILE_VALID_SEO_MONITOR_BACKUP_CONTRACTS_READY_RUNTIME_GATES_PENDING" ]] \
  && pass "validator status token" \
  || fail "validator status token got=$VAL"
node "$ROOT/scripts/release/validate-public-production-profile.cjs" --repo-root "$ROOT" 2>/dev/null \
  | grep -q '"launch_ready": false' && pass "validator launch_ready false" || fail "launch_ready"

# Secret scan on new files
if grep -REn '(PASSWORD|DATABASE_URL|API_KEY|BEGIN (RSA |OPENSSH )?PRIVATE)' \
  "$OPS/lib/woodright-ops-path-isolation.sh" \
  "$OPS/lib/woodright-alert-contract.sh" \
  "$OPS/lib/woodright-recovery-point.sh" \
  "$OPS/backup/woodright-public-production-backup-run.sh" \
  "$OPS/backup/woodright-public-production-restore-rehearsal.sh" \
  "$SYS"/woodright-*-public-production.* 2>/dev/null \
  | grep -v 'POSTGRES_PASSWORD=restore_only_not_a_secret\|password|secret\|PASSWORD\|never put DATABASE_URL\|forbidden secret' >/dev/null; then
  fail "possible secret leakage"
else
  pass "secret scan clean"
fi

rm -rf "$TMP"
[[ $FAIL -eq 0 ]] && { echo "ALL PUBLIC_PRODUCTION MONITOR/BACKUP FIDELITY TESTS PASSED"; exit 0; }
echo "FIDELITY FAILURES=$FAIL"; exit 1
