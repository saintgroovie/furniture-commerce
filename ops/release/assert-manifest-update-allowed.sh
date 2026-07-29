#!/usr/bin/env bash
# Fail-closed guard before any ACTIVE_OWNER / EXPECTED_RELEASE update for backend.
# Read-only. Does not write manifests. Operators must call this before reconcile.
#
# When --expected-src is provided (candidate EXPECTED_RELEASE), the live gate pins
# that candidate's backend_digest / approved_git_sha so digest-advance reconcile
# works after post-promote PASS while canonical EXPECTED_RELEASE is still old.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE="$ROOT/ops/release/verify-backend-media-mount.sh"

BUYER_HOST="${WOODRIGHT_BUYER_HOST:-https://woodright-demo.ru}"
EXPECTED_SRC=""
REQUIRE_EVIDENCE="${WOODRIGHT_REQUIRE_MEDIA_GATE_EVIDENCE:-0}"
EVIDENCE_PATH="${WOODRIGHT_MEDIA_GATE_EVIDENCE:-}"
MAX_EVIDENCE_AGE_SEC="${WOODRIGHT_MEDIA_GATE_EVIDENCE_MAX_AGE_SEC:-1800}"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --expected-src) EXPECTED_SRC="$2"; shift 2 ;;
    --evidence) EVIDENCE_PATH="$2"; REQUIRE_EVIDENCE=1; shift 2 ;;
    --require-evidence) REQUIRE_EVIDENCE=1; shift ;;
    -h|--help)
      sed -n '1,25p' "$0"
      exit 0
      ;;
    *) die "unknown arg: $1" ;;
  esac
done

echo "assert-manifest-update-allowed: running media promotion gate…" >&2
"$GATE" --compose-only --compose-file "${WOODRIGHT_COMPOSE_FILE:-$ROOT/docker-compose.staging.yml}"

PIN_DIGEST=""
PIN_SHA=""
if [[ -n "$EXPECTED_SRC" ]]; then
  [[ -f "$EXPECTED_SRC" ]] || die "missing --expected-src file"
  PIN_DIGEST=$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d.get("backend_digest") or "")' "$EXPECTED_SRC")
  PIN_SHA=$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d.get("approved_git_sha") or d.get("release_sha") or d.get("git_sha") or "")' "$EXPECTED_SRC")
  [[ "$PIN_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || die "expected-src backend_digest invalid"
  [[ "$PIN_SHA" =~ ^[0-9a-f]{40}$ ]] || die "expected-src approved_git_sha invalid"
fi

POST_ARGS=(--mode post-promote --buyer-host "$BUYER_HOST")
if [[ -n "${WOODRIGHT_BE_CONTAINER:-}" ]]; then
  POST_ARGS+=(--container "$WOODRIGHT_BE_CONTAINER")
fi
if [[ -n "$PIN_DIGEST" ]]; then
  POST_ARGS+=(--expected-digest "$PIN_DIGEST" --target-sha "$PIN_SHA")
fi

GATE_OUT=$("$GATE" "${POST_ARGS[@]}")
echo "$GATE_OUT"

LIVE_CID=""
LIVE_CID=$(python3 -c 'import json,sys; d=json.load(sys.stdin); print((d.get("detail") or {}).get("container") or "")' <<<"$GATE_OUT" 2>/dev/null || true)

if [[ "$REQUIRE_EVIDENCE" == "1" ]]; then
  [[ -n "$EVIDENCE_PATH" && -f "$EVIDENCE_PATH" ]] || die "media gate evidence missing (required)"
  python3 - "$EVIDENCE_PATH" "$PIN_DIGEST" "$MAX_EVIDENCE_AGE_SEC" "${LIVE_CID}" "${WOODRIGHT_MEDIA_VOLUME:-woodright-stack-3dsdhd_woodright_staging_media}" <<'PY'
import json,sys,time
path,pin,max_age_s,live_name,want_vol=sys.argv[1:6]
max_age=int(max_age_s)
ev=json.load(open(path))
if ev.get("schema")!="woodright.media_gate_evidence.v2":
  raise SystemExit("evidence schema invalid")
if ev.get("verdict")!="MEDIA_GATE_PASS":
  raise SystemExit("stale/invalid evidence verdict")
if not ev.get("digest"):
  raise SystemExit("evidence digest missing")
if not ev.get("container_id"):
  raise SystemExit("evidence container_id missing")
age=int(time.time())-int(ev.get("created_at_unix") or 0)
if age<0 or age>max_age:
  raise SystemExit(f"evidence stale age={age}s max={max_age}s")
if pin and ev.get("digest")!=pin:
  raise SystemExit("evidence digest mismatch vs expected-src")
vol=ev.get("media_volume") or ""
if vol and vol!=want_vol:
  raise SystemExit(f"evidence media_volume mismatch got={vol}")
# Prefer matching live container name from fresh Mode B output when available.
ename=ev.get("container_name") or ""
if live_name and ename and live_name!=ename:
  raise SystemExit(f"evidence container_name mismatch live={live_name} evidence={ename}")
print("evidence_ok age=%ss digest=%s container=%s" % (age, ev.get("digest"), (ev.get("container_id") or "")[:12]))
PY
fi

echo "assert-manifest-update-allowed: PASS (safe to reconcile manifests)" >&2
