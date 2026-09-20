#!/usr/bin/env bash
# Fidelity: public_production restore must refuse staging/candidate targets.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OPS="$ROOT/ops"
FAIL=0
pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

bash -n "$OPS/lib/woodright-restore-target-guard.sh" && pass "syntax guard" || fail "syntax guard"
bash -n "$OPS/backup/woodright-public-production-restore-media.sh" && pass "syntax restore-media" || fail "syntax restore-media"

# shellcheck source=../../ops/lib/woodright-restore-target-guard.sh
source "$OPS/lib/woodright-restore-target-guard.sh"

if wr_assert_public_production_restore_target \
  woodright-public-production-postgres woodright_public_production \
  woodright-public-production_postgres_data; then
  pass "exact public_production target allowed"
else
  fail "exact public_production target should pass"
fi

if wr_assert_public_production_restore_target woodright-staging-postgres woodright_public_production \
    woodright-public-production_postgres_data 2>/tmp/wr-restore-guard-staging-ctr.txt; then
  fail "staging container should be refused"
else
  grep -q 'RESTORE_TARGET_STAGING_CONTAINER' /tmp/wr-restore-guard-staging-ctr.txt \
    && pass "staging container refused" \
    || fail "staging container token missing"
fi

if wr_assert_public_production_restore_target woodright-public-production-postgres woodright_staging \
    woodright-public-production_postgres_data 2>/tmp/wr-restore-guard-staging-db.txt; then
  fail "staging database should be refused"
else
  grep -q 'RESTORE_TARGET_STAGING_DATABASE' /tmp/wr-restore-guard-staging-db.txt \
    && pass "staging database refused" \
    || fail "staging database token missing"
fi

if wr_assert_public_production_restore_target woodright-public-production-postgres woodright_public_production \
    woodright-staging_postgres_data 2>/tmp/wr-restore-guard-staging-vol.txt; then
  fail "staging volume should be refused"
else
  grep -q 'RESTORE_TARGET_STAGING_VOLUME' /tmp/wr-restore-guard-staging-vol.txt \
    && pass "staging volume refused" \
    || fail "staging volume token missing"
fi

if wr_assert_public_production_restore_target woodright-production-postgres woodright_public_production \
    woodright-public-production_postgres_data 2>/tmp/wr-restore-guard-cand.txt; then
  fail "candidate container should be refused"
else
  grep -q 'RESTORE_TARGET_CANDIDATE_CONTAINER' /tmp/wr-restore-guard-cand.txt \
    && pass "candidate container refused" \
    || fail "candidate container token missing"
fi

grep -q 'wr_assert_public_production_restore_target' \
  "$OPS/backup/woodright-public-production-restore-dump.sh" \
  && pass "restore-dump sources guard" || fail "restore-dump missing guard call"
grep -q 'wr_assert_public_production_restore_target' \
  "$OPS/release/promote-catalog-to-public-production.sh" \
  && pass "promote sources guard" || fail "promote missing guard call"
grep -q -- '--confirm-catalog-promote' \
  "$OPS/backup/woodright-public-production-restore-dump.sh" \
  && fail "restore-dump must not be catalog promote" \
  || pass "restore-dump is not catalog promote"
grep -q 'TRUNCATE TABLE' "$OPS/backup/woodright-public-production-restore-dump.sh" \
  && fail "restore-dump must not scrub" \
  || pass "restore-dump does not scrub"

grep -A2 'woodright-public-production_postgres_data:' \
  "$OPS/compose/woodright-public-production.docker-compose.yml" \
  | grep -q 'name: woodright-public-production_postgres_data' \
  && pass "compose postgres volume has explicit name" \
  || fail "compose postgres volume missing explicit name"

if wr_assert_public_production_restore_target woodright-public-production-postgres woodright_public_production \
    woodright-public-production_postgres_data woodright-public-production \
    woodright-public-production_woodright_public; then
  pass "exact compose project and network allowed"
else
  fail "exact compose project/network should pass"
fi

if wr_assert_public_production_restore_target woodright-public-production-postgres woodright_public_production \
    woodright-public-production_postgres_data woodright-stack-3dsdhd \
    woodright-public-production_woodright_public 2>/tmp/wr-restore-guard-staging-proj.txt; then
  fail "staging compose project should be refused"
else
  grep -q 'RESTORE_TARGET_STAGING_COMPOSE_PROJECT' /tmp/wr-restore-guard-staging-proj.txt \
    && pass "staging compose project refused" \
    || fail "staging compose project token missing"
fi

if wr_assert_public_production_media_volume woodright-public-production_woodright_public_media; then
  pass "exact production media volume allowed"
else
  fail "exact production media volume should pass"
fi

if wr_assert_public_production_media_volume woodright-stack-3dsdhd_woodright_staging_media \
    2>/tmp/wr-restore-guard-staging-media.txt; then
  fail "staging media volume should be refused"
else
  grep -q 'RESTORE_MEDIA_STAGING_VOLUME' /tmp/wr-restore-guard-staging-media.txt \
    && pass "staging media volume refused" \
    || fail "staging media volume token missing"
fi

grep -q 'wr_assert_public_production_media_volume' \
  "$OPS/backup/woodright-public-production-restore-media.sh" \
  && pass "restore-media sources guard" || fail "restore-media missing guard call"

grep -q 'docker exec -i' "$OPS/backup/woodright-public-production-restore-dump.sh" \
  && pass "restore-dump forwards SQL on docker exec -i" \
  || fail "restore-dump missing docker exec -i"
grep -q 'RESTORE_TARGET_COMPOSE_PROJECT_MISSING' \
  "$OPS/backup/woodright-public-production-restore-dump.sh" \
  && pass "restore-dump requires compose project" \
  || fail "restore-dump missing compose project require"
grep -q 'target postgres data volume missing' \
  "$OPS/release/promote-catalog-to-public-production.sh" \
  && pass "promote requires nonempty postgres volume" \
  || fail "promote missing volume require"
grep -q 'find /dest -mindepth 1' \
  "$OPS/backup/woodright-public-production-restore-media.sh" \
  && pass "restore-media rejects any existing dest entries" \
  || fail "restore-media empty check still files-only"

if wr_assert_public_production_restore_networks \
    woodright-public-production_woodright_public; then
  pass "production-only network list allowed"
else
  fail "production-only network list should pass"
fi

if wr_assert_public_production_restore_networks \
    woodright-public-production_woodright_public woodright-stack-3dsdhd_woodright_staging \
    2>/tmp/wr-restore-guard-dual-net.txt; then
  fail "production plus staging network should be refused"
else
  grep -q 'RESTORE_TARGET_STAGING_NETWORK' /tmp/wr-restore-guard-dual-net.txt \
    && pass "mixed staging network refused" \
    || fail "mixed staging network token missing"
fi

if wr_assert_public_production_restore_networks 2>/tmp/wr-restore-guard-empty-net.txt; then
  fail "empty network list should be refused"
else
  grep -q 'RESTORE_TARGET_NETWORKS_EMPTY' /tmp/wr-restore-guard-empty-net.txt \
    && pass "empty network list refused" \
    || fail "empty network list token missing"
fi

if [[ "$FAIL" -ne 0 ]]; then
  echo "FAILED=$FAIL"
  exit 1
fi
echo "ALL_PASS"
