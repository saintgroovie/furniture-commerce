"""Check the storefront retired-product redirect map against a read-only inventory.

Every entry must send a retired, unpublished shell to the published product
that now carries the shell's own SKU. Writes a deterministic manifest and
exits non-zero on any violation. Does not write Medusa.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

from catalog_norm.export_inventory import connect, export_products

MAP_FILE = Path(__file__).resolve().parents[3] / "apps/storefront/src/lib/retired-product-handles.ts"
ENTRY = re.compile(r'"([^"]+)":\s*\{\s*survivorHandle:\s*"([^"]+)",\s*variantId:\s*"([^"]+)"\s*\}')


def parse_map(source: str) -> dict[str, dict[str, dict[str, str]]]:
    blocks = {}
    for kind, const in (("handle", "RETIRED_PRODUCT_HANDLES"), ("id", "RETIRED_PRODUCT_IDS")):
        body = source.split(f"export const {const}", 1)[1].split("\n}\n", 1)[0]
        entries = {}
        for key, survivor, variant in ENTRY.findall(body):
            if key in entries:
                raise SystemExit(f"duplicate {kind} key {key}")
            entries[key] = {"survivor_handle": survivor, "variant_id": variant}
        blocks[kind] = entries
    return blocks


def _code(product: dict[str, Any]) -> str:
    """The shell's own SKU. Willie Winkie shells keep it as painting prefix + WW workbook code."""
    meta = product.get("metadata") or {}
    code = str(meta.get("product_code_normalized") or "").strip().upper()
    if code:
        return code
    prefix = str(meta.get("painting_prefix") or "").strip().upper()
    workbook = str(meta.get("workbook_product_code") or "").strip().upper()
    if prefix and workbook.startswith("WW-"):
        return prefix + workbook[2:]
    return ""


def _motif(product: dict[str, Any] | None) -> str:
    return str(((product or {}).get("metadata") or {}).get("motif_slug") or "").strip().lower()


def check(blocks: dict[str, dict[str, dict[str, str]]], products: list[dict[str, Any]]) -> dict[str, Any]:
    live = [p for p in products if not p.get("deleted_at")]
    by_handle = {str(p.get("handle") or "").lower(): p for p in live}
    by_id = {str(p["id"]).lower(): p for p in live}
    variant_owner = {}
    for product in live:
        for variant in product.get("variants") or []:
            if not variant.get("deleted_at"):
                variant_owner[variant["id"]] = (product, variant)
    retired_keys = set(blocks["handle"]) | set(blocks["id"])
    rows, errors = [], []
    for kind in ("handle", "id"):
        index = by_handle if kind == "handle" else by_id
        for key in sorted(blocks[kind]):
            entry = blocks[kind][key]
            shell = index.get(key)
            owner = variant_owner.get(entry["variant_id"])
            survivor, variant = owner if owner else (None, None)
            problems = []
            if shell is None:
                problems.append("retired product not found")
            elif shell.get("status") == "published":
                problems.append("retired product is still published")
            if variant is None:
                problems.append("variant not found")
            else:
                if str(survivor.get("handle") or "") != entry["survivor_handle"]:
                    problems.append(f"variant belongs to {survivor.get('handle')}")
                if survivor.get("status") != "published":
                    problems.append("survivor is not published")
                if shell is not None and str(variant.get("sku") or "").upper() != _code(shell):
                    problems.append(f"sku {variant.get('sku')} is not the retired sku {_code(shell)}")
                if shell is not None and _motif(shell) != _motif(survivor):
                    problems.append(f"motif {_motif(shell)} lands on motif {_motif(survivor)}")
            if entry["survivor_handle"].lower() in retired_keys or (survivor and str(survivor["id"]).lower() in retired_keys):
                problems.append("survivor is itself retired")
            rows.append({
                "kind": kind,
                "retired_key": key,
                "retired_product_id": shell["id"] if shell else "",
                "retired_handle": shell.get("handle") if shell else "",
                "retired_status": shell.get("status") if shell else "",
                "retired_sku": _code(shell) if shell else "",
                "retired_motif": _motif(shell),
                "survivor_motif": _motif(survivor),
                "survivor_handle": entry["survivor_handle"],
                "survivor_status": survivor.get("status") if survivor else "",
                "variant_id": entry["variant_id"],
                "variant_sku": variant.get("sku") if variant else "",
                "ok": not problems,
                "problems": problems,
            })
            errors.extend(f"{kind}:{key}: {problem}" for problem in problems)
    for kind in ("handle", "id"):
        pair = {}
        for row in rows:
            if row["kind"] == kind and row["retired_product_id"]:
                pair[row["retired_product_id"]] = row
        other = "id" if kind == "handle" else "handle"
        for row in rows:
            twin = pair.get(row["retired_product_id"]) if row["kind"] == other else None
            if twin and (twin["variant_id"], twin["survivor_handle"]) != (row["variant_id"], row["survivor_handle"]):
                errors.append(f"handle and id entries disagree for {row['retired_product_id']}")
    sku_home = {
        str(variant.get("sku") or "").upper(): product
        for product, variant in variant_owner.values()
        if product.get("status") == "published"
    }
    mapped = {row["retired_product_id"] for row in rows}
    unmapped = sorted(
        p["handle"]
        for p in live
        if p.get("status") != "published"
        and not [v for v in p.get("variants") or [] if not v.get("deleted_at")]
        and _code(p) in sku_home
        and p["id"] not in mapped
    )
    errors.extend(f"unmapped retired shell {handle}" for handle in unmapped)
    return {
        "production": "NOT_MUTATED",
        "entries": len(rows),
        "handle_entries": len(blocks["handle"]),
        "id_entries": len(blocks["id"]),
        "violations": sorted(set(errors)),
        "unmapped_retired_shells": unmapped,
        "rows": rows,
    }


def main() -> None:
    out = Path(sys.argv[1])
    inventory = export_products(connect())
    if (inventory.get("identity") or {}).get("db") != "medusa-store":
        raise SystemExit("refusing a database that is not medusa-store")
    result = check(parse_map(MAP_FILE.read_text()), inventory["products"])
    out.mkdir(parents=True, exist_ok=True)
    (out / "retired-product-redirects-v2.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=1, sort_keys=True) + "\n"
    )
    print(json.dumps({k: result[k] for k in ("entries", "handle_entries", "id_entries", "violations")}, ensure_ascii=False))
    if result["violations"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
