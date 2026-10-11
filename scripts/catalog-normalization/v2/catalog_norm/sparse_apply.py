"""Apply sparse family merges to the local Medusa database only.

Existing SKUs move onto one product. No new SKU and no missing combination
is inserted. Prices are read and compared, never written. Shells are drafted.
"""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any

import psycopg2
import psycopg2.extras

from catalog_norm.beds_apply import _amount, assert_identity
from catalog_norm.decisions import FINISH_KEYS
from catalog_norm.export_inventory import connect, export_products
from catalog_norm.sparse import AXIS_LABEL, classify_products, family_plans

SPARSE_PASS = "catalog-normalization-v2-sparse-20261011"
CAPABILITY_KEYS = FINISH_KEYS + (
    "material_tiers",
    "pedestal_filling",
    "finish_color_labels",
    "paint_finish_labels",
    "fabric_upholstery_labels",
)


def _mattress_bag(source: dict[str, Any], display: str) -> dict[str, Any] | None:
    raw = source.get("mattress_size")
    if isinstance(raw, dict) and raw.get("display") == display:
        return dict(raw)
    match = re.search(r"(\d+)\s*×\s*(\d+)", display or "")
    if not match:
        return dict(raw) if isinstance(raw, dict) else None
    width, length = int(match.group(1)), int(match.group(2))
    return {
        "key": f"{width}x{length}",
        "width_cm": width,
        "length_cm": length,
        "display": f"{width} × {length} см",
        "unit": "cm",
        "source": "title",
        "confidence": "high",
    }


def align_buyer_public_title(
    metadata: dict[str, Any] | None, clean_title: str
) -> dict[str, Any] | None:
    """Stored public_title wins over product.title in the storefront.

    After a sparse merge the product title is the model name. A leftover
    public_title can still name a variant axis (drawers, side, filling).
    A leftover canonical_name is the muted line under the H1 and is removed
    when it is not the clean title. Missing public_title stays missing so
    the storefront keeps using product.title.
    """
    if not isinstance(metadata, dict):
        return None
    patched = dict(metadata)
    changed = False
    public = patched.get("public_title")
    if isinstance(public, str) and public.strip() and public.strip() != clean_title:
        patched["public_title"] = clean_title
        changed = True
    # Visible under the H1. A survivor's old size/axis name must not stay
    # after the family title is the model name.
    canonical = patched.get("canonical_name")
    if isinstance(canonical, str) and canonical.strip() and canonical.strip() != clean_title:
        patched.pop("canonical_name", None)
        changed = True
    if not changed:
        return None
    return patched


def _id(kind: str, family: str, extra: str = "") -> str:
    digest = hashlib.sha1(f"{SPARSE_PASS}|{kind}|{family}|{extra}".encode()).hexdigest()[:18].upper()
    return f"{kind}_01CN2{digest}"


def _plans_from_live(cur) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    # Reuse the read-only exporter's row shape through a second connection.
    probe = connect()
    try:
        inventory = export_products(probe)
    finally:
        probe.close()
    identity = inventory.get("identity") or {}
    if identity.get("db") != "medusa-store":
        raise SystemExit(f"refusing database {identity.get('db')}")
    result = classify_products(inventory["products"])
    if not result["summary"]["sku_unique"] or result["summary"]["price_mismatch"]:
        raise SystemExit("refusing apply: sku or price map is not intact")
    return inventory, family_plans(result["rows"])


def _load(cur, skus: list[str]) -> list[dict[str, Any]]:
    cur.execute(
        """
        SELECT p.id AS product_id, p.title, p.status, p.handle, p.metadata,
               v.id AS variant_id, v.sku, v.metadata AS variant_metadata,
               pc.product_type AS classification
        FROM product p
        JOIN product_variant v ON v.product_id = p.id AND v.deleted_at IS NULL
        LEFT JOIN product_productextensionmodule_product_classificat7e368fb4 link
          ON link.product_id = p.id AND link.deleted_at IS NULL
        LEFT JOIN product_classification pc ON pc.id = link.product_classification_id
        WHERE v.sku = ANY(%s) AND p.deleted_at IS NULL
        ORDER BY v.sku
        """,
        (skus,),
    )
    rows = [dict(row) for row in cur.fetchall()]
    if len(rows) != len(skus) or {row["sku"] for row in rows} != set(skus):
        raise SystemExit("sku set drifted before apply")
    ids = [row["product_id"] for row in rows]
    cur.execute(
        "SELECT product_id, url FROM image WHERE product_id = ANY(%s) AND deleted_at IS NULL ORDER BY rank NULLS LAST, id",
        (ids,),
    )
    images: dict[str, list[str]] = {pid: [] for pid in ids}
    for image in cur.fetchall():
        images[image["product_id"]].append(image["url"])
    cur.execute(
        """
        SELECT v.sku, pr.amount, pr.currency_code
        FROM product_variant v
        JOIN product_variant_price_set vps ON vps.variant_id = v.id AND vps.deleted_at IS NULL
        JOIN price pr ON pr.price_set_id = vps.price_set_id AND pr.deleted_at IS NULL
          AND pr.price_list_id IS NULL
        WHERE v.sku = ANY(%s) AND v.deleted_at IS NULL
        """,
        (skus,),
    )
    prices: dict[str, str] = {}
    for price in cur.fetchall():
        if price["currency_code"] != "rub":
            raise SystemExit(f"currency {price['sku']}")
        amount = _amount(price["amount"])
        if price["sku"] in prices:
            raise SystemExit(f"more than one base price for {price['sku']}")
        prices[price["sku"]] = amount
    for row in rows:
        row["images"] = images.get(row["product_id"], [])
        row["base_amount"] = prices.get(row["sku"], "")
    return rows


def _apply_family(cur, plan: dict[str, Any]) -> dict[str, Any]:
    rows = _load(cur, plan["skus"])
    for row in rows:
        expected = _amount(plan["prices"][row["sku"]])
        if row["base_amount"] != expected:
            raise SystemExit(f"price drift {row['sku']}: db {row['base_amount']} plan {expected}")
    classes = {row["classification"] or "" for row in rows}
    if len(classes) != 1:
        raise SystemExit(f"classification drift {plan['family_key']}: {classes}")
    by_sku = {row["sku"]: row for row in rows}
    survivor = by_sku[min(plan["skus"])]
    product_ids = {row["product_id"] for row in rows}
    if len(product_ids) == 1 and survivor["title"] == plan["title"]:
        patched = align_buyer_public_title(survivor["metadata"], plan["title"])
        if patched is None:
            return {
                "family_key": plan["family_key"],
                "status": "already_applied",
                "skus": plan["skus"],
                "public_title_aligned": False,
            }
        cur.execute(
            """
            UPDATE product
            SET metadata = %s, updated_at = NOW()
            WHERE id = %s AND deleted_at IS NULL AND title = %s
            """,
            (psycopg2.extras.Json(patched), survivor["product_id"], plan["title"]),
        )
        if cur.rowcount != 1:
            raise SystemExit(f"public title align failed {plan['family_key']}")
        return {
            "family_key": plan["family_key"],
            "status": "already_applied",
            "skus": plan["skus"],
            "public_title_aligned": True,
        }

    cur.execute(
        """
        SELECT po.id, po.title, ppo.product_id
        FROM product_product_option ppo
        JOIN product_option po ON po.id = ppo.product_option_id AND po.deleted_at IS NULL
        WHERE ppo.product_id = ANY(%s) AND ppo.deleted_at IS NULL
        """,
        (list(product_ids),),
    )
    linked = list(cur.fetchall())
    if any((row["title"] or "").strip().lower() != "default" for row in linked):
        return {
            "family_key": plan["family_key"],
            "status": "skipped",
            "reason": "product already has a non-default option",
            "skus": plan["skus"],
        }
    survivor_defaults = [row for row in linked if row["product_id"] == survivor["product_id"]]
    if len(survivor_defaults) != 1:
        return {
            "family_key": plan["family_key"],
            "status": "skipped",
            "reason": f"default option count {len(survivor_defaults)}",
            "skus": plan["skus"],
        }
    default_option_id = survivor_defaults[0]["id"]
    cur.execute(
        "SELECT count(*) AS n FROM product_product_option WHERE product_option_id = %s AND deleted_at IS NULL",
        (default_option_id,),
    )
    if cur.fetchone()["n"] != 1:
        return {
            "family_key": plan["family_key"],
            "status": "skipped",
            "reason": "default option is shared",
            "skus": plan["skus"],
        }

    axis_names = sorted({key for values in plan["axes"].values() for key in values})
    option_ids = {name: _id("opt", plan["family_key"], name) for name in axis_names}
    for name in axis_names:
        cur.execute(
            """
            INSERT INTO product_option (id, title, metadata, created_at, updated_at, is_exclusive)
            VALUES (%s, %s, %s, NOW(), NOW(), TRUE)
            ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, deleted_at = NULL, updated_at = NOW()
            """,
            (option_ids[name], AXIS_LABEL[name], psycopg2.extras.Json({"pass": SPARSE_PASS, "axis": name})),
        )
        cur.execute(
            """
            INSERT INTO product_product_option (id, product_id, product_option_id, created_at, updated_at)
            VALUES (%s, %s, %s, NOW(), NOW())
            ON CONFLICT (id) DO UPDATE SET deleted_at = NULL, product_id = EXCLUDED.product_id, updated_at = NOW()
            """,
            (_id("prodopt", plan["family_key"], name), survivor["product_id"], option_ids[name]),
        )

    value_ids: dict[tuple[str, str], str] = {}
    axis_sort: dict[tuple[str, str], int] = {}
    for name in axis_names:
        displays = []
        for sku in plan["skus"]:
            display = plan["axes"][sku].get(name)
            if display and display not in displays:
                displays.append(display)

        def sort_key(display: str, axis: str = name) -> tuple:
            match = re.search(r"(\d+)\s*×\s*(\d+)", display) if axis == "mattress_size" else None
            if match:
                return (0, int(match.group(1)) * 1000 + int(match.group(2)), display)
            return (1, 0, display)

        displays.sort(key=sort_key)
        for rank, display in enumerate(displays):
            axis_sort[(name, display)] = rank
            value_id = _id("optval", plan["family_key"], f"{name}|{display}")
            value_ids[(name, display)] = value_id
            cur.execute(
                """
                INSERT INTO product_option_value (id, value, option_id, metadata, created_at, updated_at, rank)
                VALUES (%s, %s, %s, %s, NOW(), NOW(), %s)
                ON CONFLICT (id) DO UPDATE
                  SET value = EXCLUDED.value, deleted_at = NULL, updated_at = NOW(), rank = EXCLUDED.rank
                """,
                (value_id, display, option_ids[name], psycopg2.extras.Json({"axis": name}), rank),
            )
            cur.execute(
                """
                INSERT INTO product_product_option_value
                  (id, product_product_option_id, product_option_value_id, created_at, updated_at)
                VALUES (%s, %s, %s, NOW(), NOW())
                ON CONFLICT (id) DO UPDATE SET deleted_at = NULL, updated_at = NOW()
                """,
                (
                    _id("prodoptval", plan["family_key"], f"{name}|{display}"),
                    _id("prodopt", plan["family_key"], name),
                    value_id,
                ),
            )

    for rank, sku in enumerate(sorted(plan["skus"], key=lambda item: json.dumps(plan["axes"][item], ensure_ascii=False))):
        row = by_sku[sku]
        metadata = dict(row["variant_metadata"] or {})
        metadata["variant_axes"] = {
            name: {
                "label": AXIS_LABEL[name],
                "display": plan["axes"][sku][name],
                "sort": axis_sort[(name, plan["axes"][sku][name])],
            }
            for name in axis_names
            if plan["axes"][sku].get(name)
        }
        source_meta = row["metadata"] or {}
        size_display = plan["axes"][sku].get("mattress_size")
        if size_display:
            bag = _mattress_bag(source_meta, size_display)
            if bag:
                metadata["mattress_size"] = bag
        metadata["capabilities"] = {
            key: source_meta.get(key) for key in CAPABILITY_KEYS if key in source_meta
        }
        metadata["gallery_urls"] = list(row["images"])
        if isinstance(source_meta.get("dimensions"), dict):
            metadata["dimensions"] = source_meta["dimensions"]
        elif isinstance(source_meta.get("dimensions_normalized"), dict):
            metadata["dimensions"] = source_meta["dimensions_normalized"]
        note = dict(metadata.get("catalog_norm_v2") or {})
        note.update({"pass": SPARSE_PASS, "family_key": plan["family_key"], "merge_applied": True})
        metadata["catalog_norm_v2"] = note
        cur.execute(
            """
            UPDATE product_variant
            SET product_id = %s, title = %s, variant_rank = %s, metadata = %s, updated_at = NOW()
            WHERE id = %s AND sku = %s AND deleted_at IS NULL
            """,
            (
                survivor["product_id"],
                " · ".join(plan["axes"][sku][name] for name in axis_names if plan["axes"][sku].get(name)),
                rank,
                psycopg2.extras.Json(metadata),
                row["variant_id"],
                sku,
            ),
        )
        if cur.rowcount != 1:
            raise SystemExit(f"variant move failed {sku}")
        cur.execute("DELETE FROM product_variant_option WHERE variant_id = %s", (row["variant_id"],))
        for name in axis_names:
            display = plan["axes"][sku].get(name)
            if not display:
                continue
            cur.execute(
                "INSERT INTO product_variant_option (variant_id, option_value_id) VALUES (%s, %s)",
                (row["variant_id"], value_ids[(name, display)]),
            )

    cur.execute(
        "UPDATE product_option SET deleted_at = NOW(), updated_at = NOW() WHERE id = %s AND deleted_at IS NULL",
        (default_option_id,),
    )
    cur.execute(
        "UPDATE product_option_value SET deleted_at = NOW(), updated_at = NOW() WHERE option_id = %s AND deleted_at IS NULL",
        (default_option_id,),
    )
    cur.execute(
        """
        UPDATE product_product_option
        SET deleted_at = NOW(), updated_at = NOW()
        WHERE product_id = %s AND product_option_id = %s AND deleted_at IS NULL
        """,
        (survivor["product_id"], default_option_id),
    )

    survivor_meta = align_buyer_public_title(survivor["metadata"], plan["title"]) or dict(
        survivor["metadata"] or {}
    )
    survivor_meta["catalog_norm_v2"] = {
        "pass": SPARSE_PASS,
        "family_key": plan["family_key"],
        "canonical_title": plan["title"],
        "merge_applied": True,
        "variant_skus": sorted(plan["skus"]),
    }
    cur.execute(
        """
        UPDATE product
        SET title = %s, metadata = %s, status = 'published', updated_at = NOW()
        WHERE id = %s AND deleted_at IS NULL
        """,
        (plan["title"], psycopg2.extras.Json(survivor_meta), survivor["product_id"]),
    )
    if cur.rowcount != 1:
        raise SystemExit(f"survivor update failed {plan['family_key']}")

    for row in rows:
        if row["product_id"] == survivor["product_id"]:
            continue
        shell = dict(row["metadata"] or {})
        note = dict(shell.get("catalog_norm_v2") or {})
        note.update({
            "pass": SPARSE_PASS,
            "archived_shell": True,
            "survivor_product_id": survivor["product_id"],
            "family_key": plan["family_key"],
        })
        shell["catalog_norm_v2"] = note
        cur.execute(
            """
            UPDATE product
            SET status = 'draft', metadata = %s, updated_at = NOW()
            WHERE id = %s AND deleted_at IS NULL
            """,
            (psycopg2.extras.Json(shell), row["product_id"]),
        )
        if cur.rowcount != 1:
            raise SystemExit(f"shell draft failed {row['sku']}")

    variant_ids = [row["variant_id"] for row in rows]
    cur.execute(
        """
        UPDATE cart_line_item
        SET product_id = %s, product_title = %s, updated_at = NOW()
        WHERE variant_id = ANY(%s) AND deleted_at IS NULL
        """,
        (survivor["product_id"], plan["title"], variant_ids),
    )
    cur.execute(
        """
        UPDATE order_line_item
        SET product_id = %s, product_title = %s, updated_at = NOW()
        WHERE variant_id = ANY(%s) AND deleted_at IS NULL
        """,
        (survivor["product_id"], plan["title"], variant_ids),
    )
    cur.execute(
        """
        SELECT v.sku, v.product_id, p.title, pr.amount
        FROM product_variant v
        JOIN product p ON p.id = v.product_id
        JOIN product_variant_price_set vps ON vps.variant_id = v.id AND vps.deleted_at IS NULL
        JOIN price pr ON pr.price_set_id = vps.price_set_id AND pr.deleted_at IS NULL
          AND pr.price_list_id IS NULL
        WHERE v.sku = ANY(%s) AND v.deleted_at IS NULL
        """,
        (plan["skus"],),
    )
    readback = list(cur.fetchall())
    if len(readback) != len(plan["skus"]):
        raise SystemExit(f"readback sku count {plan['family_key']}")
    for item in readback:
        if item["product_id"] != survivor["product_id"] or item["title"] != plan["title"]:
            raise SystemExit(f"readback product {item['sku']}")
        if _amount(item["amount"]) != _amount(plan["prices"][item["sku"]]):
            raise SystemExit(f"price changed {item['sku']}")
    cur.execute(
        "SELECT count(*) AS n FROM product_variant WHERE product_id = %s AND deleted_at IS NULL",
        (survivor["product_id"],),
    )
    if cur.fetchone()["n"] != len(plan["skus"]):
        raise SystemExit(f"variant count changed {plan['family_key']}")
    cur.execute(
        """
        SELECT count(*) AS n
        FROM product_variant_option pvo
        JOIN product_variant v ON v.id = pvo.variant_id
        WHERE v.sku = ANY(%s) AND v.deleted_at IS NULL
        """,
        (plan["skus"],),
    )
    if cur.fetchone()["n"] != len(plan["skus"]) * len(axis_names):
        raise SystemExit(f"option coverage {plan['family_key']}")
    return {
        "family_key": plan["family_key"],
        "status": "applied",
        "title": plan["title"],
        "survivor_product_id": survivor["product_id"],
        "skus": plan["skus"],
        "prices": {row["sku"]: row["base_amount"] for row in rows},
    }


def apply_sparse() -> dict[str, Any]:
    probe = connect()
    try:
        identity = assert_identity(probe)
    finally:
        probe.close()
    _inventory, plans = _plans_from_live(None)
    conn = psycopg2.connect("postgresql://postgres:postgres@127.0.0.1:5432/medusa-store")
    conn.autocommit = False
    applied = []
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        live = assert_identity(conn)
        if live["db"] != identity["db"] or live["addr"] != identity["addr"]:
            raise SystemExit("identity changed between probe and write")
        for plan in plans:
            applied.append(_apply_family(cur, plan))
        # No price rows may change. Re-read base amounts.
        skus = [sku for plan in plans for sku in plan["skus"]]
        if skus:
            cur.execute(
                """
                SELECT v.sku, pr.amount
                FROM product_variant v
                JOIN product_variant_price_set vps ON vps.variant_id = v.id AND vps.deleted_at IS NULL
                JOIN price pr ON pr.price_set_id = vps.price_set_id AND pr.deleted_at IS NULL
                  AND pr.price_list_id IS NULL
                WHERE v.sku = ANY(%s)
                """,
                (skus,),
            )
            seen = {}
            for price in cur.fetchall():
                if price["sku"] in seen:
                    raise SystemExit(f"duplicate base price after apply {price['sku']}")
                seen[price["sku"]] = _amount(price["amount"])
            for plan in plans:
                for sku, expected in plan["prices"].items():
                    if seen.get(sku) != _amount(expected):
                        raise SystemExit(f"price changed {sku}")
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    return {
        "production": "NOT_MUTATED",
        "families": applied,
        "applied": sum(1 for item in applied if item["status"] == "applied"),
        "already_applied": sum(1 for item in applied if item["status"] == "already_applied"),
        "skipped": sum(1 for item in applied if item["status"] == "skipped"),
        "pass": SPARSE_PASS,
    }


def main() -> None:
    print(json.dumps(apply_sparse(), ensure_ascii=False, indent=2, default=str))


if __name__ == "__main__":
    main()
