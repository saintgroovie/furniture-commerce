#!/usr/bin/env bash
# Fidelity: production-candidate compose template reconcile (no live VM).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HELPER="$ROOT/ops/release/reconcile-production-candidate-compose-template.sh"
CLASSIFY="$ROOT/ops/lib/woodright-production-compose-template.py"
CANON="$ROOT/ops/compose/woodright-production.docker-compose.yml"
LIVE_FIXTURE="$ROOT/scripts/ops/fixtures/production-candidate-compose/live-pre-component-sha.yml"
REAL_CONF="$ROOT/ops/config/runtime-environments/production.conf"

FAILED=0
pass() { echo "PASS $*"; }
fail() { echo "FAIL $*"; FAILED=$((FAILED + 1)); }

TMP_RAW="$(mktemp -d /tmp/wr-pc-compose-tpl-XXXXXX)"
[[ -n "$TMP_RAW" && -d "$TMP_RAW" ]] || { echo "FAIL mktemp"; exit 2; }
TMP="$(cd "$TMP_RAW" && pwd -P)"
case "$TMP" in
  /tmp/wr-pc-compose-tpl-*|/private/tmp/wr-pc-compose-tpl-*) ;;
  *) echo "FAIL harness TMP not isolated: $TMP"; exit 2 ;;
esac
if [[ "$TMP" == "$ROOT" || "$TMP" == "$ROOT"/* ]]; then
  echo "FAIL harness TMP collides with repo: $TMP"
  exit 2
fi
cleanup() {
  case "${TMP:-}" in
    /tmp/wr-pc-compose-tpl-*|/private/tmp/wr-pc-compose-tpl-*)
      if [[ "${FAILED:-1}" -eq 0 ]]; then rm -rf "$TMP"
      else echo "harness kept: $TMP"; fi
      ;;
    *) echo "refusing to delete unexpected TMP=${TMP:-}" ;;
  esac
}
trap cleanup EXIT

COMPOSE_DIR="$TMP/etc/dokploy/compose/woodright-production/code"
SRV="$TMP/srv/woodright"
LOCK="$SRV/locks/production/live-cutover.lock"
PROFILES="$TMP/profiles"
CONF="$PROFILES/production.conf"
REPO="$TMP/src"
EVIDENCE="$TMP/evidence"

mkdir -p "$COMPOSE_DIR" "$SRV/locks/production" "$SRV/reports/production" "$PROFILES" "$EVIDENCE"
: >"$LOCK"
printf 'WOODRIGHT_BACKEND_IMAGE=ghcr.io/saintgroovie/woodright-backend@sha256:%s\n' "$(printf 'a%.0s' {1..64})" >"$COMPOSE_DIR/.env"
printf 'WOODRIGHT_STOREFRONT_IMAGE=ghcr.io/saintgroovie/woodright-storefront@sha256:%s\n' "$(printf 'b%.0s' {1..64})" >>"$COMPOSE_DIR/.env"
cp "$LIVE_FIXTURE" "$COMPOSE_DIR/docker-compose.yml"
ENV_HASH_BEFORE="$(shasum -a 256 "$COMPOSE_DIR/.env" | awk '{print $1}')"

sed -e "s#=/srv/#=${TMP}/srv/#g" -e "s#=/etc/dokploy/#=${TMP}/etc/dokploy/#g" \
  "$REAL_CONF" >"$CONF"

# Isolated git checkout at a synthetic SHA equal to its HEAD.
mkdir -p "$REPO/ops/compose"
cp "$CANON" "$REPO/ops/compose/woodright-production.docker-compose.yml"
git -C "$REPO" init --quiet
git -C "$REPO" add ops/compose/woodright-production.docker-compose.yml
git -C "$REPO" -c user.email=test@woodright.local -c user.name=test \
  commit --quiet -m "canonical compose"
SHA="$(git -C "$REPO" rev-parse HEAD)"

export WOODRIGHT_ENV_PROFILE_DIR="$PROFILES"
export WOODRIGHT_COMPOSE_TEMPLATE_ALLOW_PROFILE_PATH=1
export WOODRIGHT_EVIDENCE_ROOT="$EVIDENCE"
export WOODRIGHT_ENV_ALLOW_INHERITED_MISMATCH=1
export WR_STAGING_MUTATION_LOCK_ALLOW_NONCANONICAL=1
export WOODRIGHT_COMPOSE_TEMPLATE_ALLOW_SKIP_DOCKER_VALIDATE=1
unset WOODRIGHT_ENVIRONMENT || true

run_helper() {
  local mode="$1"
  shift
  local -a args=(
    --environment production
    --source-sha "$SHA"
    --repo-root "$REPO"
  )
  if [[ "$mode" == "dry-run" ]]; then
    args+=(--dry-run)
  else
    args+=(--execute)
  fi
  bash "$HELPER" "${args[@]}" "$@"
}

# required keys on canonical
python3 "$CLASSIFY" required-keys "$CANON" >/dev/null \
  && pass "canonical contains component SHA interpolations" \
  || fail "canonical missing component SHA interpolations"

CLASS="$(python3 "$CLASSIFY" classify "$COMPOSE_DIR/docker-compose.yml" "$CANON" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["class"])')"
[[ "$CLASS" == "known_pre_reconcile_gap" ]] \
  && pass "live fixture classified as known_pre_reconcile_gap" \
  || fail "live fixture class=$CLASS"

BEFORE="$(shasum -a 256 "$COMPOSE_DIR/docker-compose.yml" | awk '{print $1}')"
OUT="$(run_helper dry-run 2>/dev/null)"
echo "$OUT" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["verdict"]=="dry_run_ok"' \
  && pass "dry-run packet verdict" \
  || fail "dry-run packet"
AFTER_DRY="$(shasum -a 256 "$COMPOSE_DIR/docker-compose.yml" | awk '{print $1}')"
[[ "$AFTER_DRY" == "$BEFORE" ]] && pass "dry-run is non-mutating" || fail "dry-run mutated compose"
ENV_HASH_DRY="$(shasum -a 256 "$COMPOSE_DIR/.env" | awk '{print $1}')"
[[ "$ENV_HASH_DRY" == "$ENV_HASH_BEFORE" ]] && pass "dry-run did not touch .env" || fail "dry-run mutated .env"

if run_helper execute >/dev/null 2>&1; then
  fail "execute without confirm token should fail"
else
  pass "execute requires confirm token"
fi

OUT="$(run_helper execute --confirm-mutation I_UNDERSTAND_PRODUCTION_CANDIDATE_COMPOSE_TEMPLATE_RECONCILE 2>/dev/null)"
echo "$OUT" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["verdict"]=="applied"; assert d["live_sha256_after"]==d["canonical_sha256"]' \
  && pass "execute applied canonical hash" \
  || fail "execute apply packet"
AFTER="$(shasum -a 256 "$COMPOSE_DIR/docker-compose.yml" | awk '{print $1}')"
WANT="$(shasum -a 256 "$CANON" | awk '{print $1}')"
[[ "$AFTER" == "$WANT" ]] && pass "installed target hash equals canonical" || fail "target hash $AFTER != $WANT"
grep -q 'WOODRIGHT_BACKEND_SOURCE_SHA' "$COMPOSE_DIR/docker-compose.yml" \
  && grep -q 'WOODRIGHT_STOREFRONT_SOURCE_SHA' "$COMPOSE_DIR/docker-compose.yml" \
  && pass "applied template injects both component SHA keys" \
  || fail "applied template missing SHA keys"
ENV_HASH_AFTER="$(shasum -a 256 "$COMPOSE_DIR/.env" | awk '{print $1}')"
[[ "$ENV_HASH_AFTER" == "$ENV_HASH_BEFORE" ]] && pass "apply did not touch .env" || fail "apply mutated .env"
echo "$OUT" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d.get("backup_path")' \
  && pass "backup path recorded" \
  || fail "backup path missing"

OUT2="$(run_helper execute --confirm-mutation I_UNDERSTAND_PRODUCTION_CANDIDATE_COMPOSE_TEMPLATE_RECONCILE 2>/dev/null)"
echo "$OUT2" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["verdict"]=="already_reconciled"' \
  && pass "second execute is idempotent" \
  || fail "idempotent execute"
AFTER2="$(shasum -a 256 "$COMPOSE_DIR/docker-compose.yml" | awk '{print $1}')"
[[ "$AFTER2" == "$WANT" ]] && pass "idempotent execute left hash unchanged" || fail "idempotent mutated hash"

# unexpected extra env key
cp "$LIVE_FIXTURE" "$COMPOSE_DIR/docker-compose.yml"
python3 - "$COMPOSE_DIR/docker-compose.yml" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
t = p.read_text()
needle = "      WOODRIGHT_RELEASE_SHA: ${WOODRIGHT_RELEASE_SHA}\n"
insert = needle + "      WOODRIGHT_UNEXPECTED_KEY: nope\n"
if needle not in t:
    raise SystemExit("fixture needle missing")
p.write_text(t.replace(needle, insert, 1))
PY
if run_helper dry-run >/dev/null 2>&1; then
  fail "unexpected extra env key should fail closed"
else
  pass "unexpected extra env key fail-closed"
fi

# healthcheck / unexamined field drift must fail closed
cp "$LIVE_FIXTURE" "$COMPOSE_DIR/docker-compose.yml"
python3 - "$COMPOSE_DIR/docker-compose.yml" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
t = p.read_text()
old = "      retries: 10\n"
if old not in t:
    raise SystemExit("retries needle missing")
p.write_text(t.replace(old, "      retries: 11\n", 1))
PY
if run_helper dry-run >/dev/null 2>&1; then
  fail "healthcheck drift should fail closed"
else
  pass "healthcheck drift fail-closed"
fi
cp "$LIVE_FIXTURE" "$COMPOSE_DIR/docker-compose.yml"

# mismatched memory interpolation variable is unexpected drift
python3 - "$COMPOSE_DIR/docker-compose.yml" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
t = p.read_text()
old = '    mem_reservation: "640m"'
new = '    mem_reservation: "${WRONG_MEMORY_VAR:-640m}"'
if old not in t:
    raise SystemExit("mem needle missing")
p.write_text(t.replace(old, new, 1))
PY
if run_helper dry-run >/dev/null 2>&1; then
  fail "wrong memory interpolation var should fail closed"
else
  pass "wrong memory interpolation var fail-closed"
fi
cp "$LIVE_FIXTURE" "$COMPOSE_DIR/docker-compose.yml"

# symlink parent must not retarget apply
LINK_ROOT="$TMP/symlink-escape"
REAL_ELSEWHERE="$TMP/not-dokploy"
mkdir -p "$REAL_ELSEWHERE/code" "$LINK_ROOT/etc/dokploy/compose"
cp "$LIVE_FIXTURE" "$REAL_ELSEWHERE/code/docker-compose.yml"
ln -s "$REAL_ELSEWHERE" "$LINK_ROOT/etc/dokploy/compose/woodright-production"
SYMLINK_TARGET="$LINK_ROOT/etc/dokploy/compose/woodright-production/code/docker-compose.yml"
# lexical suffix under /tmp, but realpath escapes the dokploy path
python3 - "$CONF" "$SYMLINK_TARGET" <<'PY'
from pathlib import Path
import sys
conf, target = Path(sys.argv[1]), sys.argv[2]
text = conf.read_text()
old = [l for l in text.splitlines() if l.startswith("WOODRIGHT_COMPOSE_FILE=")]
if len(old) != 1:
    raise SystemExit("compose file key missing")
conf.write_text(text.replace(old[0], f"WOODRIGHT_COMPOSE_FILE={target}", 1))
PY
if run_helper dry-run >/dev/null 2>&1; then
  fail "symlinked compose parent should fail closed"
else
  pass "symlinked compose parent refused"
fi
sed -e "s#=/srv/#=${TMP}/srv/#g" -e "s#=/etc/dokploy/#=${TMP}/etc/dokploy/#g" \
  "$REAL_CONF" >"$CONF"
cp "$LIVE_FIXTURE" "$COMPOSE_DIR/docker-compose.yml"

# dirty canonical working tree must not be attributed to HEAD
echo "# dirty" >>"$REPO/ops/compose/woodright-production.docker-compose.yml"
if run_helper dry-run >/dev/null 2>&1; then
  fail "dirty canonical working tree should fail"
else
  pass "dirty canonical working tree fail-closed"
fi
git -C "$REPO" checkout -- ops/compose/woodright-production.docker-compose.yml

# arbitrary target even with ALLOW_PROFILE_PATH
EVIL="$TMP/evil.yml"
cp "$LIVE_FIXTURE" "$EVIL"
sed -i.bak "s#WOODRIGHT_COMPOSE_FILE=.*#WOODRIGHT_COMPOSE_FILE=$EVIL#" "$CONF"
if run_helper dry-run >/dev/null 2>&1; then
  fail "arbitrary compose target should fail"
else
  pass "arbitrary compose target refused"
fi
# restore harness compose path
sed -e "s#=/srv/#=${TMP}/srv/#g" -e "s#=/etc/dokploy/#=${TMP}/etc/dokploy/#g" \
  "$REAL_CONF" >"$CONF"

# wrong SHA
if bash "$HELPER" --environment production --source-sha aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  --repo-root "$REPO" --dry-run >/dev/null 2>&1; then
  fail "mismatched source-sha should fail"
else
  pass "source-sha must match repo HEAD"
fi

# no --target CLI
if grep -qE -- '--target' "$HELPER"; then
  fail "helper must not accept caller-controlled --target"
else
  pass "no caller-controlled --target"
fi

grep -q 'ops/release/reconcile-production-candidate-compose-template.sh' \
  "$ROOT/ops/release/install-environment-governance.sh" \
  && grep -q 'ops/compose/woodright-production.docker-compose.yml' \
  "$ROOT/ops/release/install-environment-governance.sh" \
  && grep -q 'ops/lib/woodright-production-compose-template.py' \
  "$ROOT/ops/release/install-environment-governance.sh" \
  && pass "installer lists compose template helper + canonical file" \
  || fail "installer missing compose template bundle files"

grep -q 'ops/release/reconcile-production-candidate-compose-template.sh' \
  "$ROOT/ops/release/verify-environment-governance-bundle.sh" \
  && grep -q 'ops/compose/woodright-production.docker-compose.yml' \
  "$ROOT/ops/release/verify-environment-governance-bundle.sh" \
  && pass "verifier lists compose template bundle files" \
  || fail "verifier missing compose template bundle files"

if [[ "$FAILED" -ne 0 ]]; then
  echo "FAILED=$FAILED"
  exit 1
fi
echo "ALL PASS"
exit 0
