"""Sparse catalog families.

A family is one sellable model. A variant is one existing SKU.
Finish sets may differ: they are stored on the variant, not used as a merge ban.
Missing axis combinations are counted and never created.
"""

from __future__ import annotations

import re
from collections import defaultdict
from typing import Any

from catalog_norm.decisions import (
    base_amount,
    mattress_of,
    motif_of,
    sku_of,
    yo,
)

SIZE_RE = re.compile(r"(\d{2,4})\s*[xхХX×*]\s*(\d{2,4})", re.IGNORECASE)
MODEL_RU = {
    "oliver": "Оливер",
    "provence": "Прованс",
    "greenwich": "Гринвич",
    "country-london-paris": "Кантри",
    "oxford": "Оксфорд",
}

AXIS_LABEL = {
    "mattress_size": "Размер спального места",
    "footboard": "Исполнение",
    "lift": "Подъёмный механизм",
    "fabric": "Ткань",
    "side": "Ориентация",
    "filling": "Тумба",
    "layout": "Ориентация",
    "size": "Размер",
    "tiers": "Ярусы",
    "doors": "Двери",
    "drawers": "Ящики",
    "door": "Исполнение",
    "shelves": "Исполнение",
    "form": "Исполнение",
    "tier": "Исполнение",
}


def _model_name(collection: str) -> str:
    return MODEL_RU.get(collection, "")


def _size_from_title(title: str) -> dict[str, Any] | None:
    match = SIZE_RE.search(yo(title))
    if not match:
        return None
    width, length = int(match.group(1)), int(match.group(2))
    if width > 400 or length > 400:
        return None
    return {
        "width": width,
        "length": length,
        "display": f"{width} × {length} см",
        "key": f"{width}x{length}",
    }


def _axis(key: str, value: str, sort: int) -> dict[str, Any]:
    return {"key": key, "value": value, "display": value, "sort": sort, "label": AXIS_LABEL[key]}


def _ru_count(count: int, one: str, few: str, many: str) -> str:
    tail = count % 10
    hundred = count % 100
    if tail == 1 and hundred != 11:
        word = one
    elif tail in {2, 3, 4} and hundred not in {12, 13, 14}:
        word = few
    else:
        word = many
    return f"{count} {word}"


def _pedestal(product: dict[str, Any], title: str) -> dict[str, dict[str, Any]]:
    raw = (product.get("metadata") or {}).get("pedestal_filling") or {}
    code = ""
    if isinstance(raw, dict):
        code = str(raw.get("legacy_code") or "")
    if not code:
        match = re.search(r"(0П|П0|0Я|Я0)$", yo(title))
        code = match.group(1) if match else ""
    filling = {"0П": "Полки", "П0": "Полки", "0Я": "Ящики", "Я0": "Ящики"}.get(code)
    side = {"0П": "Справа", "0Я": "Справа", "П0": "Слева", "Я0": "Слева"}.get(code)
    axes: dict[str, dict[str, Any]] = {}
    if filling:
        axes["filling"] = _axis("filling", filling, 0 if filling == "Полки" else 1)
    if side:
        axes["side"] = _axis("side", side, 0 if side == "Слева" else 1)
    return axes


def identify(product: dict[str, Any]) -> dict[str, Any] | None:
    """Return a model identity, or None when this row is not a merge candidate."""
    title = product.get("title") or ""
    low = yo(title).lower()
    collection = product.get("collection_handle") or ""
    classification = product.get("classification") or ""
    model = _model_name(collection)
    motif = motif_of(product) if collection == "willie-winkie" else ""
    if collection == "willie-winkie" and not motif:
        # A painting motif_of does not know (Albion, Brigantine, character themes)
        # would share the empty motif key with every other one.
        return None
    axes: dict[str, dict[str, Any]] = {}
    noun = ""
    clean = ""

    if collection == "willie-winkie" and "комод" in low and motif:
        noun = "willie-chest"
        form = "Высокий" if "высокий" in low else "Стандартный"
        axes["form"] = _axis("form", form, 1 if form == "Высокий" else 0)
        clean = f"Комод {motif}"
    elif "диван-кровать" in low:
        noun = "sofa-bed"
        clean = f"Диван-кровать {model}".strip()
    elif low.startswith("диван"):
        noun = "sofa"
        clean = f"Диван {model}".strip()
        if "малый" in low or "малая" in low:
            axes["size"] = _axis("size", "Малый", 1)
        elif "большой" in low or "большая" in low:
            axes["size"] = _axis("size", "Большой", 2)
    elif "новорожден" in low:
        noun = "crib-newborn"
        clean = f"Кроватка для новорожденного {model}".strip()
    elif "приставн" in low:
        noun = "side-crib"
        clean = f"Кроватка приставная {model}".strip()
    elif "трансформер" in low:
        noun = "transformer"
        clean = f"Кровать-трансформер {model}".strip()
        if "с рисунком" in low:
            axes["fabric"] = _axis("fabric", "С рисунком", 0)
        elif "с тканью" in low:
            axes["fabric"] = _axis("fabric", "С тканью", 1)
    elif low.startswith("комплекс"):
        return None
    elif low.startswith("нижняя кровать"):
        noun = "lower-bed"
        clean = f"Нижняя кровать {model}".strip()
    elif low.startswith("кровать") or low.startswith("кроватка"):
        noun = "bed"
        clean = f"Кровать {model}".strip()
        if "без изнож" in low:
            axes["footboard"] = _axis("footboard", "Без изножья", 1)
        else:
            axes["footboard"] = _axis("footboard", "С изножьем", 0)
        if "подъем" in low:
            axes["lift"] = _axis("lift", "С подъёмным механизмом", 1)
        else:
            axes["lift"] = _axis("lift", "Без подъёмного механизма", 0)
        if "с тканью" in low:
            axes["fabric"] = _axis("fabric", "С тканью", 1)
        else:
            axes["fabric"] = _axis("fabric", "Без ткани", 0)
    elif "кабинетн" in low and "стол" in low:
        noun = "desk-cabinet"
        clean = f"Стол кабинетный {model}".strip()
    elif "двухтумб" in low:
        noun = "desk-two"
        clean = f"Стол письменный двухтумбовый {model}".strip()
        match = re.search(r"\(([^)]+)\)", title)
        if match:
            axes["layout"] = _axis("layout", match.group(1).strip(), 0)
    elif "1-тумб" in low or re.search(r"(0П|П0|0Я|Я0)$", yo(title)):
        noun = "desk-one"
        clean = f"Стол письменный {model}".strip()
        axes.update(_pedestal(product, title))
        if "малый" in low or "малая" in low:
            axes["size"] = _axis("size", "Малый", 1)
        elif "большой" in low or "большая" in low:
            axes["size"] = _axis("size", "Большой", 2)
    elif "банкетка" in low:
        noun = "banquette"
        clean = f"Банкетка {model}".strip()
        if "малая" in low:
            axes["size"] = _axis("size", "Малая", 1)
        elif "большая" in low:
            axes["size"] = _axis("size", "Большая", 2)
    elif "бортик" in low:
        noun = "rail"
        clean = "Бортик к кровати"
        if "малый" in low:
            axes["size"] = _axis("size", "Малый", 1)
        elif "большой" in low:
            axes["size"] = _axis("size", "Большой", 2)
    elif "полка книжная" in low and "углов" in low:
        noun = "corner-shelf"
        clean = f"Полка книжная угловая {model}".strip()
    elif "полка книжная" in low:
        noun = "book-shelf"
        clean = f"Полка книжная {model}".strip()
        match = re.search(r"(\d)\s*-ярус", low)
        if match:
            count = int(match.group(1))
            axes["tiers"] = _axis("tiers", _ru_count(count, "ярус", "яруса", "ярусов"), count)
    elif "этажерка" in low:
        noun = "etagere"
        clean = f"Этажерка {model}".strip()
        if "малая" in low:
            axes["size"] = _axis("size", "Малая", 1)
        elif "большая" in low:
            axes["size"] = _axis("size", "Большая", 2)
    elif "зеркало" in low:
        noun = "mirror-" + ("floor" if "напольн" in low else "wall" if "навес" in low or "овальн" in low else title)
        clean = title
    elif "тумбочка прикроватная" in low:
        noun = "nightstand"
        clean = f"Тумбочка прикроватная {model}".strip()
        axes["door"] = _axis("door", "С дверкой" if "дверк" in low else "Без дверки", 1 if "дверк" in low else 0)
    elif "прикроватная тумба" in low:
        noun = "bedside"
        clean = f"Прикроватная тумба {model}".strip()
        match = re.search(r"(\d)\s+ящик", low)
        if match:
            count = int(match.group(1))
            axes["drawers"] = _axis("drawers", _ru_count(count, "ящик", "ящика", "ящиков"), count)
    elif low.startswith("гардероб"):
        noun = "wardrobe"
        clean = f"Гардероб {model}".strip()
        axes["drawers"] = _axis(
            "drawers",
            "С ящиками" if "с ящиками" in low else "Без ящиков",
            1 if "с ящиками" in low else 0,
        )
    elif "шкаф для одежды" in low and "зеркал" not in low and "углов" not in low:
        noun = "clothes-wardrobe"
        clean = f"Шкаф для одежды {model}".strip()
        match = re.search(r"(\d)\s*-дв", low)
        if match:
            count = int(match.group(1))
            axes["doors"] = _axis("doors", _ru_count(count, "дверь", "двери", "дверей"), count)
    elif low.startswith("консоль"):
        noun = "console"
        clean = f"Консоль {model}".strip()
        axes["shelves"] = _axis("shelves", "С полками" if "с полками" in low else "Без полок", 1 if "с полками" in low else 0)
    elif "комод высокий" in low and collection != "willie-winkie":
        noun = "chest-tall"
        clean = f"Комод высокий {model}".strip()
        axes["tier"] = _axis("tier", "Ниже на 1 ярус" if "ниже" in low else "Полный", 1 if "ниже" in low else 0)
    elif low.startswith("комод стандартный") or low.startswith("комод широкий"):
        noun = "chest"
        clean = f"Комод {model}".strip()
        axes["size"] = _axis("size", "Широкий" if "широкий" in low else "Стандартный", 2 if "широкий" in low else 1)
    elif low.startswith("стеллаж широкий") or low.startswith("стеллаж узкий"):
        noun = "shelving"
        clean = f"Стеллаж {model}".strip()
        if "широкий" in low:
            axes["form"] = _axis("form", "Широкий", 0)
        elif "двер" in low:
            axes["form"] = _axis("form", "Узкий с дверью", 1)
        elif "ящик" in low:
            axes["form"] = _axis("form", "Узкий с ящиком", 2)
    elif "столик туалетный" in low or ("шкаф для одежды" in low and "зеркал" in low):
        return None
    else:
        return None

    size = None
    variant = next((v for v in product.get("variants") or [] if not v.get("deleted_at")), None)
    if variant:
        size = mattress_of(variant)
    if size is None and noun in {"bed", "transformer", "lower-bed", "crib-newborn", "sofa-bed"}:
        size = _size_from_title(title)
    if size and noun in {"bed", "transformer", "lower-bed", "crib-newborn", "sofa-bed"}:
        axes["mattress_size"] = {
            "key": "mattress_size",
            "value": size["key"],
            "display": size["display"],
            "sort": size["width"] * 1000 + size["length"],
            "label": AXIS_LABEL["mattress_size"],
            "width": size["width"],
            "length": size["length"],
        }
    return {
        "noun": noun,
        "family_key": f"{collection}/{classification}/{noun}/{motif or '-'}",
        "clean": re.sub(r"\s+", " ", clean).strip(),
        "axes": axes,
        "motif": motif,
        "evidence": f"model noun {noun}; classification {classification or 'unknown'}",
    }


def _axes_from_variant_metadata(variant: dict[str, Any]) -> dict[str, dict[str, Any]] | None:
    raw = (variant.get("metadata") or {}).get("variant_axes") or {}
    if not isinstance(raw, dict) or not raw:
        return None
    mattress = (variant.get("metadata") or {}).get("mattress_size") or {}
    axes: dict[str, dict[str, Any]] = {}
    for key, value in raw.items():
        if not isinstance(value, dict) or not value.get("display"):
            continue
        item: dict[str, Any] = {"display": value["display"], "value": value["display"]}
        if key == "mattress_size" and isinstance(mattress, dict):
            item["width"] = mattress.get("width_cm") or ""
            item["length"] = mattress.get("length_cm") or ""
        axes[key] = item
    return axes or None


def _signature(axes: dict[str, dict[str, Any]]) -> tuple:
    return tuple(sorted((key, item["value"]) for key, item in axes.items()))


def _varying(members: list[dict[str, Any]]) -> list[str]:
    keys = set()
    for member in members:
        keys.update(member["identity"]["axes"])
    varying = []
    for key in sorted(keys):
        values = {member["identity"]["axes"].get(key, {}).get("value") for member in members}
        values.discard(None)
        if len(values) > 1:
            varying.append(key)
    return varying


def _clean_with_constants(members: list[dict[str, Any]]) -> str:
    base = members[0]["identity"]["clean"]
    keys = set()
    for member in members:
        keys.update(member["identity"]["axes"])
    extras = []
    for key in ("footboard", "lift"):
        if key not in keys:
            continue
        values = {member["identity"]["axes"].get(key, {}).get("display") for member in members}
        values.discard(None)
        if len(values) == 1:
            display = next(iter(values))
            if display in {"Без изножья", "С подъёмным механизмом"}:
                extras.append(display[:1].lower() + display[1:])
    if not extras:
        return base
    return f"{base} {' '.join(extras)}".replace("  ", " ")


def classify_products(products: list[dict[str, Any]]) -> dict[str, Any]:
    from catalog_norm.decisions import _summary

    live = [p for p in products if not p.get("deleted_at")]
    deleted = [p for p in products if p.get("deleted_at")]
    rows: list[dict[str, Any]] = []
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    rejected = 0

    for product in live:
        variants = [v for v in product.get("variants") or [] if not v.get("deleted_at")]
        if product.get("status") == "draft" and not variants:
            rows.append(_row(product, {}, _member(
                product,
                family=f"legacy-shell/{product.get('id')}",
                decision="LEGACY_SHELL",
                clean=product.get("title") or "",
                axes={},
                evidence="draft shell without a SKU",
                blocker="draft shell kept, not deleted",
            )))
            continue
        if len(variants) >= 2:
            axis_maps = []
            for variant in variants:
                raw = (variant.get("metadata") or {}).get("variant_axes") or {}
                if not isinstance(raw, dict) or not raw:
                    axis_maps = []
                    break
                axis_maps.append({
                    key: value.get("display")
                    for key, value in raw.items()
                    if isinstance(value, dict) and value.get("display")
                })
            if len(axis_maps) == len(variants) and axis_maps:
                keys = set(axis_maps[0])
                if all(set(item) == keys for item in axis_maps):
                    cardinal = 1
                    for key in keys:
                        cardinal *= len({item[key] for item in axis_maps})
                    rejected += max(0, cardinal - len(variants))
            identity = identify(product) or {
                "family_key": f"already/{product.get('id')}",
                "clean": product.get("title") or "",
                "axes": {},
                "evidence": "product already has several variants",
            }
            member = _member(
                product,
                family=identity["family_key"],
                decision="ALREADY_APPLIED",
                clean=product.get("title") or identity["clean"],
                axes=identity.get("axes") or {},
                evidence=identity["evidence"],
                blocker="",
            )
            for variant in variants:
                per_variant = _axes_from_variant_metadata(variant)
                row_member = member
                if per_variant:
                    row_member = dict(member)
                    row_member["axes"] = per_variant
                rows.append(_row(product, variant, row_member))
            continue
        identity = identify(product)
        if identity and product.get("status") != "published":
            rows.append(_row(product, variants[0] if variants else {}, _member(
                product,
                family=f"standalone/{sku_of(product) or product.get('handle')}",
                decision="KEEP_SEPARATE_PRODUCTS",
                clean=product.get("title") or "",
                axes={},
                evidence="unpublished product is not merged into a family",
                blocker="",
            )))
            continue
        if not identity:
            member = _member(
                product,
                family=f"standalone/{sku_of(product) or product.get('handle')}",
                decision="KEEP_SEPARATE_PRODUCTS",
                clean=product.get("title") or "",
                axes={},
                evidence="no proven sibling model; title is already the model",
                blocker="",
            )
            rows.append(_row(product, variants[0] if variants else {}, member))
            continue
        groups[identity["family_key"]].append({"product": product, "variants": variants, "identity": identity})

    for family, members in groups.items():
        signatures = [_signature(member["identity"]["axes"]) for member in members]
        unique = len(signatures) == len(set(signatures))
        if len(members) == 1:
            decision = "KEEP_SEPARATE_PRODUCTS"
            blocker = ""
            if members[0]["identity"]["noun"] == "side-crib":
                blocker = "MATTRESS_SIZE_UNKNOWN"
            evidence = members[0]["identity"]["evidence"] + "; single product of this model"
            clean = members[0]["identity"]["clean"]
            varying: list[str] = []
        elif not unique:
            decision = "AMBIGUOUS_HOLD"
            blocker = "two SKUs would share one variant combination"
            evidence = "axis values are not unique"
            clean = members[0]["identity"]["clean"]
            varying = []
        else:
            decision = "SAFE_VARIANT_FAMILY"
            blocker = ""
            varying = _varying(members)
            evidence = (
                "same model; axes "
                + (", ".join(varying) if varying else "none")
                + "; finish sets are variant capabilities, not a merge ban"
            )
            clean = _clean_with_constants(members)
            cardinal = 1
            for key in varying:
                cardinal *= len({member["identity"]["axes"][key]["value"] for member in members if key in member["identity"]["axes"]})
            rejected += max(0, cardinal - len(members))
        for member in members:
            built = _member(
                product=member["product"],
                family=family,
                decision=decision,
                clean=clean,
                axes={key: member["identity"]["axes"][key] for key in varying if key in member["identity"]["axes"]},
                evidence=evidence,
                blocker=blocker,
            )
            variant = member["variants"][0] if member["variants"] else {}
            row = _row(member["product"], variant, built)
            if decision == "SAFE_VARIANT_FAMILY":
                row["title_apply"] = "with-merge"
            size = built["axes"].get("mattress_size") or member["identity"]["axes"].get("mattress_size")
            if size:
                row["mattress_width_cm"] = size.get("width", "")
                row["mattress_length_cm"] = size.get("length", "")
            rows.append(row)

    for product in deleted:
        rows.append(_row(product, {}, _member(
            product,
            family=f"deleted/{sku_of(product) or product.get('handle')}",
            decision="INTENTIONALLY_EXCLUDED",
            clean=product.get("title") or "",
            axes={},
            evidence="deleted_at set",
            blocker="",
        )))

    summary = _summary(rows)
    summary["rejected_combinations"] = rejected
    summary["safe_families"] = len({row["family_key"] for row in rows if row["decision"] == "SAFE_VARIANT_FAMILY"})
    return {"rows": rows, "summary": summary}


def _member(
    product: dict[str, Any],
    family: str,
    decision: str,
    clean: str,
    axes: dict[str, dict[str, Any]],
    evidence: str,
    blocker: str,
) -> dict[str, Any]:
    return {
        "product": product,
        "family_key": family,
        "decision": decision,
        "clean": clean,
        "axes": axes,
        "evidence": evidence,
        "blocker": blocker,
        "confidence": "low" if decision == "AMBIGUOUS_HOLD" else "high",
    }


def _row(product: dict[str, Any], variant: dict[str, Any], member: dict[str, Any]) -> dict[str, Any]:
    price = base_amount(variant) if variant else ""
    size = member["axes"].get("mattress_size")
    axis_names = ",".join(sorted(member["axes"]))
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
        "variant_axis": axis_names,
        "mattress_width_cm": "" if not size else size.get("width", ""),
        "mattress_length_cm": "" if not size else size.get("length", ""),
        "current_price": price,
        "expected_price": price,
        "status": product.get("status") or "",
        "media_count": len(product.get("images") or []),
        "confidence": member["confidence"],
        "evidence": member["evidence"],
        "blocker": member["blocker"],
        "legacy_family_key": (product.get("metadata") or {}).get("family_key") or "",
        "title_apply": "no",
        "axis_values": {key: item["display"] for key, item in member["axes"].items()},
    }


def _plan(family: str, items: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "family_key": family,
        "title": items[0]["proposed_clean_title"],
        "classification": items[0]["classification"],
        "skus": [item["sku"] for item in items],
        "prices": {item["sku"]: item["expected_price"] for item in items},
        "axes": {item["sku"]: item.get("axis_values") or {} for item in items},
    }


def family_plans(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Plans for families still split across products, plus already-merged products.

    An already-merged product is its own plan. It is never grouped with another
    product, so a second run only checks the title and does not rewrite variants.
    """
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    applied: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        if not row.get("sku"):
            continue
        if row.get("decision") == "SAFE_VARIANT_FAMILY":
            grouped[row["family_key"]].append(row)
        elif row.get("decision") == "ALREADY_APPLIED":
            applied[row["product_id"]].append(row)
    plans = []
    for family, items in sorted(grouped.items()):
        product_ids = {item["product_id"] for item in items}
        skus = [item["sku"] for item in items]
        keysets = [set(item.get("axis_values") or {}) for item in items]
        if (
            len(product_ids) < 2
            or len(skus) != len(set(skus))
            or not keysets[0]
            or any(keys != keysets[0] for keys in keysets)
        ):
            continue
        plans.append(_plan(family, items))
    for product_id, items in sorted(applied.items()):
        skus = [item["sku"] for item in items]
        if len(skus) != len(set(skus)) or len({item["product_id"] for item in items}) != 1:
            continue
        plans.append(_plan(items[0]["family_key"], items))
    return plans
