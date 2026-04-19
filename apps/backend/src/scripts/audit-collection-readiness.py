#!/usr/bin/env python3
import json
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

STATUS = {
    "OK": "ok",
    "BLOCKED_BY_PAUSED_SCOPE": "blocked_by_paused_scope",
    "NOT_IN_CURRENT_BASELINE": "not_in_current_baseline",
    "NEEDS_METADATA_FIX": "needs_metadata_fix",
    "NEEDS_MEDIA_DELIVERY_FIX": "needs_media_delivery_fix",
    "NEEDS_IMAGE_ORDER_SYNC": "needs_image_order_sync",
    "NEEDS_STOREFRONT_CORRECTNESS_REVIEW": "needs_storefront_correctness_review",
    "NEEDS_MANUAL_VISUAL_REVIEW": "needs_manual_visual_review",
}

VALIDATED_CLOSED = {"oliver"}


def extract_scope_keys(scope_text: str, set_name: str) -> list[str]:
    pattern = rf"{set_name}\s*=\s*new Set\(\[(.*?)\]\)"
    match = re.search(pattern, scope_text, flags=re.S)
    if not match:
        return []
    return re.findall(r'"([^"]+)"', match.group(1))


def has_dimensions(value) -> bool:
    if not isinstance(value, dict):
        return False
    return all(isinstance(value.get(key), (int, float)) for key in ("width_mm", "depth_mm", "height_mm"))


def normalize_str(value) -> str:
    return value.strip() if isinstance(value, str) else ""


def evaluate_collection(handle: str, rows: list[dict], scope_state: str) -> dict:
    product_count = len(rows)
    presence = product_count > 0

    missing_collection = 0
    missing_collection_label = 0
    missing_canonical_name = 0
    missing_dimensions = 0
    legacy_upload_rows = 0
    missing_thumbnail_rows = 0
    missing_image_list_rows = 0
    image_order_mismatch_rows = 0
    image_order_not_evaluated_rows = 0

    for row in rows:
        collection = normalize_str(row.get("medusa_collection_handle"))
        collection_label = normalize_str(row.get("medusa_collection_title"))
        canonical_name = normalize_str(row.get("canonical_name"))
        dimensions = row.get("dimensions_normalized")

        if not collection:
            missing_collection += 1
        if not collection_label:
            missing_collection_label += 1
        if not canonical_name:
            missing_canonical_name += 1
        if not has_dimensions(dimensions):
            missing_dimensions += 1

        thumbnail = normalize_str(row.get("thumbnail_url"))
        image_urls_raw = row.get("image_urls")
        image_urls = [u for u in image_urls_raw if isinstance(u, str) and u] if isinstance(image_urls_raw, list) else []

        if not thumbnail:
            missing_thumbnail_rows += 1
        if len(image_urls) == 0:
            missing_image_list_rows += 1

        urls_to_check = ([thumbnail] if thumbnail else []) + image_urls
        if any("/uploads/" in u for u in urls_to_check):
            legacy_upload_rows += 1

        if thumbnail and len(image_urls) > 0:
            if thumbnail != image_urls[0]:
                image_order_mismatch_rows += 1
        else:
            image_order_not_evaluated_rows += 1

    metadata_issue_count = missing_collection + missing_collection_label + missing_canonical_name + missing_dimensions
    media_issue_count = legacy_upload_rows + missing_thumbnail_rows + missing_image_list_rows

    # Closed collections (currently Oliver) are not reopened by thumbnail-only gaps
    # when delivery/order signals are otherwise clean. This preserves the validated
    # reference-stack verdict until a proven systemic issue appears.
    closed_collection_thumbnail_only_gap = (
        handle in VALIDATED_CLOSED
        and missing_thumbnail_rows > 0
        and legacy_upload_rows == 0
        and missing_image_list_rows == 0
        and image_order_mismatch_rows == 0
        and metadata_issue_count == 0
    )

    if not presence:
        status = STATUS["NOT_IN_CURRENT_BASELINE"]
    elif scope_state == "paused":
        status = STATUS["BLOCKED_BY_PAUSED_SCOPE"]
    elif metadata_issue_count > 0:
        status = STATUS["NEEDS_METADATA_FIX"]
    elif media_issue_count > 0 and not closed_collection_thumbnail_only_gap:
        status = STATUS["NEEDS_MEDIA_DELIVERY_FIX"]
    elif image_order_mismatch_rows > 0:
        status = STATUS["NEEDS_IMAGE_ORDER_SYNC"]
    elif handle in VALIDATED_CLOSED:
        status = STATUS["OK"]
    else:
        status = STATUS["NEEDS_STOREFRONT_CORRECTNESS_REVIEW"]

    unknowns = []
    if not presence:
        unknowns.append("no baseline rows; metadata/media/order signals unavailable")
    if presence:
        unknowns.append("storefront hero/gallery/open-graph/no-photo semantics are not fully derivable from baseline JSON alone")
        unknowns.append("manual visual/browser sign-off is outside this read-only audit")

    return {
        "collection": handle,
        "scope_state": scope_state,
        "presence_in_baseline": presence,
        "baseline_product_count": product_count,
        "status": status,
        "signals": {
            "metadata": {
                "missing_collection": missing_collection,
                "missing_collection_label": missing_collection_label,
                "missing_canonical_name": missing_canonical_name,
                "missing_dimensions": missing_dimensions,
                "issue_count": metadata_issue_count,
            },
            "media_delivery": {
                "legacy_upload_url_rows": legacy_upload_rows,
                "missing_thumbnail_rows": missing_thumbnail_rows,
                "missing_image_list_rows": missing_image_list_rows,
                "issue_count": media_issue_count,
            },
            "image_order": {
                "thumbnail_mismatch_rows": image_order_mismatch_rows,
                "rows_not_evaluated": image_order_not_evaluated_rows,
            },
        },
        "unknowns": unknowns,
        "policy_notes": (
            ["validated-closed collection: thumbnail-only signal gap is treated as non-reopen until systemic evidence exists"]
            if closed_collection_thumbnail_only_gap
            else []
        ),
    }


def main():
    repo_root = Path(__file__).resolve().parents[4]
    baseline_path = repo_root / "data/normalized/seed-products.fixed2.json"
    scope_path = repo_root / "apps/storefront/src/lib/catalog-scope.ts"
    output_path = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else (
        repo_root / "docs/project/collection-technical-media-readiness-audit.json"
    )

    baseline_rows = json.loads(baseline_path.read_text(encoding="utf-8"))
    scope_text = scope_path.read_text(encoding="utf-8")
    active_keys = extract_scope_keys(scope_text, "ACTIVE_COLLECTION_KEYS")
    paused_keys = extract_scope_keys(scope_text, "PAUSED_COLLECTION_KEYS")

    rows_by_collection: dict[str, list[dict]] = defaultdict(list)
    for row in baseline_rows:
        key = normalize_str(row.get("medusa_collection_handle"))
        if key:
            rows_by_collection[key].append(row)

    all_keys = sorted(set(rows_by_collection.keys()) | set(active_keys) | set(paused_keys) | VALIDATED_CLOSED)

    collection_rows = []
    for key in all_keys:
        if key in active_keys:
            scope_state = "active"
        elif key in paused_keys:
            scope_state = "paused"
        else:
            scope_state = "absent"
        collection_rows.append(evaluate_collection(key, rows_by_collection.get(key, []), scope_state))

    status_counts = defaultdict(int)
    for row in collection_rows:
        status_counts[row["status"]] += 1

    report = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "pipeline_version": "1.0",
        "mode": "read-only",
        "baseline_source": "data/normalized/seed-products.fixed2.json",
        "scope_source": "apps/storefront/src/lib/catalog-scope.ts",
        "status_set": list(STATUS.values()),
        "assumptions": {
            "validated_closed_collections": sorted(VALIDATED_CLOSED),
            "oliver_policy": "validated reference closure remains OK unless a new cross-collection systemic issue is proven",
        },
        "summary": {
            "collections_total": len(collection_rows),
            "status_counts": dict(status_counts),
            "baseline_rows_total": len(baseline_rows),
            "baseline_collections_total": len(rows_by_collection),
            "scope_active_total": len(active_keys),
            "scope_paused_total": len(paused_keys),
        },
        "collections": collection_rows,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Collection readiness audit written to: {output_path}")
    print(f"Collections: {report['summary']['collections_total']}")
    print(f"Status counts: {json.dumps(report['summary']['status_counts'], ensure_ascii=False)}")


if __name__ == "__main__":
    main()
