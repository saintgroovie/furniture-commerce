#!/usr/bin/env python3
"""
Extract images and render pages from PDF catalogs.

Extracts embedded images and renders pages at 200 DPI.
Creates asset manifest with metadata for each extracted asset.

Does NOT modify backend or storefront code.

Usage:
    python3 scripts/extract-pdf-assets.py

Requires: PyMuPDF (fitz), Pillow
"""

import hashlib
import io
import json
import os
import re
import sys
from collections import Counter
from pathlib import Path

import fitz
from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parent.parent
PDF_DIR = PROJECT_ROOT / "data" / "raw" / "pdf-assets" / "source-pdfs"
EXTRACTED_DIR = PROJECT_ROOT / "data" / "raw" / "pdf-assets" / "extracted"
PAGES_DIR = PROJECT_ROOT / "data" / "raw" / "pdf-assets" / "pages"
MANIFESTS_DIR = PROJECT_ROOT / "data" / "raw" / "pdf-assets" / "manifests"

MIN_IMAGE_SIZE = 200
PAGE_DPI = 200

PRIORITY_PDFS = [
    ("Oxford.pdf", "oxford"),
    ("Oxford_full.pdf", "oxford"),
    ("Country.pdf", "country-london-paris"),
    ("London.pdf", "country-london-paris"),
    ("Greenwich.pdf", "greenwich"),
    ("Monchelsea.pdf", "monchelsea"),
    ("Princess Rose.pdf", "princess-rose"),
    ("Oliver.pdf", "oliver"),
    ("Provence White.pdf", "provence"),
]

ARTICLE_CODE_RE = re.compile(r'\b([A-Z]{2})-?(\d{1,3})-(\d{1,2})\b')
PRODUCT_NAME_HINTS = re.compile(
    r'((?:кровать|комод|шкаф|стол|тумб|стеллаж|полк|кресл|банкетк|диван|этажерк|зеркал|стул)[а-яё]*)',
    re.IGNORECASE,
)


def make_asset_id(pdf_name, page, idx):
    raw = f"{pdf_name}:p{page}:i{idx}"
    return hashlib.md5(raw.encode()).hexdigest()[:12]


def classify_image(width, height, page_text):
    """Classify an extracted image by its likely purpose."""
    area = width * height
    if area < MIN_IMAGE_SIZE * MIN_IMAGE_SIZE:
        return "catalog_element", 0.1

    if width > 1000 and height > 1000:
        return "product_candidate", 0.5

    if width > 400 and height > 400:
        return "product_candidate", 0.4

    return "catalog_element", 0.2


def extract_text_hints(page_text):
    """Extract product codes and name hints from page text."""
    codes = ARTICLE_CODE_RE.findall(page_text)
    codes = [f"{c[0]}-{c[1]}-{c[2]}" for c in codes]

    names = PRODUCT_NAME_HINTS.findall(page_text)

    return codes, names


def extract_embedded_images(doc, pdf_name, collection):
    """Extract embedded images from PDF, filtering by size."""
    assets = []
    warnings = []
    seen_xrefs = set()

    for page_num in range(len(doc)):
        page = doc[page_num]
        page_text = page.get_text("text")
        codes, name_hints = extract_text_hints(page_text)
        images = page.get_images(full=True)

        for img_idx, img_info in enumerate(images):
            xref = img_info[0]
            if xref in seen_xrefs:
                continue
            seen_xrefs.add(xref)

            try:
                pix = fitz.Pixmap(doc, xref)

                if pix.n > 4:
                    pix = fitz.Pixmap(fitz.csRGB, pix)

                w, h = pix.width, pix.height

                if w < MIN_IMAGE_SIZE or h < MIN_IMAGE_SIZE:
                    continue

                asset_kind, confidence = classify_image(w, h, page_text)
                asset_id = make_asset_id(pdf_name, page_num + 1, img_idx)

                stem = pdf_name.replace(".pdf", "").replace(" ", "_")
                out_dir = EXTRACTED_DIR / stem
                out_dir.mkdir(parents=True, exist_ok=True)

                fname = f"{stem}_p{page_num+1}_i{img_idx}_{w}x{h}.png"
                out_path = out_dir / fname

                if pix.alpha:
                    pix2 = fitz.Pixmap(fitz.csRGB, pix)
                    pix2.save(str(out_path))
                    pix2 = None
                else:
                    pix.save(str(out_path))

                pix = None

                code_hint = codes[0] if codes else None
                name_hint = name_hints[0] if name_hints else None

                if code_hint:
                    confidence = min(confidence + 0.2, 0.8)

                assets.append({
                    "asset_id": asset_id,
                    "source_pdf": pdf_name,
                    "page_number": page_num + 1,
                    "extraction_type": "embedded_image",
                    "collection_hint": collection,
                    "product_code_hint": code_hint,
                    "product_name_hint": name_hint,
                    "asset_kind": asset_kind,
                    "file_path": str(out_path.relative_to(PROJECT_ROOT)),
                    "width": w,
                    "height": h,
                    "confidence": confidence,
                    "notes": f"Embedded image from page {page_num+1}",
                    "page_text_codes": codes,
                    "page_text_names": name_hints[:5],
                    "mapping_warnings": [],
                })

            except Exception as e:
                warnings.append({
                    "source_pdf": pdf_name,
                    "page": page_num + 1,
                    "image_index": img_idx,
                    "issue": str(e)[:200],
                })

    return assets, warnings


def render_pages(doc, pdf_name, collection):
    """Render each page as a high-resolution image."""
    assets = []

    stem = pdf_name.replace(".pdf", "").replace(" ", "_")
    out_dir = PAGES_DIR / stem
    out_dir.mkdir(parents=True, exist_ok=True)

    for page_num in range(len(doc)):
        page = doc[page_num]
        page_text = page.get_text("text")
        codes, name_hints = extract_text_hints(page_text)

        mat = fitz.Matrix(PAGE_DPI / 72, PAGE_DPI / 72)
        pix = page.get_pixmap(matrix=mat)

        fname = f"{stem}_page_{page_num+1:02d}.png"
        out_path = out_dir / fname
        pix.save(str(out_path))

        asset_id = make_asset_id(pdf_name, page_num + 1, "page")

        confidence = 0.3
        if codes:
            confidence = 0.4

        assets.append({
            "asset_id": asset_id,
            "source_pdf": pdf_name,
            "page_number": page_num + 1,
            "extraction_type": "rendered_page",
            "collection_hint": collection,
            "product_code_hint": codes[0] if codes else None,
            "product_name_hint": name_hints[0] if name_hints else None,
            "asset_kind": "catalog_page",
            "file_path": str(out_path.relative_to(PROJECT_ROOT)),
            "width": pix.width,
            "height": pix.height,
            "confidence": confidence,
            "notes": f"Rendered page {page_num+1} at {PAGE_DPI} DPI",
            "page_text_codes": codes,
            "page_text_names": name_hints[:5],
            "mapping_warnings": [],
        })

        pix = None

    return assets


def main():
    MANIFESTS_DIR.mkdir(parents=True, exist_ok=True)

    all_assets = []
    all_warnings = []
    pdf_stats = {}

    print("=" * 60)
    print("PDF Asset Extraction")
    print("=" * 60)

    for pdf_name, collection in PRIORITY_PDFS:
        pdf_path = PDF_DIR / pdf_name
        if not pdf_path.exists():
            print(f"\nSKIPPED (not found): {pdf_name}")
            all_warnings.append({
                "source_pdf": pdf_name,
                "issue": "PDF file not found",
            })
            continue

        print(f"\n--- {pdf_name} → {collection} ---")
        doc = fitz.open(str(pdf_path))
        print(f"  Pages: {len(doc)}")

        embedded, embed_warnings = extract_embedded_images(doc, pdf_name, collection)
        print(f"  Embedded images extracted: {len(embedded)}")

        pages = render_pages(doc, pdf_name, collection)
        print(f"  Pages rendered: {len(pages)}")

        all_assets.extend(embedded)
        all_assets.extend(pages)
        all_warnings.extend(embed_warnings)

        candidates = sum(1 for a in embedded if a["asset_kind"] == "product_candidate")
        with_codes = sum(1 for a in embedded + pages if a["product_code_hint"])

        pdf_stats[pdf_name] = {
            "collection": collection,
            "total_pages": len(doc),
            "embedded_images": len(embedded),
            "product_candidates": candidates,
            "pages_rendered": len(pages),
            "items_with_code_hints": with_codes,
        }

        doc.close()

    # Save manifest
    out_manifest = MANIFESTS_DIR / "pdf-asset-manifest.json"
    with open(out_manifest, "w", encoding="utf-8") as f:
        json.dump(all_assets, f, ensure_ascii=False, indent=2)
    print(f"\nWrote: {out_manifest} ({len(all_assets)} assets)")

    # Summary
    by_kind = Counter(a["asset_kind"] for a in all_assets)
    by_type = Counter(a["extraction_type"] for a in all_assets)
    with_codes = sum(1 for a in all_assets if a["product_code_hint"])

    summary = {
        "total_assets": len(all_assets),
        "by_kind": dict(by_kind.most_common()),
        "by_extraction_type": dict(by_type.most_common()),
        "assets_with_code_hints": with_codes,
        "total_warnings": len(all_warnings),
        "per_pdf": pdf_stats,
    }
    out_summary = MANIFESTS_DIR / "pdf-asset-summary.json"
    with open(out_summary, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(f"Wrote: {out_summary}")

    out_warnings = MANIFESTS_DIR / "pdf-extraction-warnings.json"
    with open(out_warnings, "w", encoding="utf-8") as f:
        json.dump(all_warnings, f, ensure_ascii=False, indent=2)
    print(f"Wrote: {out_warnings} ({len(all_warnings)} warnings)")

    print(f"\n{'=' * 60}")
    print("Summary:")
    for pdf_name, stats in pdf_stats.items():
        print(f"  {pdf_name:25s} embed={stats['embedded_images']:3d} cand={stats['product_candidates']:2d} "
              f"pages={stats['pages_rendered']:2d} codes={stats['items_with_code_hints']}")
    print(f"  Total: {len(all_assets)} assets, {with_codes} with code hints")
    print("=" * 60)


if __name__ == "__main__":
    main()
