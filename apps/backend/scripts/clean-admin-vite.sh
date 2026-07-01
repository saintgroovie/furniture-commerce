#!/usr/bin/env bash
# Очистка Vite-кэша Medusa Admin и остановка локальных medusa-процессов этого backend.
# Устраняет: Failed to fetch dynamically imported module .../.vite/deps/product-detail-*.js
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Останавливаю medusa для ${ROOT}"

pkill -f "${ROOT}/node_modules/.bin/medusa develop" 2>/dev/null || true
pkill -f "${ROOT}/node_modules/@medusajs/cli/cli.js start" 2>/dev/null || true

for port in 9000 9001 5173 5174; do
  pids="$(lsof -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true)"
  for p in ${pids}; do
    cmd="$(ps -p "${p}" -o command= 2>/dev/null || true)"
    if [[ "${cmd}" == *"${ROOT}"* ]]; then
      echo "    порт ${port}: SIGTERM PID ${p}"
      kill "${p}" 2>/dev/null || true
    fi
  done
done

sleep 1

echo "==> Удаляю Vite / admin dev артефакты"
rm -rf "${ROOT}/node_modules/.vite"
rm -rf "${ROOT}/.medusa/vite"
rm -rf "${ROOT}"/.medusa/vite-*
# сироты после прерванного optimize-deps (hash mismatch в браузере)
find "${ROOT}/.medusa" -maxdepth 2 -type d -name 'deps_temp_*' -exec rm -rf {} + 2>/dev/null || true
# macOS duplicate "deps 2" folders after interrupted optimize-deps
find "${ROOT}/.medusa" -maxdepth 2 -type d -name 'deps *' -exec rm -rf {} + 2>/dev/null || true
rm -rf "${ROOT}/.medusa/client/.medusa"
rm -rf "${ROOT}/.medusa/client"
# symlink public/admin → dist; при dev не нужен, при start пересоздаётся после build
if [[ -L "${ROOT}/public/admin" ]]; then
  rm -f "${ROOT}/public/admin"
fi

rm -f "${ROOT}/.run/medusa-admin-local.pid"

echo "==> Готово. Запустите: npm run dev"
echo "    Затем в браузере: hard refresh (Cmd+Shift+R) на http://localhost:9000/app"
