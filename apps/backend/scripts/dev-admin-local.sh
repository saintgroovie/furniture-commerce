#!/usr/bin/env bash
# Альтернативный admin на :9001 / :5174 — env применяется и к bootstrap, и к medusa develop.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export PORT=9001
export ADMIN_VITE_PORT=5174
export ADMIN_CORS="http://localhost:5174,http://127.0.0.1:5174,http://localhost:9001,http://127.0.0.1:9001"
export AUTH_CORS="http://localhost:5174,http://127.0.0.1:5174,http://localhost:8000,http://127.0.0.1:8000,http://localhost:9001,http://127.0.0.1:9001"
export MEDUSA_BACKEND_URL="http://localhost:9001"

node scripts/ensure-admin-dev-stable.mjs
# MEDUSA_FF_BACKEND_HMR=true намеренно НЕ включён: вызывает self-restart loop
# каждые ~30s (TS type-regen race на cold start), который ломает live Vite cache
# и приводит к бесконечной перезагрузке admin-вкладки. См. finalize-vite-cache.mjs.
exec env medusa develop
