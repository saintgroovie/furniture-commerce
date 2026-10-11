"""Catalog Normalization V2 decisions.

Similarity, collection, and legacy family_key never merge a family.
A variant is a buyer choice of one product. Different construction stays
a different product. Willie Winkie motifs stay in the title and the family key.
"""

from __future__ import annotations

import csv
import json
import re
from collections import defaultdict
from typing import Any

SIZE_RE = re.compile(r"\(?\s*\d{2,4}\s*[xхХX×*]\s*\d{2,4}\s*\)?")
SPALNOST_RE = re.compile(r"\d(?:,5)?\s*-\s*сп\.?", re.IGNORECASE)
FINISH_KEYS = (
    "finish_color_executions",
    "paint_finish_executions",
    "fabric_upholstery_executions",
    "upholstery_color_executions",
    "frame_material_executions",
    "headboard_model_executions",
)

MODEL_RU = {
    "oliver": "Оливер",
    "provence": "Прованс",
    "greenwich": "Гринвич",
    "country-london-paris": "Кантри",
    "oxford": "Оксфорд",
}


def yo(text: str) -> str:
    return (text or "").replace("ё", "е").replace("Ё", "Е")


def sku_of(product: dict[str, Any]) -> str:
    variants = [v for v in product.get("variants") or [] if not v.get("deleted_at")]
    if not variants:
        return ""
    return variants[0].get("sku") or ""


def skus_of(product: dict[str, Any]) -> list[str]:
    return [
        v.get("sku") or ""
        for v in product.get("variants") or []
        if not v.get("deleted_at") and v.get("sku")
    ]


def base_amount(variant: dict[str, Any]) -> str:
    for price in variant.get("prices") or []:
        if not price.get("price_list_id") and price.get("amount") not in (None, ""):
            return str(price.get("amount"))
    return ""


def mattress_of(variant: dict[str, Any]) -> dict[str, Any] | None:
    bag = ((variant.get("metadata") or {}).get("mattress_size")) or {}
    if bag.get("source") != "title" or bag.get("confidence") != "high":
        return None
    try:
        width = int(bag.get("width_cm"))
        length = int(bag.get("length_cm"))
    except (TypeError, ValueError):
        return None
    if width <= 0 or length <= 0:
        return None
    display = f"{width} × {length} см"
    if bag.get("display") not in (None, display):
        return None
    if bag.get("key") not in (None, f"{width}x{length}"):
        return None
    return {"width": width, "length": length, "display": display, "key": f"{width}x{length}"}


def construction_flags(title: str) -> tuple[str, ...]:
    text = yo(title).lower()
    flags = []
    if "трансформер" in text:
        flags.append("transformer")
    if "новорожден" in text:
        flags.append("newborn")
    if "приставн" in text:
        flags.append("side-crib")
    if "нижняя кровать" in text or text.startswith("нижняя кровать"):
        flags.append("lower-bed")
    if "с тканью" in text:
        flags.append("fabric")
    if "с рисунком" in text:
        flags.append("drawing")
    if "без изнож" in text:
        flags.append("no-footboard")
    if "подъем" in text:
        flags.append("lift")
    return tuple(flags)


def is_bed(product: dict[str, Any]) -> bool:
    title = yo(product.get("title") or "").lower()
    cats = product.get("categories") or []
    if "bortiki" in cats or title.startswith("бортик") or "балдахин" in title:
        return False
    if "krovati" in cats:
        return True
    return title.startswith("кровать") or title.startswith("кроватка") or title.startswith("нижняя кровать")


def is_willie(product: dict[str, Any]) -> bool:
    return (product.get("collection_handle") or "") == "willie-winkie"


def motif_of(product: dict[str, Any]) -> str:
    title = product.get("title") or ""
    # Motif is the distinctive sold name, not the furniture type.
    known = (
        "Сказочное королевство",
        "Полевые цветы",
        "Рыцари",
        "Ballet",
        "Fairies",
        "Pastoral",
        "Балет",
        "Феи",
        "Пастораль",
    )
    for name in known:
        if name.lower() in title.lower():
            return name
    return ""


def finish_blob(product: dict[str, Any]) -> dict[str, Any]:
    meta = product.get("metadata") or {}
    return {key: meta.get(key) for key in FINISH_KEYS if key in meta}


def finish_signature(product: dict[str, Any]) -> str:
    return json.dumps(finish_blob(product), sort_keys=True, ensure_ascii=False)


def finish_proven(product: dict[str, Any]) -> bool:
    for value in finish_blob(product).values():
        if isinstance(value, dict) and len(value) > 0:
            return True
        if isinstance(value, list) and len(value) > 0:
            return True
    return False


def proposed_bed_title(product: dict[str, Any]) -> str:
    flags = construction_flags(product.get("title") or "")
    model = MODEL_RU.get(product.get("collection_handle") or "", "")
    bits = ["Кровать" if not (product.get("title") or "").lower().startswith("кроватка") else "Кроватка"]
    if model:
        bits.append(model)
    phrases = {
        "no-footboard": "без изножья",
        "lift": "с подъёмным механизмом",
        "fabric": "с тканью",
        "drawing": "с рисунком",
        "transformer": "трансформер",
        "newborn": "для новорожденного",
        "side-crib": "приставная",
        "lower-bed": "нижняя",
    }
    for flag in flags:
        if flag in phrases and phrases[flag] not in " ".join(bits):
            bits.append(phrases[flag])
    return " ".join(bits)


def clean_generic_title(title: str) -> str:
    text = SIZE_RE.sub(" ", title or "")
    text = re.sub(r"\s+", " ", text).strip(" -")
    return text


def classify(products: list[dict[str, Any]]) -> dict[str, Any]:
    live = [p for p in products if not p.get("deleted_at")]
    deleted = [p for p in products if p.get("deleted_at")]
    rows: list[dict[str, Any]] = []
    families: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for product in live:
        variants = [v for v in product.get("variants") or [] if not v.get("deleted_at")]
        mattresses = [mattress_of(v) for v in variants]
        confirmed = [m for m in mattresses if m]
        shell = product.get("status") == "draft" and (
            not variants
            or ((product.get("metadata") or {}).get("catalog_norm_v2") or {}).get("archived_shell")
        )
        if shell:
            family = f"legacy-shell/{product.get('id')}"
            decision = "LEGACY_SHELL"
            axis = ""
            clean = product.get("title") or ""
            confidence = "high"
            blocker = "draft shell kept, not deleted"
        elif len(variants) >= 2 and len(confirmed) == len(variants) and is_bed(product):
            family = f"{product.get('collection_handle') or 'collection'}/bed/mattress-size"
            decision = "ALREADY_APPLIED"
            axis = "mattress_size"
            clean = product.get("title") or ""
            confidence = "high"
            blocker = ""
        elif is_willie(product):
            motif = motif_of(product) or "title-is-motif"
            family = f"willie-winkie/{motif}/{sku_of(product) or product.get('handle')}"
            decision = "KEEP_SEPARATE_PRODUCTS"
            axis = ""
            clean = product.get("title") or ""
            confidence = "high"
            blocker = ""
        elif is_bed(product):
            flags = "-".join(construction_flags(product.get("title") or "")) or "unmarked"
            family = f"{product.get('collection_handle') or 'collection'}/bed/{flags}"
            decision = "PENDING_GROUP"
            axis = "mattress_size" if confirmed else ""
            clean = proposed_bed_title(product) if confirmed else (product.get("title") or "")
            confidence = "high" if confirmed else "low"
            blocker = "" if confirmed else "MATTRESS_SIZE_UNKNOWN"
        else:
            family = f"standalone/{sku_of(product) or product.get('handle')}"
            decision = "KEEP_SEPARATE_PRODUCTS"
            axis = ""
            clean = clean_generic_title(product.get("title") or "")
            confidence = "high"
            blocker = ""
        record = {
            "product": product,
            "family_key": family,
            "decision": decision,
            "axis": axis,
            "clean": clean,
            "confidence": confidence,
            "blocker": blocker,
            "variants": variants,
            "confirmed": confirmed,
        }
        families[family].append(record)

    # Beds that share a construction family stay separate unless they pass
    # the Greenwich gate: STANDARD, identical finishes, identical galleries,
    # and the only buyer difference is mattress size. That gate already ran
    # for Greenwich. A finish or gallery mismatch is not a merge.
    for family, members in families.items():
        if not members or members[0]["decision"] != "PENDING_GROUP":
            continue
        if len(members) == 1:
            members[0]["decision"] = "KEEP_SEPARATE_PRODUCTS"
            if members[0]["blocker"] == "MATTRESS_SIZE_UNKNOWN":
                members[0]["decision"] = "AMBIGUOUS_HOLD"
            continue
        signatures = {finish_signature(m["product"]) for m in members}
        galleries = {
            tuple(m["product"].get("images") or [])
            for m in members
        }
        classes = {(m["product"].get("classification") or "") for m in members}
        if (
            len(signatures) == 1
            and len(galleries) == 1
            and classes == {"STANDARD"}
            and all(m["confirmed"] for m in members)
            and all(finish_proven(m["product"]) for m in members)
            and all(m["product"].get("images") for m in members)
        ):
            for member in members:
                member["decision"] = "SAFE_VARIANT_FAMILY"
                member["blocker"] = ""
        else:
            for member in members:
                member["decision"] = "KEEP_SEPARATE_PRODUCTS"
                member["blocker"] = (
                    "construction family stays separate: finish, gallery, or classification "
                    "is not the Greenwich gate"
                )
                member["confidence"] = "high"

    # Orientation pairs are candidates only. Unequal finishes are a hold,
    # not a merge. Legacy family_key is ignored.
    _mark_orientation_holds(families)

    for family, members in families.items():
        for member in members:
            product = member["product"]
            if member["variants"]:
                for variant in member["variants"]:
                    rows.append(_sku_row(product, variant, member))
            else:
                rows.append(_sku_row(product, {}, member))

    for product in deleted:
        rows.append({
            "sku": sku_of(product),
            "product_id": product.get("id"),
            "current_title": product.get("title") or "",
            "proposed_clean_title": product.get("title") or "",
            "collection": product.get("collection_handle") or "",
            "product_type": ",".join(product.get("categories") or []),
            "classification": product.get("classification") or "",
            "family_key": f"deleted/{sku_of(product) or product.get('handle')}",
            "decision": "INTENTIONALLY_EXCLUDED",
            "variant_axis": "",
            "mattress_width_cm": "",
            "mattress_length_cm": "",
            "current_price": "",
            "expected_price": "",
            "status": product.get("status") or "",
            "media_count": len(product.get("images") or []),
            "confidence": "high",
            "evidence": "deleted_at set",
            "blocker": "",
            "legacy_family_key": (product.get("metadata") or {}).get("family_key") or "",
            "title_apply": "no",
        })

    _unique_title_apply(rows)
    return {"rows": rows, "summary": _summary(rows)}


def kind_of(product: dict[str, Any]) -> str:
    title = yo(product.get("title") or "")
    if re.search(r"(0П|П0)$", title):
        return "shelves"
    if re.search(r"(0Я|Я0)$", title):
        return "drawers"
    if "слева" in title and "справа" in title:
        return "mirror"
    return "other"


def orientation_stem(title: str) -> str:
    text = yo(title)
    text = re.sub(r"\s+(0П|П0|0Я|Я0)$", "", text)
    text = text.replace("полки слева, ящики справа", "MIRROR")
    text = text.replace("ящики слева, полки справа", "MIRROR")
    return re.sub(r"\s+", " ", text).strip()


def _mark_orientation_holds(families: dict[str, list[dict[str, Any]]]) -> None:
    desks = []
    for members in families.values():
        for member in members:
            title = yo(member["product"].get("title") or "")
            if re.search(r"(0П|П0|0Я|Я0)$", title) or ("слева" in title and "справа" in title):
                desks.append(member)
    groups: dict[tuple, list] = defaultdict(list)
    for member in desks:
        product = member["product"]
        groups[(
            product.get("collection_handle"),
            kind_of(product),
            orientation_stem(product.get("title") or ""),
            product.get("classification"),
        )].append(member)
    for group in groups.values():
        if len(group) < 2:
            continue
        signatures = {finish_signature(m["product"]) for m in group}
        prices = set()
        for member in group:
            variants = member["variants"]
            prices.add(base_amount(variants[0]) if variants else "")
        proven = all(finish_proven(m["product"]) for m in group)
        if len(signatures) == 1 and len(prices) == 1 and "" not in prices and proven:
            sample = group[0]["product"]
            shared = "orientation/{}/{}/{}/{}".format(
                sample.get("collection_handle") or "collection",
                sample.get("classification") or "unknown",
                kind_of(sample),
                orientation_stem(sample.get("title") or ""),
            )
            for member in group:
                member["decision"] = "SAFE_VARIANT_FAMILY"
                member["axis"] = "orientation"
                member["family_key"] = shared
                member["blocker"] = ""
        else:
            for member in group:
                member["decision"] = "AMBIGUOUS_HOLD"
                member["axis"] = "orientation"
                member["blocker"] = "left/right pair: finish payloads or prices are not identical"
                member["confidence"] = "low"


def _sku_row(product: dict[str, Any], variant: dict[str, Any], member: dict[str, Any]) -> dict[str, Any]:
    mattress = mattress_of(variant) if variant else None
    price = base_amount(variant) if variant else ""
    return {
        "sku": (variant.get("sku") if variant else "") or "",
        "product_id": product.get("id") or "",
        "variant_id": (variant.get("id") if variant else "") or "",
        "current_title": product.get("title") or "",
        "proposed_clean_title": member["clean"],
        "collection": product.get("collection_handle") or "",
        "product_type": ",".join(product.get("categories") or []),
        "classification": product.get("classification") or "",
        "family_key": member["family_key"],
        "decision": member["decision"],
        "variant_axis": member["axis"],
        "mattress_width_cm": "" if not mattress else mattress["width"],
        "mattress_length_cm": "" if not mattress else mattress["length"],
        "current_price": price,
        "expected_price": price,
        "status": product.get("status") or "",
        "media_count": len(product.get("images") or []),
        "confidence": member["confidence"],
        "evidence": "legacy family_key ignored: " + ((product.get("metadata") or {}).get("family_key") or "none"),
        "blocker": member["blocker"],
        "legacy_family_key": (product.get("metadata") or {}).get("family_key") or "",
        "title_apply": "no",
    }


def _unique_title_apply(rows: list[dict[str, Any]]) -> None:
    published = [row for row in rows if row["status"] == "published" and row["decision"] != "LEGACY_SHELL"]
    by_title: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in published:
        if row["proposed_clean_title"] and row["proposed_clean_title"] != row["current_title"]:
            by_title[row["proposed_clean_title"]].append(row)
    for group in by_title.values():
        families = {row["family_key"] for row in group}
        decisions = {row["decision"] for row in group}
        if len(group) == 1 and decisions == {"KEEP_SEPARATE_PRODUCTS"} and SIZE_RE.search(group[0]["current_title"]):
            # A lone published title may drop a size only when that size is structured.
            row = group[0]
            if row["mattress_width_cm"] != "":
                row["title_apply"] = "yes"
                row["decision"] = "RENAME_ONLY"
        elif len(families) == 1 and decisions == {"SAFE_VARIANT_FAMILY"}:
            for row in group:
                row["title_apply"] = "with-merge"
        else:
            for row in group:
                if row["decision"] in {"KEEP_SEPARATE_PRODUCTS", "AMBIGUOUS_HOLD", "PENDING_GROUP"}:
                    row["title_apply"] = "no"
                    if "title collides" not in row["blocker"]:
                        extra = "clean title would collide while products stay separate"
                        row["blocker"] = f"{row['blocker']}; {extra}".strip("; ")


def _summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    from collections import Counter
    decisions = Counter(row["decision"] for row in rows)
    skus = [row["sku"] for row in rows if row["sku"]]
    return {
        "sku_rows": len(skus),
        "sku_unique": len(set(skus)) == len(skus),
        "decisions": dict(decisions),
        "price_mismatch": sum(1 for row in rows if row["current_price"] != row["expected_price"]),
        "title_apply_yes": sum(1 for row in rows if row["title_apply"] == "yes"),
    }


def mattress_rows(products: list[dict[str, Any]], price_rows: list[dict[str, str]]) -> list[dict[str, str]]:
    """Standalone mattresses only. A bed that includes a mattress is not a mattress family."""
    out = []
    seen = set()
    for product in products:
        if product.get("deleted_at"):
            continue
        title = yo(product.get("title") or "").lower()
        if "матрас" not in title:
            continue
        sku = sku_of(product)
        seen.add(sku)
        out.append({
            "sku": sku,
            "current_title": product.get("title") or "",
            "canonical_model": "",
            "clean_title": "",
            "width_cm": "",
            "length_cm": "",
            "height_cm": "",
            "firmness": "",
            "construction": "",
            "price": "",
            "medusa_presence": "present_as_other_product",
            "target_family": "",
            "target_variant": "",
            "decision": "NOT_A_MATTRESS",
            "evidence": "title mentions a mattress inside another product",
        })
    for row in price_rows:
        title = yo(row.get("title") or "")
        if "матрас" not in title.lower():
            continue
        sku = row.get("sku_normalized") or row.get("sku_raw") or ""
        if sku in seen:
            continue
        seen.add(sku)
        out.append({
            "sku": sku,
            "current_title": row.get("title") or "",
            "canonical_model": "",
            "clean_title": "",
            "width_cm": "",
            "length_cm": "",
            "height_cm": "",
            "firmness": "",
            "construction": "",
            "price": row.get("retail_solid") or "",
            "medusa_presence": "absent",
            "target_family": "",
            "target_variant": "",
            "decision": "NOT_A_MATTRESS" if not title.lower().startswith("матрас") else "ABSENT_HOLD",
            "evidence": f"retail price list sheet {row.get('sheet') or ''}",
        })
    return out


def write_outputs(result: dict[str, Any], mattresses: list[dict[str, str]], directory: str) -> None:
    from pathlib import Path
    out = Path(directory)
    out.mkdir(parents=True, exist_ok=True)
    fields = [
        "sku", "product_id", "variant_id", "current_title", "proposed_clean_title",
        "collection", "product_type", "classification", "family_key", "decision",
        "variant_axis", "mattress_width_cm", "mattress_length_cm", "current_price",
        "expected_price", "status", "media_count", "confidence", "evidence",
        "blocker", "legacy_family_key", "title_apply",
    ]
    with (out / "catalog-family-map-v2.csv").open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in result["rows"]:
            writer.writerow({key: row.get(key, "") for key in fields})
    mattress_fields = list(mattresses[0].keys()) if mattresses else ["sku", "decision"]
    with (out / "mattresses-family-map-v2.csv").open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=mattress_fields)
        writer.writeheader()
        writer.writerows(mattresses)
    sku_map = {}
    for row in result["rows"]:
        if not row["sku"]:
            continue
        if row["decision"] == "AMBIGUOUS_HOLD":
            kind = "hold"
        elif row["decision"] == "INTENTIONALLY_EXCLUDED":
            kind = "intentionally_excluded"
        elif row["decision"] in {"ALREADY_APPLIED", "SAFE_VARIANT_FAMILY"}:
            kind = "canonical_variant"
        else:
            kind = "canonical_standalone"
        sku_map[row["sku"]] = {
            "result": kind,
            "product_id": row["product_id"],
            "variant_id": row["variant_id"],
            "family_key": row["family_key"],
            "decision": row["decision"],
            "current_price": row["current_price"],
            "expected_price": row["expected_price"],
            "proposed_clean_title": row["proposed_clean_title"],
        }
    (out / "sku-to-canonical-variant-map-v2.json").write_text(
        json.dumps(sku_map, ensure_ascii=False, indent=2) + "\n"
    )
    summary = result["summary"]
    manifest = {
        "production": "NOT_MUTATED",
        "prices_changed": summary["price_mismatch"] != 0,
        "rename_only": summary["title_apply_yes"],
        "already_applied_families": sorted({
            row["family_key"] for row in result["rows"] if row["decision"] == "ALREADY_APPLIED"
        }),
        "safe_variant_merges_not_yet_applied": sorted({
            row["family_key"] for row in result["rows"] if row["decision"] == "SAFE_VARIANT_FAMILY"
        }),
        "keep_separate": summary["decisions"].get("KEEP_SEPARATE_PRODUCTS", 0),
        "holds": summary["decisions"].get("AMBIGUOUS_HOLD", 0),
        "legacy_shells": summary["decisions"].get("LEGACY_SHELL", 0),
        "sku_rows": summary["sku_rows"],
        "sku_unique": summary["sku_unique"],
        "price_mismatch": summary["price_mismatch"],
        "mattress_families": 0,
    }
    (out / "catalog-normalization-v2-mutation-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    )
