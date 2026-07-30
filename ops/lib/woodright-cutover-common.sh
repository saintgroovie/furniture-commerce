#!/usr/bin/env bash
# Shared helpers for public_demo (staging) digest cutover tooling.
# No secrets. Fail-closed identity and digest validation.
# shellcheck shell=bash

: "${WOODRIGHT_DOCKER_BIN:=docker}"

WR_SHA_RE='^[0-9a-f]{40}$'
WR_DIGEST_RE='^sha256:[0-9a-f]{64}$'
WR_CONFIRM_TOKEN='I_UNDERSTAND_PUBLIC_DEMO_CUTOVER'

wr_cutover_log() {
  printf '%s wr_cutover %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2
}

wr_cutover_die() {
  wr_cutover_log "ERROR: $*"
  return 1
}

wr_cutover_require_full_sha() {
  local sha="${1:-}"
  [[ "$sha" =~ $WR_SHA_RE ]] || {
    wr_cutover_die "target SHA must be full 40-hex (got '${sha:-empty}')"
    return 1
  }
}

wr_cutover_require_digest() {
  local d="${1:-}"
  [[ "$d" =~ $WR_DIGEST_RE ]] || {
    wr_cutover_die "digest must be sha256:<64hex> (got '${d:-empty}')"
    return 1
  }
  case "$d" in
    *latest*|*mutable*|*:*:* ) wr_cutover_die "refused mutable/non-digest form: $d"; return 1 ;;
  esac
}

wr_cutover_require_image_at_digest() {
  local image="${1:-}"
  local digest="${2:-}"
  wr_cutover_require_digest "$digest" || return 1
  [[ "$image" == *"@${digest}" ]] || {
    wr_cutover_die "IMAGE must end with @${digest}"
    return 1
  }
  case "$image" in
    *:latest|*:main|*:staging|*mutable-sha*)
      wr_cutover_die "refused mutable tag in IMAGE=$image"
      return 1
      ;;
  esac
}

wr_cutover_refuse_production_name() {
  local name="${1:-}"
  case "$name" in
    *production*|woodright-production-*|*woodright.ru*)
      wr_cutover_die "refused production-like name: $name"
      return 1
      ;;
  esac
}

wr_cutover_require_confirm() {
  local token="${1:-}"
  [[ "$token" == "$WR_CONFIRM_TOKEN" ]] || {
    wr_cutover_die "mutation requires --confirm-mutation=${WR_CONFIRM_TOKEN}"
    return 1
  }
}

wr_cutover_evidence_init() {
  local root="${1:?}"
  local mode="${2:-unknown}"
  [[ "$root" == /* ]] || {
    wr_cutover_die "evidence root must be absolute: $root"
    return 1
  }
  case "$root" in
    */.git/*|*/node_modules/*)
      wr_cutover_die "evidence root refused under VCS/deps: $root"
      return 1
      ;;
  esac
  # Refuse evidence inside a git worktree (check ancestors before mkdir)
  if command -v git >/dev/null 2>&1; then
    local probe="$root"
    while [[ "$probe" != "/" ]]; do
      if [[ -e "$probe/.git" ]]; then
        wr_cutover_die "evidence root must be outside git worktree: $root"
        return 1
      fi
      if [[ -d "$probe" ]] && git -C "$probe" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        wr_cutover_die "evidence root must be outside git worktree: $root"
        return 1
      fi
      probe="$(dirname "$probe")"
    done
  fi
  umask 077
  mkdir -p "$root/raw" "$root/json" "$root/sanitized"
  printf '%s\n' "$mode" >"$root/mode.txt"
  date -u +%Y-%m-%dT%H:%M:%SZ >"$root/started_at_utc.txt"
  {
    echo "{"
    echo "  \"mode\": $(printf '%s' "$mode" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),"
    echo "  \"started_at_utc\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
    echo "  \"hostname\": $(hostname 2>/dev/null | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))' || echo '\"unknown\"'),"
    echo "  \"user\": $(id -un | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))')"
    echo "}"
  } >"$root/json/metadata.json"
}

wr_cutover_sanitize_inspect_json() {
  # stdin: docker inspect JSON array/object → stdout: Env values redacted to ***
  python3 - <<'PY'
import json,sys
raw=sys.stdin.read()
try:
  data=json.loads(raw)
except Exception as e:
  print(json.dumps({"error":"inspect_parse_failed","detail":str(e)}))
  sys.exit(0)

def redact_env(env):
  out=[]
  for item in env or []:
    if isinstance(item,str) and "=" in item:
      k,_=item.split("=",1)
      out.append(f"{k}=***")
    else:
      out.append("***")
  return out

def walk(obj):
  if isinstance(obj, list):
    return [walk(x) for x in obj]
  if isinstance(obj, dict):
    n={}
    for k,v in obj.items():
      if k in ("Env","env") and isinstance(v, list):
        n[k]=redact_env(v)
      elif k.lower() in ("password","secret","token","authorization","cookie"):
        n[k]="***"
      else:
        n[k]=walk(v)
    return n
  return obj

print(json.dumps(walk(data), indent=2, sort_keys=True))
PY
}

wr_cutover_write_json() {
  local path="${1:?}"
  local json="${2:?}"
  umask 077
  printf '%s\n' "$json" >"$path"
}

wr_cutover_assert_no_secret_leak() {
  local path="${1:?}"
  # Fail if common secret value patterns appear (tests inject MOCK_SECRET_VALUE)
  if grep -E 'MOCK_SECRET_VALUE|BEGIN (RSA |OPENSSH )?PRIVATE KEY|ghp_[A-Za-z0-9]{20,}' "$path" >/dev/null 2>&1; then
    wr_cutover_die "secret-like material found in $path"
    return 1
  fi
}

wr_cutover_docker() {
  command "$WOODRIGHT_DOCKER_BIN" "$@"
}

wr_cutover_image_revision_label() {
  local image="${1:?}"
  wr_cutover_docker image inspect "$image" \
    --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null || true
}

wr_cutover_assert_image_revision() {
  local image="${1:?}"
  local expect_sha="${2:?}"
  local got
  got="$(wr_cutover_image_revision_label "$image")"
  [[ -n "$got" ]] || {
    wr_cutover_die "missing org.opencontainers.image.revision on $image"
    return 1
  }
  [[ "$got" == "$expect_sha" ]] || {
    wr_cutover_die "image revision mismatch want=$expect_sha have=$got"
    return 1
  }
}

wr_cutover_pin_backup() {
  local evidence="${1:?}"
  local pins="${2:-/srv/woodright/runtime-identity/DOKPLOY_IMAGE_PINS.env}"
  local active="${3:-/srv/woodright/runtime-identity/ACTIVE_PUBLIC.json}"
  umask 077
  mkdir -p "$evidence/pin-backup"
  if [[ -f "$pins" ]]; then
    cp -p "$pins" "$evidence/pin-backup/DOKPLOY_IMAGE_PINS.env" || return 1
    # checksum of pin file (contents may contain digests only - still ok)
    if command -v shasum >/dev/null 2>&1; then
      shasum -a 256 "$pins" >"$evidence/pin-backup/DOKPLOY_IMAGE_PINS.env.sha256"
    elif command -v sha256sum >/dev/null 2>&1; then
      sha256sum "$pins" >"$evidence/pin-backup/DOKPLOY_IMAGE_PINS.env.sha256"
    fi
  fi
  if [[ -f "$active" ]]; then
    cp -p "$active" "$evidence/pin-backup/ACTIVE_PUBLIC.json" || return 1
  fi
}

wr_cutover_atomic_write() {
  local dest="${1:?}"
  local content="${2:?}"
  local dir tmp
  dir="$(dirname "$dest")"
  [[ -d "$dir" ]] || {
    wr_cutover_die "atomic write dest dir missing: $dir"
    return 1
  }
  tmp="$(mktemp "${dir}/.wr-cutover-XXXXXX")"
  printf '%s' "$content" >"$tmp"
  mv -f "$tmp" "$dest"
}
