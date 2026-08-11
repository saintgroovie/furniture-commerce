#!/usr/bin/env bash
# Production ownership metadata access contract (EXPECTED/ACTIVE_*).
#
# Sealed Option C: non-secret production ownership JSON must be installed as
#   owner=root  group=woodright-ops  mode=0640
# so privileged writers remain root while members of woodright-ops (operator)
# can read without write, and the files are never world-readable.
#
# Public_demo keeps its own operator-owned contract and must not call this.
#
# shellcheck shell=bash

wr_prod_ownership_access_defaults() {
  : "${WOODRIGHT_PRODUCTION_OWNERSHIP_OWNER:=root}"
  : "${WOODRIGHT_PRODUCTION_OWNERSHIP_GROUP:=woodright-ops}"
  : "${WOODRIGHT_PRODUCTION_OWNERSHIP_MODE:=0640}"
  : "${WOODRIGHT_PRODUCTION_OWNERSHIP_OPERATOR_USER:=leonid}"
}

wr_prod_ownership_group_exists() {
  wr_prod_ownership_access_defaults
  local g="$WOODRIGHT_PRODUCTION_OWNERSHIP_GROUP"
  # Prefer explicit if/then so a missing getent hit cannot trip set -e mid-function.
  if command -v getent >/dev/null 2>&1; then
    if getent group "$g" >/dev/null 2>&1; then
      return 0
    fi
  fi
  # macOS / limited environments
  if command -v dscl >/dev/null 2>&1; then
    if dscl . -read "/Groups/$g" RecordName >/dev/null 2>&1; then
      return 0
    fi
  fi
  if grep -E "^${g}:" /etc/group >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

wr_prod_ownership_mode_ok() {
  # Sealed production contract requires exactly 0640 (non-world, group-read, no group-write).
  local mode="$1"
  [[ "$mode" == "0640" || "$mode" == "640" ]] || return 1
  return 0
}

# Ensure group exists and operator is a member (installer/bootstrap only).
# Fail closed if groupadd/usermod unavailable when creating on canonical hosts.
wr_prod_ownership_ensure_group() {
  wr_prod_ownership_access_defaults
  local g="$WOODRIGHT_PRODUCTION_OWNERSHIP_GROUP"
  local u="$WOODRIGHT_PRODUCTION_OWNERSHIP_OPERATOR_USER"
  if wr_prod_ownership_group_exists; then
    :
  else
    if command -v groupadd >/dev/null 2>&1; then
      if [[ "$(id -u)" -eq 0 ]]; then
        groupadd -f "$g" || return 1
      elif command -v sudo >/dev/null 2>&1; then
        sudo -n groupadd -f "$g" || return 1
      else
        echo "ERROR: cannot create group $g (need root/sudo -n)" >&2
        return 1
      fi
    else
      echo "ERROR: group $g missing and groupadd unavailable" >&2
      return 1
    fi
  fi
  # Membership (idempotent best-effort)
  if id -nG "$u" 2>/dev/null | tr ' ' '\n' | grep -qx "$g"; then
    return 0
  fi
  if command -v usermod >/dev/null 2>&1; then
    if [[ "$(id -u)" -eq 0 ]]; then
      usermod -aG "$g" "$u" || return 1
    elif command -v sudo >/dev/null 2>&1; then
      sudo -n usermod -aG "$g" "$u" || return 1
    else
      echo "ERROR: cannot add $u to $g (need root/sudo -n)" >&2
      return 1
    fi
  else
    echo "ERROR: usermod unavailable; cannot add $u to $g" >&2
    return 1
  fi
  return 0
}

# Apply exact access contract to one live ownership file. Fail closed.
wr_prod_ownership_apply_access() {
  local path="${1:?}"
  wr_prod_ownership_access_defaults
  local owner="$WOODRIGHT_PRODUCTION_OWNERSHIP_OWNER"
  local group="$WOODRIGHT_PRODUCTION_OWNERSHIP_GROUP"
  local mode="$WOODRIGHT_PRODUCTION_OWNERSHIP_MODE"

  [[ -f "$path" ]] || {
    echo "ERROR: ownership file missing: $path" >&2
    return 1
  }
  wr_prod_ownership_mode_ok "$mode" || {
    echo "ERROR: refused ownership mode $mode (must be exactly 0640)" >&2
    return 1
  }
  wr_prod_ownership_group_exists || {
    echo "ERROR: required ownership group missing: $group (run installer ensure-group first)" >&2
    return 1
  }

  # Apply ownership while mode is still restrictive, then open group-read.
  # If chown fails, do not leave a widened mode on the prior group.
  if ! chown "${owner}:${group}" "$path" 2>/dev/null; then
    if command -v sudo >/dev/null 2>&1 && sudo -n chown "${owner}:${group}" "$path" 2>/dev/null; then
      :
    else
      echo "ERROR: chown ${owner}:${group} failed for $path" >&2
      return 1
    fi
  fi

  if ! chmod "$mode" "$path" 2>/dev/null; then
    if command -v sudo >/dev/null 2>&1 && sudo -n chmod "$mode" "$path" 2>/dev/null; then
      :
    else
      echo "ERROR: chmod $mode failed for $path" >&2
      return 1
    fi
  fi

  # Verify resulting ownership/mode (portable via python).
  if ! OWNER="$owner" GROUP="$group" MODE="$mode" PATH_F="$path" python3 - <<'PY'
import os, stat, pwd, grp, sys
path = os.environ["PATH_F"]
want_owner = os.environ["OWNER"]
want_group = os.environ["GROUP"]
want_mode = int(os.environ["MODE"], 8)
st = os.stat(path)
got_mode = stat.S_IMODE(st.st_mode)
if got_mode != want_mode:
    print(f"mode mismatch path={path} got={oct(got_mode)} want={oct(want_mode)}", file=sys.stderr)
    raise SystemExit(1)
if got_mode & 0o007:
    print(f"world bits set path={path} mode={oct(got_mode)}", file=sys.stderr)
    raise SystemExit(1)
try:
    got_owner = pwd.getpwuid(st.st_uid).pw_name
except KeyError:
    got_owner = str(st.st_uid)
try:
    got_group = grp.getgrgid(st.st_gid).gr_name
except KeyError:
    got_group = str(st.st_gid)
if got_owner != want_owner or got_group != want_group:
    print(
        f"owner/group mismatch path={path} got={got_owner}:{got_group} want={want_owner}:{want_group}",
        file=sys.stderr,
    )
    raise SystemExit(1)
print("ok")
PY
  then
    return 1
  fi
  return 0
}
