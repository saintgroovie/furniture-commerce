#!/usr/bin/env python3
"""Start Woodright Admin UX on :9001 detached from Cursor (survive shell abort).

Why: `yarn medusa develop` started inside Cursor agent shells stays under
Cursor Helper. When Cursor aborts/background-kills that shell, :9001 dies.
Shared :9000 survives because its node process is already reparented to PID 1.

This launcher double-forks + setsid so Medusa is owned by launchd (PPID=1),
writes a pid/log under tmp/, and refuses shared DB / port 9000.
"""
from __future__ import annotations

import argparse
import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

BACKEND = Path(__file__).resolve().parents[1]
WORKTREE = BACKEND.parent.parent
TMP = WORKTREE / "tmp" / "admin-ux-visual-smoke"
PIDFILE = TMP / "medusa-9001.pid"
LOGFILE = TMP / "medusa-9001.log"
EXPECTED_DB = "medusa-admin-ux-b5"
PORT = 9001


def load_dotenv(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        env[key.strip()] = val.strip().strip('"').strip("'")
    return env


def db_name(database_url: str) -> str:
    path = urlparse(database_url).path.lstrip("/")
    return path.split("?")[0]


def port_in_use(port: int) -> int | None:
    try:
        out = subprocess.check_output(
            ["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN", "-t"],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except subprocess.CalledProcessError:
        return None
    if not out:
        return None
    return int(out.splitlines()[0])


def read_pidfile() -> int | None:
    if not PIDFILE.exists():
        return None
    try:
        return int(PIDFILE.read_text().strip())
    except ValueError:
        return None


def pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def stop_pid(pid: int, timeout: float = 20.0) -> None:
    if not pid_alive(pid):
        return
    os.kill(pid, signal.SIGTERM)
    deadline = time.time() + timeout
    while time.time() < deadline:
        if not pid_alive(pid):
            return
        time.sleep(0.25)
    os.kill(pid, signal.SIGKILL)


def process_cmd(pid: int) -> str:
    try:
        return subprocess.check_output(["ps", "-o", "command=", "-p", str(pid)], text=True).strip()
    except Exception:
        return ""


def process_ppid(pid: int) -> int | None:
    try:
        return int(subprocess.check_output(["ps", "-o", "ppid=", "-p", str(pid)], text=True).strip())
    except Exception:
        return None


def listeners_on_port(port: int) -> list[int]:
    try:
        out = subprocess.check_output(
            ["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN", "-t"],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except subprocess.CalledProcessError:
        return []
    return [int(x) for x in out.splitlines() if x.strip()]


def collect_medusa_tree(listener_pid: int) -> list[int]:
    """Walk parents from listener; stop before Cursor / launchd."""
    kill_list: list[int] = []
    seen: set[int] = set()
    pid: int | None = listener_pid
    while pid and pid > 1 and pid not in seen:
        seen.add(pid)
        cmd = process_cmd(pid)
        if "Cursor" in cmd or cmd.endswith("/Cursor") or cmd == "/sbin/launchd" or cmd.endswith("launchd"):
            break
        if any(token in cmd for token in ("medusa", "yarn", "cli.js", "node")):
            kill_list.append(pid)
        pid = process_ppid(pid)
    return kill_list


def under_cursor(pid: int) -> bool:
    seen: set[int] = set()
    cur: int | None = pid
    while cur and cur > 1 and cur not in seen:
        seen.add(cur)
        cmd = process_cmd(cur)
        if "Cursor" in cmd:
            return True
        cur = process_ppid(cur)
    return False


def stop_existing() -> None:
    """Stop prior detached instance and any :9001 Medusa tree only (never :9000 / Cursor)."""
    pid = read_pidfile()
    if pid and pid_alive(pid):
        try:
            os.killpg(pid, signal.SIGTERM)
        except OSError:
            stop_pid(pid)
        time.sleep(0.5)
        if pid_alive(pid):
            try:
                os.killpg(pid, signal.SIGKILL)
            except OSError:
                stop_pid(pid)

    for listener in listeners_on_port(PORT):
        for victim in collect_medusa_tree(listener):
            stop_pid(victim)

    deadline = time.time() + 10
    while time.time() < deadline and listeners_on_port(PORT):
        for listener in listeners_on_port(PORT):
            for victim in collect_medusa_tree(listener):
                try:
                    os.kill(victim, signal.SIGKILL)
                except OSError:
                    pass
        time.sleep(0.25)

    if PIDFILE.exists():
        PIDFILE.unlink()


def daemonize(log: Path) -> None:
    # First fork
    if os.fork() > 0:
        sys.exit(0)
    os.setsid()
    # Second fork
    if os.fork() > 0:
        sys.exit(0)
    os.chdir(str(BACKEND))
    os.umask(0o22)
    log.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(str(log), os.O_RDWR | os.O_CREAT | os.O_APPEND, 0o644)
    os.dup2(fd, 0)
    os.dup2(fd, 1)
    os.dup2(fd, 2)
    if fd > 2:
        os.close(fd)


def wait_ready(timeout: float = 180.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", PORT), timeout=1.0):
                return True
        except OSError:
            time.sleep(0.5)
    return False


def http_ok(path: str = "/app") -> bool:
    try:
        out = subprocess.check_output(
            ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "5", f"http://localhost:{PORT}{path}"],
            text=True,
        ).strip()
        return out == "200"
    except subprocess.CalledProcessError:
        return False


def ensure_store_branding() -> None:
    brand_script = BACKEND / "scripts" / "ensure-woodright-store-branding.py"
    if not brand_script.is_file():
        return
    brand_env = os.environ.copy()
    brand_env["PORT"] = str(PORT)
    try:
        result = subprocess.run(
            [sys.executable, str(brand_script)],
            cwd=str(BACKEND),
            env=brand_env,
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        print((result.stdout or "").strip() or "store_branding: no output")
        if result.returncode != 0:
            print(
                f"WARN: store branding failed rc={result.returncode}: {(result.stderr or '').strip()}",
                file=sys.stderr,
            )
    except Exception as exc:  # noqa: BLE001 — branding is best-effort after boot
        print(f"WARN: store branding skipped: {exc}", file=sys.stderr)


def start() -> int:
    dotenv = load_dotenv(BACKEND / ".env")
    database_url = os.environ.get("DATABASE_URL") or dotenv.get("DATABASE_URL") or ""
    if not database_url:
        print("ERROR: DATABASE_URL missing", file=sys.stderr)
        return 2
    name = db_name(database_url)
    if name != EXPECTED_DB:
        print(f"ERROR: refusing DB={name!r}; expected {EXPECTED_DB!r}", file=sys.stderr)
        return 2

    TMP.mkdir(parents=True, exist_ok=True)

    existing = port_in_use(PORT)
    if existing and http_ok("/app") and not under_cursor(existing):
        PIDFILE.write_text(str(read_pidfile() or existing) + "\n")
        print(f"already_running_detached listener={existing} url=http://localhost:{PORT}/app/woodright")
        ensure_store_branding()
        return 0
    if existing:
        print(f"stopping existing :{PORT} listener pid={existing} under_cursor={under_cursor(existing)}")
        stop_existing()
        time.sleep(0.5)
        if listeners_on_port(PORT):
            print("ERROR: failed to free :9001", file=sys.stderr)
            return 1

    yarn = subprocess.check_output(["which", "yarn"], text=True).strip()
    env = os.environ.copy()
    env.update(dotenv)
    env.update(
        {
            "PORT": str(PORT),
            "COOKIE_SECURE": "0",
            "ADMIN_VITE_HMR": "0",
            "WOODRIGHT_ADMIN_UX_V1": "1",
            "DATABASE_URL": database_url,
        }
    )

    # Truncate log for this boot
    LOGFILE.parent.mkdir(parents=True, exist_ok=True)
    LOGFILE.write_text("")

    ready_pipe_r, ready_pipe_w = os.pipe()
    child = os.fork()
    if child == 0:
        os.close(ready_pipe_r)
        daemonize(LOGFILE)
        PIDFILE.write_text(str(os.getpid()) + "\n")
        os.write(ready_pipe_w, b"1")
        os.close(ready_pipe_w)
        os.execve(
            yarn,
            [yarn, "medusa", "develop", "--no-types"],
            env,
        )
        os._exit(127)

    os.close(ready_pipe_w)
    try:
        os.read(ready_pipe_r, 1)
    finally:
        os.close(ready_pipe_r)

    daemon_pid = read_pidfile()
    print(f"started_daemon pid={daemon_pid} log={LOGFILE}")
    if not wait_ready(180):
        print("ERROR: :9001 did not become ready", file=sys.stderr)
        print(f"See log: {LOGFILE}", file=sys.stderr)
        return 1

    listener = port_in_use(PORT)
    if not listener:
        print("ERROR: no listener on :9001 after ready wait", file=sys.stderr)
        return 1
    if under_cursor(listener):
        print("ERROR: listener is still under Cursor process tree", file=sys.stderr)
        status()
        return 1

    print(f"listener_pid={listener} listener_ppid={process_ppid(listener)} under_cursor=False")
    if not http_ok("/app"):
        print("ERROR: /app not HTTP 200", file=sys.stderr)
        return 1

    print(f"ready url=http://localhost:{PORT}/app/woodright")
    print(f"pidfile={PIDFILE}")
    print("detached: Cursor shell abort must not kill this process")
    ensure_store_branding()
    return 0


def status() -> int:
    listener = port_in_use(PORT)
    pid = read_pidfile()
    print(f"pidfile={pid} alive={bool(pid and pid_alive(pid))}")
    print(f"listener={listener}")
    if listener:
        print(f"listener_ppid={process_ppid(listener)}")
        print(f"listener_cmd={process_cmd(listener)}")
        print(f"under_cursor={under_cursor(listener)}")
        p = listener
        for _ in range(8):
            pp = process_ppid(p)
            if pp is None:
                break
            print(f"ancestor ppid={pp} :: {process_cmd(pp)[:120]}")
            if pp <= 1:
                break
            p = pp
    print(f"http_app={'200' if http_ok('/app') else 'fail'}")
    print(f"http_woodright={'200' if http_ok('/app/woodright') else 'fail'}")
    if not listener or not http_ok("/app"):
        return 1
    if under_cursor(listener):
        return 2
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["start", "stop", "restart", "status"])
    args = parser.parse_args()
    if args.action == "stop":
        stop_existing()
        print("stopped")
        return 0
    if args.action == "status":
        return status()
    if args.action == "restart":
        stop_existing()
        time.sleep(0.5)
        return start()
    return start()


if __name__ == "__main__":
    raise SystemExit(main())
