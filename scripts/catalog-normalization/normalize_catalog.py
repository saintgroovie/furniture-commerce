#!/usr/bin/env python3
"""
Catalog normalization night toolkit — scan / dry-run / apply (local Postgres).

Modes:
  scan     — full inventory + defect metrics → artifacts JSON
  dry-run  — compute title + presentation diffs without writes
  apply    — idempotent SAFE writes (titles/metadata) with snapshot
  idempotency-check — second apply must produce zero changes

Safety:
  - Requires DATABASE_URL
  - apply refuses non-local DB hosts (localhost / 127.0.0.1 / ::1)
  - never deletes SKUs / variants / prices
  - provenance written under metadata.catalog_normalization

Usage:
  DATABASE_URL=… python3 scripts/catalog-normalization/normalize_catalog.py scan
  DATABASE_URL=… python3 scripts/catalog-normalization/normalize_catalog.py dry-run
  DATABASE_URL=… python3 scripts/catalog-normalization/normalize_catalog.py apply
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import psycopg
except ImportError:  # pragma: no cover
    import psycopg2 as psycopg  # type: ignore

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / "artifacts" / "catalog-normalization"
TRANSFORM_VERSION = "catalog-normalization-public-title-v1"
CLASS_LINK = "product_productextensionmodule_product_classificat7e368fb4"

PEDESTAL = {
    "ЯП": ("ящики слева, полки справа", "VERIFIED"),
    "ПЯ": ("полки слева, ящики справа", "VERIFIED"),
    "ЯЯ": ("ящики с обеих сторон", "VERIFIED"),
    "ПП": ("полки с обеих сторон", "VERIFIED"),
}
CODE_TAIL_RE = re.compile(r"(?:^|[\s.])(ЯП|ПЯ|ЯЯ|ПП)\s*$", re.UNICODE)
LATIN_MODEL_RE = re.compile(
    r"^(.*?)\s+([A-Za-z][A-Za-z'’.-]*(?:\s+[A-Za-z][A-Za-z'’.-]*)*)$"
)
TECH_TITLE_RE = re.compile(
    r"(?i)(default\s*variant|вариант\s*\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}|OL-\d+|GR-\d+)"
)
SIZE_IN_TITLE_RE = re.compile(r"\d{2,4}\s*[xх×*]\s*\d{2,4}")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect():
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL required")
    return psycopg.connect(url)


def assert_local_db(url: str) -> None:
    u = urllib.parse.urlparse(url)
    host = (u.hostname or "").lower()
    if host not in {"localhost", "127.0.0.1", "::1"}:
        raise SystemExit(f"refusing non-local DATABASE_URL host «{host}»")


def fetch_products(conn) -> list[dict[str, Any]]:
    sql = f"""
    SELECT p.id, p.handle, p.title, p.subtitle, p.status, p.metadata,
           COALESCE(
             (SELECT json_agg(json_build_object(
                'id', v.id, 'title', v.title, 'sku', v.sku
              ))
              FROM product_variant v
              WHERE v.product_id = p.id AND v.deleted_at IS NULL),
             '[]'::json
           ) AS variants,
           COALESCE(
             (SELECT json_agg(json_build_object(
                'option_id', o.id, 'title', o.title,
                'values', (
                  SELECT COALESCE(json_agg(ov.value), '[]'::json)
                  FROM product_option_value ov
                  WHERE ov.option_id = o.id AND ov.deleted_at IS NULL
                )
              ))
              FROM product_product_option ppo
              JOIN product_option o ON o.id = ppo.product_option_id
              WHERE ppo.product_id = p.id
                AND ppo.deleted_at IS NULL
                AND o.deleted_at IS NULL),
             '[]'::json
           ) AS medusa_options,
           (
             SELECT pc.product_type
             FROM {CLASS_LINK} lnk
             JOIN product_classification pc ON pc.id = lnk.product_classification_id
             WHERE lnk.product_id = p.id AND lnk.deleted_at IS NULL
             LIMIT 1
           ) AS classification
    FROM product p
    WHERE p.deleted_at IS NULL
    ORDER BY p.handle
    """
    cur = conn.cursor()
    cur.execute(sql)
    cols = [d[0] for d in cur.description]
    rows = []
    for tup in cur.fetchall():
        row = dict(zip(cols, tup))
        meta = row.get("metadata") or {}
        if isinstance(meta, str):
            meta = json.loads(meta)
        row["metadata"] = meta if isinstance(meta, dict) else {}
        for k in ("variants", "medusa_options"):
            v = row.get(k)
            if isinstance(v, str):
                row[k] = json.loads(v)
            elif v is None:
                row[k] = []
        rows.append(row)
    return rows


def extract_latin_model(canonical: str) -> str | None:
    m = LATIN_MODEL_RE.match(canonical.strip())
    if not m:
        return None
    type_part, model = m.group(1), m.group(2)
    if not re.search(r"[А-Яа-яЁё]", type_part):
        return None
    if re.search(r"\d", model):
        return None
    return model.strip()


def expand_pedestal(title: str) -> tuple[str, str | None, bool]:
    original = title.strip()
    working = original
    for a, b in (
        ("дверцы с обеих сторон", "полки с обеих сторон"),
        ("дверца слева, ящики справа", "полки слева, ящики справа"),
        ("ящики слева, дверца справа", "ящики слева, полки справа"),
    ):
        working = working.replace(a, b)
    m = CODE_TAIL_RE.search(working)
    if not m:
        code = None
        if "полки с обеих сторон" in working:
            code = "ПП"
        elif "полки слева, ящики" in working:
            code = "ПЯ"
        elif "ящики слева, полки" in working:
            code = "ЯП"
        elif "ящики с обеих сторон" in working:
            code = "ЯЯ"
        return working, code, working != original
    code = m.group(1)
    phrase, _conf = PEDESTAL[code]
    base = CODE_TAIL_RE.sub("", working).strip().rstrip(".")
    base = re.sub(r"\s{2,}", " ", base)
    base = re.sub(r"\b2-тумб\.?", "двухтумбовый", base, flags=re.IGNORECASE)
    nxt = f"{base} ({phrase})"
    return nxt, code, nxt != original


CONFIG_TAIL = {
    "ящиками",
    "ящиком",
    "дверкой",
    "зеркалом",
    "высокий",
    "высокая",
    "высокое",
    "механизмом",
    "изножья",
    "тканью",
    "справа",
    "слева",
    "сторон",
}
TYPE_NOUNS = {
    "комод",
    "консоль",
    "кровать",
    "тумба",
    "шкаф",
    "стол",
    "стеллаж",
    "зеркало",
    "гардероб",
}
HANDLE_COLLECTION = {
    "pv": "Provence",
    "ol": "Oliver",
    "co": "Country",
    "gr": "Greenwich",
}


def title_already_has_model(title: str) -> bool:
    parts = title.split()
    if not parts:
        return False
    last = re.sub(r"[.,)]+$", "", parts[-1])
    if re.match(r"^[A-Za-z]", last):
        return True
    if re.match(r"^[А-ЯЁ][а-яё]+$", last) and last.lower() not in CONFIG_TAIL:
        if len(parts) == 1:
            return False
        if last.lower() in TYPE_NOUNS:
            return False
        return True
    return False


def collection_from_handle(handle: str) -> str | None:
    h = (handle or "").lower()
    if h.startswith("greenwich-"):
        return "Greenwich"
    prefix = h.split("-")[0] if h else ""
    return HANDLE_COLLECTION.get(prefix)


def ensure_collection(title: str, collection: str | None) -> str:
    if not collection:
        return title
    if re.search(re.escape(collection), title, re.I):
        return title
    m = re.match(r"^(.*?)(\s*\([^)]*\))\s*$", title)
    if m:
        return f"{m.group(1).strip()} {collection}{m.group(2)}"
    return f"{title} {collection}"


def resolve_public_title(row: dict[str, Any]) -> dict[str, Any]:
    meta = row.get("metadata") or {}
    stored = (meta.get("public_title") or "").strip() if isinstance(meta.get("public_title"), str) else ""
    title = (row.get("title") or "").strip()
    canonical = (meta.get("canonical_name") or "").strip() if isinstance(meta.get("canonical_name"), str) else ""
    handle = row.get("handle") or ""
    collection = None
    for key in ("collection_label", "collection"):
        v = meta.get(key)
        if isinstance(v, str) and v.strip():
            collection = v.strip()
            break
    if not collection:
        collection = collection_from_handle(handle)
    notes: list[str] = []
    if stored:
        t, code, ch = expand_pedestal(stored)
        return {
            "public_title": t,
            "source": "metadata.public_title",
            "pedestal_code": code,
            "notes": notes + (["expanded_pedestal"] if ch else []),
            "changed_vs_title": t != title,
        }
    base = title or canonical or "Товар"
    source = "title" if title else ("canonical_name" if canonical else "fallback")
    model = extract_latin_model(canonical) if canonical else None
    if model and title and model.lower() not in title.lower() and not title_already_has_model(title):
        base = re.sub(r"(?:^|[\s.])(ЯП|ПЯ|ЯЯ|ПП)\s*$", "", title).strip()
        base = f"{base} {model}".strip()
        source = "merged_title_canonical"
        notes.append(f"merged_model:{model}")
    elif model and title and title_already_has_model(title):
        notes.append("skip_merge_title_has_model")
    t, code, ch = expand_pedestal(base)
    if ch:
        notes.append(f"expanded_pedestal:{code}")
        t = ensure_collection(t, collection)
        if collection and collection.lower() in t.lower():
            notes.append(f"added_collection:{collection}")
    return {
        "public_title": t,
        "source": source,
        "pedestal_code": code,
        "notes": notes,
        "changed_vs_title": t != title,
    }


def annotate_presentations(meta: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    next_meta = dict(meta)
    axes: list[str] = []
    rows_n = 0
    preserved = 0
    pairs = [
        ("fabric_upholstery_executions", "upholstery"),
        ("upholstery_color_executions", "upholstery"),
        ("finish_color_executions", "finish"),
        ("paint_finish_executions", "finish"),
        ("frame_material_executions", "frame"),
        ("headboard_model_executions", "headboard"),
    ]
    hex_re = re.compile(r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")

    def present(row: dict[str, Any]) -> str:
        img = row.get("swatch_image") or row.get("swatch_url")
        if row.get("presentation") in {"swatch_image", "swatch_color", "text", "model", "material", "size"}:
            if row.get("presentation") == "swatch_image" and img:
                return "swatch_image"
            if row.get("presentation") == "swatch_color" and isinstance(row.get("swatch_hex"), str) and hex_re.match(row["swatch_hex"].strip()):
                return "swatch_color"
        if img:
            return "swatch_image"
        if isinstance(row.get("swatch_hex"), str) and hex_re.match(row["swatch_hex"].strip()):
            return "swatch_color"
        return "text"

    for key, semantic in pairs:
        raw = next_meta.get(key)
        if not isinstance(raw, list) or not raw:
            continue
        annotated = []
        changed = False
        for row in raw:
            if not isinstance(row, dict):
                preserved += 1
                annotated.append(row)
                continue
            nr = dict(row)
            pr = present(nr)
            expected_swatch_type = (
                "image" if pr == "swatch_image" else "color" if pr == "swatch_color" else "none"
            )
            if (
                nr.get("presentation") != pr
                or nr.get("semantic_type") != semantic
                or nr.get("swatch_type") != expected_swatch_type
            ):
                changed = True
            nr["presentation"] = pr
            nr["semantic_type"] = semantic
            nr["swatch_type"] = expected_swatch_type
            annotated.append(nr)
        if changed:
            next_meta[key] = annotated
            axes.append(key)
            rows_n += sum(1 for r in annotated if isinstance(r, dict))
    return next_meta, {
        "changed": bool(axes),
        "axes_touched": axes,
        "rows_annotated": rows_n,
        "rows_preserved_non_object": preserved,
    }


def classify_defects(row: dict[str, Any], public: dict[str, Any]) -> list[dict[str, Any]]:
    issues = []
    title = row.get("title") or ""
    meta = row.get("metadata") or {}
    if TECH_TITLE_RE.search(title):
        issues.append({"code": "TECHNICAL_TITLE", "severity": title})
    if CODE_TAIL_RE.search(title.strip()):
        issues.append({"code": "PEDESTAL_FACTORY_CODE", "severity": title})
    for opt in row.get("medusa_options") or []:
        if str(opt.get("title", "")).strip().lower() in {"default", "default variant"}:
            issues.append({"code": "MEDUSA_STUB_OPTION", "severity": opt.get("title")})
    if not meta.get("buyer_item_type"):
        issues.append({"code": "BUYER_ITEM_TYPE_MISSING", "severity": None})
    fabric = meta.get("fabric_upholstery_executions") or meta.get("upholstery_color_executions")
    if isinstance(fabric, list) and fabric:
        untyped = [
            r
            for r in fabric
            if isinstance(r, dict) and not r.get("semantic_type") and not r.get("presentation")
        ]
        if untyped:
            issues.append({"code": "UPHOLSTERY_NOT_TYPED", "severity": len(untyped)})
    if public.get("changed_vs_title"):
        issues.append(
            {
                "code": "PUBLIC_TITLE_DIFFERS",
                "severity": {"from": title, "to": public["public_title"], "source": public["source"]},
            }
        )
    return issues


def scan(conn) -> dict[str, Any]:
    products = fetch_products(conn)
    inventory = []
    issues_flat = []
    metrics = {
        "products_total": len(products),
        "published": 0,
        "public_title_differs": 0,
        "pedestal_codes": 0,
        "technical_titles": 0,
        "medusa_stub_options": 0,
        "buyer_item_type_missing": 0,
        "upholstery_not_typed": 0,
        "size_in_title": 0,
        "latin_model_merge_candidates": 0,
    }
    for row in products:
        if row.get("status") == "published":
            metrics["published"] += 1
        public = resolve_public_title(row)
        defects = classify_defects(row, public)
        for d in defects:
            issues_flat.append(
                {
                    "product_id": row["id"],
                    "handle": row["handle"],
                    **d,
                }
            )
            code = d["code"]
            if code == "PUBLIC_TITLE_DIFFERS":
                metrics["public_title_differs"] += 1
            elif code == "PEDESTAL_FACTORY_CODE":
                metrics["pedestal_codes"] += 1
            elif code == "TECHNICAL_TITLE":
                metrics["technical_titles"] += 1
            elif code == "MEDUSA_STUB_OPTION":
                metrics["medusa_stub_options"] += 1
            elif code == "BUYER_ITEM_TYPE_MISSING":
                metrics["buyer_item_type_missing"] += 1
            elif code == "UPHOLSTERY_NOT_TYPED":
                metrics["upholstery_not_typed"] += 1
        if SIZE_IN_TITLE_RE.search(row.get("title") or ""):
            metrics["size_in_title"] += 1
        if public["source"] == "merged_title_canonical":
            metrics["latin_model_merge_candidates"] += 1
        skus = [v.get("sku") for v in (row.get("variants") or []) if v.get("sku")]
        inventory.append(
            {
                "id": row["id"],
                "handle": row["handle"],
                "title": row["title"],
                "public_title": public["public_title"],
                "public_title_source": public["source"],
                "canonical_name": (row.get("metadata") or {}).get("canonical_name"),
                "classification": row.get("classification"),
                "status": row["status"],
                "skus": skus,
                "variant_count": len(row.get("variants") or []),
                "medusa_options": row.get("medusa_options") or [],
                "defect_codes": [d["code"] for d in defects],
            }
        )
    return {
        "generated_at": utc_now(),
        "transform_version": TRANSFORM_VERSION,
        "metrics": metrics,
        "issue_counts": {
            k: sum(1 for i in issues_flat if i["code"] == k)
            for k in sorted({i["code"] for i in issues_flat})
        },
        "inventory": inventory,
        "issues": issues_flat,
    }


def build_mutations(products: list[dict[str, Any]]) -> list[dict[str, Any]]:
    mutations = []
    for row in products:
        meta = dict(row.get("metadata") or {})
        public = resolve_public_title(row)
        new_meta, pres = annotate_presentations(meta)
        title_next = row["title"]
        title_changed = False
        # SAFE title writes: pedestal expansion OR door→shelf correction
        if public.get("changed_vs_title") and (
            public.get("pedestal_code")
            or "дверц" in (row.get("title") or "")
            or public["source"] in {"title", "merged_title_canonical", "metadata.public_title"}
            and "полки" in public["public_title"]
            and "дверц" in (row.get("title") or "")
        ):
            # Only rewrite title when pedestal-related
            if public.get("pedestal_code") or "дверц" in (row.get("title") or ""):
                title_next = public["public_title"]
                title_changed = title_next != row["title"]
        elif public["source"] == "merged_title_canonical" and public["changed_vs_title"]:
            # Persist as metadata.public_title (not overwrite title) to keep config+model
            # without destroying existing title until owner accepts.
            new_meta["public_title"] = public["public_title"]
            title_changed = False

        if title_changed:
            new_meta.setdefault("legacy_title", meta.get("legacy_title") or row["title"])
            new_meta["public_title"] = title_next
            new_meta["catalog_normalization"] = {
                "transform_version": TRANSFORM_VERSION,
                "original_title": meta.get("catalog_normalization", {}).get("original_title")
                if isinstance(meta.get("catalog_normalization"), dict)
                else row["title"],
                "normalized_title": title_next,
                "reason": "pedestal_desk_code_expansion_shelves",
                "confidence": "VERIFIED",
                "source": "metadata.pedestal_filling",
                "applied_at": utc_now(),
            }

        if pres["changed"] and "catalog_normalization_presentation" not in new_meta:
            new_meta["catalog_normalization_presentation"] = {
                "transform_version": "presentation-annotate-v1",
                "axes_touched": pres["axes_touched"],
                "applied_at": utc_now(),
            }

        meta_changed = new_meta != meta
        if title_changed or meta_changed:
            mutations.append(
                {
                    "id": row["id"],
                    "handle": row["handle"],
                    "title_before": row["title"],
                    "title_after": title_next if title_changed else row["title"],
                    "title_changed": title_changed,
                    "metadata_before": meta,
                    "metadata_after": new_meta,
                    "metadata_changed": meta_changed,
                    "sku_snapshot": [v.get("sku") for v in (row.get("variants") or [])],
                    "public": public,
                    "presentation": pres,
                }
            )
    return mutations


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def apply_mutations(conn, mutations: list[dict[str, Any]]) -> dict[str, Any]:
    assert_local_db(os.environ["DATABASE_URL"])
    snap = {
        "generated_at": utc_now(),
        "rows": [
            {
                "id": m["id"],
                "handle": m["handle"],
                "title": m["title_before"],
                "metadata": m["metadata_before"],
                "skus": m["sku_snapshot"],
            }
            for m in mutations
        ],
    }
    snap_path = ART / f"rollback-snapshot-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.json"
    write_json(snap_path, snap)

    cur = conn.cursor()
    applied = 0
    for m in mutations:
        cur.execute(
            """
            UPDATE product
            SET title = %s,
                metadata = %s::jsonb,
                updated_at = NOW()
            WHERE id = %s AND deleted_at IS NULL
            """,
            (
                m["title_after"],
                json.dumps(m["metadata_after"], ensure_ascii=False),
                m["id"],
            ),
        )
        applied += cur.rowcount
    conn.commit()
    return {"applied_rows": applied, "snapshot": str(snap_path), "mutation_count": len(mutations)}


def main(argv: list[str]) -> int:
    if len(argv) < 2 or argv[1] not in {"scan", "dry-run", "apply", "idempotency-check"}:
        print(__doc__)
        return 2
    mode = argv[1]
    label = argv[2] if len(argv) > 2 else mode.upper()
    ART.mkdir(parents=True, exist_ok=True)

    with connect() as conn:
        if mode == "scan":
            report = scan(conn)
            write_json(ART / f"{label}_scan.json", report)
            write_json(
                ART / f"{label}_metrics.json",
                {
                    "generated_at": report["generated_at"],
                    "metrics": report["metrics"],
                    "issue_counts": report["issue_counts"],
                },
            )
            print(json.dumps(report["metrics"], ensure_ascii=False, indent=2))
            return 0

        products = fetch_products(conn)
        mutations = build_mutations(products)
        diff = {
            "generated_at": utc_now(),
            "mode": mode,
            "mutation_count": len(mutations),
            "title_changes": sum(1 for m in mutations if m["title_changed"]),
            "metadata_only": sum(1 for m in mutations if m["metadata_changed"] and not m["title_changed"]),
            "mutations": [
                {
                    "handle": m["handle"],
                    "title_before": m["title_before"],
                    "title_after": m["title_after"],
                    "title_changed": m["title_changed"],
                    "metadata_changed": m["metadata_changed"],
                    "presentation_axes": m["presentation"].get("axes_touched"),
                    "public_source": m["public"]["source"],
                    "skus": m["sku_snapshot"],
                }
                for m in mutations
            ],
        }
        write_json(ART / f"{label}_diff.json", diff)

        if mode == "dry-run":
            print(json.dumps({k: diff[k] for k in ("mutation_count", "title_changes", "metadata_only")}, indent=2))
            return 0

        if mode == "apply":
            result = apply_mutations(conn, mutations)
            write_json(ART / f"{label}_apply.json", result)
            print(json.dumps(result, indent=2))
            return 0

        if mode == "idempotency-check":
            # Expect zero mutations after a prior apply
            print(json.dumps({"remaining_mutations": len(mutations), "ok": len(mutations) == 0}, indent=2))
            write_json(ART / f"{label}_idempotency.json", {"remaining": len(mutations), "diff": diff})
            return 0 if len(mutations) == 0 else 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
