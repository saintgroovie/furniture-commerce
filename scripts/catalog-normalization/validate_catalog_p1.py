#!/usr/bin/env python3
"""
Catalog normalization P1 validator (Night II).

Exit 0 = no P1 violations.
Exit 1 = P1 found (merge blocker).

Usage:
  DATABASE_URL=… python3 scripts/catalog-normalization/validate_catalog_p1.py
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

try:
    import psycopg
except ImportError:
    import psycopg2 as psycopg  # type: ignore

ROOT = Path(__file__).resolve().parents[2]
# Import sibling module helpers by path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from normalize_catalog import (  # type: ignore
    CLASS_LINK,
    CODE_TAIL_RE,
    connect,
    fetch_products,
    resolve_public_title,
)

TECH_RE = re.compile(
    r"(?i)(\bdefault\s*variant\b|\bвариант\s*\d+\b|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b)"
)
SKU_LIKE = re.compile(r"^(?:[A-Z]{1,3}-?\d{2,}|[a-z]{1,3}-\d{2,})")


def validate(products: list) -> list[dict]:
    p1: list[dict] = []
    for row in products:
        if row.get("status") != "published":
            continue
        public = resolve_public_title(row)
        title = public["public_title"]
        handle = row.get("handle")
        pid = row.get("id")
        meta = row.get("metadata") or {}

        if CODE_TAIL_RE.search(title.strip()):
            p1.append({"code": "PEDESTAL_CODE_LEAK", "handle": handle, "id": pid, "title": title})
        if TECH_RE.search(title):
            p1.append({"code": "TECHNICAL_TITLE", "handle": handle, "id": pid, "title": title})
        if SKU_LIKE.match(title.strip()):
            p1.append({"code": "SKU_AS_TITLE", "handle": handle, "id": pid, "title": title})
        if "дверц" in title.lower() and public.get("pedestal_code"):
            p1.append({"code": "DOOR_WORDING_ON_PEDESTAL", "handle": handle, "id": pid, "title": title})

        for opt in row.get("medusa_options") or []:
            # Medusa Default stub is allowed in DB; buyer leakage checked via title/public fields only
            pass

        for key in (
            "fabric_upholstery_executions",
            "upholstery_color_executions",
            "finish_color_executions",
            "paint_finish_executions",
        ):
            raw = meta.get(key)
            if not isinstance(raw, list):
                continue
            for entry in raw:
                if not isinstance(entry, dict):
                    continue
                # Hero-as-swatch: swatch_image equal to first product hero is suspicious but hard in SQL;
                # presentation=swatch_image without swatch_image/url is invalid
                if entry.get("presentation") == "swatch_image" and not (
                    entry.get("swatch_image") or entry.get("swatch_url")
                ):
                    p1.append(
                        {
                            "code": "SWATCH_IMAGE_WITHOUT_ASSET",
                            "handle": handle,
                            "id": pid,
                            "axis": key,
                            "key": entry.get("key"),
                        }
                    )
                # Invented hex pattern: presentation swatch_color without hex
                if entry.get("presentation") == "swatch_color" and not (
                    isinstance(entry.get("swatch_hex"), str) and entry["swatch_hex"].strip()
                ):
                    p1.append(
                        {
                            "code": "SWATCH_COLOR_WITHOUT_HEX",
                            "handle": handle,
                            "id": pid,
                            "axis": key,
                            "key": entry.get("key"),
                        }
                    )
    return p1


def main() -> int:
    if not os.environ.get("DATABASE_URL"):
        print("DATABASE_URL required", file=sys.stderr)
        return 2
    with connect() as conn:
        products = fetch_products(conn)
        p1 = validate(products)
    out = {
        "products": len(products),
        "p1_count": len(p1),
        "p1": p1,
    }
    art = ROOT / "artifacts" / "catalog-normalization"
    art.mkdir(parents=True, exist_ok=True)
    (art / "NIGHT2_p1_validator.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({"products": out["products"], "p1_count": out["p1_count"]}, indent=2))
    if p1:
        for row in p1[:20]:
            print(row, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
