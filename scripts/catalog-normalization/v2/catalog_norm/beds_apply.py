"""Apply bed mattress fields to the local Medusa database only.

Product rows stay separate. Prices, promo lists, classification, and physical
dimensions are not written. A title changes only for a one-SKU family.
"""

from __future__ import annotations

import json
from decimal import Decimal
from typing import Any

import psycopg2
import psycopg2.extras

from catalog_norm.export_inventory import LOCAL_HOSTS, connect, database_url

PASS_ID = "bed-normalization-v2-20261010"


def _private_addr(addr: str | None) -> bool:
    host = (addr or "").split("/")[0]
    return host.startswith("127.") or host.startswith("172.") or host.startswith("10.") or host in {"::1", "localhost"}


def _amount(value: Any) -> str:
    """Integer ruble amount. Trailing zeros are significant: 71900 must stay 71900."""
    if value in (None, ""):
        return ""
    decimal = Decimal(str(value))
    if decimal != decimal.to_integral_value():
        raise SystemExit(f"refusing fractional price {value}")
    return str(decimal.to_integral_value())


def assert_identity(conn) -> dict[str, str]:
    dsn = conn.get_dsn_parameters()
    host = (dsn.get("host") or "").lower()
    if host not in LOCAL_HOSTS:
        raise SystemExit(f"refusing non-local database host {host}")
    cur = conn.cursor()
    cur.execute("SELECT current_database(), inet_server_addr()::text, current_setting('transaction_read_only')")
    db, addr, readonly = cur.fetchone()
    if db != "medusa-store" or not _private_addr(addr):
        raise SystemExit(f"refusing database identity db={db} addr={addr}")
    return {"db": db, "addr": addr, "read_only": readonly, "host": host}


def snapshot_rows(products: list[dict[str, Any]], skus: set[str]) -> list[dict[str, Any]]:
    rows = []
    for product in products:
        for variant in product.get("variants") or []:
            if variant.get("sku") not in skus:
                continue
            rows.append({
                "product_id": product["id"],
                "sku": variant["sku"],
                "title": product["title"],
                "status": product["status"],
                "classification": product.get("classification") or "",
                "metadata": product.get("metadata") or {},
                "variant_id": variant["id"],
                "variant_metadata": variant.get("metadata") or {},
                "prices": variant.get("prices") or [],
                "dimensions": product.get("dimensions") or {},
            })
    return rows


def apply_bed_fields(mutations: list[dict[str, Any]]) -> dict[str, Any]:
    """Write mattress metadata. Rolls back unless every row matches."""
    probe = connect()
    try:
        identity = assert_identity(probe)
    finally:
        probe.close()

    conn = psycopg2.connect(database_url())
    conn.autocommit = False
    readback: list[dict[str, Any]] = []
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        live = assert_identity(conn)
        if live["db"] != identity["db"] or live["addr"] != identity["addr"]:
            raise SystemExit("identity changed between probe and write")
        for mutation in mutations:
            cur.execute(
                "SELECT id, title, metadata, status FROM product WHERE id = %s AND deleted_at IS NULL FOR UPDATE",
                (mutation["product_id"],),
            )
            product = cur.fetchone()
            if not product or product["title"] != mutation["current_title"]:
                raise SystemExit(f"title drift {mutation['sku']}")
            if product["status"] != "published":
                raise SystemExit(f"status drift {mutation['sku']}")
            cur.execute(
                """
                SELECT pr.id, pr.amount, pr.currency_code, pr.price_list_id
                FROM product_variant_price_set vps
                JOIN price pr ON pr.price_set_id = vps.price_set_id AND pr.deleted_at IS NULL
                WHERE vps.variant_id = %s AND vps.deleted_at IS NULL
                FOR UPDATE OF pr
                """,
                (mutation["variant_id"],),
            )
            prices = cur.fetchall()
            bases = [price for price in prices if price["price_list_id"] is None]
            if len(bases) != 1 or bases[0]["currency_code"] != mutation["currency"]:
                raise SystemExit(f"price shape drift {mutation['sku']}")
            if _amount(bases[0]["amount"]) != _amount(mutation["price_before"]):
                raise SystemExit(f"price amount drift {mutation['sku']}")
            if _amount(mutation["price_before"]) != _amount(mutation["price_after"]):
                raise SystemExit(f"manifest would change price {mutation['sku']}")
            meta = dict(product["metadata"] or {})
            dimensions_before = json.dumps(meta.get("dimensions"), ensure_ascii=False, sort_keys=True)
            if mutation["mattress_size_status"] == "MATTRESS_SIZE_UNKNOWN":
                meta["mattress_size"] = {
                    "status": "MATTRESS_SIZE_UNKNOWN",
                    "key": None,
                    "width_cm": None,
                    "length_cm": None,
                    "unit": "cm",
                    "display": None,
                    "source": "none",
                    "confidence": "none",
                }
            else:
                meta["mattress_size"] = mutation["mattress_size"]
            meta["catalog_norm_v2"] = {
                "pass": PASS_ID,
                "family_key": mutation["family_key"],
                "canonical_title": mutation["canonical_title"],
                "merge_applied": False,
                "title_applied": mutation["title_applied"],
                "classification_unchanged": mutation["classification_before"],
            }
            if json.dumps(meta.get("dimensions"), ensure_ascii=False, sort_keys=True) != dimensions_before:
                raise SystemExit(f"dimensions mutated in memory {mutation['sku']}")
            cur.execute(
                """
                UPDATE product
                SET title = %s, metadata = %s, updated_at = NOW()
                WHERE id = %s AND title = %s AND deleted_at IS NULL
                """,
                (
                    mutation["title_after"],
                    psycopg2.extras.Json(meta),
                    mutation["product_id"],
                    mutation["current_title"],
                ),
            )
            if cur.rowcount != 1:
                raise SystemExit(f"product update count {mutation['sku']}")
            cur.execute(
                "SELECT metadata FROM product_variant WHERE id = %s AND sku = %s AND deleted_at IS NULL FOR UPDATE",
                (mutation["variant_id"], mutation["sku"]),
            )
            variant = cur.fetchone()
            if not variant:
                raise SystemExit(f"variant missing {mutation['sku']}")
            variant_meta = dict(variant["metadata"] or {})
            variant_meta["mattress_size"] = meta["mattress_size"]
            variant_meta["catalog_norm_v2"] = {"pass": PASS_ID, "merge_applied": False}
            cur.execute(
                "UPDATE product_variant SET metadata = %s, updated_at = NOW() WHERE id = %s AND sku = %s",
                (psycopg2.extras.Json(variant_meta), mutation["variant_id"], mutation["sku"]),
            )
            if cur.rowcount != 1:
                raise SystemExit(f"variant update count {mutation['sku']}")

        cur.execute(
            """
            SELECT p.id AS product_id, p.title, p.status, p.metadata AS product_metadata,
                   v.id AS variant_id, v.sku, v.metadata AS variant_metadata,
                   pr.amount, pr.currency_code, pr.price_list_id
            FROM product p
            JOIN product_variant v ON v.product_id = p.id AND v.deleted_at IS NULL
            JOIN product_variant_price_set vps ON vps.variant_id = v.id AND vps.deleted_at IS NULL
            JOIN price pr ON pr.price_set_id = vps.price_set_id AND pr.deleted_at IS NULL
            WHERE v.sku = ANY(%s)
            """,
            ([mutation["sku"] for mutation in mutations],),
        )
        actual = {}
        for row in cur.fetchall():
            if row["price_list_id"] is not None:
                continue
            actual[row["sku"]] = row
        if set(actual) != {mutation["sku"] for mutation in mutations}:
            raise SystemExit("readback sku set mismatch")
        for mutation in mutations:
            row = actual[mutation["sku"]]
            got = row["product_metadata"]["mattress_size"]
            expected = mutation["mattress_size"] or {
                "status": "MATTRESS_SIZE_UNKNOWN",
                "width_cm": None,
                "length_cm": None,
            }
            if mutation["mattress_size_status"] == "confirmed":
                if got.get("key") != expected["key"] or got.get("width_cm") != expected["width_cm"]:
                    raise SystemExit(f"readback mattress mismatch {mutation['sku']}")
            else:
                if got.get("status") != "MATTRESS_SIZE_UNKNOWN" or got.get("width_cm") is not None:
                    raise SystemExit("OL-85-2 received a mattress size")
            if row["variant_metadata"]["mattress_size"] != got:
                raise SystemExit(f"variant mattress diverged {mutation['sku']}")
            if row["title"] != mutation["title_after"]:
                raise SystemExit(f"title readback {mutation['sku']}")
            if _amount(row["amount"]) != _amount(mutation["price_before"]):
                raise SystemExit(f"price changed {mutation['sku']}")
            dims = (row["product_metadata"] or {}).get("dimensions")
            readback.append({
                "sku": mutation["sku"],
                "product_id": row["product_id"],
                "variant_id": row["variant_id"],
                "title": row["title"],
                "mattress_size": got,
                "price_amount": _amount(row["amount"]),
                "currency": row["currency_code"],
                "dimensions": dims,
                "status": row["status"],
            })
        conn.commit()
        return {"identity": identity, "readback": readback, "committed": True}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
