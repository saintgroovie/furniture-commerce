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
  # Copy src -> dest; use sudo -n when dest (or parent) is not writable, matching pin reconciler privilege model.
  local src="${1:?}"
  local dest="${2:?}"
  [[ -f "$src" ]] || return 1
  if [[ -e "$dest" ]]; then
    if [[ -w "$dest" ]]; then
      cp -p "$src" "$dest"
      return $?
    fi
  else
    if [[ -w "$(dirname "$dest")" ]]; then
      cp -p "$src" "$dest"
      return $?
    fi
  fi
  if command -v sudo >/dev/null 2>&1; then
    sudo -n cp -p "$src" "$dest"
    return $?
  fi
  wr_cutover_die "cannot write $dest (need writable path or sudo -n)"
  return 1
}

wr_cutover_pin_paths() {
  # Canonical pin/config SoT destinations — environment-scoped via profile when loaded.
  # Harness may override WOODRIGHT_CUTOVER_* explicitly. Never default to shared legacy root.
  local identity_dir="${WOODRIGHT_IDENTITY_DIR:-/srv/woodright/runtime-identity-public-demo}"
  WOODRIGHT_CUTOVER_PINS_ENV="${WOODRIGHT_CUTOVER_PINS_ENV:-${identity_dir}/DOKPLOY_IMAGE_PINS.env}"
  WOODRIGHT_CUTOVER_ACTIVE_PUBLIC="${WOODRIGHT_CUTOVER_ACTIVE_PUBLIC:-${WOODRIGHT_ACTIVE_PUBLIC:-${identity_dir}/ACTIVE_PUBLIC.json}}"
  WOODRIGHT_CUTOVER_PUBLIC_DEMO_JSON="${WOODRIGHT_CUTOVER_PUBLIC_DEMO_JSON:-${WOODRIGHT_PUBLIC_DEMO_FILE:-${identity_dir}/public-demo.json}}"
  WOODRIGHT_CUTOVER_COMPOSE_ENV="${WOODRIGHT_CUTOVER_COMPOSE_ENV:-${WOODRIGHT_COMPOSE_ENV_FILE:-/etc/dokploy/compose/woodright-stack-3dsdhd/code/.env}}"
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
  wr_cutover_pin_paths
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
  printf '{"backend":%s,"storefront":%s,"pins":%s}\n' "$be_ok" "$sf_ok" "$pin_ok" \
    >"$evidence/json/pair-rollback-result.json"
  if [[ "$be_ok" -eq 1 && "$sf_ok" -eq 1 && "$pin_ok" -eq 1 ]]; then
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
  wr_cutover_pin_paths
  local pins="${2:-$WOODRIGHT_CUTOVER_PINS_ENV}"
  local active="${3:-$WOODRIGHT_CUTOVER_ACTIVE_PUBLIC}"
  local public_demo="${4:-$WOODRIGHT_CUTOVER_PUBLIC_DEMO_JSON}"
  local compose_env="${5:-$WOODRIGHT_CUTOVER_COMPOSE_ENV}"
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
    "$compose_env:dokploy-compose.env"
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
