#!/usr/bin/env python3
"""Controlled local upload + manifest/seed helpers for MVP assets.

Usage:
  python scripts/upload-assets-to-local-storage.py --write-manifest
  python scripts/upload-assets-to-local-storage.py --write-seed-inputs
  python scripts/upload-assets-to-local-storage.py [--dry-run] [--overwrite-different]

Env:
  ASSET_BASE_URL default: http://localhost:9000/static
    (Medusa v2 serves express.static from apps/backend/static at URL path /static)
  REPO_ROOT override: parent of scripts/
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(os.environ.get("REPO_ROOT", Path(__file__).resolve().parent.parent))
ASSET_BASE_URL = os.environ.get("ASSET_BASE_URL", "http://localhost:9000/static").rstrip("/")

PATH_ENTITY_MAPPING = REPO_ROOT / "data/normalized/entity-mapping.json"
PATH_ASSET_UPLOAD_MANIFEST = REPO_ROOT / "data/normalized/asset-upload-manifest.json"
PATH_EXEC_MANIFEST = REPO_ROOT / "data/normalized/asset-upload-execution-manifest.json"
PATH_EXEC_SUMMARY = REPO_ROOT / "data/normalized/asset-upload-execution-summary.json"
PATH_STATUS = REPO_ROOT / "data/processed/asset-manifests/local-upload-status.json"
PATH_FAILURES = REPO_ROOT / "data/processed/asset-manifests/local-upload-failures.json"
PATH_UPLOAD_SUMMARY = REPO_ROOT / "data/processed/asset-manifests/local-upload-summary.json"

# Materialization root must match Medusa express static dir (see @medusajs/framework express-loader).
BACKEND_MATERIALIZATION_ROOT = REPO_ROOT / "apps/backend/static"
SEED_READY = frozenset({"seed_ready", "seed_ready_with_caveat"})
UPLOAD_READY = frozenset({"ready", "ready_with_caveat"})


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def rel(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def _asset_role_from_key(storage_key: str) -> str:
    base = storage_key.split("/")[-1]
    if "_main." in base:
        return "main"
    if "_gallery_" in base:
        return "gallery"
    if "_color_" in base:
        return "color_variant"
    return "other"


def build_execution_manifest() -> list[dict[str, Any]]:
    entities = load_json(PATH_ENTITY_MAPPING)
    upload_rows = load_json(PATH_ASSET_UPLOAD_MANIFEST)

    entity_by_key = {
        e["workbook_row_key"]: e
        for e in entities
        if e.get("readiness_status") in SEED_READY
        and not e.get("needs_business_decision")
        and e.get("excluded_reason") is None
    }

    out: list[dict[str, Any]] = []
    for row in upload_rows:
        wk = row.get("workbook_row_key")
        if wk not in entity_by_key:
            continue

        entity = entity_by_key[wk]
        processed_path = row["processed_path"]
        processed_file = REPO_ROOT / processed_path
        tkey = row["target_storage_key"]

        if not processed_file.is_file():
            upload_ready_status = "missing_source"
        elif entity.get("readiness_status") == "seed_ready_with_caveat" or row.get(
            "asset_quality_status"
        ) != "ok":
            upload_ready_status = "ready_with_caveat"
        else:
            upload_ready_status = "ready"

        out.append(
            {
                "workbook_row_key": wk,
                "product_code_normalized": row.get("product_code_normalized"),
                "canonical_name": row.get("canonical_name"),
                "collection_name_normalized": row.get("collection_name_normalized"),
                "processed_path": processed_path,
                "target_storage_key": tkey,
                "target_public_url": f"{ASSET_BASE_URL}/{tkey}",
                "asset_role": row.get("asset_role") or _asset_role_from_key(tkey),
                "asset_quality_status": row.get("asset_quality_status"),
                "upload_ready_status": upload_ready_status,
                "source_type": row.get("source_type"),
                "width": row.get("width"),
                "height": row.get("height"),
                "file_size": row.get("file_size"),
            }
        )

    out.sort(key=lambda x: (x["workbook_row_key"], x["target_storage_key"], x["asset_role"]))
    return out


def write_manifest_command() -> None:
    manifest = build_execution_manifest()
    ready_breakdown = Counter(m.get("upload_ready_status") for m in manifest)
    role_breakdown = Counter(m.get("asset_role") for m in manifest)

    summary = {
        "generated_at_utc": utc_now_iso(),
        "asset_base_url_assumption": ASSET_BASE_URL,
        "eligible_workbook_row_keys": len({m["workbook_row_key"] for m in manifest}),
        "total_asset_rows": len(manifest),
        "upload_ready_status_breakdown": dict(sorted(ready_breakdown.items())),
        "asset_role_breakdown": dict(sorted(role_breakdown.items())),
        "source_json": {
            "entity_mapping": rel(PATH_ENTITY_MAPPING),
            "asset_upload_manifest": rel(PATH_ASSET_UPLOAD_MANIFEST),
        },
        "deterministic_sort": ["workbook_row_key", "target_storage_key", "asset_role"],
    }

    write_json(PATH_EXEC_MANIFEST, manifest)
    write_json(PATH_EXEC_SUMMARY, summary)
    print(f"Wrote {PATH_EXEC_MANIFEST} ({len(manifest)} rows)")
    print(f"Wrote {PATH_EXEC_SUMMARY}")


def upload_command(*, dry_run: bool, overwrite_different: bool) -> int:
    if not PATH_EXEC_MANIFEST.is_file():
        print("Missing execution manifest. Run with --write-manifest first.", file=sys.stderr)
        return 1

    manifest = load_json(PATH_EXEC_MANIFEST)
    if not isinstance(manifest, list):
        print("Execution manifest must be an array.", file=sys.stderr)
        return 1

    entries = sorted(
        manifest,
        key=lambda x: (x.get("workbook_row_key", ""), x.get("target_storage_key", "")),
    )
    status_rows: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []

    copied = 0
    skipped_identical = 0
    overwritten_different = 0
    failed = 0
    validated_successfully = 0

    for row in entries:
        row_status: dict[str, Any] = {
            "workbook_row_key": row.get("workbook_row_key"),
            "product_code_normalized": row.get("product_code_normalized"),
            "canonical_name": row.get("canonical_name"),
            "collection_name_normalized": row.get("collection_name_normalized"),
            "asset_role": row.get("asset_role"),
            "asset_quality_status": row.get("asset_quality_status"),
            "upload_ready_status": row.get("upload_ready_status"),
            "processed_path": row.get("processed_path"),
            "target_storage_key": row.get("target_storage_key"),
            "target_public_url": row.get("target_public_url"),
            "result_status": "",
            "details": "",
        }

        if row.get("upload_ready_status") not in UPLOAD_READY:
            row_status["result_status"] = "skipped_not_ready"
            row_status["details"] = f"upload_ready_status={row.get('upload_ready_status')}"
            status_rows.append(row_status)
            continue

        src = REPO_ROOT / row["processed_path"]
        dest = BACKEND_MATERIALIZATION_ROOT / row["target_storage_key"]

        if not src.is_file():
            failed += 1
            row_status["result_status"] = "failed_missing_source"
            row_status["details"] = "processed file is missing"
            failures.append(
                {
                    **row_status,
                    "failure_code": "missing_source",
                    "source_exists": False,
                }
            )
            status_rows.append(row_status)
            continue

        dest.parent.mkdir(parents=True, exist_ok=True)
        src_sha = file_sha256(src)

        if dest.is_file():
            dest_sha = file_sha256(dest)
            if src_sha == dest_sha:
                skipped_identical += 1
                validated_successfully += 1
                row_status["result_status"] = "skipped_identical"
                row_status["details"] = "destination exists with identical content"
                status_rows.append(row_status)
                continue

            if not overwrite_different:
                failed += 1
                row_status["result_status"] = "failed_conflict_existing_different"
                row_status["details"] = (
                    "destination exists with different content "
                    "(use --overwrite-different to replace)"
                )
                failures.append(
                    {
                        **row_status,
                        "failure_code": "conflict_existing_different",
                        "source_sha256": src_sha,
                        "target_sha256": dest_sha,
                    }
                )
                status_rows.append(row_status)
                continue

            if not dry_run:
                shutil.copy2(src, dest)
            overwritten_different += 1
            action = "overwritten_different"
        else:
            if not dry_run:
                shutil.copy2(src, dest)
            copied += 1
            action = "copied"

        if dry_run:
            row_status["result_status"] = f"dry_run_{action}"
            row_status["details"] = "dry-run mode; copy not executed"
            status_rows.append(row_status)
            continue

        if not dest.is_file():
            failed += 1
            row_status["result_status"] = "failed_validation_missing_target"
            row_status["details"] = "target missing after copy"
            failures.append(
                {
                    **row_status,
                    "failure_code": "validation_missing_target",
                }
            )
            status_rows.append(row_status)
            continue

        final_sha = file_sha256(dest)
        if final_sha != src_sha:
            failed += 1
            row_status["result_status"] = "failed_validation_sha_mismatch"
            row_status["details"] = "target hash mismatch after copy"
            failures.append(
                {
                    **row_status,
                    "failure_code": "validation_sha_mismatch",
                    "source_sha256": src_sha,
                    "target_sha256": final_sha,
                }
            )
            status_rows.append(row_status)
            continue

        validated_successfully += 1
        row_status["result_status"] = action
        row_status["details"] = "copied and validated"
        status_rows.append(row_status)

    status_rows.sort(key=lambda x: (x.get("workbook_row_key", ""), x.get("target_storage_key", "")))
    failures.sort(key=lambda x: (x.get("workbook_row_key", ""), x.get("target_storage_key", "")))

    eligible_ready_entries = sum(1 for row in entries if row.get("upload_ready_status") in UPLOAD_READY)
    summary = {
        "generated_at_utc": utc_now_iso(),
        "run_at": utc_now_iso(),
        "dry_run": dry_run,
        "overwrite_different": overwrite_different,
        "ASSET_BASE_URL": ASSET_BASE_URL,
        "materialization_root": BACKEND_MATERIALIZATION_ROOT.as_posix(),
        "materialization_root_repo_relative": rel(BACKEND_MATERIALIZATION_ROOT),
        "uploads_root": BACKEND_MATERIALIZATION_ROOT.as_posix(),
        "backend_uploads_root": rel(BACKEND_MATERIALIZATION_ROOT),
        "manifest_path": PATH_EXEC_MANIFEST.as_posix(),
        "status_path": PATH_STATUS.as_posix(),
        "failures_path": PATH_FAILURES.as_posix(),
        "manifest_entries": len(entries),
        "eligible_ready_entries": eligible_ready_entries,
        "copied": copied,
        "copied_count": copied,
        "would_copy_count": sum(
            1 for row in status_rows if str(row.get("result_status", "")).startswith("dry_run_")
        ),
        "skipped_identical": skipped_identical,
        "skipped_identical_count": skipped_identical,
        "overwritten_different": overwritten_different,
        "failed": failed,
        "failed_count": failed,
        "validated_successfully": validated_successfully,
    }

    write_json(PATH_STATUS, status_rows)
    write_json(PATH_FAILURES, failures)
    write_json(PATH_UPLOAD_SUMMARY, summary)

    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 1 if failed > 0 else 0


def write_seed_inputs_command() -> None:
    entities = load_json(PATH_ENTITY_MAPPING)
    eligible = [e for e in entities if e.get("readiness_status") in SEED_READY]

    # Preserve current behavior: deduplicate by product handle.
    seen_handles: set[str] = set()
    dedupe_warnings: list[dict[str, str]] = []
    eligible_deduped: list[dict[str, Any]] = []
    for e in eligible:
        handle = e.get("medusa_product_handle") or ""
        if handle in seen_handles:
            dedupe_warnings.append(
                {
                    "medusa_product_handle": handle,
                    "workbook_row_key": e.get("workbook_row_key", ""),
                    "action": "skipped_duplicate_handle",
                }
            )
            continue
        seen_handles.add(handle)
        eligible_deduped.append(e)

    collections_map: dict[str, dict[str, str]] = {}
    categories_map: dict[str, dict[str, str]] = {}
    products_out: list[dict[str, Any]] = []
    assets_flat: list[dict[str, Any]] = []

    for e in eligible_deduped:
        ch = e["medusa_collection_handle"]
        collections_map[ch] = {"handle": ch, "title": e["medusa_collection_title"]}

        cth = e["medusa_category_handle"]
        categories_map[cth] = {"handle": cth, "title": e["medusa_category_title"]}

        main_key = e.get("main_image_storage_key")
        main_url = f"{ASSET_BASE_URL}/{main_key}" if main_key else None
        all_keys = list(e.get("upload_manifest_refs") or [])
        all_public_urls = [f"{ASSET_BASE_URL}/{k}" for k in all_keys]
        gallery_urls = [f"{ASSET_BASE_URL}/{k}" for k in (e.get("gallery_storage_keys") or [])]

        for k in all_keys:
            assets_flat.append(
                {
                    "workbook_row_key": e["workbook_row_key"],
                    "product_code_normalized": e["product_code_normalized"],
                    "storage_key": k,
                    "public_url": f"{ASSET_BASE_URL}/{k}",
                    "role": _asset_role_from_key(k),
                }
            )

        products_out.append(
            {
                "workbook_row_key": e["workbook_row_key"],
                "product_code_normalized": e["product_code_normalized"],
                "canonical_name": e.get("canonical_name") or e["medusa_product_title"],
                "medusa_product_handle": e["medusa_product_handle"],
                "medusa_product_title": e["medusa_product_title"],
                "medusa_collection_handle": ch,
                "medusa_collection_title": e["medusa_collection_title"],
                "medusa_category_handle": cth,
                "medusa_category_title": e["medusa_category_title"],
                "medusa_product_type": e["medusa_product_type"],
                "medusa_variant_sku": e["medusa_variant_sku"],
                "medusa_price_amount": e["medusa_price_amount"],
                "currency_code": "rub",
                "variant_strategy": e.get("variant_strategy", "single_default"),
                "dimensions_normalized": e.get("dimensions_normalized"),
                "thumbnail_url": main_url,
                "images": [{"url": u} for u in all_public_urls],
                "image_urls": all_public_urls,
                "main_image_public_url": main_url,
                "main_image_url": main_url,
                "gallery_public_urls": gallery_urls,
                "asset_quality_status": e.get("asset_quality_status"),
                "readiness_status": e.get("readiness_status"),
                "mapping_notes": e.get("mapping_notes") or "",
            }
        )

    seed_summary = {
        "generated_at_utc": utc_now_iso(),
        "ASSET_BASE_URL": ASSET_BASE_URL,
        "product_count": len(products_out),
        "entity_mapping_seed_eligible": len(eligible),
        "dedupe_skipped_count": len(dedupe_warnings),
        "dedupe_warnings": dedupe_warnings,
        "collection_count": len(collections_map),
        "category_count": len(categories_map),
        "asset_row_count": len(assets_flat),
    }

    write_json(REPO_ROOT / "data/normalized/seed-collections.json", list(collections_map.values()))
    write_json(REPO_ROOT / "data/normalized/seed-categories.json", list(categories_map.values()))
    write_json(REPO_ROOT / "data/normalized/seed-products.json", products_out)
    write_json(REPO_ROOT / "data/normalized/seed-assets.json", assets_flat)
    write_json(REPO_ROOT / "data/normalized/seed-summary.json", seed_summary)
    print(f"Wrote seed input files ({len(products_out)} products)")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write-manifest", action="store_true", help="Build asset-upload-execution-manifest.json")
    parser.add_argument("--write-seed-inputs", action="store_true", help="Build seed-*.json from entity-mapping")
    parser.add_argument("--dry-run", action="store_true", help="Upload mode: do not copy files")
    parser.add_argument(
        "--overwrite-different",
        action="store_true",
        help="Upload mode: overwrite existing destination only when content differs",
    )
    args = parser.parse_args()

    if args.write_manifest:
        write_manifest_command()
    if args.write_seed_inputs:
        write_seed_inputs_command()

    if not args.write_manifest and not args.write_seed_inputs:
        exit_code = upload_command(
            dry_run=args.dry_run,
            overwrite_different=args.overwrite_different,
        )
        raise SystemExit(exit_code)


if __name__ == "__main__":
    main()
