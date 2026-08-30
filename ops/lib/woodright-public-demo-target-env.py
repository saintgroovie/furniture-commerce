#!/usr/bin/env python3
"""Governed public_demo target env identity: parse, validate, rewrite, compare.

Never prints secret/config values. Identity SHA values (40-hex) may be printed.
Does not source files or expand shell substitutions.
"""
from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
import re
import stat
import subprocess
import sys
import tempfile
from pathlib import Path

IDENTITY_KEYS = (
    "WOODRIGHT_RELEASE_SHA",
    "WOODRIGHT_BACKEND_SOURCE_SHA",
    "WOODRIGHT_STOREFRONT_SOURCE_SHA",
)
REQUIRED_KEYS = ("WOODRIGHT_RELEASE_SHA",)
SHA40 = re.compile(r"^[0-9a-f]{40}$")
ASSIGN = re.compile(
    r"^([ \t]*(?:export[ \t]+)?)([A-Za-z_][A-Za-z0-9_]*)([ \t]*=[ \t]*)(.*)$"
)
TOKEN_MISMATCH = "TARGET_ENV_RELEASE_SHA_MISMATCH"
TOKEN_OK = "TARGET_ENV_IDENTITY_OK"
TOKEN_EQUIV = "ENV_EQUIVALENT_EXCEPT_RELEASE_IDENTITY"


class EnvError(Exception):
    def __init__(self, token: str, message: str) -> None:
        super().__init__(message)
        self.token = token
        self.message = message


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _die(token: str, message: str, code: int = 2) -> None:
    sys.stderr.write(f"{token}: {message}\n")
    raise SystemExit(code)


def _split_value(raw: str) -> tuple[str, str, str]:
    """Return (prefix_quote_or_empty, unquoted_value, suffix)."""
    s = raw.rstrip("\r\n")
    nl = raw[len(s) :]
    if len(s) >= 2 and s[0] == s[-1] and s[0] in ("'", '"'):
        return s[0], s[1:-1], s[0] + nl
    return "", s, nl


def parse_assignments(text: str) -> list[tuple[int, str, str, str, str, str]]:
    """Return rows: (lineno, lead, key, eq, raw_value_with_nl, unquoted).

    Comments and blanks are omitted. Duplicate keys raise EnvError.
    """
    seen: dict[str, int] = {}
    rows = []
    for i, line in enumerate(text.splitlines(keepends=True), start=1):
        stripped = line.lstrip(" \t")
        if stripped.startswith("#") or not stripped.strip():
            continue
        m = ASSIGN.match(line.rstrip("\n\r"))
        if not m:
            raise EnvError("TARGET_ENV_MALFORMED", f"malformed env line {i}")
        lead, key, eq, rest = m.group(1), m.group(2), m.group(3), m.group(4)
        if key in seen:
            raise EnvError("TARGET_ENV_DUPLICATE_KEY", f"duplicate key {key} lines {seen[key]} and {i}")
        seen[key] = i
        _q, unquoted, _suf = _split_value(rest)
        if "$(" in unquoted or "`" in unquoted or "${" in unquoted:
            # Do not expand; refuse command-like identity/config payloads in identity keys.
            if key in IDENTITY_KEYS:
                raise EnvError("TARGET_ENV_MALFORMED", f"refusing substitution in identity key {key}")
        rows.append((i, lead, key, eq, rest, unquoted))
    return rows


def identity_map(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for _i, _lead, key, _eq, _rest, unquoted in parse_assignments(text):
        if key in IDENTITY_KEYS:
            out[key] = unquoted.strip()
    return out


def key_set(text: str) -> list[str]:
    return [key for _i, _lead, key, _eq, _rest, _u in parse_assignments(text)]


def validate_text(text: str, target_sha: str, component: str) -> dict:
    if not SHA40.fullmatch(target_sha):
        raise EnvError("TARGET_ENV_MALFORMED", "target SHA must be 40-hex")
    ident = identity_map(text)
    missing = [k for k in REQUIRED_KEYS if k not in ident]
    if missing:
        raise EnvError(TOKEN_MISMATCH, f"{component} missing {missing[0]}")
    for key, val in ident.items():
        if not SHA40.fullmatch(val):
            raise EnvError(TOKEN_MISMATCH, f"{component} {key} is not 40-hex")
        if val != target_sha:
            raise EnvError(TOKEN_MISMATCH, f"{component} {key} != target SHA")
    return {
        "ok": True,
        "token": TOKEN_OK,
        "component": component,
        "identity_keys_present": sorted(ident.keys()),
    }


def validate_one(path: Path, target_sha: str, component: str) -> dict:
    if not path.is_file() or path.is_symlink():
        raise EnvError("TARGET_ENV_MALFORMED", f"env must be a regular file: {path}")
    mode = stat.S_IMODE(path.stat().st_mode)
    if mode != 0o600:
        raise EnvError("TARGET_ENV_MALFORMED", f"env mode must be 0600 have={mode:o}")
    text = path.read_text(encoding="utf-8")
    report = validate_text(text, target_sha, component)
    report["path"] = str(path)
    report["sha256"] = _sha256_file(path)
    report["mode"] = f"{mode:o}"
    return report


def _clear_cloexec(fd: int) -> None:
    flags = fcntl.fcntl(fd, fcntl.F_GETFD)
    fcntl.fcntl(fd, fcntl.F_SETFD, flags & ~fcntl.FD_CLOEXEC)


def seal_env_fd(data: bytes) -> int:
    """Anonymous inode holding sealed env bytes. Caller must close the fd."""
    fd, tmp_name = tempfile.mkstemp(prefix=".wr-env-seal-")
    try:
        os.write(fd, data)
        os.fsync(fd)
        os.lseek(fd, 0, os.SEEK_SET)
        os.unlink(tmp_name)
        _clear_cloexec(fd)
        return fd
    except Exception:
        try:
            os.close(fd)
        except OSError:
            pass
        try:
            Path(tmp_name).unlink(missing_ok=True)
        except OSError:
            pass
        raise


def load_and_seal_env(path: Path, expected_sha256: str, target_sha: str, component: str) -> int:
    if not path.is_file() or path.is_symlink():
        raise EnvError("TARGET_ENV_SOURCE_CAS", "env must be a regular file")
    data = path.read_bytes()
    have = hashlib.sha256(data).hexdigest()
    if have != expected_sha256:
        raise EnvError("TARGET_ENV_SOURCE_CAS", "env hash drifted before seal")
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise EnvError("TARGET_ENV_MALFORMED", "env is not utf-8") from exc
    validate_text(text, target_sha, component)
    return seal_env_fd(data)


def rewrite_text(text: str, target_sha: str) -> tuple[str, list[str]]:
    if not SHA40.fullmatch(target_sha):
        raise EnvError("TARGET_ENV_MALFORMED", "target SHA must be 40-hex")
    parse_assignments(text)  # fail-closed on dups/malformed
    changed: list[str] = []
    found_release = False
    out_lines = []
    for line in text.splitlines(keepends=True):
        stripped = line.lstrip(" \t")
        if stripped.startswith("#") or not stripped.strip():
            out_lines.append(line)
            continue
        m = ASSIGN.match(line.rstrip("\n\r"))
        if not m:
            raise EnvError("TARGET_ENV_MALFORMED", "malformed env line during rewrite")
        lead, key, eq, rest = m.group(1), m.group(2), m.group(3), m.group(4)
        nl = line[len(line.rstrip("\n\r")) :]
        if key == "WOODRIGHT_RELEASE_SHA":
            found_release = True
        if key in IDENTITY_KEYS:
            q, old, _suf = _split_value(rest)
            if old.strip() != target_sha:
                changed.append(key)
            new_val = f"{q}{target_sha}{q}" if q else target_sha
            out_lines.append(f"{lead}{key}{eq}{new_val}{nl}")
        else:
            out_lines.append(line)
    if not found_release:
        raise EnvError(TOKEN_MISMATCH, "source missing WOODRIGHT_RELEASE_SHA")
    return "".join(out_lines), changed


def atomic_write_bytes(dest: Path, data: bytes, mode: int = 0o600) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=".wr-env-", dir=str(dest.parent))
    tmp = Path(tmp_name)
    try:
        os.write(fd, data)
        os.fsync(fd)
        os.close(fd)
        fd = -1
        os.chmod(tmp, mode)
        os.replace(tmp, dest)
        os.chmod(dest, mode)
    except Exception:
        if fd >= 0:
            try:
                os.close(fd)
            except OSError:
                pass
        try:
            tmp.unlink(missing_ok=True)
        except OSError:
            pass
        raise


def atomic_write(dest: Path, data: str, mode: int = 0o600) -> None:
    atomic_write_bytes(dest, data.encode("utf-8"), mode)


def compare_files(old: Path, new: Path, target_sha: str) -> dict:
    old_text = old.read_text(encoding="utf-8")
    new_text = new.read_text(encoding="utf-8")
    old_rows = {k: u for _i, _l, k, _e, _r, u in parse_assignments(old_text)}
    new_rows = {k: u for _i, _l, k, _e, _r, u in parse_assignments(new_text)}
    old_keys = set(old_rows)
    new_keys = set(new_rows)
    if old_keys != new_keys:
        only_old = sorted(old_keys - new_keys)
        only_new = sorted(new_keys - old_keys)
        raise EnvError(
            "TARGET_ENV_UNEXPECTED_CONFIG_DRIFT",
            f"key set differs only_old={only_old} only_new={only_new}",
        )
    identity_changed = []
    unexpected = []
    for key in sorted(old_keys):
        if key in IDENTITY_KEYS:
            if new_rows[key].strip() != target_sha:
                raise EnvError(TOKEN_MISMATCH, f"new {key} != target SHA")
            if old_rows[key].strip() != new_rows[key].strip():
                identity_changed.append(key)
        elif old_rows[key] != new_rows[key]:
            unexpected.append(key)
    if unexpected:
        raise EnvError(
            "TARGET_ENV_UNEXPECTED_CONFIG_DRIFT",
            f"non-identity values changed keys={unexpected}",
        )
    return {
        "ok": True,
        "token": TOKEN_EQUIV,
        "key_set_equal": True,
        "allowed_identity_changes": identity_changed,
        "unexpected_changes": [],
        "all_other_values_equal": True,
        "secret_values_printed": False,
    }


def cmd_validate(args: argparse.Namespace) -> int:
    try:
        report = validate_one(Path(args.env_file), args.target_sha, args.component)
    except EnvError as exc:
        _die(exc.token, exc.message)
    json.dump(report, sys.stdout, indent=2, sort_keys=True)
    sys.stdout.write("\n")
    return 0


def cmd_validate_pair(args: argparse.Namespace) -> int:
    try:
        be = validate_one(Path(args.backend_env), args.target_sha, "backend")
        sf = validate_one(Path(args.storefront_env), args.target_sha, "storefront")
    except EnvError as exc:
        _die(exc.token, exc.message)
    json.dump({"ok": True, "token": TOKEN_OK, "backend": be, "storefront": sf}, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


def cmd_keys(args: argparse.Namespace) -> int:
    text = Path(args.env_file).read_text(encoding="utf-8")
    try:
        keys = key_set(text)
        ident = identity_map(text)
    except EnvError as exc:
        _die(exc.token, exc.message)
    json.dump(
        {
            "keys": keys,
            "identity": {k: ident[k] for k in IDENTITY_KEYS if k in ident},
            "sha256": _sha256_file(Path(args.env_file)),
        },
        sys.stdout,
        indent=2,
    )
    sys.stdout.write("\n")
    return 0


def cmd_rewrite(args: argparse.Namespace) -> int:
    src = Path(args.source)
    dest = Path(args.dest)
    if dest.exists():
        _die("TARGET_ENV_DEST_EXISTS", f"refusing overwrite {dest}")
    if src.resolve() == dest.resolve():
        _die("TARGET_ENV_DEST_EXISTS", "source and dest must differ")
    before = _sha256_file(src)
    if args.source_sha256 and before != args.source_sha256:
        _die("TARGET_ENV_SOURCE_CAS", "source hash drifted before rewrite")
    text = src.read_text(encoding="utf-8")
    after = _sha256_file(src)
    if after != before:
        _die("TARGET_ENV_SOURCE_CAS", "source changed during read")
    try:
        new_text, changed = rewrite_text(text, args.target_sha)
        parse_assignments(new_text)
    except EnvError as exc:
        _die(exc.token, exc.message)
    atomic_write(dest, new_text, 0o600)
    ident = identity_map(new_text)
    json.dump(
        {
            "ok": True,
            "token": TOKEN_OK,
            "dest": str(dest),
            "source_sha256": before,
            "dest_sha256": _sha256_file(dest),
            "identity_keys_rewritten": changed,
            "identity": ident,
            "mode": "600",
            "secret_values_printed": False,
        },
        sys.stdout,
        indent=2,
    )
    sys.stdout.write("\n")
    return 0


def cmd_compare(args: argparse.Namespace) -> int:
    try:
        report = compare_files(Path(args.old), Path(args.new), args.target_sha)
    except EnvError as exc:
        _die(exc.token, exc.message)
    json.dump(report, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


def cmd_hash(args: argparse.Namespace) -> int:
    path = Path(args.env_file)
    if not path.is_file() or path.is_symlink():
        _die("TARGET_ENV_MALFORMED", "env must be a regular file")
    sys.stdout.write(_sha256_file(path) + "\n")
    return 0


def cmd_assert_hash(args: argparse.Namespace) -> int:
    path = Path(args.env_file)
    if not path.is_file() or path.is_symlink():
        _die("TARGET_ENV_SOURCE_CAS", "env must be a regular file")
    have = _sha256_file(path)
    if have != args.sha256:
        _die("TARGET_ENV_SOURCE_CAS", "env hash drifted before consumption")
    json.dump({"ok": True, "token": "TARGET_ENV_CAS_OK", "sha256": have}, sys.stdout)
    sys.stdout.write("\n")
    return 0


def cmd_snapshot(args: argparse.Namespace) -> int:
    src = Path(args.source)
    dest = Path(args.dest)
    if dest.exists():
        _die("TARGET_ENV_DEST_EXISTS", f"refusing overwrite {dest}")
    if src.resolve() == dest.resolve():
        _die("TARGET_ENV_DEST_EXISTS", "source and dest must differ")
    if not src.is_file() or src.is_symlink():
        _die("TARGET_ENV_MALFORMED", "source must be a regular file")
    before = _sha256_file(src)
    if args.source_sha256 and before != args.source_sha256:
        _die("TARGET_ENV_SOURCE_CAS", "source hash drifted before snapshot")
    data = src.read_bytes()
    after = _sha256_file(src)
    if after != before or hashlib.sha256(data).hexdigest() != before:
        _die("TARGET_ENV_SOURCE_CAS", "source changed during snapshot read")
    atomic_write_bytes(dest, data, 0o600)
    dest_hash = _sha256_file(dest)
    if dest_hash != before:
        _die("TARGET_ENV_SOURCE_CAS", "snapshot hash mismatch after write")
    json.dump(
        {
            "ok": True,
            "token": "TARGET_ENV_CAS_OK",
            "source_sha256": before,
            "dest_sha256": dest_hash,
            "dest": str(dest),
            "mode": "600",
            "secret_values_printed": False,
        },
        sys.stdout,
        indent=2,
    )
    sys.stdout.write("\n")
    return 0


def cmd_docker_create(args: argparse.Namespace) -> int:
    argv = list(args.argv)
    if not argv:
        _die("TARGET_ENV_MALFORMED", "docker-create requires a command after --")
    try:
        fd = load_and_seal_env(
            Path(args.env_file), args.expected_sha256, args.target_sha, args.component
        )
    except EnvError as exc:
        _die(exc.token, exc.message)
    sealed = f"/dev/fd/{fd}"
    argv = [sealed if token == "{SEALED}" else token for token in argv]
    try:
        completed = subprocess.run(argv, pass_fds=(fd,), check=False)
    finally:
        try:
            os.close(fd)
        except OSError:
            pass
    return int(completed.returncode)


def cmd_prove_seal(args: argparse.Namespace) -> int:
    src = Path(args.env_file)
    try:
        data = src.read_bytes()
        have = hashlib.sha256(data).hexdigest()
        if have != args.expected_sha256:
            raise EnvError("TARGET_ENV_SOURCE_CAS", "env hash drifted before seal")
        validate_text(data.decode("utf-8"), args.target_sha, args.component)
        fd = seal_env_fd(data)
    except EnvError as exc:
        _die(exc.token, exc.message)
    if args.mutate_after_read:
        mut = Path(args.mutate_after_read)
        src.write_bytes(mut.read_bytes())
        os.chmod(src, 0o600)
    try:
        sealed_text = os.read(fd, 1 << 20).decode("utf-8")
        os.lseek(fd, 0, os.SEEK_SET)
        validate_text(sealed_text, args.target_sha, args.component)
        ident = identity_map(sealed_text)
    except EnvError as exc:
        try:
            os.close(fd)
        except OSError:
            pass
        _die(exc.token, exc.message)
    finally:
        try:
            os.close(fd)
        except OSError:
            pass
    json.dump(
        {
            "ok": True,
            "token": "TARGET_ENV_SEAL_OK",
            "identity_release_sha": ident.get("WOODRIGHT_RELEASE_SHA", ""),
            "source_mutated_after_read": bool(args.mutate_after_read),
            "secret_values_printed": False,
        },
        sys.stdout,
        indent=2,
    )
    sys.stdout.write("\n")
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="public_demo target env identity (no secret echo)")
    sub = p.add_subparsers(dest="cmd", required=True)

    v = sub.add_parser("validate")
    v.add_argument("--env-file", required=True)
    v.add_argument("--target-sha", required=True)
    v.add_argument("--component", required=True, choices=("backend", "storefront"))
    v.set_defaults(func=cmd_validate)

    vp = sub.add_parser("validate-pair")
    vp.add_argument("--backend-env", required=True)
    vp.add_argument("--storefront-env", required=True)
    vp.add_argument("--target-sha", required=True)
    vp.set_defaults(func=cmd_validate_pair)

    k = sub.add_parser("keys")
    k.add_argument("--env-file", required=True)
    k.set_defaults(func=cmd_keys)

    r = sub.add_parser("rewrite")
    r.add_argument("--source", required=True)
    r.add_argument("--dest", required=True)
    r.add_argument("--target-sha", required=True)
    r.add_argument("--source-sha256", default="")
    r.set_defaults(func=cmd_rewrite)

    c = sub.add_parser("compare")
    c.add_argument("--old", required=True)
    c.add_argument("--new", required=True)
    c.add_argument("--target-sha", required=True)
    c.set_defaults(func=cmd_compare)

    h = sub.add_parser("hash")
    h.add_argument("--env-file", required=True)
    h.set_defaults(func=cmd_hash)

    ah = sub.add_parser("assert-hash")
    ah.add_argument("--env-file", required=True)
    ah.add_argument("--sha256", required=True)
    ah.set_defaults(func=cmd_assert_hash)

    sn = sub.add_parser("snapshot")
    sn.add_argument("--source", required=True)
    sn.add_argument("--dest", required=True)
    sn.add_argument("--source-sha256", default="")
    sn.set_defaults(func=cmd_snapshot)

    dc = sub.add_parser("docker-create")
    dc.add_argument("--env-file", required=True)
    dc.add_argument("--expected-sha256", required=True)
    dc.add_argument("--target-sha", required=True)
    dc.add_argument("--component", required=True, choices=("backend", "storefront"))
    dc.add_argument("argv", nargs=argparse.REMAINDER)
    dc.set_defaults(func=cmd_docker_create)

    ps = sub.add_parser("prove-seal")
    ps.add_argument("--env-file", required=True)
    ps.add_argument("--expected-sha256", required=True)
    ps.add_argument("--target-sha", required=True)
    ps.add_argument("--component", required=True, choices=("backend", "storefront"))
    ps.add_argument("--mutate-after-read", default="")
    ps.set_defaults(func=cmd_prove_seal)

    args = p.parse_args(argv)
    if args.cmd == "docker-create" and args.argv and args.argv[0] == "--":
        args.argv = args.argv[1:]
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
