#!/usr/bin/env python3
"""Ensure isolated Admin QA store is branded Woodright (sidebar label).

Uses Admin email/password auth against local :PORT (default 9001).
Safe to re-run; no-op when name is already Woodright.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

PORT = int(os.environ.get("PORT", "9001"))
BASE = os.environ.get("WOODRIGHT_ADMIN_BASE", f"http://localhost:{PORT}")
EMAIL = os.environ.get("LOCAL_ADMIN_EMAIL", "admin@woodright.ru")
PASSWORD = os.environ.get("LOCAL_ADMIN_PASSWORD", "admin123")
TARGET_NAME = os.environ.get("WOODRIGHT_STORE_NAME", "Woodright")


def http_json(method: str, path: str, body: dict | None = None, token: str | None = None):
    data = None if body is None else json.dumps(body).encode()
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=data,
        headers=headers,
        method=method,
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        raw = resp.read().decode()
        return json.loads(raw) if raw else {}


def main() -> int:
    try:
        auth = http_json(
            "POST",
            "/auth/user/emailpass",
            {"email": EMAIL, "password": PASSWORD},
        )
    except urllib.error.URLError as exc:
        print(f"ERROR: auth failed: {exc}", file=sys.stderr)
        return 1

    token = auth.get("token")
    if not token:
        print("ERROR: no auth token", file=sys.stderr)
        return 1

    stores = http_json("GET", "/admin/stores", token=token)
    store_list = stores.get("stores") or []
    if not store_list:
        print("ERROR: no stores", file=sys.stderr)
        return 1

    store = store_list[0]
    store_id = store.get("id")
    current = store.get("name")
    if current == TARGET_NAME:
        print(f"ok store={store_id} name={current} (unchanged)")
        return 0

    updated = http_json(
        "POST",
        f"/admin/stores/{store_id}",
        {"name": TARGET_NAME},
        token=token,
    )
    name = (updated.get("store") or {}).get("name") or TARGET_NAME
    print(f"ok store={store_id} name={name} (was {current!r})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
