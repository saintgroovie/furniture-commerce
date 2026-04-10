#!/usr/bin/env python3
"""
Greenwich Legacy Scrape & Image Mapping Script

Scrapes Greenwich product detail pages from woodright.ru,
extracts gallery images, matches to workbook rows,
and produces all output artifacts.

Data/asset task only — no backend/storefront code changes.
"""

import json
import os
import re
import hashlib
import time
import sys
from html.parser import HTMLParser
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_DIR = os.path.join(BASE_DIR, "data", "raw", "legacy", "cache")
RAW_DIR = os.path.join(BASE_DIR, "data", "raw", "legacy")
NORM_DIR = os.path.join(BASE_DIR, "data", "normalized")
DOCS_DIR = os.path.join(BASE_DIR, "docs")

GREENWICH_PRODUCT_URLS = [
    "https://woodright.ru/kollekcii/greenwich/komod-scale-ru-16/",
    "https://woodright.ru/kollekcii/greenwich/krovat-frame/",
    "https://woodright.ru/kollekcii/greenwich/krovat-cloud/",
    "https://woodright.ru/kollekcii/greenwich/krovat-plane/",
    "https://woodright.ru/kollekcii/greenwich/shkaf-vitrina-cristal/",
    "https://woodright.ru/kollekcii/greenwich/konsol-step/",
    "https://woodright.ru/kollekcii/greenwich/rabochiy-stol-base/",
    "https://woodright.ru/kollekcii/greenwich/prikrovatnaya-tumba-hole/",
    "https://woodright.ru/kollekcii/greenwich/prikrovatnaya-tumba-stone/",
    "https://woodright.ru/kollekcii/greenwich/garderob-level/",
    "https://woodright.ru/kollekcii/greenwich/garderob-total/",
]

TIMEOUT = 30
MAX_RETRIES = 3
POLITE_DELAY = 3


def cache_path(url):
    h = hashlib.md5(url.encode()).hexdigest()
    return os.path.join(CACHE_DIR, f"{h}.html")


def fetch_page(url):
    cp = cache_path(url)
    if os.path.exists(cp):
        with open(cp, "r", encoding="utf-8", errors="replace") as f:
            return f.read()

    for attempt in range(MAX_RETRIES):
        try:
            backoff = [5, 10, 20][attempt] if attempt > 0 else 0
            if attempt > 0:
                print(f"  Retry {attempt+1}/{MAX_RETRIES} for {url} (backoff {backoff}s)")
                time.sleep(backoff)

            req = Request(url, headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Woodright-Asset-Scraper/1.0",
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
            })
            resp = urlopen(req, timeout=TIMEOUT)
            html = resp.read().decode("utf-8", errors="replace")

            if len(html) < 1024:
                print(f"  WARNING: page too small ({len(html)} bytes), treating as partial")
                continue

            os.makedirs(CACHE_DIR, exist_ok=True)
            with open(cp, "w", encoding="utf-8") as f:
                f.write(html)
            return html

        except (URLError, HTTPError, TimeoutError, OSError) as e:
            print(f"  ERROR fetching {url}: {e}")
            continue

    return None


class GalleryExtractor(HTMLParser):
    """Extracts gallery images and title from a CS-Cart product detail page."""

    def __init__(self):
        super().__init__()
        self.gallery_urls = []
        self.in_h1 = False
        self.in_bdi = False
        self.title_parts = []
        self.current_tag = None

    def handle_starttag(self, tag, attrs):
        self.current_tag = tag
        attrs_dict = dict(attrs)

        if tag == "a":
            href = attrs_dict.get("href", "")
            if "/images/detailed/" in href and href.startswith("http"):
                if href not in self.gallery_urls:
                    self.gallery_urls.append(href)

        if tag == "h1":
            self.in_h1 = True
        if tag == "bdi" and self.in_h1:
            self.in_bdi = True

    def handle_endtag(self, tag):
        if tag == "bdi":
            self.in_bdi = False
        if tag == "h1":
            self.in_h1 = False

    def handle_data(self, data):
        if self.in_bdi or (self.in_h1 and not self.in_bdi):
            self.title_parts.append(data.strip())

    def get_title(self):
        return " ".join(self.title_parts).strip()


def extract_code_from_filename(url):
    """Try to extract article code from image filename."""
    filename = url.rsplit("/", 1)[-1] if "/" in url else url
    filename = filename.split("?")[0]
    m = re.match(r"^([a-z]{2})-(\d{2})-(\d+)", filename, re.IGNORECASE)
    if m:
        return f"{m.group(1).upper()}-{m.group(2)}-{m.group(3)}"
    return None


def extract_additional_images_from_html(html_text, main_image_url):
    """
    Also look for images in thumbnails or data attributes that might not be
    in lightbox <a> tags but in the product gallery markup.
    """
    extra = []
    pattern = r'https://woodright\.ru/images/detailed/\d+/[^\s"\'<>]+'
    for match in re.findall(pattern, html_text):
        clean = match.rstrip("\\").rstrip(")")
        if clean not in extra:
            extra.append(clean)
    return extra


def scrape_greenwich_detail_pages():
    """Fetch detail pages and extract gallery data."""
    results = []
    warnings = []

    for i, url in enumerate(GREENWICH_PRODUCT_URLS):
        print(f"[{i+1}/{len(GREENWICH_PRODUCT_URLS)}] Fetching: {url}")
        html = fetch_page(url)

        if html is None:
            print(f"  FAILED: could not fetch {url}")
            warnings.append({
                "url": url,
                "issue": "fetch_failed",
                "details": "Could not fetch after retries"
            })
            results.append({
                "page_url": url,
                "product_title_raw": None,
                "product_code_raw": None,
                "collection_hint": "greenwich",
                "main_image_url": None,
                "gallery_image_urls": [],
                "scrape_status": "failed",
                "scrape_warnings": ["fetch_failed"]
            })
            continue

        extractor = GalleryExtractor()
        try:
            extractor.feed(html)
        except Exception as e:
            print(f"  Parse error: {e}")

        title = extractor.get_title()
        gallery = extractor.gallery_urls

        all_detailed = extract_additional_images_from_html(html, "")
        for img in all_detailed:
            if img not in gallery:
                gallery.append(img)

        main_image = gallery[0] if gallery else None
        gallery_rest = gallery[1:] if len(gallery) > 1 else []

        codes_found = []
        for img_url in gallery:
            code = extract_code_from_filename(img_url)
            if code:
                codes_found.append(code)

        product_code = codes_found[0] if codes_found else None

        page_warnings = []
        if not title:
            page_warnings.append("no_title_found")
        if not main_image:
            page_warnings.append("no_image_found")
        if not product_code:
            page_warnings.append("no_code_in_filename")
        if len(gallery) == 0:
            page_warnings.append("no_gallery_images")

        if page_warnings:
            warnings.append({
                "url": url,
                "issue": "; ".join(page_warnings),
                "product_title": title,
                "collection_hint": "greenwich"
            })

        result = {
            "page_url": url,
            "product_title_raw": title if title else None,
            "product_code_raw": product_code,
            "product_code_from_image": product_code,
            "collection_hint": "greenwich",
            "category_hint": url.rstrip("/").split("/")[-1],
            "main_image_url": main_image,
            "gallery_image_urls": gallery_rest,
            "all_image_urls": gallery,
            "article_codes_found": list(set(codes_found)),
            "scrape_status": "success" if main_image else "partial",
            "scrape_warnings": page_warnings
        }

        results.append(result)
        print(f"  Title: {title}")
        print(f"  Main image: {main_image}")
        print(f"  Gallery images: {len(gallery_rest)}")
        print(f"  Codes found: {codes_found}")

        if not os.path.exists(cache_path(url)):
            time.sleep(POLITE_DELAY)

    return results, warnings


def load_workbook_greenwich():
    """Load Greenwich rows from parsed workbook."""
    wb_path = os.path.join(BASE_DIR, "data", "raw", "workbook", "parsed-sheets.json")
    with open(wb_path, "r", encoding="utf-8") as f:
        all_rows = json.load(f)

    return [r for r in all_rows if r.get("source_sheet") == "ГРИНВИЧ"]


def load_existing_image_map():
    """Load existing image map to check for disk/front images."""
    im_path = os.path.join(NORM_DIR, "image-map.after-front.json")
    if not os.path.exists(im_path):
        return []
    with open(im_path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_legacy_listing_data():
    """Load existing legacy listing data for Greenwich."""
    lp_path = os.path.join(RAW_DIR, "legacy-products.json")
    with open(lp_path, "r", encoding="utf-8") as f:
        all_products = json.load(f)
    return [p for p in all_products if p.get("collection_hint") == "greenwich"]


def normalize_name(name):
    """Normalize a product name for fuzzy matching."""
    if not name:
        return ""
    n = name.lower().strip()
    n = re.sub(r'\s+', ' ', n)
    n = re.sub(r'[«»""\'`]', '', n)
    n = n.replace('ё', 'е')
    return n


def match_greenwich(wb_rows, scraped, listing_data, existing_map):
    """Match scraped Greenwich products to workbook rows."""
    image_map = []
    review_queue = []

    existing_by_key_name = {}
    for entry in existing_map:
        if entry.get("collection_name_normalized") == "greenwich":
            compound = (entry["workbook_row_key"], entry.get("canonical_name", ""))
            existing_by_key_name[compound] = entry

    legacy_name_lookup = {}
    for s in scraped:
        if s["product_title_raw"]:
            legacy_name_lookup[normalize_name(s["product_title_raw"])] = s
    for s in listing_data:
        title = s.get("product_title_raw", "")
        if title:
            legacy_name_lookup[normalize_name(title)] = s

    name_mapping = {
        "Комод": ["Комод Scale", "Scale"],
        "Консоль": ["Консоль Step", "Step"],
        "Рабочий стол": ["Рабочий стол Base", "Base"],
        "Шкаф-витрина Кристалл": ["Шкаф-витрина Cristal", "Cristal"],
        "Прикроватная тумба с 2 ящиками": ["Прикроватная тумба Hole", "Hole"],
        "Прикроватная тумба с 1 ящиком": ["Прикроватная тумба Stone", "Stone"],
        "Гардероб 2 -х дв.  с ящиками": ["Гардероб Level", "Level"],
        "Гардероб 2-дв.": ["Гардероб Total", "Total"],
        "Зеркало навесное": [],
        "Тумба ТВ": [],
        "Кровать  1-сп. (90*200)": ["Кровать Frame", "Кровать Cloud", "Кровать Plane"],
        "Кровать  1,5-сп. (120*200)": ["Кровать Frame", "Кровать Cloud", "Кровать Plane"],
        "Кровать  1,5-сп. (140*200)": ["Кровать Frame", "Кровать Cloud", "Кровать Plane"],
        "Кровать  2-сп. (160*200)": ["Кровать Frame", "Кровать Cloud", "Кровать Plane"],
        "Кровать  2-сп. (180*200)": ["Кровать Frame", "Кровать Cloud", "Кровать Plane"],
    }

    specific_match = {
        "GR-05-1": "Комод Scale",
        "GR-44-1": "Консоль Step",
        "GR-67-1": "Рабочий стол Base",
        "GR-26-1": "Шкаф-витрина Cristal",
        "GR-08-1": "Прикроватная тумба Hole",
        "GR-08-2": "Прикроватная тумба Stone",
        "GR-02-1": "Гардероб Level",
        "GR-02-2": "Гардероб Total",
    }

    bed_models = {
        "Кровать Frame": None,
        "Кровать Cloud": None,
        "Кровать Plane": None,
    }
    for s in scraped:
        t = s.get("product_title_raw", "")
        if t in bed_models:
            bed_models[t] = s

    for wb in wb_rows:
        code = wb["product_code_normalized"]
        name = wb["product_name_canonical"]
        key = f"greenwich:{code}"

        existing = existing_by_key_name.get((key, name), {})
        existing_status = existing.get("mapping_status", "")
        existing_source = existing.get("main_image", {}).get("source_type", "")
        has_disk_image = existing_source in ("disk_verified", "product_photos", "front_folder")
        has_pdf_image = existing_source == "pdf_embedded" or existing_status == "pdf_candidate"

        matched_legacy = None
        match_confidence = 0.0
        match_basis = "no_match"

        if code in specific_match:
            target_name = specific_match[code]
            for s in scraped:
                if s.get("product_title_raw") == target_name:
                    matched_legacy = s
                    break
            if not matched_legacy:
                for s in listing_data:
                    if s.get("product_title_raw") == target_name:
                        matched_legacy = s
                        break

            if matched_legacy:
                if code in ("GR-05-1", "GR-44-1", "GR-67-1"):
                    match_basis = "exact_canonical_name_within_greenwich"
                    match_confidence = 0.8
                elif code == "GR-26-1":
                    match_basis = "abbreviation_match"
                    match_confidence = 0.85
                else:
                    match_basis = "manual_greenwich_mapping"
                    match_confidence = 0.75

        elif "Кровать" in name:
            for bed_name, bed_data in bed_models.items():
                if bed_data:
                    matched_legacy = bed_data
                    match_basis = "greenwich_bed_type_match"
                    match_confidence = 0.5
                    break

        legacy_main = None
        legacy_gallery = []
        legacy_url = None
        legacy_title = None

        if matched_legacy:
            legacy_url = matched_legacy.get("page_url")
            legacy_title = matched_legacy.get("product_title_raw")
            mi = matched_legacy.get("main_image_url")
            gi = matched_legacy.get("gallery_image_urls", [])
            all_imgs = matched_legacy.get("all_image_urls", [])

            if mi:
                legacy_main = {
                    "url": mi,
                    "source_type": "legacy_site",
                    "source_ref": mi,
                    "provenance": {
                        "scraped_from": legacy_url,
                        "scrape_date": time.strftime("%Y-%m-%d"),
                        "original_filename": mi.rsplit("/", 1)[-1] if "/" in mi else mi
                    }
                }

            for g in (all_imgs[1:] if all_imgs else gi):
                legacy_gallery.append({
                    "url": g,
                    "source_type": "legacy_site",
                    "source_ref": g,
                    "provenance": {
                        "scraped_from": legacy_url,
                        "scrape_date": time.strftime("%Y-%m-%d"),
                        "original_filename": g.rsplit("/", 1)[-1] if "/" in g else g
                    }
                })

        # Source priority: disk white-background verified > verified legacy product image > legacy gallery/fallback
        preferred_main = None
        final_gallery = []
        source_decision = "no_source"

        if has_disk_image:
            preferred_main = existing.get("main_image")
            source_decision = "disk_preferred"
            if legacy_main:
                final_gallery.append(legacy_main)
            final_gallery.extend(legacy_gallery)
        elif has_pdf_image and match_confidence < 0.8:
            preferred_main = existing.get("main_image")
            source_decision = "pdf_preferred_low_legacy_confidence"
            if legacy_main:
                final_gallery.append(legacy_main)
            final_gallery.extend(legacy_gallery)
        elif legacy_main and match_confidence >= 0.75:
            preferred_main = {
                "source_type": "legacy_site",
                "source_ref": legacy_main["url"],
                "is_verified": match_confidence >= 0.8,
                "confidence": match_confidence
            }
            source_decision = "legacy_preferred"
            final_gallery.extend(legacy_gallery)
        elif legacy_main:
            if has_pdf_image:
                preferred_main = existing.get("main_image")
                source_decision = "pdf_kept_legacy_as_gallery"
            else:
                preferred_main = {
                    "source_type": "legacy_site",
                    "source_ref": legacy_main["url"],
                    "is_verified": False,
                    "confidence": match_confidence
                }
                source_decision = "legacy_fallback"
            if legacy_main and source_decision != "legacy_preferred":
                if not any(g.get("url") == legacy_main.get("url") for g in final_gallery):
                    final_gallery.insert(0, legacy_main)
            final_gallery.extend(legacy_gallery)
        elif has_pdf_image:
            preferred_main = existing.get("main_image")
            source_decision = "pdf_only"
        else:
            source_decision = "no_source"

        if match_confidence >= 0.75:
            status = "verified" if match_confidence >= 0.8 else "high_confidence"
        elif match_confidence >= 0.5:
            status = "fuzzy"
        elif matched_legacy:
            status = "low_confidence"
        elif has_pdf_image or has_disk_image:
            status = existing_status
        else:
            status = "missing"

        entry = {
            "workbook_row_key": key,
            "product_code_normalized": code,
            "canonical_name": name,
            "collection": "greenwich",
            "main_image": preferred_main,
            "gallery_images": final_gallery,
            "mapping_status": status,
            "confidence": match_confidence,
            "match_basis": match_basis,
            "source_type": source_decision,
            "source_decision_reason": source_decision,
            "legacy_page_url": legacy_url,
            "legacy_title_matched": legacy_title,
            "review_notes": _review_note(status, match_basis, source_decision, code, name),
        }

        image_map.append(entry)

        if status in ("fuzzy", "low_confidence", "missing"):
            review_queue.append(entry)

    return image_map, review_queue


def _review_note(status, basis, source_decision, code, name):
    parts = []
    if status == "missing":
        parts.append(f"No legacy or disk image for {code} ({name})")
    elif status == "fuzzy":
        parts.append(f"Legacy match is fuzzy ({basis}) — needs manual review")
    elif status == "verified":
        parts.append(f"High-confidence legacy match ({basis})")
    elif status == "high_confidence":
        parts.append(f"Good match ({basis}) — near verified")

    if source_decision == "disk_preferred":
        parts.append("Disk image is preferred over legacy")
    elif source_decision == "pdf_preferred_low_legacy_confidence":
        parts.append("PDF image preferred; legacy confidence too low for main")
    elif source_decision == "legacy_preferred":
        parts.append("Legacy image used as main")
    elif source_decision == "legacy_fallback":
        parts.append("Legacy image used as fallback (low confidence)")
    elif source_decision == "pdf_kept_legacy_as_gallery":
        parts.append("PDF image kept as main; legacy added to gallery")

    return "; ".join(parts) if parts else ""


def generate_report(wb_rows, scraped, image_map, review_queue, warnings):
    """Generate final markdown report."""
    total_wb = len(wb_rows)
    total_legacy = len(scraped)
    success_scrape = sum(1 for s in scraped if s["scrape_status"] == "success")
    total_main = sum(1 for s in scraped if s.get("main_image_url"))
    total_gallery = sum(len(s.get("gallery_image_urls", [])) for s in scraped)
    total_all_imgs = sum(len(s.get("all_image_urls", [])) for s in scraped)

    verified_count = sum(1 for e in image_map if e["mapping_status"] in ("verified", "high_confidence", "promoted"))
    fuzzy_count = sum(1 for e in image_map if e["mapping_status"] == "fuzzy")
    missing_count = sum(1 for e in image_map if e["mapping_status"] in ("missing", "low_confidence"))

    legacy_as_main = sum(1 for e in image_map if e.get("source_decision_reason") == "legacy_preferred")
    legacy_as_gallery = sum(1 for e in image_map
                           if e.get("source_decision_reason") in ("disk_preferred", "pdf_preferred_low_legacy_confidence", "pdf_kept_legacy_as_gallery"))
    disk_better = sum(1 for e in image_map if e.get("source_decision_reason") == "disk_preferred")
    pdf_only = sum(1 for e in image_map if e.get("source_decision_reason") in ("pdf_only", "pdf_candidate"))

    report = f"""# Greenwich Legacy Image Report

Generated: {time.strftime("%Y-%m-%d %H:%M")}

---

## Summary

| Metric | Count |
|--------|-------|
| Greenwich products in workbook | {total_wb} |
| Greenwich product pages on legacy site | {total_legacy} |
| Successfully scraped detail pages | {success_scrape} |
| Main images extracted | {total_main} |
| Gallery images extracted (additional) | {total_gallery} |
| Total unique images extracted | {total_all_imgs} |

---

## Matching Results

| Status | Count | Description |
|--------|-------|-------------|
| Verified / High confidence | {verified_count} | Reliable match to workbook row |
| Fuzzy | {fuzzy_count} | Needs manual review |
| Missing / Low confidence | {missing_count} | No reliable image source |

---

## Source Decisions

| Decision | Count | Meaning |
|----------|-------|---------|
| Legacy as preferred main | {legacy_as_main} | Legacy image is main product shot |
| Legacy as gallery/fallback only | {legacy_as_gallery} | Better source exists for main |
| Disk source preferred | {disk_better} | Disk white-bg image already better |
| PDF only | {pdf_only} | Only PDF-extracted image available |

---

## Greenwich Workbook Coverage

| Code | Name | Match Status | Confidence | Source Decision |
|------|------|-------------|------------|----------------|
"""
    for e in sorted(image_map, key=lambda x: x["product_code_normalized"]):
        report += f"| {e['product_code_normalized']} | {e['canonical_name']} | {e['mapping_status']} | {e['confidence']:.2f} | {e['source_decision_reason']} |\n"

    report += f"""
---

## Greenwich Legacy Scrape Coverage

| # | Legacy Title | URL | Main Image | Gallery Count |
|---|-------------|-----|-----------|---------------|
"""
    for i, s in enumerate(scraped):
        title = s.get("product_title_raw", "N/A")
        url = s["page_url"].replace("https://woodright.ru", "")
        main = "✓" if s.get("main_image_url") else "✗"
        gc = len(s.get("gallery_image_urls", []))
        report += f"| {i+1} | {title} | `{url}` | {main} | {gc} |\n"

    report += """
---

## Preferred vs Fallback Source Decisions

"""
    for e in image_map:
        code = e["product_code_normalized"]
        name = e["canonical_name"]
        sd = e.get("source_decision_reason", "unknown")
        notes = e.get("review_notes", "")
        report += f"- **{code}** ({name}): {sd}"
        if notes:
            report += f" — {notes}"
        report += "\n"

    report += """
---

## Remaining Unresolved Greenwich Items

"""
    unresolved = [e for e in image_map if e["mapping_status"] in ("fuzzy", "missing", "low_confidence")]
    if unresolved:
        for e in unresolved:
            report += f"- **{e['product_code_normalized']}** ({e['canonical_name']}): status={e['mapping_status']}, "
            report += f"confidence={e['confidence']:.2f}, basis={e['match_basis']}\n"
    else:
        report += "All Greenwich items have at least high-confidence matches.\n"

    report += """
---

## Scrape Warnings

"""
    if warnings:
        for w in warnings:
            report += f"- `{w.get('url', 'N/A')}`: {w.get('issue', 'unknown')}\n"
    else:
        report += "No warnings.\n"

    report += """
---

## Recommended Next Steps

1. **Manual review** of fuzzy matches in `data/normalized/greenwich-review-queue.json`
2. **Verify bed mappings**: Greenwich beds (Frame/Cloud/Plane) are design variants, not size variants — confirm which bed design maps to which workbook size entry
3. **Check if disk images exist** for GR-09-1 (Зеркало навесное) and GR-42-1 (Тумба ТВ) which have no legacy match
4. **Download preferred legacy images** to local storage for items where legacy is the selected main source
5. **Do not replace** any confirmed disk white-background image with a legacy interior shot

---

## Created Files

- `data/raw/legacy/greenwich-products.json` — raw scraped Greenwich data
- `data/raw/legacy/greenwich-products-summary.json` — scrape summary
- `data/raw/legacy/greenwich-scrape-warnings.json` — scrape warnings
- `data/normalized/greenwich-image-map.json` — Greenwich image mapping
- `data/normalized/greenwich-review-queue.json` — items needing review
- `docs/collections/greenwich/greenwich-legacy-image-report.md` — this report
"""
    return report


def main():
    print("=" * 60)
    print("Greenwich Legacy Scrape & Image Mapping")
    print("=" * 60)

    # Step 1: Load workbook Greenwich
    print("\n--- Loading workbook Greenwich rows ---")
    wb_rows = load_workbook_greenwich()
    print(f"  Found {len(wb_rows)} Greenwich products in workbook")

    # Step 2: Load existing legacy listing data
    print("\n--- Loading existing legacy listing data ---")
    listing_data = load_legacy_listing_data()
    print(f"  Found {len(listing_data)} Greenwich products in existing listing scrape")

    # Step 3: Load existing image map
    print("\n--- Loading existing image map ---")
    existing_map = load_existing_image_map()
    greenwich_existing = [e for e in existing_map if e.get("collection_name_normalized") == "greenwich"]
    print(f"  Found {len(greenwich_existing)} Greenwich entries in existing image map")

    # Step 4: Scrape detail pages
    print("\n--- Scraping Greenwich detail pages ---")
    scraped, warnings = scrape_greenwich_detail_pages()
    print(f"  Scraped {len(scraped)} pages, {len(warnings)} warnings")

    # Step 5: Match to workbook
    print("\n--- Matching scraped data to workbook ---")
    image_map, review_queue = match_greenwich(wb_rows, scraped, listing_data, existing_map)
    print(f"  Created {len(image_map)} image map entries")
    print(f"  {len(review_queue)} items in review queue")

    # Step 6: Save outputs
    print("\n--- Saving outputs ---")

    os.makedirs(RAW_DIR, exist_ok=True)
    os.makedirs(NORM_DIR, exist_ok=True)
    os.makedirs(DOCS_DIR, exist_ok=True)

    with open(os.path.join(RAW_DIR, "greenwich-products.json"), "w", encoding="utf-8") as f:
        json.dump(scraped, f, ensure_ascii=False, indent=2)
    print(f"  Saved greenwich-products.json")

    summary = {
        "total_products_scraped": len(scraped),
        "products_with_image": sum(1 for s in scraped if s.get("main_image_url")),
        "products_with_gallery": sum(1 for s in scraped if s.get("gallery_image_urls")),
        "total_gallery_images": sum(len(s.get("gallery_image_urls", [])) for s in scraped),
        "total_all_images": sum(len(s.get("all_image_urls", [])) for s in scraped),
        "products_with_code": sum(1 for s in scraped if s.get("product_code_from_image")),
        "scrape_statuses": {
            "success": sum(1 for s in scraped if s["scrape_status"] == "success"),
            "partial": sum(1 for s in scraped if s["scrape_status"] == "partial"),
            "failed": sum(1 for s in scraped if s["scrape_status"] == "failed"),
        },
        "detail_pages_fetched": True,
        "collection_scope": "greenwich_only",
        "scrape_date": time.strftime("%Y-%m-%d")
    }
    with open(os.path.join(RAW_DIR, "greenwich-products-summary.json"), "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(f"  Saved greenwich-products-summary.json")

    with open(os.path.join(RAW_DIR, "greenwich-scrape-warnings.json"), "w", encoding="utf-8") as f:
        json.dump(warnings, f, ensure_ascii=False, indent=2)
    print(f"  Saved greenwich-scrape-warnings.json")

    with open(os.path.join(NORM_DIR, "greenwich-image-map.json"), "w", encoding="utf-8") as f:
        json.dump(image_map, f, ensure_ascii=False, indent=2)
    print(f"  Saved greenwich-image-map.json")

    with open(os.path.join(NORM_DIR, "greenwich-review-queue.json"), "w", encoding="utf-8") as f:
        json.dump(review_queue, f, ensure_ascii=False, indent=2)
    print(f"  Saved greenwich-review-queue.json")

    # Step 7: Generate report
    print("\n--- Generating report ---")
    report = generate_report(wb_rows, scraped, image_map, review_queue, warnings)
    with open(os.path.join(DOCS_DIR, "greenwich-legacy-image-report.md"), "w", encoding="utf-8") as f:
        f.write(report)
    print(f"  Saved greenwich-legacy-image-report.md")

    print("\n" + "=" * 60)
    print("DONE")
    print("=" * 60)


if __name__ == "__main__":
    main()
