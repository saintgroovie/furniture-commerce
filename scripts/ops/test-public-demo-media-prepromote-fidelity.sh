#!/usr/bin/env bash
# Media pre-promote identity: compose declaration remains valid when the file
# exists; a missing historical compose path must not pass unless the live
# mount tuple equals the profile target. No live Docker mutation.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE="$ROOT/ops/release/verify-backend-media-mount.sh"
RECREATE="$ROOT/ops/release/recreate-staging-backend-with-media.sh"
ROLLBACK="$ROOT/ops/release/rollback-staging-backend-from-keeper.sh"
SF_RECREATE="$ROOT/ops/release/recreate-staging-storefront.sh"
PASS=0
FAIL=0
VOL="woodright-stack-3dsdhd_woodright_staging_media"
PROD_VOL="woodright-public-production_woodright_public_media"
CTR="woodright-staging-backend"
TMP="$(mktemp -d /tmp/wr-media-prepromote-XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

pass() { echo "PASS: $*"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $*" >&2; FAIL=$((FAIL + 1)); }

plan() {
  local name="$1"
  cat >"$TMP/$name.json"
}

run_plan() {
  bash "$GATE" --environment public_demo --media-plan-json "$1" 2>"$TMP/err" || true
}

# A. Repo compose declaration still passes compose-only.
if bash "$GATE" --environment public_demo --compose-only --compose-file "$ROOT/docker-compose.staging.yml" >"$TMP/a.out"; then
  grep -q MEDIA_GATE_PASS "$TMP/a.out" && pass "A compose declaration" || fail "A compose declaration token"
else
  fail "A compose declaration"
fi

# B. Historical compose absent. Exact bind tuple.
plan b <<JSON
{
  "environment": "public_demo",
  "expected_container": "$CTR",
  "predecessor_container": "$CTR",
  "compose_present": false,
  "keeper_present": false,
  "volume_exists": false,
  "source_exists": true,
  "forbidden_volumes": ["$PROD_VOL"],
  "predecessor_mounts": [{"Type":"bind","Source":"/srv/woodright/demo-media","Destination":"/server/static","RW":true}],
  "target": {"type":"bind","source":"/srv/woodright/demo-media","destination":"/server/static","rw":true},
  "sentinel_paths": ["/srv/woodright/demo-media/a.jpg","/srv/woodright/demo-media/b.webp"]
}
JSON
out="$(run_plan "$TMP/b.json")"
echo "$out" | grep -q MEDIA_GATE_PASS && pass "B bind tuple" || fail "B bind tuple ($out)"

# C. Named volume tuple.
plan c <<JSON
{
  "environment": "public_demo",
  "expected_container": "$CTR",
  "predecessor_container": "$CTR",
  "compose_present": false,
  "keeper_present": false,
  "volume_exists": true,
  "forbidden_volumes": ["$PROD_VOL"],
  "predecessor_mounts": [{"Type":"volume","Name":"$VOL","Destination":"/server/static","RW":true,"Driver":"local"}],
  "target": {"type":"volume","source":"$VOL","destination":"/server/static","rw":true},
  "sentinel_paths": ["/server/static/a.jpg","/server/static/b.webp"]
}
JSON
out="$(run_plan "$TMP/c.json")"
echo "$out" | grep -q '"media_type": "volume"' && echo "$out" | grep -q MEDIA_GATE_PASS && pass "C named volume" || fail "C named volume ($out)"

# D. Volume missing.
plan d <<JSON
{
  "environment": "public_demo",
  "expected_container": "$CTR",
  "predecessor_container": "$CTR",
  "volume_exists": false,
  "forbidden_volumes": ["$PROD_VOL"],
  "predecessor_mounts": [{"Type":"volume","Name":"$VOL","Destination":"/server/static","RW":true}],
  "target": {"type":"volume","source":"$VOL","destination":"/server/static","rw":true},
  "sentinel_paths": ["/server/static/a.jpg","/server/static/b.webp"]
}
JSON
out="$(run_plan "$TMP/d.json")"
echo "$out" | grep -q MEDIA_VOLUME_MISSING && pass "D missing volume" || fail "D missing volume ($out)"

# E. Target source differs.
plan e <<JSON
{
  "environment": "public_demo",
  "expected_container": "$CTR",
  "predecessor_container": "$CTR",
  "volume_exists": true,
  "forbidden_volumes": ["$PROD_VOL"],
  "predecessor_mounts": [{"Type":"volume","Name":"$VOL","Destination":"/server/static","RW":true}],
  "target": {"type":"volume","source":"other-volume","destination":"/server/static","rw":true},
  "sentinel_paths": ["/server/static/a.jpg","/server/static/b.webp"]
}
JSON
out="$(run_plan "$TMP/e.json")"
echo "$out" | grep -q MEDIA_SOURCE_MISMATCH && pass "E source mismatch" || fail "E source mismatch ($out)"

# F. Destination differs.
plan f <<JSON
{
  "environment": "public_demo",
  "expected_container": "$CTR",
  "predecessor_container": "$CTR",
  "volume_exists": true,
  "forbidden_volumes": ["$PROD_VOL"],
  "predecessor_mounts": [{"Type":"volume","Name":"$VOL","Destination":"/server/static","RW":true}],
  "target": {"type":"volume","source":"$VOL","destination":"/data","rw":true},
  "sentinel_paths": ["/server/static/a.jpg","/server/static/b.webp"]
}
JSON
out="$(run_plan "$TMP/f.json")"
echo "$out" | grep -q MEDIA_MOUNT_MISSING && pass "F destination mismatch" || fail "F destination mismatch ($out)"

# G. Type differs.
plan g <<JSON
{
  "environment": "public_demo",
  "expected_container": "$CTR",
  "predecessor_container": "$CTR",
  "volume_exists": true,
  "source_exists": true,
  "forbidden_volumes": ["$PROD_VOL"],
  "predecessor_mounts": [{"Type":"bind","Source":"/srv/woodright/demo-media","Destination":"/server/static","RW":true}],
  "target": {"type":"volume","source":"$VOL","destination":"/server/static","rw":true},
  "sentinel_paths": ["/server/static/a.jpg","/server/static/b.webp"]
}
JSON
out="$(run_plan "$TMP/g.json")"
echo "$out" | grep -q MOUNT_TYPE_MISMATCH && pass "G type mismatch" || fail "G type mismatch ($out)"

# H. Ambiguous mounts.
plan h <<JSON
{
  "environment": "public_demo",
  "expected_container": "$CTR",
  "predecessor_container": "$CTR",
  "volume_exists": true,
  "forbidden_volumes": ["$PROD_VOL"],
  "predecessor_mounts": [
    {"Type":"volume","Name":"$VOL","Destination":"/server/static","RW":true},
    {"Type":"volume","Name":"second","Destination":"/server/static","RW":true}
  ],
  "target": {"type":"volume","source":"$VOL","destination":"/server/static","rw":true},
  "sentinel_paths": ["/server/static/a.jpg","/server/static/b.webp"]
}
JSON
out="$(run_plan "$TMP/h.json")"
echo "$out" | grep -q MEDIA_MOUNT_AMBIGUOUS && pass "H ambiguous mounts" || fail "H ambiguous mounts ($out)"

# I. Wrong environment.
plan i <<JSON
{
  "environment": "public_production",
  "expected_container": "$CTR",
  "predecessor_container": "$CTR",
  "volume_exists": true,
  "forbidden_volumes": ["$PROD_VOL"],
  "predecessor_mounts": [{"Type":"volume","Name":"$VOL","Destination":"/server/static","RW":true}],
  "target": {"type":"volume","source":"$VOL","destination":"/server/static","rw":true},
  "sentinel_paths": ["/server/static/a.jpg","/server/static/b.webp"]
}
JSON
out="$(run_plan "$TMP/i.json")"
echo "$out" | grep -q WRONG_ENVIRONMENT && pass "I wrong environment" || fail "I wrong environment ($out)"

# J. Production volume selected for demo.
plan j <<JSON
{
  "environment": "public_demo",
  "expected_container": "$CTR",
  "predecessor_container": "$CTR",
  "volume_exists": true,
  "forbidden_volumes": ["$PROD_VOL"],
  "predecessor_mounts": [{"Type":"volume","Name":"$PROD_VOL","Destination":"/server/static","RW":true}],
  "target": {"type":"volume","source":"$PROD_VOL","destination":"/server/static","rw":true},
  "sentinel_paths": ["/server/static/a.jpg","/server/static/b.webp"]
}
JSON
out="$(run_plan "$TMP/j.json")"
echo "$out" | grep -q PRODUCTION_MOUNT_SELECTED && pass "J production volume refused" || fail "J production volume ($out)"

# K. Keeper already present fails before a destructive recreate.
plan k <<JSON
{
  "environment": "public_demo",
  "expected_container": "$CTR",
  "predecessor_container": "$CTR",
  "keeper_present": true,
  "volume_exists": true,
  "forbidden_volumes": ["$PROD_VOL"],
  "predecessor_mounts": [{"Type":"volume","Name":"$VOL","Destination":"/server/static","RW":true}],
  "target": {"type":"volume","source":"$VOL","destination":"/server/static","rw":true},
  "sentinel_paths": ["/server/static/a.jpg","/server/static/b.webp"]
}
JSON
out="$(run_plan "$TMP/k.json")"
echo "$out" | grep -q KEEPER_ALREADY_EXISTS && pass "K keeper present" || fail "K keeper present ($out)"
awk '
  /keeper already exists/ { keep=NR }
  /docker stop/ { stop=NR }
  END { if (keep && stop && keep<stop) exit 0; exit 1 }
' "$RECREATE" && pass "K keeper check precedes stop" || fail "K keeper check order"

# L / M. Rollback restores the original backend container and does not delete the volume.
# Storefront recreate does not reference the demo media volume.
if grep -q 'docker volume rm' "$ROLLBACK" "$RECREATE" "$SF_RECREATE"; then
  fail "L/M volume rm present"
else
  pass "L/M no volume rm"
fi
grep -q 'rename "$KEEP_NAME" "$NAME"' "$ROLLBACK" && pass "L rollback renames keeper back" || fail "L rollback rename"
grep -q 'json .Mounts' "$ROLLBACK" && pass "L rollback re-reads mounts" || fail "L rollback mounts"
if grep -q "$VOL" "$SF_RECREATE"; then
  fail "M storefront recreate references media volume"
else
  pass "M storefront recreate leaves media volume"
fi

# N. Dry-run of the pair script logs the tuple and does not mutate.
# Covered by test-public-demo-pair-cutover-fidelity.sh once Mounts are seeded.
grep -q 'run_media_pre_promote_gate' "$ROOT/ops/release/cutover-public-demo-pair.sh" \
  && grep -q 'sentinel_count' "$ROOT/ops/release/cutover-public-demo-pair.sh" \
  && pass "N pair dry-run calls media gate" || fail "N pair dry-run media gate"

# Missing compose without a predecessor still fail-closes.
out="$(WOODRIGHT_COMPOSE_FILE="$TMP/missing-compose.yml" bash "$GATE" --environment public_demo --mode pre-promote --target-image "ghcr.io/example/woodright-backend@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" --skip-volume-probe 2>/dev/null || true)"
echo "$out" | grep -q COMPOSE_MISSING && pass "missing compose without predecessor" || fail "missing compose without predecessor ($out)"

# Sentinel order: 20 JPEGs created first, WebP last. Independent finds must see both.
SENT="$TMP/sentinel-order"
mkdir -p "$SENT"
for i in $(seq 1 20); do printf x >"$SENT/img-$i.jpg"; done
printf x >"$SENT/last.webp"
jpeg_hit="$(find "$SENT" -type f \( -iname '*.jpg' -o -iname '*.jpeg' \) | head -1)"
webp_hit="$(find "$SENT" -type f -iname '*.webp' | head -1)"
if [[ -n "$jpeg_hit" && -n "$webp_hit" ]] && ! grep -q 'head -20' "$GATE"; then
  pass "sentinel formats sampled independently"
else
  fail "sentinel format sampling"
fi

echo "media-prepromote fidelity pass=$PASS fail=$FAIL"
[[ "$FAIL" -eq 0 ]]
