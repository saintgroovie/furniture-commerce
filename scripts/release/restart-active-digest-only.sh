#!/usr/bin/env bash
# LIVE_MUTATING=true
# requires_global_lock=true
#
# Digest-only restart of the ACTIVE release pair.
# Does NOT re-resolve mutable registry tags.
# Does NOT perform cutover to a new SHA.
# Does NOT invoke docker by default (dry-run). Site wiring must pass digests as args.
set -euo pipefail

readonly CANONICAL_LOCK="/srv/woodright/locks/live-cutover.lock"
readonly ACTIVE_RELEASE_DEFAULT="/srv/woodright/runtime-ownership/ACTIVE_RELEASE.json"
ACTIVE_RELEASE="${ACTIVE_RELEASE_PATH:-$ACTIVE_RELEASE_DEFAULT}"
TIMEOUT_SEC="${LOCK_TIMEOUT_SEC:-120}"

SHA_RE='^[0-9a-f]{40}$'
DIGEST_RE='^sha256:[0-9a-f]{64}$'
TX_RE='^ctx-[0-9]{8}T[0-9]{6}Z-[a-z0-9-]{4,32}$'

if [[ ! "$TIMEOUT_SEC" =~ ^[0-9]+$ ]] || [[ "$TIMEOUT_SEC" -lt 1 ]] || [[ "$TIMEOUT_SEC" -gt 600 ]]; then
  echo "invalid LOCK_TIMEOUT_SEC" >&2
  exit 2
fi

if [[ ! -f "$ACTIVE_RELEASE" ]]; then
  echo "missing ACTIVE_RELEASE: $ACTIVE_RELEASE" >&2
  exit 2
fi

mapfile -t IDENTS < <(node -e '
const fs=require("fs");
const a=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
const sha=a.active_release_sha||a.release_sha||"";
const be=a.backend_digest||"";
const sf=a.storefront_digest||"";
if(!sha||!be||!sf){process.exit(3)}
process.stdout.write([sha,be,sf].join("\n"));
' "$ACTIVE_RELEASE")
SHA="${IDENTS[0]}"
BE_DIGEST="${IDENTS[1]}"
SF_DIGEST="${IDENTS[2]}"

if [[ ! "$SHA" =~ $SHA_RE ]]; then echo "invalid release_sha" >&2; exit 2; fi
if [[ ! "$BE_DIGEST" =~ $DIGEST_RE ]]; then echo "invalid backend_digest" >&2; exit 2; fi
if [[ ! "$SF_DIGEST" =~ $DIGEST_RE ]]; then echo "invalid storefront_digest" >&2; exit 2; fi

TX_ID="${TX_ID:-ctx-$(date -u +%Y%m%dT%H%M%SZ)-restart}"
if [[ ! "$TX_ID" =~ $TX_RE ]]; then
  echo "invalid TX_ID format" >&2
  exit 2
fi

echo "restart_planned sha=$SHA be=$BE_DIGEST sf=$SF_DIGEST tx=$TX_ID lock=$CANONICAL_LOCK"

if [[ "${RESTART_EXECUTE:-0}" != "1" ]]; then
  echo "dry_run_only set RESTART_EXECUTE=1 to proceed under flock"
  exit 0
fi

# Hold canonical lock; never interpolate untrusted strings into flock -c.
# Pass validated values as env to a fixed helper body.
export WR_TX_ID="$TX_ID"
export WR_BE_DIGEST="$BE_DIGEST"
export WR_SF_DIGEST="$SF_DIGEST"
export WR_SHA="$SHA"
flock -x -w "$TIMEOUT_SEC" "$CANONICAL_LOCK" bash -c '
  set -euo pipefail
  echo "flock_acquired tx=${WR_TX_ID}"
  echo "NOTE: operator must restart containers by exact digest refs only"
  echo "backend@${WR_BE_DIGEST} storefront@${WR_SF_DIGEST} sha=${WR_SHA}"
  echo "This template does not call docker; wire site-specific compose under flock."
'
