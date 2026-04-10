#!/usr/bin/env python3
"""Preprocess Greenwich raw downloaded assets into storefront-ready format.

Reads download manifests, validates images, converts to consistent format,
and produces processed output with provenance metadata.

Handles three tiers:
  1. Ready items (8 products) — legacy site images → JPEG q85
  2. Bed shared pool (23 images) — design-family variants → JPEG q85
  3. Temporary PDF items (2 products) — keep PNG, mark as temporary
"""

import hashlib
import json
import os
import shutil
from datetime import datetime
from pathlib import Path

from PIL import Image

BASE = Path(__file__).resolve().parent.parent

READY_MANIFEST = BASE / "data/processed/asset-manifests/greenwich-download-manifest.json"
BED_MANIFEST = BASE / "data/processed/asset-manifests/greenwich-bed-download-manifest.json"

RAW_DIR = BASE / "data/raw/downloaded-assets/greenwich"
RAW_BED_DIR = RAW_DIR / "beds"

OUT_DIR = BASE / "data/processed/storefront-assets/greenwich"
OUT_BED_DIR = OUT_DIR / "beds-shared"

OUT_MANIFEST = BASE / "data/processed/asset-manifests/greenwich-processed-assets.json"
OUT_SUMMARY = BASE / "data/processed/asset-manifests/greenwich-processed-summary.json"
OUT_WARNINGS = BASE / "data/processed/asset-manifests/greenwich-processed-warnings.json"

JPEG_QUALITY = 85
TIMESTAMP = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def validate_and_process(raw_path, out_path, keep_png=False):
    """Open image, validate, convert/save, return metadata dict or raise."""
    img = Image.open(raw_path)
    img.verify()
    img = Image.open(raw_path)
    w, h = img.size

    warnings = []
    if w < 400 or h < 400:
        warnings.append("low_res")
    if w > 4000 or h > 4000:
        warnings.append("oversized")

    out_path.parent.mkdir(parents=True, exist_ok=True)

    if keep_png:
        shutil.copy2(str(raw_path), str(out_path))
    else:
        rgb = img.convert("RGB") if img.mode != "RGB" else img
        rgb.save(str(out_path), "JPEG", quality=JPEG_QUALITY, optimize=True)

    out_hash = sha256_file(out_path)
    out_size = out_path.stat().st_size

    return {
        "dimensions": [w, h],
        "sha256": out_hash,
        "file_size_bytes": out_size,
        "warnings": warnings,
    }


def processed_filename_ready(entry):
    """Derive processed filename for ready items. Normalize extension."""
    raw_fn = entry["target_filename"]
    code = entry["product_code_normalized"]
    role = entry.get("image_role", "gallery")

    if entry.get("asset_readiness_status") == "temporary_pdf":
        stem = os.path.splitext(raw_fn)[0]
        name_parts = stem.split("_")
        idx = name_parts[-1] if name_parts[-1].isdigit() else "01"
        return f"{code}_temp_{role}_{idx}.png"

    stem, _ = os.path.splitext(raw_fn)
    return f"{stem}.jpg"


def processed_filename_bed(entry):
    """Derive processed filename for bed pool items."""
    raw_fn = entry["target_filename"]
    stem, _ = os.path.splitext(raw_fn)
    return f"{stem}.jpg"


def process_ready_items(manifest):
    """Process the 8 ready items + 2 temporary PDF items."""
    results = []
    warnings_list = []

    for entry in manifest:
        status = entry.get("asset_readiness_status", "ready")
        is_temp_pdf = status == "temporary_pdf"

        raw_fn = entry["target_filename"]
        raw_path = RAW_DIR / raw_fn

        if not raw_path.exists():
            w = {
                "file": raw_fn,
                "workbook_row_key": entry["workbook_row_key"],
                "warning": "raw_file_missing",
                "raw_path": str(raw_path),
            }
            warnings_list.append(w)
            continue

        proc_fn = processed_filename_ready(entry)
        out_path = OUT_DIR / proc_fn

        try:
            meta = validate_and_process(raw_path, out_path, keep_png=is_temp_pdf)
        except Exception as e:
            w = {
                "file": raw_fn,
                "workbook_row_key": entry["workbook_row_key"],
                "warning": "processing_failed",
                "error": str(e),
            }
            warnings_list.append(w)
            continue

        tier = "temporary_pdf" if is_temp_pdf else "ready"

        result = {
            "raw_source_path": str(raw_path.relative_to(BASE)),
            "processed_path": str(out_path.relative_to(BASE)),
            "processed_filename": proc_fn,
            "workbook_row_key": entry["workbook_row_key"],
            "canonical_name": entry["canonical_name"],
            "product_code_normalized": entry["product_code_normalized"],
            "original_legacy_url": entry.get("preferred_source_ref", ""),
            "image_role": entry.get("image_role", "gallery"),
            "asset_tier": tier,
            "sha256": meta["sha256"],
            "dimensions": meta["dimensions"],
            "file_size_bytes": meta["file_size_bytes"],
        }
        results.append(result)

        if meta["warnings"]:
            for ww in meta["warnings"]:
                warnings_list.append({
                    "file": proc_fn,
                    "workbook_row_key": entry["workbook_row_key"],
                    "warning": ww,
                    "dimensions": meta["dimensions"],
                })

    return results, warnings_list


def process_bed_pool(manifest):
    """Process the 23 shared bed pool images."""
    results = []
    warnings_list = []

    for entry in manifest:
        raw_fn = entry["target_filename"]
        raw_path = RAW_BED_DIR / raw_fn

        if not raw_path.exists():
            w = {
                "file": raw_fn,
                "workbook_row_keys": entry["workbook_row_keys"],
                "warning": "raw_file_missing",
                "raw_path": str(raw_path),
            }
            warnings_list.append(w)
            continue

        proc_fn = processed_filename_bed(entry)
        out_path = OUT_BED_DIR / proc_fn

        try:
            meta = validate_and_process(raw_path, out_path, keep_png=False)
        except Exception as e:
            w = {
                "file": raw_fn,
                "workbook_row_keys": entry["workbook_row_keys"],
                "warning": "processing_failed",
                "error": str(e),
            }
            warnings_list.append(w)
            continue

        result = {
            "raw_source_path": str(raw_path.relative_to(BASE)),
            "processed_path": str(out_path.relative_to(BASE)),
            "processed_filename": proc_fn,
            "workbook_row_keys": entry["workbook_row_keys"],
            "canonical_names": entry["canonical_names"],
            "product_codes": entry["product_codes"],
            "original_legacy_url": entry.get("source_ref", ""),
            "design_family_hint": entry.get("design_family_hint", "unknown"),
            "asset_role": entry.get("asset_role", "shared_visual_pool"),
            "asset_tier": "bed_shared_pool",
            "sha256": meta["sha256"],
            "dimensions": meta["dimensions"],
            "file_size_bytes": meta["file_size_bytes"],
        }
        results.append(result)

        if meta["warnings"]:
            for ww in meta["warnings"]:
                warnings_list.append({
                    "file": proc_fn,
                    "workbook_row_keys": entry["workbook_row_keys"],
                    "warning": ww,
                    "dimensions": meta["dimensions"],
                })

    return results, warnings_list


def detect_duplicates(results):
    """Find exact duplicate hashes within processed output."""
    hash_map = {}
    dupes = []
    for r in results:
        h = r["sha256"]
        if h in hash_map:
            dupes.append({
                "file_a": hash_map[h]["processed_filename"],
                "file_b": r["processed_filename"],
                "sha256": h,
                "tier_a": hash_map[h]["asset_tier"],
                "tier_b": r["asset_tier"],
            })
        else:
            hash_map[h] = r
    return dupes


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT_BED_DIR.mkdir(parents=True, exist_ok=True)

    with open(READY_MANIFEST) as f:
        ready_manifest = json.load(f)
    with open(BED_MANIFEST) as f:
        bed_manifest = json.load(f)

    print(f"Ready manifest: {len(ready_manifest)} entries")
    print(f"Bed manifest: {len(bed_manifest)} entries")
    print()

    ready_results, ready_warnings = process_ready_items(ready_manifest)
    print(f"Ready items processed: {len(ready_results)}")
    if ready_warnings:
        print(f"Ready warnings: {len(ready_warnings)}")

    bed_results, bed_warnings = process_bed_pool(bed_manifest)
    print(f"Bed pool processed: {len(bed_results)}")
    if bed_warnings:
        print(f"Bed warnings: {len(bed_warnings)}")
    print()

    all_results = ready_results + bed_results
    all_warnings = ready_warnings + bed_warnings

    duplicates = detect_duplicates(all_results)
    if duplicates:
        print(f"Duplicate files found: {len(duplicates)}")
        for d in duplicates:
            all_warnings.append({
                "warning": "duplicate_hash",
                "file_a": d["file_a"],
                "file_b": d["file_b"],
                "sha256": d["sha256"],
            })

    ready_count = sum(1 for r in all_results if r["asset_tier"] == "ready")
    bed_count = sum(1 for r in all_results if r["asset_tier"] == "bed_shared_pool")
    temp_count = sum(1 for r in all_results if r["asset_tier"] == "temporary_pdf")
    main_count = sum(1 for r in all_results if r.get("image_role") == "main")
    gallery_count = sum(1 for r in all_results if r.get("image_role") == "gallery")
    total_bytes = sum(r["file_size_bytes"] for r in all_results)

    unique_ready_products = set()
    for r in all_results:
        if r["asset_tier"] == "ready":
            unique_ready_products.add(r["workbook_row_key"])
    unique_temp_products = set()
    for r in all_results:
        if r["asset_tier"] == "temporary_pdf":
            unique_temp_products.add(r["workbook_row_key"])

    summary = {
        "generated": TIMESTAMP,
        "collection": "greenwich",
        "stats": {
            "total_processed": len(all_results),
            "ready_assets": ready_count,
            "bed_shared_pool_assets": bed_count,
            "temporary_pdf_assets": temp_count,
            "main_images": main_count,
            "gallery_images": gallery_count,
            "unique_ready_products": len(unique_ready_products),
            "unique_temp_products": len(unique_temp_products),
            "bed_products_covered": 5,
            "total_products_covered": len(unique_ready_products) + len(unique_temp_products) + 5,
            "total_file_size_bytes": total_bytes,
            "total_file_size_mb": round(total_bytes / (1024 * 1024), 2),
            "warnings_count": len(all_warnings),
            "duplicate_hashes": len(duplicates),
        },
        "output_directories": {
            "ready_items": str(OUT_DIR.relative_to(BASE)),
            "bed_shared_pool": str(OUT_BED_DIR.relative_to(BASE)),
        },
        "temporary_pdf_products": [
            {"workbook_row_key": "greenwich:GR-09-1", "canonical_name": "Зеркало навесное"},
            {"workbook_row_key": "greenwich:GR-42-1", "canonical_name": "Тумба ТВ"},
        ],
    }

    with open(OUT_MANIFEST, "w") as f:
        json.dump(all_results, f, indent=2, ensure_ascii=False)
    print(f"Wrote processed manifest: {OUT_MANIFEST.name} ({len(all_results)} entries)")

    with open(OUT_SUMMARY, "w") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)
    print(f"Wrote processed summary: {OUT_SUMMARY.name}")

    with open(OUT_WARNINGS, "w") as f:
        json.dump(all_warnings, f, indent=2, ensure_ascii=False)
    print(f"Wrote warnings: {OUT_WARNINGS.name} ({len(all_warnings)} entries)")

    print()
    print("=== Greenwich Preprocess Summary ===")
    print(f"Total processed files: {len(all_results)}")
    print(f"  Ready (8 products):    {ready_count}")
    print(f"  Bed shared pool:       {bed_count}")
    print(f"  Temporary PDF:         {temp_count}")
    print(f"  Main images:           {main_count}")
    print(f"  Gallery images:        {gallery_count}")
    print(f"Total size:              {summary['stats']['total_file_size_mb']} MB")
    print(f"Warnings:                {len(all_warnings)}")
    print(f"Duplicates:              {len(duplicates)}")


if __name__ == "__main__":
    main()
