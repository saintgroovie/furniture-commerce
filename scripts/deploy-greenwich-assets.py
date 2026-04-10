#!/usr/bin/env python3
"""Deploy processed Greenwich assets to Medusa backend uploads directory.

Copies processed storefront-ready files to the location where Medusa
serves them as static uploads. Run BEFORE the seed script.

Usage:
  python3 scripts/deploy-greenwich-assets.py [--dry-run]
"""

import json
import os
import shutil
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent

PROCESSED_DIR = BASE / "data/processed/storefront-assets/greenwich"
PROCESSED_BEDS_DIR = PROCESSED_DIR / "beds-shared"
UPLOADS_DIR = BASE / "apps/backend/uploads/products/greenwich"
UPLOADS_BEDS_DIR = UPLOADS_DIR / "beds-shared"

DRY_RUN = "--dry-run" in sys.argv


def copy_tree(src_dir, dst_dir, label):
    """Copy all files from src to dst, skipping directories."""
    if not src_dir.exists():
        print(f"  SKIP {label}: source not found ({src_dir})")
        return 0

    dst_dir.mkdir(parents=True, exist_ok=True)
    count = 0

    for f in sorted(src_dir.iterdir()):
        if f.is_dir():
            continue
        dst = dst_dir / f.name
        if dst.exists() and dst.stat().st_size == f.stat().st_size:
            continue

        if DRY_RUN:
            print(f"  [dry-run] {f.name} → {dst.relative_to(BASE)}")
        else:
            shutil.copy2(str(f), str(dst))

        count += 1

    return count


def main():
    if DRY_RUN:
        print("=== DRY RUN — no files will be copied ===\n")

    print("Deploying Greenwich assets to Medusa uploads...\n")

    main_count = copy_tree(PROCESSED_DIR, UPLOADS_DIR, "main assets")
    print(f"Main assets: {main_count} files {'would be ' if DRY_RUN else ''}copied")

    bed_count = copy_tree(PROCESSED_BEDS_DIR, UPLOADS_BEDS_DIR, "bed pool")
    print(f"Bed pool: {bed_count} files {'would be ' if DRY_RUN else ''}copied")

    total = main_count + bed_count
    print(f"\nTotal: {total} files {'would be ' if DRY_RUN else ''}deployed")

    if not DRY_RUN:
        final_count = sum(1 for f in UPLOADS_DIR.rglob("*") if f.is_file())
        print(f"Files in uploads dir: {final_count}")
        print(f"Uploads dir: {UPLOADS_DIR.relative_to(BASE)}")


if __name__ == "__main__":
    main()
