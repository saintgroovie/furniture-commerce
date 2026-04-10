#!/usr/bin/env python3
"""Download Greenwich assets based on the download manifest.

Handles two actions:
- copy_local: copies PDF-extracted images from local filesystem
- fetch_url: downloads images from legacy site with retry logic
"""

import json
import os
import shutil
import time
from pathlib import Path
from urllib.parse import urlparse, quote
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

BASE = Path(__file__).resolve().parent.parent
MANIFEST = BASE / "data/processed/asset-manifests/greenwich-download-manifest.json"
RESULT_FILE = BASE / "data/processed/asset-manifests/greenwich-download-result.json"
DOWNLOAD_DIR = BASE / "data/raw/downloaded-assets/greenwich"

MAX_RETRIES = 3
RETRY_BACKOFF = 5
TIMEOUT = 30
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Woodright-Asset-Fetcher/1.0"

DELAY_BETWEEN_REQUESTS = 1.0


def encode_url(url):
    parsed = urlparse(url)
    encoded_path = quote(parsed.path, safe="/")
    return f"{parsed.scheme}://{parsed.netloc}{encoded_path}"


def fetch_with_retry(url, dest_path, retries=MAX_RETRIES):
    safe_url = encode_url(url)
    for attempt in range(1, retries + 1):
        try:
            req = Request(safe_url, headers={"User-Agent": USER_AGENT})
            with urlopen(req, timeout=TIMEOUT) as resp:
                data = resp.read()
                if len(data) < 500:
                    raise ValueError(f"Response too small ({len(data)} bytes)")
                with open(dest_path, "wb") as f:
                    f.write(data)
                return len(data)
        except (URLError, HTTPError, TimeoutError, ValueError, OSError) as e:
            if attempt < retries:
                wait = RETRY_BACKOFF * attempt
                print(f"  Retry {attempt}/{retries} for {os.path.basename(dest_path)}: {e}")
                time.sleep(wait)
            else:
                raise


def main():
    with open(MANIFEST) as f:
        manifest = json.load(f)

    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

    results = []
    stats = {
        "total": len(manifest),
        "success": 0,
        "failed": 0,
        "skipped": 0,
        "bytes_downloaded": 0,
    }

    for i, entry in enumerate(manifest):
        action = entry.get("download_action")
        src = entry.get("preferred_source_ref", "")
        tgt_rel = entry.get("target_raw_path", "")
        tgt = BASE / tgt_rel

        tgt.parent.mkdir(parents=True, exist_ok=True)

        if tgt.exists() and tgt.stat().st_size > 500:
            results.append({**entry, "download_status": "skipped_exists", "file_size_bytes": tgt.stat().st_size})
            stats["skipped"] += 1
            continue

        if action == "copy_local":
            local_src = BASE / src
            if local_src.exists():
                shutil.copy2(local_src, tgt)
                sz = tgt.stat().st_size
                results.append({**entry, "download_status": "success", "file_size_bytes": sz})
                stats["success"] += 1
                stats["bytes_downloaded"] += sz
                print(f"[{i+1}/{len(manifest)}] COPY {entry['target_filename']} ({sz:,} bytes)")
            else:
                results.append({**entry, "download_status": "failed", "error": f"Source not found: {src}"})
                stats["failed"] += 1
                print(f"[{i+1}/{len(manifest)}] FAIL {entry['target_filename']} — source not found")

        elif action == "fetch_url":
            try:
                sz = fetch_with_retry(src, str(tgt))
                results.append({**entry, "download_status": "success", "file_size_bytes": sz})
                stats["success"] += 1
                stats["bytes_downloaded"] += sz
                print(f"[{i+1}/{len(manifest)}] OK   {entry['target_filename']} ({sz:,} bytes)")
                time.sleep(DELAY_BETWEEN_REQUESTS)
            except Exception as e:
                results.append({**entry, "download_status": "failed", "error": str(e)})
                stats["failed"] += 1
                print(f"[{i+1}/{len(manifest)}] FAIL {entry['target_filename']} — {e}")

    stats["bytes_downloaded_mb"] = round(stats["bytes_downloaded"] / (1024 * 1024), 2)

    result_output = {
        "generated": "2026-03-19",
        "stats": stats,
        "entries": results,
    }

    with open(RESULT_FILE, "w") as f:
        json.dump(result_output, f, indent=2, ensure_ascii=False)

    print(f"\nDone. {stats['success']} success, {stats['failed']} failed, {stats['skipped']} skipped")
    print(f"Total downloaded: {stats['bytes_downloaded_mb']} MB")
    print(f"Result: {RESULT_FILE}")


if __name__ == "__main__":
    main()
