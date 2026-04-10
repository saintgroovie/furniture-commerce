"""
Download raw disk assets from Yandex Disk using the download manifest.

Usage:
  python3 scripts/download-disk-assets.py --collection oliver
  python3 scripts/download-disk-assets.py --collection provence
  python3 scripts/download-disk-assets.py --collection oliver --limit 5
  python3 scripts/download-disk-assets.py --collection oliver --code OL-01-2
  python3 scripts/download-disk-assets.py  # all priority collections

Reads:
  data/processed/asset-manifests/disk-download-manifest.json

Outputs:
  data/raw/downloaded-assets/{collection}/{filename}
  data/raw/downloaded-assets/disk-download-status.json
  data/raw/downloaded-assets/disk-download-failures.json
  data/raw/downloaded-assets/disk-download-summary.json
"""

import argparse
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent

MANIFEST_PATH = PROJECT_ROOT / "data" / "processed" / "asset-manifests" / "disk-download-manifest.json"
RAW_DIR = PROJECT_ROOT / "data" / "raw" / "downloaded-assets"
STATUS_PATH = RAW_DIR / "disk-download-status.json"
FAILURES_PATH = RAW_DIR / "disk-download-failures.json"
SUMMARY_PATH = RAW_DIR / "disk-download-summary.json"

DISK_PUBLIC_KEY = "https://disk.yandex.ru/d/MgKkDh5ZLXXfow"
DOWNLOAD_API = "https://cloud-api.yandex.net/v1/disk/public/resources/download"

REQUEST_TIMEOUT = 30
DOWNLOAD_TIMEOUT = 120
MAX_RETRIES = 3
RETRY_DELAY_BASE = 2
THROTTLE_DELAY = 0.3


def get_download_url(source_ref):
    """Get temporary download URL from Yandex Disk API."""
    params = urllib.parse.urlencode({
        "public_key": DISK_PUBLIC_KEY,
        "path": source_ref,
    })
    url = f"{DOWNLOAD_API}?{params}"

    req = urllib.request.Request(url)
    req.add_header("Accept", "application/json")

    resp = urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT)
    data = json.loads(resp.read().decode("utf-8"))
    return data.get("href")


def download_file(download_url, target_path):
    """Download file from temporary URL to local path."""
    req = urllib.request.Request(download_url)
    resp = urllib.request.urlopen(req, timeout=DOWNLOAD_TIMEOUT)
    content = resp.read()

    target_path.parent.mkdir(parents=True, exist_ok=True)
    with open(target_path, "wb") as f:
        f.write(content)

    return len(content)


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def load_existing_status():
    """Load previous download status for idempotency."""
    if STATUS_PATH.exists():
        with open(STATUS_PATH) as f:
            data = json.load(f)
        return {e["source_ref"]: e for e in data}
    return {}


def save_status(status_list):
    with open(STATUS_PATH, "w", encoding="utf-8") as f:
        json.dump(status_list, f, ensure_ascii=False, indent=2)


def save_failures(failures):
    with open(FAILURES_PATH, "w", encoding="utf-8") as f:
        json.dump(failures, f, ensure_ascii=False, indent=2)


def save_summary(stats):
    with open(SUMMARY_PATH, "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)


def main():
    parser = argparse.ArgumentParser(description="Download disk assets from Yandex Disk")
    parser.add_argument("--collection", help="Filter by collection name")
    parser.add_argument("--code", help="Filter by product code")
    parser.add_argument("--limit", type=int, help="Max files to download")
    parser.add_argument("--dry-run", action="store_true", help="Show plan without downloading")
    parser.add_argument("--force", action="store_true", help="Re-download even if file exists")
    args = parser.parse_args()

    with open(MANIFEST_PATH) as f:
        manifest = json.load(f)

    if args.collection:
        manifest = [e for e in manifest if e["collection_name_normalized"] == args.collection]
    if args.code:
        manifest = [e for e in manifest if e["product_code_normalized"].upper() == args.code.upper()]
    if args.limit:
        manifest = manifest[:args.limit]

    if not manifest:
        print("No entries match the filter criteria.")
        return

    print(f"Download plan: {len(manifest)} files")
    coll_counts = Counter(e["collection_name_normalized"] for e in manifest)
    for c, n in coll_counts.most_common():
        print(f"  {c}: {n} files")

    if args.dry_run:
        print("\n[DRY RUN] No files will be downloaded.")
        for e in manifest[:10]:
            print(f"  {e['source_ref']}")
            print(f"    -> {e['target_raw_path']}")
        if len(manifest) > 10:
            print(f"  ... and {len(manifest) - 10} more")
        return

    RAW_DIR.mkdir(parents=True, exist_ok=True)

    existing = load_existing_status()
    status_list = list(existing.values())
    failures = []

    downloaded = 0
    skipped = 0
    failed = 0
    total_bytes = 0

    per_coll = defaultdict(lambda: {"downloaded": 0, "skipped": 0, "failed": 0, "bytes": 0})

    for i, entry in enumerate(manifest):
        source_ref = entry["source_ref"]
        target_rel = entry["target_raw_path"]
        target_abs = PROJECT_ROOT / target_rel
        coll = entry["collection_name_normalized"]

        progress = f"[{i+1}/{len(manifest)}]"

        prev = existing.get(source_ref)
        if prev and prev.get("status") == "downloaded" and target_abs.exists() and not args.force:
            skipped += 1
            per_coll[coll]["skipped"] += 1
            if (i + 1) % 50 == 0:
                print(f"  {progress} skipped (already exists): {entry['original_filename']}")
            continue

        last_error = None
        success = False

        for attempt in range(1, MAX_RETRIES + 1):
            try:
                dl_url = get_download_url(source_ref)
                if not dl_url:
                    raise ValueError("Empty download URL returned")

                nbytes = download_file(dl_url, target_abs)

                if nbytes == 0:
                    raise ValueError("Downloaded file is 0 bytes")

                file_hash = sha256_file(target_abs)

                record = {
                    "source_ref": source_ref,
                    "original_filename": entry["original_filename"],
                    "product_code": entry["product_code_normalized"],
                    "collection": coll,
                    "target_raw_path": target_rel,
                    "status": "downloaded",
                    "file_size_bytes": nbytes,
                    "sha256": file_hash,
                    "downloaded_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
                    "attempts": attempt,
                }

                existing[source_ref] = record
                status_list = list(existing.values())

                downloaded += 1
                total_bytes += nbytes
                per_coll[coll]["downloaded"] += 1
                per_coll[coll]["bytes"] += nbytes
                success = True

                if (i + 1) % 10 == 0 or (i + 1) == len(manifest):
                    print(f"  {progress} OK: {entry['original_filename']} ({nbytes/1024:.0f} KB)")

                break

            except Exception as exc:
                last_error = str(exc)
                if attempt < MAX_RETRIES:
                    delay = RETRY_DELAY_BASE ** attempt
                    time.sleep(delay)

        if not success:
            failed += 1
            per_coll[coll]["failed"] += 1
            record = {
                "source_ref": source_ref,
                "original_filename": entry["original_filename"],
                "product_code": entry["product_code_normalized"],
                "collection": coll,
                "target_raw_path": target_rel,
                "status": "failed",
                "error": last_error,
                "attempts": MAX_RETRIES,
                "failed_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            }
            existing[source_ref] = record
            status_list = list(existing.values())
            failures.append(record)
            print(f"  {progress} FAIL: {entry['original_filename']} — {last_error[:80]}")

        time.sleep(THROTTLE_DELAY)

        if (i + 1) % 50 == 0:
            save_status(status_list)

    save_status(status_list)
    save_failures(failures)

    summary = {
        "total_planned": len(manifest),
        "downloaded": downloaded,
        "skipped_existing": skipped,
        "failed": failed,
        "total_bytes": total_bytes,
        "total_mb": round(total_bytes / 1024 / 1024, 1),
        "per_collection": dict(per_coll),
        "completed_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    save_summary(summary)

    print(f"\n=== Download Complete ===")
    print(f"  Downloaded: {downloaded}")
    print(f"  Skipped:    {skipped}")
    print(f"  Failed:     {failed}")
    print(f"  Total:      {total_bytes / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    main()
