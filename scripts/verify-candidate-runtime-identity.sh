#!/usr/bin/env bash
# Thin wrapper: candidate runtime identity (never for public acceptance).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
exec node "$ROOT/release/verify-candidate-runtime-identity.cjs" "$@"
