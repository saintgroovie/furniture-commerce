#!/usr/bin/env bash
# LIVE_MUTATING=true
# requires_global_lock=true
#
# Digest-only restart planning for an ACTIVE release pair.
# Does NOT re-resolve mutable registry tags.
# Does NOT perform cutover to a new SHA.
# Does NOT invoke docker by default (dry-run). Site wiring must pass digests as args.
#
# Authority (public_demo):
#   Canonical targets come from scoped ACTIVE_OWNER / EXPECTED_RELEASE / ACTIVE_PUBLIC.
#   Legacy schema-v2 ACTIVE_RELEASE.json under runtime-ownership-public-demo/ is
#   NON-AUTHORITATIVE compatibility residue. It is never an implicit fallback.
#
# Explicit legacy ACTIVE_RELEASE_PATH requires:
#   LEGACY_ACTIVE_RELEASE_OPT_IN=1
#   --confirm-mutation I_UNDERSTAND_LEGACY_ACTIVE_RELEASE_IS_NON_AUTHORITATIVE
# and equality with current scoped authority (SHA + digests). Confirmation alone
# does not bypass equality gates.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=../../ops/lib/woodright-environment-profile.sh
source "$ROOT/ops/lib/woodright-environment-profile.sh"

readonly LEGACY_CONFIRM_TOKEN='I_UNDERSTAND_LEGACY_ACTIVE_RELEASE_IS_NON_AUTHORITATIVE'
readonly PUBLIC_DEMO_LEGACY_ACTIVE='/srv/woodright/runtime-ownership-public-demo/ACTIVE_RELEASE.json'
readonly ROOT_LEGACY_ACTIVE='/srv/woodright/runtime-ownership/ACTIVE_RELEASE.json'
readonly CANONICAL_LOCK_DEFAULT='/srv/woodright/locks/live-cutover.lock'

SHA_RE='^[0-9a-f]{40}$'
DIGEST_RE='^sha256:[0-9a-f]{64}$'
TX_RE='^[0-9a-zA-Z._:-]{4,96}$'

ENV_ARG=""
CONFIRM_MUTATION=""
LEGACY_PATH_EXPLICIT=0
FILTERED=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --environment) ENV_ARG="${2:?}"; shift 2 ;;
    --environment=*) ENV_ARG="${1#--environment=}"; shift ;;
    --confirm-mutation) CONFIRM_MUTATION="${2:?}"; shift 2 ;;
    --confirm-mutation=*) CONFIRM_MUTATION="${1#--confirm-mutation=}"; shift ;;
    --active-release-path)
      ACTIVE_RELEASE_PATH="${2:?}"
      LEGACY_PATH_EXPLICIT=1
      shift 2
      ;;
    --active-release-path=*)
      ACTIVE_RELEASE_PATH="${1#--active-release-path=}"
      LEGACY_PATH_EXPLICIT=1
      shift
      ;;
    *) FILTERED+=("$1"); shift ;;
  esac
done
set -- "${FILTERED[@]+"${FILTERED[@]}"}"

TIMEOUT_SEC="${LOCK_TIMEOUT_SEC:-120}"
if [[ ! "$TIMEOUT_SEC" =~ ^[0-9]+$ ]] || [[ "$TIMEOUT_SEC" -lt 1 ]] || [[ "$TIMEOUT_SEC" -gt 600 ]]; then
  echo "invalid LOCK_TIMEOUT_SEC" >&2
  exit 2
fi

die() { echo "error: $*" >&2; exit 2; }

is_public_demo_legacy_path() {
  local p="$1"
  case "$p" in
    */runtime-ownership-public-demo/ACTIVE_RELEASE.json|${PUBLIC_DEMO_LEGACY_ACTIVE}) return 0 ;;
  esac
  # Profile-declared compatibility path (fixtures + live conf).
  if [[ "${WOODRIGHT_ENVIRONMENT:-}" == "public_demo" \
    && -n "${WOODRIGHT_ACTIVE_RELEASE:-}" \
    && "$p" == "${WOODRIGHT_ACTIVE_RELEASE}" \
    && "${WOODRIGHT_ACTIVE_RELEASE_COMPATIBILITY_ONLY:-0}" == "1" ]]; then
    return 0
  fi
  if [[ "${WOODRIGHT_ENVIRONMENT:-}" == "public_demo" \
    && -n "${WOODRIGHT_ACTIVE_RELEASE:-}" \
    && "$p" == "${WOODRIGHT_ACTIVE_RELEASE}" \
    && "${WOODRIGHT_ACTIVE_RELEASE_DEPRECATED:-0}" == "1" ]]; then
    return 0
  fi
  return 1
}

# Cross-environment: any path under runtime-ownership-public-demo/ACTIVE_RELEASE.json
is_public_demo_ownership_active_release_path() {
  local p="$1"
  case "$p" in
    */runtime-ownership-public-demo/ACTIVE_RELEASE.json|${PUBLIC_DEMO_LEGACY_ACTIVE}) return 0 ;;
  esac
  return 1
}

read_json_field() {
  local file="$1" expr="$2"
  python3 - "$file" "$expr" <<'PY'
import json, sys
doc = json.load(open(sys.argv[1], encoding="utf-8"))
expr = sys.argv[2]
cur = doc
for part in expr.split("."):
    if not isinstance(cur, dict) or part not in cur:
        print("")
        raise SystemExit(0)
    cur = cur[part]
if cur is None:
    print("")
else:
    print(cur)
PY
}

normalize_digest() {
  local d="$1"
  if [[ "$d" == sha256:* ]]; then
    printf '%s\n' "$d"
  elif [[ "$d" =~ ^[0-9a-f]{64}$ ]]; then
    printf 'sha256:%s\n' "$d"
  else
    printf '%s\n' "$d"
  fi
}

extract_scoped_idents() {
  local owner="$1" expected="$2" active_public="$3"
  python3 - "$owner" "$expected" "$active_public" <<'PY'
import json, sys
from pathlib import Path

def load(p):
    path = Path(p)
    if not path.is_file():
        raise SystemExit(3)
    return json.loads(path.read_text(encoding="utf-8"))

owner, expected, active = (load(p) for p in sys.argv[1:4])

def norm_digest(v):
    s = str(v or "").strip()
    if s.startswith("sha256:"):
        return s
    if len(s) == 64 and all(c in "0123456789abcdef" for c in s):
        return "sha256:" + s
    return s

def pick_sha(doc):
    for k in ("release_sha", "approved_git_sha", "desired_git_sha", "application_source_sha"):
        v = doc.get(k)
        if v:
            return str(v)
    return ""

def pick_be(doc):
    for k in ("backend_digest", "be_digest", "running_backend_digest", "backend_image_digest"):
        v = doc.get(k)
        if v:
            return norm_digest(v)
    return ""

def pick_sf(doc):
    for k in ("storefront_digest", "sf_digest", "running_storefront_digest", "storefront_image_digest"):
        v = doc.get(k)
        if v:
            return norm_digest(v)
    return ""

owner_sha, exp_sha, act_sha = pick_sha(owner), pick_sha(expected), pick_sha(active)
owner_be, exp_be, act_be = pick_be(owner), pick_be(expected), pick_be(active)
owner_sf, exp_sf, act_sf = pick_sf(owner), pick_sf(expected), pick_sf(active)

missing = []
for label, sha, be, sf in (
    ("ACTIVE_OWNER", owner_sha, owner_be, owner_sf),
    ("EXPECTED_RELEASE", exp_sha, exp_be, exp_sf),
    ("ACTIVE_PUBLIC", act_sha, act_be, act_sf),
):
    if not sha or not be or not sf:
        missing.append(label)
if missing:
    raise SystemExit(3)

if not (owner_sha == exp_sha == act_sha):
    print(
        f"scoped authority sha disagreement OWNER={owner_sha} EXPECTED={exp_sha} ACTIVE_PUBLIC={act_sha}",
        file=sys.stderr,
    )
    raise SystemExit(4)
if not (owner_be == exp_be == act_be):
    print(
        f"scoped authority backend digest disagreement OWNER={owner_be} EXPECTED={exp_be} ACTIVE_PUBLIC={act_be}",
        file=sys.stderr,
    )
    raise SystemExit(4)
if not (owner_sf == exp_sf == act_sf):
    print(
        f"scoped authority storefront digest disagreement OWNER={owner_sf} EXPECTED={exp_sf} ACTIVE_PUBLIC={act_sf}",
        file=sys.stderr,
    )
    raise SystemExit(4)

print("\n".join([owner_sha, owner_be, owner_sf]))
PY
}

extract_legacy_idents() {
  local file="$1"
  python3 - "$file" <<'PY'
import json, sys
from pathlib import Path
a = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
sha = a.get("active_release_sha") or a.get("release_sha") or a.get("application_source_sha") or ""
be = a.get("backend_digest") or ""
sf = a.get("storefront_digest") or ""
env = a.get("environment") or a.get("environment_label") or a.get("runtime_role") or ""
if not sha or not be or not sf:
    raise SystemExit(3)
print("\n".join([sha, be, sf, str(env)]))
PY
}

# Resolve environment (optional but required for public_demo scoped mode).
if [[ -n "$ENV_ARG" ]]; then
  wr_load_environment_profile "$ENV_ARG" || exit 2
fi

LOCK_PATH="${WOODRIGHT_MUTATION_LOCK_PATH:-$CANONICAL_LOCK_DEFAULT}"
ACTIVE_RELEASE="${ACTIVE_RELEASE_PATH:-}"

# Default path: never auto-resolve to public-demo legacy ACTIVE_RELEASE.json.
if [[ -z "$ACTIVE_RELEASE" ]]; then
  if [[ "${WOODRIGHT_ENVIRONMENT:-}" == "public_demo" ]]; then
    ACTIVE_RELEASE=""
  else
    ACTIVE_RELEASE="$ROOT_LEGACY_ACTIVE"
  fi
else
  LEGACY_PATH_EXPLICIT=1
fi

# Production (or any non-public_demo) must not consume the public-demo legacy path.
if [[ "${WOODRIGHT_ENVIRONMENT:-}" != "public_demo" ]] && [[ -n "$ACTIVE_RELEASE" ]]; then
  if is_public_demo_ownership_active_release_path "$ACTIVE_RELEASE" \
    || [[ "$ACTIVE_RELEASE" == *"/runtime-ownership-public-demo/ACTIVE_RELEASE.json" ]]; then
    die "refusing public-demo legacy ACTIVE_RELEASE path under environment='${WOODRIGHT_ENVIRONMENT:-unset}' ($ACTIVE_RELEASE)"
  fi
fi

SHA=""
BE_DIGEST=""
SF_DIGEST=""
SOURCE_MODE=""

read_scoped_or_die() {
  local owner="$1" expected="$2" active_public="$3" err
  err="$(mktemp)"
  if ! SCOPED_RAW="$(extract_scoped_idents "$owner" "$expected" "$active_public" 2>"$err")"; then
    if grep -qi 'disagreement' "$err" 2>/dev/null; then
      die "$(tr '\n' ' ' <"$err")"
    fi
    rm -f "$err"
    die "failed to read scoped public_demo authority"
  fi
  rm -f "$err"
}

if [[ "${WOODRIGHT_ENVIRONMENT:-}" == "public_demo" ]]; then
  OWNER_FILE="${WOODRIGHT_ACTIVE_OWNER:-}"
  EXPECTED_FILE="${WOODRIGHT_EXPECTED_RELEASE:-}"
  ACTIVE_PUBLIC_FILE="${WOODRIGHT_ACTIVE_PUBLIC:-}"

  if [[ "$LEGACY_PATH_EXPLICIT" == "1" ]] && is_public_demo_legacy_path "${ACTIVE_RELEASE_PATH:-$ACTIVE_RELEASE}"; then
    ACTIVE_RELEASE="${ACTIVE_RELEASE_PATH:-$ACTIVE_RELEASE}"
    [[ -f "$ACTIVE_RELEASE" ]] || die "missing legacy ACTIVE_RELEASE: $ACTIVE_RELEASE"
    [[ "${LEGACY_ACTIVE_RELEASE_OPT_IN:-0}" == "1" ]] \
      || die "public-demo legacy ACTIVE_RELEASE requires LEGACY_ACTIVE_RELEASE_OPT_IN=1"
    [[ "$CONFIRM_MUTATION" == "$LEGACY_CONFIRM_TOKEN" ]] \
      || die "public-demo legacy ACTIVE_RELEASE requires --confirm-mutation $LEGACY_CONFIRM_TOKEN"

    # Scoped authority must exist; legacy is never an implicit fallback.
    [[ -f "$OWNER_FILE" && -f "$EXPECTED_FILE" && -f "$ACTIVE_PUBLIC_FILE" ]] \
      || die "missing scoped public_demo authority (OWNER/EXPECTED/ACTIVE_PUBLIC); legacy is not a fallback"

    read_scoped_or_die "$OWNER_FILE" "$EXPECTED_FILE" "$ACTIVE_PUBLIC_FILE"
    SCOPED_SHA="$(printf '%s\n' "$SCOPED_RAW" | sed -n '1p')"
    SCOPED_BE="$(normalize_digest "$(printf '%s\n' "$SCOPED_RAW" | sed -n '2p')")"
    SCOPED_SF="$(normalize_digest "$(printf '%s\n' "$SCOPED_RAW" | sed -n '3p')")"

    LEGACY_RAW="$(extract_legacy_idents "$ACTIVE_RELEASE")" \
      || die "malformed or incomplete legacy ACTIVE_RELEASE: $ACTIVE_RELEASE"
    SHA="$(printf '%s\n' "$LEGACY_RAW" | sed -n '1p')"
    BE_DIGEST="$(normalize_digest "$(printf '%s\n' "$LEGACY_RAW" | sed -n '2p')")"
    SF_DIGEST="$(normalize_digest "$(printf '%s\n' "$LEGACY_RAW" | sed -n '3p')")"
    LEGACY_ENV="$(printf '%s\n' "$LEGACY_RAW" | sed -n '4p')"

    if [[ -n "$LEGACY_ENV" && "$LEGACY_ENV" != "public_demo" && "$LEGACY_ENV" != "PUBLIC_DEMO" ]]; then
      die "legacy ACTIVE_RELEASE environment field mismatch want=public_demo got=$LEGACY_ENV"
    fi

    [[ "$SHA" == "$SCOPED_SHA" ]] \
      || die "legacy ACTIVE_RELEASE sha mismatch scoped=$SCOPED_SHA legacy=$SHA (stale non-authoritative mirror)"
    [[ "$BE_DIGEST" == "$SCOPED_BE" ]] \
      || die "legacy ACTIVE_RELEASE backend digest mismatch scoped=$SCOPED_BE legacy=$BE_DIGEST"
    [[ "$SF_DIGEST" == "$SCOPED_SF" ]] \
      || die "legacy ACTIVE_RELEASE storefront digest mismatch scoped=$SCOPED_SF legacy=$SF_DIGEST"
    SOURCE_MODE="legacy_opt_in_equal_scoped"
  else
    # Canonical public_demo path: scoped authority only.
    [[ -f "$OWNER_FILE" && -f "$EXPECTED_FILE" && -f "$ACTIVE_PUBLIC_FILE" ]] \
      || die "missing scoped public_demo authority; refusing legacy ACTIVE_RELEASE fallback"
    read_scoped_or_die "$OWNER_FILE" "$EXPECTED_FILE" "$ACTIVE_PUBLIC_FILE"
    SHA="$(printf '%s\n' "$SCOPED_RAW" | sed -n '1p')"
    BE_DIGEST="$(normalize_digest "$(printf '%s\n' "$SCOPED_RAW" | sed -n '2p')")"
    SF_DIGEST="$(normalize_digest "$(printf '%s\n' "$SCOPED_RAW" | sed -n '3p')")"
    SOURCE_MODE="scoped_authority"
    ACTIVE_RELEASE="(scoped OWNER/EXPECTED/ACTIVE_PUBLIC)"
  fi
else
  # Non-public_demo: historical ACTIVE_RELEASE pointer (root/default or explicit).
  [[ -n "$ACTIVE_RELEASE" ]] || die "ACTIVE_RELEASE path unresolved"
  [[ -f "$ACTIVE_RELEASE" ]] || die "missing ACTIVE_RELEASE: $ACTIVE_RELEASE"
  if is_public_demo_legacy_path "$ACTIVE_RELEASE"; then
    die "refusing public-demo legacy ACTIVE_RELEASE path outside public_demo"
  fi
  IDENTS_RAW="$(extract_legacy_idents "$ACTIVE_RELEASE")" \
    || die "malformed or incomplete ACTIVE_RELEASE: $ACTIVE_RELEASE"
  SHA="$(printf '%s\n' "$IDENTS_RAW" | sed -n '1p')"
  BE_DIGEST="$(normalize_digest "$(printf '%s\n' "$IDENTS_RAW" | sed -n '2p')")"
  SF_DIGEST="$(normalize_digest "$(printf '%s\n' "$IDENTS_RAW" | sed -n '3p')")"
  SOURCE_MODE="active_release_file"
fi

[[ "$SHA" =~ $SHA_RE ]] || die "invalid release_sha"
[[ "$BE_DIGEST" =~ $DIGEST_RE ]] || die "invalid backend_digest"
[[ "$SF_DIGEST" =~ $DIGEST_RE ]] || die "invalid storefront_digest"

TX_ID="${TX_ID:-ctx-$(date -u +%Y%m%dT%H%M%SZ)-restart}"
[[ "$TX_ID" =~ $TX_RE ]] || die "invalid TX_ID format"

echo "restart_planned sha=$SHA be=$BE_DIGEST sf=$SF_DIGEST tx=$TX_ID lock=$LOCK_PATH source_mode=$SOURCE_MODE path=$ACTIVE_RELEASE"

if [[ "${RESTART_EXECUTE:-0}" != "1" ]]; then
  echo "dry_run_only set RESTART_EXECUTE=1 to proceed under flock"
  exit 0
fi

# Hold lock; never interpolate untrusted strings into flock -c.
export WR_TX_ID="$TX_ID"
export WR_BE_DIGEST="$BE_DIGEST"
export WR_SF_DIGEST="$SF_DIGEST"
export WR_SHA="$SHA"
flock -x -w "$TIMEOUT_SEC" "$LOCK_PATH" bash -c '
  set -euo pipefail
  echo "flock_acquired tx=${WR_TX_ID}"
  echo "NOTE: operator must restart containers by exact digest refs only"
  echo "backend@${WR_BE_DIGEST} storefront@${WR_SF_DIGEST} sha=${WR_SHA}"
  echo "This template does not call docker; wire site-specific compose under flock."
'
