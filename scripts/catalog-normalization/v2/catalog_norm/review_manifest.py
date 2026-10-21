"""Per-SKU normalization manifest for owner / reviewer use. Pure, deterministic, no writes to Medusa.

One entry per SKU: source product, family, canonical product, variant key, mattress size,
effective finish / fabric capabilities, motif, base price, publication status, decision and
blocker. Missing axis combinations of multi-variant products are listed with their reason;
they are never created.
"""

from __future__ import annotations

import itertools
import json
from typing import Any

from catalog_norm.decisions import motif_of

CAPABILITY_KEYS = (
    "finish_color_executions",
    "paint_finish_executions",
    "fabric_upholstery_executions",
    "upholstery_color_executions",
    "frame_material_executions",
    "headboard_model_executions",
    "material_tiers",
    "pedestal_filling",
    "finish_color_labels",
    "paint_finish_labels",
    "fabric_upholstery_labels",
)
REJECTED_REASON = "no SKU exists for this axis combination; it is not offered and never created"


def _live_variants(product: dict[str, Any]) -> list[dict[str, Any]]:
    return [v for v in product.get("variants") or [] if not v.get("deleted_at")]


def _codes(value: Any) -> list[str]:
    if isinstance(value, dict):
        return sorted(str(key) for key in value)
    if isinstance(value, list):
        out = []
        for item in value:
            if isinstance(item, dict):
                out.append(str(item.get("key") or item.get("code") or item.get("value") or json.dumps(item, sort_keys=True, ensure_ascii=False)))
            else:
                out.append(str(item))
        return sorted(out)
    return [] if value in (None, "") else [str(value)]


def effective_capabilities(product: dict[str, Any], variant: dict[str, Any]) -> dict[str, list[str]]:
    """Same precedence as storefront / cart `productMetadataForVariant`."""
    merged = dict(product.get("metadata") or {})
    caps = (variant.get("metadata") or {}).get("capabilities")
    if isinstance(caps, dict):
        for key in CAPABILITY_KEYS:
            if key in caps:
                merged[key] = caps[key]
            else:
                merged.pop(key, None)
    return {key: _codes(merged.get(key)) for key in CAPABILITY_KEYS if _codes(merged.get(key))}


def _axes(variant: dict[str, Any]) -> dict[str, str]:
    raw = (variant.get("metadata") or {}).get("variant_axes") or {}
    if not isinstance(raw, dict):
        return {}
    return {key: item["display"] for key, item in sorted(raw.items()) if isinstance(item, dict) and item.get("display")}


def rejected_combinations(products: list[dict[str, Any]], family_of: dict[str, str]) -> list[dict[str, Any]]:
    out = []
    for product in products:
        if product.get("deleted_at"):
            continue
        variants = _live_variants(product)
        if len(variants) < 2:
            continue
        axes = [_axes(v) for v in variants]
        if not all(axes):
            continue
        keys = sorted(axes[0])
        if not all(sorted(a) == keys for a in axes):
            continue
        have = {tuple(a[k] for k in keys) for a in axes}
        values = [sorted({a[k] for a in axes}) for k in keys]
        for combo in itertools.product(*values):
            if combo in have:
                continue
            out.append({
                "product_id": product.get("id") or "",
                "handle": product.get("handle") or "",
                "family_key": family_of.get(product.get("id") or "", ""),
                "combination": dict(zip(keys, combo)),
                "reason": REJECTED_REASON,
            })
    return sorted(out, key=lambda item: (item["handle"], json.dumps(item["combination"], ensure_ascii=False, sort_keys=True)))


def build_manifest(rows: list[dict[str, Any]], products: list[dict[str, Any]]) -> dict[str, Any]:
    by_product = {p.get("id"): p for p in products if not p.get("deleted_at")}
    variant_of = {
        v.get("id"): v for p in by_product.values() for v in _live_variants(p)
    }
    family_of: dict[str, str] = {}
    entries = []
    for row in rows:
        family_of.setdefault(row["product_id"], row["family_key"])
        if not row["sku"]:
            continue
        product = by_product.get(row["product_id"]) or {}
        variant = variant_of.get(row["variant_id"]) or {}
        metadata = product.get("metadata") or {}
        mattress = (variant.get("metadata") or {}).get("mattress_size")
        willie = (product.get("collection_handle") or "") == "willie-winkie"
        axes = _axes(variant)
        entries.append({
            "sku": row["sku"],
            "source_product_id": row["product_id"],
            "handle": product.get("handle") or "",
            "family_key": row["family_key"],
            "canonical_product_id": row["product_id"],
            "canonical_title": row["proposed_clean_title"],
            "variant_id": row["variant_id"],
            "variant_key": "|".join(f"{key}={value}" for key, value in axes.items()),
            "mattress_size": mattress.get("display", "") if isinstance(mattress, dict) else "",
            "finish_fabric": effective_capabilities(product, variant),
            "motif_title": motif_of(product) if willie else "",
            "motif_slug": (metadata.get("motif_slug") or "") if willie else "",
            "price": row["current_price"],
            "expected_price": row["expected_price"],
            "status": row["status"],
            "decision": row["decision"],
            "blocker": row["blocker"],
        })
    entries.sort(key=lambda item: item["sku"])
    rejected = rejected_combinations(products, family_of)
    return {
        "production": "NOT_MUTATED",
        "sku_rows": len(entries),
        "rejected_combinations": len(rejected),
        "skus": entries,
        "rejected": rejected,
    }


def manifest_text(manifest: dict[str, Any]) -> str:
    return json.dumps(manifest, ensure_ascii=False, indent=1, sort_keys=True) + "\n"
