#!/usr/bin/env python3
"""
Build asset manifest and review queues from parsed workbook data
and known asset source inventories.

This is a data-preparation step only — does NOT modify backend or storefront.

Usage:
    python3 scripts/build-asset-manifest.py

Output:
    data/raw/assets/asset-manifest.json
    data/raw/assets/asset-manifest-summary.json
    data/normalized/image-map-skeleton.json
    data/normalized/unresolved-image-matches.json
"""

import json
import hashlib
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
PARSED = PROJECT_ROOT / "data" / "raw" / "workbook" / "parsed-sheets.json"
ASSETS_DIR = PROJECT_ROOT / "data" / "raw" / "assets"
NORM_DIR = PROJECT_ROOT / "data" / "normalized"

# -----------------------------------------------------------------------
# Known Yandex Disk PDF catalogs  (from yandex-disk-audit.md)
# -----------------------------------------------------------------------
PDF_CATALOGS = {
    "oliver": ["Oliver.pdf", "Oliver-full.pdf", "Oliver-oak.pdf"],
    "greenwich": ["Greenwich.pdf"],
    "willie-winkie": [
        "Willie Winkie.pdf",
        "Albion.pdf", "Ant's Village.pdf", "Ballet.pdf",
        "Brigantine Blue.pdf", "Brigantine Ivory.pdf",
        "Fairies.pdf", "Fantasy kingdom.pdf", "Infanta.pdf",
        "Molly.pdf", "Pastoral.pdf", "Princess Rose.pdf",
        "Royal Guardsmen.pdf", "Royal Lilies.pdf",
        "Rural Scenery.pdf", "Teddy Bear.pdf", "Templars.pdf",
        "Tiggy-Winkle.pdf", "Tommy.pdf",
    ],
    "oxford": ["Oxford.pdf", "Oxford_full.pdf"],
    "provence": ["Provence White.pdf", "Provence Dark.pdf"],
    "princess-rose": ["Princess Rose.pdf"],
    "country-london-paris": ["Country.pdf", "London.pdf"],
    "monchelsea": ["Monchelsea.pdf"],
}

# Known Front folder files  (from yandex-disk-audit.md)
FRONT_FILES = [
    "G503-pvw.jpg", "L386.jpg", "R765-pvs.jpg", "R765-mn-big.jpg",
    "f398.jpg", "f405.jpg", "f464.jpg", "g396.jpg", "h356.jpg",
    "h393.jpg", "j453.jpg", "k427.jpg", "m477.jpg",
    "mn-color-1.jpg", "mn-color-2.jpg", "mn-color-2-big.jpg",
    "mn-color-3-big.jpg", "mn-color-3.jpg", "s444.jpg",
]

# Legacy site collection URLs  (from legacy-site-audit.md)
LEGACY_COLLECTIONS = {
    "oliver": "https://woodright.ru/oliver/",
    "greenwich": "https://woodright.ru/greenwich/",
    "oxford": "https://woodright.ru/oxford/",
    "provence": "https://woodright.ru/provence/",
    "princess-rose": "https://woodright.ru/princess-rose/",
    "monchelsea": "https://woodright.ru/monchelsea/",
    "country-london-paris": "https://woodright.ru/country/",
}

# VV painting → legacy URL  (from legacy-site-audit.md)
VV_PAINTING_URLS = {
    "SH": "https://woodright.ru/sweet-home/",
    "AL": "https://woodright.ru/albion/",
    "RS": "https://woodright.ru/rural-scenery/",
    "TE": "https://woodright.ru/templars/",
    "IN": "https://woodright.ru/infanta/",
    "RL": "https://woodright.ru/royal-lilies/",
    "TB": "https://woodright.ru/teddy-bear/",
    "AV": "https://woodright.ru/ants-village/",
    "BRB": "https://woodright.ru/brigantine-blue/",
    "BRI": "https://woodright.ru/briganrine-ivory/",
    "FA": "https://woodright.ru/fairies/",
    "FK": "https://woodright.ru/fantasy-kingdom/",
    "RG": "https://woodright.ru/royal-guardsmen/",
    "TW": "https://woodright.ru/tiggy-winkle/",
    "PA": "https://woodright.ru/pastoral/",
    "BA": "https://woodright.ru/ballet/",
    "MO": "https://woodright.ru/tommy/",
    "SC": "https://woodright.ru/alice/",
}

LEGACY_ROOM_URLS = {
    "kids": "https://woodright.ru/komnaty/detskie/",
    "bedroom": "https://woodright.ru/komnaty/spalni/",
    "living_room": "https://woodright.ru/komnaty/gostinye/",
    "office": "https://woodright.ru/komnaty/kabinety/",
}


def make_id(*parts):
    raw = ":".join(str(p) for p in parts if p)
    return hashlib.md5(raw.encode()).hexdigest()[:12]


def build_pdf_assets():
    """Create asset records for all known PDF catalogs."""
    assets = []
    for coll, pdfs in PDF_CATALOGS.items():
        for pdf_name in pdfs:
            assets.append({
                "asset_id": make_id("pdf", coll, pdf_name),
                "source_type": "pdf_catalog",
                "source_ref": f"/Каталоги/{pdf_name}",
                "collection_hint": coll,
                "product_code_hint": None,
                "product_name_hint": None,
                "room_hint": None,
                "asset_kind": "catalog_page",
                "file_ext": "pdf",
                "is_verified": True,
                "confidence": 1.0,
                "notes": f"PDF catalog for {coll}. Pages not yet extracted to individual images.",
                "mapping_warnings": [],
            })
    return assets


def build_front_assets():
    """Create asset records for Front folder files."""
    assets = []
    for fname in FRONT_FILES:
        is_color = fname.startswith("mn-color")
        is_mn = "mn" in fname.lower() or "R765-mn" in fname

        kind = "color_swatch" if is_color else "unknown"
        coll_hint = "monchelsea" if is_mn else None
        confidence = 0.8 if is_color else 0.2

        warnings = []
        if not is_color and not is_mn:
            warnings.append("unmapped_front_image")

        assets.append({
            "asset_id": make_id("front", fname),
            "source_type": "front_folder",
            "source_ref": f"/Front/{fname}",
            "collection_hint": coll_hint,
            "product_code_hint": None,
            "product_name_hint": None,
            "room_hint": None,
            "asset_kind": kind,
            "file_ext": fname.rsplit(".", 1)[-1] if "." in fname else "unknown",
            "is_verified": is_color,
            "confidence": confidence,
            "notes": "Color swatch" if is_color else "Internal code, no workbook mapping known",
            "mapping_warnings": warnings,
        })
    return assets


def build_legacy_collection_assets():
    """Create placeholder asset records for legacy site collections."""
    assets = []
    for coll, url in LEGACY_COLLECTIONS.items():
        assets.append({
            "asset_id": make_id("legacy_coll", coll),
            "source_type": "legacy_site",
            "source_ref": url,
            "collection_hint": coll,
            "product_code_hint": None,
            "product_name_hint": None,
            "room_hint": None,
            "asset_kind": "unknown",
            "file_ext": "html",
            "is_verified": False,
            "confidence": 0.5,
            "notes": "Legacy collection page. Needs scrape to extract product images.",
            "mapping_warnings": ["needs_scrape"],
        })
    return assets


def build_vv_painting_assets():
    """Create placeholder records for VV painting collection pages."""
    assets = []
    for code, url in VV_PAINTING_URLS.items():
        assets.append({
            "asset_id": make_id("vv_paint", code),
            "source_type": "legacy_site",
            "source_ref": url,
            "collection_hint": "willie-winkie",
            "product_code_hint": None,
            "product_name_hint": f"VV painting variant {code}",
            "room_hint": None,
            "asset_kind": "unknown",
            "file_ext": "html",
            "is_verified": False,
            "confidence": 0.4,
            "notes": f"VV painting '{code}' page. Contains product imagery for this painting variant.",
            "mapping_warnings": ["vv_variant_decision_blocked", "needs_scrape"],
        })
    return assets


def build_room_assets():
    """Create placeholder records for legacy room pages."""
    assets = []
    for room_type, url in LEGACY_ROOM_URLS.items():
        assets.append({
            "asset_id": make_id("room", room_type),
            "source_type": "legacy_site",
            "source_ref": url,
            "collection_hint": None,
            "product_code_hint": None,
            "product_name_hint": None,
            "room_hint": room_type,
            "asset_kind": "room",
            "file_ext": "html",
            "is_verified": False,
            "confidence": 0.5,
            "notes": f"Room page '{room_type}'. Contains interior/room imagery.",
            "mapping_warnings": ["needs_scrape", "room_only_image"],
        })
    return assets


def build_product_image_skeleton(products):
    """Build image-map skeleton entries for all workbook products."""
    entries = []
    for p in products:
        code = p.get("product_code_normalized")
        coll = p.get("collection_name_normalized")
        name = p.get("product_name_raw")

        if p.get("is_detail") or p.get("is_special_order"):
            continue

        warnings = []
        status = "missing"

        if not code:
            warnings.append("missing_product_code")
            status = "blocked"
        elif coll == "willie-winkie":
            warnings.append("vv_variant_decision_blocked")
            status = "blocked"

        key = f"{coll}:{code}" if code else f"{coll}:row_{p['row_index']}"

        entries.append({
            "workbook_row_key": key,
            "product_code_normalized": code,
            "collection_name_normalized": coll,
            "canonical_name": name,
            "main_image": None,
            "gallery_images": [],
            "interior_images": [],
            "source_priority": ["legacy_site", "pdf_catalog", "front_folder"],
            "mapping_status": status,
            "confidence": 0.0,
            "review_notes": "; ".join(warnings) if warnings else None,
        })

    return entries


def build_unresolved_queues(products):
    """Build categorized review queues."""
    queues = {
        "missing_product_code": [],
        "ambiguous_name_match": [],
        "collection_conflict": [],
        "room_only_image": [],
        "legacy_only_image": [],
        "disk_only_image": [],
        "vv_variant_decision_blocked": [],
        "needs_business_review": [],
    }

    for p in products:
        code = p.get("product_code_normalized")
        coll = p.get("collection_name_normalized")
        name = p.get("product_name_raw")

        if p.get("is_detail") or p.get("is_special_order"):
            continue

        entry = {
            "product_code": code,
            "collection": coll,
            "name": name,
            "row_index": p["row_index"],
            "source_sheet": p["source_sheet"],
        }

        if not code:
            queues["missing_product_code"].append(entry)

        if coll == "willie-winkie":
            queues["vv_variant_decision_blocked"].append(entry)

    # Add room-only image queue entries
    for room_type in LEGACY_ROOM_URLS:
        queues["room_only_image"].append({
            "product_code": None,
            "collection": None,
            "name": f"Room page: {room_type}",
            "row_index": None,
            "source_sheet": None,
            "room_type": room_type,
            "source_ref": LEGACY_ROOM_URLS[room_type],
        })

    # Front folder unmapped images
    for fname in FRONT_FILES:
        if not fname.startswith("mn-color"):
            queues["disk_only_image"].append({
                "product_code": None,
                "collection": None,
                "name": fname,
                "row_index": None,
                "source_sheet": None,
                "source_ref": f"/Front/{fname}",
            })

    # Tudor Oak — on legacy, not in workbook
    queues["legacy_only_image"].append({
        "product_code": None,
        "collection": "tudor-oak",
        "name": "Tudor Oak collection",
        "row_index": None,
        "source_sheet": None,
        "source_ref": "https://woodright.ru/tudor-oak-ru/",
        "reason": "Present on legacy site, absent from workbook. Possibly discontinued.",
    })

    # Accessories without proper dimensions — need image review
    for p in products:
        if p.get("is_accessory") and p.get("is_ambiguous"):
            queues["needs_business_review"].append({
                "product_code": p.get("product_code_normalized"),
                "collection": p.get("collection_name_normalized"),
                "name": p.get("product_name_raw"),
                "row_index": p["row_index"],
                "source_sheet": p["source_sheet"],
                "reason": "Accessory with parse warnings; needs image sourcing review",
            })

    return queues


def main():
    with open(PARSED, "r", encoding="utf-8") as f:
        products = json.load(f)

    print(f"Loaded {len(products)} parsed workbook rows")

    # Build all asset records
    all_assets = []
    all_assets.extend(build_pdf_assets())
    all_assets.extend(build_front_assets())
    all_assets.extend(build_legacy_collection_assets())
    all_assets.extend(build_vv_painting_assets())
    all_assets.extend(build_room_assets())

    print(f"Generated {len(all_assets)} asset records")

    # Asset manifest
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    out_manifest = ASSETS_DIR / "asset-manifest.json"
    with open(out_manifest, "w", encoding="utf-8") as f:
        json.dump(all_assets, f, ensure_ascii=False, indent=2)
    print(f"  Wrote: {out_manifest}")

    # Summary
    from collections import Counter
    by_source = Counter(a["source_type"] for a in all_assets)
    by_kind = Counter(a["asset_kind"] for a in all_assets)
    verified = sum(1 for a in all_assets if a["is_verified"])
    with_warnings = sum(1 for a in all_assets if a["mapping_warnings"])

    summary = {
        "total_assets": len(all_assets),
        "verified": verified,
        "unverified": len(all_assets) - verified,
        "with_warnings": with_warnings,
        "by_source_type": dict(by_source.most_common()),
        "by_asset_kind": dict(by_kind.most_common()),
    }
    out_summary = ASSETS_DIR / "asset-manifest-summary.json"
    with open(out_summary, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(f"  Wrote: {out_summary}")

    # Image map skeleton
    NORM_DIR.mkdir(parents=True, exist_ok=True)
    skeleton = build_product_image_skeleton(products)
    out_skeleton = NORM_DIR / "image-map-skeleton.json"
    with open(out_skeleton, "w", encoding="utf-8") as f:
        json.dump(skeleton, f, ensure_ascii=False, indent=2)
    print(f"  Wrote: {out_skeleton} ({len(skeleton)} entries)")

    # Unresolved queues
    queues = build_unresolved_queues(products)
    out_unresolved = NORM_DIR / "unresolved-image-matches.json"
    with open(out_unresolved, "w", encoding="utf-8") as f:
        json.dump(queues, f, ensure_ascii=False, indent=2)

    total_unresolved = sum(len(v) for v in queues.values())
    print(f"  Wrote: {out_unresolved} ({total_unresolved} entries across {len(queues)} queues)")
    for q, items in queues.items():
        if items:
            print(f"    {q}: {len(items)}")

    print("\nDone.")


if __name__ == "__main__":
    main()
