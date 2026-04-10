#!/usr/bin/env python3
"""
Controlled promotion of fuzzy matches based on documented rules.

Reads image-map.first-pass.json, applies promotion rules from
fuzzy-promotion-rules.md, outputs promoted image map and updated
unresolved queues.

Does NOT modify backend or storefront code.

Usage:
    python3 scripts/promote-fuzzy-matches.py
"""

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
FIRST_PASS = PROJECT_ROOT / "data" / "normalized" / "image-map.first-pass.json"
OUTPUT_DIR = PROJECT_ROOT / "data" / "normalized"

SIZE_PATTERN = re.compile(r'(\d{2,4})\s*[*хx×]\s*(\d{2,4})')

ADJACENT_SIZES = {
    "90x190": {"120x190"},
    "120x190": {"90x190", "140x190"},
    "140x190": {"120x190"},
    "160x200": {"180x200"},
    "180x200": {"160x200"},
    "120x200": {"140x200"},
    "140x200": {"120x200", "160x200"},
    "80x150": set(),
    "60x120": set(),
}


def extract_size(name):
    m = SIZE_PATTERN.search(name or "")
    return f"{m.group(1)}x{m.group(2)}" if m else None


def strip_collection_suffix(name):
    """Remove collection name from end of legacy title."""
    s = re.sub(
        r'\s*(OLIVER|MONCHELSEA|GREENWICH|PROVENCE|PRINCESS\s*ROSE?|COUNTRY|LONDON|PARIS)\s*$',
        '', name or '', flags=re.IGNORECASE
    ).strip()
    return s


def normalize_for_comparison(name):
    """Deep normalize for comparison."""
    s = strip_collection_suffix(name).lower().strip()
    s = s.replace('ё', 'е')
    s = re.sub(r'[«»""\'`]', '', s)
    s = re.sub(r'\s+', ' ', s)
    return s


def evaluate_promotion(entry):
    """Evaluate whether a fuzzy match can be safely promoted.

    Returns (can_promote, reason, confidence, evidence) or (False, reason, None, None)
    """
    wb_name = entry.get("canonical_name", "")
    lg_name = entry.get("legacy_title_matched", "")
    coll = entry.get("collection_name_normalized", "")

    if not lg_name:
        return False, "no_legacy_title", None, None

    wb_clean = strip_collection_suffix(wb_name).strip()
    lg_clean = strip_collection_suffix(lg_name).strip()
    wb_norm = normalize_for_comparison(wb_name)
    lg_norm = normalize_for_comparison(lg_name)

    wb_size = extract_size(wb_name)
    lg_size = extract_size(lg_name)

    # Rule: different door/drawer count → reject
    wb_doors = re.search(r'(\d)-дв', wb_clean)
    lg_doors = re.search(r'(\d)-дв', lg_clean)
    if wb_doors and lg_doors and wb_doors.group(1) != lg_doors.group(1):
        return False, "door_count_mismatch", None, None

    # Rule: "с тканью" variant matched to non-fabric → reject
    wb_fabric = "с тканью" in wb_clean.lower() or "с ткан" in wb_clean.lower()
    lg_fabric = "с тканью" in lg_clean.lower() or "с ткан" in lg_clean.lower()
    if wb_fabric and not lg_fabric:
        return False, "fabric_variant_mismatch", None, None

    # Rule: different product subtype → reject
    wb_lower = wb_clean.lower()
    lg_lower = lg_clean.lower()
    if "буфетный" in wb_lower and "книжный" in lg_lower:
        return False, "product_subtype_mismatch", None, None
    if "книжный" in wb_lower and "буфетный" in lg_lower:
        return False, "product_subtype_mismatch", None, None
    if "комод" in wb_lower and "столик" in lg_lower:
        return False, "product_subtype_mismatch", None, None

    # Rule: подъемный механизм vs изножье → different product variant
    wb_lift = "подъем" in wb_lower
    lg_footboard = "изнож" in lg_lower and "подъем" not in lg_lower
    if wb_lift and lg_footboard:
        return False, "mechanism_vs_footboard_mismatch", None, None

    # Check 1: Exact base name match (after stripping collection suffix)
    if wb_norm == lg_norm:
        return True, "exact_name_match", 0.85, f"Exact name after normalization"

    # Check 2: Name matches after removing size part
    wb_no_size = re.sub(r'\(?\s*\d{2,4}\s*[*хx×]\s*\d{2,4}\s*\)?', '', wb_norm).strip()
    lg_no_size = re.sub(r'\(?\s*\d{2,4}\s*[*хx×]\s*\d{2,4}\s*\)?', '', lg_norm).strip()
    wb_no_size = re.sub(r'\s+', ' ', wb_no_size).strip()
    lg_no_size = re.sub(r'\s+', ' ', lg_no_size).strip()

    if wb_no_size == lg_no_size and wb_size and lg_size:
        if wb_size == lg_size:
            return True, "exact_name_match", 0.85, f"Same name and size ({wb_size})"

        if lg_size in ADJACENT_SIZES.get(wb_size, set()):
            return True, "size_variant", 0.75, f"Same design, adjacent size: WB={wb_size} LG={lg_size}"
        else:
            return False, "size_too_distant", None, f"WB={wb_size} LG={lg_size}"

    # Check 3: Abbreviation normalization
    # подъем мех / подъемн.мех-змом → подъемный механизм
    wb_expanded = wb_norm
    wb_expanded = re.sub(r'подъемн?\.?\s*мех[\-\.]?з?мом?', 'подъемный механизм', wb_expanded)
    wb_expanded = re.sub(r'подъем\s+мех\b', 'подъемный механизм', wb_expanded)
    wb_expanded = re.sub(r'сваровски', 'swarovski', wb_expanded)
    wb_expanded = re.sub(r'кристалл', 'cristal', wb_expanded)
    wb_expanded = re.sub(r'1-тумб\.?', '1-тумбовый', wb_expanded)
    wb_expanded = re.sub(r'2-тумб\.?', '2-тумбовый', wb_expanded)
    wb_expanded = re.sub(r'(\d)-сп\.?', r'\1-сп.', wb_expanded)
    # Fix 0/О confusion (zero vs cyrillic O in drawer config)
    wb_expanded = re.sub(r'\b0([пяшо])\b', r'о\1', wb_expanded)
    wb_expanded = re.sub(r'\b([пяшо])0\b', r'\1о', wb_expanded)
    wb_expanded = re.sub(r'\s+', ' ', wb_expanded).strip()

    lg_expanded = lg_norm
    lg_expanded = re.sub(r'подъемн?\.?\s*мех[\-\.]?з?мом?', 'подъемный механизм', lg_expanded)
    lg_expanded = re.sub(r'подъем\s+мех\b', 'подъемный механизм', lg_expanded)
    lg_expanded = re.sub(r'сваровски', 'swarovski', lg_expanded)
    lg_expanded = re.sub(r'кристалл', 'cristal', lg_expanded)
    lg_expanded = re.sub(r'1-тумб\.?', '1-тумбовый', lg_expanded)
    lg_expanded = re.sub(r'2-тумб\.?', '2-тумбовый', lg_expanded)
    lg_expanded = re.sub(r'(\d)-сп\.?', r'\1-сп.', lg_expanded)
    lg_expanded = re.sub(r'\b0([пяшо])\b', r'о\1', lg_expanded)
    lg_expanded = re.sub(r'\b([пяшо])0\b', r'\1о', lg_expanded)
    lg_expanded = re.sub(r'\s+', ' ', lg_expanded).strip()

    if wb_expanded == lg_expanded:
        return True, "abbreviation_match", 0.85, "Same after abbreviation expansion"

    # Check with sizes stripped from expanded versions
    wb_exp_no_size = re.sub(r'\(?\s*\d{2,4}\s*[*хx×]\s*\d{2,4}\s*\)?', '', wb_expanded).strip()
    lg_exp_no_size = re.sub(r'\(?\s*\d{2,4}\s*[*хx×]\s*\d{2,4}\s*\)?', '', lg_expanded).strip()
    wb_exp_no_size = re.sub(r'\s+', ' ', wb_exp_no_size).strip()
    lg_exp_no_size = re.sub(r'\s+', ' ', lg_exp_no_size).strip()

    if wb_exp_no_size == lg_exp_no_size:
        if wb_size and lg_size:
            if wb_size == lg_size:
                return True, "abbreviation_match", 0.85, f"Same after expansion, same size ({wb_size})"
            if lg_size in ADJACENT_SIZES.get(wb_size, set()):
                return True, "size_variant", 0.75, f"Same after expansion, adjacent: WB={wb_size} LG={lg_size}"
            return False, "size_too_distant", None, f"WB={wb_size} LG={lg_size}"
        return True, "abbreviation_match", 0.85, "Same after abbreviation expansion (no size)"

    # Check 4: One name is a subset of the other (short name in workbook)
    if len(wb_norm) >= 3 and wb_norm in lg_norm and len(wb_norm) / len(lg_norm) > 0.5:
        return True, "name_subset_match", 0.80, f"WB name is subset of legacy name"

    # Check 5: Same base with detail suffix differences
    # e.g., "Этажерка малая 3 полки" vs "Этажерка малая"
    wb_words = wb_no_size.split()
    lg_words = lg_no_size.split()
    if len(wb_words) >= 2 and len(lg_words) >= 2:
        if wb_words[:2] == lg_words[:2]:
            extra_wb = set(wb_words[2:]) - {"с", "без", "и", "для", "на", "в", "к"}
            extra_lg = set(lg_words[2:]) - {"с", "без", "и", "для", "на", "в", "к"}
            # If extra words are only numeric/descriptive details
            if not extra_lg or extra_wb.issuperset(extra_lg):
                return True, "detail_suffix_match", 0.80, f"Same base, WB has more detail"

    return False, "no_safe_match", None, None


def main():
    with open(FIRST_PASS, "r", encoding="utf-8") as f:
        entries = json.load(f)

    fuzzy_entries = [e for e in entries if e["mapping_status"] == "fuzzy"]
    other_entries = [e for e in entries if e["mapping_status"] != "fuzzy"]

    print(f"Total entries: {len(entries)}")
    print(f"Fuzzy entries to review: {len(fuzzy_entries)}")
    print(f"Other entries (pass-through): {len(other_entries)}")

    promoted = []
    still_fuzzy = []
    rejected = []
    review_data = []

    stats = Counter()
    coll_stats = defaultdict(lambda: {"promoted": 0, "fuzzy": 0, "rejected": 0})

    for entry in fuzzy_entries:
        can_promote, reason, new_confidence, evidence = evaluate_promotion(entry)
        coll = entry["collection_name_normalized"]

        review_entry = {
            "workbook_row_key": entry["workbook_row_key"],
            "collection_name_normalized": coll,
            "product_code_normalized": entry["product_code_normalized"],
            "canonical_name": entry["canonical_name"],
            "matched_legacy_url": entry.get("legacy_page_url"),
            "matched_legacy_title": entry.get("legacy_title_matched"),
            "matched_main_image": entry.get("main_image", {}).get("source_ref") if entry.get("main_image") else None,
            "match_basis": entry.get("match_basis"),
            "original_confidence": entry["confidence"],
            "review_status": "promoted" if can_promote else "pending",
            "review_notes": evidence or reason,
            "promotion_candidate": can_promote,
            "promotion_reason": reason if can_promote else None,
            "rejection_reason": reason if not can_promote else None,
        }
        review_data.append(review_entry)

        if can_promote:
            new_entry = dict(entry)
            new_entry["mapping_status"] = "promoted"
            new_entry["confidence"] = new_confidence
            new_entry["match_basis"] = f"promoted:{reason}"
            new_entry["review_notes"] = (
                f"Promoted from fuzzy. Reason: {reason}. Evidence: {evidence}. "
                f"Original confidence: {entry['confidence']}"
            )
            if new_entry.get("main_image"):
                new_entry["main_image"]["confidence"] = new_confidence
            promoted.append(new_entry)
            stats[f"promoted:{reason}"] += 1
            coll_stats[coll]["promoted"] += 1
        else:
            unchanged = dict(entry)
            unchanged["review_notes"] = (
                f"Review: {reason}. "
                f"{evidence if evidence else 'No safe promotion path found.'}"
            )
            still_fuzzy.append(unchanged)
            stats[f"remains_fuzzy:{reason}"] += 1
            coll_stats[coll]["fuzzy"] += 1

    # Build final image map
    final_entries = other_entries + promoted + still_fuzzy
    final_entries.sort(key=lambda e: e.get("workbook_row_key", ""))

    out_map = OUTPUT_DIR / "image-map.promoted.json"
    with open(out_map, "w", encoding="utf-8") as f:
        json.dump(final_entries, f, ensure_ascii=False, indent=2)
    print(f"\nWrote: {out_map} ({len(final_entries)} entries)")

    # Fuzzy review data
    out_review = OUTPUT_DIR / "fuzzy-match-review.json"
    with open(out_review, "w", encoding="utf-8") as f:
        json.dump(review_data, f, ensure_ascii=False, indent=2)
    print(f"Wrote: {out_review} ({len(review_data)} entries)")

    # Unresolved queues after fuzzy review
    queues = {
        "vv_variant_decision_blocked": [],
        "missing_product_code": [],
        "no_legacy_match_needs_pdf": [],
        "oxford_collection_absent": [],
        "remaining_fuzzy_needs_manual": [],
        "legacy_only_product": [],
    }

    for e in final_entries:
        base = {
            "product_code": e.get("product_code_normalized"),
            "collection": e.get("collection_name_normalized"),
            "name": e.get("canonical_name"),
            "key": e.get("workbook_row_key"),
        }

        if e.get("match_basis") == "vv_blocked":
            queues["vv_variant_decision_blocked"].append(base)
        elif e.get("match_basis") == "missing_code":
            queues["missing_product_code"].append(base)
        elif e["mapping_status"] == "missing":
            if e.get("collection_name_normalized") == "oxford":
                queues["oxford_collection_absent"].append(base)
            else:
                queues["no_legacy_match_needs_pdf"].append(base)
        elif e["mapping_status"] == "fuzzy":
            queues["remaining_fuzzy_needs_manual"].append({
                **base,
                "confidence": e.get("confidence"),
                "match_basis": e.get("match_basis"),
                "legacy_title": e.get("legacy_title_matched"),
                "rejection_reason": e.get("review_notes", ""),
            })

    out_queues = OUTPUT_DIR / "unresolved-image-matches.after-fuzzy-review.json"
    with open(out_queues, "w", encoding="utf-8") as f:
        json.dump(queues, f, ensure_ascii=False, indent=2)

    total_unresolved = sum(len(v) for v in queues.values())
    print(f"Wrote: {out_queues} ({total_unresolved} unresolved)")

    # Summary
    print(f"\n{'=' * 60}")
    print("PROMOTION SUMMARY")
    print(f"{'=' * 60}")
    print(f"  Fuzzy reviewed:  {len(fuzzy_entries)}")
    print(f"  Promoted:        {len(promoted)}")
    print(f"  Still fuzzy:     {len(still_fuzzy)}")

    print(f"\n--- Promotion reasons ---")
    for k, v in sorted(stats.items()):
        print(f"  {k}: {v}")

    print(f"\n--- Per-collection ---")
    for c, s in sorted(coll_stats.items()):
        print(f"  {c:25s} promoted={s['promoted']:2d} fuzzy={s['fuzzy']:2d}")

    # Final status distribution
    status_dist = Counter(e["mapping_status"] for e in final_entries)
    print(f"\n--- Final status distribution ---")
    for k, v in status_dist.most_common():
        print(f"  {k}: {v}")

    print(f"\n--- Unresolved queues ---")
    for q, items in queues.items():
        if items:
            print(f"  {q}: {len(items)}")


if __name__ == "__main__":
    main()
