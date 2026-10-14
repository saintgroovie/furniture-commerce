"""Build V2 maps from a read-only inventory export. Does not write Medusa."""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

from catalog_norm.decisions import classify, mattress_rows, write_outputs
from catalog_norm.export_inventory import connect, export_products
from catalog_norm.review_manifest import build_manifest, manifest_text


def main() -> None:
    out = Path(sys.argv[1])
    price_list = Path(sys.argv[2]) if len(sys.argv) > 2 else None
    conn = connect()
    inventory = export_products(conn)
    identity = inventory.get("identity") or {}
    if identity.get("db") != "medusa-store":
        raise SystemExit(f"refusing database {identity.get('db')}")
    if identity.get("ro") not in {"on", "true", "True"}:
        raise SystemExit("refusing a connection that is not read only")
    price_rows = []
    if price_list and price_list.exists():
        with price_list.open(newline="") as handle:
            price_rows = list(csv.DictReader(handle))
    result = classify(inventory["products"])
    mattresses = mattress_rows(inventory["products"], price_rows)
    if not result["summary"]["sku_unique"]:
        raise SystemExit("SKU map is not unique")
    if result["summary"]["price_mismatch"]:
        raise SystemExit("price mismatch in a dry-run map")
    write_outputs(result, mattresses, str(out))
    manifest = build_manifest(result["rows"], inventory["products"])
    if manifest["rejected_combinations"] != result["summary"]["rejected_combinations"]:
        raise SystemExit("manifest rejected combinations disagree with the summary")
    (out / "catalog-normalization-v2-sku-manifest.json").write_text(manifest_text(manifest))
    (out / "catalog-normalization-v2-validation.json").write_text(
        json.dumps(
            {
                "database": identity.get("db"),
                "read_only": identity.get("ro"),
                "production": "NOT_MUTATED",
                **result["summary"],
                "mattress_rows": len(mattresses),
                "mattress_families": 0,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n"
    )
    print(json.dumps(result["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
