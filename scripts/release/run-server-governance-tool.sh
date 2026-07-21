#!/usr/bin/env bash
# Canonical server governance tools runner (no host Node required).
# Pins tools image by exact digest. No docker.sock. Read-only mounts.
set -euo pipefail

# Pinned official Node 22 bookworm-slim (verified on woodright host 2026-07-21).
readonly APPROVED_TOOLS_DIGEST="6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3"
readonly TOOLS_IMAGE_DIGEST="${WOODRIGHT_GOVERNANCE_TOOLS_IMAGE:-docker.io/library/node@sha256:${APPROVED_TOOLS_DIGEST}}"
readonly TOOLS_ROOT="${WOODRIGHT_TOOLS_ROOT:-/srv/woodright/tools}"
readonly SCHEMAS_ROOT="${WOODRIGHT_SCHEMAS_ROOT:-/srv/woodright/schemas}"
readonly NETWORK_MODE="${WOODRIGHT_TOOLS_NETWORK:-none}"

usage() {
  cat <<'EOF'
usage: run-server-governance-tool.sh <validator.cjs> [args...]
env:
  WOODRIGHT_GOVERNANCE_TOOLS_IMAGE  exact image@sha256:<64-hex> from allowlist
  WOODRIGHT_TOOLS_ROOT              default /srv/woodright/tools
  WOODRIGHT_TOOLS_NETWORK           none|dokploy-network (default none)
EOF
}

if [[ $# -lt 1 ]]; then usage; exit 2; fi
SCRIPT_NAME="$1"; shift || true

if [[ "$TOOLS_IMAGE_DIGEST" != *@sha256:* ]]; then
  echo "mutable tools image rejected (need image@sha256:...)" >&2
  exit 2
fi
DIGEST_HEX="${TOOLS_IMAGE_DIGEST##*@sha256:}"
if [[ ! "$DIGEST_HEX" =~ ^[0-9a-f]{64}$ ]]; then
  echo "tools image digest must be 64 lowercase hex" >&2
  exit 2
fi
if [[ "$DIGEST_HEX" != "$APPROVED_TOOLS_DIGEST" ]]; then
  echo "tools image digest not in allowlist" >&2
  exit 2
fi
if [[ "$NETWORK_MODE" != "none" && "$NETWORK_MODE" != "dokploy-network" ]]; then
  echo "invalid WOODRIGHT_TOOLS_NETWORK (allowed: none|dokploy-network)" >&2
  exit 2
fi
if [[ "$SCRIPT_NAME" == *".."* ]] || [[ "$SCRIPT_NAME" == /* ]]; then
  echo "script must be a basename under tools root" >&2
  exit 2
fi
if [[ ! -f "$TOOLS_ROOT/$SCRIPT_NAME" ]]; then
  echo "missing $TOOLS_ROOT/$SCRIPT_NAME" >&2
  exit 2
fi

NET_ARGS=(--network none)
if [[ "$NETWORK_MODE" != "none" ]]; then
  NET_ARGS=(--network "$NETWORK_MODE")
fi

# shellcheck disable=SC2086
exec docker run --rm \
  --read-only \
  --security-opt no-new-privileges \
  --cap-drop ALL \
  --user 1000:1000 \
  "${NET_ARGS[@]}" \
  -v "$TOOLS_ROOT:/tools:ro" \
  -v "$SCHEMAS_ROOT:/schemas:ro" \
  -v /srv/woodright/runtime-ownership:/runtime:ro \
  -v /srv/woodright/releases:/releases:ro \
  -v /srv/woodright/audit:/audit:ro \
  -w /tools \
  "$TOOLS_IMAGE_DIGEST" \
  node "/tools/$SCRIPT_NAME" "$@"
