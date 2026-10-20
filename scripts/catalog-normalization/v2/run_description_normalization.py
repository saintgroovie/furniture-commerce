"""Build the family-safe description board from a read-only inventory.

Does not write Medusa.
"""

from __future__ import annotations

import csv
import hashlib
import json
import sys
from collections import defaultdict
from pathlib import Path

from catalog_norm.decisions import classify
from catalog_norm.description_fidelity import classify_family_description
from catalog_norm.description_normalize import description_facts, propose_family_description
from catalog_norm.export_inventory import connect, export_products


def _variants(product: dict, skus: set[str]) -> list[dict]:
    rows = []
    for variant in product.get("variants") or []:
        if variant.get("deleted_at") or variant.get("sku") not in skus:
            continue
        meta = variant.get("metadata") or {}
        mattress = meta.get("mattress_size") or {}
        dims = meta.get("dimensions") or {}
        axes = {
            key: value.get("display")
            for key, value in (meta.get("variant_axes") or {}).items()
            if isinstance(value, dict) and value.get("display")
        }
        if mattress.get("display") and "mattress_size" not in axes:
            axes["mattress_size"] = mattress["display"]
        rows.append({
            "sku": variant.get("sku") or "",
            "mattress": mattress.get("display") or "",
            "axes": axes,
            "dimensions": dims,
        })
    return rows


def build(products: list[dict]) -> dict:
    grouped: dict[str, list] = defaultdict(list)
    for row in classify(products)["rows"]:
        if row["decision"] == "ALREADY_APPLIED":
            grouped[row["family_key"]].append(row)
    by_id = {row["id"]: row for row in products}
    evidence = []
    board = []
    mutations = []
    for family, members in sorted(grouped.items()):
        product = by_id[members[0]["product_id"]]
        skus = {member["sku"] for member in members}
        variants = _variants(product, skus)
        current = product.get("description") or ""
        verdict = classify_family_description(current, variants)
        proposal = propose_family_description(current, product.get("title") or "", variants)
        for fact in description_facts(current, variants):
            evidence.append({
                "family_key": family,
                "canonical_title": product.get("title") or "",
                "survivor": product.get("handle") or "",
                "source_skus": " ".join(sorted(skus)),
                "fact": fact["fact"],
                "fact_class": fact["class"],
                "evidence": fact["evidence"],
            })
        board.append({
            "family_key": family,
            "canonical_title": product.get("title") or "",
            "source_sku": verdict["source_sku"],
            "current_description": current,
            "variant_claims_detected": verdict["claims"],
            "common_facts": "; ".join(
                fact["fact"] for fact in description_facts(current, variants) if fact["class"] == "COMMON"
            ),
            "proposed_description": proposal["proposed_description"],
            "confidence": proposal["confidence"],
            "evidence": proposal["evidence"],
            "action": proposal["action"],
        })
        if proposal["action"] == "REWRITE_FAMILY_SAFE" and proposal["proposed_description"] != current:
            mutations.append({
                "product_id": product["id"],
                "handle": product.get("handle") or "",
                "family_key": family,
                "title": product.get("title") or "",
                "status": product.get("status") or "",
                "current_description": current,
                "proposed_description": proposal["proposed_description"],
            })
    return {"evidence": evidence, "board": board, "mutations": mutations}


def main() -> None:
    out = Path(sys.argv[1])
    inventory = export_products(connect())
    identity = inventory.get("identity") or {}
    if identity.get("db") != "medusa-store" or identity.get("ro") not in {"on", "true", "True"}:
        raise SystemExit("refusing a connection that is not the read-only local store")
    built = build(inventory["products"])
    out.mkdir(parents=True, exist_ok=True)
    evidence_fields = [
        "family_key", "canonical_title", "survivor", "source_skus", "fact", "fact_class", "evidence",
    ]
    with (out / "description-family-evidence.csv").open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=evidence_fields)
        writer.writeheader()
        writer.writerows(built["evidence"])
    board_fields = [
        "family_key", "canonical_title", "source_sku", "current_description",
        "variant_claims_detected", "common_facts", "proposed_description",
        "confidence", "evidence", "action",
    ]
    with (out / "description-normalization-board.csv").open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=board_fields)
        writer.writeheader()
        writer.writerows(built["board"])
    payload = {
        "database": identity.get("db"),
        "read_only_probe": identity.get("ro"),
        "production": "NOT_MUTATED",
        "mutations": built["mutations"],
    }
    raw = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    (out / "description-normalization-manifest.json").write_text(raw)
    holds = [row["family_key"] for row in built["board"] if row["action"] == "HOLD_INSUFFICIENT_EVIDENCE"]
    print(json.dumps({
        "families": len(built["board"]),
        "mutations": len(built["mutations"]),
        "holds": holds,
        "manifest_sha256": hashlib.sha256(raw.encode()).hexdigest(),
        "actions": {row["action"]: sum(1 for item in built["board"] if item["action"] == row["action"]) for row in built["board"]},
    }, ensure_ascii=False))
    if holds:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
