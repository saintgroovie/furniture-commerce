#!/usr/bin/env bash
# Bounded validation-only freeze lease (non-authoritative vs flock).
# Official mutators MUST refuse when an unexpired staging freeze lease exists,
# unless WOODRIGHT_VALIDATION_FREEZE_OVERRIDE=1 with audit reason.
#
# Lease path default: /srv/woodright/locks/validation-freeze-staging.lease
# Does NOT replace live-cutover.lock. Empty lock files remain normal for flock.
# shellcheck shell=bash

: "${WOODRIGHT_VALIDATION_FREEZE_DIR:=/srv/woodright/locks}"

wr_validation_freeze_path() {
  local env_name="${1:-${WOODRIGHT_ENVIRONMENT:-staging}}"
  printf '%s/validation-freeze-%s.lease\n' "${WOODRIGHT_VALIDATION_FREEZE_DIR%/}" "$env_name"
}

wr_validation_freeze_read() {
  local path="$1"
  [[ -f "$path" ]] || return 1
  cat "$path"
}

wr_validation_freeze_active() {
  local env_name="${1:-${WOODRIGHT_ENVIRONMENT:-staging}}"
  local path expires now
  path="$(wr_validation_freeze_path "$env_name")"
  [[ -f "$path" ]] || return 1
  expires="$(python3 - "$path" <<'PY' 2>/dev/null || echo INVALID
import json,sys
try:
  d=json.load(open(sys.argv[1]))
  print(int(d.get("expires_at_unix") or 0))
except Exception:
  print("INVALID")
PY
)"
  if [[ "$expires" == "INVALID" ]]; then
    echo "ERROR: validation freeze lease unreadable/malformed at $path (fail-closed)" >&2
    return 0
  fi
  now="$(date -u +%s)"
  [[ "${expires:-0}" =~ ^[0-9]+$ ]] || return 0
  [[ "$expires" -gt "$now" ]]
}

wr_validation_freeze_acquire() {
  local env_name="${1:?}"
  local actor="${2:?}"
  local cycle="${3:?}"
  local reason="${4:?}"
  local ttl_sec="${5:-1800}"
  local path now exp
  [[ "$ttl_sec" -gt 0 && "$ttl_sec" -le 7200 ]] || {
    echo "validation freeze ttl must be 1..7200 seconds" >&2
    return 1
  }
  path="$(wr_validation_freeze_path "$env_name")"
  now="$(date -u +%s)"
  exp=$((now + ttl_sec))
  umask 077
  mkdir -p "$(dirname "$path")"
  cat >"${path}.tmp.$$" <<EOF
{
  "schema": "woodright.validation_freeze.v1",
  "environment": "$env_name",
  "actor": $(printf '%s' "$actor" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),
  "pid": $$,
  "cycle": $(printf '%s' "$cycle" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),
  "reason": $(printf '%s' "$reason" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),
  "started_at_unix": $now,
  "expires_at_unix": $exp,
  "started_at_utc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "expires_at_utc": "$(date -u -d @$exp +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -r $exp +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
  mv -f "${path}.tmp.$$" "$path"
  echo "validation_freeze acquired path=$path ttl_sec=$ttl_sec" >&2
}

wr_validation_freeze_release() {
  local env_name="${1:-${WOODRIGHT_ENVIRONMENT:-staging}}"
  local path
  path="$(wr_validation_freeze_path "$env_name")"
  rm -f "$path"
  echo "validation_freeze released path=$path" >&2
}

wr_validation_freeze_assert_clear_for_mutation() {
  local env_name="${1:-${WOODRIGHT_ENVIRONMENT:-staging}}"
  local path
  path="$(wr_validation_freeze_path "$env_name")"
  if [[ -f "$path" ]]; then
    local state
    state="$(python3 - "$path" <<'PY' 2>/dev/null || echo BAD
import json,sys,time
try:
  d=json.load(open(sys.argv[1]))
except Exception:
  print("BAD"); raise SystemExit(0)
if d.get("schema")!="woodright.validation_freeze.v1":
  print("BAD"); raise SystemExit(0)
try:
  exp=int(d.get("expires_at_unix"))
except Exception:
  print("BAD"); raise SystemExit(0)
print("ACTIVE" if exp>time.time() else "EXPIRED")
PY
)"
    case "$state" in
      EXPIRED) return 0 ;;
      ACTIVE)
        if [[ "${WOODRIGHT_VALIDATION_FREEZE_OVERRIDE:-0}" == "1" ]]; then
          local reason="${WOODRIGHT_VALIDATION_FREEZE_OVERRIDE_REASON:-}"
          [[ -n "$reason" && "$reason" != "unspecified" ]] || {
            echo "ERROR: override requires non-empty WOODRIGHT_VALIDATION_FREEZE_OVERRIDE_REASON" >&2
            return 1
          }
          echo "validation_freeze OVERRIDE environment=$env_name reason=$reason" >&2
          return 0
        fi
        echo "ERROR: validation freeze active for environment=$env_name; refuse mutation" >&2
        return 1
        ;;
      *)
        echo "ERROR: validation freeze lease malformed at $path; refuse mutation" >&2
        return 1
        ;;
    esac
  fi
  return 0
}
