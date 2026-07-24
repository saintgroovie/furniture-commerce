#!/usr/bin/env bash
# Atomically reconcile public image pin sources to an exact release pair.
#
# Updates (pair-only, no secrets):
#   - Dokploy compose .env: WOODRIGHT_BACKEND_IMAGE, WOODRIGHT_STOREFRONT_IMAGE, STOREFRONT_IMAGE
#   - optional: DOKPLOY_IMAGE_PINS.env
#   - optional: ACTIVE_PUBLIC.json digests/sha/pins (+ companion public-demo.json)
#
# Does NOT recreate containers. Does NOT print secret values.
#
# Usage (dry-run default):
#   EXPECTED_RELEASE_SHA=eb298fd... \
#   EXPECTED_BACKEND_DIGEST=sha256:347e6fe4... \
#   EXPECTED_STOREFRONT_DIGEST=sha256:3826ef26... \
#   ./scripts/release/reconcile-public-image-pins.sh
#
# Apply:
#   APPLY=1 ./scripts/release/reconcile-public-image-pins.sh
#
# Paths overridable via ENV_FILE / PINS_FILE / ACTIVE_PUBLIC_FILE.
set -euo pipefail

DIGEST_RE='^sha256:[0-9a-f]{64}$'
SHA_RE='^[0-9a-f]{40}$'
PIN_KEYS_RE='^(WOODRIGHT_BACKEND_IMAGE|WOODRIGHT_STOREFRONT_IMAGE|STOREFRONT_IMAGE)$'

EXPECTED_RELEASE_SHA="${EXPECTED_RELEASE_SHA:-}"
EXPECTED_BACKEND_DIGEST="${EXPECTED_BACKEND_DIGEST:-}"
EXPECTED_STOREFRONT_DIGEST="${EXPECTED_STOREFRONT_DIGEST:-}"
APPLY="${APPLY:-0}"
UPDATE_PINS="${UPDATE_PINS:-1}"
UPDATE_ACTIVE_PUBLIC="${UPDATE_ACTIVE_PUBLIC:-1}"
REQUIRE_LIVE_MATCH="${REQUIRE_LIVE_MATCH:-1}"
BACKEND_CONTAINER="${BACKEND_CONTAINER:-woodright-staging-backend}"
STOREFRONT_CONTAINER="${STOREFRONT_CONTAINER:-woodright-staging-storefront}"

ENV_FILE="${ENV_FILE:-/etc/dokploy/compose/woodright-stack-3dsdhd/code/.env}"
COMPOSE_FILE="${COMPOSE_FILE:-/etc/dokploy/compose/woodright-stack-3dsdhd/code/docker-compose.staging.yml}"
PINS_FILE="${PINS_FILE:-/srv/woodright/runtime-identity/DOKPLOY_IMAGE_PINS.env}"
ACTIVE_PUBLIC_FILE="${ACTIVE_PUBLIC_FILE:-/srv/woodright/runtime-identity/ACTIVE_PUBLIC.json}"
PUBLIC_DEMO_FILE="${PUBLIC_DEMO_FILE:-/srv/woodright/runtime-identity/public-demo.json}"
BACKUP_DIR="${BACKUP_DIR:-/tmp/wr-ops-reconcile-pins-backup}"
SKIP_COMPOSE_VALIDATE="${SKIP_COMPOSE_VALIDATE:-0}"
BE_REPO="${BE_REPO:-ghcr.io/saintgroovie/woodright-backend}"
SF_REPO="${SF_REPO:-ghcr.io/saintgroovie/woodright-storefront}"

die() { echo "error: $*" >&2; exit 2; }
log() { echo "$*"; }

need_sudo_for() {
  local f="$1"
  if [[ -e "$f" ]]; then
    [[ -w "$f" ]] && return 1
    return 0
  fi
  [[ -w "$(dirname "$f")" ]] && return 1
  return 0
}

[[ "$EXPECTED_RELEASE_SHA" =~ $SHA_RE ]] || die "EXPECTED_RELEASE_SHA invalid"
[[ "$EXPECTED_BACKEND_DIGEST" =~ $DIGEST_RE ]] || die "EXPECTED_BACKEND_DIGEST invalid"
[[ "$EXPECTED_STOREFRONT_DIGEST" =~ $DIGEST_RE ]] || die "EXPECTED_STOREFRONT_DIGEST invalid"
[[ -f "$ENV_FILE" ]] || die "missing ENV_FILE=$ENV_FILE"
[[ -f "$COMPOSE_FILE" ]] || die "missing COMPOSE_FILE=$COMPOSE_FILE"

BE_REF="${BE_REPO}@${EXPECTED_BACKEND_DIGEST}"
SF_REF="${SF_REPO}@${EXPECTED_STOREFRONT_DIGEST}"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"

# Collect targets
TARGETS=("$ENV_FILE")
[[ "$UPDATE_PINS" == "1" && -f "$PINS_FILE" ]] && TARGETS+=("$PINS_FILE")
[[ "$UPDATE_ACTIVE_PUBLIC" == "1" && -f "$ACTIVE_PUBLIC_FILE" ]] && TARGETS+=("$ACTIVE_PUBLIC_FILE")
[[ "$UPDATE_ACTIVE_PUBLIC" == "1" && -f "$PUBLIC_DEMO_FILE" ]] && TARGETS+=("$PUBLIC_DEMO_FILE")

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
    die "blocked_root_env_write: need sudo -n for one or more targets"
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
  command -v docker >/dev/null || die "docker required for live match"
  python3 - "$BACKEND_CONTAINER" "$STOREFRONT_CONTAINER" "$EXPECTED_RELEASE_SHA" "$EXPECTED_BACKEND_DIGEST" "$EXPECTED_STOREFRONT_DIGEST" <<'PY'
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
    for name, key_full, key_short in (
        (be_name, "backend_container_id", None),
        (sf_name, "storefront_container_id", None),
    ):
        r=subprocess.run(["docker","inspect","-f","{{.Id}}",name],capture_output=True,text=True)
        if r.returncode==0:
            full=r.stdout.strip()
            doc[key_full]=full
except Exception:
    pass
doc["generated_at"]=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
doc["note"]=f"reconciled image pins to live {sha[:12]} digests; compose/env/ACTIVE_PUBLIC aligned"
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

assert_live_match

TMP_ENV="$(mktemp)"
TMP_PINS="$(mktemp)"
TMP_AP="$(mktemp)"
cleanup() { rm -f "$TMP_ENV" "$TMP_PINS" "$TMP_AP"; }
trap cleanup EXIT

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

if [[ "$APPLY" != "1" ]]; then
  log "dry_run_complete; set APPLY=1 to write"
  exit 0
fi

# Backups for every target before any mutation
declare -a BACKED=()
for t in "${TARGETS[@]}"; do
  base="$(basename "$t")"
  bak="$BACKUP_DIR/${base}.pre-apply-$TS"
  run_priv cp -a "$t" "$bak"
  BACKED+=("$t|$bak")
done
log "backup_dir=$BACKUP_DIR"

restore_all() {
  log "restoring_all_targets"
  local pair dest bak
  for pair in "${BACKED[@]}"; do
    dest="${pair%%|*}"
    bak="${pair#*|}"
    atomic_install "$bak" "$dest" || true
  done
}

# Install all staged files; rollback everything on any failure
if ! atomic_install "$TMP_ENV" "$ENV_FILE"; then
  restore_all
  die "failed installing .env"
fi
if ! validate_env_pins "$ENV_FILE"; then
  restore_all
  die "post-install .env validation failed"
fi

if [[ "$UPDATE_PINS" == "1" && -f "$PINS_FILE" ]]; then
  if ! atomic_install "$TMP_PINS" "$PINS_FILE"; then
    restore_all
    die "failed installing pins"
  fi
  if ! validate_env_pins "$PINS_FILE"; then
    restore_all
    die "post-install pins validation failed"
  fi
fi

if [[ "$UPDATE_ACTIVE_PUBLIC" == "1" && -f "$ACTIVE_PUBLIC_FILE" ]]; then
  if ! atomic_install "$TMP_AP" "$ACTIVE_PUBLIC_FILE"; then
    restore_all
    die "failed installing ACTIVE_PUBLIC"
  fi
  if [[ -f "$PUBLIC_DEMO_FILE" ]]; then
    if ! atomic_install "$TMP_AP" "$PUBLIC_DEMO_FILE"; then
      restore_all
      die "failed installing public-demo.json"
    fi
  fi
fi

if [[ "$SKIP_COMPOSE_VALIDATE" == "1" ]]; then
  log "compose_validate=skipped"
else
  if ! COMPOSE_IMAGES="$(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" config --images)"; then
    restore_all
    die "docker compose config failed"
  fi
  if ! echo "$COMPOSE_IMAGES" | grep -F "${EXPECTED_BACKEND_DIGEST#sha256:}" >/dev/null && \
     ! echo "$COMPOSE_IMAGES" | grep -F "$EXPECTED_BACKEND_DIGEST" >/dev/null; then
    restore_all
    die "compose config did not resolve backend digest"
  fi
  if ! echo "$COMPOSE_IMAGES" | grep -F "${EXPECTED_STOREFRONT_DIGEST#sha256:}" >/dev/null && \
     ! echo "$COMPOSE_IMAGES" | grep -F "$EXPECTED_STOREFRONT_DIGEST" >/dev/null; then
    restore_all
    die "compose config did not resolve storefront digest"
  fi
  if echo "$COMPOSE_IMAGES" | grep -E '5243c7c8f1146c2832af7093f1a98f4f8c4f8e5039f733d406d9571c9c657fe8|034db9486b9be45e282f543f7f26cbeb862a38b1282218bd0528831a44cf0828' >/dev/null; then
    restore_all
    die "stale digests still present in compose config"
  fi
  log "compose_resolved_ok"
fi

log "apply_complete"
