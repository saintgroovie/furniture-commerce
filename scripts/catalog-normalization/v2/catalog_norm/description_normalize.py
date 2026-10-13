"""Turn a shared family description into text that is true of every SKU.

The source is the existing editorial paragraph. Sentences that name one
variant are removed. Nothing new is claimed except that a multi-SKU model
has several sizes and executions, and only when that is structurally true.
"""

from __future__ import annotations

import re
from typing import Any

from catalog_norm.description_fidelity import (
    BOILERPLATE,
    CM_RE,
    SIZE_RE,
    _cm,
    _norm,
    _pair_shared,
    _shared_cm,
    _varies,
    classify_family_description,
)

SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+|\n+|;\s*")
FALLBACK = "Модель представлена в нескольких размерах и исполнениях."


def _tidy(text: str) -> str:
    cleaned = text.replace("\u2014", " - ").replace("\u2013", " - ")
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    cleaned = re.sub(r" *\n *", "\n", cleaned)
    return cleaned.strip()


def _sentences(text: str) -> list[str]:
    parts = []
    for part in SENTENCE_SPLIT.split(text.strip()):
        sentence = part.strip(" ;")
        if not sentence:
            continue
        if sentence[0].islower():
            sentence = sentence[0].upper() + sentence[1:]
        if sentence[-1] not in ".!?":
            sentence += "."
        parts.append(sentence)
    return parts


def _substantial(text: str) -> bool:
    folded = _norm(text).replace(BOILERPLATE, "").replace("уточним в заявке", "")
    body = re.sub(r"[^0-9a-zа-я]+", "", folded)
    return len(body) >= 12


def propose_family_description(
    description: str,
    title: str,
    variants: list[dict[str, Any]],
) -> dict[str, str]:
    """Return the family-safe text, the action, and why."""
    current = _tidy(description or "")
    verdict = classify_family_description(current, variants)
    if verdict["classification"] == "FAMILY_SAFE":
        return {
            "proposed_description": current,
            "action": "KEEP_FAMILY_SAFE",
            "confidence": "high",
            "evidence": verdict["evidence"],
        }
    kept = [
        sentence
        for sentence in _sentences(current)
        if classify_family_description(sentence, variants)["classification"] != "VARIANT_SPECIFIC"
    ]
    candidate = _tidy(" ".join(kept))
    if candidate and classify_family_description(candidate, variants)["classification"] == "FAMILY_SAFE" and _substantial(candidate):
        return {
            "proposed_description": candidate,
            "action": "REWRITE_FAMILY_SAFE",
            "confidence": "high",
            "evidence": "kept sentences that are true for every SKU",
        }
    if len(variants) > 1 and (title or "").strip():
        fallback = _tidy(f"{title.strip()}. {FALLBACK}")
        if classify_family_description(fallback, variants)["classification"] == "FAMILY_SAFE":
            return {
                "proposed_description": fallback,
                "action": "REWRITE_FAMILY_SAFE",
                "confidence": "high",
                "evidence": "shared sentences were only the variant boilerplate; title is the family name",
            }
    return {
        "proposed_description": current,
        "action": "HOLD_INSUFFICIENT_EVIDENCE",
        "confidence": "low",
        "evidence": "no family-safe wording follows from the current text and the variant structure",
    }


def description_facts(description: str, variants: list[dict[str, Any]]) -> list[dict[str, str]]:
    """Classify concrete claims already present in the prose."""
    text = _norm(description or "")
    facts: list[dict[str, str]] = []
    seen: set[str] = set()

    def add(fact: str, klass: str, evidence: str) -> None:
        if fact in seen:
            return
        seen.add(fact)
        facts.append({"fact": fact, "class": klass, "evidence": evidence})

    for width, length in SIZE_RE.findall(text):
        pair = f"{width}x{length}"
        if _pair_shared(variants, int(width), int(length)):
            add(pair, "COMMON", "every SKU has this mattress or body pair")
        else:
            add(pair, "VARIANT", "this pair is not on every SKU")

    shared = set()
    for field in ("width_mm", "depth_mm", "height_mm"):
        shared |= _shared_cm(variants, field)
    for number in CM_RE.findall(text):
        cm = int(round(float(number.replace(",", "."))))
        label = f"{cm} см"
        if cm in shared:
            add(label, "COMMON", "same body measurement on every SKU")
            continue
        owners = []
        for variant in variants:
            dims = variant.get("dimensions") or {}
            if cm in {_cm(dims.get(field)) for field in ("width_mm", "depth_mm", "height_mm")}:
                owners.append(str(variant.get("sku") or ""))
        if owners and len(owners) < len(variants):
            add(label, "VARIANT", "measurement of " + ",".join(owners))
        elif not owners:
            add(label, "UNKNOWN", "centimetres that are not a stored body measurement")

    axis_keys = {key for variant in variants for key in (variant.get("axes") or {})}
    for axis in sorted(axis_keys):
        if not _varies(variants, axis):
            continue
        for variant in variants:
            display = str((variant.get("axes") or {}).get(axis) or "").strip()
            if display and _norm(display) in text:
                add(f"{axis}={display}", "VARIANT", "axis value is not shared")
    return facts
