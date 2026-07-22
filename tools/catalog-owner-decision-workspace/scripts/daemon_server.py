#!/usr/bin/env python3
"""Double-fork durable launcher for local owner-decision workspace (127.0.0.1 only)."""
from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PID_FILE = Path(os.environ.get("OWNER_REVIEW_PID_FILE", "/tmp/woodright-owner-decision-workspace.pid"))
LOG_FILE = Path(os.environ.get("OWNER_REVIEW_LOG_FILE", "/tmp/woodright-owner-decision-workspace.log"))
HOST = os.environ.get("OWNER_REVIEW_HOST", "127.0.0.1")
PORT = os.environ.get("OWNER_REVIEW_PORT", "3051")


def read_pid() -> int | None:
    if not PID_FILE.exists():
        return None
    try:
        return int(PID_FILE.read_text().strip())
    except Exception:
        return None


def is_running(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def start() -> None:
    pid = read_pid()
    if pid and is_running(pid):
        print(f"already_running pid={pid} url=http://{HOST}:{PORT}/")
        return

    env = os.environ.copy()
    env.setdefault("OWNER_REVIEW_HOST", HOST)
    env.setdefault("OWNER_REVIEW_PORT", PORT)

    # First fork
    if os.fork() > 0:
        time.sleep(0.4)
        pid2 = read_pid()
        print(f"started pid={pid2} url=http://{HOST}:{PORT}/ log={LOG_FILE}")
        return

    os.setsid()
    # Second fork
    if os.fork() > 0:
        os._exit(0)

    sys.stdout.flush()
    sys.stderr.flush()
    with open(LOG_FILE, "ab", buffering=0) as log:
        os.dup2(log.fileno(), 1)
        os.dup2(log.fileno(), 2)
        proc = subprocess.Popen(
            [sys.executable.replace("python3", "node") if False else "node", str(ROOT / "server.cjs")],
            cwd=str(ROOT),
            env=env,
            stdin=subprocess.DEVNULL,
        )
        PID_FILE.write_text(str(proc.pid))
        proc.wait()
        try:
            PID_FILE.unlink(missing_ok=True)
        except Exception:
            pass
        os._exit(proc.returncode or 0)


def stop() -> None:
    pid = read_pid()
    if not pid:
        print("not_running")
        return
    if not is_running(pid):
        PID_FILE.unlink(missing_ok=True)
        print("stale_pid_cleared")
        return
    os.kill(pid, signal.SIGTERM)
    for _ in range(50):
        if not is_running(pid):
            break
        time.sleep(0.1)
    PID_FILE.unlink(missing_ok=True)
    print(f"stopped pid={pid}")


def status() -> None:
    pid = read_pid()
    if pid and is_running(pid):
        print(f"running pid={pid} url=http://{HOST}:{PORT}/")
    else:
        print("not_running")


def main() -> None:
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    if cmd == "start":
        start()
    elif cmd == "stop":
        stop()
    elif cmd == "status":
        status()
    else:
        raise SystemExit("usage: daemon_server.py start|stop|status")


if __name__ == "__main__":
    main()
