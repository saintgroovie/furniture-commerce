"""
Build a download manifest for confirmed disk-backed product images.

Reads:
  - data/normalized/production-subset-skeleton.json  (confirmed products)
  - data/raw/front/front-manifest.json               (all disk assets)
  - data/normalized/image-map.after-front.json        (image map with preferred refs)

Outputs:
  - data/processed/asset-manifests/disk-download-manifest.json
  - data/processed/asset-manifests/disk-download-summary.json
"""

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent

SUBSET_PATH = PROJECT_ROOT / "data" / "normalized" / "production-subset-skeleton.json"
FRONT_MANIFEST = PROJECT_ROOT / "data" / "raw" / "front" / "front-manifest.json"
IMAGE_MAP = PROJECT_ROOT / "data" / "normalized" / "image-map.after-front.json"

OUTPUT_DIR = PROJECT_ROOT / "data" / "processed" / "asset-manifests"
RAW_DIR = PROJECT_ROOT / "data" / "raw" / "downloaded-assets"
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed" / "storefront-assets"

PRIORITY_COLLECTIONS = ["oliver", "provence", "country-london-paris", "monchelsea"]

COLOR_RE = re.compile(
    r"^[a-z]{2,3}-\d+-\d+-([a-z]+(?:-[a-z]+)*)-(?:i\d+|\d{3}(?:-hd)?(?:-i\d+)?)",
    re.IGNORECASE,
)
INDEX_RE = re.compile(r"-i(\d+)(?:\.\w+)?$", re.IGNORECASE)
COLOR_SUFFIX_RE = re.compile(r"-(\d{3})(?:-hd)?(?:-i\d+)?(?:\.\w+)?$", re.IGNORECASE)


def normalize_code(code):
    if not code:
        return ""
    return code.upper().strip()


def parse_role(filename, is_preferred_main):
    """Determine image role from filename and preferred status."""
    fn = filename.lower()
    idx_m = INDEX_RE.search(fn)
    idx = int(idx_m.group(1)) if idx_m else None

    color_m = COLOR_RE.match(fn.rsplit(".", 1)[0] if "." in fn else fn)
    color_hint = color_m.group(1) if color_m else None

    if color_hint:
        return "color_variant", color_hint, idx

    if is_preferred_main:
        return "main", None, idx

    if idx is not None and idx == 1:
        return "gallery", None, idx

    return "gallery", None, idx


def build_target_filename(code, role, color_hint, gallery_idx, ext):
    """Generate normalized target filename."""
    code_upper = code.upper()
    if role == "main":
        return f"{code_upper}_main{ext}"
    elif role == "color_variant" and color_hint:
        suffix = f"_{gallery_idx:02d}" if gallery_idx else ""
        return f"{code_upper}_color_{color_hint}{suffix}{ext}"
    else:
        idx_str = f"_{gallery_idx:02d}" if gallery_idx else ""
        return f"{code_upper}_gallery{idx_str}{ext}"


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    with open(SUBSET_PATH) as f:
        subset = json.load(f)
    with open(FRONT_MANIFEST) as f:
        front = json.load(f)
    with open(IMAGE_MAP) as f:
        imap = json.load(f)

    subset_codes = {}
    for item in subset:
        code = normalize_code(item.get("product_code_normalized", ""))
        coll = item.get("collection_name_normalized", "")
        if code:
            subset_codes[code] = {
                "workbook_row_key": item["workbook_row_key"],
                "canonical_name": item.get("canonical_name", ""),
                "collection": coll,
                "has_disk_preferred": (item.get("preferred_image_source") or {}).get("type") == "disk_white_bg",
            }

    imap_by_key = {}
    for e in imap:
        imap_by_key[e["workbook_row_key"]] = e

    preferred_refs = set()
    for e in imap:
        pmi = e.get("preferred_main_image")
        if pmi and isinstance(pmi, dict):
            preferred_refs.add(pmi.get("source_ref", ""))

    assets_by_code = defaultdict(list)
    for asset in front:
        code = normalize_code(asset.get("product_code_hint", ""))
        if code:
            assets_by_code[code].append(asset)

    # Debug: verify preferred_refs overlap with front source_refs
    front_refs = set(a.get("source_ref", "") for a in front)
    overlap = preferred_refs & front_refs
    print(f"Preferred refs matching front manifest: {len(overlap)}/{len(preferred_refs)}")

    manifest = []
    warnings = []
    stats = Counter()

    for code, info in sorted(subset_codes.items()):
        coll = info["collection"]
        if coll not in PRIORITY_COLLECTIONS:
            stats["skipped_non_priority_collection"] += 1
            continue

        disk_assets = assets_by_code.get(code, [])
        if not disk_assets:
            stats["no_disk_assets"] += 1
            continue

        stats[f"products_{coll}"] += 1

        gallery_counter = Counter()

        for asset in disk_assets:
            filename = asset.get("filename", "")
            source_ref = asset.get("source_ref", "")
            ext = Path(filename).suffix.lower() or ".jpg"

            is_pref = source_ref in preferred_refs
            role, color_hint, img_idx = parse_role(filename, is_pref)

            if role == "gallery":
                gallery_counter[code] += 1
                gidx = gallery_counter[code]
            elif role == "color_variant":
                gallery_counter[(code, color_hint)] += 1
                gidx = gallery_counter[(code, color_hint)]
            else:
                gidx = None

            target_fn = build_target_filename(code, role, color_hint, gidx, ext)
            raw_path = f"data/raw/downloaded-assets/{coll}/{filename}"
            processed_path = f"data/processed/storefront-assets/{coll}/{target_fn}"

            entry = {
                "workbook_row_key": info["workbook_row_key"],
                "product_code_normalized": code,
                "canonical_name": info["canonical_name"],
                "collection_name_normalized": coll,
                "original_filename": filename,
                "source_ref": source_ref,
                "source_folder": asset.get("source_folder", ""),
                "file_size_kb": asset.get("file_size_kb"),
                "is_preferred_main": is_pref,
                "image_role": role,
                "color_hint": color_hint,
                "target_filename": target_fn,
                "target_raw_path": raw_path,
                "target_processed_path": processed_path,
                "download_status": "planned",
            }
            manifest.append(entry)
            stats[f"files_{coll}"] += 1
            stats["total_files"] += 1

    manifest.sort(key=lambda x: (x["collection_name_normalized"], x["product_code_normalized"], x["image_role"]))

    with open(OUTPUT_DIR / "disk-download-manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    coll_breakdown = defaultdict(lambda: {"products": 0, "files": 0, "main": 0, "gallery": 0, "color": 0})
    products_seen = set()
    for entry in manifest:
        coll = entry["collection_name_normalized"]
        code = entry["product_code_normalized"]
        if (coll, code) not in products_seen:
            coll_breakdown[coll]["products"] += 1
            products_seen.add((coll, code))
        coll_breakdown[coll]["files"] += 1
        if entry["image_role"] == "main":
            coll_breakdown[coll]["main"] += 1
        elif entry["image_role"] == "color_variant":
            coll_breakdown[coll]["color"] += 1
        else:
            coll_breakdown[coll]["gallery"] += 1

    summary = {
        "total_files": stats["total_files"],
        "total_products": len(products_seen),
        "priority_collections": PRIORITY_COLLECTIONS,
        "per_collection": dict(coll_breakdown),
        "skipped_non_priority": stats.get("skipped_non_priority_collection", 0),
        "products_without_disk_assets": stats.get("no_disk_assets", 0),
        "estimated_download_size_mb": round(stats["total_files"] * 0.3, 1),
    }

    with open(OUTPUT_DIR / "disk-download-summary.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    print(f"Manifest: {len(manifest)} entries")
    print(f"Products: {len(products_seen)}")
    print(f"Est. download: ~{summary['estimated_download_size_mb']} MB")
    print()
    for coll in PRIORITY_COLLECTIONS:
        bd = coll_breakdown.get(coll, {})
        print(f"  {coll:25s} products={bd.get('products',0):3d}  files={bd.get('files',0):3d}  main={bd.get('main',0)}  gallery={bd.get('gallery',0)}  color={bd.get('color',0)}")
    print(f"\n  Skipped (non-priority): {stats.get('skipped_non_priority_collection',0)} products")
    print(f"  No disk assets: {stats.get('no_disk_assets',0)} products")


if __name__ == "__main__":
    main()
