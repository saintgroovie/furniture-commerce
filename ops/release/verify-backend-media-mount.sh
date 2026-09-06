#!/usr/bin/env bash
# Fail-closed media promotion gate (v2).
# Read-only w.r.t. manifests and buyer runtime. Never updates ACTIVE_OWNER / EXPECTED_RELEASE.
#
# Modes:
#   --mode post-promote (default)
#     Validate an exact live backend container + media mount.
#     Digest may be pinned via --expected-digest / --target-sha (digest-advance safe),
#     otherwise falls back to EXPECTED_RELEASE.json (stable no-op path).
#   --mode pre-promote
#     Validate target immutable image + media volume BEFORE live cutover.
#     Does NOT require target digest to be running or listed in EXPECTED_RELEASE.
#     Does NOT mutate Docker/live containers (optional RO volume probe only).
#
# Usage:
#   ops/release/verify-backend-media-mount.sh [--mode post-promote] [--container NAME]
#   ops/release/verify-backend-media-mount.sh --mode pre-promote --target-image repo@sha256:…
#   ops/release/verify-backend-media-mount.sh --compose-only [--compose-file PATH]
#   ops/release/verify-backend-media-mount.sh --fixture-dir DIR
#
# Exit 0 only when all required checks PASS. Prints JSON summary on stdout.
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=../lib/woodright-environment-profile.sh
source "$ROOT/ops/lib/woodright-environment-profile.sh"
# shellcheck source=../lib/woodright-runtime-discovery.sh
source "$ROOT/ops/lib/woodright-runtime-discovery.sh"
# shellcheck source=../lib/woodright-host-publish.sh
source "$ROOT/ops/lib/woodright-host-publish.sh"

COMPOSE_FILE="${WOODRIGHT_COMPOSE_FILE:-$ROOT/docker-compose.staging.yml}"
MEDIA_VOLUME="${WOODRIGHT_MEDIA_VOLUME:-woodright-stack-3dsdhd_woodright_staging_media}"
MEDIA_DEST="${WOODRIGHT_MEDIA_MOUNT_IN_BE:-/server/static}"
MIN_FILES="${WOODRIGHT_MEDIA_MIN_FILES:-100}"
MIN_BYTES="${WOODRIGHT_MEDIA_MIN_BYTES:-1048576}"
BUYER_HOST="${WOODRIGHT_BUYER_HOST:-}"
PRODUCT_STATIC_SAMPLE="${WOODRIGHT_PRODUCT_STATIC_SAMPLE:-/product-static/products/oliver/OL-95-1_gallery_02.jpg}"
REQUIRE_RW=1
COMPOSE_ONLY=0
FIXTURE_DIR=""
CONTAINER_ARG=""
MODE="post-promote"
TARGET_IMAGE=""
TARGET_SHA=""
EXPECTED_DIGEST=""
WRITE_EVIDENCE=""
SKIP_VOLUME_PROBE=0
ENV_ARG=""
COMPOSE_FILE_SET_BY_ARG=0

fail_json() {
  local code="$1" msg="$2"
  python3 -c 'import json,sys; print(json.dumps({"ok":False,"verdict":sys.argv[1],"message":sys.argv[2]},indent=2))' "$code" "$msg"
  exit 1
}

ok_json() {
  python3 -c 'import json,sys; print(json.dumps({"ok":True,"verdict":"MEDIA_GATE_PASS","detail":json.loads(sys.argv[1])},indent=2))' "$1"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --environment) ENV_ARG="$2"; shift 2 ;;
    --environment=*) ENV_ARG="${1#--environment=}"; shift ;;
    --mode) MODE="$2"; shift 2 ;;
    --container) CONTAINER_ARG="$2"; shift 2 ;;
    --compose-file) COMPOSE_FILE="$2"; COMPOSE_FILE_SET_BY_ARG=1; shift 2 ;;
    --compose-only) COMPOSE_ONLY=1; shift ;;
    --fixture-dir) FIXTURE_DIR="$2"; shift 2 ;;
    --buyer-host) BUYER_HOST="$2"; shift 2 ;;
    --target-image) TARGET_IMAGE="$2"; shift 2 ;;
    --target-sha) TARGET_SHA="$2"; shift 2 ;;
    --expected-digest|--target-digest) EXPECTED_DIGEST="$2"; shift 2 ;;
    --media-volume) MEDIA_VOLUME="$2"; WOODRIGHT_MEDIA_VOLUME="$2"; shift 2 ;;
    --mount-destination) MEDIA_DEST="$2"; WOODRIGHT_MEDIA_MOUNT_IN_BE="$2"; shift 2 ;;
    --write-evidence) WRITE_EVIDENCE="$2"; shift 2 ;;
    --skip-volume-probe) SKIP_VOLUME_PROBE=1; shift ;;
    -h|--help)
      sed -n '1,40p' "$0"
      exit 0
      ;;
    *) fail_json INVALID_ARG "unknown arg $1" ;;
  esac
done

# Environment required except pure fixture-dir mode (unit fixtures)
if [[ -z "$FIXTURE_DIR" ]]; then
  if [[ -n "$ENV_ARG" ]]; then
    wr_load_environment_profile "$ENV_ARG" || fail_json ENV_PROFILE "failed to load environment=$ENV_ARG"
  elif [[ "${WOODRIGHT_ENV_PROFILE_LOADED:-0}" != "1" ]]; then
    fail_json ENV_REQUIRED "missing required --environment <public_demo|staging|production>"
  fi
  wr_assert_environment_provisioned || fail_json ENV_UNPROVISIONED "environment=${WOODRIGHT_ENVIRONMENT} unprovisioned"
  MEDIA_VOLUME="${WOODRIGHT_MEDIA_VOLUME}"
  MEDIA_DEST="${WOODRIGHT_MEDIA_MOUNT_IN_BE:-/server/static}"
  BUYER_HOST="${BUYER_HOST:-$WOODRIGHT_BUYER_HOST}"
  if [[ "$COMPOSE_FILE_SET_BY_ARG" != "1" && -n "${WOODRIGHT_COMPOSE_FILE:-}" && -f "${WOODRIGHT_COMPOSE_FILE}" ]]; then
    COMPOSE_FILE="${WOODRIGHT_COMPOSE_FILE}"
  fi
fi

if [[ "$COMPOSE_ONLY" == "1" && "${WOODRIGHT_ENVIRONMENT:-}" != "public_demo" && -z "$FIXTURE_DIR" ]]; then
  fail_json COMPOSE_ONLY_PUBLIC_DEMO "compose-only gate is public_demo-only (repo compose fixture)"
fi

assert_compose_declares_media() {
  local text
  [[ -f "$COMPOSE_FILE" ]] || fail_json COMPOSE_MISSING "compose not found: $COMPOSE_FILE"
  text=$(cat "$COMPOSE_FILE")
  echo "$text" | grep -q 'woodright_staging_media:/server/static' \
    || fail_json COMPOSE_MOUNT_MISSING "compose missing woodright_staging_media:/server/static"
  echo "$text" | grep -q 'name: woodright-stack-3dsdhd_woodright_staging_media' \
    || fail_json COMPOSE_VOLUME_NAME "compose missing external volume full name"
  echo "$text" | grep -A2 'woodright_staging_media:' | grep -q 'external: true' \
    || fail_json COMPOSE_EXTERNAL "media volume must be external: true"
}

assert_immutable_digest_ref() {
  local ref="$1"
  [[ "$ref" == *@sha256:* ]] || fail_json TARGET_NOT_IMMUTABLE "target image must be repo@sha256:<64hex> (got mutable/tag-only)"
  local dig="${ref##*@}"
  [[ "$dig" =~ ^sha256:[0-9a-f]{64}$ ]] || fail_json TARGET_NOT_IMMUTABLE "bad digest in image ref"
}

probe_volume_content_ro() {
  local vol="$1"
  local out
  out=$(docker run --rm \
    --network none \
    -v "${vol}:/m:ro" \
    alpine:3.20 \
    sh -c 'files=$(find /m -type f 2>/dev/null | wc -l | tr -d " "); bytes=$(du -sb /m 2>/dev/null | cut -f1); jpeg=$(find /m -type f \( -iname "*.jpg" -o -iname "*.jpeg" \) 2>/dev/null | head -1); webp=$(find /m -type f -iname "*.webp" 2>/dev/null | head -1); printf "files=%s\nbytes=%s\njpeg=%s\nwebp=%s\n" "$files" "${bytes:-0}" "$jpeg" "$webp"' \
    2>/dev/null) || { echo "VOLUME_PROBE_FAIL" >&2; return 1; }
  local files bytes jpeg webp
  files=$(printf '%s\n' "$out" | sed -n 's/^files=//p' | head -1)
  bytes=$(printf '%s\n' "$out" | sed -n 's/^bytes=//p' | head -1)
  jpeg=$(printf '%s\n' "$out" | sed -n 's/^jpeg=//p' | head -1)
  webp=$(printf '%s\n' "$out" | sed -n 's/^webp=//p' | head -1)
  [[ "$files" =~ ^[0-9]+$ ]] || { echo "EMPTY_MEDIA files_unreadable" >&2; return 1; }
  [[ "$bytes" =~ ^[0-9]+$ ]] || { echo "EMPTY_MEDIA bytes_unreadable" >&2; return 1; }
  [[ "$files" -ge "$MIN_FILES" ]] || { echo "EMPTY_MEDIA files=$files" >&2; return 1; }
  [[ "$bytes" -ge "$MIN_BYTES" ]] || { echo "EMPTY_MEDIA bytes=$bytes" >&2; return 1; }
  [[ -n "$jpeg" ]] || { echo "MISSING_REPRESENTATIVE jpeg" >&2; return 1; }
  [[ -n "$webp" ]] || { echo "MISSING_REPRESENTATIVE webp" >&2; return 1; }
  printf '%s %s' "$files" "$bytes"
  return 0
}

run_pre_promote() {
  assert_compose_declares_media
  [[ -n "$TARGET_IMAGE" ]] || fail_json TARGET_IMAGE_REQUIRED "pre-promote requires --target-image repo@sha256:…"
  assert_immutable_digest_ref "$TARGET_IMAGE"
  local dig="${TARGET_IMAGE##*@}"
  if [[ -n "$EXPECTED_DIGEST" && "$EXPECTED_DIGEST" != "$dig" ]]; then
    fail_json TARGET_DIGEST_MISMATCH "target-image digest != --expected-digest"
  fi
  EXPECTED_DIGEST="$dig"
  if [[ -n "$TARGET_SHA" && ! "$TARGET_SHA" =~ ^[0-9a-f]{40}$ ]]; then
    fail_json TARGET_SHA_INVALID "target-sha must be 40 hex"
  fi

  # Image must be inspectable (local cache or previously pulled).
  if ! docker image inspect "$TARGET_IMAGE" >/dev/null 2>&1 \
    && ! docker image inspect "$EXPECTED_DIGEST" >/dev/null 2>&1; then
    fail_json TARGET_IMAGE_UNAVAILABLE "image not local: $TARGET_IMAGE"
  fi
  local oci_rev=""
  oci_rev=$(docker image inspect "$TARGET_IMAGE" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null \
    || docker image inspect "$EXPECTED_DIGEST" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null \
    || true)
  if [[ -n "$TARGET_SHA" ]]; then
    [[ "$oci_rev" == "$TARGET_SHA" ]] || fail_json OCI_REV_MISMATCH "image revision=${oci_rev:-empty} want=$TARGET_SHA"
  fi
  local oci_title=""
  oci_title=$(docker image inspect "$TARGET_IMAGE" --format '{{index .Config.Labels "org.opencontainers.image.title"}}' 2>/dev/null \
    || docker image inspect "$EXPECTED_DIGEST" --format '{{index .Config.Labels "org.opencontainers.image.title"}}' 2>/dev/null \
    || true)
  if [[ -n "$oci_title" && "$oci_title" != "woodright-backend" ]]; then
    fail_json OCI_TITLE_MISMATCH "title=$oci_title"
  fi

  docker volume inspect "$MEDIA_VOLUME" >/dev/null 2>&1 \
    || fail_json MEDIA_VOLUME_MISSING "volume missing: $MEDIA_VOLUME"
  [[ "$MEDIA_DEST" == "/server/static" ]] || fail_json MOUNT_DEST_INVALID "planned dest must be /server/static (got $MEDIA_DEST)"

  local files=0 bytes=0
  if [[ "$SKIP_VOLUME_PROBE" -eq 0 ]]; then
    local probed probe_err
    set +e
    probed=$(probe_volume_content_ro "$MEDIA_VOLUME" 2>/tmp/woodright-media-probe.err)
    local probe_rc=$?
    set -e
    if [[ "$probe_rc" -ne 0 ]]; then
      probe_err=$(cat /tmp/woodright-media-probe.err 2>/dev/null || true)
      rm -f /tmp/woodright-media-probe.err
      case "$probe_err" in
        VOLUME_PROBE_FAIL*) fail_json VOLUME_PROBE_FAIL "cannot probe volume $MEDIA_VOLUME" ;;
        EMPTY_MEDIA*) fail_json EMPTY_MEDIA "${probe_err#EMPTY_MEDIA }" ;;
        MISSING_REPRESENTATIVE*) fail_json MISSING_REPRESENTATIVE "${probe_err#MISSING_REPRESENTATIVE }" ;;
        *) fail_json EMPTY_MEDIA "${probe_err:-probe_failed}" ;;
      esac
    fi
    rm -f /tmp/woodright-media-probe.err
    files=${probed%% *}
    bytes=${probed##* }
  fi

  # Mode A host-publish: planned bindings must match profile (deny ⇒ empty).
  assert_planned_host_publish backend

  # Explicitly do not require / mutate EXPECTED_RELEASE or running digest.
  ok_json "$(python3 -c 'import json,sys; print(json.dumps({"mode":"pre-promote","target_image":sys.argv[1],"target_digest":sys.argv[2],"target_sha":sys.argv[3],"oci_revision":sys.argv[4],"volume":sys.argv[5],"mount_destination":sys.argv[6],"files":int(sys.argv[7]),"bytes":int(sys.argv[8]),"manifests":"unchanged","running_required":False,"host_publish":"mode_a_pass","host_publish_policy":sys.argv[9]}))' \
    "$TARGET_IMAGE" "$EXPECTED_DIGEST" "${TARGET_SHA:-}" "${oci_rev:-}" "$MEDIA_VOLUME" "$MEDIA_DEST" "${files:-0}" "${bytes:-0}" "${WOODRIGHT_HOST_PUBLISH_POLICY:-}")"
}

# Mode A: planned host-publish must match profile before mutation.
# Deny: default planned=[] unless WOODRIGHT_PLANNED_HOST_BINDINGS_JSON is set (then that plan is checked).
# loopback_allowlist: WOODRIGHT_PLANNED_HOST_BINDINGS_JSON is REQUIRED (no tautological self-compare).
# Legacy WOODRIGHT_ALLOW_HOST_PUBLISH is ignored (not authority).
assert_planned_host_publish() {
  local role="${1:-backend}"
  local planned out verdict message
  if [[ -z "${WOODRIGHT_HOST_PUBLISH_POLICY:-}" ]]; then
    fail_json HOST_PUBLISH_POLICY_MISSING "profile missing WOODRIGHT_HOST_PUBLISH_POLICY"
  fi
  if [[ -n "${WOODRIGHT_PLANNED_HOST_BINDINGS_JSON:-}" ]]; then
    planned="${WOODRIGHT_PLANNED_HOST_BINDINGS_JSON}"
  elif [[ "${WOODRIGHT_HOST_PUBLISH_POLICY}" == "deny" ]]; then
    planned='[]'
  else
    fail_json HOST_PUBLISH_MODE_A_PLANNED_REQUIRED \
      "loopback_allowlist Mode A requires WOODRIGHT_PLANNED_HOST_BINDINGS_JSON (exact planned bindings; profile allowlist alone is not a plan)"
  fi
  export WR_HP_MODE=planned
  export WR_HP_POLICY="${WOODRIGHT_HOST_PUBLISH_POLICY}"
  export WR_HP_ALLOWED="${WOODRIGHT_ALLOWED_HOST_BINDINGS:-}"
  export WR_HP_ROLE="$role"
  export WR_HP_NETWORK_MODE="${WR_HP_PLANNED_NETWORK_MODE:-bridge}"
  export WR_HP_COMPOSE_PROJECT="${WOODRIGHT_COMPOSE_PROJECT:-}"
  export WR_HP_EXPECTED_COMPOSE="${WOODRIGHT_COMPOSE_PROJECT:-}"
  export WR_HP_REQUIRE_COMPOSE=0
  export WR_HP_BINDINGS_JSON="$planned"
  set +e
  out="$(wr_hp_evaluate_python 2>/dev/null)"
  local rc=$?
  set -e
  [[ $rc -eq 0 ]] && return 0
  verdict="$(python3 -c 'import json,sys; d=json.loads(sys.argv[1] or "{}"); print(d.get("verdict") or "HOST_PORTS_PUBLISHED")' "${out:-}")"
  message="$(python3 -c 'import json,sys; d=json.loads(sys.argv[1] or "{}"); print(d.get("message") or "planned_host_publish_fail")' "${out:-}")"
  if [[ "$verdict" == "HOST_PUBLISH_UNEXPECTED_PORT" && "${WOODRIGHT_HOST_PUBLISH_POLICY}" == "deny" ]]; then
    fail_json HOST_PORTS_PUBLISHED "$message"
  fi
  fail_json "$verdict" "$message"
}

# Mode B: live Docker bindings must equal profile allowlist (or zero if deny).
assert_live_host_publish() {
  local BE="$1"
  local role="${2:-backend}"
  local out verdict message
  if [[ -z "${WOODRIGHT_HOST_PUBLISH_POLICY:-}" ]]; then
    fail_json HOST_PUBLISH_POLICY_MISSING "profile missing WOODRIGHT_HOST_PUBLISH_POLICY"
  fi
  export WR_HP_MODE=live
  export WR_HP_POLICY="${WOODRIGHT_HOST_PUBLISH_POLICY}"
  export WR_HP_ALLOWED="${WOODRIGHT_ALLOWED_HOST_BINDINGS:-}"
  export WR_HP_ROLE="$role"
  export WR_HP_NETWORK_MODE="$(docker inspect "$BE" --format '{{.HostConfig.NetworkMode}}' 2>/dev/null || true)"
  export WR_HP_COMPOSE_PROJECT="$(docker inspect "$BE" --format '{{index .Config.Labels "com.docker.compose.project"}}' 2>/dev/null || true)"
  export WR_HP_EXPECTED_COMPOSE="${WOODRIGHT_COMPOSE_PROJECT:-}"
  export WR_HP_REQUIRE_COMPOSE="${WOODRIGHT_REQUIRE_COMPOSE_LABEL:-0}"
  export WR_HP_BINDINGS_JSON="$(wr_hp_docker_bindings_json "$BE" "$role")"
  set +e
  out="$(wr_hp_evaluate_python 2>/dev/null)"
  local rc=$?
  set -e
  [[ $rc -eq 0 ]] && return 0
  verdict="$(python3 -c 'import json,sys; d=json.loads(sys.argv[1] or "{}"); print(d.get("verdict") or "HOST_PORTS_PUBLISHED")' "${out:-}")"
  message="$(python3 -c 'import json,sys; d=json.loads(sys.argv[1] or "{}"); print(d.get("message") or "live_host_publish_fail")' "${out:-}")"
  if [[ "$verdict" == "HOST_PUBLISH_UNEXPECTED_PORT" && "${WOODRIGHT_HOST_PUBLISH_POLICY}" == "deny" ]]; then
    fail_json HOST_PORTS_PUBLISHED "$message"
  fi
  fail_json "$verdict" "$message"
}

write_evidence_file() {
  local path="$1" be="$2" dig="$3" sha="$4" files="$5" bytes="$6"
  [[ -n "$path" ]] || return 0
  local cid
  cid=$(docker inspect -f '{{.Id}}' "$be")
  umask 077
  python3 - "$path" "$cid" "$be" "$dig" "$sha" "$files" "$bytes" "$MEDIA_VOLUME" <<'PY'
import json,sys,time
path,cid,name,dig,sha,files,bytes_,vol=sys.argv[1:9]
ev={
  "schema":"woodright.media_gate_evidence.v2",
  "created_at_unix": int(time.time()),
  "created_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
  "mode":"post-promote",
  "container_id": cid,
  "container_name": name,
  "digest": dig,
  "git_sha": sha or None,
  "media_volume": vol,
  "files": int(files),
  "bytes": int(bytes_),
  "verdict":"MEDIA_GATE_PASS",
}
open(path,"w").write(json.dumps(ev, indent=2)+"\n")
PY
}

run_post_promote() {
  assert_compose_declares_media

  # Digest pin for advance: do NOT require EXPECTED_RELEASE to already list the new digest.
  if [[ -n "$EXPECTED_DIGEST" ]]; then
    [[ "$EXPECTED_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || fail_json TARGET_NOT_IMMUTABLE "bad --expected-digest"
    export WOODRIGHT_PINNED_BACKEND_DIGEST="$EXPECTED_DIGEST"
    export WOODRIGHT_REQUIRE_EXPECTED_DIGEST=1
    if [[ -n "$TARGET_SHA" ]]; then
      [[ "$TARGET_SHA" =~ ^[0-9a-f]{40}$ ]] || fail_json TARGET_SHA_INVALID "target-sha must be 40 hex"
      export WOODRIGHT_PINNED_GIT_SHA="$TARGET_SHA"
    fi
  fi

  if [[ -n "$CONTAINER_ARG" ]]; then
    export WOODRIGHT_BE_CONTAINER="$CONTAINER_ARG"
  fi
  if ! wr_discover_backend_container >/dev/null; then
    fail_json "${WR_DISCOVERY_VERDICT:-DISCOVERY_FAIL}" "backend discovery failed"
  fi
  local BE="${WR_BE_CONTAINER}"
  [[ -n "$BE" ]] || fail_json DISCOVERY_FAIL "empty WR_BE_CONTAINER"
  if wr_name_is_excluded "$BE"; then
    fail_json NAME_EXCLUDED "refusing keeper/candidate as live: $BE"
  fi

  assert_live_host_publish "$BE" backend

  local FILE_COUNT BYTE_SIZE
  FILE_COUNT=$(docker exec "$BE" sh -c 'find /server/static -type f 2>/dev/null | wc -l' | tr -d ' ')
  BYTE_SIZE=$(docker exec "$BE" sh -c 'du -sb /server/static 2>/dev/null | cut -f1' | tr -d ' ')
  [[ "$FILE_COUNT" =~ ^[0-9]+$ ]] || fail_json EMPTY_MEDIA "files_unreadable"
  [[ "$BYTE_SIZE" =~ ^[0-9]+$ ]] || fail_json EMPTY_MEDIA "bytes_unreadable"
  [[ "$FILE_COUNT" -ge "$MIN_FILES" ]] || fail_json EMPTY_MEDIA "files=$FILE_COUNT"
  [[ "$BYTE_SIZE" -ge "$MIN_BYTES" ]] || fail_json EMPTY_MEDIA "bytes=$BYTE_SIZE"

  local HAS_JPEG HAS_WEBP
  HAS_JPEG=$(docker exec "$BE" sh -c 'find /server/static -type f \( -iname "*.jpg" -o -iname "*.jpeg" \) 2>/dev/null | head -1' || true)
  HAS_WEBP=$(docker exec "$BE" sh -c 'find /server/static -type f -iname "*.webp" 2>/dev/null | head -1' || true)
  [[ -n "$HAS_JPEG" ]] || fail_json MISSING_REPRESENTATIVE "jpeg"
  [[ -n "$HAS_WEBP" ]] || fail_json MISSING_REPRESENTATIVE "webp"

  local MOUNT_NAME MOUNT_RW
  MOUNT_NAME=$(wr_container_mount_name_at "$BE" "$MEDIA_DEST")
  MOUNT_RW=$(wr_container_mount_rw_at "$BE" "$MEDIA_DEST")
  [[ "$MOUNT_NAME" == "$MEDIA_VOLUME" && "$MOUNT_RW" == "true" && "$FILE_COUNT" -ge "$MIN_FILES" ]] \
    || fail_json MEDIA_MOUNT_MISSING "media_mount_contract_fail name=$MOUNT_NAME rw=$MOUNT_RW files=$FILE_COUNT"

  local PS_STATUS="skipped"
  if [[ -n "$BUYER_HOST" ]]; then
    PS_STATUS=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "${BUYER_HOST}${PRODUCT_STATIC_SAMPLE}" || echo 000)
    [[ "$PS_STATUS" == "200" ]] || fail_json PRODUCT_STATIC_FAIL "status=$PS_STATUS"
  fi

  local live_dig=""
  live_dig=$(wr_container_image_id "$BE")
  local pin_digest="${WOODRIGHT_PINNED_BACKEND_DIGEST:-$EXPECTED_DIGEST}"
  write_evidence_file "$WRITE_EVIDENCE" "$BE" "${pin_digest:-$live_dig}" "${TARGET_SHA:-}" "$FILE_COUNT" "$BYTE_SIZE"

  ok_json "$(python3 -c 'import json,sys; print(json.dumps({"mode":"post-promote","container":sys.argv[1],"volume":sys.argv[2],"files":int(sys.argv[3]),"bytes":int(sys.argv[4]),"product_static":sys.argv[5],"host_ports":"policy_checked","host_publish_policy":sys.argv[7],"media_mount":"pass","pinned_digest":sys.argv[6] or None}))' \
    "$BE" "$MEDIA_VOLUME" "$FILE_COUNT" "$BYTE_SIZE" "$PS_STATUS" "${pin_digest:-}" "${WOODRIGHT_HOST_PUBLISH_POLICY:-}")"
}

if [[ "$COMPOSE_ONLY" -eq 1 ]]; then
  assert_compose_declares_media
  ok_json '{"compose":"ok"}'
  exit 0
fi

# Fixture mode: JSON describing mounts / counts (no Docker mutate)
if [[ -n "$FIXTURE_DIR" ]]; then
  [[ -d "$FIXTURE_DIR" ]] || fail_json FIXTURE_MISSING "$FIXTURE_DIR"
  python3 - "$FIXTURE_DIR" "$MEDIA_VOLUME" "$MEDIA_DEST" "$MIN_FILES" "$MIN_BYTES" "$REQUIRE_RW" <<'PY'
import json,sys,os
d=sys.argv[1]; vol=sys.argv[2]; dest=sys.argv[3]
min_files=int(sys.argv[4]); min_bytes=int(sys.argv[5]); require_rw=sys.argv[6]=="1"
fx=json.load(open(os.path.join(d,"gate.json")))
verdict=fx.get("expect_verdict") or "MEDIA_GATE_PASS"
mounts=fx.get("mounts") or []
m=next((x for x in mounts if x.get("Destination")==dest), None)
def fail(code,msg):
  print(json.dumps({"ok":False,"verdict":code,"message":msg},indent=2))
  raise SystemExit(1)
if m is None:
  fail("MEDIA_MOUNT_MISSING", f"no mount at {dest}")
if m.get("Name")!=vol:
  fail("MEDIA_VOLUME_MISMATCH", f"got={m.get('Name')}")
if require_rw and not m.get("RW", False):
  fail("MEDIA_VOLUME_MISMATCH", "mount_not_rw")
files=int(fx.get("file_count") or 0)
nbytes=int(fx.get("byte_size") or 0)
if files < min_files:
  fail("EMPTY_MEDIA", f"files={files}")
if nbytes < min_bytes:
  fail("EMPTY_MEDIA", f"bytes={nbytes}")
if not fx.get("has_jpeg"):
  fail("MISSING_REPRESENTATIVE", "jpeg")
if not fx.get("has_webp"):
  fail("MISSING_REPRESENTATIVE", "webp")
ps=fx.get("product_static_status")
if ps is not None and int(ps)!=200:
  fail("PRODUCT_STATIC_FAIL", f"status={ps}")
if verdict!="MEDIA_GATE_PASS" and fx.get("force_fail"):
  fail(verdict, fx.get("message") or verdict)
print(json.dumps({"ok":True,"verdict":"MEDIA_GATE_PASS","detail":{"fixture":d,"files":files,"bytes":nbytes}},indent=2))
PY
  exit $?
fi

case "$MODE" in
  pre-promote) run_pre_promote ;;
  post-promote) run_post_promote ;;
  *) fail_json INVALID_MODE "mode must be pre-promote|post-promote (got $MODE)" ;;
esac
