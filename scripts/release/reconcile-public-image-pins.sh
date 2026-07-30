#!/usr/bin/env bash
# LIVE_MUTATING=true
# requires_global_lock=true
#
# Atomically reconcile public image pin sources to an exact release pair.
# Holds environment-scoped exclusive flock for the entire authoritative transaction:
#   lock → live revalidation → backup → writes → compose/verify → rollback → release
#
# Canonical lock (public_demo): /srv/woodright/locks/public_demo/live-cutover.lock
# Legacy allowlisted path remains: /srv/woodright/locks/live-cutover.lock
#
# Updates (pair-only, no secrets):
#   - Dokploy compose .env: WOODRIGHT_BACKEND_IMAGE, WOODRIGHT_STOREFRONT_IMAGE, STOREFRONT_IMAGE
#   - optional: DOKPLOY_IMAGE_PINS.env
#   - optional: ACTIVE_PUBLIC.json (+ public-demo.json)
#   - optional: ACTIVE_RELEASE.json
#
# Does NOT recreate containers. Does NOT print secret values.
#
# Exit codes:
#   0 success
#   2 validation / usage
#   3 lock contention
#   4 permission / root failure
#   5 live drift after lock
#   6 transaction write failure
#   7 post-write verification failure
#   8 rollback failure
#
# Usage (authoritative dry-run default; takes exclusive lock):
#   EXPECTED_RELEASE_SHA=... EXPECTED_BACKEND_DIGEST=... EXPECTED_STOREFRONT_DIGEST=... \
#     ./scripts/release/reconcile-public-image-pins.sh --environment public_demo
#
# Apply:
#   APPLY=1 ... ./scripts/release/reconcile-public-image-pins.sh --environment public_demo
#
# Non-authoritative diagnostics only:
#   READ_ONLY_NO_LOCK=1 ... ./scripts/release/reconcile-public-image-pins.sh --environment public_demo
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=../../ops/lib/woodright-environment-profile.sh
source "$ROOT/ops/lib/woodright-environment-profile.sh"
# shellcheck source=../../ops/lib/woodright-oci-provenance.sh
source "$ROOT/ops/lib/woodright-oci-provenance.sh"
# shellcheck source=../../ops/lib/woodright-component-authority.sh
source "$ROOT/ops/lib/woodright-component-authority.sh"

DIGEST_RE='^sha256:[0-9a-f]{64}$'
SHA_RE='^[0-9a-f]{40}$'

EXPECTED_RELEASE_SHA="${EXPECTED_RELEASE_SHA:-}"
EXPECTED_BACKEND_DIGEST="${EXPECTED_BACKEND_DIGEST:-}"
EXPECTED_STOREFRONT_DIGEST="${EXPECTED_STOREFRONT_DIGEST:-}"
APPLY="${APPLY:-0}"
UPDATE_PINS="${UPDATE_PINS:-1}"
UPDATE_ACTIVE_PUBLIC="${UPDATE_ACTIVE_PUBLIC:-1}"
UPDATE_ACTIVE_RELEASE="${UPDATE_ACTIVE_RELEASE:-0}"
REQUIRE_LIVE_MATCH="${REQUIRE_LIVE_MATCH:-1}"
READ_ONLY_NO_LOCK="${READ_ONLY_NO_LOCK:-0}"
COMPONENT_SCOPE=""
# Parse --environment / --component from argv (remaining env vars still supported)
ENV_ARG=""
COMP_ARG=""
_filtered=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --environment) ENV_ARG="$2"; shift 2 ;;
    --environment=*) ENV_ARG="${1#--environment=}"; shift ;;
    --component) COMP_ARG="$2"; shift 2 ;;
    --component=*) COMP_ARG="${1#--component=}"; shift ;;
    *) _filtered+=("$1"); shift ;;
  esac
done
set -- "${_filtered[@]+"${_filtered[@]}"}"

[[ -n "$ENV_ARG" ]] || { echo "error: missing required --environment <public_demo|staging|production>" >&2; exit 2; }
wr_load_environment_profile "$ENV_ARG" || exit 2
wr_assert_environment_provisioned || exit 2
[[ "${WOODRIGHT_ENVIRONMENT}" == "public_demo" ]] || {
  echo "error: reconcile-public-image-pins only mutates public_demo pins (got ${WOODRIGHT_ENVIRONMENT})" >&2
  exit 2
}
[[ -n "$COMP_ARG" ]] || { echo "error: missing required --component <storefront|backend|pair>" >&2; exit 2; }
wr_assert_component_scope "$COMP_ARG" || exit 2
COMPONENT_SCOPE="$WOODRIGHT_COMPONENT_SCOPE"

BACKEND_CONTAINER="${BACKEND_CONTAINER:-$WOODRIGHT_BE_CONTAINER_DEFAULT}"
STOREFRONT_CONTAINER="${STOREFRONT_CONTAINER:-$WOODRIGHT_SF_CONTAINER_DEFAULT}"

ENV_FILE="${ENV_FILE:-$WOODRIGHT_COMPOSE_ENV_FILE}"
COMPOSE_FILE="${COMPOSE_FILE:-$WOODRIGHT_COMPOSE_FILE}"
PINS_FILE="${PINS_FILE:-${WOODRIGHT_IDENTITY_DIR}/DOKPLOY_IMAGE_PINS.env}"
ACTIVE_PUBLIC_FILE="${ACTIVE_PUBLIC_FILE:-$WOODRIGHT_ACTIVE_PUBLIC}"
PUBLIC_DEMO_FILE="${PUBLIC_DEMO_FILE:-${WOODRIGHT_PUBLIC_DEMO_FILE:-}}"
ACTIVE_RELEASE_FILE="${ACTIVE_RELEASE_FILE:-${WOODRIGHT_ACTIVE_RELEASE}}"
BACKUP_DIR="${BACKUP_DIR:-/tmp/wr-ops-reconcile-pins-backup-${WOODRIGHT_ENVIRONMENT}}"
SKIP_COMPOSE_VALIDATE="${SKIP_COMPOSE_VALIDATE:-0}"
BE_REPO="${BE_REPO:-ghcr.io/saintgroovie/woodright-backend}"
SF_REPO="${SF_REPO:-ghcr.io/saintgroovie/woodright-storefront}"

CANONICAL_LOCK_PATH="${WOODRIGHT_MUTATION_LOCK_PATH}"
LOCK_TIMEOUT_SEC="${LOCK_TIMEOUT_SEC:-30}"
LOCK_FD=9
LOCK_HELD=0
LOCK_HOLDER_PID=""
TRANSACTION_STARTED=0
ROLLBACK_PERFORMED=0
LOCK_PATH=""

# Test-only fault injection (requires WOODRIGHT_PIN_RECONCILE_ALLOW_TEST_LOCK=1)
FAULT_AFTER="${WOODRIGHT_PIN_RECONCILE_FAULT_AFTER:-}"

# Strict compose/identity path checks only when using profile-canonical paths (not fixture overrides)
if [[ "${WOODRIGHT_PIN_RECONCILE_ALLOW_TEST_LOCK:-}" != "1" ]]; then
  if [[ "$ENV_FILE" == "${WOODRIGHT_COMPOSE_ENV_FILE}" && "$COMPOSE_FILE" == "${WOODRIGHT_COMPOSE_FILE}" ]]; then
    wr_assert_compose_paths_for_environment "$ENV_FILE" "$COMPOSE_FILE" || exit 2
  fi
  if [[ "$ACTIVE_PUBLIC_FILE" == "${WOODRIGHT_ACTIVE_PUBLIC}" ]]; then
    wr_assert_identity_path_for_environment "$ACTIVE_PUBLIC_FILE" || exit 2
  fi
fi

# Test-only fault injection continues below (original fail() helpers)

fail() {
  local code="$1"
  shift
  echo "error: $*" >&2
  echo "summary mode=$([ "$APPLY" = "1" ] && echo apply || echo dry_run) lock_path=${LOCK_PATH:-none} lock_acquired=$([ "$LOCK_HELD" = "1" ] && echo yes || echo no) transaction_started=$([ "$TRANSACTION_STARTED" = "1" ] && echo yes || echo no) rollback_performed=$([ "$ROLLBACK_PERFORMED" = "1" ] && echo yes || echo no)" >&2
  exit "$code"
}

log() { echo "$*"; }

release_lock_holder() {
  if [[ -n "${LOCK_HOLDER_PID:-}" ]]; then
    kill "$LOCK_HOLDER_PID" 2>/dev/null || true
    wait "$LOCK_HOLDER_PID" 2>/dev/null || true
    LOCK_HOLDER_PID=""
  fi
}

need_sudo_for() {
  local f="$1"
  if [[ -e "$f" ]]; then
    [[ -w "$f" ]] && return 1
    return 0
  fi
  [[ -w "$(dirname "$f")" ]] && return 1
  return 0
}

resolve_lock_path() {
  if [[ "${WOODRIGHT_PIN_RECONCILE_ALLOW_TEST_LOCK:-}" == "1" && -n "${WOODRIGHT_CUTOVER_LOCK_PATH:-}" ]]; then
    printf '%s' "$WOODRIGHT_CUTOVER_LOCK_PATH"
    return 0
  fi
  if [[ -n "${WOODRIGHT_CUTOVER_LOCK_PATH:-}" && "${WOODRIGHT_CUTOVER_LOCK_PATH}" != "$CANONICAL_LOCK_PATH" ]]; then
    fail 2 "WOODRIGHT_CUTOVER_LOCK_PATH override rejected without WOODRIGHT_PIN_RECONCILE_ALLOW_TEST_LOCK=1"
  fi
  printf '%s' "$CANONICAL_LOCK_PATH"
}

acquire_lock() {
  if [[ "$READ_ONLY_NO_LOCK" == "1" ]]; then
    if [[ "$APPLY" == "1" ]]; then
      fail 2 "APPLY forbids READ_ONLY_NO_LOCK"
    fi
    LOCK_PATH="(none)"
    log "lock_acquired=no mode=read_only_no_lock warning=non_authoritative_preview"
    return 0
  fi
  LOCK_PATH="$(resolve_lock_path)"
  if [[ ! "$LOCK_TIMEOUT_SEC" =~ ^[0-9]+$ ]] || [[ "$LOCK_TIMEOUT_SEC" -lt 1 ]] || [[ "$LOCK_TIMEOUT_SEC" -gt 600 ]]; then
    fail 2 "invalid LOCK_TIMEOUT_SEC"
  fi
  mkdir -p "$(dirname "$LOCK_PATH")"
  # Create/open lock file; do not delete on release.
  if [[ ! -e "$LOCK_PATH" ]]; then
    : >>"$LOCK_PATH" || fail 4 "cannot create lock file $LOCK_PATH"
  fi

  if command -v flock >/dev/null 2>&1; then
    eval "exec ${LOCK_FD}>>\"\$LOCK_PATH\""
    if ! flock -x -w "$LOCK_TIMEOUT_SEC" "$LOCK_FD"; then
      log "lock_acquired=no path=$LOCK_PATH reason=contention timeout=${LOCK_TIMEOUT_SEC}s"
      fail 3 "lock contention on $LOCK_PATH"
    fi
    LOCK_HELD=1
    log "lock_acquired=yes path=$LOCK_PATH timeout_sec=$LOCK_TIMEOUT_SEC via=flock"
    return 0
  fi

  # Portable fallback when util-linux flock is absent (e.g. macOS local fidelity).
  # A dedicated holder process keeps the exclusive lock until EXIT.
  local ready
  ready="$(mktemp)"
  python3 - "$LOCK_PATH" "$LOCK_TIMEOUT_SEC" "$ready" <<'PY' &
import fcntl, os, sys, time
path, timeout, ready = sys.argv[1], float(sys.argv[2]), sys.argv[3]
deadline = time.time() + timeout
fd = os.open(path, os.O_RDWR | os.O_CREAT, 0o644)
while True:
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        break
    except BlockingIOError:
        if time.time() >= deadline:
            with open(ready, "w", encoding="utf-8") as fh:
                fh.write("fail\n")
            raise SystemExit(1)
        time.sleep(0.05)
with open(ready, "w", encoding="utf-8") as fh:
    fh.write("ok\n")
while True:
    time.sleep(3600)
PY
  LOCK_HOLDER_PID=$!
  local deadline=$((SECONDS + LOCK_TIMEOUT_SEC + 2))
  while (( SECONDS < deadline )); do
    if [[ -s "$ready" ]]; then
      break
    fi
    if ! kill -0 "$LOCK_HOLDER_PID" 2>/dev/null; then
      break
    fi
    sleep 0.05
  done
  local status
  status="$(cat "$ready" 2>/dev/null || true)"
  rm -f "$ready"
  if [[ "$status" != "ok" ]]; then
    release_lock_holder
    log "lock_acquired=no path=$LOCK_PATH reason=contention timeout=${LOCK_TIMEOUT_SEC}s"
    fail 3 "lock contention on $LOCK_PATH"
  fi
  LOCK_HELD=1
  log "lock_acquired=yes path=$LOCK_PATH timeout_sec=$LOCK_TIMEOUT_SEC via=python_holder"
}

maybe_fault() {
  local stage="$1"
  if [[ "${WOODRIGHT_PIN_RECONCILE_ALLOW_TEST_LOCK:-}" == "1" && -n "$FAULT_AFTER" && "$FAULT_AFTER" == "$stage" ]]; then
    if [[ "$TRANSACTION_STARTED" == "1" ]] && declare -F tx_fail >/dev/null 2>&1; then
      tx_fail 7 "injected fault after $stage"
    fi
    fail 7 "injected fault after $stage"
  fi
}

[[ "$EXPECTED_RELEASE_SHA" =~ $SHA_RE ]] || fail 2 "EXPECTED_RELEASE_SHA invalid"
[[ "$EXPECTED_BACKEND_DIGEST" =~ $DIGEST_RE ]] || fail 2 "EXPECTED_BACKEND_DIGEST invalid"
[[ "$EXPECTED_STOREFRONT_DIGEST" =~ $DIGEST_RE ]] || fail 2 "EXPECTED_STOREFRONT_DIGEST invalid"
[[ -f "$ENV_FILE" ]] || fail 2 "missing ENV_FILE=$ENV_FILE"
[[ -f "$COMPOSE_FILE" ]] || fail 2 "missing COMPOSE_FILE=$COMPOSE_FILE"

if [[ "${WOODRIGHT_COMPONENT_SCOPE}" == "storefront" ]]; then
  if [[ "${WOODRIGHT_PIN_RECONCILE_ALLOW_TEST_LOCK:-}" == "1" ]]; then
    # Fixture unit tests: freeze from expected backend digest itself
    export WOODRIGHT_FROZEN_BACKEND_DIGEST="$EXPECTED_BACKEND_DIGEST"
  else
    command -v docker >/dev/null || fail 2 "docker required to freeze backend for storefront-only"
    docker inspect "$BACKEND_CONTAINER" >/dev/null 2>&1 || fail 2 "backend container missing for storefront-only freeze"
    wr_freeze_peer_digest backend "$BACKEND_CONTAINER" || fail 2 "cannot freeze backend for storefront-only"
    wr_assert_storefront_only_does_not_mutate_backend "$EXPECTED_BACKEND_DIGEST" || fail 2 "storefront-only backend freeze violated"
  fi
fi
if [[ "${WOODRIGHT_COMPONENT_SCOPE}" == "backend" ]]; then
  if [[ "${WOODRIGHT_PIN_RECONCILE_ALLOW_TEST_LOCK:-}" == "1" ]]; then
    export WOODRIGHT_FROZEN_STOREFRONT_DIGEST="$EXPECTED_STOREFRONT_DIGEST"
  else
    command -v docker >/dev/null || fail 2 "docker required to freeze storefront for backend-only"
    docker inspect "$STOREFRONT_CONTAINER" >/dev/null 2>&1 || fail 2 "storefront container missing for backend-only freeze"
    wr_freeze_peer_digest storefront "$STOREFRONT_CONTAINER" || fail 2 "cannot freeze storefront for backend-only"
    [[ "$EXPECTED_STOREFRONT_DIGEST" == "${WOODRIGHT_FROZEN_STOREFRONT_DIGEST}" ]] \
      || fail 2 "backend-only refuses storefront digest change planned=$EXPECTED_STOREFRONT_DIGEST frozen=${WOODRIGHT_FROZEN_STOREFRONT_DIGEST}"
  fi
fi

# OCI gate on APPLY: Docker required; prove provenance for mutated component(s) only.
# Only WOODRIGHT_PIN_RECONCILE_ALLOW_TEST_LOCK=1 may skip (fixture unit tests).
if [[ "$APPLY" == "1" && "${WOODRIGHT_PIN_RECONCILE_ALLOW_TEST_LOCK:-}" != "1" ]]; then
  command -v docker >/dev/null || fail 2 "docker required for APPLY OCI provenance"
  if [[ "${WOODRIGHT_COMPONENT_SCOPE}" == "pair" || "${WOODRIGHT_COMPONENT_SCOPE}" == "storefront" ]]; then
    docker image inspect "${SF_REPO}@${EXPECTED_STOREFRONT_DIGEST}" >/dev/null 2>&1 \
      || fail 2 "storefront image not local for OCI provenance: ${SF_REPO}@${EXPECTED_STOREFRONT_DIGEST}"
    wr_assert_oci_revision_matches_sha "${SF_REPO}@${EXPECTED_STOREFRONT_DIGEST}" "$EXPECTED_RELEASE_SHA" \
      || fail 2 "storefront OCI revision mismatch vs EXPECTED_RELEASE_SHA"
  fi
  if [[ "${WOODRIGHT_COMPONENT_SCOPE}" == "pair" || "${WOODRIGHT_COMPONENT_SCOPE}" == "backend" ]]; then
    docker image inspect "${BE_REPO}@${EXPECTED_BACKEND_DIGEST}" >/dev/null 2>&1 \
      || fail 2 "backend image not local for OCI provenance: ${BE_REPO}@${EXPECTED_BACKEND_DIGEST}"
    wr_assert_oci_revision_matches_sha "${BE_REPO}@${EXPECTED_BACKEND_DIGEST}" "$EXPECTED_RELEASE_SHA" \
      || fail 2 "backend OCI revision mismatch vs EXPECTED_RELEASE_SHA"
  fi
elif command -v docker >/dev/null 2>&1; then
  if [[ "${WOODRIGHT_COMPONENT_SCOPE}" == "pair" || "${WOODRIGHT_COMPONENT_SCOPE}" == "storefront" ]]; then
    if docker image inspect "${SF_REPO}@${EXPECTED_STOREFRONT_DIGEST}" >/dev/null 2>&1; then
      wr_assert_oci_revision_matches_sha "${SF_REPO}@${EXPECTED_STOREFRONT_DIGEST}" "$EXPECTED_RELEASE_SHA" \
        || fail 2 "storefront OCI revision mismatch vs EXPECTED_RELEASE_SHA"
    fi
  fi
fi

BE_REF="${BE_REPO}@${EXPECTED_BACKEND_DIGEST}"
SF_REF="${SF_REPO}@${EXPECTED_STOREFRONT_DIGEST}"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"

TARGETS=("$ENV_FILE")
[[ "$UPDATE_PINS" == "1" && -f "$PINS_FILE" ]] && TARGETS+=("$PINS_FILE")
[[ "$UPDATE_ACTIVE_PUBLIC" == "1" && -f "$ACTIVE_PUBLIC_FILE" ]] && TARGETS+=("$ACTIVE_PUBLIC_FILE")
[[ "$UPDATE_ACTIVE_PUBLIC" == "1" && -f "$PUBLIC_DEMO_FILE" ]] && TARGETS+=("$PUBLIC_DEMO_FILE")
[[ "$UPDATE_ACTIVE_RELEASE" == "1" && -f "$ACTIVE_RELEASE_FILE" ]] && TARGETS+=("$ACTIVE_RELEASE_FILE")

USE_SUDO=0
for t in "${TARGETS[@]}"; do
  if need_sudo_for "$t"; then
    USE_SUDO=1
  fi
done
if [[ "$USE_SUDO" == "1" ]]; then
  if sudo -n true 2>/dev/null; then
    log "privilege=sudo-n for root-owned targets"
  else
    fail 4 "blocked_root_env_write: need sudo -n for one or more targets"
  fi
fi

run_priv() {
  if [[ "${USE_SUDO:-0}" == "1" ]]; then
    sudo -n "$@"
  else
    "$@"
  fi
}

assert_live_match() {
  [[ "$REQUIRE_LIVE_MATCH" == "1" ]] || { log "live_match=skipped"; return 0; }
  command -v docker >/dev/null || fail 2 "docker required for live match"
  local scope="${WOODRIGHT_COMPONENT_SCOPE}"
  if ! python3 - "$BACKEND_CONTAINER" "$STOREFRONT_CONTAINER" "$EXPECTED_RELEASE_SHA" "$EXPECTED_BACKEND_DIGEST" "$EXPECTED_STOREFRONT_DIGEST" "$scope" <<'PY'
import json, re, subprocess, sys
be_name, sf_name, want_sha, want_be, want_sf, scope = sys.argv[1:7]
DIGEST_RE = re.compile(r"sha256:[0-9a-f]{64}")

def inspect(name):
    r = subprocess.run(["docker", "inspect", name], capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"inspect failed: {name}")
    return json.loads(r.stdout)[0]

def digest(ins):
    cfg = (ins.get("Config") or {}).get("Image") or ""
    m = DIGEST_RE.search(cfg)
    if m:
        return m.group(0)
    for d in ins.get("RepoDigests") or []:
        m = DIGEST_RE.search(d)
        if m:
            return m.group(0)
    return None

def label(ins, key, env_key):
    labs = (ins.get("Config") or {}).get("Labels") or {}
    if labs.get(key):
        return labs[key]
    pref = env_key + "="
    for e in (ins.get("Config") or {}).get("Env") or []:
        if e.startswith(pref):
            return e[len(pref):]
    return None

checks = []
if scope in ("pair", "backend"):
    checks.append((be_name, want_be, True if scope == "pair" else True))
if scope in ("pair", "storefront"):
    checks.append((sf_name, want_sf, True))
# For component-only, only require release-sha match on the mutated component.
for name, want_dig, _ in checks:
    ins = inspect(name)
    if not (ins.get("State") or {}).get("Running"):
        raise SystemExit(f"{name} not running")
    role = label(ins, "com.woodright.runtime-role", "WOODRIGHT_RUNTIME_ROLE")
    exp = label(ins, "com.woodright.exposure", "WOODRIGHT_EXPOSURE")
    sha = label(ins, "com.woodright.release-sha", "WOODRIGHT_RELEASE_SHA")
    dig = digest(ins)
    if role != "public_demo":
        raise SystemExit(f"{name} role={role}")
    if exp != "public":
        raise SystemExit(f"{name} exposure={exp}")
    mutated = (scope == "pair") or (scope == "backend" and name == be_name) or (scope == "storefront" and name == sf_name)
    if mutated and sha != want_sha:
        raise SystemExit(f"{name} release_sha mismatch")
    if dig != want_dig:
        raise SystemExit(f"{name} digest mismatch live={dig} want={want_dig}")
# Peer must remain at expected frozen digest for component-only
if scope == "storefront":
    ins = inspect(be_name)
    dig = digest(ins)
    if dig != want_be:
        raise SystemExit(f"frozen backend digest mismatch live={dig} want={want_be}")
if scope == "backend":
    ins = inspect(sf_name)
    dig = digest(ins)
    if dig != want_sf:
        raise SystemExit(f"frozen storefront digest mismatch live={dig} want={want_sf}")
print("live_match_ok")
PY
  then
    if [[ "$TRANSACTION_STARTED" == "1" ]] && declare -F tx_fail >/dev/null 2>&1; then
      tx_fail 5 "live drift after mutation"
    fi
    fail 5 "live drift after lock acquire"
  fi
}

rewrite_env_pins() {
  local src="$1" dst="$2"
  local scope="${WOODRIGHT_COMPONENT_SCOPE}"
  python3 - "$src" "$dst" "$BE_REF" "$SF_REF" "$scope" <<'PY'
import sys
from pathlib import Path
src, dst, be_ref, sf_ref, scope = sys.argv[1:6]
keys = {}
if scope in ("pair", "backend"):
    keys["WOODRIGHT_BACKEND_IMAGE"] = be_ref
if scope in ("pair", "storefront"):
    keys["WOODRIGHT_STOREFRONT_IMAGE"] = sf_ref
    keys["STOREFRONT_IMAGE"] = sf_ref
if not keys:
    raise SystemExit(f"unknown component scope={scope}")
text = Path(src).read_text()
lines = text.splitlines(keepends=True)
seen = set()
out = []
for line in lines:
    raw = line
    if line.endswith("\n"):
        body, nl = line[:-1], "\n"
    else:
        body, nl = line, ""
    if body.lstrip().startswith("#") or "=" not in body:
        out.append(raw)
        continue
    k, _, _v = body.partition("=")
    if k in keys:
        out.append(f"{k}={keys[k]}{nl}")
        seen.add(k)
    else:
        out.append(raw)
missing = [k for k in keys if k not in seen]
if missing:
    if out and not str(out[-1]).endswith("\n"):
        out[-1] = out[-1] + "\n"
    for k in missing:
        out.append(f"{k}={keys[k]}\n")
Path(dst).write_text("".join(out))
PY
}

validate_env_pins() {
  local f="$1"
  local scope="${WOODRIGHT_COMPONENT_SCOPE}"
  python3 - "$f" "$BE_REF" "$SF_REF" "$scope" <<'PY'
import sys
from pathlib import Path
path, be, sf, scope = sys.argv[1:5]
env={}
for line in Path(path).read_text().splitlines():
    s=line.strip()
    if not s or s.startswith('#') or '=' not in s: continue
    k,v=s.split('=',1); env[k]=v
need={}
if scope in ("pair", "backend"):
    need['WOODRIGHT_BACKEND_IMAGE']=be
if scope in ("pair", "storefront"):
    need['WOODRIGHT_STOREFRONT_IMAGE']=sf
    need['STOREFRONT_IMAGE']=sf
for k,v in need.items():
    if env.get(k) != v:
        raise SystemExit(f'mismatch {k}')
print('env_pins_ok')
PY
}

rewrite_active_public() {
  local src="$1" dst="$2"
  local scope="${WOODRIGHT_COMPONENT_SCOPE}"
  python3 - "$src" "$dst" "$EXPECTED_RELEASE_SHA" "$EXPECTED_BACKEND_DIGEST" "$EXPECTED_STOREFRONT_DIGEST" "$BE_REF" "$SF_REF" "$BACKEND_CONTAINER" "$STOREFRONT_CONTAINER" "$scope" <<'PY'
import json, subprocess, sys
from pathlib import Path
from datetime import datetime, timezone
src, dst, sha, be_d, sf_d, be_ref, sf_ref, be_name, sf_name, scope = sys.argv[1:11]
doc=json.loads(Path(src).read_text())
# Component-scoped: never rewrite untouched peer revision to the new SHA.
if scope == "pair":
    doc["release_sha"]=sha
    doc["backend_revision"]=sha
    doc["storefront_revision"]=sha
    doc["backend_image_digest"]=be_d
    doc["storefront_image_digest"]=sf_d
elif scope == "storefront":
    doc["release_sha"]=sha
    doc["storefront_revision"]=sha
    doc["storefront_image_digest"]=sf_d
    # keep backend_revision as-is; update digest to frozen expectation
    doc["backend_image_digest"]=be_d
elif scope == "backend":
    doc["backend_revision"]=sha
    doc["backend_image_digest"]=be_d
    # keep release_sha / storefront_revision (buyer marker) unchanged
    doc["storefront_image_digest"]=sf_d
else:
    raise SystemExit(f"unknown scope {scope}")
doc["backend_container"]=be_name
doc["storefront_container"]=sf_name
pins=doc.get("dokploy_image_pins") or {}
if scope in ("pair", "backend"):
    pins["WOODRIGHT_BACKEND_IMAGE"]=be_ref
if scope in ("pair", "storefront"):
    pins["WOODRIGHT_STOREFRONT_IMAGE"]=sf_ref
doc["dokploy_image_pins"]=pins
try:
    for name, key_full in (
        (be_name, "backend_container_id"),
        (sf_name, "storefront_container_id"),
    ):
        r=subprocess.run(["docker","inspect","-f","{{.Id}}",name],capture_output=True,text=True)
        if r.returncode==0:
            doc[key_full]=r.stdout.strip()
except Exception:
    pass
doc["generated_at"]=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
doc["note"]=f"reconciled pins scope={scope} sha={sha[:12]}; peer revisions preserved when component-only"
Path(dst).write_text(json.dumps(doc, indent=2) + "\n")
PY
}

rewrite_active_release() {
  local src="$1" dst="$2"
  local scope="${WOODRIGHT_COMPONENT_SCOPE}"
  python3 - "$src" "$dst" "$EXPECTED_RELEASE_SHA" "$EXPECTED_BACKEND_DIGEST" "$EXPECTED_STOREFRONT_DIGEST" "$BACKEND_CONTAINER" "$STOREFRONT_CONTAINER" "$scope" <<'PY'
import json, subprocess, sys
from pathlib import Path
from datetime import datetime, timezone
src, dst, sha, be_d, sf_d, be_name, sf_name, scope = sys.argv[1:9]
doc=json.loads(Path(src).read_text())
comps=dict(doc.get("component_revisions") or {})
if scope == "pair":
    doc["active_release_sha"]=sha
    doc["release_sha"]=sha
    doc["backend_revision"]=sha
    doc["storefront_revision"]=sha
    doc["backend_digest"]=be_d
    doc["storefront_digest"]=sf_d
    comps={"backend": sha, "storefront": sha}
elif scope == "storefront":
    doc["active_release_sha"]=sha
    doc["release_sha"]=sha
    doc["storefront_revision"]=sha
    doc["storefront_digest"]=sf_d
    doc["backend_digest"]=be_d
    comps["storefront"]=sha
elif scope == "backend":
    doc["backend_revision"]=sha
    doc["backend_digest"]=be_d
    doc["storefront_digest"]=sf_d
    comps["backend"]=sha
else:
    raise SystemExit(f"unknown scope {scope}")
doc["component_revisions"]=comps
doc["updated_utc"]=datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
doc["notes"]=f"reconciled under environment lock scope={scope}"
try:
    for name, short, full in (
        (be_name, "backend_container_id", "backend_container_id_full"),
        (sf_name, "storefront_container_id", "storefront_container_id_full"),
    ):
        r=subprocess.run(["docker","inspect","-f","{{.Id}}",name],capture_output=True,text=True)
        if r.returncode==0:
            cid=r.stdout.strip()
            doc[short]=cid[:12]
            doc[full]=cid
except Exception:
    pass
Path(dst).write_text(json.dumps(doc, indent=2) + "\n")
PY
}

atomic_install() {
  local src_tmp="$1" dest="$2"
  local mode owner group
  mode="$(python3 -c 'import os,stat; st=os.stat("'"$dest"'"); print(oct(stat.S_IMODE(st.st_mode))[2:])')"
  owner="$(python3 -c 'import os; print(os.stat("'"$dest"'").st_uid)')"
  group="$(python3 -c 'import os; print(os.stat("'"$dest"'").st_gid)')"
  local dir base
  dir="$(dirname "$dest")"
  base="$(basename "$dest")"
  local staged="${dir}/.${base}.wr-reconcile-$$"
  if [[ "$USE_SUDO" == "1" ]]; then
    sudo -n cp "$src_tmp" "$staged"
    sudo -n chmod "$mode" "$staged"
    sudo -n chown "${owner}:${group}" "$staged"
    sudo -n mv -f "$staged" "$dest"
  else
    cp "$src_tmp" "$staged"
    chmod "$mode" "$staged"
    mv -f "$staged" "$dest"
  fi
  python3 - "$dest" "$mode" "$owner" "$group" <<'PY'
import os, stat, sys
dest, mode, owner, group = sys.argv[1:5]
st = os.stat(dest)
amode = oct(stat.S_IMODE(st.st_mode))[2:]
aowner = f"{st.st_uid}:{st.st_gid}"
if amode != mode:
    raise SystemExit(f"mode not preserved for {dest} ({amode} != {mode})")
if aowner != f"{owner}:{group}":
    raise SystemExit(f"owner not preserved for {dest} ({aowner} != {owner}:{group})")
PY
}

print_pin_diff() {
  local src="$1" dst="$2"
  python3 - "$src" "$dst" <<'PY'
import re, sys
from pathlib import Path
ALLOW={"WOODRIGHT_BACKEND_IMAGE","WOODRIGHT_STOREFRONT_IMAGE","STOREFRONT_IMAGE"}
DIGEST_RE=re.compile(r"sha256:[0-9a-f]{64}")
def pins(path):
    out={}
    for line in Path(path).read_text().splitlines():
        if not line or line.lstrip().startswith('#') or '=' not in line: continue
        k,v=line.split('=',1)
        if k in ALLOW:
            m=DIGEST_RE.search(v)
            out[k]=m.group(0) if m else "missing_or_invalid"
    return out
a,b=pins(sys.argv[1]),pins(sys.argv[2])
for k in sorted(ALLOW):
    if a.get(k)!=b.get(k):
        print(f"change {k}")
        print(f"  old_digest={a.get(k)}")
        print(f"  new_digest={b.get(k)}")
PY
}

log "planned be=$EXPECTED_BACKEND_DIGEST"
log "planned sf=$EXPECTED_STOREFRONT_DIGEST"
log "planned sha=$EXPECTED_RELEASE_SHA"
log "env_file=$ENV_FILE"
log "targets=${#TARGETS[@]}"
log "dry_run=$([ "$APPLY" = "1" ] && echo no || echo yes)"
log "canonical_lock=$CANONICAL_LOCK_PATH"

# Exclusive lock before authoritative live read / mutation planning.
acquire_lock

# Authoritative snapshot only after lock.
assert_live_match

TMP_ENV="$(mktemp)"
TMP_PINS="$(mktemp)"
TMP_AP="$(mktemp)"
TMP_AR="$(mktemp)"
CLEANUP_DONE=0
cleanup_on_exit() {
  local ec="${1:-$?}"
  [[ "$CLEANUP_DONE" == "1" ]] && return 0
  CLEANUP_DONE=1
  if [[ "$TRANSACTION_STARTED" == "1" && "$ROLLBACK_PERFORMED" != "1" && "$ec" -ne 0 ]]; then
    if declare -F restore_all >/dev/null 2>&1; then
      log "exit_path_rollback under_lock=yes exit_code=$ec"
      restore_all || true
    fi
  fi
  rm -f "${TMP_ENV:-}" "${TMP_PINS:-}" "${TMP_AP:-}" "${TMP_AR:-}"
  release_lock_holder
}
trap 'cleanup_on_exit $?' EXIT
trap 'cleanup_on_exit 130; exit 130' INT
trap 'cleanup_on_exit 143; exit 143' TERM
trap 'cleanup_on_exit 129; exit 129' HUP

rewrite_env_pins "$ENV_FILE" "$TMP_ENV"
validate_env_pins "$TMP_ENV"
print_pin_diff "$ENV_FILE" "$TMP_ENV"

if [[ "$UPDATE_PINS" == "1" && -f "$PINS_FILE" ]]; then
  rewrite_env_pins "$PINS_FILE" "$TMP_PINS"
  validate_env_pins "$TMP_PINS"
  print_pin_diff "$PINS_FILE" "$TMP_PINS"
fi

if [[ "$UPDATE_ACTIVE_PUBLIC" == "1" && -f "$ACTIVE_PUBLIC_FILE" ]]; then
  rewrite_active_public "$ACTIVE_PUBLIC_FILE" "$TMP_AP"
fi

if [[ "$UPDATE_ACTIVE_RELEASE" == "1" && -f "$ACTIVE_RELEASE_FILE" ]]; then
  rewrite_active_release "$ACTIVE_RELEASE_FILE" "$TMP_AR"
fi

if [[ "$APPLY" != "1" ]]; then
  log "dry_run_complete; set APPLY=1 to write"
  log "summary mode=dry_run lock_path=$LOCK_PATH lock_acquired=$([ "$LOCK_HELD" = "1" ] && echo yes || echo no) transaction_started=no rollback_performed=no consistency=preview_ok"
  exit 0
fi

# Backups inside lock
declare -a BACKED=()
for t in "${TARGETS[@]}"; do
  base="$(basename "$t")"
  bak="$BACKUP_DIR/${base}.pre-apply-$TS"
  run_priv cp -a "$t" "$bak"
  BACKED+=("$t|$bak")
done
log "backup_dir=$BACKUP_DIR"
TRANSACTION_STARTED=1

restore_all() {
  log "restoring_all_targets under_lock=yes"
  ROLLBACK_PERFORMED=1
  local pair dest bak
  local ok=1
  for pair in "${BACKED[@]}"; do
    dest="${pair%%|*}"
    bak="${pair#*|}"
    if ! atomic_install "$bak" "$dest"; then
      ok=0
    fi
  done
  if [[ "$ok" != "1" ]]; then
    fail 8 "rollback failed while holding lock"
  fi
}

tx_fail() {
  local code="$1"
  shift
  restore_all
  fail "$code" "$*"
}

if ! atomic_install "$TMP_ENV" "$ENV_FILE"; then
  tx_fail 6 "failed installing .env"
fi
maybe_fault env
if ! validate_env_pins "$ENV_FILE"; then
  tx_fail 7 "post-install .env validation failed"
fi

if [[ "$UPDATE_PINS" == "1" && -f "$PINS_FILE" ]]; then
  if ! atomic_install "$TMP_PINS" "$PINS_FILE"; then
    tx_fail 6 "failed installing pins"
  fi
  maybe_fault pins
  if ! validate_env_pins "$PINS_FILE"; then
    tx_fail 7 "post-install pins validation failed"
  fi
fi

if [[ "$UPDATE_ACTIVE_PUBLIC" == "1" && -f "$ACTIVE_PUBLIC_FILE" ]]; then
  if ! atomic_install "$TMP_AP" "$ACTIVE_PUBLIC_FILE"; then
    tx_fail 6 "failed installing ACTIVE_PUBLIC"
  fi
  maybe_fault active_public
  if [[ -f "$PUBLIC_DEMO_FILE" ]]; then
    if ! atomic_install "$TMP_AP" "$PUBLIC_DEMO_FILE"; then
      tx_fail 6 "failed installing public-demo.json"
    fi
  fi
fi

if [[ "$UPDATE_ACTIVE_RELEASE" == "1" && -f "$ACTIVE_RELEASE_FILE" ]]; then
  if ! atomic_install "$TMP_AR" "$ACTIVE_RELEASE_FILE"; then
    tx_fail 6 "failed installing ACTIVE_RELEASE"
  fi
fi

if [[ "$SKIP_COMPOSE_VALIDATE" == "1" ]]; then
  log "compose_validate=skipped"
else
  maybe_fault compose
  if ! COMPOSE_IMAGES="$(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" config --images)"; then
    tx_fail 7 "docker compose config failed"
  fi
  if ! echo "$COMPOSE_IMAGES" | grep -F "${EXPECTED_BACKEND_DIGEST#sha256:}" >/dev/null && \
     ! echo "$COMPOSE_IMAGES" | grep -F "$EXPECTED_BACKEND_DIGEST" >/dev/null; then
    tx_fail 7 "compose config did not resolve backend digest"
  fi
  if ! echo "$COMPOSE_IMAGES" | grep -F "${EXPECTED_STOREFRONT_DIGEST#sha256:}" >/dev/null && \
     ! echo "$COMPOSE_IMAGES" | grep -F "$EXPECTED_STOREFRONT_DIGEST" >/dev/null; then
    tx_fail 7 "compose config did not resolve storefront digest"
  fi
  if echo "$COMPOSE_IMAGES" | grep -E '5243c7c8f1146c2832af7093f1a98f4f8c4f8e5039f733d406d9571c9c657fe8|034db9486b9be45e282f543f7f26cbeb862a38b1282218bd0528831a44cf0828' >/dev/null; then
    tx_fail 7 "stale digests still present in compose config"
  fi
  log "compose_resolved_ok"
fi

maybe_fault verify
# Final authoritative live match still under lock.
assert_live_match

log "apply_complete"
log "summary mode=apply lock_path=$LOCK_PATH lock_acquired=yes transaction_started=yes rollback_performed=no consistency=pass"
# Lock FD closes automatically on process exit.
