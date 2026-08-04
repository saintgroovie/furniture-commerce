#!/usr/bin/env bash
# Fidelity tests for public_production payment + notification decision contracts.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FAIL=0
pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

DEC="$ROOT/scripts/release/validate-payment-notification-decisions.cjs"
PROF="$ROOT/scripts/release/validate-public-production-profile.cjs"
FIX="$ROOT/scripts/ops/fixtures/payment-notification-decisions"
mkdir -p "$FIX"

# --- Repo pending fixtures ---
OUT=$(node "$DEC" --repo-root "$ROOT" --expect-status pending 2>/dev/null | tail -1)
[[ "$OUT" == "STATUS PUBLIC_PRODUCTION_PROFILE_VALID_CONTRACTS_READY_OWNER_DECISIONS_PENDING" ]] \
  && pass "pending decisions token" || fail "pending decisions token got=$OUT"

# Missing → blocked
if node "$DEC" --repo-root "$ROOT" --payment-fixture /tmp/missing-payment.json \
  --notification-fixture "$ROOT/ops/config/launch-decisions/public_production/NOTIFICATION_LAUNCH_DECISION.json" \
  --expect-status pending >/dev/null 2>&1; then
  fail "missing payment must fail"
else
  pass "missing payment blocked"
fi

# Wrong environment
python3 - <<PY
import json, pathlib
src=pathlib.Path("$ROOT/ops/config/launch-decisions/public_production/PAYMENT_LAUNCH_DECISION.json")
obj=json.loads(src.read_text())
obj["environment"]="public_demo"
pathlib.Path("$FIX/payment-wrong-env.json").write_text(json.dumps(obj, indent=2)+"\n")
PY
if node "$DEC" --repo-root "$ROOT" --payment-fixture "$FIX/payment-wrong-env.json" \
  --notification-fixture "$ROOT/ops/config/launch-decisions/public_production/NOTIFICATION_LAUNCH_DECISION.json" \
  --expect-status pending >/dev/null 2>&1; then
  fail "wrong env must fail"
else
  pass "wrong env blocked"
fi

# Approved manual invoice without SOP → blocked
python3 - <<PY
import json, pathlib
obj={
  "schema":"woodright_payment_launch_decision_v1",
  "environment":"public_production",
  "decision_status":"approved",
  "decision_type":"manual_invoice",
  "authorization_id":"MANUAL_INVOICE_ACCEPTED_FOR_LAUNCH",
  "issued_at_utc":"2026-08-04T16:00:00Z",
  "operational_sop_version":None,
  "sales_sop_path":None,
}
pathlib.Path("$FIX/payment-approved-no-sop.json").write_text(json.dumps(obj, indent=2)+"\n")
PY
if node "$DEC" --repo-root "$ROOT" --payment-fixture "$FIX/payment-approved-no-sop.json" \
  --notification-fixture "$ROOT/ops/config/launch-decisions/public_production/NOTIFICATION_LAUNCH_DECISION.json" \
  --expect-status approved >/dev/null 2>&1; then
  fail "approved without SOP must fail"
else
  pass "approved without SOP blocked"
fi

# Valid approved manual invoice + workaround notification (filled SOP copies)
mkdir -p "$FIX/sops"
python3 - <<PY
from pathlib import Path
root = Path("$ROOT")
fix = Path("$FIX")
# filled SOPs without blanks / template status
pay_sop = """# Manual invoice sales SOP (filled fixture)

Version: manual-invoice-sop-v1
Environment: public_production
Status: filled_for_fixture_test

## Queue
Primary: Medusa Admin Orders + Woodright production board stage=new
Primary watcher: Fixture Operator
Backup watcher: Fixture Backup
Cadence: every 15 minutes during Europe/Moscow business hours
Max response: 30 minutes
Invoice channel: phone then PaymentLink URL recorded in Admin
Cancel: Woodright stage canceled with reason
Refund: owner-approved bank refund recorded in notes
Missed-order watch: daily 18:00 MSK reconciliation
Escalation: Fixture Escalation Owner
"""
notif_sop = """# Manual notification monitoring SOP (filled fixture)

Version: manual-notification-sop-v1
Environment: public_production
Status: filled_for_fixture_test

## Absences
No automatic buyer or sales email while workaround active.

## Queue
Primary: Medusa Admin Orders + Woodright production board
Primary watcher: Fixture Operator
Backup watcher: Fixture Backup
Cadence: every 15 minutes Europe/Moscow business hours
Max response minutes: 30
Manual buyer confirmation: phone
Journal: fixture order-id log without PII
Expiry follow-up: provider decision cycle required
"""
(fix/"sops"/"manual-invoice-filled.md").write_text(pay_sop)
(fix/"sops"/"manual-notification-filled.md").write_text(notif_sop)
pay={
  "schema":"woodright_payment_launch_decision_v1",
  "environment":"public_production",
  "decision_status":"approved",
  "decision_type":"manual_invoice",
  "authorization_id":"MANUAL_INVOICE_ACCEPTED_FOR_LAUNCH",
  "approval_record_id":"fixture-payment-approval-001",
  "owner":"Fixture Owner",
  "evidence_reference":"docs/owner/public-production-payment-notification-review.md",
  "issued_at_utc":"2026-08-04T16:00:00Z",
  "operational_sop_version":"manual-invoice-sop-v1",
  "sales_sop_path":"scripts/ops/fixtures/payment-notification-decisions/sops/manual-invoice-filled.md",
  "expires_at_utc":None,
}
notif={
  "schema":"woodright_notification_launch_decision_v1",
  "environment":"public_production",
  "decision_status":"approved",
  "decision_type":"temporary_manual_monitoring",
  "authorization_id":"TEMPORARY_MANUAL_ORDER_MONITORING_ACCEPTED_FOR_LAUNCH",
  "approval_record_id":"fixture-notification-approval-001",
  "owner":"Fixture Owner",
  "evidence_reference":"docs/owner/public-production-payment-notification-review.md",
  "issued_at_utc":"2026-08-04T16:00:00Z",
  "workaround_expires_at_utc":"2099-01-01T00:00:00Z",
  "operational_sop_version":"manual-notification-sop-v1",
  "sales_polling_sop_path":"scripts/ops/fixtures/payment-notification-decisions/sops/manual-notification-filled.md",
  "max_response_minutes":30,
  "provider_readiness":False,
}
import json
(fix/"payment-approved-ok.json").write_text(json.dumps(pay, indent=2)+"\n")
(fix/"notification-approved-ok.json").write_text(json.dumps(notif, indent=2)+"\n")
PY
OUT=$(node "$DEC" --repo-root "$ROOT" \
  --payment-fixture "$FIX/payment-approved-ok.json" \
  --notification-fixture "$FIX/notification-approved-ok.json" \
  --expect-status approved 2>/dev/null | tail -1)
[[ "$OUT" == "STATUS PUBLIC_PRODUCTION_DECISIONS_APPROVED_FIXTURE_PASS" ]] \
  && pass "approved fixtures PASS" || fail "approved fixtures got=$OUT"

# Template SOP blanks must fail when referenced by approved decision
python3 - <<PY
import json, pathlib
p=json.loads(pathlib.Path("$FIX/payment-approved-ok.json").read_text())
p["sales_sop_path"]="docs/operator/public-production-manual-invoice-sales-sop.md"
pathlib.Path("$FIX/payment-template-sop.json").write_text(json.dumps(p, indent=2)+"\n")
PY
if node "$DEC" --repo-root "$ROOT" \
  --payment-fixture "$FIX/payment-template-sop.json" \
  --notification-fixture "$FIX/notification-approved-ok.json" \
  --expect-status approved >/dev/null 2>&1; then
  fail "unfilled template SOP must fail"
else
  pass "unfilled template SOP blocked"
fi

# Missing owner on approved
python3 - <<PY
import json, pathlib
p=json.loads(pathlib.Path("$FIX/payment-approved-ok.json").read_text())
p["owner"]=None
pathlib.Path("$FIX/payment-no-owner.json").write_text(json.dumps(p, indent=2)+"\n")
PY
if node "$DEC" --repo-root "$ROOT" \
  --payment-fixture "$FIX/payment-no-owner.json" \
  --notification-fixture "$FIX/notification-approved-ok.json" \
  --expect-status approved >/dev/null 2>&1; then
  fail "approved without owner must fail"
else
  pass "approved without owner blocked"
fi

# Workaround without expiry
python3 - <<PY
import json, pathlib
n=json.loads(pathlib.Path("$FIX/notification-approved-ok.json").read_text())
n["workaround_expires_at_utc"]=None
pathlib.Path("$FIX/notification-no-expiry.json").write_text(json.dumps(n, indent=2)+"\n")
PY
if node "$DEC" --repo-root "$ROOT" \
  --payment-fixture "$FIX/payment-approved-ok.json" \
  --notification-fixture "$FIX/notification-no-expiry.json" \
  --expect-status approved >/dev/null 2>&1; then
  fail "workaround without expiry must fail"
else
  pass "workaround without expiry blocked"
fi

# Expired workaround
python3 - <<PY
import json, pathlib
n=json.loads(pathlib.Path("$FIX/notification-approved-ok.json").read_text())
n["workaround_expires_at_utc"]="2020-01-01T00:00:00Z"
pathlib.Path("$FIX/notification-expired.json").write_text(json.dumps(n, indent=2)+"\n")
PY
if node "$DEC" --repo-root "$ROOT" \
  --payment-fixture "$FIX/payment-approved-ok.json" \
  --notification-fixture "$FIX/notification-expired.json" \
  --expect-status approved >/dev/null 2>&1; then
  fail "expired workaround must fail"
else
  pass "expired workaround blocked"
fi

# Invalid authorization
python3 - <<PY
import json, pathlib
p=json.loads(pathlib.Path("$FIX/payment-approved-ok.json").read_text())
p["authorization_id"]="FAKE_TOKEN"
pathlib.Path("$FIX/payment-bad-auth.json").write_text(json.dumps(p, indent=2)+"\n")
PY
if node "$DEC" --repo-root "$ROOT" \
  --payment-fixture "$FIX/payment-bad-auth.json" \
  --notification-fixture "$FIX/notification-approved-ok.json" \
  --expect-status approved >/dev/null 2>&1; then
  fail "bad auth must fail"
else
  pass "bad auth blocked"
fi

# Online payment approved must not claim psp_readiness=true
python3 - <<PY
import json, pathlib
p={
  "schema":"woodright_payment_launch_decision_v1",
  "environment":"public_production",
  "decision_status":"approved",
  "decision_type":"online_payment_required",
  "authorization_id":"ONLINE_PAYMENT_REQUIRED_BEFORE_LAUNCH",
  "approval_record_id":"fixture-online-001",
  "owner":"Fixture Owner",
  "evidence_reference":"docs/owner/public-production-payment-notification-review.md",
  "issued_at_utc":"2026-08-04T16:00:00Z",
  "psp_readiness":True,
}
pathlib.Path("$FIX/payment-online-false-ready.json").write_text(json.dumps(p, indent=2)+"\n")
PY
if node "$DEC" --repo-root "$ROOT" \
  --payment-fixture "$FIX/payment-online-false-ready.json" \
  --notification-fixture "$FIX/notification-approved-ok.json" \
  --expect-status approved >/dev/null 2>&1; then
  fail "online psp_readiness=true must fail"
else
  pass "online psp_readiness=true blocked"
fi

# Checkout honesty: storefront must not claim online payment available in payment-mode manual_invoice path
grep -q 'pp_system_default' "$ROOT/apps/storefront/src/lib/api/checkout.ts" \
  && pass "checkout uses system provider" || fail "checkout system provider"
grep -q 'manual_invoice' "$ROOT/apps/storefront/src/lib/payment-mode.ts" \
  && pass "payment-mode manual_invoice" || fail "payment-mode"
# Buyer copy honesty markers
grep -q 'Сейчас оплачивать заказ не нужно\|оплачивать заказ не нужно' \
  "$ROOT/apps/storefront/src/lib/woodright-copy.ts" \
  && pass "buyer copy no immediate pay" || fail "buyer copy honesty"

# Fake notifications are not a provider
grep -q 'dispatchFakeNotification\|fake-notifications' \
  "$ROOT/apps/backend/src/subscribers/order-placed-woodright-process.ts" \
  && pass "order.placed uses fake notifications" || fail "fake notifications path"
! grep -REn 'nodemailer|sendgrid|resend|@medusajs/notification' \
  "$ROOT/apps/backend/src" "$ROOT/apps/backend/package.json" >/dev/null 2>&1 \
  && pass "no real mail provider in backend app" || fail "unexpected mail provider dep"

# Profile validator token
VAL=$(node "$PROF" --repo-root "$ROOT" 2>/dev/null | tail -1)
[[ "$VAL" == "STATUS PUBLIC_PRODUCTION_PROFILE_VALID_CONTRACTS_READY_OWNER_DECISIONS_PENDING" ]] \
  && pass "profile validator owner-decisions token" || fail "profile validator token got=$VAL"
node "$PROF" --repo-root "$ROOT" 2>/dev/null | grep -q '"launch_ready": false' \
  && pass "launch_ready false" || fail "launch_ready"

# Isolation: pending fixtures must not authorize
grep -q '"decision_status": "pending"' \
  "$ROOT/ops/config/launch-decisions/public_production/PAYMENT_LAUNCH_DECISION.json" \
  && pass "repo payment fixture pending" || fail "repo payment not pending"
grep -q '"decision_status": "pending"' \
  "$ROOT/ops/config/launch-decisions/public_production/NOTIFICATION_LAUNCH_DECISION.json" \
  && pass "repo notification fixture pending" || fail "repo notification not pending"

# Legal gate still pending in profile
grep -q 'WOODRIGHT_LEGAL_CONTENT_STATUS=draft' \
  "$ROOT/ops/config/runtime-environments/public_production.conf" \
  && pass "legal still draft" || fail "legal draft"

# Secret scan on new decision contracts (fail if credential-like assignments appear)
if grep -REn '(PASSWORD|DATABASE_URL|API_KEY)\s*[:=]\s*["'\'']?[^"'\''[:space:]]+' \
  "$ROOT/ops/config/launch-decisions" \
  "$ROOT/scripts/release/validate-payment-notification-decisions.cjs" \
  "$ROOT/docs/owner/public-production-payment-notification-review.md" 2>/dev/null; then
  fail "possible secret leakage"
else
  pass "secret scan clean"
fi

rm -rf "$FIX"
[[ $FAIL -eq 0 ]] && { echo "ALL PAYMENT/NOTIFICATION DECISION FIDELITY TESTS PASSED"; exit 0; }
echo "FIDELITY FAILURES=$FAIL"; exit 1
