#!/usr/bin/env python3
"""Generate Greenwich asset download manifest from greenwich-image-map.json.

Includes only production-ready items (verified / high_confidence).
PDF-only items are included separately with temporary status.
Beds (fuzzy) are excluded entirely.
"""

import json
import os
from pathlib import Path
from urllib.parse import urlparse

BASE = Path(__file__).resolve().parent.parent
IMAGE_MAP = BASE / "data/normalized/greenwich-image-map.json"
OUT_MANIFEST = BASE / "data/processed/asset-manifests/greenwich-download-manifest.json"
OUT_SUMMARY = BASE / "data/processed/asset-manifests/greenwich-download-summary.json"

PRODUCTION_READY_CODES = {
    "GR-05-1", "GR-26-1", "GR-44-1", "GR-67-1",
    "GR-02-1", "GR-02-2", "GR-08-1", "GR-08-2",
}
PDF_ONLY_CODES_NAMES = {
    ("GR-09-1", "Зеркало навесное"),
    ("GR-42-1", "Тумба ТВ"),
}
BED_NAMES_PREFIX = "Кровать"


def filename_from_url(url):
    return os.path.basename(urlparse(url).path)


def target_filename(code, role, index, original):
    ext = os.path.splitext(original)[1].lower()
    if not ext:
        ext = ".jpg"
    return f"{code}_{role}_{index:02d}{ext}"


def is_bed(entry):
    return entry.get("canonical_name", "").startswith(BED_NAMES_PREFIX)


def is_pdf_only(entry):
    key = (entry["product_code_normalized"], entry["canonical_name"])
    return key in PDF_ONLY_CODES_NAMES


def is_production_ready(entry):
    code = entry["product_code_normalized"]
    if code in PRODUCTION_READY_CODES and not is_bed(entry):
        return True
    return False


def build_manifest():
    with open(IMAGE_MAP) as f:
        image_map = json.load(f)

    manifest = []
    stats = {
        "production_ready_items": 0,
        "pdf_temporary_items": 0,
        "excluded_beds": 0,
        "total_main_images": 0,
        "total_gallery_images": 0,
        "total_download_urls": 0,
        "local_pdf_copies": 0,
    }

    for entry in image_map:
        code = entry["product_code_normalized"]
        name = entry["canonical_name"]
        row_key = entry["workbook_row_key"]
        main = entry.get("main_image", {})
        gallery = entry.get("gallery_images", [])
        status = entry.get("mapping_status", "")

        if is_bed(entry):
            stats["excluded_beds"] += 1
            continue

        if is_pdf_only(entry):
            stats["pdf_temporary_items"] += 1
            src_ref = main.get("source_ref", "")
            orig = os.path.basename(src_ref)
            tgt = target_filename(code, "main", 1, orig)

            manifest.append({
                "workbook_row_key": row_key,
                "canonical_name": name,
                "product_code_normalized": code,
                "preferred_source_type": "pdf_embedded",
                "preferred_source_ref": src_ref,
                "fallback_source_ref": None,
                "target_filename": tgt,
                "target_raw_path": f"data/raw/downloaded-assets/greenwich/{tgt}",
                "asset_readiness_status": "temporary_pdf",
                "image_role": "main",
                "download_action": "copy_local",
            })
            stats["local_pdf_copies"] += 1
            continue

        if not is_production_ready(entry):
            continue

        stats["production_ready_items"] += 1

        src_type = main.get("source_type", "")
        src_ref = main.get("source_ref", "")

        if src_type == "legacy_site":
            orig = filename_from_url(src_ref)
            tgt = target_filename(code, "main", 1, orig)
            manifest.append({
                "workbook_row_key": row_key,
                "canonical_name": name,
                "product_code_normalized": code,
                "preferred_source_type": "legacy_site",
                "preferred_source_ref": src_ref,
                "fallback_source_ref": None,
                "target_filename": tgt,
                "target_raw_path": f"data/raw/downloaded-assets/greenwich/{tgt}",
                "asset_readiness_status": "ready",
                "image_role": "main",
                "download_action": "fetch_url",
            })
            stats["total_main_images"] += 1
            stats["total_download_urls"] += 1
        elif src_type == "pdf_embedded":
            orig = os.path.basename(src_ref)
            tgt = target_filename(code, "main", 1, orig)
            manifest.append({
                "workbook_row_key": row_key,
                "canonical_name": name,
                "product_code_normalized": code,
                "preferred_source_type": "pdf_embedded",
                "preferred_source_ref": src_ref,
                "fallback_source_ref": None,
                "target_filename": tgt,
                "target_raw_path": f"data/raw/downloaded-assets/greenwich/{tgt}",
                "asset_readiness_status": "ready",
                "image_role": "main",
                "download_action": "copy_local",
            })
            stats["total_main_images"] += 1
            stats["local_pdf_copies"] += 1

        for idx, img in enumerate(gallery, start=1):
            url = img.get("url", "")
            orig = filename_from_url(url)
            tgt = target_filename(code, "gallery", idx, orig)
            manifest.append({
                "workbook_row_key": row_key,
                "canonical_name": name,
                "product_code_normalized": code,
                "preferred_source_type": "legacy_site",
                "preferred_source_ref": url,
                "fallback_source_ref": None,
                "target_filename": tgt,
                "target_raw_path": f"data/raw/downloaded-assets/greenwich/{tgt}",
                "asset_readiness_status": "ready",
                "image_role": "gallery",
                "download_action": "fetch_url",
            })
            stats["total_gallery_images"] += 1
            stats["total_download_urls"] += 1

    with open(OUT_MANIFEST, "w") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    summary = {
        "generated": "2026-03-19",
        "collection": "greenwich",
        "scope": "production_ready_subset_only",
        "stats": stats,
        "total_manifest_entries": len(manifest),
        "excluded_items": {
            "beds_blocked_by_design_decision": stats["excluded_beds"],
            "bed_codes": ["GR-09-1 (bed)", "GR-12-1", "GR-14-1", "GR-16-1", "GR-18-1"],
        },
        "pdf_temporary_items": {
            "count": stats["pdf_temporary_items"],
            "items": ["GR-09-1 (Зеркало навесное)", "GR-42-1 (Тумба ТВ)"],
            "note": "PDF images accepted as temporary fallback; not mixed with legacy/disk preferred assets",
        },
        "download_target_directory": "data/raw/downloaded-assets/greenwich/",
        "naming_convention": "{CODE}_{ROLE}_{INDEX}.{ext}",
    }

    with open(OUT_SUMMARY, "w") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)

    return manifest, summary


if __name__ == "__main__":
    manifest, summary = build_manifest()
    print(f"Manifest: {len(manifest)} entries written to {OUT_MANIFEST}")
    print(f"Summary written to {OUT_SUMMARY}")
    print(f"  Production-ready items: {summary['stats']['production_ready_items']}")
    print(f"  PDF temporary items: {summary['stats']['pdf_temporary_items']}")
    print(f"  Excluded beds: {summary['stats']['excluded_beds']}")
    print(f"  Total URLs to download: {summary['stats']['total_download_urls']}")
    print(f"  Local PDF copies: {summary['stats']['local_pdf_copies']}")
