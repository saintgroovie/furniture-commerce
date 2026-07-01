#!/usr/bin/env bash
# Однократная очистка всех локальных medusa develop / cli для ЭТОГО backend (устраняет зомби после Cursor/терминалов).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Ищу процессы medusa для: ${ROOT}"

# shellcheck disable=SC2009
ps aux 2>/dev/null | grep -F "${ROOT}" | grep -E "medusa develop|@medusajs/cli/cli\.js start" | grep -v grep || true

pkill -f "${ROOT}/node_modules/.bin/medusa develop" 2>/dev/null && echo "Остановлены: medusa develop" || echo "medusa develop: не найдено или уже остановлено"
pkill -f "${ROOT}/node_modules/@medusajs/cli/cli.js start" 2>/dev/null && echo "Остановлены: medusa cli start / start --types" || echo "medusa cli start: не найдено или уже остановлено"

rm -f "${ROOT}/.run/medusa-admin-local.pid"

sleep 1
if lsof -nP -iTCP:9001 -sTCP:LISTEN 2>/dev/null | grep -q .; then
  echo "Внимание: порт 9001 всё ещё занят (возможен другой процесс или Docker)." >&2
  lsof -nP -iTCP:9001 -sTCP:LISTEN || true
else
  echo "Порт 9001 свободен."
fi
