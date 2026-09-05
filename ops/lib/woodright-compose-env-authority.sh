#!/usr/bin/env bash
# Shared compose .env authority helpers for Woodright cutover / metadata reconcile.
# Never prints env values (secrets may live in the same file).
# shellcheck shell=bash

wr_compose_env_log() { printf '%s wr_compose_env %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
wr_compose_env_die() { wr_compose_env_log "ERROR: $*"; return 1; }

# Governed keys that must appear at most once and never as ambiguous variants.
WR_COMPOSE_ENV_GOVERNED_KEYS=(
  WOODRIGHT_BACKEND_IMAGE
  WOODRIGHT_STOREFRONT_IMAGE
  WOODRIGHT_RELEASE_SHA
  WOODRIGHT_BACKEND_SOURCE_SHA
  WOODRIGHT_STOREFRONT_SOURCE_SHA
)

wr_compose_env_is_regular_file() {
  local path="$1"
  [[ -e "$path" || -L "$path" ]] || return 1
  [[ ! -L "$path" ]] || { wr_compose_env_die "refusing symlink path: $path"; return 1; }
  [[ -f "$path" ]] || { wr_compose_env_die "refusing non-regular path: $path"; return 1; }
  return 0
}

# dest must be a regular file (or absent) under an allowed parent directory.
# allowed_parent should already be the governed compose dir from the profile.
wr_compose_env_assert_path_under() {
  local path="$1"
  local allowed_parent="$2"
  local parent resolved_parent resolved_path
  [[ -n "$path" && -n "$allowed_parent" ]] || { wr_compose_env_die "path/parent required"; return 1; }
  parent="$(dirname -- "$path")"
  if command -v realpath >/dev/null 2>&1; then
    resolved_parent="$(realpath "$allowed_parent" 2>/dev/null || true)"
    [[ -n "$resolved_parent" ]] || { wr_compose_env_die "cannot resolve allowed parent: $allowed_parent"; return 1; }
    if [[ -e "$path" || -L "$path" ]]; then
      wr_compose_env_is_regular_file "$path" || return 1
      resolved_path="$(realpath "$path" 2>/dev/null || true)"
      [[ -n "$resolved_path" ]] || { wr_compose_env_die "cannot resolve path: $path"; return 1; }
      case "$resolved_path" in
        "$resolved_parent"/*) ;;
        *) wr_compose_env_die "path escapes governed parent: $path"; return 1 ;;
      esac
    else
      # Parent of dest must resolve under allowed parent (or equal).
      local rp
      rp="$(realpath "$parent" 2>/dev/null || true)"
      [[ -n "$rp" ]] || { wr_compose_env_die "cannot resolve parent of $path"; return 1; }
      case "$rp" in
        "$resolved_parent"|"$resolved_parent"/*) ;;
        *) wr_compose_env_die "parent escapes governed root for $path"; return 1 ;;
      esac
    fi
  else
    case "$path" in
      "$allowed_parent"/*) ;;
      *) wr_compose_env_die "path not under allowed parent (no realpath): $path"; return 1 ;;
    esac
    if [[ -e "$path" || -L "$path" ]]; then
      wr_compose_env_is_regular_file "$path" || return 1
    fi
  fi
  return 0
}

wr_compose_env_count_exact_key() {
  local path="$1" key="$2"
  python3 - "$path" "$key" <<'PY'
import re, sys
path, key = sys.argv[1:3]
# Compose dotenv-ish: optional export, optional whitespace around '='.
pat = re.compile(rf'^[ \t]*(?:export[ \t]+)?{re.escape(key)}[ \t]*=')
n = 0
for line in open(path, "r", encoding="utf-8"):
    if pat.match(line):
        n += 1
print(n)
PY
}

# Fail-closed if any governed key is duplicated OR appears in a non-canonical
# assignment form (leading spaces, export, spaces around '=') that Compose
# dotenv may still honor while our exact KEY= writers would miss.
wr_compose_env_assert_no_duplicate_governed_keys() {
  local path="$1"
  python3 - "$path" "${WR_COMPOSE_ENV_GOVERNED_KEYS[@]}" <<'PY'
import re, sys
path = sys.argv[1]
keys = sys.argv[2:]
lines = open(path, "r", encoding="utf-8").read().splitlines()
errors = []
for key in keys:
    exact = [l for l in lines if l.startswith(key + "=")]
    # Any dotenv-like assignment for this key (including non-canonical forms).
    pat = re.compile(rf'^[ \t]*(?:export[ \t]+)?{re.escape(key)}[ \t]*=')
    all_forms = [l for l in lines if pat.match(l)]
    if len(all_forms) > 1:
        errors.append(f"duplicate {key} count={len(all_forms)}")
    elif len(all_forms) == 1 and (len(exact) != 1 or exact[0] != all_forms[0]):
        errors.append(f"noncanonical assignment for {key}")
    elif len(exact) > 1:
        errors.append(f"duplicate {key} count={len(exact)}")
if errors:
    print("COMPOSE_ENV_KEY_CONTRACT_FAIL: " + "; ".join(errors), file=sys.stderr)
    sys.exit(1)
print("compose_env_governed_keys_ok")
PY
}

# Render one or more KEY=VALUE updates into out_path from src_path.
# KEYS_AND_VALUES are alternating: key1 value1 key2 value2 ...
# Rejects duplicate existing keys for any key being written; collapses to one.
wr_compose_env_render_keys() {
  local src="$1" out="$2"
  shift 2
  [[ -f "$src" ]] || { wr_compose_env_die "source env missing"; return 1; }
  python3 - "$src" "$out" "$@" <<'PY'
import sys
src, out = sys.argv[1], sys.argv[2]
args = sys.argv[3:]
if len(args) % 2 != 0 or not args:
    print("render_keys requires key/value pairs", file=sys.stderr)
    sys.exit(2)
updates = {}
order = []
for i in range(0, len(args), 2):
    k, v = args[i], args[i + 1]
    if k in updates:
        print(f"duplicate update request for {k}", file=sys.stderr)
        sys.exit(2)
    updates[k] = v
    order.append(k)
lines = open(src, "r", encoding="utf-8").read().splitlines()
# Pre-check duplicates / noncanonical forms for keys we touch
import re
for k in order:
    hits = [l for l in lines if l.startswith(k + "=")]
    if len(hits) > 1:
        print(f"COMPOSE_ENV_DUPLICATE_KEY {k}", file=sys.stderr)
        sys.exit(1)
    pat = re.compile(rf'^[ \t]*(?:export[ \t]+)?{re.escape(k)}[ \t]*=')
    all_forms = [l for l in lines if pat.match(l)]
    if len(all_forms) > 1:
        print(f"COMPOSE_ENV_DUPLICATE_KEY {k}", file=sys.stderr)
        sys.exit(1)
    if all_forms and (len(hits) != 1 or hits[0] != all_forms[0]):
        print(f"COMPOSE_ENV_AMBIGUOUS_KEY {k}", file=sys.stderr)
        sys.exit(1)
result = []
seen = set()
for line in lines:
    replaced = False
    for k, v in updates.items():
        if line.startswith(k + "="):
            if k in seen:
                continue
            result.append(f"{k}={v}")
            seen.add(k)
            replaced = True
            break
    if not replaced:
        result.append(line)
for k in order:
    if k not in seen:
        result.append(f"{k}={updates[k]}")
        seen.add(k)
open(out, "w", encoding="utf-8").write("\n".join(result) + "\n")
PY
}

# Validate that path has exactly one KEY=VALUE for each pair (alternating).
wr_compose_env_validate_keys() {
  local path="$1"
  shift
  python3 - "$path" "$@" <<'PY'
import sys
path = sys.argv[1]
args = sys.argv[2:]
if len(args) % 2 != 0 or not args:
    print("validate_keys requires key/value pairs", file=sys.stderr)
    sys.exit(2)
lines = open(path, "r", encoding="utf-8").read().splitlines()
for i in range(0, len(args), 2):
    key, value = args[i], args[i + 1]
    hits = [l for l in lines if l.startswith(key + "=")]
    if len(hits) != 1 or hits[0] != f"{key}={value}":
        print(f"PIN_VALIDATION_FAILED {key}", file=sys.stderr)
        sys.exit(1)
print("pin_file_ok")
PY
}

wr_compose_env_sha256() {
  local path="$1"
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$path" | awk '{print $1}'
  else
    sha256sum "$path" | awk '{print $1}'
  fi
}

# Parse `sha256sum`/`shasum` stdout; never treat the remainder as file contents.
wr_compose_env_parse_digest() {
  local line="$1"
  local digest="${line%%[[:space:]]*}"
  [[ "$digest" =~ ^[0-9a-f]{64}$ ]] || {
    wr_compose_env_die "invalid sha256 digest from hasher"
    return 1
  }
  printf '%s\n' "$digest"
}

# Fingerprint a governed compose .env without printing secrets.
# Unreadable files are hashed only via `sudo -n sha256sum -- <realpath>` and
# only when realpath(path) == realpath(expected_profile_path) under allowed_parent.
# Never cats the file. Never sudo-hashes an arbitrary caller path.
# Sets WR_COMPOSE_ENV_FINGERPRINT_METHOD=unprivileged|privileged on success.
wr_compose_env_sha256_fingerprint() {
  local path="$1"
  local expected="$2"
  local allowed_parent="$3"
  local resolved expected_resolved hasher_out hasher_rc method digest
  WR_COMPOSE_ENV_FINGERPRINT_METHOD=""
  [[ -n "$path" && -n "$expected" && -n "$allowed_parent" ]] \
    || { wr_compose_env_die "fingerprint requires path, expected profile path, and allowed parent"; return 1; }
  command -v realpath >/dev/null 2>&1 \
    || { wr_compose_env_die "realpath required for compose env fingerprint"; return 1; }
  wr_compose_env_assert_path_under "$path" "$allowed_parent" || return 1
  wr_compose_env_assert_path_under "$expected" "$allowed_parent" || return 1
  wr_compose_env_is_regular_file "$path" || return 1
  wr_compose_env_is_regular_file "$expected" || return 1
  resolved="$(realpath "$path" 2>/dev/null || true)"
  expected_resolved="$(realpath "$expected" 2>/dev/null || true)"
  [[ -n "$resolved" && -n "$expected_resolved" ]] \
    || { wr_compose_env_die "cannot canonicalize fingerprint paths"; return 1; }
  [[ "$resolved" == "$expected_resolved" ]] \
    || { wr_compose_env_die "fingerprint path is not the profile compose env"; return 1; }

  if [[ -r "$resolved" ]]; then
    method="unprivileged"
    wr_compose_env_log "fingerprint_method=unprivileged"
    if command -v sha256sum >/dev/null 2>&1; then
      hasher_out="$(sha256sum -- "$resolved")" || {
        wr_compose_env_die "unprivileged sha256sum failed"
        return 1
      }
    elif command -v shasum >/dev/null 2>&1; then
      hasher_out="$(shasum -a 256 -- "$resolved")" || {
        wr_compose_env_die "unprivileged shasum failed"
        return 1
      }
    else
      wr_compose_env_die "no sha256sum/shasum"
      return 1
    fi
    digest="$(wr_compose_env_parse_digest "$hasher_out")" || return 1
    WR_COMPOSE_ENV_FINGERPRINT_METHOD="$method"
    printf '%s %s\n' "$method" "$digest"
    return 0
  fi

  command -v sudo >/dev/null 2>&1 \
    || { wr_compose_env_die "compose env is unreadable and sudo is unavailable"; return 1; }
  command -v sha256sum >/dev/null 2>&1 \
    || { wr_compose_env_die "compose env is unreadable and sha256sum is unavailable"; return 1; }
  method="privileged"
  wr_compose_env_log "fingerprint_method=privileged hasher=sudo-n-sha256sum"
  hasher_rc=0
  hasher_out="$(sudo -n sha256sum -- "$resolved")" || hasher_rc=$?
  [[ "$hasher_rc" -eq 0 ]] || {
    wr_compose_env_die "privileged sha256sum failed rc=$hasher_rc"
    return 1
  }
  digest="$(wr_compose_env_parse_digest "$hasher_out")" || return 1
  WR_COMPOSE_ENV_FINGERPRINT_METHOD="$method"
  printf '%s %s\n' "$method" "$digest"
}

# Atomic install: src temp -> dest. Temp should already live in dest's directory
# when possible. Preserves DESTINATION owner/group/mode (not staged umask/owner).
# Does not print file contents.
wr_compose_env_atomic_install() {
  local src="$1"
  local dest="$2"
  local allowed_parent="${3:-$(dirname -- "$dest")}"
  local published meta_u meta_g meta_m staged_u staged_g got_u got_g got_m
  wr_compose_env_assert_path_under "$dest" "$allowed_parent" || return 1
  wr_compose_env_is_regular_file "$src" || return 1
  if [[ -e "$dest" || -L "$dest" ]]; then
    wr_compose_env_is_regular_file "$dest" || return 1
    meta_u="$(python3 -c 'import os,sys; print(os.stat(sys.argv[1]).st_uid)' "$dest")"
    meta_g="$(python3 -c 'import os,sys; print(os.stat(sys.argv[1]).st_gid)' "$dest")"
    meta_m="$(python3 -c 'import os,stat,sys; print(format(stat.S_IMODE(os.stat(sys.argv[1]).st_mode), "o"))' "$dest")"
  else
    meta_u="$(id -u)"
    meta_g="$(id -g)"
    meta_m="644"
  fi
  published="$(dirname -- "$dest")/.wr-compose-env-publish-$$-$RANDOM"
  # Ensure published path cannot be a pre-planted symlink.
  rm -f "$published" 2>/dev/null || true
  if [[ -L "$published" ]]; then
    wr_compose_env_die "refusing to write through symlink publish path"
    return 1
  fi
  cp "$src" "$published" || return 1
  staged_u="$(python3 -c 'import os,sys; print(os.stat(sys.argv[1]).st_uid)' "$published")"
  staged_g="$(python3 -c 'import os,sys; print(os.stat(sys.argv[1]).st_gid)' "$published")"
  if [[ "$staged_u" != "$meta_u" || "$staged_g" != "$meta_g" ]]; then
    if ! chown "${meta_u}:${meta_g}" "$published" 2>/dev/null; then
      if command -v sudo >/dev/null 2>&1 && sudo -n chown "${meta_u}:${meta_g}" "$published" 2>/dev/null; then
        :
      else
        rm -f "$published"
        wr_compose_env_die "chown staged compose env failed"
        return 1
      fi
    fi
  fi
  if ! chmod "$meta_m" "$published" 2>/dev/null; then
    if command -v sudo >/dev/null 2>&1 && sudo -n chmod "$meta_m" "$published" 2>/dev/null; then
      :
    else
      rm -f "$published"
      wr_compose_env_die "chmod staged compose env failed"
      return 1
    fi
  fi
  if ! mv -f "$published" "$dest" 2>/dev/null; then
    if command -v sudo >/dev/null 2>&1 && sudo -n mv -f "$published" "$dest"; then
      :
    else
      rm -f "$published" 2>/dev/null || true
      wr_compose_env_die "cannot atomically install compose env"
      return 1
    fi
  fi
  got_u="$(python3 -c 'import os,sys; print(os.stat(sys.argv[1]).st_uid)' "$dest")"
  got_g="$(python3 -c 'import os,sys; print(os.stat(sys.argv[1]).st_gid)' "$dest")"
  got_m="$(python3 -c 'import os,stat,sys; print(format(stat.S_IMODE(os.stat(sys.argv[1]).st_mode), "o"))' "$dest")"
  [[ "$got_u" == "$meta_u" && "$got_g" == "$meta_g" && "$got_m" == "$meta_m" ]] \
    || { wr_compose_env_die "compose env owner/mode mismatch after install"; return 1; }
  wr_compose_env_log "atomic_install_ok dest_parent=$(dirname -- "$dest") mode=$meta_m"
  return 0
}

# Restore exact backup bytes to dest; verify checksum.
wr_compose_env_restore_backup() {
  local backup="$1"
  local dest="$2"
  local allowed_parent="${3:-$(dirname -- "$dest")}"
  local want got
  wr_compose_env_is_regular_file "$backup" || return 1
  want="$(wr_compose_env_sha256 "$backup")"
  wr_compose_env_atomic_install "$backup" "$dest" "$allowed_parent" || return 1
  got="$(wr_compose_env_sha256 "$dest")"
  [[ "$got" == "$want" ]] || { wr_compose_env_die "restore checksum mismatch"; return 1; }
  wr_compose_env_log "restore_ok checksum_matched"
  return 0
}
