#!/usr/bin/env bash
# LIVE_MUTATING=true
# requires_global_lock=true
#
# Preferred thin entrypoint for metadata-only WOODRIGHT_RELEASE_SHA reconcile
# on PRIVATE production-candidate. Delegates to
# reconcile-production-candidate-metadata.sh --correction compose-common-release-sha.
#
# Execute path holds the production mutation lock
# (/srv/woodright/locks/production/live-cutover.lock; flock via shared helper).
#
# Default: dry-run. Execute requires explicit --execute and confirmation token
# I_UNDERSTAND_PRODUCTION_METADATA_COMPOSE_RELEASE_SHA_CORRECTION.
#
# Never recreates containers. Never rewrites image pins or ACTIVE provenance.
# Not for public_demo.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="$SCRIPT_DIR/reconcile-production-candidate-metadata.sh"

usage() {
  cat <<EOF
Usage: reconcile-production-release-sha.sh \\
  --environment production \\
  --application-source-sha <FULL_40_HEX> \\
  --current-helper-install-sha <FULL_40_HEX> \\
  --storefront-ref <IMMUTABLE_REF> \\
  --backend-ref <IMMUTABLE_REF> \\
  [--dry-run|--execute] \\
  [--confirm-mutation I_UNDERSTAND_PRODUCTION_METADATA_COMPOSE_RELEASE_SHA_CORRECTION]

Thin wrapper around reconcile-production-candidate-metadata.sh
  --correction compose-common-release-sha

Lock (execute): /srv/woodright/locks/production/live-cutover.lock
EOF
}

for arg in "$@"; do
  case "$arg" in
    -h|--help) usage; exit 0 ;;
  esac
done

exec bash "$TARGET" --correction compose-common-release-sha "$@"
