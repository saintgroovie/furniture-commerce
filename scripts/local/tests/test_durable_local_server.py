#!/usr/bin/env python3
"""Adversarial tests for durable_local_server symlink / containment safety."""

from __future__ import annotations

import importlib.util
import json
import os
import signal
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
HELPER = REPO_ROOT / "scripts" / "local" / "durable_local_server.py"


def load_helper():
    spec = importlib.util.spec_from_file_location("durable_local_server", HELPER)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


class FakeHomeCase(unittest.TestCase):
    def setUp(self) -> None:
        self._old_home = os.environ.get("HOME")
        self._tmpdir = tempfile.TemporaryDirectory(prefix="wr-durable-test-")
        self.home = Path(self._tmpdir.name)
        os.environ["HOME"] = str(self.home)
        self.mod = load_helper()
        self.outside = self.home / "outside"
        self.outside.mkdir()
        self.canary = self.outside / "canary.txt"
        self.canary.write_text("CANARY_UNCHANGED\n", encoding="utf-8")

    def tearDown(self) -> None:
        if self._old_home is None:
            os.environ.pop("HOME", None)
        else:
            os.environ["HOME"] = self._old_home
        self._tmpdir.cleanup()

    def _run_cli(self, *args: str) -> subprocess.CompletedProcess[str]:
        env = os.environ.copy()
        env["HOME"] = str(self.home)
        return subprocess.run(
            [sys.executable, str(HELPER), *args],
            text=True,
            capture_output=True,
            env=env,
        )

    def _woodright_root(self) -> Path:
        return self.home / ".woodright" / "durable-local-servers"

    def test_validate_traversal_names(self) -> None:
        bad = [
            "",
            ".",
            "..",
            "../escape",
            "/tmp/escape",
            "a/b",
            "a\\b",
            "..hidden",
            ".hidden",
            "has space",
            "evil\nname",
        ]
        for name in bad:
            with self.subTest(name=name):
                with self.assertRaises(SystemExit):
                    self.mod._validate_server_name(name)

    def test_root_symlink_refused(self) -> None:
        woodright = self.home / ".woodright"
        woodright.mkdir(mode=0o700)
        target = self.outside / "fake-root"
        target.mkdir()
        root = woodright / "durable-local-servers"
        root.symlink_to(target)
        with self.assertRaises(SystemExit) as ctx:
            self.mod.ensure_state_root()
        self.assertIn("symlink", str(ctx.exception).lower())
        # outside untouched
        self.assertEqual(self.canary.read_text(encoding="utf-8"), "CANARY_UNCHANGED\n")
        cp = self._run_cli("status", "--name", "sf-1")
        self.assertNotEqual(cp.returncode, 0)
        self.assertIn("symlink", (cp.stderr + cp.stdout).lower())

    def test_state_dir_symlink_refused(self) -> None:
        root = self.mod.ensure_state_root()
        target = self.outside / "escaped-state"
        target.mkdir()
        (root / "sf-1").symlink_to(target)
        with self.assertRaises(SystemExit):
            self.mod.safe_state_paths("sf-1")
        cp = self._run_cli("stop", "--name", "sf-1")
        self.assertNotEqual(cp.returncode, 0)
        self.assertEqual(list(target.iterdir()), [])
        self.assertEqual(self.canary.read_text(encoding="utf-8"), "CANARY_UNCHANGED\n")

    def test_identity_symlink_refused(self) -> None:
        root = self.mod.ensure_state_root()
        d = root / "sf-1"
        d.mkdir(mode=0o700)
        (d / "identity.json").symlink_to(self.canary)
        with self.assertRaises(SystemExit):
            self.mod.read_record(d, root=root)
        cp = self._run_cli("status", "--name", "sf-1")
        self.assertNotEqual(cp.returncode, 0)
        self.assertEqual(self.canary.read_text(encoding="utf-8"), "CANARY_UNCHANGED\n")

    def test_tmp_symlink_refused_on_write(self) -> None:
        root = self.mod.ensure_state_root()
        d = root / "sf-1"
        d.mkdir(mode=0o700)
        (d / "identity.json.tmp").symlink_to(self.canary)
        with self.assertRaises(SystemExit):
            self.mod.write_record(
                d,
                {
                    "pid": 1,
                    "lstart": "x",
                    "cmdline": "x",
                    "cwd": "/tmp",
                    "port": 3999,
                    "cmd": "x",
                    "name": "sf-1",
                },
                root=root,
            )
        self.assertEqual(self.canary.read_text(encoding="utf-8"), "CANARY_UNCHANGED\n")

    def test_identity_directory_refused(self) -> None:
        root = self.mod.ensure_state_root()
        d = root / "sf-1"
        d.mkdir(mode=0o700)
        (d / "identity.json").mkdir()
        with self.assertRaises(SystemExit):
            self.mod.read_record(d, root=root)

    def test_invalid_json_fail_closed_no_delete(self) -> None:
        root = self.mod.ensure_state_root()
        d = root / "sf-1"
        d.mkdir(mode=0o700)
        identity = d / "identity.json"
        identity.write_text("{not-json", encoding="utf-8")
        self.assertIsNone(self.mod.read_record(d, root=root))
        self.assertTrue(identity.exists())

    def test_oversized_identity_refused(self) -> None:
        root = self.mod.ensure_state_root()
        d = root / "sf-1"
        d.mkdir(mode=0o700)
        identity = d / "identity.json"
        identity.write_bytes(b"x" * (self.mod.MAX_IDENTITY_BYTES + 8))
        with self.assertRaises(SystemExit):
            self.mod.read_record(d, root=root)

    def test_manual_forbidden_port_name_only_stop(self) -> None:
        for port in (3002, 9000):
            with self.subTest(port=port):
                proc = subprocess.Popen(["sleep", "120"])
                self.addCleanup(lambda p=proc: p.poll() is None and p.send_signal(signal.SIGKILL))
                time.sleep(0.05)
                live = self.mod.live_identity(proc.pid)
                self.assertIsNotNone(live)
                assert live is not None
                root = self.mod.ensure_state_root()
                name = f"forbid-{port}"
                d = root / name
                d.mkdir(mode=0o700)
                payload = {
                    "pid": proc.pid,
                    "lstart": live["lstart"],
                    "cmdline": live["cmdline"],
                    "cwd": live["cwd"],
                    "port": port,
                    "cmd": "sleep 120",
                    "name": name,
                }
                # Write via raw file to simulate pre-hardening / handcrafted state.
                (d / "identity.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
                cp = self._run_cli("stop", "--name", name)  # name-only, no --port
                self.assertNotEqual(cp.returncode, 0)
                self.assertIn(str(port), cp.stderr + cp.stdout)
                # Process must still be alive
                self.assertIsNone(proc.poll())
                proc.send_signal(signal.SIGTERM)
                proc.wait(timeout=5)

    def test_cli_forbidden_ports(self) -> None:
        for port in (3002, 9000):
            with self.subTest(port=port):
                cp = self._run_cli(
                    "start",
                    "--name",
                    "x",
                    "--cwd",
                    str(self.home),
                    "--port",
                    str(port),
                    "--cmd",
                    "true",
                )
                self.assertNotEqual(cp.returncode, 0)
                self.assertIn("refused", (cp.stderr + cp.stdout).lower())

    def test_lifecycle_and_identity_mismatch(self) -> None:
        port = free_port()
        name = f"life-{port}"
        cmd = (
            "python3 -c \"import http.server; "
            f"http.server.HTTPServer(('127.0.0.1',{port}), "
            "http.server.SimpleHTTPRequestHandler).serve_forever()\""
        )
        start = self._run_cli(
            "start",
            "--name",
            name,
            "--cwd",
            str(self.home),
            "--port",
            str(port),
            "--cmd",
            cmd,
            "--wait-listen",
            "10",
        )
        self.assertEqual(start.returncode, 0, start.stderr + start.stdout)
        status = self._run_cli("status", "--name", name, "--port", str(port))
        self.assertEqual(status.returncode, 0, status.stderr + status.stdout)
        self.assertIn("status=running", status.stdout)

        root = self._woodright_root()
        identity = root / name / "identity.json"
        backup = identity.read_text(encoding="utf-8")
        data = json.loads(backup)
        data["cmdline"] = "totally-different"
        identity.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
        bad_stop = self._run_cli("stop", "--name", name, "--port", str(port))
        self.assertEqual(bad_stop.returncode, 2)

        identity.write_text(backup, encoding="utf-8")
        stop = self._run_cli("stop", "--name", name, "--port", str(port))
        self.assertEqual(stop.returncode, 0, stop.stderr + stop.stdout)
        second = self._run_cli("stop", "--name", name, "--port", str(port))
        self.assertEqual(second.returncode, 2)

        # port free
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.3)
            self.assertNotEqual(s.connect_ex(("127.0.0.1", port)), 0)

    def test_tmp_regular_preexists_refused(self) -> None:
        root = self.mod.ensure_state_root()
        d = root / "sf-1"
        d.mkdir(mode=0o700)
        (d / "identity.json.tmp").write_text("stale\n", encoding="utf-8")
        with self.assertRaises(SystemExit):
            self.mod.write_record(
                d,
                {
                    "pid": 1,
                    "lstart": "x",
                    "cmdline": "x",
                    "cwd": "/tmp",
                    "port": 3999,
                    "cmd": "x",
                    "name": "sf-1",
                },
                root=root,
            )
        self.assertEqual((d / "identity.json.tmp").read_text(encoding="utf-8"), "stale\n")

    def test_dir_fd_open_rejects_symlink_state_dir(self) -> None:
        root = self.mod.ensure_state_root()
        target = self.outside / "fd-escape"
        target.mkdir()
        link = root / "sf-fd"
        link.symlink_to(target)
        with self.assertRaises(SystemExit):
            self.mod._open_dir_fd(link, "state_dir")

    def test_replace_identity_with_symlink_before_read(self) -> None:
        root = self.mod.ensure_state_root()
        d = root / "sf-race"
        d.mkdir(mode=0o700)
        identity = d / "identity.json"
        identity.write_text('{"pid": 1}\n', encoding="utf-8")
        identity.unlink()
        identity.symlink_to(self.canary)
        with self.assertRaises(SystemExit):
            self.mod.read_record(d, root=root)
        self.assertEqual(self.canary.read_text(encoding="utf-8"), "CANARY_UNCHANGED\n")


if __name__ == "__main__":
    unittest.main()
