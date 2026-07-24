#!/usr/bin/env python3
"""Detach long-lived preview servers so Cursor agent-shell aborts cannot kill them.

Double-fork + setsid. State under ~/.woodright/durable-local-servers/<name>/
(approved ops state dir; parallel to ~/.woodright/qa-dev-servers/).

Hard refusals:
  - ports 9000 and 3002 (use scripts/local-dev/woodright-*.sh from canonical root)
  - stop/start signals without matching recorded identity (pid+lstart+cmdline+cwd)

Examples:
  python3 scripts/local/durable_local_server.py start \\
    --name sf-3029 --cwd apps/storefront --port 3029 \\
    --cmd 'yarn next dev --port 3029 --hostname 127.0.0.1' \\
    --env NEXT_DIST_DIR=.next-dev
"""

from __future__ import annotations

import argparse
import json
import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

STATE_ROOT = Path.home() / ".woodright" / "durable-local-servers"
FORBIDDEN_PORTS = {9000, 3002}


def state_dir(name: str) -> Path:
    if not name or "/" in name or name.startswith("."):
        raise SystemExit(f"invalid --name: {name!r}")
    return STATE_ROOT / name


def ensure_state_root() -> None:
    STATE_ROOT.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(STATE_ROOT, 0o700)
    except OSError:
        pass


def port_listening(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        try:
            return s.connect_ex((host, port)) == 0
        except OSError:
            return False


def refuse_forbidden_port(port: int | None) -> None:
    if port in FORBIDDEN_PORTS:
        raise SystemExit(
            f"refused: port {port} is managed only by "
            f"scripts/local-dev/woodright-backend.sh (:9000) or "
            f"woodright-storefront.sh (:3002) from the canonical root. "
            f"Use those entrypoints; this launcher is for alternate preview ports only."
        )


def ps_field(pid: int, field: str) -> str | None:
    try:
        out = subprocess.check_output(
            ["ps", "-p", str(pid), "-o", f"{field}="],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
        return out or None
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def process_cwd(pid: int) -> str | None:
    try:
        out = subprocess.check_output(
            ["lsof", "-a", "-p", str(pid), "-d", "cwd", "-Fn"],
            text=True,
            stderr=subprocess.DEVNULL,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None
    for line in out.splitlines():
        if line.startswith("n"):
            return line[1:] or None
    return None


def live_identity(pid: int) -> dict | None:
    lstart = ps_field(pid, "lstart")
    if not lstart:
        return None
    cmdline = ps_field(pid, "command")
    cwd = process_cwd(pid)
    return {
        "pid": pid,
        "lstart": lstart,
        "cmdline": cmdline or "",
        "cwd": cwd or "",
    }


def parse_pid(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value > 0 else None
    if isinstance(value, str):
        s = value.strip()
        if not s.isdigit():
            return None
        pid = int(s)
        return pid if pid > 0 else None
    return None


def read_record(d: Path) -> dict | None:
    p = d / "identity.json"
    if not p.exists():
        return None
    try:
        data = json.loads(p.read_text())
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict) or "pid" not in data:
        return None
    return data


def write_record(d: Path, data: dict) -> None:
    ensure_state_root()
    d.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(d, 0o700)
    except OSError:
        pass
    path = d / "identity.json"
    tmp = d / "identity.json.tmp"
    tmp.write_text(json.dumps(data, indent=2) + "\n")
    os.chmod(tmp, 0o600)
    tmp.replace(path)


def as_nonempty_str(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    s = value.strip()
    return s or None


def owned_running(d: Path) -> dict | None:
    rec = read_record(d)
    if not rec:
        return None
    pid = parse_pid(rec.get("pid"))
    if pid is None:
        return None
    live = live_identity(pid)
    if not live:
        return None
    if live["lstart"] != rec.get("lstart"):
        return None
    recorded_cmd = as_nonempty_str(rec.get("cmdline"))
    live_cmd = as_nonempty_str(live.get("cmdline"))
    if not recorded_cmd or not live_cmd or recorded_cmd != live_cmd:
        return None
    recorded_cwd = as_nonempty_str(rec.get("cwd"))
    live_cwd = as_nonempty_str(live.get("cwd"))
    if not recorded_cwd or not live_cwd:
        return None
    try:
        if Path(recorded_cwd).resolve() != Path(live_cwd).resolve():
            return None
    except OSError:
        return None
    return {**rec, **live}


def cmd_status(args: argparse.Namespace) -> int:
    refuse_forbidden_port(args.port or None)
    d = state_dir(args.name)
    owned = owned_running(d)
    print(f"name={args.name}")
    print(f"state_dir={d}")
    if owned:
        print(f"status=running pid={owned['pid']}")
        print(f"lstart={owned.get('lstart')}")
        print(f"cmdline={owned.get('cmdline')}")
        print(f"cwd={owned.get('cwd')}")
    else:
        rec = read_record(d)
        if rec:
            print("status=stale_or_dead (identity mismatch or process gone; will not signal)")
            print(f"recorded_pid={rec.get('pid')}")
        else:
            print("status=not_running")
    if args.port:
        print(f"port_{args.port}={'listen' if port_listening(args.port) else 'free'}")
    return 0 if owned else 1


def cmd_stop(args: argparse.Namespace) -> int:
    refuse_forbidden_port(args.port or None)
    d = state_dir(args.name)
    owned = owned_running(d)
    if not owned:
        print(
            f"refuse_stop name={args.name}: no verified owned process "
            f"(stale pidfile is ignored; will not kill recycled PIDs)",
            file=sys.stderr,
        )
        return 2
    pid = int(owned["pid"])
    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        print(f"already_gone pid={pid}")
        return 0
    for _ in range(30):
        if live_identity(pid) is None:
            break
        time.sleep(0.1)
    if live_identity(pid) is not None:
        # re-verify identity before SIGKILL
        still = owned_running(d)
        if still and int(still["pid"]) == pid:
            os.kill(pid, signal.SIGKILL)
        else:
            print("refuse_kill: identity changed before SIGKILL", file=sys.stderr)
            return 3
    print(f"stopped name={args.name} pid={pid}")
    return 0


def cmd_start(args: argparse.Namespace) -> int:
    refuse_forbidden_port(args.port)
    d = state_dir(args.name)
    owned = owned_running(d)
    if owned:
        if args.port and port_listening(args.port):
            print(f"already_running name={args.name} pid={owned['pid']} port={args.port}")
            return 0
        print(f"already_running name={args.name} pid={owned['pid']}")
        return 0

    rec = read_record(d)
    if rec:
        stale_pid = parse_pid(rec.get("pid"))
        if stale_pid is not None and live_identity(stale_pid) is not None:
            # live PID but identity mismatch — refuse rather than kill
            print(
                f"refuse_start name={args.name}: pid {stale_pid} is alive but identity "
                f"does not match record (possible PID reuse). Inspect manually; "
                f"do not auto-kill.",
                file=sys.stderr,
            )
            return 3

    if args.port and port_listening(args.port):
        print(
            f"port_busy name={args.name} port={args.port}: reuse existing listener; "
            f"this launcher will not bind or force-kill.",
            file=sys.stderr,
        )
        return 2

    cwd = Path(args.cwd).expanduser().resolve()
    if not cwd.is_dir():
        raise SystemExit(f"cwd missing: {cwd}")

    env = os.environ.copy()
    for item in args.env or []:
        if "=" not in item:
            raise SystemExit(f"bad --env {item!r}; want KEY=VALUE")
        k, v = item.split("=", 1)
        env[k] = v

    ensure_state_root()
    d.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(d, 0o700)
    except OSError:
        pass
    log_path = d / "server.log"
    (d / "cmd.txt").write_text(args.cmd + "\n")
    (d / "cwd.txt").write_text(str(cwd) + "\n")

    # Double-fork so the process is not in the Cursor agent process group.
    pid1 = os.fork()
    if pid1 > 0:
        os.waitpid(pid1, 0)
        deadline = time.time() + 5
        while time.time() < deadline:
            if owned_running(d):
                break
            time.sleep(0.05)
        owned = owned_running(d)
        if not owned:
            print("start_failed: identity not recorded", file=sys.stderr)
            return 1
        print(f"started name={args.name} pid={owned['pid']} log={log_path}")
        if args.port:
            wait_deadline = time.time() + max(1, args.wait_listen)
            while time.time() < wait_deadline:
                if port_listening(args.port):
                    print(f"listening port={args.port}")
                    return 0
                time.sleep(0.25)
            print(f"warn: port {args.port} not listening yet; see {log_path}", file=sys.stderr)
        return 0

    os.setsid()
    pid2 = os.fork()
    if pid2 > 0:
        os._exit(0)

    os.chdir(cwd)
    sys.stdin.close()
    log_f = open(log_path, "a", buffering=1)
    os.dup2(log_f.fileno(), 1)
    os.dup2(log_f.fileno(), 2)

    proc = subprocess.Popen(
        ["bash", "-lc", args.cmd],
        cwd=str(cwd),
        env=env,
        start_new_session=True,
    )
    # record identity after process exists
    time.sleep(0.05)
    ident = live_identity(proc.pid) or {"pid": proc.pid, "lstart": "", "cmdline": ""}
    write_record(
        d,
        {
            "pid": proc.pid,
            "lstart": ident.get("lstart") or "",
            "cmdline": ident.get("cmdline") or "",
            "cwd": str(cwd),
            "port": args.port,
            "cmd": args.cmd,
            "name": args.name,
        },
    )
    rc = proc.wait()
    # clear only if still our record
    cur = read_record(d)
    cur_pid = parse_pid(cur.get("pid")) if cur else None
    if cur_pid == proc.pid:
        try:
            (d / "identity.json").unlink()
        except OSError:
            pass
    os._exit(rc or 0)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="action", required=True)

    def add_common(p: argparse.ArgumentParser) -> None:
        p.add_argument("--name", required=True, help="stable id, e.g. sf-3029")
        p.add_argument("--port", type=int, default=0, help="listen port (not 9000/3002)")

    p_start = sub.add_parser("start", help="double-fork detach start")
    add_common(p_start)
    p_start.add_argument("--cwd", required=True)
    p_start.add_argument("--cmd", required=True, help="bash -lc command string")
    p_start.add_argument("--env", action="append", default=[], help="KEY=VALUE (repeatable)")
    p_start.add_argument("--wait-listen", type=int, default=25, dest="wait_listen")

    p_stop = sub.add_parser("stop", help="stop only if identity matches")
    add_common(p_stop)

    p_status = sub.add_parser("status", help="show verified ownership")
    add_common(p_status)

    args = ap.parse_args()
    if args.action == "start":
        return cmd_start(args)
    if args.action == "stop":
        return cmd_stop(args)
    return cmd_status(args)


if __name__ == "__main__":
    raise SystemExit(main())
