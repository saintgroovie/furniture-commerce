#!/usr/bin/env python3
"""Governed rewrite of public_demo Traefik file-provider server URLs.

Stdlib only. Does not load Traefik TLS/acme files. Refuses apex/production
and any YAML that is not the eligible woodright-demo file-provider.
"""
from __future__ import annotations

import argparse
import ipaddress
import json
import os
import pathlib
import re
import sys
import tempfile
from typing import Optional

SF_HOST_URL = "http://woodright-staging-storefront:3002"
BE_HOST_URL = "http://woodright-staging-backend:9000"
SF_SERVICE = "woodright-storefront"
BE_SERVICE = "woodright-backend"
URL_LINE_RE = re.compile(r'^(\s*- url:\s*")([^"]+)("\s*)$')
NUDGE_PREFIX = "# woodright-edge-resolver-nudge:"
IPV4_URL_RE = re.compile(r"^http://(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$")


class Refuse(Exception):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


def _is_docker_ipv4(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    if addr.version != 4 or addr.is_loopback or addr.is_unspecified or addr.is_link_local:
        return False
    return bool(addr.is_private)


def _eligible_url(url: str, kind: str) -> bool:
    if kind == "storefront":
        if url == SF_HOST_URL:
            return True
        m = IPV4_URL_RE.fullmatch(url)
        return bool(m and m.group(2) == "3002" and _is_docker_ipv4(m.group(1)))
    if kind == "backend":
        if url == BE_HOST_URL:
            return True
        m = IPV4_URL_RE.fullmatch(url)
        return bool(m and m.group(2) == "9000" and _is_docker_ipv4(m.group(1)))
    return False


def _assert_desired_url(url: str, kind: str) -> None:
    if not _eligible_url(url, kind):
        raise Refuse(f"desired_{kind}_url_ineligible:{url}")
    if kind == "storefront" and url == SF_HOST_URL:
        return
    if kind == "backend" and url == BE_HOST_URL:
        return
    m = IPV4_URL_RE.fullmatch(url)
    if not m:
        raise Refuse(f"desired_{kind}_url_not_ip_or_hostname:{url}")


def _strip_obsolete_nudge(raw: str) -> str:
    lines = raw.splitlines(keepends=True)
    if lines and lines[0].startswith(NUDGE_PREFIX):
        lines = lines[1:]
        if lines and lines[0] == "\n":
            lines = lines[1:]
    return "".join(lines)


def _require_eligible_demo_file(raw: str) -> None:
    if "Host(`woodright-demo.ru`)" not in raw:
        raise Refuse("missing_demo_host_rule")
    if "Host(`api.woodright-demo.ru`)" not in raw:
        raise Refuse("missing_api_host_rule")
    if "Host(`woodright.ru`)" in raw:
        raise Refuse("apex_host_refused")
    if "woodright-public-production" in raw:
        raise Refuse("public_production_refused")
    if "Host(`woodright-demo.ru`)" in raw and "Host(`www.woodright.ru`)" in raw:
        raise Refuse("mixed_apex_refused")
    if re.search(r"Host\(`[^`]*woodright\.ru`\)", raw) and "woodright-demo.ru" in raw:
        # extra apex-like hosts besides demo/www-demo
        for match in re.finditer(r"Host\(`([^`]+)`\)", raw):
            host = match.group(1)
            if host in ("woodright-demo.ru", "www.woodright-demo.ru", "api.woodright-demo.ru"):
                continue
            if host.endswith("woodright.ru"):
                raise Refuse(f"non_demo_host_refused:{host}")


def extract_service_urls(raw: str) -> dict[str, str]:
    """Return {service_name: url} for loadBalancer server urls in services:."""
    _require_eligible_demo_file(raw)
    body = _strip_obsolete_nudge(raw)
    found: dict[str, str] = {}
    in_services = False
    current: Optional[str] = None
    for line in body.splitlines():
        if re.match(r"^  services:\s*$", line):
            in_services = True
            current = None
            continue
        if in_services and re.match(r"^[^\s]", line):
            in_services = False
            current = None
            continue
        if not in_services:
            continue
        svc = re.match(r"^    ([A-Za-z0-9_-]+):\s*$", line)
        if svc:
            current = svc.group(1)
            continue
        if current is None:
            continue
        url_m = URL_LINE_RE.match(line)
        if url_m:
            if current in found:
                raise Refuse(f"duplicate_url:{current}")
            found[current] = url_m.group(2)
    if SF_SERVICE not in found:
        raise Refuse("missing_storefront_service_url")
    if BE_SERVICE not in found:
        raise Refuse("missing_backend_service_url")
    if not _eligible_url(found[SF_SERVICE], "storefront"):
        raise Refuse(f"unexpected_storefront_url:{found[SF_SERVICE]}")
    if not _eligible_url(found[BE_SERVICE], "backend"):
        raise Refuse(f"unexpected_backend_url:{found[BE_SERVICE]}")
    return found


def rewrite_content(
    raw: str,
    sf_url: Optional[str],
    be_url: Optional[str],
) -> tuple[str, dict[str, str], dict[str, str]]:
    before = extract_service_urls(raw)
    desired_sf = sf_url if sf_url is not None else before[SF_SERVICE]
    desired_be = be_url if be_url is not None else before[BE_SERVICE]
    _assert_desired_url(desired_sf, "storefront")
    _assert_desired_url(desired_be, "backend")
    body = _strip_obsolete_nudge(raw)
    out_lines: list[str] = []
    in_services = False
    current: Optional[str] = None
    replaced = {SF_SERVICE: 0, BE_SERVICE: 0}
    for line in body.splitlines(keepends=True):
        stripped_nl = line.endswith("\n")
        core = line[:-1] if stripped_nl else line
        if re.match(r"^  services:\s*$", core):
            in_services = True
            current = None
            out_lines.append(line)
            continue
        if in_services and re.match(r"^[^\s]", core):
            in_services = False
            current = None
            out_lines.append(line)
            continue
        if in_services:
            svc = re.match(r"^    ([A-Za-z0-9_-]+):\s*$", core)
            if svc:
                current = svc.group(1)
                out_lines.append(line)
                continue
            url_m = URL_LINE_RE.match(core)
            if url_m and current in (SF_SERVICE, BE_SERVICE):
                new_url = desired_sf if current == SF_SERVICE else desired_be
                new_core = f"{url_m.group(1)}{new_url}{url_m.group(3)}"
                out_lines.append(new_core + ("\n" if stripped_nl else ""))
                replaced[current] += 1
                continue
        out_lines.append(line)
    if replaced[SF_SERVICE] != 1 or replaced[BE_SERVICE] != 1:
        raise Refuse(
            f"url_replace_count_sf={replaced[SF_SERVICE]}_be={replaced[BE_SERVICE]}"
        )
    new = "".join(out_lines)
    after = extract_service_urls(new)
    if after[SF_SERVICE] != desired_sf or after[BE_SERVICE] != desired_be:
        raise Refuse("rewrite_did_not_converge")
    raw_norm = re.sub(r'url: "[^"]+"', 'url: "URL"', _strip_obsolete_nudge(raw))
    new_norm = re.sub(r'url: "[^"]+"', 'url: "URL"', new)
    if raw_norm != new_norm:
        raise Refuse("non_url_payload_changed")
    return new, before, after


def atomic_write(path: pathlib.Path, new: str, orig: str) -> str:
    orig_stat = path.stat()
    inject = os.environ.get("WOODRIGHT_PUBLIC_DEMO_ENDPOINT_CAS_INJECT")
    directory = str(path.parent)
    fd, tmp_name = tempfile.mkstemp(prefix=".wr-tf-ep-", suffix=".yml", dir=directory)
    replaced = False
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(new)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(tmp_name, orig_stat.st_mode)
        if inject:
            path.write_text(inject, encoding="utf-8")
        now_stat = path.stat()
        now = path.read_text(encoding="utf-8")
        if now != orig or (
            now_stat.st_ino != orig_stat.st_ino
            or now_stat.st_size != orig_stat.st_size
            or now_stat.st_mtime_ns != orig_stat.st_mtime_ns
        ):
            return "cas_skip"
        os.replace(tmp_name, path)
        replaced = True
        return "replaced"
    finally:
        if not replaced:
            try:
                os.unlink(tmp_name)
            except OSError:
                pass


def _print_json(obj: dict) -> None:
    print(json.dumps(obj, sort_keys=True))


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="woodright-public-demo-traefik-endpoint")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_ex = sub.add_parser("extract")
    p_ex.add_argument("--file", required=True)

    p_rw = sub.add_parser("rewrite")
    p_rw.add_argument("--file", required=True)
    p_rw.add_argument("--sf-url", required=True)
    p_rw.add_argument("--be-url", required=True)
    p_rw.add_argument("--stdout", action="store_true")

    p_rs = sub.add_parser("restore-hostnames")
    p_rs.add_argument("--file", required=True)
    p_rs.add_argument("--stdout", action="store_true")

    args = parser.parse_args(argv)
    path = pathlib.Path(args.file)
    try:
        raw = path.read_text(encoding="utf-8")
        if args.cmd == "extract":
            urls = extract_service_urls(raw)
            _print_json(
                {
                    "status": "ok",
                    "storefront": urls[SF_SERVICE],
                    "backend": urls[BE_SERVICE],
                }
            )
            return 0
        if args.cmd == "rewrite":
            new, before, after = rewrite_content(raw, args.sf_url, args.be_url)
            unchanged = new == _strip_obsolete_nudge(raw) and after == before
            if args.stdout:
                sys.stdout.write(new)
                return 0
            if unchanged and raw == new:
                _print_json(
                    {
                        "status": "unchanged",
                        "storefront": after[SF_SERVICE],
                        "backend": after[BE_SERVICE],
                    }
                )
                return 0
            result = atomic_write(path, new, raw)
            if result == "cas_skip":
                _print_json({"status": "cas_skip"})
                return 3
            _print_json(
                {
                    "status": "replaced",
                    "storefront_before": before[SF_SERVICE],
                    "backend_before": before[BE_SERVICE],
                    "storefront": after[SF_SERVICE],
                    "backend": after[BE_SERVICE],
                }
            )
            return 0
        if args.cmd == "restore-hostnames":
            new, before, after = rewrite_content(raw, SF_HOST_URL, BE_HOST_URL)
            if args.stdout:
                sys.stdout.write(new)
                return 0
            if raw == new:
                _print_json(
                    {
                        "status": "unchanged",
                        "storefront": after[SF_SERVICE],
                        "backend": after[BE_SERVICE],
                    }
                )
                return 0
            result = atomic_write(path, new, raw)
            if result == "cas_skip":
                _print_json({"status": "cas_skip"})
                return 3
            _print_json(
                {
                    "status": "replaced",
                    "storefront_before": before[SF_SERVICE],
                    "backend_before": before[BE_SERVICE],
                    "storefront": after[SF_SERVICE],
                    "backend": after[BE_SERVICE],
                }
            )
            return 0
    except Refuse as exc:
        _print_json({"status": "refused", "reason": exc.reason})
        return 2
    except Exception as exc:  # noqa: BLE001 — fail-closed CLI
        _print_json({"status": "error", "reason": str(exc)})
        return 4
    return 4


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
