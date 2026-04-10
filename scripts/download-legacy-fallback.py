"""
Download and preprocess legacy fallback images for Oliver/Provence gaps.

Reads:
  data/processed/asset-manifests/legacy-fallback-manifest.json

Outputs:
  data/raw/downloaded-assets/legacy/{collection}/{filename}
  data/processed/storefront-assets/{collection}/{CODE}_main.jpg  (legacy source)
  data/processed/asset-manifests/legacy-fallback-summary.json
"""

import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parent.parent

MANIFEST_PATH = PROJECT_ROOT / "data" / "processed" / "asset-manifests" / "legacy-fallback-manifest.json"
RAW_LEGACY_DIR = PROJECT_ROOT / "data" / "raw" / "downloaded-assets" / "legacy"
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed" / "storefront-assets"
SUMMARY_PATH = PROJECT_ROOT / "data" / "processed" / "asset-manifests" / "legacy-fallback-summary.json"

MAX_DIM = 1200
JPEG_QUALITY = 85
REQUEST_TIMEOUT = 30
MAX_RETRIES = 3
RETRY_DELAY_BASE = 2


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def download_url(url, target_path):
    req = urllib.request.Request(url)
    req.add_header("User-Agent", "Mozilla/5.0 (compatible; Woodright-asset-fetcher)")
    resp = urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT)
    content = resp.read()
    target_path.parent.mkdir(parents=True, exist_ok=True)
    with open(target_path, "wb") as f:
        f.write(content)
    return len(content)


def process_image(src_path, dst_path):
    img = Image.open(src_path)

    if img.mode in ("RGBA", "P", "LA"):
        bg = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "P":
            img = img.convert("RGBA")
        bg.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
        img = bg
    elif img.mode != "RGB":
        img = img.convert("RGB")

    w, h = img.size
    if max(w, h) > MAX_DIM:
        if w >= h:
            new_w, new_h = MAX_DIM, int(h * MAX_DIM / w)
        else:
            new_h, new_w = MAX_DIM, int(w * MAX_DIM / h)
        img = img.resize((new_w, new_h), Image.LANCZOS)
    else:
        new_w, new_h = w, h

    dst_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(dst_path, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
    return new_w, new_h, dst_path.stat().st_size


def main():
    with open(MANIFEST_PATH) as f:
        items = json.load(f)

    print(f"Legacy fallback items: {len(items)}")

    results = []

    for item in items:
        code = item["product_code_normalized"]
        coll = item["collection_name_normalized"]
        url = item["main_image_url"]
        name = item["canonical_name"]

        if not url:
            print(f"  SKIP {coll}:{code} — no URL")
            results.append({**item, "status": "skipped", "reason": "no_url"})
            continue

        ext = Path(url).suffix.lower() or ".jpg"
        raw_fn = f"{code.lower()}_legacy_main{ext}"
        raw_path = RAW_LEGACY_DIR / coll / raw_fn
        processed_fn = f"{code}_main.jpg"
        processed_path = PROCESSED_DIR / coll / processed_fn

        if processed_path.exists():
            print(f"  SKIP {coll}:{code} — processed file already exists (disk source preferred)")
            results.append({
                **item,
                "status": "skipped_disk_preferred",
                "reason": "processed main already exists from disk source",
            })
            continue

        last_error = None
        downloaded = False
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                if raw_path.exists() and raw_path.stat().st_size > 0:
                    downloaded = True
                    break
                nbytes = download_url(url, raw_path)
                if nbytes > 0:
                    downloaded = True
                    break
            except Exception as exc:
                last_error = str(exc)
                if attempt < MAX_RETRIES:
                    time.sleep(RETRY_DELAY_BASE ** attempt)

        if not downloaded:
            print(f"  FAIL {coll}:{code} — download failed: {last_error[:60] if last_error else '?'}")
            results.append({
                **item,
                "status": "download_failed",
                "error": last_error,
            })
            continue

        raw_hash = sha256_file(raw_path)
        raw_size = raw_path.stat().st_size

        try:
            pw, ph, psize = process_image(raw_path, processed_path)
            proc_hash = sha256_file(processed_path)

            print(f"  OK   {coll}:{code} — {pw}x{ph} {psize/1024:.0f}KB ({name[:30]})")
            results.append({
                "workbook_row_key": item["workbook_row_key"],
                "product_code_normalized": code,
                "canonical_name": name,
                "collection_name_normalized": coll,
                "source_url": url,
                "source_type": "legacy_fallback",
                "raw_path": str(raw_path.relative_to(PROJECT_ROOT)),
                "raw_sha256": raw_hash,
                "raw_size_bytes": raw_size,
                "processed_path": str(processed_path.relative_to(PROJECT_ROOT)),
                "processed_filename": processed_fn,
                "processed_sha256": proc_hash,
                "width": pw,
                "height": ph,
                "file_size": psize,
                "asset_role": "main",
                "status": "processed",
            })

        except Exception as exc:
            print(f"  FAIL {coll}:{code} — process error: {exc}")
            results.append({
                **item,
                "status": "process_failed",
                "error": str(exc),
            })

    ok = sum(1 for r in results if r.get("status") == "processed")
    skipped = sum(1 for r in results if "skipped" in r.get("status", ""))
    failed = sum(1 for r in results if "failed" in r.get("status", ""))

    summary = {
        "total_items": len(items),
        "processed": ok,
        "skipped": skipped,
        "failed": failed,
        "results": results,
        "completed_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }

    with open(SUMMARY_PATH, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    print(f"\n=== Legacy Fallback Complete ===")
    print(f"  Processed: {ok}")
    print(f"  Skipped:   {skipped}")
    print(f"  Failed:    {failed}")


if __name__ == "__main__":
    main()
