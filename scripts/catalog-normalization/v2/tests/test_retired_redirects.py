import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from run_retired_redirects import MAP_FILE, check, parse_map


def shell(pid, handle, code="", motif="", status="draft"):
    meta = {"product_code_normalized": code} if code else {}
    if motif:
        meta.update(motif_slug=motif, painting_prefix=handle[:2].upper(), workbook_product_code="WW-05-3")
    return {"id": pid, "handle": handle, "status": status, "metadata": meta, "variants": []}


def survivor(pid, handle, variants, motif="", status="published"):
    return {
        "id": pid,
        "handle": handle,
        "status": status,
        "metadata": {"motif_slug": motif} if motif else {},
        "variants": [{"id": vid, "sku": sku} for vid, sku in variants],
    }


def blocks(handle_entries, id_entries=None):
    def entries(items):
        return {key: {"survivor_handle": h, "variant_id": v} for key, (h, v) in items.items()}

    return {"handle": entries(handle_entries), "id": entries(id_entries or {})}


class RetiredRedirects(unittest.TestCase):
    def setUp(self):
        self.products = [
            survivor("p1", "ol-14-1", [("v1", "OL-14-1"), ("v2", "OL-15-1")]),
            shell("p2", "ol-15-1", code="OL-15-1"),
            survivor("p3", "fk-05-1", [("v3", "FK-05-1"), ("v4", "FK-05-3")], motif="fantasy-kingdom"),
            shell("p4", "fk-05-3", motif="fantasy-kingdom"),
        ]

    def test_exact_map_passes(self):
        result = check(
            blocks({"ol-15-1": ("ol-14-1", "v2"), "fk-05-3": ("fk-05-1", "v4")}, {"p2": ("ol-14-1", "v2"), "p4": ("fk-05-1", "v4")}),
            self.products,
        )
        self.assertEqual(result["violations"], [])

    def test_wrong_sku_motif_and_published_shell_fail(self):
        self.products[1]["status"] = "published"
        self.products[2]["metadata"]["motif_slug"] = "templars"
        result = check(blocks({"ol-15-1": ("ol-14-1", "v1"), "fk-05-3": ("fk-05-1", "v4")}), self.products)
        joined = " | ".join(result["violations"])
        self.assertIn("still published", joined)
        self.assertIn("is not the retired sku", joined)
        self.assertIn("lands on motif templars", joined)

    def test_missing_entry_and_loop_fail(self):
        result = check(blocks({"ol-15-1": ("ol-15-1", "v2")}), self.products)
        joined = " | ".join(result["violations"])
        self.assertIn("unmapped retired shell fk-05-3", joined)
        self.assertIn("survivor is itself retired", joined)

    def test_storefront_map_parses_both_blocks(self):
        parsed = parse_map(MAP_FILE.read_text())
        self.assertEqual(len(parsed["handle"]), len(parsed["id"]))
        self.assertIn("ol-15-1", parsed["handle"])


if __name__ == "__main__":
    unittest.main()
