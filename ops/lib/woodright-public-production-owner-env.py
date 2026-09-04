#!/usr/bin/env python3
"""Plan public_production storefront owner-env reconcile.

Read-only planner. Does not talk to Docker, DNS, or Traefik.
Never prints non-allowlisted env values (compose .env may contain secrets).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

TARGET_LEGAL_STATUS = "approved"
TARGET_PACK_TOKEN = "OWNER_LEGAL_CONTENT_APPROVED"
YAML_PACK_TOKEN_LINE = (
    "      WOODRIGHT_LEGAL_PACK_TOKEN: ${WOODRIGHT_LEGAL_PACK_TOKEN:-}"
)
ALLOWLIST_PRINT = {
    "WOODRIGHT_LEGAL_CONTENT_STATUS",
    "WOODRIGHT_LEGAL_PACK_TOKEN",
    "WOODRIGHT_RELEASE_SHA",
    "WOODRIGHT_STOREFRONT_IMAGE",
    "WOODRIGHT_BACKEND_IMAGE",
    "WOODRIGHT_RUNTIME_ROLE",
    "WOODRIGHT_DATABASE_IDENTITY",
    "WOODRIGHT_DATABASE_IDENTITY_ALIAS",
    "WOODRIGHT_PAYMENT_MODE",
    "WOODRIGHT_PAYMENT_DECISION_STATUS",
    "WOODRIGHT_NOTIFICATION_MODE",
    "WOODRIGHT_NOTIFICATION_DECISION_STATUS",
}
PIN_KEYS = (
    "WOODRIGHT_STOREFRONT_IMAGE",
    "WOODRIGHT_BACKEND_IMAGE",
    "WOODRIGHT_RELEASE_SHA",
)


def parse_env_text(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key in out:
            raise SystemExit(f"COMPOSE_ENV_DUPLICATE_KEY {key}")
        out[key] = value
    return out


def public_value(key: str, value: str | None) -> str | None:
    if value is None:
        return None
    if key in ALLOWLIST_PRINT:
        return value
    return "<redacted>"


def yaml_has_pack_token(yaml_text: str) -> bool:
    return bool(re.search(r"^\s*WOODRIGHT_LEGAL_PACK_TOKEN\s*:", yaml_text, re.M))


def insert_yaml_pack_token(yaml_text: str) -> str:
    if yaml_has_pack_token(yaml_text):
        return yaml_text
    matches = list(
        re.finditer(r"^(\s*WOODRIGHT_LEGAL_CONTENT_STATUS\s*:.*)$", yaml_text, re.M)
    )
    if len(matches) != 1:
        raise SystemExit(
            "YAML_PACK_TOKEN_INSERT_FAIL: need exactly one WOODRIGHT_LEGAL_CONTENT_STATUS line"
        )
    m = matches[0]
    return yaml_text[: m.end()] + "\n" + YAML_PACK_TOKEN_LINE + yaml_text[m.end() :]


def plan(
    *,
    yaml_text: str,
    env_map: dict[str, str],
    live_env: dict[str, str],
    live_id: str,
    live_digest: str,
    live_role: str,
    live_db: str,
    dokploy_attached: bool,
    dokploy_aliases: list[str],
    compose_net_attached: bool,
    traefik_hash: str,
) -> dict:
    yaml_needs = not yaml_has_pack_token(yaml_text)
    planned_env = {
        "WOODRIGHT_LEGAL_CONTENT_STATUS": TARGET_LEGAL_STATUS,
        "WOODRIGHT_LEGAL_PACK_TOKEN": TARGET_PACK_TOKEN,
    }
    live_token = (live_env.get("WOODRIGHT_LEGAL_PACK_TOKEN") or "").strip()
    live_status = (live_env.get("WOODRIGHT_LEGAL_CONTENT_STATUS") or "").strip()
    env_status = (env_map.get("WOODRIGHT_LEGAL_CONTENT_STATUS") or "").strip()
    env_token = (env_map.get("WOODRIGHT_LEGAL_PACK_TOKEN") or "").strip()
    env_ok = env_status == TARGET_LEGAL_STATUS and env_token == TARGET_PACK_TOKEN
    already = (
        live_token == TARGET_PACK_TOKEN
        and live_status == TARGET_LEGAL_STATUS
        and not yaml_needs
        and env_ok
    )
    missing_pins = [k for k in PIN_KEYS if k not in env_map or not str(env_map.get(k) or "").strip()]
    if missing_pins:
        raise SystemExit("COMPOSE_ENV_MISSING_PINS " + ",".join(missing_pins))
    retained_pins = {k: env_map.get(k) for k in PIN_KEYS}
    env_delta = []
    for key, want in planned_env.items():
        have_env = env_map.get(key)
        have_live = live_env.get(key)
        env_delta.append(
            {
                "key": key,
                "compose_env_current": public_value(key, have_env) if key in env_map else None,
                "compose_env_present": key in env_map,
                "live_current": public_value(key, have_live) if key in live_env else None,
                "live_present": key in live_env,
                "want": want,
            }
        )
    return {
        "tool": "woodright-public-production-owner-env",
        "component": "storefront",
        "already_applied": already,
        "yaml_needs_pack_token_line": yaml_needs,
        "planned_env": planned_env,
        "env_delta": env_delta,
        "retain_image_pins": {
            k: (public_value(k, v) if v is not None else None) for k, v in retained_pins.items()
        },
        "retain_image_pins_present": {k: (k in env_map) for k in PIN_KEYS},
        "live": {
            "id": live_id,
            "digest": live_digest,
            "role": live_role,
            "db": live_db,
            "release_sha": public_value(
                "WOODRIGHT_RELEASE_SHA", live_env.get("WOODRIGHT_RELEASE_SHA")
            ),
            "dokploy_attached": dokploy_attached,
            "dokploy_aliases": dokploy_aliases,
            "compose_net_attached": compose_net_attached,
        },
        "reconnect_dokploy_if_dropped": True,
        "traefik_hash": traefik_hash,
        "dns_mutation": False,
        "backend_recreate": False,
        "notification_runtime_inject": False,
        "payment_env_mutate": False,
    }


def assemble_live(
    *,
    env: dict,
    live_id: str,
    live_digest: str,
    live_role: str,
    live_db: str,
    dokploy_attached: bool,
    dokploy_aliases: list[str],
    compose_net_attached: bool,
    traefik_hash: str,
    backend_id: str,
    backend_digest: str,
) -> dict:
    return {
        "id": live_id,
        "digest": live_digest,
        "role": live_role,
        "db": live_db,
        "dokploy_attached": dokploy_attached,
        "dokploy_aliases": dokploy_aliases,
        "compose_net_attached": compose_net_attached,
        "traefik_hash": traefik_hash,
        "backend_id": backend_id,
        "backend_digest": backend_digest,
        "env": env,
    }


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    p_plan = sub.add_parser("plan")
    p_plan.add_argument("--compose-yml", required=True)
    p_plan.add_argument("--compose-env", required=True)
    p_plan.add_argument("--live-json", required=True)

    p_yaml = sub.add_parser("apply-yaml")
    p_yaml.add_argument("--compose-yml", required=True)
    p_yaml.add_argument("--out", required=True)

    p_live = sub.add_parser("assemble-live")
    p_live.add_argument("--env-json", required=True)
    p_live.add_argument("--out", required=True)
    p_live.add_argument("--id", required=True)
    p_live.add_argument("--digest", required=True)
    p_live.add_argument("--role", required=True)
    p_live.add_argument("--db", required=True)
    p_live.add_argument("--dokploy-attached", required=True)
    p_live.add_argument("--aliases", default="")
    p_live.add_argument("--compose-net-attached", required=True)
    p_live.add_argument("--traefik-hash", required=True)
    p_live.add_argument("--backend-id", required=True)
    p_live.add_argument("--backend-digest", required=True)

    args = parser.parse_args(argv)
    if args.command == "apply-yaml":
        yaml_text = Path(args.compose_yml).read_text(encoding="utf-8")
        Path(args.out).write_text(insert_yaml_pack_token(yaml_text), encoding="utf-8")
        return 0
    if args.command == "assemble-live":
        env = json.loads(Path(args.env_json).read_text(encoding="utf-8"))
        if not isinstance(env, dict):
            raise SystemExit("assemble-live env JSON must be an object")
        out = assemble_live(
            env=env,
            live_id=args.id,
            live_digest=args.digest,
            live_role=args.role,
            live_db=args.db,
            dokploy_attached=args.dokploy_attached == "true",
            dokploy_aliases=args.aliases.split() if args.aliases else [],
            compose_net_attached=args.compose_net_attached == "true",
            traefik_hash=args.traefik_hash,
            backend_id=args.backend_id,
            backend_digest=args.backend_digest,
        )
        Path(args.out).write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        return 0

    yaml_text = Path(args.compose_yml).read_text(encoding="utf-8")
    env_map = parse_env_text(Path(args.compose_env).read_text(encoding="utf-8"))
    live = json.loads(Path(args.live_json).read_text(encoding="utf-8"))
    out = plan(
        yaml_text=yaml_text,
        env_map=env_map,
        live_env=live.get("env") or {},
        live_id=str(live.get("id") or ""),
        live_digest=str(live.get("digest") or ""),
        live_role=str(live.get("role") or ""),
        live_db=str(live.get("db") or ""),
        dokploy_attached=bool(live.get("dokploy_attached")),
        dokploy_aliases=list(live.get("dokploy_aliases") or []),
        compose_net_attached=bool(live.get("compose_net_attached")),
        traefik_hash=str(live.get("traefik_hash") or ""),
    )
    json.dump(out, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
