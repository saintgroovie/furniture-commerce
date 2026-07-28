#!/usr/bin/env python3
"""Detach long-lived preview servers so Cursor agent-shell aborts cannot kill them.

Double-fork + setsid. State under ~/.woodright/durable-local-servers/<name>/
(approved ops state dir; parallel to ~/.woodright/qa-dev-servers/).

Hard refusals:
  - ports 9000 and 3002 (use scripts/local-dev/woodright-*.sh from canonical root)
  - stop/start signals without matching recorded identity (pid+lstart+cmdline+cwd)
  - any state path that is a symlink or escapes the canonical state root
  - recorded identity port in {3002, 9000} even for name-only stop/status

Examples:
  python3 scripts/local/durable_local_server.py start \\
    --name sf-3029 --cwd apps/storefront --port 3029 \\
    --cmd 'yarn next dev --port 3029 --hostname 127.0.0.1' \\
    --env NEXT_DIST_DIR=.next-dev
"""

from __future__ import annotations

import argparse
import errno
import json
import os
import re
import signal
import socket
import stat
import subprocess
import sys
import time
from pathlib import Path

FORBIDDEN_PORTS = {9000, 3002}
MAX_IDENTITY_BYTES = 64 * 1024
# Leading dot banned separately; `.` allowed inside (e.g. legacy ids), not as `.` / `..`.
SERVER_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]*$")
_O_NOFOLLOW = getattr(os, "O_NOFOLLOW", 0)


def _die(msg: str, code: int = 1) -> None:
    raise SystemExit(msg)


def _validate_server_name(name: str) -> str:
    if not isinstance(name, str) or not name:
        _die(f"invalid --name: {name!r}")
    if any(ord(ch) < 32 for ch in name):
        _die(f"invalid --name (control chars): {name!r}")
    if "/" in name or "\\" in name or "\0" in name:
        _die(f"invalid --name (path separator): {name!r}")
    if name in {".", ".."} or name.startswith("."):
        _die(f"invalid --name: {name!r}")
    if ".." in name:
        _die(f"invalid --name (traversal): {name!r}")
    if not SERVER_NAME_RE.fullmatch(name):
        _die(
            f"invalid --name: {name!r} "
            f"(allowlist: letters, digits, underscore, hyphen; no leading dot)"
        )
    return name


def _home_dir() -> Path:
    return Path.home().expanduser().absolute()


def _canonical_state_root() -> Path:
    return _home_dir() / ".woodright" / "durable-local-servers"


def _assert_path_within_root(path: Path, root: Path, label: str) -> Path:
    path_abs = path.expanduser().absolute()
    root_abs = root.expanduser().absolute()
    try:
        path_abs.relative_to(root_abs)
    except ValueError:
        _die(f"refused: {label} escapes state root ({path_abs} not under {root_abs})")
    return path_abs


def _lstat_reject_symlink(path: Path, label: str, *, allow_missing: bool = False):
    try:
        st = os.lstat(path)
    except FileNotFoundError:
        if allow_missing:
            return None
        _die(f"refused: {label} missing: {path}")
    except OSError as e:
        _die(f"refused: cannot lstat {label}: {e}")
    if stat.S_ISLNK(st.st_mode):
        _die(f"refused: {label} is a symlink: {path}")
    return st


def _assert_real_directory(path: Path, label: str, *, allow_missing: bool = False):
    st = _lstat_reject_symlink(path, label, allow_missing=allow_missing)
    if st is None:
        return None
    if not stat.S_ISDIR(st.st_mode):
        _die(f"refused: {label} is not a directory: {path}")
    return st


def _assert_real_regular_file(path: Path, label: str, *, allow_missing: bool = False):
    st = _lstat_reject_symlink(path, label, allow_missing=allow_missing)
    if st is None:
        return None
    if not stat.S_ISREG(st.st_mode):
        _die(f"refused: {label} is not a regular file: {path}")
    return st


def _mkdir_real(path: Path, label: str, mode: int = 0o700) -> None:
    parent = path.parent
    _assert_real_directory(parent, f"parent of {label}")
    try:
        os.mkdir(path, mode)
    except FileExistsError:
        pass
    _assert_real_directory(path, label)


def _nofollow_oserror(err: OSError, label: str) -> None:
    if err.errno in {errno.ELOOP, getattr(errno, "EMLINK", -1)} or (
        _O_NOFOLLOW and err.errno in {errno.EPERM, errno.EINVAL}
    ):
        _die(f"refused: {label} blocked by no-follow open: {err}")
    _die(f"refused: cannot open {label}: {err}")


def _open_dir_fd(path: Path, label: str) -> int:
    """Open a real directory FD; refuse if the final path component is a symlink."""
    flags = os.O_RDONLY | _O_NOFOLLOW
    o_dir = getattr(os, "O_DIRECTORY", 0)
    if o_dir:
        flags |= o_dir
    try:
        fd = os.open(str(path), flags)
    except FileNotFoundError:
        _die(f"refused: {label} missing: {path}")
    except OSError as e:
        _nofollow_oserror(e, label)
        raise  # pragma: no cover
    try:
        st = os.fstat(fd)
        if not stat.S_ISDIR(st.st_mode):
            os.close(fd)
            _die(f"refused: {label} is not a directory after open: {path}")
        return fd
    except Exception:
        try:
            os.close(fd)
        except OSError:
            pass
        raise


def _fstatat_nofollow(dir_fd: int, name: str, label: str, *, allow_missing: bool = False):
    try:
        return os.stat(name, dir_fd=dir_fd, follow_symlinks=False)
    except FileNotFoundError:
        if allow_missing:
            return None
        _die(f"refused: {label} missing")
    except OSError as e:
        _die(f"refused: cannot fstatat {label}: {e}")


def ensure_state_root() -> Path:
    """Create and return canonical state root; refuse if any component is a symlink."""
    home = _home_dir()
    woodright = home / ".woodright"
    root = woodright / "durable-local-servers"

    if not woodright.exists():
        try:
            os.mkdir(woodright, 0o700)
        except FileExistsError:
            pass
    _assert_real_directory(woodright, "~/.woodright")

    wr_fd = _open_dir_fd(woodright, "~/.woodright")
    try:
        st = _fstatat_nofollow(
            wr_fd, "durable-local-servers", "durable-local-servers", allow_missing=True
        )
        if st is None:
            try:
                os.mkdir("durable-local-servers", 0o700, dir_fd=wr_fd)
            except FileExistsError:
                pass
            st = _fstatat_nofollow(wr_fd, "durable-local-servers", "durable-local-servers")
        if stat.S_ISLNK(st.st_mode):
            _die("refused: durable-local-servers state root is a symlink")
        if not stat.S_ISDIR(st.st_mode):
            _die("refused: durable-local-servers state root is not a directory")
        root_fd = os.open(
            "durable-local-servers",
            os.O_RDONLY | _O_NOFOLLOW | getattr(os, "O_DIRECTORY", 0),
            dir_fd=wr_fd,
        )
        try:
            os.fchmod(root_fd, 0o700)
        except OSError:
            pass
        os.close(root_fd)
    finally:
        os.close(wr_fd)
    return root


def open_state_root_fd() -> tuple[Path, int]:
    """Return (root path, dir FD) for the canonical state root via no-follow chain."""
    root = ensure_state_root()
    woodright = _home_dir() / ".woodright"
    wr_fd = _open_dir_fd(woodright, "~/.woodright")
    try:
        root_fd = os.open(
            "durable-local-servers",
            os.O_RDONLY | _O_NOFOLLOW | getattr(os, "O_DIRECTORY", 0),
            dir_fd=wr_fd,
        )
    except OSError as e:
        os.close(wr_fd)
        _nofollow_oserror(e, "durable-local-servers state root")
        raise  # pragma: no cover
    os.close(wr_fd)
    st = os.fstat(root_fd)
    if not stat.S_ISDIR(st.st_mode):
        os.close(root_fd)
        _die("refused: state root FD is not a directory")
    return root, root_fd


def open_named_state_dir_fd(root_fd: int, name: str, *, create: bool = False) -> int:
    """Open (or create+open) a named state dir relative to an open root FD."""
    validated = _validate_server_name(name)
    flags = os.O_RDONLY | _O_NOFOLLOW | getattr(os, "O_DIRECTORY", 0)
    try:
        return os.open(validated, flags, dir_fd=root_fd)
    except FileNotFoundError:
        if not create:
            raise
        try:
            os.mkdir(validated, 0o700, dir_fd=root_fd)
        except FileExistsError:
            pass
        try:
            return os.open(validated, flags, dir_fd=root_fd)
        except OSError as e:
            _nofollow_oserror(e, "state_dir")
            raise
    except OSError as e:
        _nofollow_oserror(e, "state_dir")
        raise


def safe_state_paths(name: str) -> tuple[Path, Path, Path, Path]:
    """Return (root, state_dir, identity.json, identity.json.tmp) after validation."""
    validated = _validate_server_name(name)
    root, root_fd = open_state_root_fd()
    try:
        # Probe existence via openat — never follow a replaced root symlink.
        try:
            state_fd = open_named_state_dir_fd(root_fd, validated, create=False)
            os.close(state_fd)
        except FileNotFoundError:
            pass
    finally:
        os.close(root_fd)
    d = _assert_path_within_root(root / validated, root, "state_dir")
    if d.parent.absolute() != root.absolute():
        _die(f"refused: state_dir is not a direct child of root: {d}")
    identity = _assert_path_within_root(d / "identity.json", root, "identity.json")
    tmp = _assert_path_within_root(d / "identity.json.tmp", root, "identity.json.tmp")
    return root, d, identity, tmp


# Back-compat alias used by older call sites / mental model
def state_dir(name: str) -> Path:
    return safe_state_paths(name)[1]


def port_listening(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        try:
            return s.connect_ex((host, port)) == 0
        except OSError:
            return False


def refuse_forbidden_port(port: int | None) -> None:
    if port is None:
        return
    if port in FORBIDDEN_PORTS:
        _die(
            f"refused: port {port} is managed only by "
            f"scripts/local-dev/woodright-backend.sh (:9000) or "
            f"woodright-storefront.sh (:3002) from the canonical root. "
            f"Use those entrypoints; this launcher is for alternate preview ports only."
        )


def parse_port(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value > 0 else None
    if isinstance(value, str):
        s = value.strip()
        if not s.isdigit():
            return None
        port = int(s)
        return port if port > 0 else None
    return None


def enforce_recorded_port_policy(rec: dict | None) -> None:
    """Fail closed if identity state claims a canonical/forbidden port."""
    if not rec:
        return
    refuse_forbidden_port(parse_port(rec.get("port")))


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


def _open_nofollow_read_at(dir_fd: int, name: str, label: str) -> int:
    flags = os.O_RDONLY | _O_NOFOLLOW
    try:
        fd = os.open(name, flags, dir_fd=dir_fd)
    except FileNotFoundError:
        raise
    except OSError as e:
        _nofollow_oserror(e, label)
        raise  # pragma: no cover
    try:
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode):
            os.close(fd)
            _die(f"refused: {label} is not a regular file after open")
        if st.st_size > MAX_IDENTITY_BYTES:
            os.close(fd)
            _die(f"refused: {label} exceeds {MAX_IDENTITY_BYTES} bytes")
        return fd
    except Exception:
        try:
            os.close(fd)
        except OSError:
            pass
        raise


def _open_nofollow_write_new_at(
    dir_fd: int, name: str, label: str, mode: int = 0o600
) -> tuple[int, tuple[int, int]]:
    """Create a new regular file via openat; return (fd, (st_dev, st_ino))."""
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | _O_NOFOLLOW
    try:
        fd = os.open(name, flags, mode, dir_fd=dir_fd)
    except FileExistsError:
        _die(f"refused: {label} already exists (will not overwrite)")
    except OSError as e:
        if e.errno == errno.EEXIST:
            _die(f"refused: {label} already exists (will not overwrite)")
        _nofollow_oserror(e, label)
        raise  # pragma: no cover
    try:
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode):
            os.close(fd)
            try:
                os.unlink(name, dir_fd=dir_fd)
            except OSError:
                pass
            _die(f"refused: {label} is not a regular file after create")
        return fd, (st.st_dev, st.st_ino)
    except Exception:
        try:
            os.close(fd)
        except OSError:
            pass
        raise


def _safe_atomic_write_json(root: Path, state_d: Path, data: dict) -> None:
    name = _validate_server_name(state_d.name)
    _assert_path_within_root(state_d / "identity.json", root, "identity.json")
    _assert_path_within_root(state_d / "identity.json.tmp", root, "identity.json.tmp")

    payload = (json.dumps(data, indent=2) + "\n").encode("utf-8")
    if len(payload) > MAX_IDENTITY_BYTES:
        _die("refused: identity payload too large")

    _root_path, root_fd = open_state_root_fd()
    created_tmp = False
    tmp_id: tuple[int, int] | None = None
    tmp_name = "identity.json.tmp"
    dest_name = "identity.json"
    try:
        state_fd = open_named_state_dir_fd(root_fd, name, create=True)
        try:
            try:
                os.fchmod(state_fd, 0o700)
            except OSError:
                pass
            pre_tmp = _fstatat_nofollow(state_fd, tmp_name, tmp_name, allow_missing=True)
            if pre_tmp is not None:
                if stat.S_ISLNK(pre_tmp.st_mode):
                    _die(f"refused: {tmp_name} is a symlink")
                _die(f"refused: {tmp_name} already exists (will not overwrite)")
            pre_dest = _fstatat_nofollow(state_fd, dest_name, dest_name, allow_missing=True)
            if pre_dest is not None and not stat.S_ISREG(pre_dest.st_mode):
                if stat.S_ISLNK(pre_dest.st_mode):
                    _die(f"refused: {dest_name} is a symlink")
                _die(f"refused: {dest_name} is not a regular file")

            fd, tmp_id = _open_nofollow_write_new_at(state_fd, tmp_name, tmp_name, 0o600)
            created_tmp = True
            try:
                written = 0
                while written < len(payload):
                    n = os.write(fd, payload[written:])
                    if n <= 0:
                        _die("refused: short write to identity.json.tmp")
                    written += n
                os.fsync(fd)
            finally:
                os.close(fd)

            cur_tmp = _fstatat_nofollow(state_fd, tmp_name, tmp_name)
            assert tmp_id is not None
            if not stat.S_ISREG(cur_tmp.st_mode) or (cur_tmp.st_dev, cur_tmp.st_ino) != tmp_id:
                _die("refused: identity.json.tmp identity changed before replace")
            cur_dest = _fstatat_nofollow(state_fd, dest_name, dest_name, allow_missing=True)
            if cur_dest is not None and not stat.S_ISREG(cur_dest.st_mode):
                _die(f"refused: {dest_name} became non-regular before replace")

            try:
                os.replace(tmp_name, dest_name, src_dir_fd=state_fd, dst_dir_fd=state_fd)
            except OSError as e:
                try:
                    st = _fstatat_nofollow(state_fd, tmp_name, tmp_name, allow_missing=True)
                    if st is not None and stat.S_ISREG(st.st_mode) and (st.st_dev, st.st_ino) == tmp_id:
                        os.unlink(tmp_name, dir_fd=state_fd)
                except OSError:
                    pass
                _die(f"refused: atomic replace failed: {e}")

            try:
                os.fsync(state_fd)
            except OSError:
                pass

            post = _fstatat_nofollow(state_fd, dest_name, "identity.json after replace")
            if not stat.S_ISREG(post.st_mode):
                _die("refused: identity.json is not a regular file after replace")
            post_tmp = _fstatat_nofollow(state_fd, tmp_name, tmp_name, allow_missing=True)
            if post_tmp is not None and stat.S_ISLNK(post_tmp.st_mode):
                _die("refused: identity.json.tmp is a symlink after replace")
        except BaseException:
            if created_tmp and tmp_id is not None:
                try:
                    st = _fstatat_nofollow(state_fd, tmp_name, tmp_name, allow_missing=True)
                    if st is not None and stat.S_ISREG(st.st_mode) and (st.st_dev, st.st_ino) == tmp_id:
                        os.unlink(tmp_name, dir_fd=state_fd)
                except (OSError, SystemExit):
                    pass
            raise
        finally:
            os.close(state_fd)
    finally:
        os.close(root_fd)


def _safe_unlink_regular_file(path: Path, root: Path, state_d: Path, label: str) -> None:
    path = _assert_path_within_root(path, root, label)
    server_name = _validate_server_name(state_d.name)
    if path.parent.absolute() != state_d.absolute():
        _die(f"refused: {label} is not inside state_dir")
    file_name = path.name
    _root_path, root_fd = open_state_root_fd()
    try:
        try:
            state_fd = open_named_state_dir_fd(root_fd, server_name, create=False)
        except FileNotFoundError:
            return
        try:
            st = _fstatat_nofollow(state_fd, file_name, label, allow_missing=True)
            if st is None:
                return
            if stat.S_ISLNK(st.st_mode):
                _die(f"refused: will not unlink symlink {label}: {path}")
            if not stat.S_ISREG(st.st_mode):
                _die(f"refused: will not unlink non-regular {label}: {path}")
            try:
                os.unlink(file_name, dir_fd=state_fd)
            except FileNotFoundError:
                return
            except OSError as e:
                _die(f"refused: unlink {label} failed: {e}")
        finally:
            os.close(state_fd)
    finally:
        os.close(root_fd)


def _safe_write_sidecar_text(path: Path, root: Path, state_d: Path, text: str, label: str) -> None:
    """Write a small sidecar (cmd.txt/cwd.txt) via root→state dir_fd chain."""
    _assert_path_within_root(path, root, label)
    server_name = _validate_server_name(state_d.name)
    if path.parent.absolute() != state_d.absolute():
        _die(f"refused: {label} is not inside state_dir")
    tmp_name = path.name + ".tmp"
    dest_name = path.name
    _assert_path_within_root(state_d / tmp_name, root, f"{label}.tmp")
    data = text.encode("utf-8")
    _root_path, root_fd = open_state_root_fd()
    tmp_id: tuple[int, int] | None = None
    created_tmp = False
    try:
        state_fd = open_named_state_dir_fd(root_fd, server_name, create=True)
        try:
            pre = _fstatat_nofollow(state_fd, tmp_name, f"{label}.tmp", allow_missing=True)
            if pre is not None:
                if stat.S_ISLNK(pre.st_mode):
                    _die(f"refused: {label}.tmp is a symlink")
                _die(f"refused: {label}.tmp already exists (will not overwrite)")
            fd, tmp_id = _open_nofollow_write_new_at(state_fd, tmp_name, f"{label}.tmp", 0o600)
            created_tmp = True
            try:
                os.write(fd, data)
                os.fsync(fd)
            finally:
                os.close(fd)
            cur = _fstatat_nofollow(state_fd, tmp_name, f"{label}.tmp")
            if not stat.S_ISREG(cur.st_mode) or (cur.st_dev, cur.st_ino) != tmp_id:
                _die(f"refused: {label}.tmp identity changed before replace")
            dest = _fstatat_nofollow(state_fd, dest_name, label, allow_missing=True)
            if dest is not None and not stat.S_ISREG(dest.st_mode):
                _die(f"refused: {label} is not a regular file")
            try:
                os.replace(tmp_name, dest_name, src_dir_fd=state_fd, dst_dir_fd=state_fd)
            except OSError as e:
                if created_tmp and tmp_id is not None:
                    st = _fstatat_nofollow(state_fd, tmp_name, f"{label}.tmp", allow_missing=True)
                    if st is not None and (st.st_dev, st.st_ino) == tmp_id and stat.S_ISREG(st.st_mode):
                        try:
                            os.unlink(tmp_name, dir_fd=state_fd)
                        except OSError:
                            pass
                _die(f"refused: replace {label} failed: {e}")
            post = _fstatat_nofollow(state_fd, dest_name, label)
            if not stat.S_ISREG(post.st_mode):
                _die(f"refused: {label} is not a regular file after replace")
        finally:
            os.close(state_fd)
    finally:
        os.close(root_fd)


def read_record(d: Path, root: Path | None = None) -> dict | None:
    if root is None:
        root = ensure_state_root()
    server_name = _validate_server_name(d.name)
    _assert_path_within_root(d / "identity.json", root, "identity.json")
    _root_path, root_fd = open_state_root_fd()
    chunks: list[bytes] | None = None
    try:
        try:
            state_fd = open_named_state_dir_fd(root_fd, server_name, create=False)
        except FileNotFoundError:
            return None
        try:
            st = _fstatat_nofollow(state_fd, "identity.json", "identity.json", allow_missing=True)
            if st is None:
                return None
            if stat.S_ISLNK(st.st_mode):
                _die("refused: identity.json is a symlink")
            if not stat.S_ISREG(st.st_mode):
                _die("refused: identity.json is not a regular file")
            try:
                fd = _open_nofollow_read_at(state_fd, "identity.json", "identity.json")
            except FileNotFoundError:
                return None
            try:
                chunks = []
                total = 0
                while True:
                    buf = os.read(fd, 8192)
                    if not buf:
                        break
                    total += len(buf)
                    if total > MAX_IDENTITY_BYTES:
                        _die(f"refused: identity.json exceeds {MAX_IDENTITY_BYTES} bytes")
                    chunks.append(buf)
            finally:
                os.close(fd)
        finally:
            os.close(state_fd)
    finally:
        os.close(root_fd)
    if chunks is None:
        return None
    try:
        data = json.loads(b"".join(chunks).decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict) or "pid" not in data:
        return None
    return data


def write_record(d: Path, data: dict, root: Path | None = None) -> None:
    root = ensure_state_root()
    d = _assert_path_within_root(d, root, "state_dir")
    _validate_server_name(d.name)
    _safe_atomic_write_json(root, d, data)


def as_nonempty_str(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    s = value.strip()
    return s or None


def owned_running(d: Path, root: Path | None = None) -> dict | None:
    if root is None:
        root = ensure_state_root()
    rec = read_record(d, root=root)
    if not rec:
        return None
    enforce_recorded_port_policy(rec)
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
    root, d, _identity, _tmp = safe_state_paths(args.name)
    # Load record first so forbidden recorded port fails closed even if process matches.
    rec = None
    try:
        if d.exists():
            rec = read_record(d, root=root)
            enforce_recorded_port_policy(rec)
    except SystemExit:
        raise
    owned = owned_running(d, root=root) if d.exists() else None
    print(f"name={args.name}")
    print(f"state_dir={d}")
    if owned:
        print(f"status=running pid={owned['pid']}")
        print(f"lstart={owned.get('lstart')}")
        print(f"cmdline={owned.get('cmdline')}")
        print(f"cwd={owned.get('cwd')}")
    else:
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
    root, d, _identity, _tmp = safe_state_paths(args.name)
    if d.exists():
        rec = read_record(d, root=root)
        enforce_recorded_port_policy(rec)
    owned = owned_running(d, root=root) if d.exists() else None
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
        # re-verify identity + recorded port before SIGKILL
        try:
            still = owned_running(d, root=root)
        except SystemExit:
            print("refuse_kill: security policy failed before SIGKILL", file=sys.stderr)
            return 3
        if still and int(still["pid"]) == pid:
            os.kill(pid, signal.SIGKILL)
        else:
            print("refuse_kill: identity changed before SIGKILL", file=sys.stderr)
            return 3
    print(f"stopped name={args.name} pid={pid}")
    return 0


def cmd_start(args: argparse.Namespace) -> int:
    refuse_forbidden_port(args.port)
    root, d, _identity, _tmp = safe_state_paths(args.name)
    if d.exists():
        rec_early = read_record(d, root=root)
        enforce_recorded_port_policy(rec_early)
    owned = owned_running(d, root=root) if d.exists() else None
    if owned:
        if args.port and port_listening(args.port):
            print(f"already_running name={args.name} pid={owned['pid']} port={args.port}")
            return 0
        print(f"already_running name={args.name} pid={owned['pid']}")
        return 0

    rec = read_record(d, root=root) if d.exists() else None
    if rec:
        enforce_recorded_port_policy(rec)
        stale_pid = parse_pid(rec.get("pid"))
        if stale_pid is not None and live_identity(stale_pid) is not None:
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
        _die(f"cwd missing: {cwd}")

    env = os.environ.copy()
    for item in args.env or []:
        if "=" not in item:
            _die(f"bad --env {item!r}; want KEY=VALUE")
        k, v = item.split("=", 1)
        env[k] = v

    ensure_state_root()
    # Create/open named state dir via root FD (never mkdir through a replaced root path).
    _root_path, root_fd = open_state_root_fd()
    try:
        state_fd = open_named_state_dir_fd(root_fd, args.name, create=True)
        try:
            os.fchmod(state_fd, 0o700)
        except OSError:
            pass
        os.close(state_fd)
    finally:
        os.close(root_fd)

    log_path = _assert_path_within_root(d / "server.log", root, "server.log")
    _safe_write_sidecar_text(d / "cmd.txt", root, d, args.cmd + "\n", "cmd.txt")
    _safe_write_sidecar_text(d / "cwd.txt", root, d, str(cwd) + "\n", "cwd.txt")

    # Double-fork so the process is not in the Cursor agent process group.
    pid1 = os.fork()
    if pid1 > 0:
        os.waitpid(pid1, 0)
        deadline = time.time() + 5
        while time.time() < deadline:
            try:
                if owned_running(d, root=root):
                    break
            except SystemExit:
                break
            time.sleep(0.05)
        try:
            owned = owned_running(d, root=root)
        except SystemExit as e:
            print(f"start_failed: {e}", file=sys.stderr)
            return 1
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
    # Open log via root→state dir FD chain so swapped root/state symlinks cannot redirect I/O.
    try:
        _root_path, root_fd = open_state_root_fd()
    except SystemExit:
        os._exit(1)
    try:
        try:
            state_fd = open_named_state_dir_fd(root_fd, args.name, create=False)
        except (OSError, SystemExit):
            os.close(root_fd)
            os._exit(1)
        try:
            log_flags = os.O_WRONLY | os.O_CREAT | os.O_APPEND | _O_NOFOLLOW
            try:
                log_fd = os.open("server.log", log_flags, 0o600, dir_fd=state_fd)
            except OSError:
                os.close(state_fd)
                os.close(root_fd)
                os._exit(1)
        finally:
            try:
                os.close(state_fd)
            except OSError:
                pass
    finally:
        try:
            os.close(root_fd)
        except OSError:
            pass
    st = os.fstat(log_fd)
    if not stat.S_ISREG(st.st_mode):
        os.close(log_fd)
        os._exit(1)
    os.dup2(log_fd, 1)
    os.dup2(log_fd, 2)
    if log_fd not in (1, 2):
        os.close(log_fd)

    proc = subprocess.Popen(
        ["bash", "-lc", args.cmd],
        cwd=str(cwd),
        env=env,
        start_new_session=True,
    )
    # Wait until ps cmdline/lstart stabilize (macOS python3 shim may re-exec into
    # Python.app and change the visible command path shortly after spawn).
    ident: dict | None = None
    for _ in range(40):
        cur = live_identity(proc.pid)
        if not cur or not as_nonempty_str(cur.get("cmdline")) or not as_nonempty_str(cur.get("lstart")):
            time.sleep(0.05)
            continue
        if (
            ident
            and ident.get("cmdline") == cur.get("cmdline")
            and ident.get("lstart") == cur.get("lstart")
            and ident.get("cwd") == cur.get("cwd")
        ):
            ident = cur
            break
        ident = cur
        time.sleep(0.05)
    if not ident:
        ident = live_identity(proc.pid) or {"pid": proc.pid, "lstart": "", "cmdline": ""}
    try:
        write_record(
            d,
            {
                "pid": proc.pid,
                "lstart": ident.get("lstart") or "",
                "cmdline": ident.get("cmdline") or "",
                "cwd": as_nonempty_str(ident.get("cwd")) or str(cwd),
                "port": args.port,
                "cmd": args.cmd,
                "name": args.name,
            },
            root=root,
        )
    except SystemExit:
        try:
            os.kill(proc.pid, signal.SIGTERM)
        except OSError:
            pass
        os._exit(1)

    rc = proc.wait()
    # clear only if still our record and path remains safe
    try:
        cur = read_record(d, root=root)
        cur_pid = parse_pid(cur.get("pid")) if cur else None
        if cur_pid == proc.pid:
            _safe_unlink_regular_file(d / "identity.json", root, d, "identity.json")
    except SystemExit:
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
