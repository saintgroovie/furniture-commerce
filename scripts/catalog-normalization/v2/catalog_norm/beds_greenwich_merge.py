"""Merge the Greenwich bed into one local product with mattress-size variants.

Only greenwich/bed/standard. Finish payloads and gallery URLs must be identical.
Prices, promo rows, classification, and physical millimetres stay on the SKU.
Empty shells are drafted, not deleted. Production is never a target.
"""

from __future__ import annotations

import json
from decimal import Decimal
from typing import Any

import psycopg2
import psycopg2.extras

from catalog_norm.beds_apply import PASS_ID, _amount, assert_identity
from catalog_norm.export_inventory import connect, database_url

FAMILY = "greenwich/bed/standard"
CANONICAL_TITLE = "Кровать Гринвич"
SURVIVOR_SKU = "GR-09-1"
SKUS = ("GR-09-1", "GR-12-1", "GR-14-1", "GR-16-1", "GR-18-1")
OPTION_ID = "opt_01BEDNORMV2GRMATTRESSSIZE"
OPTION_TITLE = "Размер спального места"
EXECUTION_FIELDS = (
    "fabric_upholstery_executions",
    "upholstery_color_executions",
    "frame_material_executions",
    "headboard_model_executions",
    "finish_color_executions",
    "paint_finish_executions",
)


def option_value_id(key: str) -> str:
    return "optval_01BEDNORMV2GR" + key.upper().replace("X", "X")


def merge_allowed(rows: list[dict[str, Any]]) -> list[str]:
    """Return blockers. Empty means the five Greenwich rows may merge."""
    errors: list[str] = []
    if [row["sku"] for row in rows] != list(SKUS):
        errors.append("sku set is not the closed Greenwich bed")
        return errors
    finishes = {
        json.dumps({field: row["metadata"].get(field) for field in EXECUTION_FIELDS}, sort_keys=True, ensure_ascii=False)
        for row in rows
    }
    if len(finishes) != 1:
        errors.append("finish payloads differ")
    galleries = {frozenset(row["image_urls"]) for row in rows}
    if len(galleries) != 1:
        errors.append("gallery urls differ")
    if any(row["classification"] != "STANDARD" for row in rows):
        errors.append("classification is not STANDARD")
    if any(row["status"] not in {"published", "draft"} for row in rows):
        errors.append("unexpected status")
    widths = [row["dimensions"].get("width_mm") for row in rows]
    if len(set(widths)) != 5:
        errors.append("expected five distinct furniture widths")
    if any(row["dimensions"].get("height_mm") != 1050 or row["dimensions"].get("depth_mm") != 2207 for row in rows):
        errors.append("height or depth is not the shared Greenwich frame")
    prices = [row["base_amount"] for row in rows]
    if len(prices) != len(set(prices)):
        errors.append("base prices are not distinct per size")
    if any(row["orders"] for row in rows):
        errors.append("order lines exist")
    return errors


def _dims(meta: dict[str, Any]) -> dict[str, Any]:
    raw = meta.get("dimensions") or meta.get("dimensions_normalized") or {}
    return dict(raw) if isinstance(raw, dict) else {}


def load_rows(cur) -> list[dict[str, Any]]:
    cur.execute(
        """
        SELECT p.id AS product_id, p.title, p.status, p.handle, p.metadata,
               v.id AS variant_id, v.sku, v.metadata AS variant_metadata,
               pc.product_type
        FROM product p
        JOIN product_variant v ON v.product_id = p.id AND v.deleted_at IS NULL
        LEFT JOIN product_productextensionmodule_product_classificat7e368fb4 link
          ON link.product_id = p.id AND link.deleted_at IS NULL
        LEFT JOIN product_classification pc ON pc.id = link.product_classification_id
        WHERE v.sku = ANY(%s) AND p.deleted_at IS NULL
        ORDER BY v.sku
        """,
        (list(SKUS),),
    )
    products = list(cur.fetchall())
    if len(products) != 5:
        raise SystemExit(f"expected 5 Greenwich beds, found {len(products)}")
    ids = [row["product_id"] for row in products]
    cur.execute(
        "SELECT product_id, url FROM image WHERE product_id = ANY(%s) AND deleted_at IS NULL",
        (ids,),
    )
    images: dict[str, list[str]] = {pid: [] for pid in ids}
    for row in cur.fetchall():
        images[row["product_id"]].append(row["url"])
    cur.execute(
        """
        SELECT v.sku,
               (SELECT count(*) FROM order_line_item o WHERE o.variant_id = v.id AND o.deleted_at IS NULL) AS orders,
               pr.amount, pr.currency_code, pr.price_list_id
        FROM product_variant v
        JOIN product_variant_price_set vps ON vps.variant_id = v.id AND vps.deleted_at IS NULL
        JOIN price pr ON pr.price_set_id = vps.price_set_id AND pr.deleted_at IS NULL
        WHERE v.sku = ANY(%s)
        """,
        (list(SKUS),),
    )
    bases: dict[str, str] = {}
    orders: dict[str, int] = {}
    for row in cur.fetchall():
        orders[row["sku"]] = row["orders"]
        if row["price_list_id"] is None:
            if row["sku"] in bases:
                raise SystemExit(f"multiple base prices {row['sku']}")
            if row["currency_code"] != "rub":
                raise SystemExit(f"currency {row['sku']}")
            bases[row["sku"]] = _amount(row["amount"])
    rows = []
    for product in products:
        meta = dict(product["metadata"] or {})
        rows.append({
            "sku": product["sku"],
            "product_id": product["product_id"],
            "variant_id": product["variant_id"],
            "title": product["title"],
            "status": product["status"],
            "handle": product["handle"],
            "metadata": meta,
            "variant_metadata": dict(product["variant_metadata"] or {}),
            "classification": product["product_type"] or "",
            "image_urls": images[product["product_id"]],
            "dimensions": _dims(meta),
            "base_amount": bases[product["sku"]],
            "orders": orders.get(product["sku"], 0),
            "mattress": meta.get("mattress_size") or {},
        })
    rows.sort(key=lambda row: SKUS.index(row["sku"]))
    return rows


def apply_greenwich_merge() -> dict[str, Any]:
    probe = connect()
    try:
        identity = assert_identity(probe)
    finally:
        probe.close()
    conn = psycopg2.connect(database_url())
    conn.autocommit = False
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        live = assert_identity(conn)
        if live["db"] != identity["db"] or live["addr"] != identity["addr"]:
            raise SystemExit("identity changed between probe and write")
        rows = load_rows(cur)
        if _already_merged(rows):
            conn.rollback()
            return _result(cur, rows[0]["product_id"], rows[0]["handle"], already=True)
        blockers = merge_allowed(rows)
        if blockers:
            raise SystemExit("refusing Greenwich merge: " + "; ".join(blockers))
        for row in rows:
            size = row["mattress"]
            if size.get("source") != "title" or size.get("confidence") != "high":
                raise SystemExit(f"mattress field missing {row['sku']}")
            if _amount(row["base_amount"]) != _amount(row["base_amount"]):
                raise SystemExit("price")
        survivor = rows[0]
        if survivor["sku"] != SURVIVOR_SKU:
            raise SystemExit("survivor is not GR-09-1")
        # Prices must stay the amounts already read. No write to price.
        expected = {row["sku"]: row["base_amount"] for row in rows}

        for index, row in enumerate(rows):
            variant_meta = dict(row["variant_metadata"])
            variant_meta["mattress_size"] = row["mattress"]
            variant_meta["dimensions"] = row["dimensions"]
            variant_meta["catalog_norm_v2"] = {
                "pass": PASS_ID,
                "family_key": FAMILY,
                "merge_applied": True,
                "survivor_sku": SURVIVOR_SKU,
            }
            cur.execute(
                """
                UPDATE product_variant
                SET product_id = %s,
                    title = %s,
                    variant_rank = %s,
                    metadata = %s,
                    updated_at = NOW()
                WHERE id = %s AND sku = %s AND deleted_at IS NULL
                """,
                (
                    survivor["product_id"],
                    row["mattress"]["display"],
                    index,
                    psycopg2.extras.Json(variant_meta),
                    row["variant_id"],
                    row["sku"],
                ),
            )
            if cur.rowcount != 1:
                raise SystemExit(f"variant move {row['sku']}")

        cur.execute(
            """
            SELECT po.id
            FROM product_option po
            JOIN product_product_option ppo ON ppo.product_option_id = po.id AND ppo.deleted_at IS NULL
            WHERE ppo.product_id = %s AND po.deleted_at IS NULL AND po.title = 'Default'
            """,
            (survivor["product_id"],),
        )
        default_options = [row["id"] for row in cur.fetchall()]
        if len(default_options) != 1:
            raise SystemExit(f"survivor Default option count {len(default_options)}")
        default_option_id = default_options[0]
        cur.execute(
            "SELECT count(*) AS n FROM product_product_option WHERE product_option_id = %s AND deleted_at IS NULL",
            (default_option_id,),
        )
        if cur.fetchone()["n"] != 1:
            raise SystemExit("Default option is shared; refusing to retire it")

        cur.execute(
            """
            INSERT INTO product_option (id, title, metadata, created_at, updated_at, is_exclusive)
            VALUES (%s, %s, %s, NOW(), NOW(), TRUE)
            ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, updated_at = NOW(), deleted_at = NULL
            """,
            (OPTION_ID, OPTION_TITLE, psycopg2.extras.Json({"pass": PASS_ID, "axis": "mattress_size"})),
        )
        cur.execute(
            """
            INSERT INTO product_product_option (id, product_id, product_option_id, created_at, updated_at)
            VALUES (%s, %s, %s, NOW(), NOW())
            ON CONFLICT (id) DO UPDATE SET deleted_at = NULL, updated_at = NOW()
            """,
            ("prodopt_01BEDNORMV2GR", survivor["product_id"], OPTION_ID),
        )
        for index, row in enumerate(rows):
            key = row["mattress"]["key"]
            value_id = option_value_id(key)
            cur.execute(
                """
                INSERT INTO product_option_value (id, value, option_id, metadata, created_at, updated_at, rank)
                VALUES (%s, %s, %s, %s, NOW(), NOW(), %s)
                ON CONFLICT (id) DO UPDATE
                  SET value = EXCLUDED.value, deleted_at = NULL, updated_at = NOW(), rank = EXCLUDED.rank
                """,
                (
                    value_id,
                    row["mattress"]["display"],
                    OPTION_ID,
                    psycopg2.extras.Json({"key": key, "width_cm": row["mattress"]["width_cm"], "length_cm": row["mattress"]["length_cm"]}),
                    index,
                ),
            )
            link_id = "prodoptval_01BEDNORMV2GR" + key.upper()
            cur.execute(
                """
                INSERT INTO product_product_option_value
                  (id, product_product_option_id, product_option_value_id, created_at, updated_at)
                VALUES (%s, %s, %s, NOW(), NOW())
                ON CONFLICT (id) DO UPDATE SET deleted_at = NULL, updated_at = NOW()
                """,
                (link_id, "prodopt_01BEDNORMV2GR", value_id),
            )
            cur.execute("DELETE FROM product_variant_option WHERE variant_id = %s", (row["variant_id"],))
            cur.execute(
                "INSERT INTO product_variant_option (variant_id, option_value_id) VALUES (%s, %s)",
                (row["variant_id"], value_id),
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

        survivor_meta = dict(survivor["metadata"])
        survivor_meta["catalog_norm_v2"] = {
            "pass": PASS_ID,
            "family_key": FAMILY,
            "canonical_title": CANONICAL_TITLE,
            "merge_applied": True,
            "title_applied": True,
            "classification_unchanged": "STANDARD",
            "variant_skus": list(SKUS),
        }
        cur.execute(
            """
            UPDATE product
            SET title = %s, metadata = %s, status = 'published', updated_at = NOW()
            WHERE id = %s AND deleted_at IS NULL
            """,
            (CANONICAL_TITLE, psycopg2.extras.Json(survivor_meta), survivor["product_id"]),
        )
        if cur.rowcount != 1:
            raise SystemExit("survivor title update")

        for row in rows[1:]:
            shell = dict(row["metadata"])
            note = dict(shell.get("catalog_norm_v2") or {})
            note.update({
                "pass": PASS_ID,
                "archived_shell": True,
                "survivor_product_id": survivor["product_id"],
                "survivor_sku": SURVIVOR_SKU,
                "merge_applied": True,
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
                raise SystemExit(f"shell draft {row['sku']}")

        cur.execute(
            """
            UPDATE cart_line_item
            SET product_id = %s, product_title = %s, updated_at = NOW()
            WHERE variant_id = ANY(%s) AND deleted_at IS NULL
            """,
            (survivor["product_id"], CANONICAL_TITLE, [row["variant_id"] for row in rows]),
        )

        # Read back inside the same transaction before commit.
        cur.execute(
            """
            SELECT v.sku, v.id AS variant_id, v.product_id, v.title AS variant_title, v.variant_rank,
                   p.title AS product_title, p.status, p.handle,
                   pov.value AS option_value,
                   pr.amount, pr.price_list_id
            FROM product_variant v
            JOIN product p ON p.id = v.product_id
            JOIN product_variant_option pvo ON pvo.variant_id = v.id
            JOIN product_option_value pov ON pov.id = pvo.option_value_id AND pov.deleted_at IS NULL
            JOIN product_variant_price_set vps ON vps.variant_id = v.id AND vps.deleted_at IS NULL
            JOIN price pr ON pr.price_set_id = vps.price_set_id AND pr.deleted_at IS NULL
            WHERE v.sku = ANY(%s) AND v.deleted_at IS NULL
            ORDER BY v.variant_rank, v.sku
            """,
            (list(SKUS),),
        )
        readback = [dict(row) for row in cur.fetchall() if row["price_list_id"] is None]
        if len(readback) != 5:
            raise SystemExit(f"readback base rows {len(readback)}")
        for row in readback:
            if row["product_id"] != survivor["product_id"]:
                raise SystemExit(f"variant not on survivor {row['sku']}")
            if row["product_title"] != CANONICAL_TITLE or row["status"] != "published":
                raise SystemExit("survivor title/status")
            if row["variant_title"] != row["option_value"]:
                raise SystemExit(f"option mismatch {row['sku']}")
            if _amount(row["amount"]) != expected[row["sku"]]:
                raise SystemExit(f"price changed {row['sku']}")
            if SIZE_IN_TITLE(row["product_title"]):
                raise SystemExit("size returned to the product title")
        cur.execute(
            "SELECT count(*) AS n FROM product WHERE id = ANY(%s) AND status = 'draft' AND deleted_at IS NULL",
            ([row["product_id"] for row in rows[1:]],),
        )
        if cur.fetchone()["n"] != 4:
            raise SystemExit("shell draft count")
        cur.execute(
            """
            SELECT count(*) AS n FROM cart_line_item
            WHERE variant_id = ANY(%s) AND deleted_at IS NULL AND product_id <> %s
            """,
            ([row["variant_id"] for row in rows], survivor["product_id"]),
        )
        if cur.fetchone()["n"] != 0:
            raise SystemExit("cart lines still point at a shell")
        conn.commit()
        return {
            "identity": live,
            "survivor_product_id": survivor["product_id"],
            "survivor_handle": survivor["handle"],
            "canonical_title": CANONICAL_TITLE,
            "skus": [
                {
                    "sku": row["sku"],
                    "variant_id": row["variant_id"],
                    "option_value": row["option_value"],
                    "base_amount": _amount(row["amount"]),
                }
                for row in readback
            ],
            "shells_drafted": 4,
            "production": "NOT_MUTATED",
        }
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _already_merged(rows: list[dict[str, Any]]) -> bool:
    ids = {row["product_id"] for row in rows}
    return len(ids) == 1 and all(row["title"] == CANONICAL_TITLE for row in rows)


def _result(cur, product_id: str, handle: str, already: bool) -> dict[str, Any]:
    cur.execute(
        """
        SELECT v.sku, v.id AS variant_id, pov.value AS option_value, pr.amount
        FROM product_variant v
        JOIN product_variant_option pvo ON pvo.variant_id = v.id
        JOIN product_option_value pov ON pov.id = pvo.option_value_id AND pov.deleted_at IS NULL
        JOIN product_variant_price_set vps ON vps.variant_id = v.id AND vps.deleted_at IS NULL
        JOIN price pr ON pr.price_set_id = vps.price_set_id AND pr.deleted_at IS NULL AND pr.price_list_id IS NULL
        WHERE v.product_id = %s AND v.sku = ANY(%s) AND v.deleted_at IS NULL
        ORDER BY v.variant_rank
        """,
        (product_id, list(SKUS)),
    )
    skus = [
        {
            "sku": row["sku"],
            "variant_id": row["variant_id"],
            "option_value": row["option_value"],
            "base_amount": _amount(row["amount"]),
        }
        for row in cur.fetchall()
    ]
    return {
        "already_applied": already,
        "survivor_product_id": product_id,
        "survivor_handle": handle,
        "canonical_title": CANONICAL_TITLE,
        "skus": skus,
        "shells_drafted": 4,
        "production": "NOT_MUTATED",
    }


def SIZE_IN_TITLE(title: str) -> bool:
    import re
    return re.search(r"\d{2,4}\s*[xхХX×*]\s*\d{2,4}", title) is not None


def main() -> None:
    result = apply_greenwich_merge()
    print(json.dumps(result, ensure_ascii=False, indent=2, default=str))


if __name__ == "__main__":
    main()
