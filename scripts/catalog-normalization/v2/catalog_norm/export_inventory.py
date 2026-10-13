"""Read-only Medusa inventory export. Refuses non-local databases."""

from __future__ import annotations

import json
import os
from datetime import datetime
from decimal import Decimal
import psycopg2
import psycopg2.extras
from psycopg2.extensions import parse_dsn

LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}
# libpq connects to these instead of `host`, so a local host name proves nothing.
REDIRECTING_PARAMS = ("hostaddr", "service")
REDIRECTING_ENV = ("PGHOSTADDR", "PGSERVICE")


def database_url() -> str:
    url = os.environ.get("DATABASE_URL") or "postgresql://postgres:postgres@127.0.0.1:5432/medusa-store"
    try:
        params = parse_dsn(url)
    except psycopg2.ProgrammingError:
        raise SystemExit("refusing unparsable DATABASE_URL") from None
    hosts = [part.strip().lower() for part in (params.get("host") or "").split(",")]
    if any(host not in LOCAL_HOSTS for host in hosts):
        raise SystemExit(f"refusing non-local database host {params.get('host') or ''}")
    overrides = [key for key in REDIRECTING_PARAMS if params.get(key)]
    overrides += [key for key in REDIRECTING_ENV if os.environ.get(key)]
    if overrides:
        raise SystemExit(f"refusing database connection override {', '.join(overrides)}")
    return url


def connect():
    conn = psycopg2.connect(database_url())
    conn.set_session(readonly=True, autocommit=True)
    return conn


def _jsonable(value):
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_jsonable(v) for v in value]
    return value


def export_products(conn) -> dict:
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT current_database() AS db, inet_server_addr()::text AS addr, current_setting('transaction_read_only') AS ro")
    identity = dict(cur.fetchone())
    cur.execute(
        """
        SELECT p.*, c.handle AS collection_handle, c.title AS collection_title,
               t.value AS product_type_value
        FROM product p
        LEFT JOIN product_collection c ON c.id = p.collection_id
        LEFT JOIN product_type t ON t.id = p.type_id
        ORDER BY p.handle
        """
    )
    products = [dict(row) for row in cur.fetchall()]
    ids = [p["id"] for p in products]

    def grouped(sql: str, key: str = "product_id"):
        cur.execute(sql, (ids,))
        buckets: dict[str, list] = {}
        for row in cur.fetchall():
            buckets.setdefault(row[key], []).append(dict(row))
        return buckets

    variants = grouped(
        """
        SELECT * FROM product_variant
        WHERE product_id = ANY(%s)
        ORDER BY product_id, variant_rank, sku
        """
    )
    images = grouped("SELECT * FROM image WHERE product_id = ANY(%s) AND deleted_at IS NULL ORDER BY rank NULLS LAST, id")
    categories = grouped(
        """
        SELECT pcp.product_id, cat.id AS category_id, cat.handle, cat.name
        FROM product_category_product pcp
        JOIN product_category cat ON cat.id = pcp.product_category_id
        WHERE pcp.product_id = ANY(%s)
        """
    )
    channels = grouped(
        """
        SELECT psc.product_id, sc.id AS sales_channel_id, sc.name
        FROM product_sales_channel psc
        JOIN sales_channel sc ON sc.id = psc.sales_channel_id
        WHERE psc.product_id = ANY(%s) AND psc.deleted_at IS NULL
        """
    )
    classes = grouped(
        """
        SELECT lnk.product_id, pc.product_type, pc.id AS classification_id
        FROM product_productextensionmodule_product_classificat7e368fb4 lnk
        JOIN product_classification pc ON pc.id = lnk.product_classification_id
        WHERE lnk.product_id = ANY(%s) AND lnk.deleted_at IS NULL
        """
    )
    options = grouped(
        """
        SELECT ppo.product_id, o.id AS option_id, o.title,
               COALESCE(json_agg(ov.value ORDER BY ov.value) FILTER (WHERE ov.id IS NOT NULL), '[]') AS values
        FROM product_product_option ppo
        JOIN product_option o ON o.id = ppo.product_option_id AND o.deleted_at IS NULL
        LEFT JOIN product_option_value ov ON ov.option_id = o.id AND ov.deleted_at IS NULL
        WHERE ppo.product_id = ANY(%s) AND ppo.deleted_at IS NULL
        GROUP BY ppo.product_id, o.id, o.title
        """
    )
    variant_ids = [v["id"] for rows in variants.values() for v in rows]
    cur.execute(
        """
        SELECT vps.variant_id, pr.id AS price_id, pr.currency_code, pr.amount,
               pr.price_list_id, pl.title AS price_list_title, pl.status AS price_list_status, pl.type AS price_list_type
        FROM product_variant_price_set vps
        JOIN price pr ON pr.price_set_id = vps.price_set_id AND pr.deleted_at IS NULL
        LEFT JOIN price_list pl ON pl.id = pr.price_list_id
        WHERE vps.variant_id = ANY(%s) AND vps.deleted_at IS NULL
        """,
        (variant_ids,),
    )
    prices: dict[str, list] = {}
    for row in cur.fetchall():
        prices.setdefault(row["variant_id"], []).append(dict(row))
    cur.execute(
        """
        SELECT vo.variant_id, o.title AS option_title, ov.value
        FROM product_variant_option vo
        JOIN product_option_value ov ON ov.id = vo.option_value_id
        JOIN product_option o ON o.id = ov.option_id
        WHERE vo.variant_id = ANY(%s)
        """,
        (variant_ids,),
    )
    vopts: dict[str, list] = {}
    for row in cur.fetchall():
        vopts.setdefault(row["variant_id"], []).append({"title": row["option_title"], "value": row["value"]})
    cur.execute("SELECT product_id, count(*) AS n FROM order_line_item GROUP BY product_id")
    orders = {row["product_id"]: row["n"] for row in cur.fetchall()}
    cur.execute("SELECT product_id, count(*) AS n FROM cart_line_item GROUP BY product_id")
    carts = {row["product_id"]: row["n"] for row in cur.fetchall()}
    cur.execute("SELECT id, key, product_ids FROM promotion_slot WHERE deleted_at IS NULL")
    slots = [dict(row) for row in cur.fetchall()]

    exported = []
    for product in products:
        meta = product.get("metadata") or {}
        if isinstance(meta, str):
            meta = json.loads(meta)
        dims = meta.get("dimensions") or meta.get("dimensions_normalized") or {}
        vars_out = []
        for variant in variants.get(product["id"], []):
            vars_out.append({
                "id": variant["id"],
                "title": variant["title"],
                "sku": variant["sku"],
                "metadata": variant.get("metadata") or {},
                "options": vopts.get(variant["id"], []),
                "prices": [
                    {
                        "id": price["price_id"],
                        "currency": price["currency_code"],
                        "amount": format(price["amount"], "f") if isinstance(price["amount"], Decimal) else str(price["amount"]),
                        "price_list_id": price["price_list_id"],
                        "price_list_title": price["price_list_title"],
                        "price_list_status": price["price_list_status"],
                        "price_list_type": price["price_list_type"],
                    }
                    for price in prices.get(variant["id"], [])
                ],
                "deleted_at": variant.get("deleted_at"),
            })
        slot_keys = [s["key"] for s in slots if product["id"] in (s.get("product_ids") or [])]
        exported.append({
            "id": product["id"],
            "handle": product["handle"],
            "title": product["title"],
            "subtitle": product["subtitle"] or "",
            "description": product["description"] or "",
            "status": product["status"],
            "thumbnail": product["thumbnail"],
            "created_at": product["created_at"],
            "updated_at": product["updated_at"],
            "deleted_at": product["deleted_at"],
            "collection_id": product["collection_id"],
            "collection_handle": product.get("collection_handle") or "",
            "collection_title": product.get("collection_title") or "",
            "product_type": product.get("product_type_value") or "",
            "categories": [c["handle"] for c in categories.get(product["id"], [])],
            "category_names": [c["name"] for c in categories.get(product["id"], [])],
            "classification": (classes.get(product["id"]) or [{}])[0].get("product_type") or "",
            "sales_channels": [c["name"] for c in channels.get(product["id"], [])],
            "options": options.get(product["id"], []),
            "variants": vars_out,
            "images": [i.get("url") for i in images.get(product["id"], [])],
            "metadata": meta,
            "dimensions": dims if isinstance(dims, dict) else {},
            "launch_mode": meta.get("launch_mode") or "",
            "family_key_legacy": meta.get("family_key") or "",
            "canonical_name": meta.get("canonical_name") or "",
            "public_title": meta.get("public_title") or "",
            "order_line_count": orders.get(product["id"], 0),
            "cart_line_count": carts.get(product["id"], 0),
            "promotion_slots": slot_keys,
            "length": product.get("length"),
            "height": product.get("height"),
            "width": product.get("width"),
            "material": product.get("material"),
        })
    return _jsonable({"identity": identity, "products": exported})
