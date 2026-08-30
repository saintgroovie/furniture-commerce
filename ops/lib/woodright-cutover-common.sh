#!/usr/bin/env bash
# Shared helpers for public_demo (staging) digest cutover tooling.
# No secrets. Fail-closed identity and digest validation.
# shellcheck shell=bash

: "${WOODRIGHT_DOCKER_BIN:=docker}"
_WR_CUTOVER_COMMON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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

# Target env runtime identity must equal --target-sha (and therefore OCI revision)
# BEFORE any live mutation. Owner confirm does not bypass this gate.
wr_public_demo_target_env_py() {
  printf '%s\n' "${_WR_CUTOVER_COMMON_DIR}/woodright-public-demo-target-env.py"
}

wr_public_demo_assert_target_env_release_identity() {
  local target_sha="${1:-}"
  local be_env="${2:-}"
  local sf_env="${3:-}"
  wr_cutover_require_full_sha "$target_sha" || return 1
  [[ -n "$be_env" && -n "$sf_env" ]] || {
    wr_cutover_die "TARGET_ENV_RELEASE_SHA_MISMATCH missing backend/storefront env paths"
    return 1
  }
  if ! python3 "$(wr_public_demo_target_env_py)" validate-pair \
    --target-sha "$target_sha" \
    --backend-env "$be_env" \
    --storefront-env "$sf_env"; then
    wr_cutover_log "TARGET_ENV_RELEASE_SHA_MISMATCH"
    return 1
  fi
  wr_cutover_log "TARGET_ENV_IDENTITY_OK sha=$target_sha"
  return 0
}

wr_public_demo_env_file_sha256() {
  python3 "$(wr_public_demo_target_env_py)" hash --env-file "$1"
}

wr_public_demo_snapshot_env_cas() {
  local src="${1:-}" dest="${2:-}" expected="${3:-}"
  [[ -n "$src" && -n "$dest" ]] || {
    wr_cutover_die "TARGET_ENV_SOURCE_CAS missing snapshot paths"
    return 1
  }
  if [[ -n "$expected" ]]; then
    python3 "$(wr_public_demo_target_env_py)" snapshot --source "$src" --dest "$dest" --source-sha256 "$expected"
  else
    python3 "$(wr_public_demo_target_env_py)" snapshot --source "$src" --dest "$dest"
  fi
}

wr_public_demo_assert_env_cas_hash() {
  local env_file="${1:-}" expected="${2:-}"
  [[ -n "$env_file" && -n "$expected" ]] || {
    wr_cutover_die "TARGET_ENV_SOURCE_CAS missing hash"
    return 1
  }
  python3 "$(wr_public_demo_target_env_py)" assert-hash --env-file "$env_file" --sha256 "$expected" >/dev/null
}

wr_public_demo_bind_env_cas_for_create() {
  # Snapshot validated env to evidence cas-env/<component>.env; rebind caller ENV_FILE.
  # Requires ENV_PRELOCK_SHA256 and an evidence directory. Fails closed on drift.
  local component="${1:-}"
  local cas_dir="${WOODRIGHT_CUTOVER_EVIDENCE_DIR:-${EVIDENCE_DIR:-}}"
  [[ -n "$component" && -n "${ENV_FILE:-}" && -n "${ENV_PRELOCK_SHA256:-}" ]] || {
    wr_cutover_die "TARGET_ENV_SOURCE_CAS missing component/env/prelock hash"
    return 1
  }
  [[ -n "$cas_dir" ]] || {
    wr_cutover_die "TARGET_ENV_CAS_DIR_REQUIRED"
    return 1
  }
  mkdir -p "$cas_dir/cas-env"
  chmod 700 "$cas_dir/cas-env" 2>/dev/null || true
  local dest="$cas_dir/cas-env/${component}.env"
  wr_public_demo_snapshot_env_cas "$ENV_FILE" "$dest" "$ENV_PRELOCK_SHA256" >/dev/null || return 1
  ENV_FILE="$dest"
  ENV_CAS_SHA256="$(wr_public_demo_env_file_sha256 "$ENV_FILE")" || return 1
  [[ "$ENV_CAS_SHA256" == "$ENV_PRELOCK_SHA256" ]] || {
    wr_cutover_die "TARGET_ENV_SOURCE_CAS snapshot hash mismatch"
    return 1
  }
  wr_cutover_log "TARGET_ENV_CAS_OK component=$component sha256=$ENV_CAS_SHA256"
}

wr_public_demo_docker_create_sealed_env() {
  local component="${1:-}"
  shift || true
  [[ -n "$component" && -n "${ENV_FILE:-}" && -n "${ENV_CAS_SHA256:-}" && -n "${TARGET_SHA:-}" ]] || {
    wr_cutover_die "TARGET_ENV_SOURCE_CAS missing sealed create args"
    return 1
  }
  python3 "$(wr_public_demo_target_env_py)" docker-create \
    --env-file "$ENV_FILE" \
    --expected-sha256 "$ENV_CAS_SHA256" \
    --target-sha "$TARGET_SHA" \
    --component "$component" \
    -- \
    "$@"
}

wr_public_demo_assert_one_target_env_release_identity() {
  local target_sha="${1:-}"
  local env_file="${2:-}"
  local component="${3:-}"
  wr_cutover_require_full_sha "$target_sha" || return 1
  [[ -n "$env_file" && -n "$component" ]] || {
    wr_cutover_die "TARGET_ENV_RELEASE_SHA_MISMATCH missing env path/component"
    return 1
  }
  if ! python3 "$(wr_public_demo_target_env_py)" validate \
    --target-sha "$target_sha" \
    --env-file "$env_file" \
    --component "$component"; then
    wr_cutover_log "TARGET_ENV_RELEASE_SHA_MISMATCH component=$component"
    return 1
  fi
  return 0
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

# Generic confirm-token comparison for helpers that own a different token than
# the public_demo one above (e.g. the private production-candidate cutover).
# Does not relax wr_cutover_require_confirm / WR_CONFIRM_TOKEN.
wr_cutover_require_confirm_token() {
  local expected="${1:-}"
  local actual="${2:-}"
  [[ -n "$expected" ]] || {
    wr_cutover_die "confirm token contract missing an expected value"
    return 1
  }
  [[ "$actual" == "$expected" ]] || {
    wr_cutover_die "mutation requires --confirm-mutation ${expected}"
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
  # IMPORTANT: must not use a heredoc as python's program source - that steals stdin
  # from the inspect pipe and yields inspect_parse_failed / empty digests.
  python3 -c '
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
'
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

wr_cutover_install_file() {
  # Atomic same-directory install: stage sibling temp, then rename onto dest.
  # Use sudo -n when dest (or parent) is not writable, matching pin reconciler.
  local src="${1:?}"
  local dest="${2:?}"
  local dir tmp
  [[ -f "$src" ]] || return 1
  dir="$(dirname "$dest")"
  tmp="${dir}/.$(basename "$dest").wr-install.$$"
  _wr_cutover_copy() {
    local from="$1" to="$2"
    if [[ -w "$(dirname "$to")" && ( ! -e "$to" || -w "$to" ) ]]; then
      cp -p "$from" "$to"
      return $?
    fi
    if command -v sudo >/dev/null 2>&1; then
      sudo -n cp -p "$from" "$to"
      return $?
    fi
    return 1
  }
  _wr_cutover_mv() {
    local from="$1" to="$2"
    if [[ -w "$(dirname "$to")" && ( ! -e "$to" || -w "$to" ) ]]; then
      mv -f "$from" "$to"
      return $?
    fi
    if command -v sudo >/dev/null 2>&1; then
      sudo -n mv -f "$from" "$to"
      return $?
    fi
    return 1
  }
  if ! _wr_cutover_copy "$src" "$tmp"; then
    rm -f "$tmp" 2>/dev/null || sudo -n rm -f "$tmp" 2>/dev/null || true
    wr_cutover_die "cannot stage $dest (need writable path or sudo -n)"
    return 1
  fi
  if ! _wr_cutover_mv "$tmp" "$dest"; then
    rm -f "$tmp" 2>/dev/null || sudo -n rm -f "$tmp" 2>/dev/null || true
    wr_cutover_die "cannot atomically install $dest"
    return 1
  fi
  return 0
}

wr_cutover_test_path_overrides() {
  [[ "${WOODRIGHT_PIN_RECONCILE_ALLOW_TEST_LOCK:-}" == "1" \
    || "${WOODRIGHT_CUTOVER_ALLOW_TEST_PATHS:-0}" == "1" ]]
}

wr_cutover_pin_paths() {
  # Canonical pin/config SoT destinations — environment-scoped via profile when loaded.
  # Test harness may override WOODRIGHT_CUTOVER_* only with WOODRIGHT_CUTOVER_ALLOW_TEST_PATHS=1
  # or WOODRIGHT_PIN_RECONCILE_ALLOW_TEST_LOCK=1. Never default to shared legacy root.
  local identity_dir="${WOODRIGHT_IDENTITY_DIR:-/srv/woodright/runtime-identity-public-demo}"
  WOODRIGHT_CUTOVER_PINS_ENV="${WOODRIGHT_CUTOVER_PINS_ENV:-${identity_dir}/DOKPLOY_IMAGE_PINS.env}"
  WOODRIGHT_CUTOVER_ACTIVE_PUBLIC="${WOODRIGHT_CUTOVER_ACTIVE_PUBLIC:-${WOODRIGHT_ACTIVE_PUBLIC:-${identity_dir}/ACTIVE_PUBLIC.json}}"
  WOODRIGHT_CUTOVER_PUBLIC_DEMO_JSON="${WOODRIGHT_CUTOVER_PUBLIC_DEMO_JSON:-${WOODRIGHT_PUBLIC_DEMO_FILE:-${identity_dir}/public-demo.json}}"
  WOODRIGHT_CUTOVER_COMPOSE_ENV="${WOODRIGHT_CUTOVER_COMPOSE_ENV:-${WOODRIGHT_COMPOSE_ENV_FILE:-/etc/dokploy/compose/woodright-stack-3dsdhd/code/.env}}"
  local ownership_dir="${WOODRIGHT_OWNERSHIP_DIR:-/srv/woodright/runtime-ownership-public-demo}"
  local canonical_owner="${WOODRIGHT_ACTIVE_OWNER:-${ownership_dir}/ACTIVE_OWNER.json}"
  local canonical_expected="${WOODRIGHT_EXPECTED_RELEASE:-${ownership_dir}/EXPECTED_RELEASE.json}"
  if wr_cutover_test_path_overrides; then
    WOODRIGHT_CUTOVER_ACTIVE_OWNER="${WOODRIGHT_CUTOVER_ACTIVE_OWNER:-$canonical_owner}"
    WOODRIGHT_CUTOVER_EXPECTED_RELEASE="${WOODRIGHT_CUTOVER_EXPECTED_RELEASE:-$canonical_expected}"
  else
    if [[ -n "${WOODRIGHT_CUTOVER_ACTIVE_OWNER:-}" && "$WOODRIGHT_CUTOVER_ACTIVE_OWNER" != "$canonical_owner" ]]; then
      wr_cutover_die "WOODRIGHT_CUTOVER_ACTIVE_OWNER override refused outside test mode (got=$WOODRIGHT_CUTOVER_ACTIVE_OWNER want=$canonical_owner)"
      return 1
    fi
    if [[ -n "${WOODRIGHT_CUTOVER_EXPECTED_RELEASE:-}" && "$WOODRIGHT_CUTOVER_EXPECTED_RELEASE" != "$canonical_expected" ]]; then
      wr_cutover_die "WOODRIGHT_CUTOVER_EXPECTED_RELEASE override refused outside test mode (got=$WOODRIGHT_CUTOVER_EXPECTED_RELEASE want=$canonical_expected)"
      return 1
    fi
    WOODRIGHT_CUTOVER_ACTIVE_OWNER="$canonical_owner"
    WOODRIGHT_CUTOVER_EXPECTED_RELEASE="$canonical_expected"
  fi
  if [[ "${WOODRIGHT_ENV_PROFILE_LOADED:-0}" == "1" ]] && declare -F wr_assert_manifest_path_for_environment >/dev/null; then
    wr_assert_manifest_path_for_environment "$WOODRIGHT_CUTOVER_ACTIVE_OWNER" \
      || { wr_cutover_die "ACTIVE_OWNER path outside environment ownership dir"; return 1; }
    wr_assert_manifest_path_for_environment "$WOODRIGHT_CUTOVER_EXPECTED_RELEASE" \
      || { wr_cutover_die "EXPECTED_RELEASE path outside environment ownership dir"; return 1; }
  fi
}

wr_cutover_pair_rollback() {
  # Orchestrated pair rollback: BE keeper + SF keeper + pin/config SoT restore.
  # Args: evidence_dir be_keep sf_keep rollback_be_script rollback_sf_script
  # Optional env pin destinations via wr_cutover_pin_paths.
  # Sets ROLLBACK_RC: 10=ok 11=partial 12=failed. Returns that code.
  local evidence="${1:?}"
  local be_keep="${2:-}"
  local sf_keep="${3:-}"
  local be_rb="${4:?}"
  local sf_rb="${5:?}"
  local be_ok=0 sf_ok=0 pin_ok=0
  local env_name="${WOODRIGHT_ENVIRONMENT:-public_demo}"
  wr_cutover_pin_paths || return 1
  mkdir -p "$evidence/json"
  wr_cutover_log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
  wr_cutover_log "PAIR_ROLLBACK begin"
  if [[ -n "$be_keep" ]] && wr_cutover_docker inspect "$be_keep" >/dev/null 2>&1; then
    bash "$be_rb" --environment "$env_name" --keep-name "$be_keep" --evidence-dir "$evidence" \
      && be_ok=1 || be_ok=0
  else
    be_ok=1
    wr_cutover_log "no BE keeper to restore"
  fi
  if [[ -n "$sf_keep" ]] && wr_cutover_docker inspect "$sf_keep" >/dev/null 2>&1; then
    bash "$sf_rb" --environment "$env_name" --keep-name "$sf_keep" --evidence-dir "$evidence" \
      && sf_ok=1 || sf_ok=0
  else
    # No SF keeper ⇒ storefront must still be the pre-cutover live (common: BE failed before SF recreate).
    sf_ok=1
    wr_cutover_log "no SF keeper to restore - verifying live storefront unchanged"
    if wr_cutover_docker inspect "${WOODRIGHT_SF_CONTAINER_DEFAULT:-woodright-staging-storefront}" >/dev/null 2>&1; then
      if wr_cutover_resolve_container_image_identity \
        "${WOODRIGHT_SF_CONTAINER_DEFAULT:-woodright-staging-storefront}" storefront; then
        printf '{"storefront_unchanged":true,"repo_digest":"%s","release_sha":"%s"}\n' \
          "$WR_CUTOVER_REPO_DIGEST" "${WR_CUTOVER_RELEASE_SHA:-}" \
          >"$evidence/json/storefront-unchanged-after-rollback.json" || true
        if [[ -n "${WOODRIGHT_ROLLBACK_EXPECT_SF_DIGEST:-}" && \
              "$WR_CUTOVER_REPO_DIGEST" != "${WOODRIGHT_ROLLBACK_EXPECT_SF_DIGEST}" ]]; then
          wr_cutover_log "ERROR: storefront digest drifted during BE-only rollback have=$WR_CUTOVER_REPO_DIGEST want=$WOODRIGHT_ROLLBACK_EXPECT_SF_DIGEST"
          sf_ok=0
        fi
      else
        wr_cutover_log "ERROR: cannot resolve live storefront digest after BE-only rollback"
        sf_ok=0
      fi
    else
      wr_cutover_log "ERROR: live storefront missing after BE-only rollback"
      sf_ok=0
    fi
  fi
  if [[ -f "$evidence/pin-backup/DOKPLOY_IMAGE_PINS.env" ]]; then
    wr_cutover_install_file "$evidence/pin-backup/DOKPLOY_IMAGE_PINS.env" \
      "$WOODRIGHT_CUTOVER_PINS_ENV" && pin_ok=1 || pin_ok=0
  else
    pin_ok=1
  fi
  if [[ -f "$evidence/pin-backup/ACTIVE_PUBLIC.json" ]]; then
    wr_cutover_install_file "$evidence/pin-backup/ACTIVE_PUBLIC.json" \
      "$WOODRIGHT_CUTOVER_ACTIVE_PUBLIC" || pin_ok=0
  fi
  if [[ -f "$evidence/pin-backup/public-demo.json" ]]; then
    wr_cutover_install_file "$evidence/pin-backup/public-demo.json" \
      "$WOODRIGHT_CUTOVER_PUBLIC_DEMO_JSON" || pin_ok=0
  fi
  if [[ -f "$evidence/pin-backup/dokploy-compose.env" ]]; then
    wr_cutover_install_file "$evidence/pin-backup/dokploy-compose.env" \
      "$WOODRIGHT_CUTOVER_COMPOSE_ENV" || pin_ok=0
  fi
  if [[ -f "$evidence/pin-backup/ACTIVE_OWNER.json" ]]; then
    wr_cutover_install_file "$evidence/pin-backup/ACTIVE_OWNER.json" \
      "$WOODRIGHT_CUTOVER_ACTIVE_OWNER" || pin_ok=0
  fi
  if [[ -f "$evidence/pin-backup/EXPECTED_RELEASE.json" ]]; then
    wr_cutover_install_file "$evidence/pin-backup/EXPECTED_RELEASE.json" \
      "$WOODRIGHT_CUTOVER_EXPECTED_RELEASE" || pin_ok=0
  fi
  printf '{"backend":%s,"storefront":%s,"pins":%s}\n' "$be_ok" "$sf_ok" "$pin_ok" \
    >"$evidence/json/pair-rollback-result.json"
  local endpoint_ok=1
  WOODRIGHT_PUBLIC_DEMO_RESTORE_ENDPOINTS=1
  if ! wr_public_demo_restore_traefik_hostnames; then
    endpoint_ok=0
    wr_cutover_log "ERROR: Traefik hostname restore failed after pair rollback"
  fi
  if [[ "$be_ok" -eq 1 && "$sf_ok" -eq 1 && "$pin_ok" -eq 1 && "$endpoint_ok" -eq 1 ]]; then
    ROLLBACK_RC=10
    wr_cutover_log "PAIR_ROLLBACK_OK"
  elif [[ "$be_ok" -eq 1 || "$sf_ok" -eq 1 ]]; then
    ROLLBACK_RC=11
    wr_cutover_log "PAIR_ROLLBACK_PARTIAL"
  else
    ROLLBACK_RC=12
    wr_cutover_log "PAIR_ROLLBACK_FAILED"
  fi
  return "$ROLLBACK_RC"
}

wr_cutover_pin_backup() {
  local evidence="${1:?}"
  wr_cutover_pin_paths || return 1
  local pins="${2:-$WOODRIGHT_CUTOVER_PINS_ENV}"
  local active="${3:-$WOODRIGHT_CUTOVER_ACTIVE_PUBLIC}"
  local public_demo="${4:-$WOODRIGHT_CUTOVER_PUBLIC_DEMO_JSON}"
  local compose_env="${5:-$WOODRIGHT_CUTOVER_COMPOSE_ENV}"
  local active_owner="${6:-$WOODRIGHT_CUTOVER_ACTIVE_OWNER}"
  local expected_release="${7:-$WOODRIGHT_CUTOVER_EXPECTED_RELEASE}"
  umask 077
  mkdir -p "$evidence/pin-backup"
  if [[ -f "$pins" ]]; then
    # Evidence dir is operator-writable; read source with sudo if needed
    if [[ -r "$pins" ]]; then
      cp -p "$pins" "$evidence/pin-backup/DOKPLOY_IMAGE_PINS.env" || return 1
    elif command -v sudo >/dev/null 2>&1; then
      sudo -n cp -p "$pins" "$evidence/pin-backup/DOKPLOY_IMAGE_PINS.env" || return 1
    else
      return 1
    fi
    if command -v shasum >/dev/null 2>&1; then
      shasum -a 256 "$evidence/pin-backup/DOKPLOY_IMAGE_PINS.env" >"$evidence/pin-backup/DOKPLOY_IMAGE_PINS.env.sha256"
    elif command -v sha256sum >/dev/null 2>&1; then
      sha256sum "$evidence/pin-backup/DOKPLOY_IMAGE_PINS.env" >"$evidence/pin-backup/DOKPLOY_IMAGE_PINS.env.sha256"
    fi
  fi
  for pair in \
    "$active:ACTIVE_PUBLIC.json" \
    "$public_demo:public-demo.json" \
    "$compose_env:dokploy-compose.env" \
    "$active_owner:ACTIVE_OWNER.json" \
    "$expected_release:EXPECTED_RELEASE.json"
  do
    local src="${pair%%:*}"
    local name="${pair##*:}"
    [[ -f "$src" ]] || continue
    if [[ -r "$src" ]]; then
      cp -p "$src" "$evidence/pin-backup/$name" || return 1
    elif command -v sudo >/dev/null 2>&1; then
      sudo -n cp -p "$src" "$evidence/pin-backup/$name" || return 1
    else
      return 1
    fi
  done
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

# Expected GHCR repository (no digest/tag) for public_demo components.
wr_cutover_expected_image_repository() {
  case "${1:-}" in
    backend) printf '%s\n' "ghcr.io/saintgroovie/woodright-backend" ;;
    storefront) printf '%s\n' "ghcr.io/saintgroovie/woodright-storefront" ;;
    *)
      wr_cutover_die "unknown image component '${1:-}' (backend|storefront)"
      return 1
      ;;
  esac
}

# Resolve immutable RepoDigest for a running/stopped container via image inspect.
# Never reads container .RepoDigests (absent on real docker container inspect).
# Sets:
#   WR_CUTOVER_CTR_ID WR_CUTOVER_CONFIG_IMAGE WR_CUTOVER_IMAGE_ID
#   WR_CUTOVER_REPO_DIGEST WR_CUTOVER_REPOSITORY WR_CUTOVER_REPO_DIGEST_REF
#   WR_CUTOVER_OCI_REVISION WR_CUTOVER_RELEASE_SHA
wr_cutover_resolve_container_image_identity() {
  local container="${1:?}"
  local component="${2:-}" # backend|storefront|empty
  local expect_repo="${3:-}"
  local cid config_image image_id raw_json
  local oci_rev release_sha
  local resolved

  WR_CUTOVER_CTR_ID=""
  WR_CUTOVER_CONFIG_IMAGE=""
  WR_CUTOVER_IMAGE_ID=""
  WR_CUTOVER_REPO_DIGEST=""
  WR_CUTOVER_REPOSITORY=""
  WR_CUTOVER_REPO_DIGEST_REF=""
  WR_CUTOVER_OCI_REVISION=""
  WR_CUTOVER_RELEASE_SHA=""

  if [[ -z "$expect_repo" && -n "$component" ]]; then
    expect_repo="$(wr_cutover_expected_image_repository "$component")" || return 1
  fi
  [[ -n "$expect_repo" ]] || {
    wr_cutover_die "expected repository required for container image identity ($container)"
    return 1
  }
  case "$expect_repo" in
    *:latest|*@*|*" "*) wr_cutover_die "invalid expect_repo='$expect_repo'"; return 1 ;;
  esac

  wr_cutover_docker inspect "$container" >/dev/null 2>&1 || {
    wr_cutover_die "container missing: $container"
    return 1
  }

  cid="$(wr_cutover_docker inspect "$container" --format '{{.Id}}')"
  config_image="$(wr_cutover_docker inspect "$container" --format '{{.Config.Image}}')"
  image_id="$(wr_cutover_docker inspect "$container" --format '{{.Image}}')"
  oci_rev="$(wr_cutover_docker inspect "$container" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null || true)"
  release_sha="$(wr_cutover_docker inspect "$container" --format '{{index .Config.Labels "com.woodright.release-sha"}}' 2>/dev/null || true)"
  [[ -n "$cid" && -n "$image_id" ]] || {
    wr_cutover_die "container inspect incomplete for $container"
    return 1
  }

  if [[ -n "$config_image" ]]; then
    case "$config_image" in
      *:latest|*:main|*:staging)
        wr_cutover_die "refused tag-only Config.Image on $container: $config_image"
        return 1
        ;;
    esac
  fi

  raw_json=""
  if ! raw_json="$(wr_cutover_docker image inspect "$image_id" 2>/dev/null)"; then
    if [[ -n "$config_image" ]] && raw_json="$(wr_cutover_docker image inspect "$config_image" 2>/dev/null)"; then
      :
    else
      wr_cutover_die "image missing for container=$container image_id=$image_id config_image=${config_image:-empty}"
      return 1
    fi
  fi

  resolved="$(
    EXPECT_REPO="$expect_repo" python3 -c '
import json, os, re, sys
raw = sys.stdin.read()
expect = os.environ["EXPECT_REPO"]
try:
  docs = json.loads(raw)
except Exception:
  sys.stderr.write("image_inspect_parse_failed\n")
  sys.exit(2)
if isinstance(docs, dict):
  docs = [docs]
if not docs:
  sys.stderr.write("empty_image_inspect\n")
  sys.exit(2)
digests = docs[0].get("RepoDigests") or []
if not isinstance(digests, list):
  digests = []
matched = []
pat = re.compile(r"^" + re.escape(expect) + r"@(sha256:[0-9a-f]{64})$")
for d in digests:
  if isinstance(d, str):
    m = pat.match(d)
    if m:
      matched.append((m.group(1), d))
if len(matched) == 0:
  sys.stderr.write("no_matching_RepoDigest expect=%s have=%s\n" % (expect, json.dumps(digests)))
  sys.exit(3)
if len(matched) > 1:
  sys.stderr.write("ambiguous_RepoDigest expect=%s matches=%s\n" % (expect, json.dumps([x[1] for x in matched])))
  sys.exit(4)
digest_hex, ref = matched[0]
labels = ((docs[0].get("Config") or {}).get("Labels")) or {}
oci = labels.get("org.opencontainers.image.revision") or ""
# digest|ref|repo|oci
sys.stdout.write("%s\t%s\t%s\t%s\n" % (digest_hex, ref, expect, oci))
' <<<"$raw_json"
  )" || {
    wr_cutover_die "RepoDigest resolve failed for $container (expect_repo=$expect_repo)"
    return 1
  }

  local digest_hex repo_digest_ref repository img_oci
  IFS=$'\t' read -r digest_hex repo_digest_ref repository img_oci <<<"$resolved"
  [[ "$digest_hex" =~ $WR_DIGEST_RE ]] || {
    wr_cutover_die "resolved digest invalid for $container got='${digest_hex:-empty}'"
    return 1
  }

  WR_CUTOVER_CTR_ID="$cid"
  WR_CUTOVER_CONFIG_IMAGE="$config_image"
  WR_CUTOVER_IMAGE_ID="$image_id"
  WR_CUTOVER_REPO_DIGEST="$digest_hex"
  WR_CUTOVER_REPOSITORY="$repository"
  WR_CUTOVER_REPO_DIGEST_REF="$repo_digest_ref"
  WR_CUTOVER_OCI_REVISION="${oci_rev:-${img_oci:-}}"
  if [[ "$WR_CUTOVER_OCI_REVISION" == "<no value>" ]]; then
    WR_CUTOVER_OCI_REVISION="${img_oci:-}"
  fi
  WR_CUTOVER_RELEASE_SHA="${release_sha:-}"
  if [[ "$WR_CUTOVER_RELEASE_SHA" == "<no value>" ]]; then
    WR_CUTOVER_RELEASE_SHA=""
  fi
  return 0
}

wr_cutover_container_immutable_digest() {
  local container="${1:?}"
  local component="${2:?}"
  wr_cutover_resolve_container_image_identity "$container" "$component" || return 1
  printf '%s\n' "$WR_CUTOVER_REPO_DIGEST"
}

# ---------------------------------------------------------------------------
# Public demo HTTPS edge settle
#
# Traefik/Dokploy are not retargeted by the recreate helper. After stop+rename+
# create, docker health of the new storefront can pass while
# https://woodright-demo.ru/ still serves the keeper SHA. Treat that as
# EDGE_NOT_CONVERGED (retry), not an immediate identity failure.
#
# caf82b0 storefront HTTPS does not emit an image digest header. Digest is
# asserted from the live container (caller) separately from this HTTPS settle.
# ---------------------------------------------------------------------------

wr_public_demo_edge_header_value() {
  local headers="${1:-}"
  local name="${2:-}"
  printf '%s\n' "$headers" | awk -v n="$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]')" '
    BEGIN { IGNORECASE=1 }
    {
      key=$1
      sub(/:$/, "", key)
      if (tolower(key) == n) {
        $1=""
        sub(/^[[:space:]]+/, "")
        gsub(/\r/, "")
        print
        exit
      }
    }
  '
}

# Writes headers to $2 (file). Prints HTTP status code to stdout. Never exits.
wr_public_demo_edge_http_get() {
  local url="${1:?}"
  local hdr_file="${2:?}"
  local code
  if [[ -n "${WOODRIGHT_PUBLIC_DEMO_EDGE_HTTP_GET:-}" ]]; then
    "${WOODRIGHT_PUBLIC_DEMO_EDGE_HTTP_GET}" "$url" "$hdr_file"
    return 0
  fi
  : >"$hdr_file"
  code="$(curl -sS --max-time 20 --http1.1 -D "$hdr_file" -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || true)"
  [[ -n "$code" ]] || code="000"
  printf '%s\n' "$code"
}

# Traefik 3.6.7 file-provider loadBalancer servers.url hostnames are resolved
# when the parsed service object is built. A comment-only rewrite does not change
# that object, so Traefik keeps the previous endpoint IP across stop+rename+create.
# Governed fix: write the verified dokploy-network IPv4 of the target containers
# into only the eligible public_demo service URLs, then settle HTTPS.
wr_public_demo_traefik_endpoint_py() {
  printf '%s\n' "${_WR_CUTOVER_COMMON_DIR}/woodright-public-demo-traefik-endpoint.py"
}

wr_public_demo_resolver_file() {
  printf '%s\n' "${WOODRIGHT_PUBLIC_DEMO_EDGE_RESOLVER_FILE:-/etc/dokploy/traefik/dynamic/woodright-demo.yml}"
}

wr_public_demo_resolver_file_exists() {
  local f="$1"
  [[ -f "$f" ]] && return 0
  command -v sudo >/dev/null 2>&1 || return 1
  sudo -n test -f "$f" 2>/dev/null
}

wr_public_demo_read_resolver_file() {
  local f="$1"
  if [[ -r "$f" ]]; then
    cat "$f"
    return 0
  fi
  command -v sudo >/dev/null 2>&1 || return 1
  sudo -n cat "$f"
}

_wr_public_demo_ipv4_ok() {
  local ip="$1"
  [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || return 1
  python3 -c 'import ipaddress,sys
a=ipaddress.ip_address(sys.argv[1])
sys.exit(0 if a.version==4 and a.is_private and not a.is_loopback and not a.is_unspecified and not a.is_link_local else 1)
' "$ip"
}

# Discover the Traefik-reachable IPv4 for a proven public_demo container.
# Network is WOODRIGHT_NET_DOKPLOY (dokploy-network), never "first IP".
wr_public_demo_container_dokploy_ip() {
  local name="${1:?}"
  local expect_sha="${2:?}"
  local expect_digest="${3:?}"
  local expect_id="${4:-}"
  local component="${5:?}"
  local net="${WOODRIGHT_NET_DOKPLOY:-dokploy-network}"
  local traefik="${WOODRIGHT_TRAEFIK_CONTAINER:-dokploy-traefik}"
  local id status health sha role db digest ip tf_net
  wr_cutover_require_full_sha "$expect_sha" || return 1
  wr_cutover_require_digest "$expect_digest" || return 1
  wr_cutover_docker inspect "$name" >/dev/null 2>&1 || {
    wr_cutover_die "endpoint discovery: container missing $name"
    return 1
  }
  id="$(wr_cutover_docker inspect "$name" --format '{{.Id}}')"
  if [[ -n "$expect_id" ]]; then
    case "$id" in
      "$expect_id"|"$expect_id"*) ;;
      *)
        wr_cutover_die "endpoint discovery: container id CAS drift name=$name have=$id want=$expect_id"
        return 1
        ;;
    esac
  fi
  status="$(wr_cutover_docker inspect "$name" --format '{{.State.Status}}')"
  health="$(wr_cutover_docker inspect "$name" --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}')"
  [[ "$status" == "running" ]] || {
    wr_cutover_die "endpoint discovery: not running name=$name status=$status"
    return 1
  }
  [[ "$health" == "healthy" ]] || {
    wr_cutover_die "endpoint discovery: not healthy name=$name health=${health:-empty}"
    return 1
  }
  sha="$(wr_cutover_docker inspect "$name" --format '{{index .Config.Labels "com.woodright.release-sha"}}' | tr '[:upper:]' '[:lower:]')"
  role="$(wr_cutover_docker inspect "$name" --format '{{index .Config.Labels "com.woodright.runtime-role"}}')"
  db="$(wr_cutover_docker inspect "$name" --format '{{index .Config.Labels "com.woodright.database-identity"}}')"
  [[ "$sha" == "$expect_sha" ]] || {
    wr_cutover_die "endpoint discovery: SHA mismatch name=$name have=$sha want=$expect_sha"
    return 1
  }
  [[ "$role" == "public_demo" ]] || {
    wr_cutover_die "endpoint discovery: role mismatch name=$name have=${role:-empty}"
    return 1
  }
  [[ "$db" == "public_demo_db" ]] || {
    wr_cutover_die "endpoint discovery: db mismatch name=$name have=${db:-empty}"
    return 1
  }
  digest="$(wr_cutover_container_immutable_digest "$name" "$component")" || {
    wr_cutover_die "endpoint discovery: digest resolve failed name=$name"
    return 1
  }
  [[ "$digest" == "$expect_digest" ]] || {
    wr_cutover_die "endpoint discovery: digest mismatch name=$name have=$digest want=$expect_digest"
    return 1
  }
  ip="$(wr_cutover_docker inspect "$name" --format "{{(index .NetworkSettings.Networks \"$net\").IPAddress}}")"
  if [[ -z "$ip" || "$ip" == "<no value>" ]]; then
    wr_cutover_die "endpoint discovery: missing $net IP for $name"
    return 1
  fi
  _wr_public_demo_ipv4_ok "$ip" || {
    wr_cutover_die "endpoint discovery: refused IP $ip on $net for $name"
    return 1
  }
  if [[ "${WOODRIGHT_PUBLIC_DEMO_SKIP_TRAEFIK_NET_CHECK:-0}" != "1" ]]; then
    wr_cutover_docker inspect "$traefik" >/dev/null 2>&1 || {
      wr_cutover_die "endpoint discovery: Traefik container missing $traefik"
      return 1
    }
    tf_net="$(wr_cutover_docker inspect "$traefik" --format "{{(index .NetworkSettings.Networks \"$net\").IPAddress}}")"
    if [[ -z "$tf_net" || "$tf_net" == "<no value>" ]]; then
      wr_cutover_die "endpoint discovery: Traefik $traefik is not on $net"
      return 1
    fi
  fi
  # Re-read id after inspect work to close a recycle race.
  local id2
  id2="$(wr_cutover_docker inspect "$name" --format '{{.Id}}')"
  [[ "$id2" == "$id" ]] || {
    wr_cutover_die "endpoint discovery: container id changed during inspect name=$name"
    return 1
  }
  printf '%s\n' "$ip"
}

wr_public_demo_privileged_apply_urls() {
  # Byte-preserving CAS for dest files that are not user-writable (sudo install).
  # Args: dest_file python_subcommand [extra python args...]
  # Extra args follow after dest; for rewrite they are --sf-url/--be-url.
  local dest="$1"
  local sub="$2"
  shift 2
  local py orig now newc
  py="$(wr_public_demo_traefik_endpoint_py)"
  orig="$(mktemp "${TMPDIR:-/tmp}/wr-tf-ep-orig.XXXXXX.yml")"
  now="$(mktemp "${TMPDIR:-/tmp}/wr-tf-ep-now.XXXXXX.yml")"
  newc="$(mktemp "${TMPDIR:-/tmp}/wr-tf-ep-new.XXXXXX.yml")"
  wr_public_demo_read_resolver_file "$dest" >"$orig" || {
    rm -f "$orig" "$now" "$newc"
    wr_cutover_die "cannot read $dest"
    return 1
  }
  cp "$orig" "$newc"
  if ! python3 "$py" "$sub" --file "$newc" "$@" >/dev/null; then
    rm -f "$orig" "$now" "$newc"
    wr_cutover_die "Traefik endpoint $sub refused for $dest"
    return 1
  fi
  wr_public_demo_read_resolver_file "$dest" >"$now" || {
    rm -f "$orig" "$now" "$newc"
    wr_cutover_die "cannot re-read $dest"
    return 1
  }
  if ! cmp -s "$orig" "$now"; then
    rm -f "$orig" "$now" "$newc"
    wr_cutover_log "TRAEFIK_ENDPOINT_CAS_SKIP path=$dest"
    return 1
  fi
  wr_cutover_install_file "$newc" "$dest" || {
    rm -f "$orig" "$now" "$newc"
    return 1
  }
  rm -f "$orig" "$now" "$newc"
  return 0
}

wr_public_demo_rewrite_traefik_urls() {
  local sf_url="${1:?}"
  local be_url="${2:?}"
  local f py rc json
  f="$(wr_public_demo_resolver_file)"
  py="$(wr_public_demo_traefik_endpoint_py)"
  [[ -f "$py" ]] || {
    wr_cutover_die "missing Traefik endpoint helper $py"
    return 1
  }
  wr_public_demo_resolver_file_exists "$f" || {
    wr_cutover_die "demo Traefik file missing $f"
    return 1
  }
  if [[ -w "$f" ]]; then
    set +e
    json="$(python3 "$py" rewrite --file "$f" --sf-url "$sf_url" --be-url "$be_url")"
    rc=$?
    set -e
  else
    wr_public_demo_privileged_apply_urls "$f" rewrite --sf-url "$sf_url" --be-url "$be_url" || return 1
    json='{"status":"replaced"}'
    rc=0
  fi
  if [[ "$rc" -eq 3 ]]; then
    wr_cutover_log "TRAEFIK_ENDPOINT_CAS_SKIP path=$f"
    return 1
  fi
  if [[ "$rc" -ne 0 ]]; then
    wr_cutover_log "TRAEFIK_ENDPOINT_REWRITE_REFUSED path=$f json=${json:-empty}"
    return 1
  fi
  wr_cutover_log "TRAEFIK_ENDPOINT_APPLIED path=$f sf=$sf_url be=$be_url"
  return 0
}

wr_public_demo_restore_traefik_hostnames() {
  if [[ -z "${WOODRIGHT_PUBLIC_DEMO_EDGE_RESOLVER_FILE:-}" \
    && "${WOODRIGHT_PUBLIC_DEMO_RESTORE_ENDPOINTS:-0}" != "1" ]]; then
    wr_cutover_log "TRAEFIK_ENDPOINT_RESTORE_SKIP not_enabled"
    return 0
  fi
  local f py json rc
  f="$(wr_public_demo_resolver_file)"
  py="$(wr_public_demo_traefik_endpoint_py)"
  if ! wr_public_demo_resolver_file_exists "$f"; then
    wr_cutover_log "TRAEFIK_ENDPOINT_RESTORE_SKIP missing=$f"
    return 0
  fi
  [[ -f "$py" ]] || {
    wr_cutover_die "missing Traefik endpoint helper $py"
    return 1
  }
  if [[ -w "$f" ]]; then
    set +e
    json="$(python3 "$py" restore-hostnames --file "$f")"
    rc=$?
    set -e
  else
    wr_public_demo_privileged_apply_urls "$f" restore-hostnames || return 1
    json='{"status":"replaced"}'
    rc=0
  fi
  if [[ "$rc" -eq 3 ]]; then
    wr_cutover_log "TRAEFIK_ENDPOINT_CAS_SKIP restore path=$f"
    return 1
  fi
  if [[ "$rc" -ne 0 ]]; then
    wr_cutover_log "TRAEFIK_ENDPOINT_RESTORE_REFUSED path=$f json=${json:-empty}"
    return 1
  fi
  wr_cutover_log "TRAEFIK_ENDPOINT_HOSTNAMES_RESTORED path=$f"
  return 0
}

# Pin both public_demo file-provider URLs to verified dokploy-network IPs.
wr_public_demo_apply_traefik_pair_endpoints() {
  local sf_name="${1:-${WOODRIGHT_SF_CONTAINER_DEFAULT:-woodright-staging-storefront}}"
  local sf_sha="${2:?}"
  local sf_digest="${3:?}"
  local sf_id="${4:-}"
  local be_name="${5:-${WOODRIGHT_BE_CONTAINER_DEFAULT:-woodright-staging-backend}}"
  local be_sha="${6:?}"
  local be_digest="${7:?}"
  local be_id="${8:-}"
  local sf_ip be_ip sf_id2 be_id2 sf_ip2 be_ip2 net
  net="${WOODRIGHT_NET_DOKPLOY:-dokploy-network}"
  [[ "${WOODRIGHT_PUBLIC_DEMO_APPLY_ENDPOINTS:-1}" == "1" ]] || return 0
  if [[ -z "$sf_id" ]]; then
    sf_id="$(wr_cutover_docker inspect "$sf_name" --format '{{.Id}}')" || return 1
  fi
  if [[ -z "$be_id" ]]; then
    be_id="$(wr_cutover_docker inspect "$be_name" --format '{{.Id}}')" || return 1
  fi
  sf_ip="$(wr_public_demo_container_dokploy_ip "$sf_name" "$sf_sha" "$sf_digest" "$sf_id" storefront)" || return 1
  be_ip="$(wr_public_demo_container_dokploy_ip "$be_name" "$be_sha" "$be_digest" "$be_id" backend)" || return 1
  sf_id2="$(wr_cutover_docker inspect "$sf_name" --format '{{.Id}}')" || return 1
  be_id2="$(wr_cutover_docker inspect "$be_name" --format '{{.Id}}')" || return 1
  sf_ip2="$(wr_cutover_docker inspect "$sf_name" --format "{{(index .NetworkSettings.Networks \"$net\").IPAddress}}")" || return 1
  be_ip2="$(wr_cutover_docker inspect "$be_name" --format "{{(index .NetworkSettings.Networks \"$net\").IPAddress}}")" || return 1
  if [[ "$sf_id2" != "$sf_id" || "$be_id2" != "$be_id" ]]; then
    wr_cutover_die "endpoint apply: container id changed before YAML commit"
    return 1
  fi
  if [[ "$sf_ip2" != "$sf_ip" || "$be_ip2" != "$be_ip" ]]; then
    wr_cutover_die "endpoint apply: container IP changed before YAML commit"
    return 1
  fi
  wr_public_demo_rewrite_traefik_urls \
    "http://${sf_ip}:3002" \
    "http://${be_ip}:9000"
}

# Detach a renamed keeper from the Traefik network so a stale LB IP cannot
# keep serving the previous pair. Rollback reconnects dokploy-network.
wr_public_demo_detach_keeper_from_traefik_net() {
  local keep="${1:?}"
  local net="${WOODRIGHT_NET_DOKPLOY:-dokploy-network}"
  wr_cutover_docker inspect "$keep" >/dev/null 2>&1 || return 0
  if wr_cutover_docker network disconnect "$net" "$keep"; then
    wr_cutover_log "KEEPER_DETACHED_TRAEFIK_NET keep=$keep net=$net"
    return 0
  fi
  wr_cutover_die "failed to detach keeper $keep from $net"
  return 1
}

# Wait until buyer HTTPS matches expected identity.
# Returns: 0 EDGE_CONVERGED
#          1 PUBLIC_DEMO_EDGE_CONVERGENCE_TIMEOUT
#          2 PUBLIC_DEMO_EDGE_IDENTITY_MISMATCH
# Sets WR_PUBLIC_DEMO_EDGE_RESULT to the token.
wr_public_demo_wait_buyer_edge() {
  local expected_sha="${1:?}"
  local expected_role="${2:-public_demo}"
  local expected_db="${3:-public_demo_db}"
  local previous_sha="${4:-}"
  local evidence_hdr="${5:-}"
  local url="${WOODRIGHT_BUYER_HOST%/}/"
  local timeout_s interval_s
  timeout_s="${WOODRIGHT_PUBLIC_DEMO_EDGE_SETTLE_TIMEOUT_S:-90}"
  interval_s="${WOODRIGHT_PUBLIC_DEMO_EDGE_SETTLE_INTERVAL_S:-2}"
  [[ "$timeout_s" =~ ^[0-9]+$ ]] || timeout_s=90
  [[ "$interval_s" =~ ^[0-9]+$ ]] || interval_s=2
  local deadline=$((SECONDS + timeout_s))
  local attempt=0
  local hdr_file code headers sha role db
  hdr_file="$(mktemp "${TMPDIR:-/tmp}/wr-edge-hdr.XXXXXX")"
  WR_PUBLIC_DEMO_EDGE_RESULT=""
  WR_PUBLIC_DEMO_EDGE_LAST_SHA=""
  WR_PUBLIC_DEMO_EDGE_LAST_HTTP=""

  expected_sha="$(printf '%s' "$expected_sha" | tr '[:upper:]' '[:lower:]')"
  previous_sha="$(printf '%s' "$previous_sha" | tr '[:upper:]' '[:lower:]')"
  wr_cutover_require_full_sha "$expected_sha" || {
    rm -f "$hdr_file"
    WR_PUBLIC_DEMO_EDGE_RESULT="PUBLIC_DEMO_EDGE_IDENTITY_MISMATCH"
    return 2
  }
  if [[ -n "$previous_sha" ]]; then
    wr_cutover_require_full_sha "$previous_sha" || previous_sha=""
  fi

  while :; do
    attempt=$((attempt + 1))
    code="$(wr_public_demo_edge_http_get "$url" "$hdr_file")"
    headers="$(cat "$hdr_file" 2>/dev/null || true)"
    if [[ -n "$evidence_hdr" ]]; then
      mkdir -p "$(dirname "$evidence_hdr")" 2>/dev/null || true
      printf '%s\n' "$headers" >"$evidence_hdr"
    fi
    sha="$(wr_public_demo_edge_header_value "$headers" "x-woodright-release-sha" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')"
    role="$(wr_public_demo_edge_header_value "$headers" "x-woodright-runtime-role" | tr -d '[:space:]')"
    db="$(wr_public_demo_edge_header_value "$headers" "x-woodright-database-identity" | tr -d '[:space:]')"
    WR_PUBLIC_DEMO_EDGE_LAST_SHA="$sha"
    WR_PUBLIC_DEMO_EDGE_LAST_HTTP="$code"

    if [[ "$code" == "200" && "$sha" == "$expected_sha" && "$role" == "$expected_role" && "$db" == "$expected_db" ]] \
      && printf '%s\n' "$headers" | grep -qi 'x-robots-tag:.*noindex'; then
      wr_cutover_log "EDGE_CONVERGED attempt=$attempt http=$code sha=$sha role=$role db=$db"
      WR_PUBLIC_DEMO_EDGE_RESULT="EDGE_CONVERGED"
      rm -f "$hdr_file"
      return 0
    fi

    if [[ "$code" == "200" && -n "$sha" && "$sha" =~ $WR_SHA_RE && "$sha" != "$expected_sha" ]]; then
      if [[ -z "$previous_sha" || "$sha" != "$previous_sha" ]]; then
        wr_cutover_log "PUBLIC_DEMO_EDGE_IDENTITY_MISMATCH attempt=$attempt http=$code sha=$sha expected=$expected_sha previous=${previous_sha:-none}"
        WR_PUBLIC_DEMO_EDGE_RESULT="PUBLIC_DEMO_EDGE_IDENTITY_MISMATCH"
        rm -f "$hdr_file"
        return 2
      fi
    fi
    if [[ "$code" == "200" && "$sha" == "$expected_sha" ]]; then
      wr_cutover_log "PUBLIC_DEMO_EDGE_IDENTITY_MISMATCH attempt=$attempt http=$code sha=$sha role=${role:-empty} db=${db:-empty} (incomplete public identity)"
      WR_PUBLIC_DEMO_EDGE_RESULT="PUBLIC_DEMO_EDGE_IDENTITY_MISMATCH"
      rm -f "$hdr_file"
      return 2
    fi

    wr_cutover_log "EDGE_NOT_CONVERGED attempt=$attempt http=$code sha=${sha:-empty} expected=$expected_sha previous=${previous_sha:-none}"
    if (( SECONDS >= deadline )); then
      wr_cutover_log "PUBLIC_DEMO_EDGE_CONVERGENCE_TIMEOUT attempts=$attempt last_http=$code last_sha=${sha:-empty}"
      WR_PUBLIC_DEMO_EDGE_RESULT="PUBLIC_DEMO_EDGE_CONVERGENCE_TIMEOUT"
      rm -f "$hdr_file"
      return 1
    fi
    remaining=$((deadline - SECONDS))
    if (( remaining <= 0 )); then
      wr_cutover_log "PUBLIC_DEMO_EDGE_CONVERGENCE_TIMEOUT attempts=$attempt last_http=$code last_sha=${sha:-empty}"
      WR_PUBLIC_DEMO_EDGE_RESULT="PUBLIC_DEMO_EDGE_CONVERGENCE_TIMEOUT"
      rm -f "$hdr_file"
      return 1
    fi
    sleeptime="$interval_s"
    if (( sleeptime > remaining )); then
      sleeptime="$remaining"
    fi
    if (( sleeptime > 0 )); then
      sleep "$sleeptime"
    fi
  done
}

# Optional API /health SHA settle (same previous-SHA retry rules; role/db skipped).
wr_public_demo_wait_api_edge() {
  local expected_sha="${1:?}"
  local previous_sha="${2:-}"
  local evidence_hdr="${3:-}"
  local url timeout_s interval_s deadline attempt hdr_file code headers sha
  url="${WOODRIGHT_API_HOST%/}/health"
  timeout_s="${WOODRIGHT_PUBLIC_DEMO_EDGE_SETTLE_TIMEOUT_S:-90}"
  interval_s="${WOODRIGHT_PUBLIC_DEMO_EDGE_SETTLE_INTERVAL_S:-2}"
  [[ "$timeout_s" =~ ^[0-9]+$ ]] || timeout_s=90
  [[ "$interval_s" =~ ^[0-9]+$ ]] || interval_s=2
  deadline=$((SECONDS + timeout_s))
  attempt=0
  hdr_file="$(mktemp "${TMPDIR:-/tmp}/wr-edge-api-hdr.XXXXXX")"
  WR_PUBLIC_DEMO_EDGE_RESULT=""
  WR_PUBLIC_DEMO_EDGE_LAST_SHA=""
  WR_PUBLIC_DEMO_EDGE_LAST_HTTP=""
  expected_sha="$(printf '%s' "$expected_sha" | tr '[:upper:]' '[:lower:]')"
  previous_sha="$(printf '%s' "$previous_sha" | tr '[:upper:]' '[:lower:]')"
  wr_cutover_require_full_sha "$expected_sha" || {
    rm -f "$hdr_file"
    WR_PUBLIC_DEMO_EDGE_RESULT="PUBLIC_DEMO_EDGE_IDENTITY_MISMATCH"
    return 2
  }
  if [[ -n "$previous_sha" ]]; then
    wr_cutover_require_full_sha "$previous_sha" || previous_sha=""
  fi
  while :; do
    attempt=$((attempt + 1))
    code="$(wr_public_demo_edge_http_get "$url" "$hdr_file")"
    headers="$(cat "$hdr_file" 2>/dev/null || true)"
    if [[ -n "$evidence_hdr" ]]; then
      mkdir -p "$(dirname "$evidence_hdr")" 2>/dev/null || true
      printf '%s\n' "$headers" >"$evidence_hdr"
    fi
    sha="$(wr_public_demo_edge_header_value "$headers" "x-woodright-release-sha" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')"
    WR_PUBLIC_DEMO_EDGE_LAST_SHA="$sha"
    WR_PUBLIC_DEMO_EDGE_LAST_HTTP="$code"
    if [[ "$code" == "200" && "$sha" == "$expected_sha" ]]; then
      wr_cutover_log "EDGE_CONVERGED api attempt=$attempt http=$code sha=$sha"
      WR_PUBLIC_DEMO_EDGE_RESULT="EDGE_CONVERGED"
      rm -f "$hdr_file"
      return 0
    fi
    if [[ "$code" == "200" && -n "$sha" && "$sha" =~ $WR_SHA_RE && "$sha" != "$expected_sha" ]]; then
      if [[ -z "$previous_sha" || "$sha" != "$previous_sha" ]]; then
        wr_cutover_log "PUBLIC_DEMO_EDGE_IDENTITY_MISMATCH api sha=$sha expected=$expected_sha previous=${previous_sha:-none}"
        WR_PUBLIC_DEMO_EDGE_RESULT="PUBLIC_DEMO_EDGE_IDENTITY_MISMATCH"
        rm -f "$hdr_file"
        return 2
      fi
    fi
    wr_cutover_log "EDGE_NOT_CONVERGED api attempt=$attempt http=$code sha=${sha:-empty}"
    if (( SECONDS >= deadline )); then
      wr_cutover_log "PUBLIC_DEMO_EDGE_CONVERGENCE_TIMEOUT api attempts=$attempt"
      WR_PUBLIC_DEMO_EDGE_RESULT="PUBLIC_DEMO_EDGE_CONVERGENCE_TIMEOUT"
      rm -f "$hdr_file"
      return 1
    fi
    remaining=$((deadline - SECONDS))
    if (( remaining <= 0 )); then
      wr_cutover_log "PUBLIC_DEMO_EDGE_CONVERGENCE_TIMEOUT api attempts=$attempt"
      WR_PUBLIC_DEMO_EDGE_RESULT="PUBLIC_DEMO_EDGE_CONVERGENCE_TIMEOUT"
      rm -f "$hdr_file"
      return 1
    fi
    sleeptime="$interval_s"
    if (( sleeptime > remaining )); then
      sleeptime="$remaining"
    fi
    if (( sleeptime > 0 )); then
      sleep "$sleeptime"
    fi
  done
}
