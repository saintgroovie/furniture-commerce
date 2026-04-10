#!/usr/bin/env python3
"""
Match PDF-extracted assets to workbook products.

Reads PDF asset manifest and workbook, attempts matching by:
1. Collection + normalized product name → find workbook code → update image map
2. Greenwich-specific name mapping (catalog names differ from workbook)
3. Oxford special handling (complex product, page-level matching)

Produces updated image map with PDF fallback entries.

Does NOT modify backend or storefront code.

Usage:
    python3 scripts/match-pdf-assets.py
"""

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

import fitz

PROJECT_ROOT = Path(__file__).resolve().parent.parent
WORKBOOK = PROJECT_ROOT / "data" / "raw" / "workbook" / "parsed-sheets.json"
PROMOTED_MAP = PROJECT_ROOT / "data" / "normalized" / "image-map.promoted.json"
PDF_MANIFEST = PROJECT_ROOT / "data" / "raw" / "pdf-assets" / "manifests" / "pdf-asset-manifest.json"
PDF_DIR = PROJECT_ROOT / "data" / "raw" / "pdf-assets" / "source-pdfs"
OUTPUT_DIR = PROJECT_ROOT / "data" / "normalized"

COLLECTION_MAP = {
    "Oxford.pdf": "oxford",
    "Oxford_full.pdf": "oxford",
    "Country.pdf": "country-london-paris",
    "London.pdf": "country-london-paris",
    "Greenwich.pdf": "greenwich",
    "Monchelsea.pdf": "monchelsea",
    "Princess Rose.pdf": "princess-rose",
    "Oliver.pdf": "oliver",
    "Provence White.pdf": "provence",
}

PRODUCT_TYPES_RE = re.compile(
    r'(кровать|комод|шкаф|стол|тумб|стеллаж|полк|кресл|'
    r'банкетк|диван|этажерк|зеркал|стул|гардероб|'
    r'консоль|туалетн|модул|лестниц|витрин|бортик|надстройк|'
    r'часы|комплекс|ступен|столешниц|панел|кроват)',
    re.IGNORECASE,
)


def norm(name):
    """Deep normalization for matching."""
    if not name:
        return ""
    s = name.lower().strip()
    s = s.replace('ё', 'е')
    s = re.sub(r'[«»"\'`\-–—]', ' ', s)
    s = re.sub(r'\(\d+[*x×х]\d+\)', '', s)
    s = re.sub(r'\b\d+\s*[*x×х]\s*\d+\b', '', s)
    s = re.sub(r'\b\d{3,4}\s*мм\b', '', s)
    s = re.sub(r'\bв\.\s*\d+', '', s)
    s = re.sub(r'\bш\.\s*\d+', '', s)
    s = re.sub(r'\bг[л]?\.\s*\d+', '', s)
    s = re.sub(r'\bдл\.\s*\d+', '', s)
    s = re.sub(r'декор\s+\S+(\s+\+\s+\S+)?', '', s)
    s = re.sub(r'\bбез\s+декора\b', '', s)
    s = re.sub(r'\b(0[пяо]|[пя][0о]|[пя]{2}|[оо])\b', '', s)
    s = re.sub(r'[^а-яa-z0-9\s]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s


# Greenwich PDF uses stylized names; map to workbook names
GREENWICH_EXACT = {
    "гардероб level": "гардероб 2 х дв с ящиками",
    "гардероб total": "гардероб 2 дв",
    "шкаф витрина cristal": "шкаф витрина кристалл",
    "комод scale": "комод",
    "тумба тв wide": "тумба тв",
    "консоль step": "консоль",
    "рабочий стол base": "рабочий стол",
    "прикроватная тумба stone": "прикроватная тумба с 2 ящиками",
    "прикроватная тумба hole": "прикроватная тумба с 1 ящиком",
    "зеркало frame": "зеркало навесное",
}

GREENWICH_BED_PAGES = {
    "кровать cloud": [9],
    "кровать plane": [10],
    "кровать frame": [11],
}

# Oxford: entire catalog = 1 product line (Комплекс Оксфорд variants)
OXFORD_PAGE_PRODUCT_HINTS = {
    3: ["комплекс оксфорд", "комплекс oxford"],
    4: ["ступени", "лестница", "ступен"],
    5: ["столешница", "кровать нижняя", "нижняя кровать"],
    6: ["комплекс оксфорд 1", "с выдвижной столешницей", "стеновая панель", "полка навесная"],
    7: ["комплекс оксфорд 2", "без выдвижной столешницы", "комплекс oxford", "комплексоксфорд", "тумба прикроватная", "бортик"],
}

# Country PDF has generic names like "Кровать 1–спальная" — map to workbook
COUNTRY_EXTRA = {
    "кровать 1 спальная": ["CO-14-2"],
    "кровать полутороспальная": ["CO-15-2", "CO-16-2"],
    "кровать двуспальная": ["CO-17-2", "CO-18-2"],
    "комод": ["CO-05-1"],
    "шкаф для одежды 2 дверный": ["CO-02-1"],
    "шкаф для одежды 3 дверный": ["CO-03-1"],
    "стеллаж широкий": ["CO-62-1"],
    "стул": ["CO-23-1"],
    "часы": ["CO-30-1"],
}

LONDON_EXTRA = {
    "кровать односпальная": ["CO-14-2"],
    "кровать полутороспальная": ["CO-15-2", "CO-16-2"],
    "шкаф для одежды 2 дверный": ["CO-02-1"],
    "шкаф книжный": ["CO-61-1"],
    "стеллаж широкий": ["CO-62-1"],
    "стол письменный двутумбовый": ["CO-66-1", "CO-66-2", "CO-66-3"],
    "тумбочка прикроватная": ["CO-08-1"],
    "стеллаж узкий с ящиком": ["CO-62-3"],
    "стеллаж узкий с дверью": ["CO-62-2"],
}


def extract_page_products(doc, page_num):
    """Extract product names from a PDF page."""
    page = doc[page_num]
    text = page.get_text("text")
    lines = [l.strip() for l in text.split('\n') if l.strip()]

    products = []
    for line in lines:
        low = line.lower()
        if 'часы работы' in low or 'woodright' == low.strip():
            continue
        if PRODUCT_TYPES_RE.search(low) and len(line) > 4:
            products.append(line.strip())
    return products


def build_workbook_index(workbook_rows):
    """Build lookup: (collection, normalized_name) → list of (code, canonical_name)."""
    index = defaultdict(list)
    for r in workbook_rows:
        coll = r.get("collection_name_normalized", "")
        name = r.get("product_name_canonical", "")
        code = r.get("product_code_normalized", "")
        if coll and name:
            n = norm(name)
            index[(coll, n)].append({"code": code, "name": name})
    return index


def match_name_to_workbook(pdf_name_norm, collection, wb_index, wb_rows, pdf_name=None):
    """Try to match a normalized PDF product name to workbook entries."""

    # Greenwich special mapping
    if collection == "greenwich":
        for gw_pdf, gw_wb in GREENWICH_EXACT.items():
            if gw_pdf in pdf_name_norm or pdf_name_norm in gw_pdf:
                gw_wb_norm = norm(gw_wb)
                hits = wb_index.get((collection, gw_wb_norm), [])
                if hits:
                    return hits, 0.7, f"greenwich_map:{gw_pdf}"

    # Country/London extra mapping by PDF-specific name patterns
    extra_map = None
    if pdf_name == "Country.pdf":
        extra_map = COUNTRY_EXTRA
    elif pdf_name == "London.pdf":
        extra_map = LONDON_EXTRA

    if extra_map:
        for pattern, codes in extra_map.items():
            if pattern in pdf_name_norm or pdf_name_norm in pattern:
                hits = [{"code": c, "name": pattern} for c in codes]
                return hits, 0.6, f"collection_extra:{pattern}"

    # Exact normalized match
    hits = wb_index.get((collection, pdf_name_norm), [])
    if hits:
        return hits, 0.7, "exact_normalized"

    # Substring matching: PDF name contains workbook name or vice versa
    best_hits = []
    best_score = 0
    best_reason = ""
    for (coll, wb_norm), entries in wb_index.items():
        if coll != collection:
            continue
        if not wb_norm or len(wb_norm) < 4:
            continue

        if wb_norm in pdf_name_norm or pdf_name_norm in wb_norm:
            overlap = len(set(wb_norm.split()) & set(pdf_name_norm.split()))
            score = overlap / max(len(wb_norm.split()), len(pdf_name_norm.split()))
            if score > best_score:
                best_score = score
                best_hits = entries
                best_reason = f"substring:{score:.2f}"

    if best_score >= 0.4 and best_hits:
        return best_hits, min(0.6, 0.4 + best_score * 0.3), best_reason

    # Word overlap
    pdf_words = set(pdf_name_norm.split())
    if len(pdf_words) < 2:
        return [], 0, "too_short"

    best_hits = []
    best_score = 0
    best_reason = ""
    for (coll, wb_norm), entries in wb_index.items():
        if coll != collection:
            continue
        wb_words = set(wb_norm.split())
        if not wb_words:
            continue
        common = pdf_words & wb_words
        type_words = {'кровать', 'комод', 'шкаф', 'стол', 'тумба', 'тумбочка',
                      'стеллаж', 'полка', 'кресло', 'банкетка', 'зеркало',
                      'стул', 'гардероб', 'консоль', 'диван', 'часы', 'столик',
                      'модульный', 'модульная', 'навесная', 'книжная', 'книжный',
                      'кроватка', 'прикроватная'}
        common_types = common & type_words
        if common_types:
            score = len(common) / max(len(pdf_words), len(wb_words))
            if score > best_score:
                best_score = score
                best_hits = entries
                best_reason = f"word_overlap:{score:.2f}"

    if best_score >= 0.5 and best_hits:
        return best_hits, min(0.6, 0.35 + best_score * 0.3), best_reason

    return [], 0, "no_match"


def main():
    with open(WORKBOOK, encoding="utf-8") as f:
        workbook_rows = json.load(f)
    with open(PROMOTED_MAP, encoding="utf-8") as f:
        image_map = json.load(f)
    with open(PDF_MANIFEST, encoding="utf-8") as f:
        pdf_assets = json.load(f)

    wb_index = build_workbook_index(workbook_rows)

    imap_by_key = {e["workbook_row_key"]: e for e in image_map}
    missing_keys = {e["workbook_row_key"] for e in image_map if e["mapping_status"] == "missing"}
    fuzzy_keys = {e["workbook_row_key"] for e in image_map if e["mapping_status"] == "fuzzy"}

    embedded_by_pdf_page = defaultdict(list)
    for asset in pdf_assets:
        if asset["extraction_type"] == "embedded_image" and asset["asset_kind"] == "product_candidate":
            embedded_by_pdf_page[(asset["source_pdf"], asset["page_number"])].append(asset)

    page_assets = {}
    for asset in pdf_assets:
        if asset["extraction_type"] == "rendered_page":
            page_assets[(asset["source_pdf"], asset["page_number"])] = asset

    print("=" * 60)
    print("PDF-to-Workbook Matching")
    print("=" * 60)

    pdf_matches = {}

    for pdf_name, collection in COLLECTION_MAP.items():
        pdf_path = PDF_DIR / pdf_name
        if not pdf_path.exists():
            continue

        doc = fitz.open(str(pdf_path))
        print(f"\n--- {pdf_name} → {collection} ({len(doc)} pages) ---")

        if collection == "oxford":
            for page_num, hints in OXFORD_PAGE_PRODUCT_HINTS.items():
                page_images = embedded_by_pdf_page.get((pdf_name, page_num), [])
                rendered = page_assets.get((pdf_name, page_num))

                for hint in hints:
                    for (coll, wb_norm), entries in wb_index.items():
                        if coll != "oxford":
                            continue
                        if hint in wb_norm:
                            for entry in entries:
                                code = entry["code"]
                                imap_key = f"oxford:{code}"
                                if imap_key not in imap_by_key:
                                    continue
                                existing = imap_by_key[imap_key]
                                if existing["mapping_status"] in ("verified", "promoted"):
                                    continue

                                if imap_key not in pdf_matches or page_images:
                                    best_img = sorted(page_images,
                                                      key=lambda x: x.get("width", 0) * x.get("height", 0),
                                                      reverse=True)[0] if page_images else None
                                    pdf_matches[imap_key] = {
                                        "workbook_row_key": imap_key,
                                        "product_code": code,
                                        "collection": collection,
                                        "canonical_name": entry["name"],
                                        "pdf_source": pdf_name,
                                        "pdf_page": page_num,
                                        "pdf_name_raw": hint,
                                        "match_reason": f"oxford_page_hint:{hint}",
                                        "confidence": 0.55,
                                        "was_missing": imap_key in missing_keys,
                                        "was_fuzzy": imap_key in fuzzy_keys,
                                        "pdf_image_path": best_img["file_path"] if best_img else None,
                                        "rendered_page_path": rendered["file_path"] if rendered else None,
                                        "all_page_images": [i["file_path"] for i in page_images],
                                    }
                                    print(f"  p{page_num}: '{hint}' → {code} '{entry['name'][:40]}' [oxford_hint] MISSING→FOUND")

            doc.close()
            continue

        if collection == "greenwich":
            for page_num in range(len(doc)):
                raw_names = extract_page_products(doc, page_num)
                page_images = embedded_by_pdf_page.get((pdf_name, page_num + 1), [])
                rendered = page_assets.get((pdf_name, page_num + 1))

                for raw_name in raw_names:
                    n = norm(raw_name)

                    for bed_name, bed_pages in GREENWICH_BED_PAGES.items():
                        if bed_name in n and (page_num + 1) in bed_pages:
                            for (coll, wb_norm), entries in wb_index.items():
                                if coll != "greenwich" or "кровать" not in wb_norm:
                                    continue
                                for entry in entries:
                                    code = entry["code"]
                                    imap_key = f"greenwich:{code}"
                                    if imap_key not in imap_by_key:
                                        continue
                                    existing = imap_by_key[imap_key]
                                    if existing["mapping_status"] in ("verified", "promoted"):
                                        continue
                                    if imap_key not in pdf_matches:
                                        best_img = sorted(page_images,
                                                          key=lambda x: x.get("width", 0) * x.get("height", 0),
                                                          reverse=True)[0] if page_images else None
                                        pdf_matches[imap_key] = {
                                            "workbook_row_key": imap_key,
                                            "product_code": code,
                                            "collection": collection,
                                            "canonical_name": entry["name"],
                                            "pdf_source": pdf_name,
                                            "pdf_page": page_num + 1,
                                            "pdf_name_raw": raw_name,
                                            "match_reason": f"greenwich_bed:{bed_name}",
                                            "confidence": 0.5,
                                            "was_missing": imap_key in missing_keys,
                                            "was_fuzzy": imap_key in fuzzy_keys,
                                            "pdf_image_path": best_img["file_path"] if best_img else None,
                                            "rendered_page_path": rendered["file_path"] if rendered else None,
                                            "all_page_images": [i["file_path"] for i in page_images],
                                        }
                                        tag = "MISSING→FOUND" if imap_key in missing_keys else ("FUZZY→PDF" if imap_key in fuzzy_keys else "")
                                        print(f"  p{page_num+1}: '{raw_name[:40]}' → {code} '{entry['name'][:40]}' [gw_bed] {tag}")

                    hits, confidence, reason = match_name_to_workbook(n, collection, wb_index, workbook_rows, pdf_name=pdf_name)
                    if not hits:
                        continue

                    for entry in hits:
                        code = entry["code"]
                        imap_key = f"{collection}:{code}"
                        if imap_key not in imap_by_key:
                            continue
                        existing = imap_by_key[imap_key]
                        if existing["mapping_status"] in ("verified", "promoted"):
                            continue

                        if imap_key not in pdf_matches or confidence > pdf_matches[imap_key].get("confidence", 0):
                            best_img = sorted(page_images,
                                              key=lambda x: x.get("width", 0) * x.get("height", 0),
                                              reverse=True)[0] if page_images else None
                            pdf_matches[imap_key] = {
                                "workbook_row_key": imap_key,
                                "product_code": code,
                                "collection": collection,
                                "canonical_name": entry["name"],
                                "pdf_source": pdf_name,
                                "pdf_page": page_num + 1,
                                "pdf_name_raw": raw_name,
                                "match_reason": reason,
                                "confidence": confidence,
                                "was_missing": imap_key in missing_keys,
                                "was_fuzzy": imap_key in fuzzy_keys,
                                "pdf_image_path": best_img["file_path"] if best_img else None,
                                "rendered_page_path": rendered["file_path"] if rendered else None,
                                "all_page_images": [i["file_path"] for i in page_images],
                            }
                            tag = "MISSING→FOUND" if imap_key in missing_keys else ("FUZZY→PDF" if imap_key in fuzzy_keys else "")
                            print(f"  p{page_num+1}: '{raw_name[:50]}' → {code} '{entry['name'][:40]}' [{reason}] {tag}")

            doc.close()
            continue

        # Generic collection matching
        for page_num in range(len(doc)):
            raw_names = extract_page_products(doc, page_num)
            page_images = embedded_by_pdf_page.get((pdf_name, page_num + 1), [])
            rendered = page_assets.get((pdf_name, page_num + 1))

            for raw_name in raw_names:
                n = norm(raw_name)
                hits, confidence, reason = match_name_to_workbook(n, collection, wb_index, workbook_rows, pdf_name=pdf_name)
                if not hits:
                    continue

                for entry in hits:
                    code = entry["code"]
                    imap_key = f"{collection}:{code}"
                    if imap_key not in imap_by_key:
                        continue
                    existing = imap_by_key[imap_key]
                    if existing["mapping_status"] in ("verified", "promoted"):
                        continue

                    if imap_key not in pdf_matches or confidence > pdf_matches[imap_key].get("confidence", 0):
                        best_img = sorted(page_images,
                                          key=lambda x: x.get("width", 0) * x.get("height", 0),
                                          reverse=True)[0] if page_images else None
                        pdf_matches[imap_key] = {
                            "workbook_row_key": imap_key,
                            "product_code": code,
                            "collection": collection,
                            "canonical_name": entry["name"],
                            "pdf_source": pdf_name,
                            "pdf_page": page_num + 1,
                            "pdf_name_raw": raw_name,
                            "match_reason": reason,
                            "confidence": confidence,
                            "was_missing": imap_key in missing_keys,
                            "was_fuzzy": imap_key in fuzzy_keys,
                            "pdf_image_path": best_img["file_path"] if best_img else None,
                            "rendered_page_path": rendered["file_path"] if rendered else None,
                            "all_page_images": [i["file_path"] for i in page_images],
                        }
                        tag = "MISSING→FOUND" if imap_key in missing_keys else ("FUZZY→PDF" if imap_key in fuzzy_keys else "")
                        print(f"  p{page_num+1}: '{raw_name[:50]}' → {code} '{entry['name'][:40]}' [{reason}] {tag}")

        doc.close()

    matches_list = list(pdf_matches.values())

    resolved_missing = sum(1 for m in matches_list if m["was_missing"])
    strengthened_fuzzy = sum(1 for m in matches_list if m["was_fuzzy"])

    print(f"\n{'=' * 60}")
    print(f"Unique PDF matches: {len(matches_list)}")
    print(f"  Resolved missing: {resolved_missing}")
    print(f"  Strengthened fuzzy: {strengthened_fuzzy}")

    # Update image map
    updated_map = []
    for entry in image_map:
        key = entry["workbook_row_key"]
        if key in pdf_matches:
            match = pdf_matches[key]
            new_entry = dict(entry)

            if entry["mapping_status"] == "missing":
                new_entry["mapping_status"] = "pdf_candidate"
                new_entry["confidence"] = match["confidence"]
                if match["pdf_image_path"]:
                    new_entry["main_image"] = {
                        "source_type": "pdf_embedded",
                        "source_ref": match["pdf_image_path"],
                    }
                elif match["rendered_page_path"]:
                    new_entry["main_image"] = {
                        "source_type": "pdf_rendered_page",
                        "source_ref": match["rendered_page_path"],
                    }
                new_entry["pdf_evidence"] = {
                    "source_pdf": match["pdf_source"],
                    "page": match["pdf_page"],
                    "match_reason": match["match_reason"],
                    "pdf_product_name": match["pdf_name_raw"],
                }

            elif entry["mapping_status"] == "fuzzy":
                new_entry["pdf_evidence"] = {
                    "source_pdf": match["pdf_source"],
                    "page": match["pdf_page"],
                    "match_reason": match["match_reason"],
                    "pdf_product_name": match["pdf_name_raw"],
                    "pdf_image_path": match["pdf_image_path"],
                }
                new_entry["confidence"] = min(entry.get("confidence", 0.5) + 0.1, 0.8)

            updated_map.append(new_entry)
        else:
            updated_map.append(dict(entry))

    out_map = OUTPUT_DIR / "image-map.after-pdf.json"
    with open(out_map, "w", encoding="utf-8") as f:
        json.dump(updated_map, f, ensure_ascii=False, indent=2)
    print(f"\nWrote: {out_map}")

    out_review = OUTPUT_DIR / "pdf-fallback-review.json"
    with open(out_review, "w", encoding="utf-8") as f:
        json.dump(matches_list, f, ensure_ascii=False, indent=2)
    print(f"Wrote: {out_review} ({len(matches_list)} entries)")

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
        elif status == "missing":
            unresolved["still_missing_after_pdf"].append({
                "workbook_row_key": key,
                "collection": entry.get("collection_name_normalized"),
                "name": entry.get("canonical_name"),
                "code": entry.get("product_code_normalized"),
            })
        elif status == "fuzzy":
            has_pdf = "pdf_evidence" in entry
            unresolved["remaining_fuzzy"].append({
                "workbook_row_key": key,
                "collection": entry.get("collection_name_normalized"),
                "name": entry.get("canonical_name"),
                "has_pdf_evidence": has_pdf,
            })
        elif status == "pdf_candidate":
            unresolved["pdf_candidate_needs_review"].append({
                "workbook_row_key": key,
                "collection": entry.get("collection_name_normalized"),
                "name": entry.get("canonical_name"),
                "confidence": entry.get("confidence"),
                "pdf_evidence": entry.get("pdf_evidence"),
            })

    no_code = [e for e in updated_map if not e.get("product_code_normalized")]
    if no_code:
        unresolved["missing_product_code"] = [{
            "workbook_row_key": e["workbook_row_key"],
            "name": e.get("canonical_name"),
        } for e in no_code]

    out_unresolved = OUTPUT_DIR / "unresolved-image-matches.after-pdf.json"
    with open(out_unresolved, "w", encoding="utf-8") as f:
        json.dump(dict(unresolved), f, ensure_ascii=False, indent=2)
    print(f"Wrote: {out_unresolved}")

    print(f"\n{'=' * 60}")
    print("Final status distribution:")
    final_status = Counter(e["mapping_status"] for e in updated_map)
    for s, n in final_status.most_common():
        print(f"  {s}: {n}")

    total_matched = final_status.get("verified", 0) + final_status.get("promoted", 0) + final_status.get("pdf_candidate", 0)
    print(f"\n  Combined matched (ver+prom+pdf): {total_matched} / {len(updated_map)} = {total_matched/len(updated_map)*100:.1f}%")

    print(f"\nUnresolved queues:")
    total_unresolved = 0
    for q, items in sorted(unresolved.items()):
        print(f"  {q}: {len(items)}")
        total_unresolved += len(items)
    print(f"  TOTAL: {total_unresolved}")

    print(f"\nCollection coverage after PDF:")
    coll_stats = defaultdict(lambda: Counter())
    for entry in updated_map:
        coll = entry.get("collection_name_normalized", "unknown")
        coll_stats[coll][entry["mapping_status"]] += 1
        coll_stats[coll]["total"] += 1

    for coll in sorted(coll_stats.keys()):
        cs = coll_stats[coll]
        matched = cs.get("verified", 0) + cs.get("promoted", 0) + cs.get("pdf_candidate", 0)
        total = cs["total"]
        pct = matched / total * 100 if total > 0 else 0
        print(f"  {coll:25s} total={total:3d} ver={cs.get('verified',0):2d} "
              f"prom={cs.get('promoted',0):2d} pdf={cs.get('pdf_candidate',0):2d} "
              f"fuz={cs.get('fuzzy',0):2d} miss={cs.get('missing',0):2d} "
              f"blk={cs.get('blocked',0):2d} matched={pct:.0f}%")

    # Oxford-specific stats
    oxford_total = sum(1 for e in updated_map if e.get("collection_name_normalized") == "oxford")
    oxford_pdf = sum(1 for e in updated_map
                     if e.get("collection_name_normalized") == "oxford" and e["mapping_status"] == "pdf_candidate")
    print(f"\n  Oxford: {oxford_pdf}/{oxford_total} now have PDF candidate imagery")

    print("=" * 60)


if __name__ == "__main__":
    main()
