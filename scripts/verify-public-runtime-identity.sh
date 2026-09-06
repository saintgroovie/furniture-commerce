#!/usr/bin/env bash
# Thin wrapper: fail-closed public runtime identity check.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
exec node "$ROOT/release/verify-public-runtime-identity.cjs" "$@"
