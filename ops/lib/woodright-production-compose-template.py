#!/usr/bin/env python3
"""Classify production-candidate compose template drift (stdlib only).

Does not print or read compose .env secrets. Target path policy lives in the
shell helper; this module only compares two compose YAML texts.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

COMPONENT_SHA_KEYS = (
    "WOODRIGHT_BACKEND_SOURCE_SHA",
    "WOODRIGHT_STOREFRONT_SOURCE_SHA",
)
SERVICE_ORDER = ("postgres", "redis", "backend", "storefront")
MEM_KEYS = ("mem_reservation", "mem_limit", "memswap_limit")
MEM_DEFAULT_RE = re.compile(
    r"""^\s*(mem_reservation|mem_limit|memswap_limit):\s*(?:"([^"]+)"|'([^']+)'|\$\{[A-Z0-9_]+:-([^}]+)\}|(\S+))\s*$"""
)
ENV_KEY_RE = re.compile(r"^\s{6}([A-Z][A-Z0-9_]*):")
SERVICE_RE = re.compile(r"^  ([a-z0-9_-]+):", re.M)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def service_blocks(text: str) -> dict[str, str]:
    lines = text.splitlines()
    starts: list[tuple[str, int]] = []
    in_services = False
    for i, line in enumerate(lines):
        if line.startswith("services:"):
            in_services = True
            continue
        if in_services and (line.startswith("volumes:") or line.startswith("networks:")):
            break
        m = re.match(r"^  ([a-z0-9_-]+):", line)
        if in_services and m:
            starts.append((m.group(1), i))
    blocks: dict[str, str] = {}
    for idx, (name, start) in enumerate(starts):
        end = starts[idx + 1][1] if idx + 1 < len(starts) else None
        if end is None:
            # cut at volumes/networks at column 0
            end = len(lines)
            for j in range(start + 1, len(lines)):
                if lines[j].startswith("volumes:") or lines[j].startswith("networks:"):
                    end = j
                    break
        blocks[name] = "\n".join(lines[start:end])
    return blocks


def env_keys(block: str) -> list[str]:
    keys: list[str] = []
    in_env = False
    for line in block.splitlines():
        if re.match(r"^    environment:", line):
            in_env = True
            continue
        if in_env:
            if line.startswith("    ") and not line.startswith("      ") and line.strip():
                break
            m = ENV_KEY_RE.match(line)
            if m:
                keys.append(m.group(1))
    return keys


def normalize_mem_value(val: str) -> str:
    val = (val or "").strip().strip('"').strip("'")
    m = re.fullmatch(r"\$\{[A-Z0-9_]+:-([^}]+)\}", val)
    return m.group(1) if m else val


def mem_defaults(block: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in block.splitlines():
        m = MEM_DEFAULT_RE.match(line)
        if not m:
            continue
        key = m.group(1)
        raw = next((g for g in m.groups()[1:] if g), "")
        out[key] = normalize_mem_value(raw)
    return out


def field_line(block: str, key: str) -> str:
    for line in block.splitlines():
        if re.match(rf"^    {re.escape(key)}:", line):
            return line.strip()
    return ""


def ports(block: str) -> list[str]:
    found: list[str] = []
    in_ports = False
    for line in block.splitlines():
        if re.match(r"^    ports:", line):
            in_ports = True
            continue
        if in_ports:
            if line.startswith("    ") and not line.startswith("      ") and line.strip():
                break
            item = line.strip()
            if item.startswith("-"):
                found.append(item)
    return found


COMPONENT_SHA_LINE_RE = re.compile(
    r"^\s+WOODRIGHT_(?:BACKEND|STOREFRONT)_SOURCE_SHA:\s*.*$"
)
RELEASE_SHA_LINE_RE = re.compile(
    r"^(\s+WOODRIGHT_RELEASE_SHA:\s*)\$\{WOODRIGHT_RELEASE_SHA(?::-)?\}\s*$"
)
MEM_LINE_RE = re.compile(
    r"^(\s*)(mem_reservation|mem_limit|memswap_limit):\s*(.*)$"
)
MEM_INTERP_RE = re.compile(r"^\$\{([A-Z][A-Z0-9_]*):-([^}]+)\}$")
SERVICE_HEADER_RE = re.compile(r"^  ([a-z0-9_-]+):\s*$")
TARGET_SUFFIX = "/etc/dokploy/compose/woodright-production/code/docker-compose.yml"


def parse_mem_raw(raw: str) -> tuple[str | None, str]:
    stripped = (raw or "").strip().strip('"').strip("'")
    m = MEM_INTERP_RE.fullmatch(stripped)
    if m:
        return m.group(1), m.group(2)
    return None, normalize_mem_value(raw)


def current_service(line: str, service: str | None) -> str | None:
    m = SERVICE_HEADER_RE.match(line)
    if m:
        return m.group(1)
    if line.startswith("volumes:") or line.startswith("networks:"):
        return None
    return service


def extract_mem_authority(text: str) -> dict[tuple[str, str], tuple[str, str]]:
    """Map (service, mem_key) → (interpolation variable, default)."""
    auth: dict[tuple[str, str], tuple[str, str]] = {}
    service: str | None = None
    for line in text.splitlines():
        service = current_service(line, service)
        m = MEM_LINE_RE.match(line)
        if not m or not service:
            continue
        key = m.group(2)
        var, default = parse_mem_raw(m.group(3))
        if var:
            auth[(service, key)] = (var, default)
    return auth


def normalize_remainder(text: str, mem_authority: dict[tuple[str, str], tuple[str, str]]) -> str:
    """Strip known-allowed deltas so leftover inequality is unexpected drift.

    Allowed to differ: comments, blank lines, component SHA env lines,
    WOODRIGHT_RELEASE_SHA `:-` form, and quoted memory defaults that match the
    canonical interpolation variable + default for that service/key.
    Different interpolation variable names are unexpected drift.
    """
    out: list[str] = []
    service: str | None = None
    for line in text.splitlines():
        service = current_service(line, service)
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if COMPONENT_SHA_LINE_RE.match(line):
            continue
        m = RELEASE_SHA_LINE_RE.match(line)
        if m:
            out.append(f"{m.group(1)}${{WOODRIGHT_RELEASE_SHA:-}}")
            continue
        m = MEM_LINE_RE.match(line)
        if m:
            indent, key, raw = m.group(1), m.group(2), m.group(3)
            var, default = parse_mem_raw(raw)
            want = mem_authority.get((service or "", key))
            if want and default == want[1] and (var is None or var == want[0]):
                out.append(f'{indent}{key}: "${{{want[0]}:-{want[1]}}}"')
            else:
                out.append(f"{indent}{key}: {raw.strip()}")
            continue
        out.append(line.rstrip())
    return "\n".join(out) + "\n"


def remainder_excerpt(live_n: str, canon_n: str, limit: int = 24) -> list[str]:
    import difflib

    diff = list(
        difflib.unified_diff(
            live_n.splitlines(),
            canon_n.splitlines(),
            fromfile="live_remainder",
            tofile="canonical_remainder",
            lineterm="",
        )
    )
    return diff[:limit]


def classify(live_text: str, canonical_text: str) -> dict:
    live_hash = hashlib.sha256(live_text.encode("utf-8")).hexdigest()
    canon_hash = hashlib.sha256(canonical_text.encode("utf-8")).hexdigest()
    if live_hash == canon_hash:
        return {
            "class": "already_reconciled",
            "live_sha256": live_hash,
            "canonical_sha256": canon_hash,
            "reason": "byte_identical",
        }

    mem_auth = extract_mem_authority(canonical_text)
    live_n = normalize_remainder(live_text, mem_auth)
    canon_n = normalize_remainder(canonical_text, mem_auth)
    if live_n != canon_n:
        return {
            "class": "unexpected_drift",
            "live_sha256": live_hash,
            "canonical_sha256": canon_hash,
            "reason": "remainder_mismatch_after_known_allowed_deltas",
            "diff_excerpt": remainder_excerpt(live_n, canon_n),
        }

    live_svc = service_blocks(live_text)
    canon_svc = service_blocks(canonical_text)
    details: dict[str, dict] = {}
    missing_any = False
    for name in ("backend", "storefront"):
        live_env = set(env_keys(live_svc.get(name, "")))
        missing = [k for k in COMPONENT_SHA_KEYS if k not in live_env]
        details[name] = {"missing_component_sha_keys": missing}
        if missing:
            missing_any = True
        canon_env = set(env_keys(canon_svc.get(name, "")))
        if any(k not in canon_env for k in COMPONENT_SHA_KEYS):
            return {
                "class": "unexpected_drift",
                "live_sha256": live_hash,
                "canonical_sha256": canon_hash,
                "reason": "canonical_missing_component_sha_keys",
                "service": name,
            }

    if missing_any:
        return {
            "class": "known_pre_reconcile_gap",
            "live_sha256": live_hash,
            "canonical_sha256": canon_hash,
            "reason": "missing_component_sha_interpolation",
            "services": details,
        }
    return {
        "class": "allowed_cosmetic_drift",
        "live_sha256": live_hash,
        "canonical_sha256": canon_hash,
        "reason": "structure_matches_without_missing_component_sha",
        "services": details,
    }


def canonical_has_required_keys(text: str) -> tuple[bool, list[str]]:
    missing: list[str] = []
    blocks = service_blocks(text)
    for svc in ("backend", "storefront"):
        keys = set(env_keys(blocks.get(svc, "")))
        for k in COMPONENT_SHA_KEYS:
            if k not in keys:
                missing.append(f"{svc}:{k}")
    return (not missing, missing)


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("usage: classify <live.yml> <canonical.yml> | required-keys <canonical.yml>", file=sys.stderr)
        return 2
    cmd = argv[1]
    if cmd == "classify":
        live = Path(argv[2]).read_text(encoding="utf-8")
        canon = Path(argv[3]).read_text(encoding="utf-8")
        print(json.dumps(classify(live, canon), indent=2, sort_keys=True))
        return 0
    if cmd == "required-keys":
        text = Path(argv[2]).read_text(encoding="utf-8")
        ok, missing = canonical_has_required_keys(text)
        print(json.dumps({"ok": ok, "missing": missing}))
        return 0 if ok else 2
    print(f"unknown command {cmd}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
