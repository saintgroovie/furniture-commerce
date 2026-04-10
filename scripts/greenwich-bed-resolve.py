#!/usr/bin/env python3
"""Resolve Greenwich bed entries: update image map, create bed download manifest.

Business decision confirmed: Frame/Cloud/Plane are headboard design variants,
not separate products. Each workbook bed row represents a mattress size.
All 3 design families share imagery across all 5 size entries.
"""

import json
import os
from pathlib import Path
from urllib.parse import urlparse

BASE = Path(__file__).resolve().parent.parent
IMAGE_MAP = BASE / "data/normalized/greenwich-image-map.json"
LEGACY_PRODUCTS = BASE / "data/raw/legacy/greenwich-products.json"
BED_MANIFEST = BASE / "data/processed/asset-manifests/greenwich-bed-download-manifest.json"
BED_SUMMARY = BASE / "data/processed/asset-manifests/greenwich-bed-download-summary.json"

BED_CANONICAL_PREFIX = "Кровать"
BED_CODES = {"GR-09-1", "GR-12-1", "GR-14-1", "GR-16-1", "GR-18-1"}
BED_ROW_KEYS = [
    ("greenwich:GR-09-1", "Кровать  1-сп. (90*200)", 16),
    ("greenwich:GR-12-1", "Кровать  1,5-сп. (120*200)", 17),
    ("greenwich:GR-14-1", "Кровать  1,5-сп. (140*200)", 18),
    ("greenwich:GR-16-1", "Кровать  2-сп. (160*200)", 19),
    ("greenwich:GR-18-1", "Кровать  2-сп. (180*200)", 20),
]

DESIGN_FAMILIES = {
    "frame": {
        "slug": "krovat-frame",
        "title": "Кровать Frame",
    },
    "cloud": {
        "slug": "krovat-cloud",
        "title": "Кровать Cloud",
    },
    "plane": {
        "slug": "krovat-plane",
        "title": "Кровать Plane",
    },
}


def filename_from_url(url):
    return os.path.basename(urlparse(url).path)


def detect_design_family(url, page_url=""):
    combined = (url + page_url).lower()
    if "frame" in combined or "fame" in combined:
        return "frame"
    if "cloud" in combined:
        return "cloud"
    if "plane" in combined or "wideheader" in combined:
        return "plane"
    return "unknown"


def build_shared_pool(legacy_products):
    """Build the shared visual pool from all 3 bed design family pages."""
    pool = []
    seen_urls = set()

    bed_slugs = {v["slug"] for v in DESIGN_FAMILIES.values()}

    for product in legacy_products:
        slug = product.get("category_hint", "")
        if slug not in bed_slugs:
            continue

        page_url = product["page_url"]
        title = product["product_title_raw"]

        for family_key, fam in DESIGN_FAMILIES.items():
            if fam["slug"] == slug:
                design_family = family_key
                break
        else:
            design_family = "unknown"

        main_url = product.get("main_image_url", "")
        if main_url and main_url not in seen_urls:
            seen_urls.add(main_url)
            pool.append({
                "url": main_url,
                "design_family": design_family,
                "legacy_title": title,
                "legacy_page_url": page_url,
                "original_filename": filename_from_url(main_url),
                "is_main_candidate": True,
            })

        for gurl in product.get("gallery_image_urls", []):
            if gurl not in seen_urls:
                seen_urls.add(gurl)
                pool.append({
                    "url": gurl,
                    "design_family": design_family,
                    "legacy_title": title,
                    "legacy_page_url": page_url,
                    "original_filename": filename_from_url(gurl),
                    "is_main_candidate": False,
                })

    return pool


def update_image_map(image_map, shared_pool):
    """Update bed entries in greenwich-image-map.json with resolved status."""
    frame_main = None
    for img in shared_pool:
        if img["design_family"] == "frame" and img["is_main_candidate"]:
            frame_main = img["url"]
            break

    gallery_images = []
    for img in shared_pool:
        gallery_images.append({
            "url": img["url"],
            "source_type": "legacy_site",
            "source_ref": img["url"],
            "design_family": img["design_family"],
            "asset_role": "shared_visual_pool",
            "provenance": {
                "scraped_from": img["legacy_page_url"],
                "scrape_date": "2026-03-19",
                "original_filename": img["original_filename"],
                "design_family_title": img["legacy_title"],
            },
        })

    updated_count = 0
    for entry in image_map:
        name = entry.get("canonical_name", "")
        code = entry.get("product_code_normalized", "")

        if not name.startswith(BED_CANONICAL_PREFIX):
            continue
        if code not in BED_CODES:
            continue

        entry["main_image"] = {
            "source_type": "legacy_site",
            "source_ref": frame_main,
            "is_verified": False,
            "confidence": 0.75,
            "design_family": "frame",
            "note": "Frame selected as representative main; all 3 designs available in gallery",
        }
        entry["gallery_images"] = gallery_images
        entry["mapping_status"] = "resolved_shared_visual_pool"
        entry["confidence"] = 0.75
        entry["match_basis"] = "confirmed_design_family_pool"
        entry["source_type"] = "legacy_shared_pool"
        entry["source_decision_reason"] = "business_confirmed_design_agnostic"
        entry["legacy_page_url"] = "https://woodright.ru/kollekcii/greenwich/krovat-frame/"
        entry["legacy_title_matched"] = "Кровать Frame (representative)"
        entry["review_notes"] = (
            "Business confirmed: Frame/Cloud/Plane are headboard design variants. "
            "All 3 design families pooled as shared imagery for all bed sizes. "
            "Product identity remains workbook-driven (size-based)."
        )
        updated_count += 1

    return updated_count


def build_bed_manifest(shared_pool):
    """Create download manifest for bed imagery pool."""
    manifest = []

    for idx, img in enumerate(shared_pool, start=1):
        ext = os.path.splitext(img["original_filename"])[1].lower() or ".jpg"
        target_fn = f"GR-BED-POOL_{img['design_family']}_{idx:02d}{ext}"

        manifest.append({
            "workbook_row_keys": [rk for rk, _, _ in BED_ROW_KEYS],
            "canonical_names": [cn for _, cn, _ in BED_ROW_KEYS],
            "product_codes": [c.split(":")[1] for c, _, _ in BED_ROW_KEYS],
            "source_ref": img["url"],
            "source_type": "legacy_site",
            "asset_role": "main_candidate" if img["is_main_candidate"] else "shared_visual_pool",
            "design_family_hint": img["design_family"],
            "legacy_page_url": img["legacy_page_url"],
            "legacy_title": img["legacy_title"],
            "original_filename": img["original_filename"],
            "target_filename": target_fn,
            "target_raw_path": f"data/raw/downloaded-assets/greenwich/beds/{target_fn}",
            "download_action": "fetch_url",
            "notes": (
                f"Shared pool image from {img['design_family'].title()} design family. "
                f"Used by all 5 Greenwich bed size entries."
            ),
        })

    return manifest


def main():
    with open(IMAGE_MAP) as f:
        image_map = json.load(f)
    with open(LEGACY_PRODUCTS) as f:
        legacy_products = json.load(f)

    shared_pool = build_shared_pool(legacy_products)
    print(f"Shared bed pool: {len(shared_pool)} unique images")
    for fam in ["frame", "cloud", "plane"]:
        count = sum(1 for i in shared_pool if i["design_family"] == fam)
        print(f"  {fam}: {count} images")

    updated = update_image_map(image_map, shared_pool)
    print(f"Updated {updated} bed entries in image map")

    with open(IMAGE_MAP, "w") as f:
        json.dump(image_map, f, indent=2, ensure_ascii=False)
    print(f"Wrote updated image map to {IMAGE_MAP}")

    manifest = build_bed_manifest(shared_pool)
    with open(BED_MANIFEST, "w") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    print(f"Wrote bed manifest ({len(manifest)} entries) to {BED_MANIFEST}")

    summary = {
        "generated": "2026-03-19",
        "collection": "greenwich",
        "scope": "bed_imagery_pool_only",
        "business_decision": "Frame/Cloud/Plane confirmed as headboard design variants",
        "stats": {
            "bed_workbook_rows": 5,
            "design_families": 3,
            "unique_images_in_pool": len(shared_pool),
            "frame_images": sum(1 for i in shared_pool if i["design_family"] == "frame"),
            "cloud_images": sum(1 for i in shared_pool if i["design_family"] == "cloud"),
            "plane_images": sum(1 for i in shared_pool if i["design_family"] == "plane"),
            "main_candidates": sum(1 for i in shared_pool if i["is_main_candidate"]),
            "total_manifest_entries": len(manifest),
        },
        "download_target_directory": "data/raw/downloaded-assets/greenwich/beds/",
        "naming_convention": "GR-BED-POOL_{DESIGN}_{INDEX}.{ext}",
        "keying_note": "GR-09-1 is duplicate code (mirror + bed). Compound key (workbook_row_key + canonical_name) required.",
    }
    with open(BED_SUMMARY, "w") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)
    print(f"Wrote bed summary to {BED_SUMMARY}")


if __name__ == "__main__":
    main()
