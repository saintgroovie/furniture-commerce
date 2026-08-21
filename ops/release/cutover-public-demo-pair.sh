#!/usr/bin/env bash
# LIVE_MUTATING=true
# requires_global_lock=true
# Official pair cutover for public_demo (staging): backend + storefront under one flock.
# Backend-first (storefront depends on API; SF can briefly use old or new BE during transition).
# Does NOT run DB migrations. Does NOT touch production / woodright.ru / DNS.
# Requires: --environment public_demo --component pair
# Canonical lock: environment-scoped via profile (public_demo → /srv/woodright/locks/public_demo/live-cutover.lock)
set -Eeuo pipefail
IFS=$'\n\t'

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
# shellcheck source=../lib/woodright-environment-profile.sh
source "$HERE/../lib/woodright-environment-profile.sh"
# shellcheck source=../lib/woodright-staging-mutation-lock.sh
source "$HERE/../lib/woodright-staging-mutation-lock.sh"
# shellcheck source=../lib/woodright-validation-freeze.sh
source "$HERE/../lib/woodright-validation-freeze.sh"
# shellcheck source=../lib/woodright-cutover-common.sh
source "$HERE/../lib/woodright-cutover-common.sh"
# shellcheck source=../lib/woodright-component-authority.sh
source "$HERE/../lib/woodright-component-authority.sh"
# shellcheck source=../lib/woodright-oci-provenance.sh
source "$HERE/../lib/woodright-oci-provenance.sh"
# shellcheck source=../lib/woodright-owner-approved-release.sh
source "$HERE/../lib/woodright-owner-approved-release.sh"

MODE="dry-run"
OWNER_APPROVAL_CHECKSUM_GATE_A=""
CONFIRM=""
TARGET_SHA=""
BE_DIGEST=""
SF_DIGEST=""
BE_IMAGE=""
SF_IMAGE=""
EXPECTED_OLD_SHA=""
EXPECTED_OLD_BE_DIGEST=""
EXPECTED_OLD_SF_DIGEST=""
EXPECTED_OLD_BE_ID=""
EXPECTED_OLD_SF_ID=""
EVIDENCE_DIR=""
BE_ENV_FILE=""
SF_ENV_FILE=""
PDP_URL=""
SKIP_BACKUP="${SKIP_BACKUP:-0}"
SKIP_MONITOR="${SKIP_MONITOR:-0}"
SKIP_SMOKE="${SKIP_SMOKE:-0}"
MUTATION_STARTED=0
BE_KEEP=""
SF_KEEP=""
OLD_BE_DIGEST=""
OLD_SF_DIGEST=""
OLD_BE_ID=""
OLD_SF_ID=""
PRELOCK_BE_DIGEST=""
PRELOCK_SF_DIGEST=""
PRELOCK_BE_ID=""
PRELOCK_SF_ID=""
ROLLBACK_RC=0

# Exit codes
# 0 success | 2 usage | 3 lock | 10 rollback_ok | 11 rollback_partial | 12 rollback_failed | 20 unsafe dry-run | 21 verify fail

usage() {
  cat <<'EOF'
Usage: cutover-public-demo-pair.sh --environment public_demo --mode <mode> [options]

Modes: dry-run | preflight | execute | verify

Required:
  --target-sha <40hex>
  --backend-digest sha256:<64hex>
  --storefront-digest sha256:<64hex>
  --evidence-dir <absolute path outside git>

Execute additionally:
  --backend-env-file <mode 600>
  --storefront-env-file <mode 600>
  --confirm-mutation I_UNDERSTAND_PUBLIC_DEMO_CUTOVER
  [--expected-old-sha <40hex>]
  [--expected-old-backend-digest sha256:<64hex>]
  [--expected-old-storefront-digest sha256:<64hex>]
  [--expected-old-backend-id <docker-id>]
  [--expected-old-storefront-id <docker-id>]
  [--pdp-url <https://woodright-demo.ru/products/...>]

Optional images (default ghcr.io/saintgroovie/woodright-{backend,storefront}@DIGEST):
  --backend-image ...
  --storefront-image ...

Dry-run: no lock mutation on canonical path when WR_CUTOVER_USE_TEST_LOCK=1;
         never writes pins, never stops containers, never creates backup.
EOF
}

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $*"; exit 2; }

# Bind nested recreate owner-approval peers from the already-validated pair plan.
# Incident (release 74fbad4): pair exported WOODRIGHT_OWNER_APPROVAL_REQUIRE_PAIR=1
# but nested backend/storefront recreate resolved empty peer digests → OWNER_APPROVAL_MISMATCH
# unless the operator manually exported WOODRIGHT_OWNER_APPROVAL_PEER_*.
# Peer values MUST come from pair --backend-digest/--storefront-digest (Gate A identity).
# Caller-supplied PEER_*/EXPECTED_* that disagree with the pair plan are refused (no spoof).
bind_pair_owner_approval_peers() {
  wr_cutover_require_digest "$BE_DIGEST" || die "pair peer bind: backend digest invalid"
  wr_cutover_require_digest "$SF_DIGEST" || die "pair peer bind: storefront digest invalid"
  [[ "$BE_DIGEST" != "$SF_DIGEST" ]] || die "pair peer bind: backend and storefront digests must differ"

  local caller_peer_sf="${WOODRIGHT_OWNER_APPROVAL_PEER_SF_DIGEST:-}"
  local caller_peer_be="${WOODRIGHT_OWNER_APPROVAL_PEER_BE_DIGEST:-}"
  local caller_exp_sf="${EXPECTED_STOREFRONT_DIGEST:-}"
  local caller_exp_be="${EXPECTED_BACKEND_DIGEST:-}"

  if [[ -n "$caller_peer_sf" && "$caller_peer_sf" != "$SF_DIGEST" ]]; then
    die "caller WOODRIGHT_OWNER_APPROVAL_PEER_SF_DIGEST mismatch vs pair plan want=$SF_DIGEST have=$caller_peer_sf"
  fi
  if [[ -n "$caller_peer_be" && "$caller_peer_be" != "$BE_DIGEST" ]]; then
    die "caller WOODRIGHT_OWNER_APPROVAL_PEER_BE_DIGEST mismatch vs pair plan want=$BE_DIGEST have=$caller_peer_be"
  fi
  if [[ -n "$caller_exp_sf" && "$caller_exp_sf" != "$SF_DIGEST" ]]; then
    die "caller EXPECTED_STOREFRONT_DIGEST mismatch vs pair plan want=$SF_DIGEST have=$caller_exp_sf"
  fi
  if [[ -n "$caller_exp_be" && "$caller_exp_be" != "$BE_DIGEST" ]]; then
    die "caller EXPECTED_BACKEND_DIGEST mismatch vs pair plan want=$BE_DIGEST have=$caller_exp_be"
  fi

  export WOODRIGHT_OWNER_APPROVAL_PEER_SF_DIGEST="$SF_DIGEST"
  export WOODRIGHT_OWNER_APPROVAL_PEER_BE_DIGEST="$BE_DIGEST"
  # Secondary fallbacks used by recreate helpers when PEER_* unset; keep aligned to plan.
  export EXPECTED_STOREFRONT_DIGEST="$SF_DIGEST"
  export EXPECTED_BACKEND_DIGEST="$BE_DIGEST"
  export WOODRIGHT_CUTOVER_EVIDENCE_DIR="${WOODRIGHT_CUTOVER_EVIDENCE_DIR:-$EVIDENCE_DIR}"

  if [[ -n "${EVIDENCE_DIR:-}" ]]; then
    mkdir -p "$EVIDENCE_DIR/json"
    printf '%s\n' "$SF_DIGEST" >"$EVIDENCE_DIR/json/owner-approval-peer-sf-digest.txt"
    printf '%s\n' "$BE_DIGEST" >"$EVIDENCE_DIR/json/owner-approval-peer-be-digest.txt"
  fi
  log "owner_approval_peers_bound peer_be=$BE_DIGEST peer_sf=$SF_DIGEST"
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --help|-h) usage; exit 0 ;;
      --environment) shift 2 ;;
      --environment=*) shift ;;
      --component) shift 2 ;;
      --component=*) shift ;;
      --mode) MODE="${2:?}"; shift 2 ;;
      --mode=*) MODE="${1#--mode=}"; shift ;;
      --target-sha) TARGET_SHA="${2:?}"; shift 2 ;;
      --target-sha=*) TARGET_SHA="${1#--target-sha=}"; shift ;;
      --backend-digest) BE_DIGEST="${2:?}"; shift 2 ;;
      --backend-digest=*) BE_DIGEST="${1#--backend-digest=}"; shift ;;
      --storefront-digest) SF_DIGEST="${2:?}"; shift 2 ;;
      --storefront-digest=*) SF_DIGEST="${1#--storefront-digest=}"; shift ;;
      --backend-image) BE_IMAGE="${2:?}"; shift 2 ;;
      --storefront-image) SF_IMAGE="${2:?}"; shift 2 ;;
      --expected-old-sha) EXPECTED_OLD_SHA="${2:?}"; shift 2 ;;
      --expected-old-sha=*) EXPECTED_OLD_SHA="${1#--expected-old-sha=}"; shift ;;
      --expected-old-backend-digest) EXPECTED_OLD_BE_DIGEST="${2:?}"; shift 2 ;;
      --expected-old-backend-digest=*) EXPECTED_OLD_BE_DIGEST="${1#--expected-old-backend-digest=}"; shift ;;
      --expected-old-storefront-digest) EXPECTED_OLD_SF_DIGEST="${2:?}"; shift 2 ;;
      --expected-old-storefront-digest=*) EXPECTED_OLD_SF_DIGEST="${1#--expected-old-storefront-digest=}"; shift ;;
      --expected-old-backend-id) EXPECTED_OLD_BE_ID="${2:?}"; shift 2 ;;
      --expected-old-backend-id=*) EXPECTED_OLD_BE_ID="${1#--expected-old-backend-id=}"; shift ;;
      --expected-old-storefront-id) EXPECTED_OLD_SF_ID="${2:?}"; shift 2 ;;
      --expected-old-storefront-id=*) EXPECTED_OLD_SF_ID="${1#--expected-old-storefront-id=}"; shift ;;
      --evidence-dir) EVIDENCE_DIR="${2:?}"; shift 2 ;;
      --evidence-dir=*) EVIDENCE_DIR="${1#--evidence-dir=}"; shift ;;
      --backend-env-file) BE_ENV_FILE="${2:?}"; shift 2 ;;
      --storefront-env-file) SF_ENV_FILE="${2:?}"; shift 2 ;;
      --confirm-mutation) CONFIRM="${2:?}"; shift 2 ;;
      --confirm-mutation=*) CONFIRM="${1#--confirm-mutation=}"; shift ;;
      --pdp-url) PDP_URL="${2:?}"; shift 2 ;;
      *) shift ;;
    esac
  done
}

default_images() {
  BE_IMAGE="${BE_IMAGE:-ghcr.io/saintgroovie/woodright-backend@${BE_DIGEST}}"
  SF_IMAGE="${SF_IMAGE:-ghcr.io/saintgroovie/woodright-storefront@${SF_DIGEST}}"
}

scope_gate() {
  [[ "${WOODRIGHT_ENVIRONMENT}" == "public_demo" ]] || die "pair cutover only supports --environment public_demo"
  [[ "${WOODRIGHT_REQUIRED_RUNTIME_ROLE}" == "public_demo" ]] || die "profile runtime role must be public_demo"
  local be sf
  be="${WOODRIGHT_BE_CONTAINER_DEFAULT}"
  sf="${WOODRIGHT_SF_CONTAINER_DEFAULT}"
  wr_cutover_refuse_production_name "$be" || exit 2
  wr_cutover_refuse_production_name "$sf" || exit 2
  case "$be" in *production*) die "production BE name" ;; esac
  case "$sf" in *production*) die "production SF name" ;; esac
}

_digest_from_inspect_json() {
  python3 - "$1" <<'PY'
import json,sys,re
d=json.load(open(sys.argv[1]))
obj=d[0] if isinstance(d, list) else d
img=(obj.get("Config") or {}).get("Image","") or str(obj.get("Image",""))
m=re.search(r'sha256:[0-9a-f]{64}', img)
print(m.group(0) if m else "")
PY
}

capture_old_identity() {
  local be="${WOODRIGHT_BE_CONTAINER_DEFAULT}"
  local sf="${WOODRIGHT_SF_CONTAINER_DEFAULT}"
  wr_cutover_docker inspect "$be" | wr_cutover_sanitize_inspect_json >"$EVIDENCE_DIR/sanitized/backend-before.json"
  wr_cutover_docker inspect "$sf" | wr_cutover_sanitize_inspect_json >"$EVIDENCE_DIR/sanitized/storefront-before.json"
  # Prefer immutable RepoDigest via image inspect (never container .RepoDigests).
  OLD_BE_DIGEST="$(wr_cutover_container_immutable_digest "$be" backend)" \
    || OLD_BE_DIGEST="$(_digest_from_inspect_json "$EVIDENCE_DIR/sanitized/backend-before.json")"
  OLD_SF_DIGEST="$(wr_cutover_container_immutable_digest "$sf" storefront)" \
    || OLD_SF_DIGEST="$(_digest_from_inspect_json "$EVIDENCE_DIR/sanitized/storefront-before.json")"
  wr_cutover_require_digest "$OLD_BE_DIGEST" || die "old backend digest unresolved"
  wr_cutover_require_digest "$OLD_SF_DIGEST" || die "old storefront digest unresolved"
  OLD_BE_ID="$(wr_cutover_docker inspect "$be" --format '{{.Id}}' 2>/dev/null || true)"
  OLD_SF_ID="$(wr_cutover_docker inspect "$sf" --format '{{.Id}}' 2>/dev/null || true)"
  printf '%s\n' "$OLD_BE_DIGEST" >"$EVIDENCE_DIR/json/old-backend-digest.txt"
  printf '%s\n' "$OLD_SF_DIGEST" >"$EVIDENCE_DIR/json/old-storefront-digest.txt"
  printf '%s\n' "$OLD_BE_ID" >"$EVIDENCE_DIR/json/old-backend-id.txt"
  printf '%s\n' "$OLD_SF_ID" >"$EVIDENCE_DIR/json/old-storefront-id.txt"
  # Live release SHA labels (both sides must agree when both present)
  OLD_BE_SHA="$(wr_cutover_docker inspect "$be" --format '{{index .Config.Labels "com.woodright.release-sha"}}' 2>/dev/null || true)"
  OLD_SF_SHA="$(wr_cutover_docker inspect "$sf" --format '{{index .Config.Labels "com.woodright.release-sha"}}' 2>/dev/null || true)"
  printf '%s\n' "$OLD_BE_SHA" >"$EVIDENCE_DIR/json/old-backend-release-sha.txt"
  printf '%s\n' "$OLD_SF_SHA" >"$EVIDENCE_DIR/json/old-storefront-release-sha.txt"
  if [[ -n "$OLD_BE_SHA" && -n "$OLD_SF_SHA" && "$OLD_BE_SHA" != "$OLD_SF_SHA" ]]; then
    die "split live release SHA be=$OLD_BE_SHA sf=$OLD_SF_SHA"
  fi
  if [[ -n "$EXPECTED_OLD_SHA" ]]; then
    wr_cutover_require_full_sha "$EXPECTED_OLD_SHA" || exit 2
    if [[ -z "$OLD_BE_SHA" || -z "$OLD_SF_SHA" ]]; then
      die "expected-old-sha set but live release-sha labels missing (be='${OLD_BE_SHA}' sf='${OLD_SF_SHA}'); use --expected-old-*-digest/--expected-old-*-id instead"
    fi
    if [[ "$OLD_BE_SHA" != "$EXPECTED_OLD_SHA" || "$OLD_SF_SHA" != "$EXPECTED_OLD_SHA" ]]; then
      die "live release sha mismatch want=$EXPECTED_OLD_SHA be=$OLD_BE_SHA sf=$OLD_SF_SHA"
    fi
  fi
  if [[ -n "$EXPECTED_OLD_BE_DIGEST" ]]; then
    wr_cutover_require_digest "$EXPECTED_OLD_BE_DIGEST" || exit 2
    [[ "$OLD_BE_DIGEST" == "$EXPECTED_OLD_BE_DIGEST" ]] || die "expected-old-backend-digest mismatch want=$EXPECTED_OLD_BE_DIGEST got=$OLD_BE_DIGEST"
  fi
  if [[ -n "$EXPECTED_OLD_SF_DIGEST" ]]; then
    wr_cutover_require_digest "$EXPECTED_OLD_SF_DIGEST" || exit 2
    [[ "$OLD_SF_DIGEST" == "$EXPECTED_OLD_SF_DIGEST" ]] || die "expected-old-storefront-digest mismatch want=$EXPECTED_OLD_SF_DIGEST got=$OLD_SF_DIGEST"
  fi
  if [[ -n "$EXPECTED_OLD_BE_ID" ]]; then
    [[ "$OLD_BE_ID" == "$EXPECTED_OLD_BE_ID" || "$OLD_BE_ID" == "${EXPECTED_OLD_BE_ID}"* ]] \
      || die "expected-old-backend-id mismatch want=$EXPECTED_OLD_BE_ID got=$OLD_BE_ID"
  fi
  if [[ -n "$EXPECTED_OLD_SF_ID" ]]; then
    [[ "$OLD_SF_ID" == "$EXPECTED_OLD_SF_ID" || "$OLD_SF_ID" == "${EXPECTED_OLD_SF_ID}"* ]] \
      || die "expected-old-storefront-id mismatch want=$EXPECTED_OLD_SF_ID got=$OLD_SF_ID"
  fi
}

assert_identity_stable_under_lock() {
  # Compare under-lock capture to pre-lock snapshot (TOCTOU gate).
  [[ -n "$PRELOCK_BE_ID" && -n "$PRELOCK_SF_ID" ]] || die "pre-lock identity snapshot missing"
  [[ -n "$PRELOCK_BE_DIGEST" && -n "$PRELOCK_SF_DIGEST" ]] || die "pre-lock digest snapshot missing"
  [[ "$OLD_BE_ID" == "$PRELOCK_BE_ID" ]] || die "TOCTOU backend id changed pre=$PRELOCK_BE_ID under=$OLD_BE_ID"
  [[ "$OLD_SF_ID" == "$PRELOCK_SF_ID" ]] || die "TOCTOU storefront id changed pre=$PRELOCK_SF_ID under=$OLD_SF_ID"
  [[ "$OLD_BE_DIGEST" == "$PRELOCK_BE_DIGEST" ]] || die "TOCTOU backend digest changed pre=$PRELOCK_BE_DIGEST under=$OLD_BE_DIGEST"
  [[ "$OLD_SF_DIGEST" == "$PRELOCK_SF_DIGEST" ]] || die "TOCTOU storefront digest changed pre=$PRELOCK_SF_DIGEST under=$OLD_SF_DIGEST"
  printf '%s\n' "ok" >"$EVIDENCE_DIR/json/identity-toctou-pass.txt"
}

check_no_migration() {
  # Image-only tool: never auto-migrate. Operator panic switch still honored.
  if [[ "${WOODRIGHT_PENDING_MIGRATION:-0}" == "1" ]]; then
    die "pending migration detected (WOODRIGHT_PENDING_MIGRATION=1) - refuse pair cutover"
  fi
  # Evidence-backed: target SHA must not introduce migration files vs expected old when provided.
  if [[ -n "${EXPECTED_OLD_SHA:-}" && -d "${REPO_ROOT}/apps/backend" ]]; then
    if command -v git >/dev/null 2>&1 && git -C "$REPO_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      local mig_diff
      mig_diff="$(git -C "$REPO_ROOT" diff --name-only "${EXPECTED_OLD_SHA}..${TARGET_SHA}" -- \
        'apps/backend/src/migrations' 'apps/backend/migrations' '**/migrations/**' 2>/dev/null)" || {
        die "migration gate git diff failed for ${EXPECTED_OLD_SHA}..${TARGET_SHA}"
      }
      if [[ -n "$(echo "$mig_diff" | sed "/^$/d")" ]]; then
        die "migration files changed between $EXPECTED_OLD_SHA and $TARGET_SHA - refuse image-only cutover"
      fi
    fi
  fi
  printf '{"migration_required":false,"policy":"image_only_cutover","checked_pending_env":true}\n' >"$EVIDENCE_DIR/json/migration-gate.json"
}

check_monitor() {
  [[ "$SKIP_MONITOR" == "1" ]] && return 0
  if [[ "${WOODRIGHT_CUTOVER_FAKE_MONITOR:-}" == "red" ]]; then
    die "monitor red (harness)"
  fi
  if [[ "${WOODRIGHT_CUTOVER_FAKE_MONITOR:-}" == "ok" ]]; then
    log "monitor ok (harness)"
    return 0
  fi
  # Never exec the health-check binary as the current user from cutover:
  # non-root runs can mis-read root-only backup manifests and overwrite
  # last-status.json to a false critical. Read the authoritative state file.
  local state_json="${WOODRIGHT_MONITOR_STATE_JSON:-/srv/woodright/monitoring/state/last-status.json}"
  local max_age_s="${WOODRIGHT_MONITOR_MAX_AGE_S:-1800}"
  local skew_s="${WOODRIGHT_MONITOR_CLOCK_SKEW_S:-120}"
  local refresh="${WOODRIGHT_REFRESH_MONITOR:-0}"
  local use_sudo_reader=0

  if [[ "$refresh" == "1" && "$MODE" == "execute" ]]; then
    if command -v systemctl >/dev/null 2>&1 && sudo -n systemctl start woodright-monitor.service >/dev/null 2>&1; then
      log "refreshed woodright-monitor.service via sudo -n"
      sleep 2
    else
      log "WARN monitor refresh unavailable (sudo -n systemctl); reading existing state"
    fi
  fi

  if [[ -r "$state_json" ]]; then
    use_sudo_reader=0
  elif command -v sudo >/dev/null 2>&1 && sudo -n test -r "$state_json" >/dev/null 2>&1; then
    use_sudo_reader=1
  else
    die "monitor state unreadable: $state_json (need world-readable last-status.json or sudo -n)"
  fi

  local overall age_s
  if [[ "$use_sudo_reader" == "1" ]]; then
    overall="$(sudo -n python3 - "$state_json" <<'PY'
import json,sys
print(json.load(open(sys.argv[1])).get("overall",""))
PY
)"
    age_s="$(sudo -n python3 - "$state_json" <<'PY'
import json,sys,time,re
from datetime import datetime,timezone
obj=json.load(open(sys.argv[1]))
ts=str(obj.get("timestamp_utc") or "")
m=re.fullmatch(r"(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z", ts)
if not m:
  print(999999); raise SystemExit
dt=datetime(int(m[1]),int(m[2]),int(m[3]),int(m[4]),int(m[5]),int(m[6]),tzinfo=timezone.utc)
print(int(time.time()-dt.timestamp()))
PY
)"
  else
    overall="$(python3 - "$state_json" <<'PY'
import json,sys
print(json.load(open(sys.argv[1])).get("overall",""))
PY
)"
    age_s="$(python3 - "$state_json" <<'PY'
import json,sys,time,re
from datetime import datetime,timezone
obj=json.load(open(sys.argv[1]))
ts=str(obj.get("timestamp_utc") or "")
m=re.fullmatch(r"(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z", ts)
if not m:
  print(999999); raise SystemExit
dt=datetime(int(m[1]),int(m[2]),int(m[3]),int(m[4]),int(m[5]),int(m[6]),tzinfo=timezone.utc)
print(int(time.time()-dt.timestamp()))
PY
)"
  fi
  printf '{"state_json":"%s","overall":"%s","age_s":%s,"max_age_s":%s,"skew_s":%s,"mode":"%s","sudo_reader":%s}\n' \
    "$state_json" "$overall" "$age_s" "$max_age_s" "$skew_s" "$MODE" "$use_sudo_reader" >"$EVIDENCE_DIR/json/monitor-gate.json"
  [[ "$overall" == "ok" ]] || die "monitor overall=$overall (want=ok) from $state_json"
  if [[ "$age_s" -lt $((0 - skew_s)) ]]; then
    die "monitor timestamp in the future age_s=$age_s skew_s=$skew_s from $state_json"
  fi
  if [[ "$age_s" -gt "$max_age_s" ]]; then
    die "monitor stale age_s=$age_s max_age_s=$max_age_s from $state_json"
  fi
  log "monitor gate pass overall=ok age_s=$age_s"
}

run_backup_gate() {
  [[ "$SKIP_BACKUP" == "1" ]] && {
    log "backup skipped (SKIP_BACKUP=1 harness only)"
    return 0
  }
  if [[ "$MODE" != "execute" ]]; then
    log "backup not run in mode=$MODE"
    return 0
  fi
  local bak="/srv/woodright/ops/backup/woodright-backup-run.sh"
  if [[ ! -x "$bak" ]]; then
    die "official backup helper missing: $bak"
  fi
  sudo -n "$bak" || die "backup helper failed"
  wr_cutover_pin_backup "$EVIDENCE_DIR" || die "pin backup failed"
}

pair_rollback() {
  # Peer SF digest must be the pre-mutation OLD_SF_DIGEST (wired by execute path).
  export WOODRIGHT_ROLLBACK_EXPECT_SF_DIGEST="${WOODRIGHT_ROLLBACK_EXPECT_SF_DIGEST:-${OLD_SF_DIGEST:-}}"
  ROLLBACK_RC=12
  wr_cutover_pair_rollback \
    "$EVIDENCE_DIR" \
    "${BE_KEEP:-}" \
    "${SF_KEEP:-}" \
    "$HERE/rollback-staging-backend-from-keeper.sh" \
    "$HERE/rollback-staging-storefront-from-keeper.sh" \
    || true
  return "$ROLLBACK_RC"
}

verify_pair() {
  local be="${WOODRIGHT_BE_CONTAINER_DEFAULT}"
  local sf="${WOODRIGHT_SF_CONTAINER_DEFAULT}"
  local be_d sf_d
  be_d="$(wr_cutover_container_immutable_digest "$be" backend)" || return 1
  sf_d="$(wr_cutover_container_immutable_digest "$sf" storefront)" || return 1
  [[ "$be_d" == "$BE_DIGEST" ]] || return 1
  [[ "$sf_d" == "$SF_DIGEST" ]] || return 1
  local role_sf role_be owner_sf owner_be db_sf db_be
  role_sf="$(wr_cutover_docker inspect "$sf" --format '{{index .Config.Labels "com.woodright.runtime-role"}}')"
  role_be="$(wr_cutover_docker inspect "$be" --format '{{index .Config.Labels "com.woodright.runtime-role"}}')"
  owner_sf="$(wr_cutover_docker inspect "$sf" --format '{{index .Config.Labels "com.woodright.deployment-owner"}}')"
  owner_be="$(wr_cutover_docker inspect "$be" --format '{{index .Config.Labels "com.woodright.deployment-owner"}}')"
  db_sf="$(wr_cutover_docker inspect "$sf" --format '{{index .Config.Labels "com.woodright.database-identity"}}')"
  db_be="$(wr_cutover_docker inspect "$be" --format '{{index .Config.Labels "com.woodright.database-identity"}}')"
  [[ "$role_sf" == "public_demo" ]] || return 1
  [[ "$role_be" == "public_demo" ]] || return 1
  [[ "$owner_sf" == "Dokploy" && "$owner_be" == "Dokploy" ]] || return 1
  [[ "$db_sf" == "public_demo_db" && "$db_be" == "public_demo_db" ]] || return 1
  if [[ "${SKIP_PUBLIC_VERIFY:-0}" == "1" ]]; then
    return 0
  fi
  local api sfh
  api="$(curl -sS --max-time 20 -D - -o /dev/null "${WOODRIGHT_API_HOST%/}/health" || true)"
  sfh="$(curl -sS --max-time 20 -D - -o /dev/null "${WOODRIGHT_BUYER_HOST%/}/" || true)"
  printf '%s\n' "$api" >"$EVIDENCE_DIR/raw/api-headers.txt"
  printf '%s\n' "$sfh" >"$EVIDENCE_DIR/raw/sf-headers.txt"
  echo "$sfh" | grep -qi "x-woodright-release-sha: ${TARGET_SHA}" || return 1
  echo "$api" | grep -qi "x-woodright-release-sha: ${TARGET_SHA}" || return 1
  echo "$sfh" | grep -qi "x-robots-tag:.*noindex" || return 1
  echo "$sfh" | grep -qi "x-woodright-runtime-role: public_demo" || return 1
  echo "$sfh" | grep -qi "x-woodright-database-identity: public_demo_db" || return 1
  return 0
}

run_smoke() {
  [[ "$SKIP_SMOKE" == "1" ]] && return 0
  local -a smoke_args=(
    --buyer-host "${WOODRIGHT_BUYER_HOST}"
    --api-host "${WOODRIGHT_API_HOST}"
    --expect-sha "$TARGET_SHA"
  )
  if [[ -n "$PDP_URL" ]]; then
    smoke_args+=(--pdp-url "$PDP_URL")
  fi
  bash "$HERE/public-demo-critical-http-smoke.sh" "${smoke_args[@]}"
}

FULL_ARGV=("$@")
wr_require_environment_from_args "${FULL_ARGV[@]}" || exit 1
wr_require_component_from_args "${FULL_ARGV[@]}" || die "missing required --component pair"
[[ "${WOODRIGHT_COMPONENT_SCOPE}" == "pair" ]] || die "pair cutover requires --component pair"
parse_args "${FULL_ARGV[@]}"
scope_gate
wr_assert_environment_provisioned || exit 1
wr_validation_freeze_assert_clear_for_mutation "$WOODRIGHT_ENVIRONMENT" || exit 1
wr_prelock_validate_environment_target || exit 1

case "$MODE" in
  dry-run|preflight|execute|verify) ;;
  *) die "invalid mode=$MODE" ;;
esac

# Refuse while a governance install is incomplete/in-progress (SIGKILL mixed-bundle guard).
GOV_IN_PROGRESS="${WOODRIGHT_GOVERNANCE_IN_PROGRESS:-/srv/woodright/tools/release/ENV_GOVERNANCE_INSTALL_IN_PROGRESS.json}"
if [[ -f "$GOV_IN_PROGRESS" ]]; then
  die "governance install in progress or incomplete: $GOV_IN_PROGRESS"
fi
# Hold the exclusive install lock for this process lifetime (FD 8) so an installer
# cannot replace scripts between this gate and the cutover runtime lock.
# Requires util-linux flock on the VM; harnesses without the lock dir skip.
GOV_INSTALL_LOCK="${WOODRIGHT_INSTALL_LOCK_PATH:-/srv/woodright/locks/env-governance-install.lock}"
GOV_INSTALL_LOCK_DIR="$(dirname "$GOV_INSTALL_LOCK")"
if [[ "${WOODRIGHT_SKIP_GOV_INSTALL_LOCK:-0}" != "1" ]] \
  && { [[ -e "$GOV_INSTALL_LOCK" ]] || [[ -d "$GOV_INSTALL_LOCK_DIR" ]]; }; then
  command -v flock >/dev/null 2>&1 || die "flock required to hold governance install lock on $GOV_INSTALL_LOCK"
  mkdir -p "$GOV_INSTALL_LOCK_DIR"
  : >>"$GOV_INSTALL_LOCK"
  exec 8>>"$GOV_INSTALL_LOCK"
  if ! flock -n 8; then
    die "governance install lock busy: $GOV_INSTALL_LOCK"
  fi
  log "governance_install_lock_held path=$GOV_INSTALL_LOCK fd=8"
fi

[[ -n "$TARGET_SHA" && -n "$BE_DIGEST" && -n "$SF_DIGEST" && -n "$EVIDENCE_DIR" ]] \
  || die "missing required target/digests/evidence-dir"
wr_cutover_require_full_sha "$TARGET_SHA" || exit 2
wr_cutover_require_digest "$BE_DIGEST" || exit 2
wr_cutover_require_digest "$SF_DIGEST" || exit 2
[[ "$BE_DIGEST" != "$SF_DIGEST" ]] || die "backend and storefront digests must differ"

wr_cutover_evidence_init "$EVIDENCE_DIR" "pair-$MODE" || exit 2
printf '%s\n' "$TARGET_SHA" >"$EVIDENCE_DIR/json/target-sha.txt"
printf '%s\n' "$BE_DIGEST" >"$EVIDENCE_DIR/json/target-backend-digest.txt"
printf '%s\n' "$SF_DIGEST" >"$EVIDENCE_DIR/json/target-storefront-digest.txt"

check_no_migration

if [[ "$MODE" == "verify" ]]; then
  verify_pair || exit 21
  log "VERIFY_OK pair sha=$TARGET_SHA"
  exit 0
fi

# Gate A — owner-approved exact identity BEFORE image presence/pull planning.
# Freeze override and confirm token do NOT authorize a different SHA/digests.
export WOODRIGHT_OWNER_APPROVAL_REQUIRE_PAIR=1
if ! wr_require_owner_approved_release \
  "$WOODRIGHT_ENVIRONMENT" "$TARGET_SHA" "$BE_DIGEST" "$SF_DIGEST" "$EVIDENCE_DIR" "gate_a"; then
  log "OWNER_APPROVAL_DENIED result=${WR_OWNER_APPROVAL_RESULT:-unknown} (gate_a pre-image)"
  exit 2
fi
OWNER_APPROVAL_CHECKSUM_GATE_A="${WR_OA_CHECKSUM:-}"
log "owner_approval_ok gate=a sha=$TARGET_SHA checksum=${OWNER_APPROVAL_CHECKSUM_GATE_A:0:12}…"
# After Gate A: nestable recreate helpers under REQUIRE_PAIR need the peer digest of
# the other component. Bind from validated pair plan (not live containers / caller spoof).
bind_pair_owner_approval_peers

default_images
wr_cutover_require_image_at_digest "$BE_IMAGE" "$BE_DIGEST" || exit 2
wr_cutover_require_image_at_digest "$SF_IMAGE" "$SF_DIGEST" || exit 2

# Read-only identity + environment authority
wr_cutover_docker inspect "${WOODRIGHT_BE_CONTAINER_DEFAULT}" >/dev/null \
  || die "missing backend container"
wr_cutover_docker inspect "${WOODRIGHT_SF_CONTAINER_DEFAULT}" >/dev/null \
  || die "missing storefront container"
wr_assert_container_matches_environment "${WOODRIGHT_BE_CONTAINER_DEFAULT}" backend || die "backend environment mismatch"
wr_assert_container_matches_environment "${WOODRIGHT_SF_CONTAINER_DEFAULT}" storefront || die "storefront environment mismatch"
capture_old_identity
PRELOCK_BE_DIGEST="$OLD_BE_DIGEST"
PRELOCK_SF_DIGEST="$OLD_SF_DIGEST"
PRELOCK_BE_ID="$OLD_BE_ID"
PRELOCK_SF_ID="$OLD_SF_ID"
printf '%s\n' "$PRELOCK_BE_DIGEST" >"$EVIDENCE_DIR/json/prelock-backend-digest.txt"
printf '%s\n' "$PRELOCK_SF_DIGEST" >"$EVIDENCE_DIR/json/prelock-storefront-digest.txt"
printf '%s\n' "$PRELOCK_BE_ID" >"$EVIDENCE_DIR/json/prelock-backend-id.txt"
printf '%s\n' "$PRELOCK_SF_ID" >"$EVIDENCE_DIR/json/prelock-storefront-id.txt"

# Image presence / revision + OCI provenance
if wr_cutover_docker image inspect "$BE_IMAGE" >/dev/null 2>&1; then
  wr_assert_component_provenance "$BE_IMAGE" "$TARGET_SHA" "$BE_DIGEST" || die "backend OCI_PROVENANCE_FAILED"
  wr_cutover_assert_image_revision "$BE_IMAGE" "$TARGET_SHA" || exit 2
else
  [[ "$MODE" != "execute" ]] || die "backend image not local"
  [[ "${WOODRIGHT_ALLOW_MISSING_LOCAL_IMAGE:-0}" == "1" ]] || die "backend image not local"
fi
if wr_cutover_docker image inspect "$SF_IMAGE" >/dev/null 2>&1; then
  wr_assert_component_provenance "$SF_IMAGE" "$TARGET_SHA" "$SF_DIGEST" || die "storefront OCI_PROVENANCE_FAILED"
  wr_cutover_assert_image_revision "$SF_IMAGE" "$TARGET_SHA" || exit 2
else
  [[ "$MODE" != "execute" ]] || die "storefront image not local"
  [[ "${WOODRIGHT_ALLOW_MISSING_LOCAL_IMAGE:-0}" == "1" ]] || die "storefront image not local"
fi

check_monitor

if [[ "$MODE" == "dry-run" || "$MODE" == "preflight" ]]; then
  wr_require_canonical_db_identity || exit 1
  log "PLANNED pair cutover sha=$TARGET_SHA be=$BE_DIGEST sf=$SF_DIGEST"
  log "PLANNED order=backend_then_storefront lock=$WR_STAGING_MUTATION_LOCK_PATH"
  log "PLANNED containers=${WOODRIGHT_BE_CONTAINER_DEFAULT}+${WOODRIGHT_SF_CONTAINER_DEFAULT}"
  log "PLANNED owner_approval_peer_be=${WOODRIGHT_OWNER_APPROVAL_PEER_BE_DIGEST:-}"
  log "PLANNED owner_approval_peer_sf=${WOODRIGHT_OWNER_APPROVAL_PEER_SF_DIGEST:-}"
  log "PLANNED database_identity_alias=${WOODRIGHT_DATABASE_IDENTITY_ALIAS} database_connection_name=${WOODRIGHT_DATABASE_CONNECTION_NAME:-none}"
  log "PLANNED label com.woodright.database-identity=${WOODRIGHT_DATABASE_IDENTITY_ALIAS}"
  log "PLANNED no_migration no_production no_dns"
  # Prove old digests resolve via image inspect (no container .RepoDigests)
  if wr_cutover_resolve_container_image_identity "${WOODRIGHT_BE_CONTAINER_DEFAULT}" backend; then
    log "PLANNED old_backend_digest_via_image_inspect=$WR_CUTOVER_REPO_DIGEST"
  fi
  if wr_cutover_resolve_container_image_identity "${WOODRIGHT_SF_CONTAINER_DEFAULT}" storefront; then
    log "PLANNED old_storefront_digest_via_image_inspect=$WR_CUTOVER_REPO_DIGEST"
  fi
  # Prove dry-run does not mutate: record container IDs
  wr_cutover_docker inspect "${WOODRIGHT_BE_CONTAINER_DEFAULT}" --format '{{.Id}}' >"$EVIDENCE_DIR/json/be-id-before.txt"
  wr_cutover_docker inspect "${WOODRIGHT_SF_CONTAINER_DEFAULT}" --format '{{.Id}}' >"$EVIDENCE_DIR/json/sf-id-before.txt"
  log "DRY_RUN_OR_PREFLIGHT_OK mode=$MODE"
  exit 0
fi

# execute
wr_cutover_require_confirm "$CONFIRM" || exit 2
[[ -n "$BE_ENV_FILE" && -n "$SF_ENV_FILE" ]] || die "execute requires backend/storefront env files"
[[ -f "$BE_ENV_FILE" && -f "$SF_ENV_FILE" ]] || die "env files missing"

# Re-check durable install journal immediately before runtime lock (defense in depth).
if [[ -f "$GOV_IN_PROGRESS" ]]; then
  die "governance install in progress or incomplete: $GOV_IN_PROGRESS"
fi

TS="$(date -u +%Y%m%dT%H%M%SZ)"
BE_KEEP="woodright-staging-backend-keeper-${TS}"
SF_KEEP="woodright-staging-storefront-keeper-${TS}"

wr_staging_mutation_lock_acquire \
  "actor=cutover-public-demo-pair" \
  "command=$0 --environment public_demo --component pair" \
  "target=$TARGET_SHA" \
  || exit 3
wr_staging_mutation_lock_export_inherit || die "lock inherit export failed"
log "lock held for pair cutover"

# Gate B — re-check owner approval under lock (TOCTOU / checksum drift).
export WOODRIGHT_OWNER_APPROVAL_REQUIRE_PAIR=1
if ! wr_require_owner_approved_release_under_lock \
  "$WOODRIGHT_ENVIRONMENT" "$TARGET_SHA" "$BE_DIGEST" "$SF_DIGEST" \
  "$EVIDENCE_DIR" "$OWNER_APPROVAL_CHECKSUM_GATE_A"; then
  log "OWNER_APPROVAL_DENIED result=${WR_OWNER_APPROVAL_RESULT:-unknown} (gate_b under lock)"
  exit 2
fi
log "owner_approval_ok gate=b checksum=${WR_OA_CHECKSUM:0:12}…"
# Re-bind peers under lock (TOCTOU: refuse drifted caller env before nested recreate).
bind_pair_owner_approval_peers

# Re-validate under lock (selection freeze + monitor freshness after lock wait)
wr_prelock_validate_environment_target || die "under-lock environment retarget detected"
wr_assert_container_matches_environment "${WOODRIGHT_BE_CONTAINER_DEFAULT}" backend || die "under-lock backend retarget"
wr_assert_container_matches_environment "${WOODRIGHT_SF_CONTAINER_DEFAULT}" storefront || die "under-lock storefront retarget"
capture_old_identity
assert_identity_stable_under_lock
check_monitor
run_backup_gate

# Wire peer-SF identity for BE-only auto-rollback (no SF keeper yet).
export WOODRIGHT_ROLLBACK_EXPECT_SF_DIGEST="$OLD_SF_DIGEST"
[[ -n "$WOODRIGHT_ROLLBACK_EXPECT_SF_DIGEST" ]] || die "OLD_SF_DIGEST missing before mutation"
printf '%s\n' "$WOODRIGHT_ROLLBACK_EXPECT_SF_DIGEST" >"$EVIDENCE_DIR/json/rollback-expect-storefront-digest.txt"

MUTATION_STARTED=1
# Backend recreate (digest-advance) under pair component scope
if ! REQUIRE_CURRENT_DIGEST=0 \
  IMAGE="$BE_IMAGE" \
  EXPECTED_DIGEST="$BE_DIGEST" \
  ENV_FILE="$BE_ENV_FILE" \
  KEEP_NAME="$BE_KEEP" \
  TARGET_SHA="$TARGET_SHA" \
  WOODRIGHT_TARGET_SHA="$TARGET_SHA" \
  ROLLBACK_SCRIPT="$HERE/rollback-staging-backend-from-keeper.sh" \
  bash "$HERE/recreate-staging-backend-with-media.sh" --environment public_demo --component pair --mode execute; then
  log "backend recreate failed"
  pair_rollback || true
  exit "${ROLLBACK_RC:-12}"
fi

# Mid-cutover gate: refuse wrong/missing DB identity (and env labels) on the new
# backend BEFORE storefront mutation or pin APPLY. Models the prior incident where
# BE was replaced with woodright_staging label while SF was still old.
if ! wr_assert_container_matches_environment "${WOODRIGHT_BE_CONTAINER_DEFAULT}" backend; then
  log "post-backend DB/environment identity gate failed - rolling back pair (storefront untouched)"
  pair_rollback || true
  exit "${ROLLBACK_RC:-12}"
fi
log "post-backend identity gate PASS container=${WOODRIGHT_BE_CONTAINER_DEFAULT}"

# Storefront recreate under pair component scope
if ! REQUIRE_CURRENT_DIGEST=0 \
  SKIP_PUBLIC_VERIFY="${SKIP_PUBLIC_VERIFY:-0}" \
  bash "$HERE/recreate-staging-storefront.sh" \
  --environment public_demo \
  --component pair \
  --mode execute \
  --image "$SF_IMAGE" \
  --digest "$SF_DIGEST" \
  --target-sha "$TARGET_SHA" \
  --keep-name "$SF_KEEP" \
  --env-file "$SF_ENV_FILE" \
  --evidence-dir "$EVIDENCE_DIR/storefront" \
  --confirm-mutation "$CONFIRM"; then
  log "storefront recreate failed - rolling back pair"
  pair_rollback || true
  exit "${ROLLBACK_RC:-12}"
fi

if ! verify_pair; then
  log "pair identity verify failed - rollback"
  pair_rollback || true
  exit "${ROLLBACK_RC:-12}"
fi

if ! run_smoke; then
  log "critical smoke failed - rollback"
  pair_rollback || true
  exit "${ROLLBACK_RC:-12}"
fi

# Gate C — before authority/pin commit: deployed target must still match approval.
if ! wr_require_owner_approved_matches_live \
  "$WOODRIGHT_ENVIRONMENT" "$TARGET_SHA" "$BE_DIGEST" "$SF_DIGEST" "$EVIDENCE_DIR"; then
  log "OWNER_APPROVAL_DENIED result=${WR_OWNER_APPROVAL_RESULT:-unknown} (gate_c pre-authority)"
  pair_rollback || true
  exit "${ROLLBACK_RC:-12}"
fi
log "owner_approval_ok gate=c pre-authority"

# Pin reconcile UNDER the same canonical lock (inherited) before SUCCESS.
# Releasing the lock before authoritative pin SoT alignment is a correctness race.
# Install maps scripts/release → /srv/woodright/tools/release; accept either path / symlink.
PIN_RECONCILE_SCRIPT=""
for _pin_cand in \
  "$REPO_ROOT/scripts/release/reconcile-public-image-pins.sh" \
  "$REPO_ROOT/tools/release/reconcile-public-image-pins.sh"
do
  if [[ -x "$_pin_cand" ]]; then
    PIN_RECONCILE_SCRIPT="$_pin_cand"
    break
  fi
done
unset _pin_cand
if [[ -n "$PIN_RECONCILE_SCRIPT" ]]; then
  if [[ "${WOODRIGHT_SKIP_PIN_RECONCILE:-0}" != "1" ]]; then
    cat >"$EVIDENCE_DIR/json/planned-pin-reconcile.env" <<EOF
EXPECTED_RELEASE_SHA=${TARGET_SHA}
EXPECTED_BACKEND_DIGEST=${BE_DIGEST}
EXPECTED_STOREFRONT_DIGEST=${SF_DIGEST}
APPLY=1
EOF
    printf 'WOODRIGHT_BACKEND_IMAGE=%s\nWOODRIGHT_STOREFRONT_IMAGE=%s\n' \
      "$BE_IMAGE" "$SF_IMAGE" >"$EVIDENCE_DIR/json/planned-pins.env"
    printf '%s\n' "$PIN_RECONCILE_SCRIPT" >"$EVIDENCE_DIR/json/pin-reconcile-script-path.txt"
    wr_staging_mutation_lock_export_inherit || {
      log "lock inherit export failed before pin APPLY"
      pair_rollback || true
      exit "${ROLLBACK_RC:-12}"
    }
    log "pin_reconcile_begin under_inherited_lock=yes script=$PIN_RECONCILE_SCRIPT"
    if ! EXPECTED_RELEASE_SHA="$TARGET_SHA" \
      EXPECTED_BACKEND_DIGEST="$BE_DIGEST" \
      EXPECTED_STOREFRONT_DIGEST="$SF_DIGEST" \
      APPLY=1 \
      UPDATE_PINS=1 \
      UPDATE_ACTIVE_PUBLIC=1 \
      UPDATE_ACTIVE_RELEASE=0 \
      UPDATE_SCOPED_OWNERSHIP=1 \
      bash "$PIN_RECONCILE_SCRIPT" \
        --environment public_demo \
        --component pair; then
      log "pin reconcile APPLY failed - rolling back pair"
      printf '{"pin_apply":"failed"}\n' >"$EVIDENCE_DIR/json/pin-apply-result.json"
      pair_rollback || true
      exit "${ROLLBACK_RC:-12}"
    fi
    printf '{"pin_apply":"ok","under_lock":true}\n' >"$EVIDENCE_DIR/json/pin-apply-result.json"
    log "pin_reconcile_ok under_inherited_lock=yes"
  else
    log "WARN WOODRIGHT_SKIP_PIN_RECONCILE=1 after runtime mutation"
    pair_rollback || true
    exit "${ROLLBACK_RC:-12}"
  fi
else
  log "missing reconcile-public-image-pins.sh after runtime mutation (checked scripts/release and tools/release under $REPO_ROOT)"
  pair_rollback || true
  exit "${ROLLBACK_RC:-12}"
fi

# Re-verify pair identity after pin writes (still under lock)
if ! verify_pair; then
  log "post-pin pair identity verify failed - rollback"
  pair_rollback || true
  exit "${ROLLBACK_RC:-12}"
fi

printf '{"verdict":"success","target_sha":"%s","backend_digest":"%s","storefront_digest":"%s","pin_apply":"ok"}\n' \
  "$TARGET_SHA" "$BE_DIGEST" "$SF_DIGEST" >"$EVIDENCE_DIR/json/final-verdict.json"
{
  echo "# Pair cutover success"
  echo "- sha: $TARGET_SHA"
  echo "- be: $BE_DIGEST"
  echo "- sf: $SF_DIGEST"
  echo "- keepers: $BE_KEEP / $SF_KEEP"
  echo "- pin_apply: ok (under canonical lock)"
} >"$EVIDENCE_DIR/SUMMARY.md"

log "PAIR_CUTOVER_OK sha=$TARGET_SHA pin_apply=ok"
# lock released via trap on EXIT from lock helper
exit 0
