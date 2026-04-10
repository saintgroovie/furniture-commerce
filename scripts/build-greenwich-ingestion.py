#!/usr/bin/env python3
"""Build Greenwich ingestion data files from workbook + processed assets.

Generates:
  - data/normalized/greenwich-ingestion.json (product data)
  - data/normalized/greenwich-assets-ingestion.json (asset references)
"""

import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent

WORKBOOK = BASE / "data/raw/workbook/parsed-sheets.json"
PROCESSED = BASE / "data/processed/asset-manifests/greenwich-processed-assets.json"

OUT_INGESTION = BASE / "data/normalized/greenwich-ingestion.json"
OUT_ASSETS = BASE / "data/normalized/greenwich-assets-ingestion.json"

ASSET_URL_PREFIX = "products/greenwich"
COLLECTION_LABEL = "Greenwich"

CATEGORY_MAP = {
    "mirror": {"handle": "zerkala", "name": "зеркала"},
    "dresser": {"handle": "komody", "name": "комоды"},
    "console": {"handle": "konsoli", "name": "консоли"},
    "table": {"handle": "stoly", "name": "столы"},
    "nightstand": {"handle": "tumby", "name": "тумбы"},
    "wardrobe": {"handle": "shkafy", "name": "шкафы"},
    "bed": {"handle": "krovati", "name": "кровати"},
}

BED_CODES = {"GR-09-1", "GR-12-1", "GR-14-1", "GR-16-1", "GR-18-1"}
BED_ROW_INDICES = {16, 17, 18, 19, 20}


def _normalize_title(raw: str) -> str:
    """Clean workbook title artifacts: NBSP, multi-spaces, * → ×."""
    import re
    s = raw.replace("\u00A0", " ")
    s = re.sub(r"\s{2,}", " ", s)
    s = re.sub(r"(\d)\*(\d)", r"\1×\2", s)
    return s.strip()


def make_handle(row):
    """Generate unique Medusa handle from workbook row."""
    code = row["product_code_normalized"].lower()
    ri = row["row_index"]

    if code == "gr-09-1":
        if ri == 6:
            return f"greenwich-{code}-mirror"
        else:
            size = ""
            name = row["product_name_canonical"]
            if "90" in name:
                size = "90"
            elif "120" in name:
                size = "120"
            elif "140" in name:
                size = "140"
            elif "160" in name:
                size = "160"
            elif "180" in name:
                size = "180"
            return f"greenwich-{code}-bed-{size}" if size else f"greenwich-{code}-bed"

    if row["row_index"] in BED_ROW_INDICES and code != "gr-09-1":
        name = row["product_name_canonical"]
        if "120" in name:
            return f"greenwich-{code}"
        if "140" in name:
            return f"greenwich-{code}"
        if "160" in name:
            return f"greenwich-{code}"
        if "180" in name:
            return f"greenwich-{code}"

    return f"greenwich-{code}"


def make_sku(row):
    """Generate unique SKU."""
    code = row["product_code_normalized"]
    if code == "GR-09-1" and row["row_index"] == 6:
        return "GR-09-1-M"
    return code


def is_bed(row):
    return row["row_index"] in BED_ROW_INDICES and row["category_normalized"] == "bed"


def build_product_entry(row, assets_by_key, bed_pool_assets):
    """Build a single product ingestion entry."""
    code = row["product_code_normalized"]
    rk = f"greenwich:{code}"
    ri = row["row_index"]
    handle = make_handle(row)
    sku = make_sku(row)
    cat = row["category_normalized"]

    clean_title = _normalize_title(row["product_name_canonical"])

    product = {
        "workbook_row_key": rk,
        "workbook_row_index": ri,
        "product_code_normalized": code,
        "canonical_name": row["product_name_canonical"],
        "collection": "greenwich",
        "collection_label": COLLECTION_LABEL,
        "handle": handle,
        "sku": sku,
        "title": clean_title,
        "description": f"Greenwich — {clean_title}",
        "category_handle": CATEGORY_MAP.get(cat, {}).get("handle", cat),
        "category_name": CATEGORY_MAP.get(cat, {}).get("name", cat),
        "product_type": "STANDARD",
        "price_rub": row["price_normalized"],
        "price_kopeks": int(row["price_normalized"] * 100),
        "currency_code": "rub",
        "dimensions": row.get("dimensions_normalized"),
        "status": "published",
    }

    product_assets = assets_by_key.get(rk, [])

    if is_bed(row):
        main_asset = next(
            (a for a in bed_pool_assets if "frame_01" in a.get("processed_filename", "")),
            None,
        )
        thumbnail_key = (
            f"{ASSET_URL_PREFIX}/beds-shared/{main_asset['processed_filename']}"
            if main_asset
            else None
        )
        gallery_keys = [
            f"{ASSET_URL_PREFIX}/beds-shared/{a['processed_filename']}"
            for a in bed_pool_assets
        ]
        asset_tier = "bed_shared_pool"
        asset_quality = "ok"
    else:
        main_assets = [a for a in product_assets if a.get("image_role") == "main"]
        gallery_assets = [a for a in product_assets if a.get("image_role") == "gallery"]
        tier = product_assets[0]["asset_tier"] if product_assets else "missing"

        thumbnail_key = (
            f"{ASSET_URL_PREFIX}/{main_assets[0]['processed_filename']}"
            if main_assets
            else None
        )
        gallery_keys = [
            f"{ASSET_URL_PREFIX}/{a['processed_filename']}" for a in gallery_assets
        ]
        asset_tier = tier
        asset_quality = "temporary_pdf" if tier == "temporary_pdf" else "ok"

    product["thumbnail_storage_key"] = thumbnail_key
    product["gallery_storage_keys"] = gallery_keys
    product["asset_tier"] = asset_tier
    product["asset_quality"] = asset_quality
    product["images_count"] = (1 if thumbnail_key else 0) + len(gallery_keys)

    if is_bed(row):
        product["display_group"] = "greenwich-bed"
        product["display_group_title"] = "Кровать"
        size_order = {"90": 1, "120": 2, "140": 3, "160": 4, "180": 5}
        name = row["product_name_canonical"]
        sort = next((v for k, v in size_order.items() if k in name), 99)
        product["display_group_sort"] = sort

    return product


def build_asset_entries(products):
    """Build per-asset ingestion entries for all products."""
    entries = []
    for p in products:
        if p["thumbnail_storage_key"]:
            entries.append({
                "product_handle": p["handle"],
                "product_code": p["product_code_normalized"],
                "workbook_row_key": p["workbook_row_key"],
                "storage_key": p["thumbnail_storage_key"],
                "role": "thumbnail",
                "asset_tier": p["asset_tier"],
                "asset_quality": p["asset_quality"],
            })
        for gk in p["gallery_storage_keys"]:
            entries.append({
                "product_handle": p["handle"],
                "product_code": p["product_code_normalized"],
                "workbook_row_key": p["workbook_row_key"],
                "storage_key": gk,
                "role": "gallery",
                "asset_tier": p["asset_tier"],
                "asset_quality": p["asset_quality"],
            })
    return entries


def main():
    with open(WORKBOOK) as f:
        all_rows = json.load(f)
    with open(PROCESSED) as f:
        processed = json.load(f)

    greenwich_rows = [
        r for r in all_rows
        if r.get("collection_name_normalized", "").lower() == "greenwich"
    ]
    print(f"Greenwich workbook rows: {len(greenwich_rows)}")

    assets_by_key = defaultdict(list)
    bed_pool_assets = []
    for a in processed:
        if a.get("asset_tier") == "bed_shared_pool":
            bed_pool_assets.append(a)
        else:
            rk = a.get("workbook_row_key", "")
            if rk:
                assets_by_key[rk].append(a)

    print(f"Processed assets: {len(processed)} total, {len(bed_pool_assets)} bed pool")

    products = []
    for row in greenwich_rows:
        p = build_product_entry(row, assets_by_key, bed_pool_assets)
        products.append(p)

    with open(OUT_INGESTION, "w") as f:
        json.dump(products, f, indent=2, ensure_ascii=False)
    print(f"Wrote {OUT_INGESTION.name}: {len(products)} products")

    asset_entries = build_asset_entries(products)
    with open(OUT_ASSETS, "w") as f:
        json.dump(asset_entries, f, indent=2, ensure_ascii=False)
    print(f"Wrote {OUT_ASSETS.name}: {len(asset_entries)} asset references")

    categories_needed = set()
    for p in products:
        categories_needed.add((p["category_handle"], p["category_name"]))
    print(f"\nCategories needed: {len(categories_needed)}")
    for h, n in sorted(categories_needed):
        existing = h in {"stoly", "tumby", "shkafy", "stulya"}
        print(f"  {h} ({n}) {'— EXISTS' if existing else '— NEW'}")

    tiers = defaultdict(int)
    for p in products:
        tiers[p["asset_tier"]] += 1
    print(f"\nAsset tiers:")
    for t, c in sorted(tiers.items()):
        print(f"  {t}: {c}")

    total_images = sum(p["images_count"] for p in products)
    print(f"\nTotal image references: {total_images}")
    print(f"Unique products: {len(products)}")
    print(f"Unique handles: {len(set(p['handle'] for p in products))}")
    print(f"Unique SKUs: {len(set(p['sku'] for p in products))}")


if __name__ == "__main__":
    main()
