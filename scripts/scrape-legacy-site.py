#!/usr/bin/env python3
"""
Scrape product imagery from legacy woodright.ru site.

Polite, cached, rerunnable scraper that extracts product URLs and images
from CS-Cart category listing pages by parsing form-based product card blocks.

Does NOT modify backend or storefront code.

Usage:
    python3 scripts/scrape-legacy-site.py [--no-cache] [--detail-pages]

    --no-cache       Ignore cached HTML files, re-download everything
    --detail-pages   Also fetch individual product detail pages (slow)

Output:
    data/raw/legacy/legacy-products.json
    data/raw/legacy/legacy-products-summary.json
    data/raw/legacy/legacy-scrape-warnings.json
"""

import hashlib
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path
from collections import Counter

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = PROJECT_ROOT / "data" / "raw" / "legacy" / "cache"
OUTPUT_DIR = PROJECT_ROOT / "data" / "raw" / "legacy"

BASE_URL = "https://woodright.ru"

REQUEST_TIMEOUT = 30
MAX_RETRIES = 3
BACKOFF_SECONDS = [5, 10, 20]
POLITE_DELAY = 3
MAX_PAGES = 30

CATEGORY_SLUGS = [
    "banketki-i-skami",
    "interiernye-kartiny",
    "detskie-krovatki",
    "divany",
    "komody",
    "kresla",
    "krovati",
    "polki",
    "decor",
    "stellazhi",
    "stoly-i-stoliki",
    "stulya-taburetki",
    "tumby",
    "shkafy",
]

VV_PAINTING_SLUGS = [
    "sweet-home", "albion", "rural-scenery", "templars", "infanta",
    "royal-lilies", "teddy-bear", "ants-village", "brigantine-blue",
    "briganrine-ivory", "fairies", "fantasy-kingdom", "royal-guardsmen",
    "tiggy-winkle", "pastoral", "ballet", "tommy", "alice",
]

COLLECTION_FROM_URL = {
    "oliver": "oliver",
    "greenwich": "greenwich",
    "monchelsea": "monchelsea",
    "oxford": "oxford",
    "provence": "provence",
    "princess-rose": "princess-rose",
    "country": "country-london-paris",
    "london": "country-london-paris",
    "paris": "country-london-paris",
}
for slug in VV_PAINTING_SLUGS:
    COLLECTION_FROM_URL[slug] = "willie-winkie"

ARTICLE_CODE_PREFIXES = {
    "ol": "OL", "gr": "GR", "mn": "MN", "ww": "WW",
    "ox": "OX", "pr": "PR", "co": "CO", "ro": "RO",
    "fa": "FA", "tb": "TB", "al": "AL",
}


def cache_key(url):
    return hashlib.md5(url.encode()).hexdigest()


def fetch_url(url, use_cache=True):
    """Fetch URL with retry, timeout, and caching."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    ck = cache_key(url)
    cache_file = CACHE_DIR / f"{ck}.html"

    if use_cache and cache_file.exists():
        with open(cache_file, "r", encoding="utf-8", errors="replace") as f:
            return f.read(), "cached"

    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                                  "Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml",
                    "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.5",
                }
            )
            with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
                if resp.status == 200:
                    html = resp.read().decode("utf-8", errors="replace")
                    if len(html) < 500:
                        raise ValueError("Page too small, likely error")
                    with open(cache_file, "w", encoding="utf-8") as f:
                        f.write(html)
                    return html, "fetched"
                elif resp.status == 404:
                    return None, "not_found"
                else:
                    raise urllib.error.HTTPError(
                        url, resp.status, "unexpected", resp.headers, None
                    )
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None, "not_found"
            if attempt < MAX_RETRIES - 1:
                wait = BACKOFF_SECONDS[min(attempt, len(BACKOFF_SECONDS) - 1)]
                print(f"    Retry {attempt+1}/{MAX_RETRIES} in {wait}s: HTTP {e.code}")
                time.sleep(wait)
            else:
                return None, f"failed: HTTP {e.code}"
        except (urllib.error.URLError, ValueError, OSError) as e:
            if attempt < MAX_RETRIES - 1:
                wait = BACKOFF_SECONDS[min(attempt, len(BACKOFF_SECONDS) - 1)]
                print(f"    Retry {attempt+1}/{MAX_RETRIES} in {wait}s: {str(e)[:80]}")
                time.sleep(wait)
            else:
                return None, f"failed: {str(e)[:100]}"

    return None, "failed: max retries"


def extract_products_from_listing(html, category_slug):
    """Extract product links and thumbnails by parsing <form> card blocks."""
    products = []

    form_starts = list(re.finditer(r'<form[^>]*name="product_form_(\d+)"[^>]*>', html))

    for i, fm in enumerate(form_starts):
        product_id = fm.group(1)
        block_start = fm.start()
        form_end = html.find("</form>", block_start)
        if form_end < 0:
            continue
        block = html[block_start:form_end + 7]

        title_match = re.search(
            r'class="product-title"[^>]*title="([^"]*)"', block
        )
        url_match = re.search(
            r'<a[^>]*href="(https://woodright\.ru/[^"]+)"[^>]*class="product-title"',
            block
        )
        if not url_match:
            url_match = re.search(
                r'class="product-title"[^>]*href="(https://woodright\.ru/[^"]+)"',
                block
            )

        thumb_match = re.search(
            r'(?:src|data-src)="(https://woodright\.ru/images/thumbnails/\d+/\d+/detailed/[^"\s]+)',
            block
        )

        if not title_match or not url_match:
            continue

        title = title_match.group(1).strip()
        page_url = url_match.group(1).strip()
        thumb_url = thumb_match.group(1).split(" ")[0] if thumb_match else None

        collection_hint = extract_collection_from_url(page_url)
        code_from_thumb = extract_code_from_filename(thumb_url) if thumb_url else None

        products.append({
            "page_url": page_url,
            "product_title_raw": title,
            "product_code_raw": None,
            "product_code_from_image": code_from_thumb,
            "category_hint": category_slug,
            "collection_hint": collection_hint,
            "main_image_url": thumb_to_full(thumb_url) if thumb_url else None,
            "gallery_image_urls": [],
            "thumbnail_url": thumb_url,
            "cs_cart_product_id": product_id,
            "scrape_status": "listing_only",
            "scrape_warnings": [],
        })

    return products


def extract_detail_page(html, base_record):
    """Enrich a product record with detail page data (gallery images)."""
    record = dict(base_record)

    title_match = re.search(r'<h1[^>]*>\s*(?:<bdi>)?\s*([^<]+)', html)
    if title_match:
        record["product_title_raw"] = title_match.group(1).strip()

    lightbox_imgs = re.findall(
        r'href="(https://woodright\.ru/images/detailed/[^"]+)"', html
    )
    lightbox_imgs = list(dict.fromkeys(lightbox_imgs))

    if lightbox_imgs:
        record["main_image_url"] = lightbox_imgs[0]
        record["gallery_image_urls"] = lightbox_imgs[1:] if len(lightbox_imgs) > 1 else []

        code = extract_code_from_filename(lightbox_imgs[0])
        if code:
            record["product_code_from_image"] = code

    record["scrape_status"] = "detail_scraped"
    return record


def extract_collection_from_url(url):
    """Infer workbook collection from product URL."""
    path = url.replace(BASE_URL, "").strip("/")
    parts = path.split("/")

    if len(parts) >= 2 and parts[0] == "kollekcii":
        slug = parts[1]
        return COLLECTION_FROM_URL.get(slug, slug)

    if parts[0] in COLLECTION_FROM_URL:
        return COLLECTION_FROM_URL[parts[0]]

    return None


def extract_code_from_filename(url):
    """Try to extract article code from image filename."""
    if not url:
        return None

    fname = url.rstrip("/").split("/")[-1]
    fname = fname.split("?")[0]
    fname_lower = fname.lower()

    match = re.match(r'^([a-z]{2})-(\d{1,3})-(\d{1,2})', fname_lower)
    if match:
        prefix = match.group(1)
        num1 = match.group(2)
        num2 = match.group(3)
        code_prefix = ARTICLE_CODE_PREFIXES.get(prefix, prefix.upper())
        return f"{code_prefix}-{num1}-{num2}"

    return None


def thumb_to_full(thumb_url):
    """Convert thumbnail URL to full-resolution URL."""
    if not thumb_url:
        return None
    cleaned = thumb_url.split(" ")[0]
    return re.sub(
        r'/images/thumbnails/\d+/\d+/detailed/',
        '/images/detailed/',
        cleaned
    )


def main():
    use_cache = "--no-cache" not in sys.argv
    fetch_details = "--detail-pages" in sys.argv

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    all_products = []
    warnings = []
    category_stats = {}
    seen_urls = set()

    print("=" * 60)
    print("Legacy Site Scraper — woodright.ru")
    print(f"Cache: {'enabled' if use_cache else 'disabled'}")
    print(f"Detail pages: {'yes' if fetch_details else 'no (listing only)'}")
    print("=" * 60)

    for cat_slug in CATEGORY_SLUGS:
        print(f"\n--- Category: {cat_slug} ---")
        cat_products = []

        for page_num in range(1, MAX_PAGES + 1):
            if page_num == 1:
                url = f"{BASE_URL}/predmety/{cat_slug}/"
            else:
                url = f"{BASE_URL}/predmety/{cat_slug}/?page={page_num}"

            print(f"  Page {page_num}: {url}")
            html, status = fetch_url(url, use_cache=use_cache)

            if html is None:
                print(f"    Status: {status}")
                if "not_found" not in status:
                    warnings.append({
                        "url": url,
                        "category": cat_slug,
                        "page": page_num,
                        "issue": f"listing_fetch_{status}",
                    })
                break

            print(f"    Status: {status} ({len(html)} bytes)")
            products = extract_products_from_listing(html, cat_slug)

            new_on_page = 0
            for p in products:
                if p["page_url"] not in seen_urls:
                    seen_urls.add(p["page_url"])
                    cat_products.append(p)
                    new_on_page += 1

            print(f"    Products: {len(products)} found, {new_on_page} new")

            if len(products) == 0 or new_on_page == 0:
                break

            if status == "fetched":
                time.sleep(POLITE_DELAY)

        category_stats[cat_slug] = len(cat_products)
        all_products.extend(cat_products)
        print(f"  Total unique for {cat_slug}: {len(cat_products)}")

    print(f"\n{'=' * 60}")
    print(f"Listing scrape complete: {len(all_products)} unique products")

    if fetch_details:
        print(f"\n--- Fetching {len(all_products)} detail pages ---")
        for i, prod in enumerate(all_products):
            url = prod["page_url"]
            print(f"  [{i+1}/{len(all_products)}] {prod['product_title_raw'][:50]}")
            html, status = fetch_url(url, use_cache=use_cache)

            if html is None:
                prod["scrape_status"] = f"detail_failed: {status}"
                prod["scrape_warnings"].append(f"detail_page_{status}")
                warnings.append({
                    "url": url,
                    "issue": f"detail_fetch_{status}",
                    "product_title": prod["product_title_raw"],
                })
            else:
                enriched = extract_detail_page(html, prod)
                all_products[i] = enriched
                print(f"    Gallery: {len(enriched.get('gallery_image_urls', []))} images")

            if status == "fetched":
                time.sleep(POLITE_DELAY)

    for p in all_products:
        if p["collection_hint"] is None:
            p["scrape_warnings"].append("collection_hint_missing")
        if p["main_image_url"] is None:
            p["scrape_warnings"].append("no_image_found")
        if p["product_code_from_image"] is None:
            p["scrape_warnings"].append("no_code_in_filename")

    products_with_warnings = [p for p in all_products if p["scrape_warnings"]]
    for pw in products_with_warnings:
        warnings.append({
            "url": pw["page_url"],
            "issue": "; ".join(pw["scrape_warnings"]),
            "product_title": pw["product_title_raw"],
            "collection_hint": pw.get("collection_hint"),
        })

    out_products = OUTPUT_DIR / "legacy-products.json"
    with open(out_products, "w", encoding="utf-8") as f:
        json.dump(all_products, f, ensure_ascii=False, indent=2)
    print(f"\nWrote: {out_products} ({len(all_products)} products)")

    collections_found = Counter(
        p["collection_hint"] for p in all_products if p["collection_hint"]
    )
    codes_found = sum(1 for p in all_products if p["product_code_from_image"])
    images_found = sum(1 for p in all_products if p["main_image_url"])

    summary = {
        "total_products_scraped": len(all_products),
        "products_with_image": images_found,
        "products_with_code_from_image": codes_found,
        "products_with_warnings": len(products_with_warnings),
        "unique_collections": dict(collections_found.most_common()),
        "category_counts": category_stats,
        "detail_pages_fetched": fetch_details,
        "cache_used": use_cache,
    }
    out_summary = OUTPUT_DIR / "legacy-products-summary.json"
    with open(out_summary, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(f"Wrote: {out_summary}")

    out_warnings = OUTPUT_DIR / "legacy-scrape-warnings.json"
    with open(out_warnings, "w", encoding="utf-8") as f:
        json.dump(warnings, f, ensure_ascii=False, indent=2)
    print(f"Wrote: {out_warnings} ({len(warnings)} warnings)")

    print(f"\n{'=' * 60}")
    print("Summary:")
    print(f"  Total products: {len(all_products)}")
    print(f"  With images: {images_found}")
    print(f"  With article codes from filename: {codes_found}")
    print(f"  Collections: {dict(collections_found.most_common())}")
    print(f"  Warnings: {len(warnings)}")
    print("=" * 60)


if __name__ == "__main__":
    main()
