#!/usr/bin/env bash
# Fail-closed path isolation across Woodright runtime environments.
# Ensures public_production never shares mutable state/backup/lock/media with
# public_demo or production_candidate (CLI id: production).
# shellcheck shell=bash

wr_ops_iso_log() { printf '%s wr_ops_path_isolation %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
wr_ops_iso_die() { wr_ops_iso_log "ERROR: $*"; return 1; }

# Known mutable path families that must never collide across environments.
wr_ops_iso_demo_paths() {
  cat <<'EOF'
/srv/woodright/monitoring/state
/srv/woodright/monitoring/history
/srv/woodright/backups/automated
/srv/woodright/locks/public_demo/live-cutover.lock
/srv/woodright/runtime-ownership-public-demo
/srv/woodright/runtime-identity-public-demo
/srv/woodright/meta/public_demo
/srv/woodright/reports/public_demo
EOF
}

wr_ops_iso_candidate_paths() {
  cat <<'EOF'
/srv/woodright/monitoring/production-candidate/state
/srv/woodright/monitoring/production-candidate/history
/srv/woodright/backups/automated/production-candidate
/srv/woodright/locks/production/live-cutover.lock
/srv/woodright/runtime-ownership-production
/srv/woodright/runtime-identity-production
/srv/woodright/reports/production
EOF
}

wr_ops_iso_public_production_required_paths() {
  cat <<'EOF'
/srv/woodright/monitoring/public-production/state
/srv/woodright/monitoring/public-production/history
/srv/woodright/backups/automated/public-production
/srv/woodright/locks/public_production/live-cutover.lock
/srv/woodright/runtime-ownership-public-production
/srv/woodright/runtime-identity-public-production
/srv/woodright/meta/public_production
/srv/woodright/reports/public_production
EOF
}

wr_ops_iso_paths_overlap() {
  local a="$1" b="$2"
  [[ -z "$a" || -z "$b" ]] && return 1
  # Exact equality only. Namespaced children under a shared parent
  # (e.g. backups/automated vs backups/automated/public-production) are intentional.
  [[ "$a" == "$b" ]] && return 0
  return 1
}

# Assert a candidate path does not collide with a banned family list (stdin).
wr_ops_iso_assert_not_in_family() {
  local candidate="$1" label="${2:-path}"
  local banned
  while IFS= read -r banned; do
    [[ -z "$banned" ]] && continue
    if wr_ops_iso_paths_overlap "$candidate" "$banned"; then
      wr_ops_iso_die "$label='$candidate' overlaps banned family path='$banned'"
      return 1
    fi
  done
  return 0
}

# After public_production profile load: refuse shared mutable paths.
wr_assert_public_production_path_isolation() {
  [[ "${WOODRIGHT_ENV_PROFILE_LOADED:-0}" == "1" ]] || {
    wr_ops_iso_die "profile not loaded"
    return 1
  }
  [[ "${WOODRIGHT_ENVIRONMENT:-}" == "public_production" ]] || {
    wr_ops_iso_die "expected environment=public_production got=${WOODRIGHT_ENVIRONMENT:-}"
    return 1
  }

  local backup="${WOODRIGHT_BACKUP_ROOT:-}"
  local mon_state="${WOODRIGHT_MONITOR_STATE:-${WOODRIGHT_MONITOR_STATE_ROOT:-}}"
  local mon_hist="${WOODRIGHT_MONITOR_HISTORY:-}"
  local lock="${WOODRIGHT_MUTATION_LOCK_PATH:-}"
  local ownership="${WOODRIGHT_OWNERSHIP_DIR:-}"
  local identity="${WOODRIGHT_IDENTITY_DIR:-}"
  local evidence="${WOODRIGHT_EVIDENCE_ROOT:-}"
  local media="${WOODRIGHT_MEDIA_VOLUME:-}"
  local db_alias="${WOODRIGHT_REQUIRED_DB_ALIAS:-}"
  local db_name="${WOODRIGHT_DB_NAME:-}"

  [[ -n "$backup" ]] || { wr_ops_iso_die "WOODRIGHT_BACKUP_ROOT empty"; return 1; }
  [[ -n "$mon_state" ]] || { wr_ops_iso_die "monitor state path empty"; return 1; }
  [[ -n "$lock" ]] || { wr_ops_iso_die "mutation lock empty"; return 1; }
  [[ -n "$ownership" ]] || { wr_ops_iso_die "ownership dir empty"; return 1; }
  [[ -n "$db_alias" ]] || { wr_ops_iso_die "DB alias empty"; return 1; }
  [[ -n "$db_name" ]] || { wr_ops_iso_die "DB name empty"; return 1; }
  [[ -n "$media" ]] || { wr_ops_iso_die "media volume empty"; return 1; }

  case "$backup" in
    /srv/woodright/backups/automated/public-production|/srv/woodright/backups/automated/public-production/*) ;;
    *) wr_ops_iso_die "BACKUP_ROOT must be under public-production tree: $backup"; return 1 ;;
  esac
  case "$mon_state" in
    /srv/woodright/monitoring/public-production/*) ;;
    *) wr_ops_iso_die "monitor state must be under public-production tree: $mon_state"; return 1 ;;
  esac
  case "$lock" in
    /srv/woodright/locks/public_production/*) ;;
    *) wr_ops_iso_die "lock must be under public_production locks: $lock"; return 1 ;;
  esac

  [[ "$db_alias" == "public_production_db" ]] || {
    wr_ops_iso_die "DB alias must be public_production_db got=$db_alias"
    return 1
  }
  [[ "$db_name" == "woodright_public_production" ]] || {
    wr_ops_iso_die "DB name must be woodright_public_production got=$db_name"
    return 1
  }
  [[ "$media" == "woodright-public-production_woodright_public_media" ]] || {
    wr_ops_iso_die "media volume identity mismatch: $media"
    return 1
  }

  for p in "$backup" "$mon_state" "$lock" "$ownership" "$identity" "$evidence"; do
    [[ -n "$p" ]] || continue
    wr_ops_iso_demo_paths | wr_ops_iso_assert_not_in_family "$p" "public_production_path" || return 1
    wr_ops_iso_candidate_paths | wr_ops_iso_assert_not_in_family "$p" "public_production_path" || return 1
  done

  if [[ -n "$mon_hist" ]]; then
    case "$mon_hist" in
      /srv/woodright/monitoring/public-production/*) ;;
      *) wr_ops_iso_die "monitor history must be under public-production tree: $mon_hist"; return 1 ;;
    esac
    wr_ops_iso_demo_paths | wr_ops_iso_assert_not_in_family "$mon_hist" "monitor_history" || return 1
    wr_ops_iso_candidate_paths | wr_ops_iso_assert_not_in_family "$mon_hist" "monitor_history" || return 1
  fi

  # Cross-field distinctness inside public_production (exact, not parent/child)
  if [[ "$backup" == "$mon_state" ]]; then
    wr_ops_iso_die "backup root and monitor state must not be identical"
    return 1
  fi
  if [[ "$backup" == "$lock" ]]; then
    wr_ops_iso_die "backup root and mutation lock must not be identical"
    return 1
  fi

  # Hard ban: must not equal demo/candidate mutable roots (exact)
  for banned in \
    /srv/woodright/monitoring/state \
    /srv/woodright/backups/automated \
    /srv/woodright/backups/automated/production-candidate \
    /srv/woodright/monitoring/production-candidate/state \
    /srv/woodright/locks/public_demo/live-cutover.lock \
    /srv/woodright/locks/production/live-cutover.lock
  do
    if [[ "$backup" == "$banned" || "$mon_state" == "$banned" || "$lock" == "$banned" ]]; then
      wr_ops_iso_die "path equals foreign environment root: $banned"
      return 1
    fi
  done

  wr_ops_iso_log "PASS environment=public_production backup=$backup monitor=$mon_state lock=$lock db_alias=$db_alias"
  return 0
}

# Generic: assert two environments do not share a mutable path pair.
wr_assert_environments_paths_isolated() {
  local left="$1" right="$2"
  [[ "$left" != "$right" ]] || { wr_ops_iso_die "same environment compared"; return 1; }
  local left_fn right_fn a b
  case "$left" in
    public_demo) left_fn=wr_ops_iso_demo_paths ;;
    production) left_fn=wr_ops_iso_candidate_paths ;;
    public_production) left_fn=wr_ops_iso_public_production_required_paths ;;
    *) wr_ops_iso_die "unknown left environment=$left"; return 1 ;;
  esac
  case "$right" in
    public_demo) right_fn=wr_ops_iso_demo_paths ;;
    production) right_fn=wr_ops_iso_candidate_paths ;;
    public_production) right_fn=wr_ops_iso_public_production_required_paths ;;
    *) wr_ops_iso_die "unknown right environment=$right"; return 1 ;;
  esac
  while IFS= read -r a; do
    [[ -z "$a" ]] && continue
    while IFS= read -r b; do
      [[ -z "$b" ]] && continue
      if wr_ops_iso_paths_overlap "$a" "$b"; then
        wr_ops_iso_die "path collision $left='$a' vs $right='$b'"
        return 1
      fi
    done < <("$right_fn")
  done < <("$left_fn")
  return 0
}
