#!/usr/bin/env bash
# Fidelity: public production approval singleton race.
# Sandbox only. WOODRIGHT_META_ROOT is a temp directory. No live approval write.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WRITE="$ROOT/ops/release/reconcile-owner-approved-release.sh"
LIB="$ROOT/ops/lib/woodright-owner-approved-release.sh"
CUTOVER="$ROOT/ops/release/cutover-public-production-pair.sh"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/wr-oa-race.XXXXXX")"
FAILED=0
trap 'rm -rf "$TMP"' EXIT

pass() { printf 'PASS %s\n' "$1"; }
fail() { printf 'FAIL %s\n' "$1" >&2; FAILED=$((FAILED + 1)); }

SHA_A="$(printf 'a%.0s' {1..40})"
SHA_B="$(printf 'b%.0s' {1..40})"
BE_A="sha256:$(printf '1%.0s' {1..64})"
SF_A="sha256:$(printf '2%.0s' {1..64})"
BE_B="sha256:$(printf '3%.0s' {1..64})"
SF_B="sha256:$(printf '4%.0s' {1..64})"
SF_OLD="sha256:$(printf '5%.0s' {1..64})"
BE_REV="$(printf 'c%.0s' {1..40})"

mkdir -p "$TMP/profiles" "$TMP/meta/public_demo" "$TMP/meta/public_production" "$TMP/ref"
printf 'race-fixture\n' >"$TMP/ref/evidence.txt"
sed "s#/srv/woodright#$TMP/srv#g" \
  "$ROOT/ops/config/runtime-environments/public_demo.conf" >"$TMP/profiles/public_demo.conf"
sed "s#/srv/woodright#$TMP/srv#g" \
  "$ROOT/ops/config/runtime-environments/public_production.conf" >"$TMP/profiles/public_production.conf"

common_env() {
  printf '%s\n' \
    "WOODRIGHT_ENV_PROFILE_DIR=$TMP/profiles" \
    "WOODRIGHT_META_ROOT=$TMP/meta" \
    "WR_STAGING_MUTATION_LOCK_ALLOW_NONCANONICAL=1" \
    "WR_STAGING_MUTATION_LOCK_TIMEOUT_SEC=5"
}

run_writer() {
  local -a envs=()
  while IFS= read -r line; do envs+=("$line"); done < <(common_env)
  env -u WOODRIGHT_ENVIRONMENT -u WOODRIGHT_OWNER_APPROVED_RELEASE_PATH "${envs[@]}" \
    bash "$WRITE" "$@"
}

checksum_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

approve() {
  local env_name="$1" sha="$2" be="$3" sf="$4" expected="$5" evidence="$6"
  shift 6
  run_writer --environment "$env_name" \
    --application-sha "$sha" --backend-digest "$be" --storefront-digest "$sf" \
    --owner-authorization-id OWNER-PASS-race-fixture-20261011 \
    --evidence-reference "$TMP/ref/evidence.txt" --evidence-dir "$evidence" \
    --expected-previous-approval-checksum "$expected" \
    --allow-predeploy-approval \
    --apply --confirm-mutation I_UNDERSTAND_OWNER_APPROVAL_WRITE --confirm-sha "$sha" \
    "$@"
}

DEST="$TMP/meta/public_demo/OWNER_APPROVED_RELEASE.json"

# 1. First write and normal approval.
approve public_demo "$SHA_A" "$BE_A" "$SF_A" ABSENT "$TMP/ev-a" >"$TMP/out-a.txt"
CS_A="$(checksum_of "$DEST")"
grep -q 'OWNER_APPROVAL_WRITTEN' "$TMP/out-a.txt" && pass "first approval written" || fail "first approval"
python3 - "$DEST" "$SHA_A" <<'PY' || fail "first approval shape"
import json, sys
d = json.load(open(sys.argv[1]))
assert d["reservation_state"] == "reserved"
assert d["application_sha"] == sys.argv[2]
assert d["approval_generation"].startswith("apr1-")
assert "component" not in d
PY
pass "pair approval reserves without a component key"

# 2. Overwrite without CAS.
set +e
run_writer --environment public_demo \
  --application-sha "$SHA_B" --backend-digest "$BE_B" --storefront-digest "$SF_B" \
  --owner-authorization-id OWNER-PASS-race-fixture-20261011 \
  --evidence-reference "$TMP/ref/evidence.txt" --evidence-dir "$TMP/ev-nocas" \
  --allow-predeploy-approval \
  --apply --confirm-mutation I_UNDERSTAND_OWNER_APPROVAL_WRITE --confirm-sha "$SHA_B" \
  >"$TMP/out-nocas.txt" 2>&1
RC=$?
set -e
[[ "$RC" -ne 0 ]] && grep -q 'OWNER_APPROVAL_CAS_REQUIRED' "$TMP/out-nocas.txt" \
  && pass "overwrite without CAS rejected" || fail "overwrite without CAS rc=$RC"
[[ "$(checksum_of "$DEST")" == "$CS_A" ]] && pass "file unchanged after missing CAS" || fail "missing CAS mutated the file"

# 3. Stale checksum after a successful replacement of the previous token.
# Simulate A and B both observing CS_A: A is already written. B uses CS_A after
# a second writer would have moved it. Here B uses a checksum from before A
# by pointing at ABSENT, then a real stale hex after we snapshot and rewrite.
STALE="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
set +e
approve public_demo "$SHA_B" "$BE_B" "$SF_B" "$STALE" "$TMP/ev-stale" >"$TMP/out-stale.txt" 2>&1
RC=$?
set -e
[[ "$RC" -ne 0 ]] && grep -q 'OWNER_APPROVAL_CAS_MISMATCH' "$TMP/out-stale.txt" \
  && pass "stale checksum rejected" || fail "stale checksum rc=$RC"
[[ "$(checksum_of "$DEST")" == "$CS_A" ]] && pass "stale writer did not win" || fail "stale writer changed the file"

# 4. Reserved candidate cannot be replaced by a normal approve, even with the live checksum.
set +e
approve public_demo "$SHA_B" "$BE_B" "$SF_B" "$CS_A" "$TMP/ev-reserved" >"$TMP/out-reserved.txt" 2>&1
RC=$?
set -e
[[ "$RC" -ne 0 ]] && grep -q 'OWNER_APPROVAL_RESERVED' "$TMP/out-reserved.txt" \
  && pass "reserved candidate replacement rejected" || fail "reserved replacement rc=$RC"
[[ "$(checksum_of "$DEST")" == "$CS_A" ]] && pass "reserved file unchanged" || fail "reserved file moved"

# 5. Same candidate is idempotent.
approve public_demo "$SHA_A" "$BE_A" "$SF_A" "$CS_A" "$TMP/ev-same" >"$TMP/out-same.txt"
grep -q 'OWNER_APPROVAL_UNCHANGED' "$TMP/out-same.txt" && pass "same candidate idempotent" || fail "idempotent"
[[ "$(checksum_of "$DEST")" == "$CS_A" ]] && pass "idempotent write kept the checksum" || fail "idempotent rotated checksum"

# 6. Preflight still sees A.
# shellcheck source=/dev/null
source "$LIB"
export WOODRIGHT_META_ROOT="$TMP/meta"
export WOODRIGHT_OWNER_APPROVAL_COMPONENT=pair
if wr_require_owner_approved_release public_demo "$SHA_A" "$BE_A" "$SF_A" "$TMP/ev-preflight" gate_a \
   && [[ "$WR_OA_CHECKSUM" == "$CS_A" ]]; then
  pass "preflight still bound to approval A"
else
  fail "preflight lost approval A result=${WR_OWNER_APPROVAL_RESULT:-}"
fi
if wr_owner_approved_bind_preflight_checksum "$CS_A" execute; then
  pass "execute bind accepts the preflight checksum"
else
  fail "execute bind rejected the live checksum"
fi
if wr_owner_approved_bind_preflight_checksum "$STALE" execute; then
  fail "execute bind accepted a stale checksum"
else
  [[ "$WR_OWNER_APPROVAL_RESULT" == "OWNER_APPROVAL_CHECKSUM_MISMATCH" ]] \
    && pass "preflight checksum drift rejected" || fail "drift token=$WR_OWNER_APPROVAL_RESULT"
fi
WOODRIGHT_CUTOVER_HARNESS=0
if wr_owner_approved_bind_preflight_checksum "" execute; then
  fail "execute without checksum was allowed outside the harness"
else
  [[ "$WR_OWNER_APPROVAL_RESULT" == "OWNER_APPROVAL_CHECKSUM_REQUIRED" ]] \
    && pass "execute checksum required outside harness" || fail "required token=$WR_OWNER_APPROVAL_RESULT"
fi
WOODRIGHT_CUTOVER_HARNESS=1
WOODRIGHT_META_ROOT="$TMP/meta"
WOODRIGHT_MUTATION_LOCK_PATH="$TMP/srv/locks/public_production/live-cutover.lock"
WOODRIGHT_COMPOSE_ENV_FILE="$TMP/etc/dokploy/compose/woodright-public-production/code/.env"
WOODRIGHT_COMPOSE_FILE="$TMP/etc/dokploy/compose/woodright-public-production/code/docker-compose.yml"
if wr_owner_approved_harness_is_isolated && wr_owner_approved_bind_preflight_checksum "" execute; then
  pass "isolated harness may omit the execute checksum"
else
  fail "isolated harness execute bind failed"
fi
WOODRIGHT_META_ROOT="/srv/./woodright/meta"
WOODRIGHT_MUTATION_LOCK_PATH="/srv/./woodright/locks/public_production/live-cutover.lock"
WOODRIGHT_COMPOSE_ENV_FILE="/etc/./dokploy/compose/woodright-public-production/code/.env"
WOODRIGHT_COMPOSE_FILE="/etc/./dokploy/compose/woodright-public-production/code/docker-compose.yml"
if wr_owner_approved_harness_is_isolated || wr_owner_approved_bind_preflight_checksum "" execute; then
  fail "dot-segment canonical paths were treated as isolated"
else
  pass "dot-segment canonical paths still require the execute checksum"
fi
WOODRIGHT_META_ROOT="$TMP/meta"
WOODRIGHT_MUTATION_LOCK_PATH="$TMP/srv/locks/public_production/live-cutover.lock"
WOODRIGHT_COMPOSE_ENV_FILE="$TMP/etc/dokploy/compose/woodright-public-production/code/.env"
WOODRIGHT_COMPOSE_FILE="$TMP/etc/dokploy/compose/woodright-public-production/code/docker-compose.yml"
WOODRIGHT_CUTOVER_COMPOSE_ENV="/etc/dokploy/compose/woodright-public-production/code/.env"
if wr_owner_approved_harness_is_isolated || wr_owner_approved_bind_preflight_checksum "" execute; then
  fail "compose env override onto production was treated as isolated"
else
  pass "compose env override onto production still requires the execute checksum"
fi
unset WOODRIGHT_CUTOVER_COMPOSE_ENV
ln -s /srv/woodright/meta "$TMP/meta-link"
WOODRIGHT_META_ROOT="$TMP/meta-link"
WOODRIGHT_MUTATION_LOCK_PATH="$TMP/srv/locks/public_production/live-cutover.lock"
WOODRIGHT_COMPOSE_ENV_FILE="$TMP/etc/dokploy/compose/woodright-public-production/code/.env"
WOODRIGHT_COMPOSE_FILE="$TMP/etc/dokploy/compose/woodright-public-production/code/docker-compose.yml"
if wr_owner_approved_harness_is_isolated || wr_owner_approved_bind_preflight_checksum "" execute; then
  fail "symlink onto the canonical meta root was treated as isolated"
else
  pass "symlink onto the canonical meta root still requires the execute checksum"
fi
mkdir -p "$TMP/sandbox"
ln -s /srv/woodright/meta "$TMP/sandbox/prod-link"
WOODRIGHT_META_ROOT="$TMP/sandbox/prod-link/../meta"
WOODRIGHT_MUTATION_LOCK_PATH="$TMP/srv/locks/public_production/live-cutover.lock"
WOODRIGHT_COMPOSE_ENV_FILE="$TMP/etc/dokploy/compose/woodright-public-production/code/.env"
WOODRIGHT_COMPOSE_FILE="$TMP/etc/dokploy/compose/woodright-public-production/code/docker-compose.yml"
if wr_owner_approved_harness_is_isolated || wr_owner_approved_bind_preflight_checksum "" execute; then
  fail "symlink plus dotdot was treated as isolated"
else
  pass "symlink plus dotdot still requires the execute checksum"
fi
WOODRIGHT_META_ROOT="/srv/woodright/meta"
WOODRIGHT_MUTATION_LOCK_PATH="/srv/woodright/locks/public_production/live-cutover.lock"
WOODRIGHT_COMPOSE_ENV_FILE="/etc/dokploy/compose/woodright-public-production/code/.env"
WOODRIGHT_COMPOSE_FILE="/etc/dokploy/compose/woodright-public-production/code/docker-compose.yml"
if wr_owner_approved_harness_is_isolated || wr_owner_approved_bind_preflight_checksum "" execute; then
  fail "canonical harness paths were treated as isolated"
else
  [[ "$WR_OWNER_APPROVAL_RESULT" == "OWNER_APPROVAL_CHECKSUM_REQUIRED" ]] \
    && pass "canonical harness paths still require the execute checksum" || fail "canonical harness token=$WR_OWNER_APPROVAL_RESULT"
fi
unset WOODRIGHT_CUTOVER_HARNESS
export WOODRIGHT_META_ROOT="$TMP/meta"
unset WOODRIGHT_MUTATION_LOCK_PATH WOODRIGHT_COMPOSE_ENV_FILE WOODRIGHT_COMPOSE_FILE WOODRIGHT_CUTOVER_COMPOSE_ENV

# 7. Explicit cancel, then replacement.
run_writer --environment public_demo --operation cancel \
  --expected-previous-approval-checksum "$CS_A" \
  --cancel-reason "owner abandoned candidate A" \
  --evidence-reference "$TMP/ref/evidence.txt" --evidence-dir "$TMP/ev-cancel" \
  --apply --confirm-mutation I_UNDERSTAND_OWNER_APPROVAL_CANCEL >"$TMP/out-cancel.txt"
grep -q 'OWNER_APPROVAL_CANCELLED' "$TMP/out-cancel.txt" && pass "explicit cancel" || fail "cancel"
CS_CANCEL="$(checksum_of "$DEST")"
[[ "$CS_CANCEL" != "$CS_A" ]] && pass "cancel minted a new checksum" || fail "cancel checksum unchanged"
python3 - "$DEST" <<'PY' || fail "cancel did not preserve candidate identity"
import json, sys
d = json.load(open(sys.argv[1]))
assert d["reservation_state"] == "cancelled"
assert d["application_sha"] == "a" * 40
PY
pass "cancel preserved candidate A and released the reservation"
[[ -f "$TMP/ev-cancel/json/OWNER_APPROVED_RELEASE.backup.json" ]] && pass "cancel kept the backup as evidence" || fail "cancel backup missing"
if wr_require_owner_approved_release public_demo "$SHA_A" "$BE_A" "$SF_A" "$TMP/ev-preflight" gate_a; then
  fail "cancelled approval still authorized a cutover"
else
  [[ "$WR_OWNER_APPROVAL_RESULT" == "OWNER_APPROVAL_CANCELLED" ]] \
    && pass "cancelled approval cannot authorize execute" || fail "cancelled token=$WR_OWNER_APPROVAL_RESULT"
fi

approve public_demo "$SHA_B" "$BE_B" "$SF_B" "$CS_CANCEL" "$TMP/ev-b" >"$TMP/out-b.txt"
CS_B="$(checksum_of "$DEST")"
grep -q 'OWNER_APPROVAL_WRITTEN' "$TMP/out-b.txt" && pass "replacement after cancel" || fail "replacement after cancel"
python3 - "$DEST" "$SHA_B" <<'PY' || fail "replacement shape"
import json, sys
d = json.load(open(sys.argv[1]))
assert d["application_sha"] == sys.argv[2]
assert d["reservation_state"] == "reserved"
PY
pass "candidate B reserved after cancel"

# 8. Commit releases the reservation without a container mutation.
export WR_OA_TRANSITION_AT="2026-10-11T21:00:00Z"
if wr_owner_approved_mark_terminal public_demo committed "$TMP/ev-commit" "sandbox commit"; then
  pass "commit mark after reservation"
else
  fail "commit mark result=${WR_OWNER_APPROVAL_RESULT:-}"
fi
CS_COMMIT="$(checksum_of "$DEST")"
python3 - "$DEST" "$SHA_B" <<'PY' || fail "commit state"
import json, sys
d = json.load(open(sys.argv[1]))
assert d["reservation_state"] == "committed", d
assert d["application_sha"] == sys.argv[2]
PY
pass "commit kept the candidate and cleared reserved"
[[ "$CS_COMMIT" != "$CS_B" ]] && pass "commit checksum differs from Gate C checksum" || fail "commit checksum did not move"

# 9. After commit, B's successor may write. This is the end of the incident sequence.
approve public_demo "$SHA_A" "$BE_A" "$SF_A" "$CS_COMMIT" "$TMP/ev-after-commit" >"$TMP/out-after.txt"
grep -q 'OWNER_APPROVAL_WRITTEN' "$TMP/out-after.txt" && pass "new approval after commit" || fail "approval after commit"

# 10. Storefront-only retained backend.
approve public_production "$SHA_B" "$BE_A" "$SF_B" ABSENT "$TMP/ev-sf" \
  --component storefront \
  --retained-backend-revision "$BE_REV" \
  --expected-current-storefront-digest "$SF_OLD" \
  --expected-current-backend-digest "$BE_A" >"$TMP/out-sf.txt"
SF_DEST="$TMP/meta/public_production/OWNER_APPROVED_RELEASE.json"
python3 - "$SF_DEST" "$BE_REV" "$SF_OLD" <<'PY' || fail "storefront approval shape"
import json, sys
d = json.load(open(sys.argv[1]))
assert d["component"] == "storefront"
assert d["reservation_state"] == "reserved"
assert d["retained_backend_revision"] == sys.argv[2]
assert d["expected_current_storefront_digest"] == sys.argv[3]
assert d["expected_current_backend_digest"] == d["backend_digest"]
PY
pass "storefront-only approval reserves the retained backend"
CS_SF="$(checksum_of "$SF_DEST")"
set +e
approve public_production "$SHA_A" "$BE_B" "$SF_A" "$CS_SF" "$TMP/ev-sf-race" \
  --component storefront \
  --retained-backend-revision "$BE_REV" \
  --expected-current-storefront-digest "$SF_OLD" \
  --expected-current-backend-digest "$BE_B" >"$TMP/out-sf-race.txt" 2>&1
RC=$?
set -e
[[ "$RC" -ne 0 ]] && grep -q 'OWNER_APPROVAL_RESERVED' "$TMP/out-sf-race.txt" \
  && pass "reserved storefront approval rejects another component candidate" || fail "storefront race rc=$RC"

# 11. Two writers read the same committed checksum. Exactly one write lands.
export WR_OA_TRANSITION_AT="2026-10-11T21:05:00Z"
wr_owner_approved_mark_terminal public_demo committed "$TMP/ev-par-commit" "release reservation before the CAS race" \
  || fail "pre-parallel commit"
CS_NOW="$(checksum_of "$DEST")"
(
  set +e
  approve public_demo "$SHA_A" "$BE_A" "$SF_A" "$CS_NOW" "$TMP/ev-par" >"$TMP/out-par-a.txt" 2>&1
  echo $? >"$TMP/rc-par-a"
) &
(
  set +e
  approve public_demo "$SHA_B" "$BE_B" "$SF_B" "$CS_NOW" "$TMP/ev-par" >"$TMP/out-par-b.txt" 2>&1
  echo $? >"$TMP/rc-par-b"
) &
wait || true
RCA="$(cat "$TMP/rc-par-a" 2>/dev/null || echo missing)"
RCB="$(cat "$TMP/rc-par-b" 2>/dev/null || echo missing)"
WINS=0
[[ "$RCA" -eq 0 ]] && WINS=$((WINS + 1))
[[ "$RCB" -eq 0 ]] && WINS=$((WINS + 1))
[[ "$WINS" -eq 1 ]] && pass "parallel writers: exactly one success ($RCA/$RCB)" || fail "parallel writers wins=$WINS rc=$RCA/$RCB"
if [[ "$RCA" -ne 0 ]]; then
  grep -q 'OWNER_APPROVAL_CAS_MISMATCH\|OWNER_APPROVAL_RESERVED' "$TMP/out-par-a.txt" \
    && pass "losing parallel writer failed closed" || fail "parallel loser A had no CAS/reserved token"
fi
if [[ "$RCB" -ne 0 ]]; then
  grep -q 'OWNER_APPROVAL_CAS_MISMATCH\|OWNER_APPROVAL_RESERVED' "$TMP/out-par-b.txt" \
    && pass "losing parallel writer failed closed" || fail "parallel loser B had no CAS/reserved token"
fi
PAR_SHA="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["application_sha"])' "$DEST")"
if [[ "$RCA" -eq 0 && "$PAR_SHA" == "$SHA_A" ]]; then
  pass "parallel winner installed its own candidate"
elif [[ "$RCB" -eq 0 && "$PAR_SHA" == "$SHA_B" ]]; then
  pass "parallel winner installed its own candidate"
else
  fail "parallel winner sha=$PAR_SHA rc=$RCA/$RCB did not match the installed approval"
fi

# 11b. A proven rollback releases the reservation. A different candidate can then CAS-replace.
CS_HELD="$(checksum_of "$DEST")"
export WR_OA_TRANSITION_AT="2026-10-11T21:06:00Z"
wr_owner_approved_mark_terminal public_demo rolled_back "$TMP/ev-rb" "sandbox proven rollback" \
  || fail "rollback mark"
CS_RB="$(checksum_of "$DEST")"
[[ "$CS_RB" != "$CS_HELD" ]] && pass "rollback mark moved the checksum" || fail "rollback checksum unchanged"
python3 - "$DEST" <<'PY' || fail "rollback state"
import json, sys
doc = json.load(open(sys.argv[1], encoding="utf-8"))
assert doc["reservation_state"] == "rolled_back", doc.get("reservation_state")
PY
pass "rollback cleared reserved"
HELD_SHA="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["application_sha"])' "$DEST")"
if [[ "$HELD_SHA" == "$SHA_A" ]]; then
  approve public_demo "$SHA_B" "$BE_B" "$SF_B" "$CS_RB" "$TMP/ev-after-rb" >"$TMP/out-after-rb.txt" 2>&1 || fail "replacement after rollback"
else
  approve public_demo "$SHA_A" "$BE_A" "$SF_A" "$CS_RB" "$TMP/ev-after-rb" >"$TMP/out-after-rb.txt" 2>&1 || fail "replacement after rollback"
fi
grep -q 'OWNER_APPROVAL_WRITTEN' "$TMP/out-after-rb.txt" && pass "replacement after proven rollback" || fail "replacement after rollback token"

# 12. Legacy file still loads, and replacement requires its checksum.
LEGACY="$TMP/meta/public_demo/OWNER_APPROVED_RELEASE.json"
python3 - "$LEGACY" "$SHA_A" "$BE_A" "$SF_A" <<'PY'
import json, sys
path, sha, be, sf = sys.argv[1:5]
doc = {
  "schema_version": 1,
  "environment": "public_demo",
  "application_sha": sha,
  "backend_digest": be,
  "storefront_digest": sf,
  "owner_decision": "approved",
  "owner_authorization_id": "OWNER-PASS-legacy-fixture",
  "issued_at": "2026-08-21T00:00:00Z",
  "evidence_reference": "/tmp/fixture",
  "tooling_schema_version": "owner-approved-release-v1",
}
json.dump(doc, open(path, "w"), indent=2, sort_keys=True)
open(path, "a").write("\n")
PY
chmod 0644 "$LEGACY"
if wr_require_owner_approved_release public_demo "$SHA_A" "$BE_A" "$SF_A" "$TMP/ev-legacy" gate_a \
   && [[ "$WR_OA_RESERVATION_STATE" == "legacy" ]]; then
  pass "legacy approval still authorizes"
else
  fail "legacy approval denied result=${WR_OWNER_APPROVAL_RESULT:-} state=${WR_OA_RESERVATION_STATE:-}"
fi
CS_LEGACY="$(checksum_of "$LEGACY")"
set +e
run_writer --environment public_demo \
  --application-sha "$SHA_B" --backend-digest "$BE_B" --storefront-digest "$SF_B" \
  --owner-authorization-id OWNER-PASS-race-fixture-20261011 \
  --evidence-reference "$TMP/ref/evidence.txt" --evidence-dir "$TMP/ev-legacy-nocas" \
  --allow-predeploy-approval \
  --apply --confirm-mutation I_UNDERSTAND_OWNER_APPROVAL_WRITE --confirm-sha "$SHA_B" \
  >"$TMP/out-legacy-nocas.txt" 2>&1
RC=$?
set -e
[[ "$RC" -ne 0 ]] && grep -q 'OWNER_APPROVAL_CAS_REQUIRED' "$TMP/out-legacy-nocas.txt" \
  && pass "legacy file is not an open overwrite" || fail "legacy overwrite without checksum rc=$RC"
approve public_demo "$SHA_B" "$BE_B" "$SF_B" "$CS_LEGACY" "$TMP/ev-legacy-up" >"$TMP/out-legacy-up.txt"
python3 - "$LEGACY" <<'PY' || fail "legacy upgrade"
import json, sys
d = json.load(open(sys.argv[1]))
assert d["reservation_state"] == "reserved"
assert d["tooling_schema_version"] == "owner-approved-release-v2"
PY
pass "legacy upgrade requires the previous checksum and reserves"

# 13. Dry-run does not change the approval bytes.
BEFORE="$(checksum_of "$LEGACY")"
run_writer --environment public_demo \
  --application-sha "$SHA_A" --backend-digest "$BE_A" --storefront-digest "$SF_A" \
  --owner-authorization-id OWNER-PASS-race-fixture-20261011 \
  --evidence-reference "$TMP/ref/evidence.txt" --evidence-dir "$TMP/ev-dry" \
  >"$TMP/out-dry.txt"
grep -q 'DRY_RUN_OK' "$TMP/out-dry.txt" && pass "dry-run ok" || fail "dry-run"
[[ "$(checksum_of "$LEGACY")" == "$BEFORE" ]] && pass "dry-run did not mutate the approval" || fail "dry-run mutated approval"

# 14. Gate C drift and cutover source order.
export WR_OA_BIND_CHECKSUM="$BEFORE"
python3 - "$LEGACY" <<'PY'
import json, sys
p = sys.argv[1]
d = json.load(open(p))
d["storefront_digest"] = "sha256:" + ("9" * 64)
json.dump(d, open(p, "w"))
PY
chmod 0644 "$LEGACY"
if wr_require_owner_approved_matches_live public_demo "$SHA_B" "$BE_B" "sha256:$(printf '9%.0s' {1..64})" "$TMP/ev-gatec"; then
  fail "Gate C accepted a drifted checksum"
else
  [[ "$WR_OWNER_APPROVAL_RESULT" == "OWNER_APPROVAL_CHECKSUM_MISMATCH" ]] \
    && pass "Gate C checksum drift rejected" || fail "Gate C token=$WR_OWNER_APPROVAL_RESULT"
fi
python3 - "$CUTOVER" <<'PY' || fail "cutover bind is not before the mutation lock"
from pathlib import Path
import sys
lines = Path(sys.argv[1]).read_text().splitlines()
bind = next(i for i, line in enumerate(lines) if "wr_owner_approved_bind_preflight_checksum" in line)
lock = next(i for i, line in enumerate(lines) if "wr_staging_mutation_lock_acquire" in line)
pins = next(i for i, line in enumerate(lines) if "record_state pins_written" in line)
assert bind < lock < pins, (bind, lock, pins)
PY
pass "execute bind precedes the mutation lock and pin write"
grep -q 'expected-approval-checksum' "$CUTOVER" && pass "cutover exposes the preflight checksum flag" || fail "cutover flag missing"
grep -q 'wr_owner_approved_atomic_install' "$WRITE" && pass "writer installs atomically" || fail "atomic install missing"
grep -q 'CUTOVER_HARNESS_PRODUCTION_PATH_REFUSED' "$CUTOVER" && pass "harness refuses canonical production paths" || fail "harness production refusal missing"
grep -q 'owner-approved-release.staged.XXXXXX' "$WRITE" && pass "approval staging is private per invocation" || fail "private staging missing"
if grep -F 'wr_owner_approved_atomic_install "$EVIDENCE_DIR/json/OWNER_APPROVED_RELEASE.staged.json"' "$WRITE" >/dev/null; then
  fail "writer installs from the shared evidence snapshot"
else
  pass "shared evidence snapshot is not the install source"
fi
if grep -F 'cp -p "$BACKUP" "$DEST"' "$WRITE" >/dev/null || grep -F 'cp "$BACKUP" "$DEST"' "$WRITE" >/dev/null; then
  fail "writer restores a backup onto the live path"
else
  pass "backup is not a restore control"
fi

if [[ "$FAILED" -eq 0 ]]; then
  echo "ALL OWNER APPROVAL SINGLETON RACE TESTS PASSED"
  exit 0
fi
echo "FAILED=$FAILED"
exit 1
