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

# python3 vs sudo -n python3. Privileged python is an already-established
# production-candidate primitive (compose-template reconciler). It is used
# only when a named existing path is unreadable. Stdin is the program, never
# file contents. Secrets stay in the file; governed pin values may be printed.
wr_compose_env_select_python() {
  local p
  WR_COMPOSE_ENV_PYTHON=(python3)
  for p in "$@"; do
    [[ -n "$p" ]] || continue
    if [[ -e "$p" && ! -r "$p" ]]; then
      command -v sudo >/dev/null 2>&1 \
        || { wr_compose_env_die "compose env is unreadable and sudo is unavailable"; return 1; }
      WR_COMPOSE_ENV_PYTHON=(sudo -n python3)
      return 0
    fi
  done
  return 0
}

wr_compose_env_assert_not_public_target() {
  local blob="$1"
  case "$blob" in
    *public_demo*|*public-demo*|*woodright-stack-3dsdhd*|*woodright-public-production*|*public_production*)
      wr_compose_env_die "refused protected compose-env operation on non-candidate path"
      return 1
      ;;
  esac
  return 0
}

wr_compose_env_assert_candidate_parent() {
  local allowed="$1"
  local base
  wr_compose_env_assert_not_public_target "$allowed" || return 1
  base="$(basename -- "$allowed")"
  # Exact basename, not a substring: woodright-public-production contains
  # "woodright-production" and must already have been denied above.
  if [[ "$base" != "woodright-production" ]]; then
    wr_compose_env_die "allowed parent is not the production-candidate compose root"
    return 1
  fi
  return 0
}

wr_compose_env_assert_exact_env_path() {
  local path="$1"
  local expected="$2"
  local allowed_parent="$3"
  local resolved expected_resolved
  wr_compose_env_assert_not_public_target "$path$expected$allowed_parent" || return 1
  wr_compose_env_assert_path_under "$path" "$allowed_parent" || return 1
  wr_compose_env_assert_path_under "$expected" "$allowed_parent" || return 1
  command -v realpath >/dev/null 2>&1 \
    || { wr_compose_env_die "realpath required for exact compose-env identity"; return 1; }
  resolved="$(realpath "$path" 2>/dev/null || true)"
  expected_resolved="$(realpath "$expected" 2>/dev/null || true)"
  [[ -n "$resolved" && -n "$expected_resolved" ]] \
    || { wr_compose_env_die "cannot canonicalize exact compose-env path"; return 1; }
  [[ "$resolved" == "$expected_resolved" ]] \
    || { wr_compose_env_die "compose-env path is not the profile compose env"; return 1; }
  return 0
}

wr_compose_env_is_governed_key() {
  local key="$1" k
  for k in "${WR_COMPOSE_ENV_GOVERNED_KEYS[@]}"; do
    [[ "$k" == "$key" ]] && return 0
  done
  return 1
}

# Remove a staging file that may be root-owned 0600.
wr_compose_env_rm() {
  local path="$1"
  [[ -n "$path" ]] || return 0
  [[ -e "$path" || -L "$path" ]] || return 0
  rm -f "$path" 2>/dev/null || true
  if [[ -e "$path" || -L "$path" ]] && command -v sudo >/dev/null 2>&1; then
    sudo -n rm -f "$path" 2>/dev/null || true
  fi
  return 0
}

# Remove leftover pin-write siblings beside a compose .env. Never prints contents.
wr_compose_env_cleanup_pin_staging() {
  local parent="$1"
  local f
  [[ -n "$parent" && -d "$parent" ]] || return 0
  for f in "$parent"/.wr-prod-pin-* \
           "$parent"/.wr-compose-env-publish-* \
           "$parent"/.wr-prod-new-* \
           "$parent"/.env.wr-prod-new-*; do
    [[ -e "$f" || -L "$f" ]] || continue
    wr_compose_env_rm "$f"
  done
  return 0
}

# Hash a regular file. Readable → unprivileged. Unreadable → sudo -n sha256sum
# (same command class as fingerprint). Never cats contents.
wr_compose_env_sha256_auto() {
  local path="$1"
  local hasher_out digest resolved
  wr_compose_env_is_regular_file "$path" || return 1
  if [[ -r "$path" ]]; then
    wr_compose_env_sha256 "$path"
    return 0
  fi
  command -v sudo >/dev/null 2>&1 \
    || { wr_compose_env_die "file is unreadable and sudo is unavailable"; return 1; }
  command -v sha256sum >/dev/null 2>&1 \
    || { wr_compose_env_die "file is unreadable and sha256sum is unavailable"; return 1; }
  command -v realpath >/dev/null 2>&1 \
    || { wr_compose_env_die "realpath required for privileged hash"; return 1; }
  resolved="$(realpath "$path" 2>/dev/null || true)"
  [[ -n "$resolved" ]] || { wr_compose_env_die "cannot canonicalize path for hash"; return 1; }
  hasher_out="$(sudo -n sha256sum -- "$resolved")" || {
    wr_compose_env_die "privileged sha256sum failed"
    return 1
  }
  digest="$(wr_compose_env_parse_digest "$hasher_out")" || return 1
  printf '%s\n' "$digest"
}

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
  wr_compose_env_select_python "$path" || return 1
  "${WR_COMPOSE_ENV_PYTHON[@]}" - "$path" "$key" <<'PY'
import re, sys
path, key = sys.argv[1:3]
# Compose dotenv-ish: optional export, optional whitespace around '='.
pat = re.compile(rf'^[ \t]*(?:export[ \t]+)?{re.escape(key)}[ \t]*=')
n = 0
try:
    fh = open(path, "r", encoding="utf-8")
except OSError:
    print("COMPOSE_ENV_READ_DENIED", file=sys.stderr)
    sys.exit(1)
for line in fh:
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
  wr_compose_env_is_regular_file "$path" || return 1
  wr_compose_env_select_python "$path" || return 1
  "${WR_COMPOSE_ENV_PYTHON[@]}" - "$path" "${WR_COMPOSE_ENV_GOVERNED_KEYS[@]}" <<'PY'
import re, sys
path = sys.argv[1]
keys = sys.argv[2:]
try:
    lines = open(path, "r", encoding="utf-8").read().splitlines()
except OSError:
    print("COMPOSE_ENV_READ_DENIED", file=sys.stderr)
    sys.exit(1)
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
  wr_compose_env_select_python "$src" "$out" || return 1
  "${WR_COMPOSE_ENV_PYTHON[@]}" - "$src" "$out" "$@" <<'PY'
import os, sys
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
try:
    lines = open(src, "r", encoding="utf-8").read().splitlines()
except OSError:
    print("COMPOSE_ENV_READ_DENIED", file=sys.stderr)
    sys.exit(1)
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
text = "\n".join(result) + "\n"
fd = os.open(out, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
try:
    os.write(fd, text.encode("utf-8"))
finally:
    os.close(fd)
PY
}

# Validate that path has exactly one KEY=VALUE for each pair (alternating).
wr_compose_env_validate_keys() {
  local path="$1"
  shift
  wr_compose_env_is_regular_file "$path" || return 1
  wr_compose_env_select_python "$path" || return 1
  "${WR_COMPOSE_ENV_PYTHON[@]}" - "$path" "$@" <<'PY'
import sys
path = sys.argv[1]
args = sys.argv[2:]
if len(args) % 2 != 0 or not args:
    print("validate_keys requires key/value pairs", file=sys.stderr)
    sys.exit(2)
try:
    lines = open(path, "r", encoding="utf-8").read().splitlines()
except OSError:
    print("COMPOSE_ENV_READ_DENIED", file=sys.stderr)
    sys.exit(1)
for i in range(0, len(args), 2):
    key, value = args[i], args[i + 1]
    hits = [l for l in lines if l.startswith(key + "=")]
    if len(hits) != 1 or hits[0] != f"{key}={value}":
        print(f"PIN_VALIDATION_FAILED {key}", file=sys.stderr)
        sys.exit(1)
print("pin_file_ok")
PY
}

# Query one governed pin. Stdout is the value only on success.
# rc 0 = ok (value on stdout, possibly empty)
# rc 2 = missing key
# rc 3 = duplicate
# rc 4 = not a governed key
# rc 1 = denied / IO / sudo failure (never mapped to missing)
wr_compose_env_query_governed_value() {
  local path="$1" key="$2" out rc
  wr_compose_env_is_regular_file "$path" || return 1
  wr_compose_env_is_governed_key "$key" || {
    wr_compose_env_die "refusing to query non-governed compose key"
    return 4
  }
  wr_compose_env_select_python "$path" || return 1
  out=""
  rc=0
  out="$("${WR_COMPOSE_ENV_PYTHON[@]}" - "$path" "$key" <<'PY'
import sys
path, key = sys.argv[1], sys.argv[2]
try:
    lines = open(path, "r", encoding="utf-8").read().splitlines()
except OSError:
    print("COMPOSE_ENV_READ_DENIED", file=sys.stderr)
    sys.exit(1)
hits = [l[len(key) + 1:] for l in lines if l.startswith(key + "=")]
if len(hits) == 0:
    sys.exit(2)
if len(hits) > 1:
    print(f"COMPOSE_ENV_KEY_DUPLICATE {key} count={len(hits)}", file=sys.stderr)
    sys.exit(3)
sys.stdout.write(hits[0])
PY
)" || rc=$?
  case "$rc" in
    0) printf '%s\n' "$out"; return 0 ;;
    2) return 2 ;;
    3) return 3 ;;
    *)
      wr_compose_env_die "privileged governed-key query failed rc=$rc"
      return 1
      ;;
  esac
}

# Render governed pin updates into a new 0600 temp beside src. Prints temp path.
# Privileged python reads src and writes the temp; leonid never gets a readable copy.
wr_compose_env_stage_rendered_pins() {
  local src="$1" allowed_parent="$2"
  local parent tmp
  shift 2
  [[ -f "$src" ]] || { wr_compose_env_die "source env missing"; return 1; }
  wr_compose_env_assert_path_under "$src" "$allowed_parent" || return 1
  wr_compose_env_assert_candidate_parent "$allowed_parent" || return 1
  wr_compose_env_assert_not_public_target "$src$allowed_parent" || return 1
  if [[ -n "${WOODRIGHT_COMPOSE_ENV_FILE:-}" ]]; then
    wr_compose_env_assert_exact_env_path "$src" "$WOODRIGHT_COMPOSE_ENV_FILE" "$allowed_parent" || return 1
  fi
  local k v i
  if (( $# % 2 != 0 )) || (( $# == 0 )); then
    wr_compose_env_die "stage_rendered_pins requires key/value pairs"
    return 1
  fi
  for (( i=1; i<=$#; i+=2 )); do
    k="${!i}"
    wr_compose_env_is_governed_key "$k" || {
      wr_compose_env_die "refusing to stage non-governed compose key"
      return 1
    }
  done
  parent="$(dirname -- "$src")"
  wr_compose_env_select_python "$src" || return 1
  tmp="$("${WR_COMPOSE_ENV_PYTHON[@]}" - "$src" "$parent" "$@" <<'PY'
import os, sys, tempfile, re
src, parent = sys.argv[1], sys.argv[2]
args = sys.argv[3:]
if len(args) % 2 != 0 or not args:
    print("stage_rendered_pins requires key/value pairs", file=sys.stderr)
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
try:
    lines = open(src, "r", encoding="utf-8").read().splitlines()
except OSError:
    print("COMPOSE_ENV_READ_DENIED", file=sys.stderr)
    sys.exit(1)
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
text = "\n".join(result) + "\n"
fd, tmp = tempfile.mkstemp(prefix=".wr-prod-pin-", dir=parent)
try:
    os.fchmod(fd, 0o600)
    os.write(fd, text.encode("utf-8"))
finally:
    os.close(fd)
print("STAGED_PIN_TMP=" + tmp)
PY
)" || { wr_compose_env_cleanup_pin_staging "$parent"; return 1; }
  tmp="$(printf '%s\n' "$tmp" | sed -n 's/^STAGED_PIN_TMP=//p' | tail -n 1)"
  if [[ -z "$tmp" || ! -f "$tmp" ]]; then
    wr_compose_env_cleanup_pin_staging "$parent"
    wr_compose_env_die "pin staging produced no temp file"
    return 1
  fi
  printf '%s\n' "$tmp"
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
  rm -f "$published" 2>/dev/null || wr_compose_env_rm "$published"
  if [[ -L "$published" ]]; then
    wr_compose_env_die "refusing to write through symlink publish path"
    return 1
  fi
  if [[ -r "$src" ]]; then
    cp "$src" "$published" || return 1
  elif command -v sudo >/dev/null 2>&1 && sudo -n cp -p "$src" "$published"; then
    :
  else
    wr_compose_env_die "cannot copy unreadable compose env source"
    return 1
  fi
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
  want="$(wr_compose_env_sha256_auto "$backup")" || return 1
  wr_compose_env_atomic_install "$backup" "$dest" "$allowed_parent" || return 1
  got="$(wr_compose_env_sha256_auto "$dest")" || return 1
  [[ "$got" == "$want" ]] || { wr_compose_env_die "restore checksum mismatch"; return 1; }
  wr_compose_env_log "restore_ok checksum_matched"
  return 0
}
