#!/usr/bin/env bash
# LIVE_MUTATING=true
# requires_global_lock=true
#
# Atomically reconcile public image pin sources to an exact release pair.
# Holds canonical exclusive flock for the entire authoritative transaction:
#   lock → live revalidation → backup → writes → compose/verify → rollback → release
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
#     ./scripts/release/reconcile-public-image-pins.sh
#
# Apply:
#   APPLY=1 ... ./scripts/release/reconcile-public-image-pins.sh
#
# Non-authoritative diagnostics only:
#   READ_ONLY_NO_LOCK=1 ... ./scripts/release/reconcile-public-image-pins.sh
set -euo pipefail

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
BACKEND_CONTAINER="${BACKEND_CONTAINER:-woodright-staging-backend}"
STOREFRONT_CONTAINER="${STOREFRONT_CONTAINER:-woodright-staging-storefront}"

ENV_FILE="${ENV_FILE:-/etc/dokploy/compose/woodright-stack-3dsdhd/code/.env}"
COMPOSE_FILE="${COMPOSE_FILE:-/etc/dokploy/compose/woodright-stack-3dsdhd/code/docker-compose.staging.yml}"
PINS_FILE="${PINS_FILE:-/srv/woodright/runtime-identity/DOKPLOY_IMAGE_PINS.env}"
ACTIVE_PUBLIC_FILE="${ACTIVE_PUBLIC_FILE:-/srv/woodright/runtime-identity/ACTIVE_PUBLIC.json}"
PUBLIC_DEMO_FILE="${PUBLIC_DEMO_FILE:-/srv/woodright/runtime-identity/public-demo.json}"
ACTIVE_RELEASE_FILE="${ACTIVE_RELEASE_FILE:-/srv/woodright/runtime-ownership/ACTIVE_RELEASE.json}"
BACKUP_DIR="${BACKUP_DIR:-/tmp/wr-ops-reconcile-pins-backup}"
SKIP_COMPOSE_VALIDATE="${SKIP_COMPOSE_VALIDATE:-0}"
BE_REPO="${BE_REPO:-ghcr.io/saintgroovie/woodright-backend}"
SF_REPO="${SF_REPO:-ghcr.io/saintgroovie/woodright-storefront}"

CANONICAL_LOCK_PATH="/srv/woodright/locks/live-cutover.lock"
LOCK_TIMEOUT_SEC="${LOCK_TIMEOUT_SEC:-30}"
LOCK_FD="${WR_STAGING_MUTATION_LOCK_FD:-9}"
LOCK_HELD=0
LOCK_HOLDER_PID=""
INHERITED_LOCK=0
TRANSACTION_STARTED=0
ROLLBACK_PERFORMED=0
LOCK_PATH=""

# Test-only fault injection (requires WOODRIGHT_PIN_RECONCILE_ALLOW_TEST_LOCK=1)
FAULT_AFTER="${WOODRIGHT_PIN_RECONCILE_FAULT_AFTER:-}"

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

  # Inherited hold from pair cutover (or other owner of woodright-staging-mutation-lock.sh).
  # Env flag alone is insufficient: require owned marker + FD that is the lock file (or live fcntl holder).
  if [[ "${WOODRIGHT_STAGING_MUTATION_LOCK_HELD:-0}" == "1" ]]; then
    local fd_ok=0 holder_ok=0 path_ok=0
    local holder_var="WR_STAGING_FCNTL_HOLDER_${LOCK_FD}"
    local holder_pid="${!holder_var:-}"
    if { : >&"$LOCK_FD"; } 2>/dev/null; then
      fd_ok=1
      # Prove FD refers to the lock path when /proc is available (Linux VM).
      if [[ -e "/proc/$$/fd/${LOCK_FD}" ]]; then
        local got want
        got="$(readlink -f "/proc/$$/fd/${LOCK_FD}" 2>/dev/null || readlink "/proc/$$/fd/${LOCK_FD}" 2>/dev/null || true)"
        want="$(readlink -f "$LOCK_PATH" 2>/dev/null || echo "$LOCK_PATH")"
        if [[ -n "$got" && "$got" == "$want" ]]; then
          path_ok=1
        fi
      else
        # macOS/local harness: require live fcntl holder exported by mutation-lock helper
        path_ok=0
      fi
    fi
    if [[ "${_WR_STAGING_LOCK_OWNED:-0}" == "1" && -n "$holder_pid" ]] && kill -0 "$holder_pid" 2>/dev/null; then
      holder_ok=1
    fi
    # Accept only: (owned + FD path matches lock) OR (owned + fcntl holder alive)
    if [[ "${_WR_STAGING_LOCK_OWNED:-0}" == "1" && ( "$path_ok" -eq 1 || "$holder_ok" -eq 1 ) ]]; then
      if [[ -n "${WR_STAGING_MUTATION_LOCK_PATH:-}" && "$LOCK_PATH" != "$WR_STAGING_MUTATION_LOCK_PATH" ]]; then
        fail 2 "inherited lock path mismatch want=$WR_STAGING_MUTATION_LOCK_PATH have=$LOCK_PATH"
      fi
      INHERITED_LOCK=1
      LOCK_HELD=1
      log "lock_acquired=yes path=$LOCK_PATH mode=inherited fd=$LOCK_FD path_ok=$path_ok holder_ok=$holder_ok"
      return 0
    fi
    fail 4 "forged_or_stale WOODRIGHT_STAGING_MUTATION_LOCK_HELD without proven lock FD/holder"
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
  if ! python3 - "$BACKEND_CONTAINER" "$STOREFRONT_CONTAINER" "$EXPECTED_RELEASE_SHA" "$EXPECTED_BACKEND_DIGEST" "$EXPECTED_STOREFRONT_DIGEST" <<'PY'
import json, re, subprocess, sys
be_name, sf_name, want_sha, want_be, want_sf = sys.argv[1:6]
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

for name in (be_name, sf_name):
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
    if sha != want_sha:
        raise SystemExit(f"{name} release_sha mismatch")
    want = want_be if name == be_name else want_sf
    if dig != want:
        raise SystemExit(f"{name} digest mismatch live={dig} want={want}")
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
  python3 - "$src" "$dst" "$BE_REF" "$SF_REF" <<'PY'
import sys
from pathlib import Path
src, dst, be_ref, sf_ref = sys.argv[1:5]
keys = {
    "WOODRIGHT_BACKEND_IMAGE": be_ref,
    "WOODRIGHT_STOREFRONT_IMAGE": sf_ref,
    "STOREFRONT_IMAGE": sf_ref,
}
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
missing = [k for k in ("WOODRIGHT_BACKEND_IMAGE", "WOODRIGHT_STOREFRONT_IMAGE", "STOREFRONT_IMAGE") if k not in seen]
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
  python3 - "$f" "$BE_REF" "$SF_REF" <<'PY'
import sys
from pathlib import Path
path, be, sf = sys.argv[1:4]
env={}
for line in Path(path).read_text().splitlines():
    s=line.strip()
    if not s or s.startswith('#') or '=' not in s: continue
    k,v=s.split('=',1); env[k]=v
need={
  'WOODRIGHT_BACKEND_IMAGE': be,
  'WOODRIGHT_STOREFRONT_IMAGE': sf,
  'STOREFRONT_IMAGE': sf,
}
for k,v in need.items():
    if env.get(k) != v:
        raise SystemExit(f'mismatch {k}')
stale=['5243c7c8f1146c2832af7093f1a98f4f8c4f8e5039f733d406d9571c9c657fe8','034db9486b9be45e282f543f7f26cbeb862a38b1282218bd0528831a44cf0828']
for k in need:
    for s in stale:
        if s in env.get(k,''):
            raise SystemExit(f'stale digest in {k}')
print('env_pins_ok')
PY
}

rewrite_active_public() {
  local src="$1" dst="$2"
  python3 - "$src" "$dst" "$EXPECTED_RELEASE_SHA" "$EXPECTED_BACKEND_DIGEST" "$EXPECTED_STOREFRONT_DIGEST" "$BE_REF" "$SF_REF" "$BACKEND_CONTAINER" "$STOREFRONT_CONTAINER" <<'PY'
import json, subprocess, sys
from pathlib import Path
from datetime import datetime, timezone
src, dst, sha, be_d, sf_d, be_ref, sf_ref, be_name, sf_name = sys.argv[1:10]
doc=json.loads(Path(src).read_text())
doc["release_sha"]=sha
doc["backend_revision"]=sha
doc["storefront_revision"]=sha
doc["backend_image_digest"]=be_d
doc["storefront_image_digest"]=sf_d
doc["backend_container"]=be_name
doc["storefront_container"]=sf_name
doc["dokploy_image_pins"]={
  "WOODRIGHT_BACKEND_IMAGE": be_ref,
  "WOODRIGHT_STOREFRONT_IMAGE": sf_ref,
}
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
doc["note"]=f"reconciled image pins to live {sha[:12]} digests; compose/env/ACTIVE_PUBLIC aligned"
Path(dst).write_text(json.dumps(doc, indent=2) + "\n")
PY
}

rewrite_active_release() {
  local src="$1" dst="$2"
  python3 - "$src" "$dst" "$EXPECTED_RELEASE_SHA" "$EXPECTED_BACKEND_DIGEST" "$EXPECTED_STOREFRONT_DIGEST" "$BACKEND_CONTAINER" "$STOREFRONT_CONTAINER" <<'PY'
import json, subprocess, sys
from pathlib import Path
from datetime import datetime, timezone
src, dst, sha, be_d, sf_d, be_name, sf_name = sys.argv[1:8]
doc=json.loads(Path(src).read_text())
doc["active_release_sha"]=sha
doc["release_sha"]=sha
doc["backend_revision"]=sha
doc["storefront_revision"]=sha
doc["backend_digest"]=be_d
doc["storefront_digest"]=sf_d
doc["component_revisions"]={"backend": sha, "storefront": sha}
doc["updated_utc"]=datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
doc["notes"]="reconciled under live-cutover.lock with public image pins"
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
  # Never unlock/release when lock was inherited from pair orchestrator.
  if [[ "${INHERITED_LOCK:-0}" == "1" ]]; then
    log "inherited_lock_retained_by_parent path=${LOCK_PATH:-}"
    return 0
  fi
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
