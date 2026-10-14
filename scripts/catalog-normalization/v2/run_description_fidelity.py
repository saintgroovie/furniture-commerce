"""Read-only description fidelity audit. Does not write Medusa."""

from __future__ import annotations

import csv
import json
import sys
from collections import defaultdict
from pathlib import Path

from catalog_norm.description_fidelity import classify_family_description, title_problem
from catalog_norm.export_inventory import connect, export_products
from catalog_norm.decisions import classify


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


def main() -> None:
    out = Path(sys.argv[1])
    inventory = export_products(connect())
    identity = inventory.get("identity") or {}
    if identity.get("db") != "medusa-store" or identity.get("ro") not in {"on", "true", "True"}:
        raise SystemExit("refusing a connection that is not the read-only local store")
    products = {row["id"]: row for row in inventory["products"]}
    grouped: dict[str, list] = defaultdict(list)
    for row in classify(inventory["products"])["rows"]:
        if row["decision"] == "ALREADY_APPLIED":
            grouped[row["family_key"]].append(row)
    audit = []
    titles = []
    for family, members in sorted(grouped.items()):
        product = products[members[0]["product_id"]]
        skus = {member["sku"] for member in members}
        variants = _variants(product, skus)
        result = classify_family_description(product.get("description") or "", variants)
        audit.append({
            "canonical_family": family,
            "survivor_product": product.get("handle") or "",
            "source_sku": result["source_sku"],
            "description_classification": result["classification"],
            "detected_variant_claims": result["claims"],
            "disposition": result["disposition"],
            "evidence": result["evidence"],
        })
        problem = title_problem(product.get("title") or "", variants)
        titles.append({
            "family": family,
            "handle": product.get("handle") or "",
            "title": product.get("title") or "",
            "problem": problem or "pass",
        })
    out.mkdir(parents=True, exist_ok=True)
    fields = [
        "canonical_family", "survivor_product", "source_sku",
        "description_classification", "detected_variant_claims", "disposition", "evidence",
    ]
    with (out / "description-fidelity-audit.csv").open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(audit)
    (out / "clean-title-audit.json").write_text(json.dumps({
        "production": "NOT_MUTATED",
        "database": identity.get("db"),
        "families": len(audit),
        "titles": titles,
        "clean_title_pass": all(row["problem"] == "pass" for row in titles),
    }, ensure_ascii=False, indent=2) + "\n")
    counts: dict[str, int] = {}
    for row in audit:
        counts[row["description_classification"]] = counts.get(row["description_classification"], 0) + 1
    print(json.dumps({"families": len(audit), "counts": counts, "clean_title_pass": all(row["problem"] == "pass" for row in titles)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
