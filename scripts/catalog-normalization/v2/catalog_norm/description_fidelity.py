"""Classify a family description against the SKUs that share it.

Editorial copy stays. This module does not rewrite it. A description that
states a fact of only some variants is a hold, not a silent family fact.
"""

from __future__ import annotations

import re
from typing import Any

from catalog_norm.decisions import yo

SIZE_RE = re.compile(r"(\d{2,3})\s*[xхХX×*]\s*(\d{2,3})")
CM_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*см")
SKU_RE = re.compile(r"\b[A-Z]{2,3}-\d{2}(?:-\d|-[A-ZА-Я])\b")

BOILERPLATE = "есть варианты исполнения"


def _norm(text: str) -> str:
    return yo(text or "").lower().replace("ё", "е").replace("×", "x")


def _cm(mm: Any) -> int | None:
    try:
        value = int(mm)
    except (TypeError, ValueError):
        return None
    if value <= 0:
        return None
    return int(round(value / 10))


def _pair_shared(variants: list[dict[str, Any]], width: int, length: int) -> bool:
    """True when every SKU has this pair as its mattress or its body."""
    if not variants:
        return False
    pair = (width, length)

    def mattress_pair(variant: dict[str, Any]) -> tuple[int, int] | None:
        found = SIZE_RE.search(_norm(str(variant.get("mattress") or "")))
        if not found:
            return None
        return int(found.group(1)), int(found.group(2))

    def body_pairs(variant: dict[str, Any]) -> set[tuple[int, int]]:
        dims = variant.get("dimensions") or {}
        values = [_cm(dims.get(field)) for field in ("width_mm", "depth_mm", "height_mm")]
        pairs = set()
        for left in values:
            for right in values:
                if left and right and left != right:
                    pairs.add((left, right))
        return pairs

    mattresses = [mattress_pair(variant) for variant in variants]
    if all(item == pair for item in mattresses):
        return True
    return all(pair in body_pairs(variant) for variant in variants)


def _displays(variants: list[dict[str, Any]], axis: str) -> set[str]:
    found = set()
    for variant in variants:
        raw = (variant.get("axes") or {}).get(axis)
        if raw:
            found.add(_norm(str(raw)))
    return found


def _varies(variants: list[dict[str, Any]], axis: str) -> bool:
    return len(_displays(variants, axis)) > 1


def _shared_cm(variants: list[dict[str, Any]], field: str) -> set[int]:
    values = {_cm((variant.get("dimensions") or {}).get(field)) for variant in variants}
    values.discard(None)
    if len(values) == 1:
        return values
    return set()


def classify_family_description(description: str, variants: list[dict[str, Any]]) -> dict[str, str]:
    """Return classification, claims, disposition and the SKU the text describes."""
    raw = (description or "").strip()
    if not raw:
        return {
            "classification": "EMPTY",
            "claims": "",
            "disposition": "DESCRIPTION_EMPTY_HOLD",
            "source_sku": variants[0]["sku"] if variants else "",
            "evidence": "description is empty",
        }
    text = _norm(raw)
    claims: list[str] = []

    for width, length in SIZE_RE.findall(text):
        if not _pair_shared(variants, int(width), int(length)):
            claims.append(f"size {width}x{length}")

    shared = set()
    for field in ("width_mm", "depth_mm", "height_mm"):
        shared |= _shared_cm(variants, field)
    seen_cm = set()
    for number in CM_RE.findall(text):
        cm = int(round(float(number.replace(",", "."))))
        if cm in seen_cm:
            continue
        seen_cm.add(cm)
        if cm in shared:
            continue
        owners = []
        for variant in variants:
            dims = variant.get("dimensions") or {}
            if cm in {_cm(dims.get(field)) for field in ("width_mm", "depth_mm", "height_mm")}:
                owners.append(variant["sku"])
        if owners and len(owners) < len(variants):
            claims.append(f"{cm} см on {','.join(owners)}")

    lexical = (
        (("без изнож", "с изнож"), "footboard"),
        (("без подъем", "с подъем"), "lift"),
        (("без ткани", "с тканью"), "fabric"),
        (("с рисунком", "с тканью"), "fabric"),
        (("слева", "справа"), "side"),
        (("слева", "справа"), "layout"),
    )
    for phrases, axis in lexical:
        if not _varies(variants, axis):
            continue
        hit = [phrase for phrase in phrases if phrase in text]
        if hit:
            claims.append(f"{axis}: {', '.join(hit)}")
    if _varies(variants, "fabric") and ("рисунок" in text or "тканев" in text):
        claims.append("fabric")

    if _varies(variants, "doors") and re.search(r"двер", text):
        claims.append("doors")
    if _varies(variants, "door") and "двер" in text:
        claims.append("door")
    if _varies(variants, "drawers") and "ящик" in text:
        claims.append("drawers")
    if _varies(variants, "shelves") and "полк" in text:
        claims.append("shelves")
    if _varies(variants, "filling") and ("ящик" in text or "полк" in text or "двер" in text):
        claims.append("filling")
    if _varies(variants, "tiers") and "ярус" in text:
        claims.append("tiers")
    if _varies(variants, "tier") and "ярус" in text:
        claims.append("tier")
    if _varies(variants, "size") and re.search(r"мал|больш|широк|узк", text):
        claims.append("size")
    if _varies(variants, "form") and re.search(r"широк|узк|стандарт|высок", text):
        claims.append("form")
    if _varies(variants, "mattress_size") and "односпальн" in text:
        claims.append("single-bed wording")

    unique = []
    for claim in claims:
        if claim not in unique:
            unique.append(claim)
    source = _source_sku(text, variants)
    if not unique:
        body = text.replace(BOILERPLATE, "").strip(" .")
        if len(body) < 12:
            return {
                "classification": "EMPTY",
                "claims": "",
                "disposition": "DESCRIPTION_EMPTY_HOLD",
                "source_sku": source,
                "evidence": "description has no product fact",
            }
        return {
            "classification": "FAMILY_SAFE",
            "claims": "",
            "disposition": "safe",
            "source_sku": source,
            "evidence": "no variant-only size, axis or dimension",
        }
    return {
        "classification": "VARIANT_SPECIFIC",
        "claims": "; ".join(unique),
        "disposition": "DESCRIPTION_VARIANT_SPECIFIC_HOLD",
        "source_sku": source,
        "evidence": "description states a fact that is not true of every SKU in the family",
    }


def _source_sku(text: str, variants: list[dict[str, Any]]) -> str:
    best = variants[0]["sku"] if variants else ""
    best_score = -1
    for variant in variants:
        score = 0
        mattress = _norm(str(variant.get("mattress") or ""))
        if mattress and mattress.replace("×", "x") in text.replace("×", "x"):
            score += 5
        for field in ("width_mm", "depth_mm", "height_mm"):
            cm = _cm((variant.get("dimensions") or {}).get(field))
            if cm and re.search(rf"\b{cm}(?:[.,]\d+)?\s*см", text):
                score += 1
        if score > best_score:
            best, best_score = variant["sku"], score
    return best


def title_problem(title: str, variants: list[dict[str, Any]]) -> str:
    """Empty string when the published title does not name one variant."""
    text = title or ""
    if SIZE_RE.search(text) or SKU_RE.search(text.upper()):
        return "size or sku in title"
    folded = _norm(text)
    for axis in {key for variant in variants for key in (variant.get("axes") or {})}:
        if not _varies(variants, axis):
            continue
        for variant in variants:
            display = _norm(str((variant.get("axes") or {}).get(axis) or ""))
            if display and display in folded:
                return f"title contains varying {axis}"
    return ""
