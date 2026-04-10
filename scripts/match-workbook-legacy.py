#!/usr/bin/env python3
"""
First-pass matching between workbook products and legacy site scraped products.

Matching priority:
  1. Exact article code match
  2. Normalized code match (MNm→MN strip)
  3. Exact product name within same collection
  4. Normalized fuzzy name within same collection
  5. Unresolved (missing)

VV (Willie Winkie) items are marked as "blocked" — they require a business
decision on painting model before image assignment.

Does NOT modify backend or storefront code.

Usage:
    python3 scripts/match-workbook-legacy.py

Output:
    data/normalized/image-map.first-pass.json
    data/normalized/unresolved-image-matches.after-legacy.json
"""

import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
WORKBOOK = PROJECT_ROOT / "data" / "raw" / "workbook" / "parsed-sheets.json"
LEGACY = PROJECT_ROOT / "data" / "raw" / "legacy" / "legacy-products.json"
OUTPUT_DIR = PROJECT_ROOT / "data" / "normalized"

TITLE_COLLECTION_MAP = {
    "OLIVER": "oliver",
    "GREENWICH": "greenwich",
    "MONCHELSEA": "monchelsea",
    "OXFORD": "oxford",
    "PROVENCE": "provence",
    "PRINCESS ROSE": "princess-rose",
    "PRINCESS": "princess-rose",
    "COUNTRY": "country-london-paris",
    "LONDON": "country-london-paris",
    "BALLET": "willie-winkie",
    "ALBION": "willie-winkie",
    "FAIRIES": "willie-winkie",
    "TEMPLARS": "willie-winkie",
    "INFANTA": "willie-winkie",
    "TEDDY BEAR": "willie-winkie",
    "TIGGY-WINKLE": "willie-winkie",
    "PASTORAL": "willie-winkie",
    "ROYAL LILIES": "willie-winkie",
    "ROYAL GUARDSMEN": "willie-winkie",
    "TOMMY": "willie-winkie",
}

VV_PAINTING_PREFIXES = {
    "BA", "RL", "AV", "TE", "TW", "AL", "FA", "PA",
    "FK", "TB", "RS", "MO", "TO", "IN", "RG", "SH",
    "SC", "BI",
}


def normalize_name(name):
    """Normalize a product name for fuzzy matching."""
    if not name:
        return ""
    s = name.strip().lower()
    s = re.sub(r'\s+', ' ', s)
    s = re.sub(r'[«»""\']', '', s)
    s = s.replace('ё', 'е')
    s = re.sub(r'\s*\(.*?\)\s*', ' ', s)
    s = re.sub(r'\d+[*хx×]\d+', '', s)
    s = re.sub(r'\s+', ' ', s).strip()

    for kw in TITLE_COLLECTION_MAP:
        s = s.replace(kw.lower(), "").strip()

    return s


def normalize_code_for_matching(code):
    """Strip sub-collection markers for broader matching.
    MNm-05-2 → MN-05-2, etc."""
    if not code:
        return None
    return re.sub(r'^([A-Z]{2})[a-z]-', r'\1-', code)


def extract_number_part(code):
    """Extract number portion from article code.
    WW-55-1 → 55-1, OL-14-1 → 14-1"""
    if not code:
        return None
    m = re.match(r'^[A-Za-z]+-(\d+-\d+)$', code)
    return m.group(1) if m else None


def enrich_collection_hint(legacy_product):
    """Try to infer collection from product title if URL-based hint is missing."""
    if legacy_product.get("collection_hint"):
        return legacy_product["collection_hint"]

    title = (legacy_product.get("product_title_raw") or "").upper()
    url = legacy_product.get("page_url", "")

    if "/komnaty/" in url:
        return None

    for kw, coll in TITLE_COLLECTION_MAP.items():
        if kw in title:
            return coll

    return None


def build_legacy_indices(legacy_products):
    """Build lookup indices for legacy products."""
    by_code = defaultdict(list)
    by_norm_code = defaultdict(list)
    by_collection_name = defaultdict(list)

    for lp in legacy_products:
        coll = enrich_collection_hint(lp)
        lp["_enriched_collection"] = coll

        code = lp.get("product_code_from_image")
        if code:
            by_code[code].append(lp)
            norm_code = normalize_code_for_matching(code)
            if norm_code and norm_code != code:
                by_norm_code[norm_code].append(lp)

        if coll:
            norm_name = normalize_name(lp.get("product_title_raw", ""))
            if norm_name:
                by_collection_name[(coll, norm_name)].append(lp)

    return by_code, by_norm_code, by_collection_name


def pick_best_image(candidates):
    """Pick the best image from multiple legacy candidates."""
    with_images = [c for c in candidates if c.get("main_image_url")]
    if not with_images:
        return None, []
    best = with_images[0]
    return best.get("main_image_url"), best.get("gallery_image_urls", [])


def main():
    with open(WORKBOOK, "r", encoding="utf-8") as f:
        workbook = json.load(f)
    with open(LEGACY, "r", encoding="utf-8") as f:
        legacy_products = json.load(f)

    print(f"Loaded: {len(workbook)} workbook rows, {len(legacy_products)} legacy products")

    by_code, by_norm_code, by_coll_name = build_legacy_indices(legacy_products)

    matchable = [
        r for r in workbook
        if not r.get("is_detail") and not r.get("is_special_order")
    ]
    print(f"Matchable workbook products: {len(matchable)}")

    results = []
    stats = Counter()

    for row in matchable:
        code = row.get("product_code_normalized")
        coll = row.get("collection_name_normalized")
        name = row.get("product_name_raw", "")

        key = f"{coll}:{code}" if code else f"{coll}:row_{row['row_index']}"

        entry = {
            "workbook_row_key": key,
            "product_code_normalized": code,
            "collection_name_normalized": coll,
            "canonical_name": name,
            "main_image": None,
            "gallery_images": [],
            "source_priority": ["legacy_site", "pdf_catalog", "front_folder"],
            "mapping_status": "missing",
            "confidence": 0.0,
            "match_basis": None,
            "review_notes": None,
            "legacy_page_url": None,
            "legacy_title_matched": None,
        }

        if coll == "willie-winkie":
            entry["mapping_status"] = "blocked"
            entry["match_basis"] = "vv_blocked"
            entry["review_notes"] = "VV painting model decision required"
            stats["blocked_vv"] += 1
            results.append(entry)
            continue

        if not code:
            entry["mapping_status"] = "blocked"
            entry["match_basis"] = "missing_code"
            entry["review_notes"] = "No article code in workbook"
            stats["blocked_no_code"] += 1
            results.append(entry)
            continue

        matched = False

        # Priority 1: exact code match
        if code in by_code:
            candidates = by_code[code]
            same_coll = [c for c in candidates if c.get("_enriched_collection") == coll]
            chosen = same_coll if same_coll else candidates

            main_img, gallery = pick_best_image(chosen)
            if main_img:
                entry["main_image"] = {
                    "source_type": "legacy_site",
                    "source_ref": main_img,
                    "local_path": None,
                    "is_verified": False,
                    "confidence": 0.9,
                }
                entry["gallery_images"] = [
                    {
                        "source_type": "legacy_site",
                        "source_ref": url,
                        "local_path": None,
                        "is_verified": False,
                        "confidence": 0.8,
                    }
                    for url in gallery
                ]
                entry["mapping_status"] = "verified"
                entry["confidence"] = 0.9
                entry["match_basis"] = "exact_code"
                entry["legacy_page_url"] = chosen[0].get("page_url")
                entry["legacy_title_matched"] = chosen[0].get("product_title_raw")
                stats["verified_exact_code"] += 1
                matched = True

        # Priority 2: normalized code (MNm→MN)
        if not matched:
            norm_code = normalize_code_for_matching(code)
            if norm_code and norm_code != code and norm_code in by_code:
                candidates = by_code[norm_code]
                main_img, gallery = pick_best_image(candidates)
                if main_img:
                    entry["main_image"] = {
                        "source_type": "legacy_site",
                        "source_ref": main_img,
                        "local_path": None,
                        "is_verified": False,
                        "confidence": 0.85,
                    }
                    entry["gallery_images"] = [
                        {
                            "source_type": "legacy_site",
                            "source_ref": url,
                            "local_path": None,
                            "is_verified": False,
                            "confidence": 0.75,
                        }
                        for url in gallery
                    ]
                    entry["mapping_status"] = "verified"
                    entry["confidence"] = 0.85
                    entry["match_basis"] = "normalized_code"
                    entry["legacy_page_url"] = candidates[0].get("page_url")
                    entry["legacy_title_matched"] = candidates[0].get("product_title_raw")
                    entry["review_notes"] = f"Code normalized: {code} → {norm_code}"
                    stats["verified_norm_code"] += 1
                    matched = True

        # Priority 3: exact name match in same collection
        if not matched and coll:
            norm_name = normalize_name(name)
            if (coll, norm_name) in by_coll_name:
                candidates = by_coll_name[(coll, norm_name)]
                main_img, gallery = pick_best_image(candidates)
                if main_img:
                    entry["main_image"] = {
                        "source_type": "legacy_site",
                        "source_ref": main_img,
                        "local_path": None,
                        "is_verified": False,
                        "confidence": 0.7,
                    }
                    entry["gallery_images"] = [
                        {
                            "source_type": "legacy_site",
                            "source_ref": url,
                            "local_path": None,
                            "is_verified": False,
                            "confidence": 0.6,
                        }
                        for url in gallery
                    ]
                    entry["mapping_status"] = "fuzzy"
                    entry["confidence"] = 0.7
                    entry["match_basis"] = "name_in_collection"
                    entry["legacy_page_url"] = candidates[0].get("page_url")
                    entry["legacy_title_matched"] = candidates[0].get("product_title_raw")
                    entry["review_notes"] = "Matched by normalized name within collection — needs confirmation"
                    stats["fuzzy_name"] += 1
                    matched = True

        # Priority 4: fuzzy name match across all legacy products in same collection
        if not matched and coll:
            wb_words = set(normalize_name(name).split())
            best_score = 0
            best_candidate = None

            for lp in legacy_products:
                lp_coll = enrich_collection_hint(lp)
                if lp_coll != coll:
                    continue
                lp_name = normalize_name(lp.get("product_title_raw", ""))
                lp_words = set(lp_name.split())
                if not lp_words or not wb_words:
                    continue
                overlap = len(wb_words & lp_words)
                total = max(len(wb_words), len(lp_words))
                score = overlap / total if total > 0 else 0
                if score > best_score and score >= 0.5:
                    best_score = score
                    best_candidate = lp

            if best_candidate and best_candidate.get("main_image_url"):
                entry["main_image"] = {
                    "source_type": "legacy_site",
                    "source_ref": best_candidate["main_image_url"],
                    "local_path": None,
                    "is_verified": False,
                    "confidence": round(best_score * 0.6, 2),
                }
                entry["mapping_status"] = "fuzzy"
                entry["confidence"] = round(best_score * 0.6, 2)
                entry["match_basis"] = "fuzzy_name"
                entry["legacy_page_url"] = best_candidate.get("page_url")
                entry["legacy_title_matched"] = best_candidate.get("product_title_raw")
                entry["review_notes"] = (
                    f"Fuzzy name match (score={best_score:.2f}) — "
                    f"needs manual confirmation"
                )
                stats["fuzzy_broad"] += 1
                matched = True

        if not matched:
            entry["mapping_status"] = "missing"
            entry["confidence"] = 0.0
            entry["match_basis"] = "no_match"
            entry["review_notes"] = "No legacy match found — needs PDF/Front or manual image"
            stats["missing"] += 1

        results.append(entry)

    # Save image-map.first-pass.json
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_map = OUTPUT_DIR / "image-map.first-pass.json"
    with open(out_map, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\nWrote: {out_map} ({len(results)} entries)")

    # Build unresolved queues
    queues = {
        "missing_product_code": [],
        "ambiguous_name_match": [],
        "collection_conflict": [],
        "room_only_image": [],
        "legacy_only_product": [],
        "disk_only_image": [],
        "vv_variant_decision_blocked": [],
        "needs_business_review": [],
        "no_legacy_match_needs_pdf": [],
        "oxford_collection_absent": [],
    }

    for entry in results:
        base = {
            "product_code": entry["product_code_normalized"],
            "collection": entry["collection_name_normalized"],
            "name": entry["canonical_name"],
            "workbook_key": entry["workbook_row_key"],
        }

        if entry["match_basis"] == "vv_blocked":
            queues["vv_variant_decision_blocked"].append(base)
        elif entry["match_basis"] == "missing_code":
            queues["missing_product_code"].append(base)
        elif entry["mapping_status"] == "missing":
            if entry["collection_name_normalized"] == "oxford":
                queues["oxford_collection_absent"].append(base)
            else:
                queues["no_legacy_match_needs_pdf"].append(base)
        elif entry["mapping_status"] == "fuzzy":
            queues["ambiguous_name_match"].append({
                **base,
                "match_basis": entry["match_basis"],
                "confidence": entry["confidence"],
                "legacy_title": entry.get("legacy_title_matched"),
            })

    # Legacy-only products (on legacy but not in workbook)
    wb_urls = set(e.get("legacy_page_url") for e in results if e.get("legacy_page_url"))
    for lp in legacy_products:
        if lp["page_url"] not in wb_urls:
            coll = enrich_collection_hint(lp)
            if coll and coll != "willie-winkie":
                queues["legacy_only_product"].append({
                    "product_code": lp.get("product_code_from_image"),
                    "collection": coll,
                    "name": lp.get("product_title_raw"),
                    "page_url": lp["page_url"],
                })

    out_unresolved = OUTPUT_DIR / "unresolved-image-matches.after-legacy.json"
    with open(out_unresolved, "w", encoding="utf-8") as f:
        json.dump(queues, f, ensure_ascii=False, indent=2)

    total_unresolved = sum(len(v) for v in queues.values())
    print(f"Wrote: {out_unresolved} ({total_unresolved} entries)")

    # Print summary
    print(f"\n{'=' * 60}")
    print("MATCHING SUMMARY")
    print(f"{'=' * 60}")
    for k, v in stats.most_common():
        print(f"  {k:30s} {v:4d}")
    print(f"  {'TOTAL':30s} {sum(stats.values()):4d}")

    verified = stats.get("verified_exact_code", 0) + stats.get("verified_norm_code", 0)
    fuzzy = stats.get("fuzzy_name", 0) + stats.get("fuzzy_broad", 0)
    missing = stats.get("missing", 0)
    blocked = stats.get("blocked_vv", 0) + stats.get("blocked_no_code", 0)

    print(f"\n  Verified:  {verified}")
    print(f"  Fuzzy:     {fuzzy}")
    print(f"  Missing:   {missing}")
    print(f"  Blocked:   {blocked}")

    print(f"\nQueue sizes:")
    for q, items in queues.items():
        if items:
            print(f"  {q}: {len(items)}")

    # Per-collection coverage
    print(f"\n--- Per-collection coverage ---")
    coll_stats = defaultdict(lambda: {"total": 0, "verified": 0, "fuzzy": 0, "missing": 0, "blocked": 0})
    for entry in results:
        c = entry["collection_name_normalized"]
        coll_stats[c]["total"] += 1
        if entry["mapping_status"] == "verified":
            coll_stats[c]["verified"] += 1
        elif entry["mapping_status"] == "fuzzy":
            coll_stats[c]["fuzzy"] += 1
        elif entry["mapping_status"] == "missing":
            coll_stats[c]["missing"] += 1
        elif entry["mapping_status"] == "blocked":
            coll_stats[c]["blocked"] += 1

    for c, s in sorted(coll_stats.items()):
        pct = (s["verified"] + s["fuzzy"]) / s["total"] * 100 if s["total"] > 0 else 0
        print(f"  {c:25s} total={s['total']:3d} verified={s['verified']:3d} fuzzy={s['fuzzy']:3d} missing={s['missing']:3d} blocked={s['blocked']:3d} coverage={pct:.0f}%")


if __name__ == "__main__":
    main()
