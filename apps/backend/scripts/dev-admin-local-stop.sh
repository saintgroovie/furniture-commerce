#!/usr/bin/env bash
# Остановка фонового dev:admin-local, запущенного через dev-admin-local-daemon.sh
# Дополнительно освобождает 9001/5174, если после npm остались дочерние node (medusa).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PIDFILE="$ROOT/.run/medusa-admin-local.pid"

kill_pid_tree() {
  local p="$1"
  if [[ -z "${p}" ]] || ! kill -0 "${p}" 2>/dev/null; then
    return 0
  fi
  local children
  children="$(pgrep -P "${p}" 2>/dev/null || true)"
  for c in ${children}; do
    kill_pid_tree "${c}"
  done
  kill "${p}" 2>/dev/null || true
}

if [[ -f "$PIDFILE" ]]; then
  PID="$(cat "$PIDFILE" 2>/dev/null || true)"
  if [[ -n "${PID}" ]]; then
    if kill -0 "${PID}" 2>/dev/null; then
      echo "Останавливаю дерево процессов от PID ${PID} (npm / medusa)…"
      kill_pid_tree "${PID}"
    else
      echo "Pidfile устарел (PID ${PID} не существует)."
    fi
  fi
  rm -f "$PIDFILE"
else
  echo "Pidfile не найден (${PIDFILE}) — выполню только очистку портов 9001/5174 для этого репозитория."
fi

sleep 1

for port in 9001 5174; do
  pids="$(lsof -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true)"
  for p in ${pids}; do
    cmd="$(ps -p "${p}" -o command= 2>/dev/null || true)"
    if [[ "${cmd}" == *"${ROOT}"* ]] && [[ "${cmd}" == *medusa* ]]; then
      echo "Освобождаю порт ${port}: PID ${p}"
      kill "${p}" 2>/dev/null || true
    fi
  done
done

echo "Готово. Проверка: lsof -nP -iTCP:9001 -sTCP:LISTEN"
