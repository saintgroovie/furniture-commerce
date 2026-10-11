import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from catalog_norm.decisions import classify, mattress_rows


def variant(sku, amount="100", mattress=None, executions=None):
    metadata = {}
    if mattress:
        width, length = mattress
        metadata["mattress_size"] = {
            "key": f"{width}x{length}",
            "width_cm": width,
            "length_cm": length,
            "display": f"{width} × {length} см",
            "source": "title",
            "confidence": "high",
        }
    if executions is not None:
        metadata["finish_color_executions"] = executions
    return {
        "id": f"variant_{sku}",
        "sku": sku,
        "deleted_at": None,
        "metadata": metadata,
        "prices": [{"amount": amount, "price_list_id": None}],
    }


def product(sku, title, collection, categories, **extra):
    row = {
        "id": f"prod_{sku}",
        "handle": sku.lower(),
        "title": title,
        "status": "published",
        "deleted_at": None,
        "collection_handle": collection,
        "categories": categories,
        "classification": extra.pop("classification", "CONFIGURABLE"),
        "images": extra.pop("images", ["a.jpg"]),
        "metadata": extra.pop("metadata", {"family_key": "legacy-must-not-merge"}),
        "variants": extra.pop("variants", [variant(sku)]),
    }
    row.update(extra)
    return row


class DecisionTest(unittest.TestCase):
    def test_willie_motifs_stay_separate(self):
        rows = classify([
            product("fk-05-1", "Комод стандартный Сказочное королевство", "willie-winkie", ["komody"]),
            product("pa-05-1", "Комод стандартный Полевые цветы", "willie-winkie", ["komody"]),
            product("fk-05-3", "Комод высокий Сказочное королевство", "willie-winkie", ["komody"]),
        ])["rows"]
        families = {row["sku"]: row["family_key"] for row in rows}
        self.assertNotEqual(families["fk-05-1"], families["pa-05-1"])
        self.assertNotEqual(families["fk-05-1"], families["fk-05-3"])
        self.assertIn("Сказочное королевство", rows[0]["proposed_clean_title"])
        self.assertTrue(all(row["decision"] == "KEEP_SEPARATE_PRODUCTS" for row in rows))

    def test_footboard_is_not_one_bed(self):
        rows = classify([
            product(
                "OL-14-1",
                "Кровать 1-сп. (90×190)",
                "oliver",
                ["krovati"],
                variants=[variant("OL-14-1", "72900", (90, 190))],
            ),
            product(
                "OL-15-1",
                "Кровать 1,5-сп. (120×190)",
                "oliver",
                ["krovati"],
                variants=[variant("OL-15-1", "91900", (120, 190))],
            ),
            product(
                "OL-14-2",
                "Кровать 1-сп. (90×190) без изножья",
                "oliver",
                ["krovati"],
                variants=[variant("OL-14-2", "69900", (90, 190))],
            ),
        ])["rows"]
        by = {row["sku"]: row for row in rows}
        self.assertNotEqual(by["OL-14-1"]["family_key"], by["OL-14-2"]["family_key"])
        self.assertEqual(by["OL-14-1"]["family_key"], by["OL-15-1"]["family_key"])
        self.assertIn("без изножья", by["OL-14-2"]["proposed_clean_title"])
        self.assertNotIn("90", by["OL-14-2"]["proposed_clean_title"])
        self.assertEqual(by["OL-14-1"]["decision"], "KEEP_SEPARATE_PRODUCTS")
        self.assertEqual(by["OL-14-1"]["title_apply"], "no")
        self.assertEqual(by["OL-14-1"]["current_price"], "72900")

    def test_unknown_mattress_is_a_hold(self):
        rows = classify([
            product("OL-85-2", "Кроватка приставная + матрас", "oliver", ["krovati"]),
        ])["rows"]
        self.assertEqual(rows[0]["decision"], "AMBIGUOUS_HOLD")
        self.assertEqual(rows[0]["mattress_width_cm"], "")

    def test_merged_bed_is_already_applied(self):
        merged = product(
            "GR-09-1",
            "Кровать Гринвич",
            "greenwich",
            ["krovati"],
            classification="STANDARD",
            variants=[
                variant("GR-09-1", "71900", (90, 200)),
                variant("GR-18-1", "110400", (180, 200)),
            ],
        )
        rows = classify([merged])["rows"]
        self.assertEqual({row["decision"] for row in rows}, {"ALREADY_APPLIED"})
        self.assertEqual(rows[0]["current_price"], rows[0]["expected_price"])
        self.assertEqual(len({row["sku"] for row in rows}), 2)

    def test_unequal_finishes_do_not_merge(self):
        rows = classify([
            product(
                "CO-65-1",
                "Стол письменный 1-тумб. 0П",
                "country-london-paris",
                ["stoly"],
                metadata={"finish_color_executions": {"cream": {}}},
                variants=[variant("CO-65-1", "37500", executions={"cream": {}})],
            ),
            product(
                "CO-65-2",
                "Стол письменный 1-тумб. П0",
                "country-london-paris",
                ["stoly"],
                metadata={"finish_color_executions": {"blue": {}}},
                variants=[variant("CO-65-2", "37500", executions={"blue": {}})],
            ),
        ])["rows"]
        self.assertEqual({row["decision"] for row in rows}, {"AMBIGUOUS_HOLD"})

    def test_orientation_keys_keep_the_model_stem(self):
        def desk(sku, title):
            return product(
                sku,
                title,
                "oliver",
                ["stoly"],
                metadata={"finish_color_executions": {"oak": {"swatch": "a"}}},
                variants=[variant(sku, "100.50")],
            )
        rows = classify([
            desk("S-1", "Стол малый 0П"),
            desk("S-2", "Стол малый П0"),
            desk("L-1", "Стол большой 0П"),
            desk("L-2", "Стол большой П0"),
        ])["rows"]
        by = {row["sku"]: row for row in rows}
        self.assertEqual(by["S-1"]["family_key"], by["S-2"]["family_key"])
        self.assertNotEqual(by["S-1"]["family_key"], by["L-1"]["family_key"])
        self.assertEqual(by["S-1"]["current_price"], "100.50")
        self.assertEqual(by["S-1"]["expected_price"], "100.50")
        self.assertEqual(by["S-1"]["decision"], "SAFE_VARIANT_FAMILY")

    def test_handle_side_phrase_is_not_a_cross_product_hold(self):
        rows = classify([
            product("OL-00-1", "Шкаф угловой (ручка слева/справа)", "oliver", ["shkafy"]),
            product("OL-08-2", "Тумбочка прикроватная с дверкой (ручка слева/справа)", "oliver", ["tumby"]),
        ])["rows"]
        self.assertEqual({row["decision"] for row in rows}, {"KEEP_SEPARATE_PRODUCTS"})

    def test_mattress_mention_is_not_a_mattress_family(self):
        found = mattress_rows(
            [product("OL-85-2", "Кроватка приставная + матрас", "oliver", ["krovati"])],
            [{"sku_normalized": "OX-14-2", "title": "Комплекс с матрасом", "sheet": "ОКСФОРД", "retail_solid": "1"}],
        )
        self.assertTrue(all(row["decision"] == "NOT_A_MATTRESS" for row in found))
        self.assertEqual(found[1]["medusa_presence"], "absent")


if __name__ == "__main__":
    unittest.main()
