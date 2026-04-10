"""
Preprocess raw downloaded disk assets into storefront-ready images.

Usage:
  python3 scripts/preprocess-downloaded-assets.py
  python3 scripts/preprocess-downloaded-assets.py --collection oliver
  python3 scripts/preprocess-downloaded-assets.py --collection provence
  python3 scripts/preprocess-downloaded-assets.py --force

Reads:
  data/processed/asset-manifests/disk-download-manifest.json
  data/raw/downloaded-assets/disk-download-status.json

Outputs:
  data/processed/storefront-assets/{collection}/{normalized_filename}
  data/processed/asset-manifests/processed-assets.json
  data/processed/asset-manifests/processed-assets-summary.json
  data/processed/asset-manifests/processed-assets-failures.json
"""

import argparse
import hashlib
import json
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parent.parent

MANIFEST_PATH = PROJECT_ROOT / "data" / "processed" / "asset-manifests" / "disk-download-manifest.json"
STATUS_PATH = PROJECT_ROOT / "data" / "raw" / "downloaded-assets" / "disk-download-status.json"
RAW_DIR = PROJECT_ROOT / "data" / "raw" / "downloaded-assets"
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed" / "storefront-assets"
MANIFESTS_DIR = PROJECT_ROOT / "data" / "processed" / "asset-manifests"

ROLE_CONFIG = {
    "main": {"max_dim": 1200, "quality": 85},
    "gallery": {"max_dim": 1000, "quality": 82},
    "color_variant": {"max_dim": 1000, "quality": 82},
}

MIN_OUTPUT_DIM = 200


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def process_image(src_path, dst_path, max_dim, quality):
    """Resize and optimize a single image. Returns (width, height, file_size)."""
    img = Image.open(src_path)

    if img.mode in ("RGBA", "P", "LA"):
        bg = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "P":
            img = img.convert("RGBA")
        bg.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
        img = bg
    elif img.mode != "RGB":
        img = img.convert("RGB")

    w, h = img.size
    if max(w, h) > max_dim:
        if w >= h:
            new_w = max_dim
            new_h = int(h * max_dim / w)
        else:
            new_h = max_dim
            new_w = int(w * max_dim / h)
        img = img.resize((new_w, new_h), Image.LANCZOS)
    else:
        new_w, new_h = w, h

    dst_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(dst_path, "JPEG", quality=quality, optimize=True, progressive=True)

    return new_w, new_h, dst_path.stat().st_size


def main():
    parser = argparse.ArgumentParser(description="Preprocess downloaded disk assets")
    parser.add_argument("--collection", help="Filter by collection")
    parser.add_argument("--force", action="store_true", help="Re-process even if output exists")
    args = parser.parse_args()

    with open(MANIFEST_PATH) as f:
        manifest = json.load(f)
    with open(STATUS_PATH) as f:
        status_list = json.load(f)

    downloaded_refs = set()
    raw_hashes = {}
    for s in status_list:
        if s.get("status") == "downloaded":
            downloaded_refs.add(s["source_ref"])
            raw_hashes[s["original_filename"]] = s.get("sha256", "")

    if args.collection:
        entries = [e for e in manifest if e["collection_name_normalized"] == args.collection]
    else:
        entries = list(manifest)

    entries = [e for e in entries if e["source_ref"] in downloaded_refs]

    if not entries:
        print("No entries to process.")
        return

    print(f"Processing plan: {len(entries)} entries")
    coll_counts = Counter(e["collection_name_normalized"] for e in entries)
    for c, n in coll_counts.most_common():
        print(f"  {c}: {n}")

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    MANIFESTS_DIR.mkdir(parents=True, exist_ok=True)

    records = []
    failures = []
    processed_hashes = {}

    processed_count = 0
    skipped_count = 0
    failed_count = 0
    dedup_count = 0
    total_raw_bytes = 0
    total_processed_bytes = 0

    per_coll = defaultdict(lambda: {"processed": 0, "skipped": 0, "failed": 0, "dedup": 0,
                                     "raw_bytes": 0, "processed_bytes": 0})

    for i, entry in enumerate(entries):
        coll = entry["collection_name_normalized"]
        raw_path = PROJECT_ROOT / entry["target_raw_path"]
        target_fn = entry["target_filename"]
        processed_path = PROCESSED_DIR / coll / target_fn
        role = entry["image_role"]
        config = ROLE_CONFIG.get(role, ROLE_CONFIG["gallery"])

        if not raw_path.exists():
            rec = {
                "workbook_row_key": entry["workbook_row_key"],
                "product_code_normalized": entry["product_code_normalized"],
                "canonical_name": entry["canonical_name"],
                "collection_name_normalized": coll,
                "source_raw_path": entry["target_raw_path"],
                "source_sha256": raw_hashes.get(entry["original_filename"], ""),
                "processed_path": str(processed_path.relative_to(PROJECT_ROOT)),
                "processed_filename": target_fn,
                "asset_role": role,
                "width": None,
                "height": None,
                "file_size": None,
                "processing_status": "failed",
                "processing_notes": "raw file not found",
            }
            records.append(rec)
            failures.append(rec)
            failed_count += 1
            per_coll[coll]["failed"] += 1
            continue

        if processed_path.exists() and not args.force:
            try:
                img = Image.open(processed_path)
                w, h = img.size
                fs = processed_path.stat().st_size
                img.close()
            except Exception:
                w, h, fs = None, None, 0

            rec = {
                "workbook_row_key": entry["workbook_row_key"],
                "product_code_normalized": entry["product_code_normalized"],
                "canonical_name": entry["canonical_name"],
                "collection_name_normalized": coll,
                "source_raw_path": entry["target_raw_path"],
                "source_sha256": raw_hashes.get(entry["original_filename"], ""),
                "processed_path": str(processed_path.relative_to(PROJECT_ROOT)),
                "processed_filename": target_fn,
                "asset_role": role,
                "width": w,
                "height": h,
                "file_size": fs,
                "processing_status": "skipped_existing",
                "processing_notes": "already processed",
            }
            records.append(rec)
            skipped_count += 1
            per_coll[coll]["skipped"] += 1
            if fs:
                total_processed_bytes += fs
                per_coll[coll]["processed_bytes"] += fs
            continue

        src_hash = raw_hashes.get(entry["original_filename"], "")
        raw_size = raw_path.stat().st_size
        total_raw_bytes += raw_size
        per_coll[coll]["raw_bytes"] += raw_size

        dedup_key = f"{coll}:{src_hash}:{role}"
        if src_hash and dedup_key in processed_hashes:
            ref_path = processed_hashes[dedup_key]
            try:
                import shutil
                processed_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(ref_path, processed_path)
                img = Image.open(processed_path)
                w, h = img.size
                fs = processed_path.stat().st_size
                img.close()
            except Exception as exc:
                w, h, fs = None, None, 0

            rec = {
                "workbook_row_key": entry["workbook_row_key"],
                "product_code_normalized": entry["product_code_normalized"],
                "canonical_name": entry["canonical_name"],
                "collection_name_normalized": coll,
                "source_raw_path": entry["target_raw_path"],
                "source_sha256": src_hash,
                "processed_path": str(processed_path.relative_to(PROJECT_ROOT)),
                "processed_filename": target_fn,
                "asset_role": role,
                "width": w,
                "height": h,
                "file_size": fs,
                "processing_status": "dedup_copy",
                "processing_notes": f"same source as {ref_path.name}",
            }
            records.append(rec)
            dedup_count += 1
            per_coll[coll]["dedup"] += 1
            if fs:
                total_processed_bytes += fs
                per_coll[coll]["processed_bytes"] += fs
            continue

        try:
            w, h, fs = process_image(raw_path, processed_path, config["max_dim"], config["quality"])

            notes = ""
            if max(w, h) < MIN_OUTPUT_DIM:
                notes = f"low_res: {w}x{h}"

            rec = {
                "workbook_row_key": entry["workbook_row_key"],
                "product_code_normalized": entry["product_code_normalized"],
                "canonical_name": entry["canonical_name"],
                "collection_name_normalized": coll,
                "source_raw_path": entry["target_raw_path"],
                "source_sha256": src_hash,
                "processed_path": str(processed_path.relative_to(PROJECT_ROOT)),
                "processed_filename": target_fn,
                "asset_role": role,
                "width": w,
                "height": h,
                "file_size": fs,
                "processing_status": "processed",
                "processing_notes": notes,
            }
            records.append(rec)
            processed_count += 1
            per_coll[coll]["processed"] += 1
            total_processed_bytes += fs
            per_coll[coll]["processed_bytes"] += fs

            if src_hash:
                processed_hashes[dedup_key] = processed_path

        except Exception as exc:
            rec = {
                "workbook_row_key": entry["workbook_row_key"],
                "product_code_normalized": entry["product_code_normalized"],
                "canonical_name": entry["canonical_name"],
                "collection_name_normalized": coll,
                "source_raw_path": entry["target_raw_path"],
                "source_sha256": src_hash,
                "processed_path": str(processed_path.relative_to(PROJECT_ROOT)),
                "processed_filename": target_fn,
                "asset_role": role,
                "width": None,
                "height": None,
                "file_size": None,
                "processing_status": "failed",
                "processing_notes": str(exc)[:200],
            }
            records.append(rec)
            failures.append(rec)
            failed_count += 1
            per_coll[coll]["failed"] += 1

        if (i + 1) % 50 == 0:
            print(f"  [{i+1}/{len(entries)}] processed={processed_count} skipped={skipped_count} failed={failed_count}")

    with open(MANIFESTS_DIR / "processed-assets.json", "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

    with open(MANIFESTS_DIR / "processed-assets-failures.json", "w", encoding="utf-8") as f:
        json.dump(failures, f, ensure_ascii=False, indent=2)

    role_stats = Counter(r["asset_role"] for r in records if r["processing_status"] in ("processed", "skipped_existing", "dedup_copy"))
    low_res = [r for r in records if "low_res" in (r.get("processing_notes") or "")]

    summary = {
        "total_entries": len(entries),
        "processed": processed_count,
        "skipped_existing": skipped_count,
        "dedup_copies": dedup_count,
        "failed": failed_count,
        "total_raw_bytes": total_raw_bytes,
        "total_processed_bytes": total_processed_bytes,
        "total_raw_mb": round(total_raw_bytes / 1024 / 1024, 1),
        "total_processed_mb": round(total_processed_bytes / 1024 / 1024, 1),
        "compression_ratio": round(total_processed_bytes / total_raw_bytes, 2) if total_raw_bytes else 0,
        "low_res_count": len(low_res),
        "role_breakdown": dict(role_stats),
        "per_collection": {k: dict(v) for k, v in per_coll.items()},
        "completed_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }

    with open(MANIFESTS_DIR / "processed-assets-summary.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    print(f"\n=== Processing Complete ===")
    print(f"  Processed:  {processed_count}")
    print(f"  Skipped:    {skipped_count}")
    print(f"  Dedup copy: {dedup_count}")
    print(f"  Failed:     {failed_count}")
    print(f"  Raw total:  {total_raw_bytes/1024/1024:.1f} MB")
    print(f"  Processed:  {total_processed_bytes/1024/1024:.1f} MB")
    if total_raw_bytes:
        print(f"  Compression: {total_processed_bytes/total_raw_bytes*100:.0f}%")
    if low_res:
        print(f"  Low-res:    {len(low_res)}")
    for c in sorted(per_coll):
        pc = per_coll[c]
        print(f"  {c}: processed={pc['processed']} skipped={pc['skipped']} dedup={pc['dedup']} failed={pc['failed']}")


if __name__ == "__main__":
    main()
