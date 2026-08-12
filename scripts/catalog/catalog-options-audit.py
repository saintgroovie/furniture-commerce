#!/usr/bin/env python3
"""
catalog-options-audit — read-only Woodright catalog options / variants / upholstery audit.

Usage:
  DATABASE_URL=postgres://... python3 scripts/catalog/catalog-options-audit.py
  DATABASE_URL=... python3 scripts/catalog/catalog-options-audit.py --json-out tmp/catalog-options-audit

Exit codes:
  0 — no critical structural blockers
  1 — usage / connection error
  2 — critical structural blockers present

Does not mutate the database.
"""

from __future__ import annotations

import argparse
import collections
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

FAMILY_KEYS = {"leona", "lillian", "lilian", "linda", "lorna", "torno"}
EXEC_KEYS = [
    "paint_finish_executions",
    "finish_color_executions",
    "fabric_upholstery_executions",
    "upholstery_color_executions",
    "frame_material_executions",
    "headboard_model_executions",
    "construction_tier_executions",
    "material_tier_executions",
]
HEX_RE = re.compile(r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")
TECHNICAL_VALUE_RE = re.compile(
    r"(?i)^(default|стандарт|вариант\s*\d+|вар\.?\s*\d+|исп\.?\s*\d+|тип\s*[а-яa-z0-9]+|\d+дв)$"
)
CLOSEUP_RE = re.compile(
    r"(fabric|swatch|texture|close.?up|ткан|обивк|material.?sample|upholst)", re.I
)

CRITICAL_CODES = {
    "VARIANT_SKU_DUPLICATE",
    "VARIANT_OPTION_MISMATCH",
    "PDP_IMPOSSIBLE_COMBINATION",
    "CART_VARIANT_MISMATCH",
}


def as_exec(meta: dict, key: str) -> list[dict]:
    raw = (meta or {}).get(key)
    if not isinstance(raw, list):
        return []
    out = []
    for e in raw:
        if not isinstance(e, dict):
            continue
        urls = e.get("urls") if isinstance(e.get("urls"), list) else []
        out.append(
            {
                "key": (e.get("key") or "").strip() if isinstance(e.get("key"), str) else "",
                "label": (e.get("label") or "").strip() if isinstance(e.get("label"), str) else "",
                "urls": [u for u in urls if isinstance(u, str) and u.strip()],
                "swatch_hex": e.get("swatch_hex")
                if isinstance(e.get("swatch_hex"), str)
                else None,
                "swatch_image": e.get("swatch_image")
                or e.get("swatch_url")
                or e.get("texture_url"),
                "presentation": e.get("presentation") or e.get("swatch_type"),
            }
        )
    return out


def url_kind(u: str) -> str:
    path = urlparse(u).path.lower()
    name = path.rsplit("/", 1)[-1]
    if CLOSEUP_RE.search(path) or CLOSEUP_RE.search(name):
        return "fabric_closeup_candidate"
    if any(
        f"/{fk}/" in path or f"-{fk}-" in name or f"_{fk}_" in name for fk in FAMILY_KEYS
    ):
        return "family_path_candidate"
    return "unknown_or_scene"


def is_zero(x) -> bool:
    try:
        return x is not None and float(x) == 0
    except Exception:
        return str(x).strip() in ("0", "0 см", "0 мм", "0cm", "0mm")


def run_audit(database_url: str) -> dict:
    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor
    except ImportError as e:
        raise SystemExit(f"psycopg2 required: {e}") from e

    conn = psycopg2.connect(database_url, connect_timeout=15)
    cur = conn.cursor(cursor_factory=RealDictCursor)

    cur.execute(
        """
        SELECT p.id, p.handle, p.title, p.status, p.metadata,
               pc.product_type AS classification
        FROM product p
        LEFT JOIN product_productextensionmodule_product_classificat7e368fb4 link
          ON link.product_id = p.id
        LEFT JOIN product_classification pc
          ON pc.id = link.product_classification_id AND pc.deleted_at IS NULL
        WHERE p.deleted_at IS NULL
        ORDER BY p.handle
        """
    )
    products = cur.fetchall()

    cur.execute(
        """
        SELECT ppo.product_id, o.id AS option_id, o.title AS option_title,
               array_agg(ov.value ORDER BY ov.value) AS values
        FROM product_product_option ppo
        JOIN product_option o ON o.id = ppo.product_option_id AND o.deleted_at IS NULL
        JOIN product_option_value ov ON ov.option_id = o.id AND ov.deleted_at IS NULL
        WHERE ppo.deleted_at IS NULL
        GROUP BY ppo.product_id, o.id, o.title
        """
    )
    options_by_product: dict = collections.defaultdict(list)
    for r in cur.fetchall():
        options_by_product[r["product_id"]].append(
            {
                "option_id": r["option_id"],
                "title": r["option_title"],
                "values": list(r["values"] or []),
            }
        )

    cur.execute(
        """
        SELECT v.id, v.product_id, v.title, v.sku
        FROM product_variant v
        WHERE v.deleted_at IS NULL
        """
    )
    variants_by_product: dict = collections.defaultdict(list)
    for r in cur.fetchall():
        variants_by_product[r["product_id"]].append(
            {"id": r["id"], "title": r["title"], "sku": r["sku"]}
        )

    stats: collections.Counter = collections.Counter()
    option_title_counter: collections.Counter = collections.Counter()
    exec_key_presence: collections.Counter = collections.Counter()
    fabric_value_keys: collections.Counter = collections.Counter()
    issues: list[dict] = []
    inventory: list[dict] = []
    swatch_asset_report: list[dict] = []
    dim_zero: list[dict] = []
    dim_missing: list[dict] = []
    taxonomy_map = {
        "Ткань": "Обивка",
        "Fabric": "Обивка",
        "upholstery_color_executions": "fabric_upholstery_executions",
        "finish_color_executions": "paint_finish_executions",
        "material_tier_executions": "construction_tier_executions (media) / material_tiers (pricing)",
        "Default": "(hide — Medusa stub, not buyer-facing)",
    }

    for p in products:
        meta = p["metadata"] if isinstance(p["metadata"], dict) else {}
        handle = p["handle"] or ""
        title = p["title"] or ""
        classification = p["classification"] or "UNKNOWN"
        stats["products_total"] += 1
        stats[f"class_{classification}"] += 1
        if p["status"]:
            stats[f"status_{p['status']}"] += 1

        opts = options_by_product.get(p["id"], [])
        vars_ = variants_by_product.get(p["id"], [])
        stats["variants_total"] += len(vars_)
        if len(vars_) == 1:
            stats["products_1_variant"] += 1
        elif len(vars_) > 1:
            stats["products_gt1_variant"] += 1
        else:
            stats["products_0_variant"] += 1
            issues.append({"code": "VARIANT_ORPHAN", "handle": handle, "detail": "no variants"})

        if opts:
            stats["products_with_medusa_options"] += 1
        for o in opts:
            option_title_counter[o["title"]] += 1
            for v in o["values"]:
                if not v or not str(v).strip():
                    issues.append(
                        {"code": "OPTION_EMPTY", "handle": handle, "option": o["title"]}
                    )
                elif TECHNICAL_VALUE_RE.match(str(v).strip()):
                    issues.append(
                        {
                            "code": "OPTION_VALUE_NONCANONICAL",
                            "handle": handle,
                            "option": o["title"],
                            "value": v,
                        }
                    )
                    stats["suspicious_option_values"] += 1
            if o["title"] == "Default":
                issues.append(
                    {
                        "code": "DEFAULT_VARIANT_SUSPECT",
                        "handle": handle,
                        "option": o["title"],
                        "severity": "warning",
                        "note": "Medusa stub Default option — must stay hidden from PDP selectors",
                    }
                )
                stats["default_option_suspect"] += 1

        axes = {}
        for k in EXEC_KEYS:
            rows = as_exec(meta, k)
            if rows:
                exec_key_presence[k] += 1
                axes[k] = rows

        fabric = (
            axes.get("fabric_upholstery_executions")
            or axes.get("upholstery_color_executions")
            or []
        )
        paint = (
            axes.get("paint_finish_executions") or axes.get("finish_color_executions") or []
        )
        frame = axes.get("frame_material_executions") or []
        headboard = axes.get("headboard_model_executions") or []
        material_tiers = (
            meta.get("material_tiers") if isinstance(meta.get("material_tiers"), dict) else None
        )

        if fabric:
            stats["products_with_upholstery"] += 1
        if paint:
            stats["products_with_paint_finish"] += 1
        if frame:
            stats["products_with_frame"] += 1
        if headboard:
            stats["products_with_headboard"] += 1
        if material_tiers:
            stats["products_with_material_tiers"] += 1

        buyer_axes = sum(bool(x) for x in [fabric, paint, frame, headboard, material_tiers])
        if buyer_axes >= 2:
            stats["products_multi_buyer_axes"] += 1
        if buyer_axes >= 3:
            stats["products_3plus_buyer_axes"] += 1

        if fabric:
            labels = [r["label"] for r in fabric]
            materialish = [
                l for l in labels if re.search(r"(?i)лдсп|массив|mdf|шпон", l)
            ]
            fabricish = [
                r
                for r in fabric
                if r["key"].lower() in FAMILY_KEYS
                or re.search(r"(?i)ткан|кож|обив|leona|linda|lorna|lil|torno|velutto", r["label"])
            ]
            if materialish and fabricish:
                issues.append(
                    {"code": "MATERIAL_OPTION_MIXED", "handle": handle, "labels": labels}
                )
                stats["material_option_mixed"] += 1

        for row in fabric:
            fabric_value_keys[row["key"]] += 1
            if row["key"].lower() in FAMILY_KEYS:
                stats["upholstery_family_keys"] += 1
            has_hex = bool(row.get("swatch_hex") and HEX_RE.match(row["swatch_hex"].strip()))
            has_image_field = bool(row.get("swatch_image"))
            kinds = {url_kind(u) for u in row["urls"]}
            if has_hex:
                stats["upholstery_values_with_hex"] += 1
            else:
                stats["upholstery_values_without_hex"] += 1
            if has_image_field:
                stats["upholstery_values_with_swatch_image_field"] += 1
            if "fabric_closeup_candidate" in kinds:
                stats["upholstery_url_closeup_candidate"] += 1

            if has_image_field:
                status = "HAS_SWATCH_IMAGE_FIELD"
                stats["upholstery_with_real_image_swatch"] += 1
            elif "fabric_closeup_candidate" in kinds:
                status = "URL_LOOKS_LIKE_CLOSEUP"
            elif has_hex:
                status = "HEX_COLOR_SWATCH"
                stats["upholstery_with_verified_color_fallback"] += 1
            elif row["key"].lower() in FAMILY_KEYS:
                status = "FAMILY_KEY_TEXT_FALLBACK"
                stats["upholstery_text_fallback"] += 1
                issues.append(
                    {
                        "code": "UPHOLSTERY_SWATCH_MISSING",
                        "handle": handle,
                        "key": row["key"],
                        "label": row["label"],
                        "severity": "warning",
                    }
                )
            else:
                status = "MISSING_SWATCH"
                stats["upholstery_missing_unknown"] += 1
                issues.append(
                    {
                        "code": "UPHOLSTERY_SWATCH_MISSING",
                        "handle": handle,
                        "key": row["key"],
                        "label": row["label"],
                    }
                )

            if not row.get("presentation"):
                issues.append(
                    {
                        "code": "UPHOLSTERY_NOT_TYPED",
                        "handle": handle,
                        "key": row["key"],
                        "severity": "warning",
                        "note": "presentation resolved at read-model (PASS C); DB field optional",
                    }
                )
                stats["upholstery_not_typed"] += 1

            swatch_asset_report.append(
                {
                    "product": title,
                    "handle": handle,
                    "fabric_collection": row["key"]
                    if row["key"].lower() in FAMILY_KEYS
                    else None,
                    "fabric_code": row["key"],
                    "label": row["label"],
                    "swatch_found": status
                    in ("HAS_SWATCH_IMAGE_FIELD", "URL_LOOKS_LIKE_CLOSEUP", "HEX_COLOR_SWATCH"),
                    "has_hex": has_hex,
                    "source": (row["urls"][:1] or [None])[0],
                    "url_kinds": sorted(kinds),
                    "mapped": bool(row.get("presentation") or row.get("swatch_image")),
                    "buyer_facing_state": status,
                }
            )

        dims = meta.get("dimensions") or meta.get("dimensions_normalized") or {}
        if not isinstance(dims, dict):
            dims = {}
        w = dims.get("width_mm") or dims.get("width")
        h = dims.get("height_mm") or dims.get("height")
        d = dims.get("depth_mm") or dims.get("depth")
        if not any(x is not None and str(x).strip() != "" for x in (w, h, d)):
            dim_missing.append({"handle": handle, "title": title})
            stats["dimension_missing"] += 1
            issues.append({"code": "DIMENSION_MISSING", "handle": handle})
        if any(is_zero(x) for x in (w, h, d)):
            dim_zero.append({"handle": handle, "title": title, "w": w, "h": h, "d": d})
            stats["dimension_zero"] += 1
            issues.append(
                {"code": "DIMENSION_ZERO", "handle": handle, "w": w, "h": h, "d": d}
            )

        for v in vars_:
            if v["title"] and re.search(
                r"(?i)^(default|variant\s*\d+|стандарт)$", str(v["title"]).strip()
            ):
                issues.append(
                    {
                        "code": "VARIANT_TITLE_TECHNICAL",
                        "handle": handle,
                        "variant_title": v["title"],
                        "sku": v["sku"],
                        "severity": "warning",
                    }
                )
                stats["variant_title_technical"] += 1

        inventory.append(
            {
                "id": p["id"],
                "handle": handle,
                "title": title,
                "status": p["status"],
                "classification": classification,
                "variant_count": len(vars_),
                "medusa_options": opts,
                "variants": vars_,
                "execution_axes": {
                    k: [
                        {
                            "key": r["key"],
                            "label": r["label"],
                            "url_count": len(r["urls"]),
                            "swatch_hex": r.get("swatch_hex"),
                            "swatch_image": r.get("swatch_image"),
                            "presentation": r.get("presentation"),
                        }
                        for r in rows
                    ]
                    for k, rows in axes.items()
                },
                "material_tiers_keys": sorted(material_tiers.keys()) if material_tiers else [],
                "dimensions": {"w": w, "h": h, "d": d},
                "has_upholstery": bool(fabric),
                "fabric_count": len(fabric),
                "buyer_axis_count": buyer_axes,
            }
        )

    skus = [v["sku"] for vs in variants_by_product.values() for v in vs if v.get("sku")]
    sku_counts = collections.Counter(skus)
    dup_skus = [s for s, c in sku_counts.items() if c > 1]
    stats["unique_skus"] = len(sku_counts)
    stats["duplicate_skus"] = len(dup_skus)
    for s in dup_skus:
        issues.append({"code": "VARIANT_SKU_DUPLICATE", "sku": s, "severity": "critical"})

    issue_counts = collections.Counter(i["code"] for i in issues)
    critical = [i for i in issues if i.get("code") in CRITICAL_CODES or i.get("severity") == "critical"]

    conn.close()
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "postgres read-only catalog-options-audit",
        "stats": dict(stats),
        "issue_counts": dict(issue_counts),
        "critical_count": len(critical),
        "taxonomy": {
            "source_to_canonical": taxonomy_map,
            "medusa_option_titles": option_title_counter.most_common(),
            "exec_key_presence": exec_key_presence.most_common(),
            "top_fabric_keys": fabric_value_keys.most_common(50),
        },
        "duplicate_skus": dup_skus,
        "dimension_zero": dim_zero,
        "dimension_missing": dim_missing,
        "inventory": inventory,
        "issues": issues,
        "swatch_asset_report": swatch_asset_report,
        "critical": critical,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Woodright catalog options audit (read-only)")
    ap.add_argument(
        "--json-out",
        default="tmp/catalog-options-audit",
        help="Directory for JSON reports",
    )
    ap.add_argument(
        "--label",
        default="snapshot",
        help="Filename prefix label (e.g. BEFORE / AFTER)",
    )
    args = ap.parse_args()
    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        print("DATABASE_URL is required", file=sys.stderr)
        return 1

    report = run_audit(database_url)
    out_dir = Path(args.json_out)
    out_dir.mkdir(parents=True, exist_ok=True)
    label = args.label.strip() or "snapshot"
    (out_dir / f"{label}_metrics.json").write_text(
        json.dumps(
            {
                "generated_at": report["generated_at"],
                "stats": report["stats"],
                "issue_counts": report["issue_counts"],
                "critical_count": report["critical_count"],
                "taxonomy": report["taxonomy"],
                "duplicate_skus": report["duplicate_skus"],
                "dimension_zero_count": len(report["dimension_zero"]),
                "dimension_missing_count": len(report["dimension_missing"]),
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    (out_dir / f"{label}_inventory.json").write_text(
        json.dumps(report["inventory"], ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (out_dir / f"{label}_issues.json").write_text(
        json.dumps(report["issues"], ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (out_dir / f"{label}_swatch_asset_report.json").write_text(
        json.dumps(report["swatch_asset_report"], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (out_dir / f"{label}_dimensions_missing.json").write_text(
        json.dumps(report["dimension_missing"], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"=== catalog-options-audit ({label}) ===")
    for k, v in sorted(report["stats"].items()):
        print(f"{k}: {v}")
    print("=== issue_counts ===")
    for k, v in sorted(report["issue_counts"].items(), key=lambda x: (-x[1], x[0])):
        print(f"{k}: {v}")
    print(f"critical_count: {report['critical_count']}")
    print(f"wrote {out_dir}")

    if report["critical_count"] > 0:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
