#!/usr/bin/env python3
"""
Build manifest of product photography from Yandex Disk.

Inventories white-background product shots and other usable imagery.
Extracts article codes from filenames for matching.

Does NOT modify backend or storefront code.
Does NOT download images — only indexes metadata via API.

Usage:
    python3 scripts/build-front-manifest.py
"""

import hashlib
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = PROJECT_ROOT / "data" / "raw" / "front"

DISK_PUBLIC_KEY = "https://disk.yandex.ru/d/MgKkDh5ZLXXfow"
BASE_API = "https://cloud-api.yandex.net/v1/disk/public/resources"

IMAGE_FOLDERS = [
    ("/WOODRIGHT/Контент /Фото на белом фоне /country ", "country-london-paris", "white_bg"),
    ("/WOODRIGHT/Контент /Фото на белом фоне /provence ", "provence", "white_bg"),
    ("/WOODRIGHT/Контент /Фото на белом фоне /Willie Winke ", "willie-winkie", "white_bg"),
    ("/WOODRIGHT/Контент /Фото на белом фоне /Стулья ", None, "white_bg"),
    ("/WOODRIGHT/Контент /Фото на белом фоне /america ", None, "white_bg"),
    ("/WOODRIGHT/Контент /Фото на белом фоне /Sweat Home ", None, "white_bg"),
    ("/WOODRIGHT/Babysecret/Oliver/Фото на белом фоне ", "oliver", "white_bg"),
    ("/WOODRIGHT/Контент /Аксессуары ", "accessories", "product_photos"),
    ("/WOODRIGHT/Контент /Шкафы ", None, "product_photos"),
    ("/WOODRIGHT/Контент /Коллекции /Oxford ", "oxford", "collection_photos"),
    ("/WOODRIGHT/Контент /Размеры ", None, "dimension_diagrams"),
]

CODE_RE = re.compile(
    r'^([a-zA-Z]{1,4}m?)-?'        # prefix (co, pv, ol, MNm, al, a...)
    r'[cC]?-?'                       # optional 'c' separator (MNm-c-)
    r'(\d{1,3})'                     # number
    r'-(\d{1,2})'                    # variant
    r'(?:-([a-zA-Z]+\d*))?'         # optional suffix (blue, grey, los, h, leona160)
    r'(?:-i(\d+))?'                  # optional image index
)

CODE_PREFIX_MAP = {
    "co": "CO",
    "pv": "PV",
    "ol": "OL",
    "pr": "PR",
    "gr": "GR",
    "mn": "MN",
    "mnm": "MNm",
    "al": "AL",
    "av": "AV",
    "ba": "BA",
    "brb": "BRB",
    "bri": "BRI",
    "fa": "FA",
    "fk": "FK",
    "in": "IN",
    "mo": "MO",
    "pa": "PA",
    "rg": "RG",
    "rl": "RL",
    "rs": "RS",
    "tb": "TB",
    "te": "TE",
    "to": "TO",
    "tw": "TW",
    "am": "AM",
    "a": "A",
    "s": "S",
    "ox": "OX",
    "sh": "SH",
    "mc": "MC",
    "lo": "LO",
    "lon": "LON",
    "ww": "WW",
}

COLLECTION_FROM_PREFIX = {
    "CO": "country-london-paris",
    "PV": "provence",
    "OL": "oliver",
    "PR": "princess-rose",
    "GR": "greenwich",
    "MN": "monchelsea",
    "MNm": "monchelsea",
    "AL": "willie-winkie",
    "AV": "willie-winkie",
    "BA": "willie-winkie",
    "BRB": "willie-winkie",
    "BRI": "willie-winkie",
    "FA": "willie-winkie",
    "FK": "willie-winkie",
    "IN": "willie-winkie",
    "MO": "willie-winkie",
    "PA": "willie-winkie",
    "RG": "willie-winkie",
    "RL": "willie-winkie",
    "RS": "willie-winkie",
    "TB": "willie-winkie",
    "TE": "willie-winkie",
    "TO": "willie-winkie",
    "TW": "willie-winkie",
    "A": "accessories",
    "OX": "oxford",
    "SH": "oxford",
    "MC": "oxford",
    "AM": None,
    "S": None,
    "LO": "country-london-paris",
    "LON": "country-london-paris",
    "WW": "willie-winkie",
}


def list_folder(path, limit=100, offset=0):
    """List files in a Yandex Disk public folder."""
    encoded = urllib.parse.quote(path)
    url = (f"{BASE_API}?public_key={urllib.parse.quote(DISK_PUBLIC_KEY)}"
           f"&path={encoded}&limit={limit}&offset={offset}")
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            data = json.loads(resp.read())
        items = data.get("_embedded", {}).get("items", [])
        total = data.get("_embedded", {}).get("total", 0)
        return items, total
    except Exception as e:
        print(f"  ERROR listing {path}: {e}", file=sys.stderr)
        return [], 0


def list_all_files(path):
    """List all files in a folder, handling pagination."""
    all_items = []
    offset = 0
    limit = 100
    while True:
        items, total = list_folder(path, limit=limit, offset=offset)
        if not items:
            break
        all_items.extend(items)
        offset += len(items)
        if offset >= total:
            break
        time.sleep(0.3)
    return all_items


def parse_filename(filename, folder_collection, folder_type):
    """Parse product code and hints from filename."""
    stem = filename.rsplit(".", 1)[0] if "." in filename else filename
    ext = filename.rsplit(".", 1)[1].lower() if "." in filename else ""

    if ext not in ("jpg", "jpeg", "png", "tif", "tiff", "webp"):
        return None

    code_match = CODE_RE.match(stem)

    product_code = None
    prefix_raw = None
    collection_hint = folder_collection
    color_hint = None
    image_index = None
    confidence = 0.2
    asset_kind = "unclassified"
    warnings = []

    if code_match:
        prefix_raw = code_match.group(1).lower()
        number = code_match.group(2)
        variant = code_match.group(3)
        suffix = code_match.group(4)
        img_idx = code_match.group(5)

        normalized_prefix = CODE_PREFIX_MAP.get(prefix_raw, prefix_raw.upper())
        product_code = f"{normalized_prefix}-{number}-{variant}"

        if suffix:
            color_words = {"blue", "grey", "white", "ivory", "oak", "dark", "light", "cream"}
            if suffix.lower() in color_words:
                color_hint = suffix.lower()
            elif suffix.lower() == "h":
                pass
            elif suffix.lower().startswith("leona"):
                color_hint = suffix

        if img_idx:
            image_index = int(img_idx)

        code_collection = COLLECTION_FROM_PREFIX.get(normalized_prefix)
        if code_collection and not collection_hint:
            collection_hint = code_collection

        if image_index == 1 or image_index is None:
            asset_kind = "product_main"
        else:
            asset_kind = "product_angle"

        if folder_type == "white_bg":
            confidence = 0.9
        elif folder_type == "product_photos":
            confidence = 0.85
        else:
            confidence = 0.7
    else:
        if folder_type == "dimension_diagrams":
            asset_kind = "dimension_diagram"
            confidence = 0.6
        elif filename.startswith("mn-color"):
            asset_kind = "color_swatch"
            collection_hint = "monchelsea"
            confidence = 0.8
        elif folder_type == "front_thumbnails":
            asset_kind = "front_thumbnail"
            confidence = 0.3
        else:
            warnings.append("no_code_extracted")

    return {
        "product_code_hint": product_code,
        "prefix_raw": prefix_raw,
        "collection_hint": collection_hint,
        "color_hint": color_hint,
        "image_index": image_index,
        "asset_kind": asset_kind,
        "confidence": confidence,
        "ext": ext,
        "warnings": warnings,
    }


def make_asset_id(folder, filename):
    raw = f"disk:{folder}:{filename}"
    return hashlib.md5(raw.encode()).hexdigest()[:12]


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    all_assets = []
    all_warnings = []
    folder_stats = {}

    print("=" * 60)
    print("Disk Product Photography Inventory")
    print("=" * 60)

    for folder_path, folder_collection, folder_type in IMAGE_FOLDERS:
        print(f"\n--- {folder_path} ---")
        items = list_all_files(folder_path)
        images = [i for i in items if i.get("mime_type", "").startswith("image/")]

        print(f"  Total items: {len(items)}, Images: {len(images)}")

        folder_assets = []
        for img in images:
            filename = img["name"]
            size = img.get("size", 0)

            parsed = parse_filename(filename, folder_collection, folder_type)
            if parsed is None:
                continue

            asset_id = make_asset_id(folder_path, filename)

            download_path = f"{folder_path}/{filename}"

            asset = {
                "asset_id": asset_id,
                "filename": filename,
                "source_ref": download_path,
                "source_folder": folder_path,
                "source_type": folder_type,
                "file_size_kb": round(size / 1024),
                "collection_hint": parsed["collection_hint"],
                "product_code_hint": parsed["product_code_hint"],
                "product_name_hint": None,
                "color_hint": parsed["color_hint"],
                "image_index": parsed["image_index"],
                "likely_asset_kind": parsed["asset_kind"],
                "confidence": parsed["confidence"],
                "notes": f"From {folder_type} folder",
                "mapping_warnings": parsed["warnings"],
            }
            folder_assets.append(asset)

            if parsed["warnings"]:
                for w in parsed["warnings"]:
                    all_warnings.append({
                        "filename": filename,
                        "folder": folder_path,
                        "warning": w,
                    })

        all_assets.extend(folder_assets)

        with_codes = sum(1 for a in folder_assets if a["product_code_hint"])
        collections = Counter(a["collection_hint"] for a in folder_assets if a["collection_hint"])

        folder_stats[folder_path] = {
            "total_images": len(images),
            "indexed": len(folder_assets),
            "with_codes": with_codes,
            "collections": dict(collections.most_common()),
            "folder_type": folder_type,
        }

        print(f"  Indexed: {len(folder_assets)}, With codes: {with_codes}")
        if collections:
            print(f"  Collections: {dict(collections.most_common(5))}")

    # Save manifest
    out_manifest = OUTPUT_DIR / "front-manifest.json"
    with open(out_manifest, "w", encoding="utf-8") as f:
        json.dump(all_assets, f, ensure_ascii=False, indent=2)
    print(f"\nWrote: {out_manifest} ({len(all_assets)} assets)")

    # Summary
    by_kind = Counter(a["likely_asset_kind"] for a in all_assets)
    by_collection = Counter(a["collection_hint"] for a in all_assets if a["collection_hint"])
    with_codes = sum(1 for a in all_assets if a["product_code_hint"])
    unique_codes = len(set(a["product_code_hint"] for a in all_assets if a["product_code_hint"]))

    summary = {
        "total_assets": len(all_assets),
        "with_product_codes": with_codes,
        "unique_product_codes": unique_codes,
        "by_asset_kind": dict(by_kind.most_common()),
        "by_collection": dict(by_collection.most_common()),
        "total_warnings": len(all_warnings),
        "per_folder": folder_stats,
    }
    out_summary = OUTPUT_DIR / "front-manifest-summary.json"
    with open(out_summary, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(f"Wrote: {out_summary}")

    out_warnings = OUTPUT_DIR / "front-manifest-warnings.json"
    with open(out_warnings, "w", encoding="utf-8") as f:
        json.dump(all_warnings, f, ensure_ascii=False, indent=2)
    print(f"Wrote: {out_warnings} ({len(all_warnings)} warnings)")

    print(f"\n{'=' * 60}")
    print(f"Total: {len(all_assets)} assets, {with_codes} with codes, {unique_codes} unique codes")
    print(f"By kind: {dict(by_kind.most_common())}")
    print(f"By collection: {dict(by_collection.most_common())}")
    print("=" * 60)


if __name__ == "__main__":
    main()
