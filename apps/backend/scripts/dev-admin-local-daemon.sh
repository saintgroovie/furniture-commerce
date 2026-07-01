#!/usr/bin/env bash
# Запуск medusa develop в фоне с nohup, чтобы процесс не умирал вместе с сессией терминала / Cursor agent.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

RUNDIR="$ROOT/.run"
mkdir -p "$RUNDIR"
LOG="$RUNDIR/medusa-admin-local.log"
PIDFILE="$RUNDIR/medusa-admin-local.pid"

if [[ -f "$PIDFILE" ]]; then
  OLD="$(cat "$PIDFILE" 2>/dev/null || true)"
  if [[ -n "${OLD}" ]] && kill -0 "${OLD}" 2>/dev/null; then
    echo "Уже запущено (PID ${OLD}). Лог: ${LOG}"
    echo "http://localhost:9001/app/login"
    exit 0
  fi
  rm -f "$PIDFILE"
fi

for p in 9001 5174; do
  if lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Порт ${p} занят. Останови процесс или выполни: npm run dev:admin-local:stop" >&2
    exit 1
  fi
done

if lsof -nP -iTCP:9000 -sTCP:LISTEN 2>/dev/null | grep -q .; then
  echo "Внимание: порт 9000 тоже слушается (часто docker-compose medusa). Держи один «источник правды» для URL картинок:" >&2
  echo "  — Admin на 9001: MEDUSA_BACKEND_URL в процессе уже 9001, но старые thumbnail в БД могут указывать на http://localhost:9000/... (тогда нужен живой backend на 9000 или выровнять URL)." >&2
  echo "  — Либо останови Docker medusa, либо не смешивай вкладки 9000 и 9001 в одной сессии браузера." >&2
fi

nohup npm run dev:admin-local >>"$LOG" 2>&1 &
echo $! >"$PIDFILE"

echo "Запущено (PID $(cat "$PIDFILE")). Лог: ${LOG}"
echo "http://localhost:9001/app/login"
echo "Остановка: npm run dev:admin-local:stop"
