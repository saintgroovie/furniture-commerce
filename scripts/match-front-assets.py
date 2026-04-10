#!/usr/bin/env python3
"""
Match disk product photography to workbook products.

Reads front-manifest.json and image-map.after-pdf.json.
Matches by article code (primary) and collection (secondary).
Produces updated image map with disk-sourced imagery.

Does NOT modify backend or storefront code.

Usage:
    python3 scripts/match-front-assets.py
"""

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
WORKBOOK = PROJECT_ROOT / "data" / "raw" / "workbook" / "parsed-sheets.json"
PREV_MAP = PROJECT_ROOT / "data" / "normalized" / "image-map.after-pdf.json"
FRONT_MANIFEST = PROJECT_ROOT / "data" / "raw" / "front" / "front-manifest.json"
OUTPUT_DIR = PROJECT_ROOT / "data" / "normalized"

VV_PREFIXES = {
    "AL", "AV", "BA", "BRB", "BRI", "FA", "FK", "IN",
    "MO", "PA", "RG", "RL", "RS", "TB", "TE", "TO", "TW",
}


def normalize_code(code):
    """Normalize an article code for matching."""
    if not code:
        return None
    c = code.upper().strip()
    c = re.sub(r'\s+', '', c)
    c = c.replace("С", "C").replace("О", "O")
    return c


def code_variants(code):
    """Generate matching variants for a code (e.g., MNm → MN, LON → CO)."""
    if not code:
        return set()
    variants = {code}
    upper = code.upper()
    variants.add(upper)

    if upper.startswith("MNM"):
        variants.add("MN" + upper[3:])
    if upper.startswith("MN") and not upper.startswith("MNM"):
        variants.add("MNm" + upper[2:])
        variants.add("MNM" + upper[2:])

    if upper.startswith("LON-"):
        variants.add("CO-" + upper[4:])
    if upper.startswith("LO-"):
        variants.add("CO-" + upper[3:])
    if upper.startswith("CO-"):
        variants.add("LON-" + upper[3:])

    return variants


def is_vv_code(code):
    """Check if a code belongs to VV painting variants."""
    if not code:
        return False
    prefix = code.split("-")[0].upper()
    return prefix in VV_PREFIXES


def pick_best_disk_image(candidates):
    """Pick the best image from a group of disk assets for the same product."""
    main_images = [c for c in candidates if c.get("image_index") == 1 or c.get("likely_asset_kind") == "product_main"]
    if main_images:
        return sorted(main_images, key=lambda x: x.get("file_size_kb", 0), reverse=True)[0]
    return sorted(candidates, key=lambda x: x.get("file_size_kb", 0), reverse=True)[0]


def collect_gallery(candidates):
    """Collect gallery image refs from disk assets."""
    gallery = []
    for c in sorted(candidates, key=lambda x: x.get("image_index") or 99):
        if (c.get("image_index") or 1) > 1:
            gallery.append(c["source_ref"])
    return gallery[:6]


def main():
    with open(WORKBOOK, encoding="utf-8") as f:
        workbook_rows = json.load(f)
    with open(PREV_MAP, encoding="utf-8") as f:
        image_map = json.load(f)
    with open(FRONT_MANIFEST, encoding="utf-8") as f:
        front_assets = json.load(f)

    imap_by_key = {e["workbook_row_key"]: e for e in image_map}

    wb_code_to_key = {}
    for e in image_map:
        code = e.get("product_code_normalized")
        if code:
            norm = normalize_code(code)
            wb_code_to_key[norm] = e["workbook_row_key"]
            for v in code_variants(norm):
                if v not in wb_code_to_key:
                    wb_code_to_key[v] = e["workbook_row_key"]

    disk_by_code = defaultdict(list)
    for asset in front_assets:
        code = asset.get("product_code_hint")
        if code:
            norm = normalize_code(code)
            disk_by_code[norm].append(asset)
            for v in code_variants(norm):
                if v != norm:
                    disk_by_code[v].append(asset)

    print("=" * 60)
    print("Disk Photography → Workbook Matching")
    print("=" * 60)
    print(f"Workbook entries in map: {len(image_map)}")
    print(f"Disk assets: {len(front_assets)}")
    print(f"Disk assets with codes: {sum(1 for a in front_assets if a.get('product_code_hint'))}")
    print(f"Unique codes in disk: {len(disk_by_code)}")
    print(f"Unique codes in workbook map: {len(wb_code_to_key)}")

    matches = {}
    review_entries = []
    stats = Counter()

    for wb_code_norm, imap_key in wb_code_to_key.items():
        if imap_key in matches:
            continue

        entry = imap_by_key.get(imap_key)
        if not entry:
            continue

        disk_imgs = disk_by_code.get(wb_code_norm, [])
        if not disk_imgs:
            continue

        best = pick_best_disk_image(disk_imgs)
        gallery = collect_gallery(disk_imgs)

        is_white_bg = best.get("source_type") == "white_bg"
        confidence = 0.9 if is_white_bg else 0.85
        source_label = "disk_white_bg" if is_white_bg else "disk_product_photo"

        old_status = entry["mapping_status"]
        is_vv = is_vv_code(wb_code_norm)

        if is_vv and old_status == "blocked":
            new_status = "disk_vv_candidate"
            confidence = 0.7
            stats["vv_found"] += 1
        elif old_status in ("missing", "pdf_candidate"):
            new_status = "disk_verified"
            stats[f"upgraded_from_{old_status}"] += 1
        elif old_status == "fuzzy":
            new_status = "disk_verified"
            stats["fuzzy_resolved"] += 1
        elif old_status in ("verified", "promoted"):
            if is_white_bg:
                new_status = old_status
                stats["already_matched_improved"] += 1
            else:
                stats["already_matched_skip"] += 1
                continue
        else:
            new_status = "disk_candidate"
            stats["new_candidate"] += 1

        match_entry = {
            "workbook_row_key": imap_key,
            "product_code": entry.get("product_code_normalized"),
            "collection": entry.get("collection_name_normalized"),
            "canonical_name": entry.get("canonical_name"),
            "old_status": old_status,
            "new_status": new_status,
            "disk_main_image": best["source_ref"],
            "disk_gallery": gallery,
            "disk_image_count": len(disk_imgs),
            "disk_source_type": best.get("source_type"),
            "disk_file_size_kb": best.get("file_size_kb"),
            "confidence": confidence,
            "is_vv": is_vv,
            "color_hint": best.get("color_hint"),
        }

        matches[imap_key] = match_entry
        review_entries.append(match_entry)

    print(f"\n{'=' * 60}")
    print(f"Matches found: {len(matches)}")
    for k, v in stats.most_common():
        print(f"  {k}: {v}")

    # Build updated image map
    updated_map = []
    for entry in image_map:
        key = entry["workbook_row_key"]
        if key in matches:
            m = matches[key]
            new_entry = dict(entry)

            if m["new_status"] == "disk_verified":
                new_entry["mapping_status"] = "disk_verified"
                new_entry["confidence"] = m["confidence"]
                new_entry["main_image"] = {
                    "source_type": m["disk_source_type"],
                    "source_ref": m["disk_main_image"],
                }
                if m["disk_gallery"]:
                    new_entry["gallery_images"] = [
                        {"source_type": m["disk_source_type"], "source_ref": ref}
                        for ref in m["disk_gallery"]
                    ]
                new_entry["disk_evidence"] = {
                    "image_count": m["disk_image_count"],
                    "file_size_kb": m["disk_file_size_kb"],
                    "color_hint": m["color_hint"],
                }

            elif m["new_status"] == "disk_vv_candidate":
                new_entry["mapping_status"] = "disk_vv_candidate"
                new_entry["confidence"] = m["confidence"]
                new_entry["main_image"] = {
                    "source_type": m["disk_source_type"],
                    "source_ref": m["disk_main_image"],
                }
                new_entry["disk_evidence"] = {
                    "image_count": m["disk_image_count"],
                    "is_vv": True,
                    "note": "VV painting variant found on disk, needs business decision",
                }

            elif m["new_status"] == "disk_candidate":
                new_entry["mapping_status"] = "disk_candidate"
                new_entry["confidence"] = m["confidence"]
                new_entry["main_image"] = {
                    "source_type": m["disk_source_type"],
                    "source_ref": m["disk_main_image"],
                }
                new_entry["disk_evidence"] = {
                    "image_count": m["disk_image_count"],
                    "note": "Base product found on disk, original status was blocked",
                }

            elif m["old_status"] in ("verified", "promoted"):
                if m["disk_source_type"] == "white_bg":
                    new_entry["preferred_main_image"] = {
                        "source_type": m["disk_source_type"],
                        "source_ref": m["disk_main_image"],
                    }
                    if m["disk_gallery"]:
                        new_entry["preferred_gallery"] = [
                            {"source_type": m["disk_source_type"], "source_ref": ref}
                            for ref in m["disk_gallery"]
                        ]

            updated_map.append(new_entry)
        else:
            updated_map.append(dict(entry))

    # Write outputs
    out_map = OUTPUT_DIR / "image-map.after-front.json"
    with open(out_map, "w", encoding="utf-8") as f:
        json.dump(updated_map, f, ensure_ascii=False, indent=2)
    print(f"\nWrote: {out_map}")

    out_review = OUTPUT_DIR / "front-review.json"
    with open(out_review, "w", encoding="utf-8") as f:
        json.dump(review_entries, f, ensure_ascii=False, indent=2)
    print(f"Wrote: {out_review} ({len(review_entries)} entries)")

    # Build unresolved queues
    unresolved = defaultdict(list)
    for entry in updated_map:
        status = entry["mapping_status"]
        key = entry["workbook_row_key"]

        if status == "blocked":
            unresolved["vv_variant_decision_blocked"].append({
                "workbook_row_key": key,
                "collection": entry.get("collection_name_normalized"),
                "name": entry.get("canonical_name"),
            })
        elif status in ("missing",):
            unresolved["still_missing"].append({
                "workbook_row_key": key,
                "collection": entry.get("collection_name_normalized"),
                "name": entry.get("canonical_name"),
                "code": entry.get("product_code_normalized"),
            })
        elif status == "fuzzy":
            unresolved["remaining_fuzzy"].append({
                "workbook_row_key": key,
                "collection": entry.get("collection_name_normalized"),
                "name": entry.get("canonical_name"),
            })
        elif status == "pdf_candidate":
            unresolved["pdf_candidate_only"].append({
                "workbook_row_key": key,
                "collection": entry.get("collection_name_normalized"),
                "name": entry.get("canonical_name"),
            })
        elif status == "disk_vv_candidate":
            unresolved["vv_disk_found_needs_decision"].append({
                "workbook_row_key": key,
                "collection": entry.get("collection_name_normalized"),
                "name": entry.get("canonical_name"),
            })

    no_code = [e for e in updated_map if not e.get("product_code_normalized")]
    if no_code:
        unresolved["missing_product_code"] = [{
            "workbook_row_key": e["workbook_row_key"],
            "name": e.get("canonical_name"),
        } for e in no_code]

    out_unresolved = OUTPUT_DIR / "unresolved-image-matches.after-front.json"
    with open(out_unresolved, "w", encoding="utf-8") as f:
        json.dump(dict(unresolved), f, ensure_ascii=False, indent=2)
    print(f"Wrote: {out_unresolved}")

    # Final summary
    print(f"\n{'=' * 60}")
    print("Final status distribution:")
    final_status = Counter(e["mapping_status"] for e in updated_map)
    for s, n in final_status.most_common():
        print(f"  {s}: {n}")

    hard_matched = sum(v for k, v in final_status.items()
                       if k in ("verified", "promoted", "disk_verified"))
    soft_matched = sum(v for k, v in final_status.items()
                       if k in ("pdf_candidate", "disk_vv_candidate"))
    total = len(updated_map)
    print(f"\n  Hard matched (ver+prom+disk_ver): {hard_matched} / {total} = {hard_matched/total*100:.1f}%")
    print(f"  Soft matched (+pdf+vv_disk): {hard_matched+soft_matched} / {total} = {(hard_matched+soft_matched)/total*100:.1f}%")

    print(f"\nUnresolved queues:")
    total_unresolved = 0
    for q, items in sorted(unresolved.items()):
        print(f"  {q}: {len(items)}")
        total_unresolved += len(items)
    print(f"  TOTAL: {total_unresolved}")

    print(f"\nCollection coverage:")
    coll_stats = defaultdict(lambda: Counter())
    for entry in updated_map:
        coll = entry.get("collection_name_normalized", "unknown")
        coll_stats[coll][entry["mapping_status"]] += 1
        coll_stats[coll]["total"] += 1

    for coll in sorted(coll_stats.keys()):
        cs = coll_stats[coll]
        hard = cs.get("verified", 0) + cs.get("promoted", 0) + cs.get("disk_verified", 0)
        soft = cs.get("pdf_candidate", 0) + cs.get("disk_vv_candidate", 0)
        total_c = cs["total"]
        pct_hard = hard / total_c * 100 if total_c else 0
        pct_all = (hard + soft) / total_c * 100 if total_c else 0
        print(f"  {coll:25s} total={total_c:3d} "
              f"ver={cs.get('verified',0):2d} prom={cs.get('promoted',0):2d} "
              f"disk={cs.get('disk_verified',0):2d} pdf={cs.get('pdf_candidate',0):2d} "
              f"vv_d={cs.get('disk_vv_candidate',0):2d} "
              f"fuz={cs.get('fuzzy',0):2d} miss={cs.get('missing',0):2d} "
              f"blk={cs.get('blocked',0):2d} "
              f"hard={pct_hard:.0f}% all={pct_all:.0f}%")

    # Upgraded entries summary
    print(f"\nKey upgrades:")
    upgraded_missing = [m for m in review_entries if m["old_status"] == "missing"]
    upgraded_pdf = [m for m in review_entries if m["old_status"] == "pdf_candidate"]
    upgraded_fuzzy = [m for m in review_entries if m["old_status"] == "fuzzy"]
    improved_verified = [m for m in review_entries if m["old_status"] in ("verified", "promoted")]
    vv_found = [m for m in review_entries if m["is_vv"]]

    print(f"  missing → disk_verified: {len(upgraded_missing)}")
    print(f"  pdf_candidate → disk_verified: {len(upgraded_pdf)}")
    print(f"  fuzzy → disk_verified: {len(upgraded_fuzzy)}")
    print(f"  verified/promoted + better disk image: {len(improved_verified)}")
    print(f"  VV items found on disk: {len(vv_found)}")

    print("=" * 60)


if __name__ == "__main__":
    main()
