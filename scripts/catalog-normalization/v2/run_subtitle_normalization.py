"""Board for family subtitles. Does not write Medusa."""

from __future__ import annotations

import csv
import hashlib
import json
import sys
from collections import defaultdict
from pathlib import Path

from catalog_norm.decisions import classify
from catalog_norm.description_normalize import propose_family_subtitle
from catalog_norm.export_inventory import connect, export_products
from run_description_normalization import _variants


def build(products: list[dict]) -> dict:
    grouped: dict[str, list] = defaultdict(list)
    for row in classify(products)["rows"]:
        if row["decision"] == "ALREADY_APPLIED":
            grouped[row["family_key"]].append(row)
    by_id = {row["id"]: row for row in products}
    board = []
    mutations = []
    for family, members in sorted(grouped.items()):
        product = by_id[members[0]["product_id"]]
        variants = _variants(product, {member["sku"] for member in members})
        current = product.get("subtitle") or ""
        proposal = propose_family_subtitle(current, variants)
        row = {
            "family_key": family,
            "canonical_title": product.get("title") or "",
            "product_id": product["id"],
            "handle": product.get("handle") or "",
            "status": product.get("status") or "",
            "current_subtitle": current,
            "proposed_subtitle": proposal["proposed_subtitle"],
            "action": proposal["action"],
            "confidence": proposal["confidence"],
            "evidence": proposal["evidence"],
        }
        board.append(row)
        if proposal["proposed_subtitle"] != current:
            mutations.append(row)
    return {"board": board, "mutations": mutations}


def main() -> None:
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    probe = connect()
    try:
        inventory = export_products(probe)
    finally:
        probe.close()
    built = build(inventory["products"])
    board_path = out / "subtitle-normalization-board.csv"
    with board_path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(built["board"][0].keys()))
        writer.writeheader()
        writer.writerows(built["board"])
    manifest = {
        "database": "medusa-store",
        "production": "NOT_MUTATED",
        "field": "subtitle",
        "mutations": [
            {
                "product_id": row["product_id"],
                "handle": row["handle"],
                "title": row["canonical_title"],
                "status": row["status"],
                "current_subtitle": row["current_subtitle"],
                "proposed_subtitle": row["proposed_subtitle"],
                "action": row["action"],
            }
            for row in built["mutations"]
        ],
    }
    raw = json.dumps(manifest, ensure_ascii=False, indent=2).encode()
    (out / "subtitle-normalization-manifest.json").write_bytes(raw)
    actions: dict[str, int] = {}
    for row in built["board"]:
        actions[row["action"]] = actions.get(row["action"], 0) + 1
    print(json.dumps({
        "families": len(built["board"]),
        "mutations": len(built["mutations"]),
        "manifest_sha256": hashlib.sha256(raw).hexdigest(),
        "actions": actions,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
