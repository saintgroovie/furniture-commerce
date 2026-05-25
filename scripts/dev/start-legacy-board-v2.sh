#!/usr/bin/env bash
# Start trusted Next dev for Legacy Media Assignment Board v2 (port 3002).
# Does not start backend, DB, or Docker.

set -euo pipefail

PORT=3002
ROUTE="/qa/legacy-media-assignment-board-v2"
REQUIRED_BADGE="v2 build: gallery-170-reorder"
V2_BOARD_REL="apps/storefront/src/app/qa/legacy-media-assignment-board-v2"

# Resolve repo root (script lives in scripts/dev/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
STOREFRONT_DIR="${REPO_ROOT}/apps/storefront"
LOG_DIR="${REPO_ROOT}/tmp/logs"
PID_FILE="${LOG_DIR}/v2board-next-3002.pid"
LOG_FILE="${LOG_DIR}/v2board-next-3002.log"
TRUSTED_URL="http://localhost:${PORT}${ROUTE}"

cd "${REPO_ROOT}"

echo "== Legacy Media Assignment Board v2 — trusted dev start =="
echo "Repo:  ${REPO_ROOT}"

if [[ ! -d "${REPO_ROOT}/${V2_BOARD_REL}" ]]; then
  echo "ERROR: v2 board path missing: ${V2_BOARD_REL}" >&2
  echo "Run this script from emergency-fix repo only." >&2
  exit 1
fi

if command -v git >/dev/null 2>&1 && git -C "${REPO_ROOT}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "HEAD:   $(git -C "${REPO_ROOT}" rev-parse --short HEAD)"
  echo "Branch: $(git -C "${REPO_ROOT}" branch --show-current)"
else
  echo "WARN: not a git worktree at ${REPO_ROOT}" >&2
fi

mkdir -p "${LOG_DIR}"

stop_stale_3002() {
  local pids
  pids="$(lsof -iTCP:"${PORT}" -sTCP:LISTEN -t 2>/dev/null || true)"
  if [[ -z "${pids}" ]]; then
    echo "Port ${PORT}: free"
    return 0
  fi

  for pid in ${pids}; do
    local proc_cwd=""
    if proc_cwd="$(lsof -p "${pid}" 2>/dev/null | awk '/cwd/{print $9}' | head -1)"; then
      :
    fi
    if [[ "${proc_cwd}" == "${STOREFRONT_DIR}" ]] || [[ "${proc_cwd}" == "${REPO_ROOT}/apps/storefront" ]]; then
      echo "Stopping stale Next on ${PORT} (pid ${pid}, cwd ${proc_cwd})"
      kill "${pid}" 2>/dev/null || true
      sleep 2
      if kill -0 "${pid}" 2>/dev/null; then
        echo "Force kill pid ${pid}"
        kill -9 "${pid}" 2>/dev/null || true
      fi
    else
      echo "WARN: port ${PORT} in use by pid ${pid} (cwd=${proc_cwd:-unknown}) — not this storefront; not killing" >&2
      return 1
    fi
  done
  return 0
}

if ! stop_stale_3002; then
  echo "ERROR: cannot bind port ${PORT}. Free the port or stop the foreign process." >&2
  exit 1
fi

if [[ -f "${PID_FILE}" ]]; then
  old_pid="$(cat "${PID_FILE}" 2>/dev/null || true)"
  if [[ -n "${old_pid}" ]] && kill -0 "${old_pid}" 2>/dev/null; then
    echo "Stopping previous launcher pid ${old_pid}"
    kill "${old_pid}" 2>/dev/null || true
  fi
fi

echo "Clearing stale cache: apps/storefront/.next"
rm -rf "${STOREFRONT_DIR}/.next"

echo "Starting Next dev on port ${PORT}..."
cd "${STOREFRONT_DIR}"
nohup npx next dev --port "${PORT}" >"${LOG_FILE}" 2>&1 &
launcher_pid=$!
echo "${launcher_pid}" >"${PID_FILE}"

echo "Launcher pid: ${launcher_pid} (logged to ${PID_FILE})"
echo "Log file:     ${LOG_FILE}"
echo "Waiting for HTTP 200 on ${TRUSTED_URL} ..."

ready=0
for _ in $(seq 1 40); do
  code="$(curl -sS -m 3 -o /dev/null -w "%{http_code}" "${TRUSTED_URL}" 2>/dev/null || echo "000")"
  if [[ "${code}" == "200" ]]; then
    ready=1
    break
  fi
  sleep 2
done

listener_pid="$(lsof -iTCP:"${PORT}" -sTCP:LISTEN -t 2>/dev/null | head -1 || true)"

echo ""
if [[ "${ready}" -eq 1 ]]; then
  echo "OK — v2 board reachable (HTTP 200)"
else
  echo "WARN — route not yet HTTP 200; check ${LOG_FILE}" >&2
fi

echo ""
echo "Trusted URL:     ${TRUSTED_URL}"
echo "Required badge:  ${REQUIRED_BADGE}"
echo "Listener pid:    ${listener_pid:-unknown}"
echo ""
echo "Operator: hard refresh (Cmd+Shift+R) and confirm badge in header."
echo "Reorder: use ← / → or drag only via ↕ Перетащить handle."
echo ""
echo "NOT valid for v2: http://localhost:8000 (Docker parent repo → 404)"
echo "Do not use stale :8010 / :3000 unless restarted with this script."
