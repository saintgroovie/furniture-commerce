#!/usr/bin/env python3
"""Full published title table for Night II human/heuristic audit."""

from __future__ import annotations

import csv
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from normalize_catalog import connect, fetch_products, resolve_public_title  # type: ignore

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / "artifacts" / "catalog-normalization"

# Pedestal codes only as whole tokens / title tails — avoid matching «яя» inside «нижняя».
SUSPICIOUS = re.compile(
    r"(?i)((?:^|[\s.])(ЯП|ПЯ|ЯЯ|ПП)\s*$|Default\s*Variant|\bDefault\b|\bVariant\b|"
    r"Вариант\s*\d|2х|3х|4х|1дв|2дв|2-тумб\.|"
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}|^\s*$|\(\s*\)|"
    r"\bSKU\b|"
    # Excel-style measure star (buyer UI maps *→×; still flag raw public title)
    r"\d\s*\*\s*\d)"
)


def main() -> int:
    with connect() as conn:
        products = fetch_products(conn)
    rows = []
    suspicious = []
    for p in products:
        if p.get("status") != "published":
            continue
        meta = p.get("metadata") or {}
        pub = resolve_public_title(p)
        skus = [v.get("sku") for v in (p.get("variants") or []) if v.get("sku")]
        flags = []
        if SUSPICIOUS.search(pub["public_title"] or ""):
            flags.append("heuristic_suspicious")
        if pub["changed_vs_title"]:
            flags.append("differs_from_raw_title")
        if not meta.get("canonical_name"):
            flags.append("no_canonical")
        if meta.get("public_title"):
            flags.append("has_public_title")
        row = {
            "id": p["id"],
            "handle": p["handle"],
            "sku": skus[0] if skus else "",
            "raw_title": p.get("title"),
            "canonical_name": meta.get("canonical_name"),
            "public_title_meta": meta.get("public_title"),
            "buyer_facing_title": pub["public_title"],
            "buyer_source": pub["source"],
            "collection": meta.get("collection") or meta.get("collection_label"),
            "display_group": meta.get("display_group"),
            "classification": p.get("classification"),
            "flags": "|".join(flags),
        }
        rows.append(row)
        if "heuristic_suspicious" in flags:
            suspicious.append(row)

    ART.mkdir(parents=True, exist_ok=True)
    out_csv = ART / "NIGHT2_titles_all.csv"
    with out_csv.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()) if rows else [])
        w.writeheader()
        w.writerows(rows)
    summary = {
        "published": len(rows),
        "suspicious": len(suspicious),
        "suspicious_handles": [r["handle"] for r in suspicious],
        "csv": str(out_csv),
    }
    (ART / "NIGHT2_title_audit.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
