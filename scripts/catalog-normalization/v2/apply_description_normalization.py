"""Write family-safe descriptions to the local medusa-store only.

Touches product.description. SKU, price, title, status, metadata, and media
stay as they are. A second run updates nothing.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import psycopg2

from catalog_norm.beds_apply import assert_identity
from catalog_norm.export_inventory import connect, database_url, export_products


def apply(manifest_path: Path) -> dict:
    manifest = json.loads(manifest_path.read_text())
    mutations = manifest.get("mutations") or []
    probe = connect()
    try:
        identity = assert_identity(probe)
    finally:
        probe.close()
    if identity["db"] != "medusa-store" or identity["read_only"] not in {"on", "true", "True"}:
        raise SystemExit("refusing a connection that is not the read-only local store")

    conn = psycopg2.connect(database_url())
    conn.autocommit = False
    changed = 0
    try:
        live = assert_identity(conn)
        if live["db"] != identity["db"] or live["addr"] != identity["addr"]:
            raise SystemExit("write connection is not the probed database")
        cur = conn.cursor()
        for row in mutations:
            cur.execute(
                """
                UPDATE product
                SET description = %s, updated_at = NOW()
                WHERE id = %s
                  AND deleted_at IS NULL
                  AND description IS DISTINCT FROM %s
                  AND (
                    description = %s
                    OR (description IS NULL AND %s = '')
                  )
                """,
                (
                    row["proposed_description"],
                    row["product_id"],
                    row["proposed_description"],
                    row["current_description"],
                    row["current_description"],
                ),
            )
            if cur.rowcount not in (0, 1):
                raise SystemExit(f"unexpected update count for {row['product_id']}")
            changed += cur.rowcount
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    return {"identity": identity, "changed": changed, "manifest_rows": len(mutations)}


def main() -> None:
    result = apply(Path(sys.argv[1]))
    print(json.dumps({
        "database": result["identity"]["db"],
        "changed": result["changed"],
        "manifest_rows": result["manifest_rows"],
        "production": "NOT_MUTATED",
    }))


if __name__ == "__main__":
    main()
