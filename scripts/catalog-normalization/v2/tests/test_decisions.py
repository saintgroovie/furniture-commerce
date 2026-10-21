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
        by = {row["sku"]: row for row in rows}
        self.assertNotEqual(by["fk-05-1"]["family_key"], by["pa-05-1"]["family_key"])
        self.assertEqual(by["fk-05-1"]["family_key"], by["fk-05-3"]["family_key"])
        self.assertEqual(by["fk-05-1"]["proposed_clean_title"], "Комод Сказочное королевство")
        self.assertEqual(by["fk-05-1"]["decision"], "SAFE_VARIANT_FAMILY")
        self.assertNotEqual(by["fk-05-1"]["axis_values"]["form"], by["fk-05-3"]["axis_values"]["form"])
        self.assertIn("Полевые цветы", by["pa-05-1"]["proposed_clean_title"])

    def test_willie_unproven_motif_never_merges(self):
        # Albion / Brigantine / character themes are not in motif_of: two paintings
        # must not become one family through an empty motif key.
        result = classify([
            product("al-14-1", "Кровать Albion 90*190", "willie-winkie", ["krovati"],
                    variants=[variant("al-14-1", "1000", (90, 190))]),
            product("brb-14-2", "Кровать Brigantine Blue 120*190", "willie-winkie", ["krovati"],
                    variants=[variant("brb-14-2", "2000", (120, 190))]),
            product("bri-05-1", "Комод стандартный Brigantine Ivory", "willie-winkie", ["komody"]),
            product("al-05-3", "Комод высокий Albion", "willie-winkie", ["komody"]),
            product("av-05-1", "Комод стандартный Деревня муравьев", "willie-winkie", ["komody"]),
            product("mo-02-1", "Шкаф для одежды 2-дв. Молли, высокий", "willie-winkie", ["shkafy"]),
            product("to-02-1", "Шкаф для одежды 2-дв. Томми, высокий", "willie-winkie", ["shkafy"]),
        ])
        rows = result["rows"]
        self.assertEqual(len({row["family_key"] for row in rows}), len(rows))
        for row in rows:
            self.assertEqual(row["decision"], "KEEP_SEPARATE_PRODUCTS", row["sku"])
            self.assertEqual(row["family_key"], f"standalone/{row['sku']}", row["sku"])
        self.assertEqual(result["summary"]["safe_families"], 0)
        self.assertEqual(result["summary"]["rejected_combinations"], 0)
        by = {row["sku"]: row for row in rows}
        # Buyer titles keep the painting name. The two Brigantine themes must
        # not collapse into one Russian label.
        self.assertIn("Albion", by["al-14-1"]["proposed_clean_title"])
        self.assertIn("Brigantine Blue", by["brb-14-2"]["proposed_clean_title"])
        self.assertIn("Brigantine Ivory", by["bri-05-1"]["proposed_clean_title"])
        self.assertNotEqual(
            by["brb-14-2"]["proposed_clean_title"],
            by["bri-05-1"]["proposed_clean_title"],
        )

    def test_willie_known_motif_does_not_absorb_unknown(self):
        rows = classify([
            product("te-05-1", "Комод стандартный Рыцари", "willie-winkie", ["komody"]),
            product("al-05-3", "Комод высокий Albion", "willie-winkie", ["komody"]),
        ])["rows"]
        by = {row["sku"]: row for row in rows}
        self.assertEqual(by["te-05-1"]["family_key"], "willie-winkie/CONFIGURABLE/willie-chest/Рыцари")
        self.assertEqual(by["al-05-3"]["family_key"], "standalone/al-05-3")
        self.assertEqual({row["decision"] for row in rows}, {"KEEP_SEPARATE_PRODUCTS"})

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
        self.assertEqual(by["OL-14-1"]["family_key"], by["OL-14-2"]["family_key"])
        self.assertEqual(by["OL-14-1"]["family_key"], by["OL-15-1"]["family_key"])
        self.assertEqual(by["OL-14-1"]["proposed_clean_title"], "Кровать Оливер")
        self.assertNotIn("90", by["OL-14-1"]["proposed_clean_title"])
        self.assertEqual(by["OL-14-1"]["decision"], "SAFE_VARIANT_FAMILY")
        self.assertEqual(by["OL-14-2"]["axis_values"]["footboard"], "Без изножья")
        self.assertEqual(by["OL-14-1"]["axis_values"]["footboard"], "С изножьем")
        self.assertEqual(by["OL-14-1"]["current_price"], "72900")
        self.assertEqual(by["OL-14-1"]["expected_price"], "72900")
        result = classify([
            product("OL-14-1", "Кровать 1-сп. (90×190)", "oliver", ["krovati"], variants=[variant("OL-14-1", "72900", (90, 190))]),
            product("OL-15-1", "Кровать 1,5-сп. (120×190)", "oliver", ["krovati"], variants=[variant("OL-15-1", "91900", (120, 190))]),
            product("OL-14-2", "Кровать 1-сп. (90×190) без изножья", "oliver", ["krovati"], variants=[variant("OL-14-2", "69900", (90, 190))]),
        ])
        self.assertEqual(result["summary"]["rejected_combinations"], 1)
        from catalog_norm.sparse import family_plans
        plans = family_plans(result["rows"])
        self.assertEqual(len(plans), 1)
        self.assertEqual(sorted(plans[0]["skus"]), ["OL-14-1", "OL-14-2", "OL-15-1"])
        self.assertEqual(len(plans[0]["axes"]), 3)

    def test_unpublished_sku_is_not_merged(self):
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
                status="draft",
                variants=[variant("OL-15-1", "91900", (120, 190))],
            ),
        ])["rows"]
        by = {row["sku"]: row for row in rows}
        self.assertEqual(by["OL-15-1"]["decision"], "KEEP_SEPARATE_PRODUCTS")
        self.assertNotEqual(by["OL-14-1"]["decision"], "SAFE_VARIANT_FAMILY")
        self.assertNotEqual(by["OL-14-1"]["family_key"], by["OL-15-1"]["family_key"])

    def test_shared_footboard_stays_in_the_title(self):
        rows = classify([
            product("PV-14-1", "Кровать 1-сп. (90×190) без изножья", "provence", ["krovati"], variants=[variant("PV-14-1", "1", (90, 190))]),
            product("PV-15-1", "Кровать 1,5-сп. (120×190) без изножья", "provence", ["krovati"], variants=[variant("PV-15-1", "2", (120, 190))]),
        ])["rows"]
        self.assertEqual(rows[0]["proposed_clean_title"], "Кровать Прованс без изножья")
        self.assertNotIn("footboard", rows[0]["variant_axis"])

    def test_chest_width_and_shelving_are_sparse(self):
        rows = classify([
            product("OL-05-1", "Комод стандартный", "oliver", ["komody"]),
            product("OL-05-2", "Комод широкий", "oliver", ["komody"]),
            product("CO-62-1", "Стеллаж широкий", "country-london-paris", ["stellazhi"]),
            product("CO-62-2", "Стеллаж узкий с дверью", "country-london-paris", ["stellazhi"]),
            product("CO-62-3", "Стеллаж узкий с ящиком", "country-london-paris", ["stellazhi"]),
            product("OL-62-1", "Стеллаж для книг", "oliver", ["stellazhi"]),
        ])["rows"]
        by = {row["sku"]: row for row in rows}
        self.assertEqual(by["OL-05-1"]["decision"], "SAFE_VARIANT_FAMILY")
        self.assertEqual(by["OL-05-1"]["proposed_clean_title"], "Комод Оливер")
        self.assertEqual(by["OL-05-1"]["family_key"], by["OL-05-2"]["family_key"])
        self.assertEqual(by["CO-62-1"]["proposed_clean_title"], "Стеллаж Кантри")
        self.assertEqual(len({by[sku]["family_key"] for sku in ("CO-62-1", "CO-62-2", "CO-62-3")}), 1)
        self.assertEqual(by["OL-62-1"]["decision"], "KEEP_SEPARATE_PRODUCTS")

    def test_shelf_tier_uses_russian_count(self):
        rows = classify([
            product("OL-69-1", "Полка книжная 1-ярусная", "oliver", ["stellazhi"]),
            product("OL-69-2", "Полка книжная 2-ярусная", "oliver", ["stellazhi"]),
        ])["rows"]
        by = {row["sku"]: row for row in rows}
        self.assertEqual(by["OL-69-1"]["axis_values"]["tiers"], "1 ярус")
        self.assertEqual(by["OL-69-2"]["axis_values"]["tiers"], "2 яруса")

    def test_unknown_mattress_is_a_hold(self):
        rows = classify([
            product("OL-85-2", "Кроватка приставная + матрас", "oliver", ["krovati"]),
        ])["rows"]
        self.assertEqual(rows[0]["decision"], "KEEP_SEPARATE_PRODUCTS")
        self.assertEqual(rows[0]["mattress_width_cm"], "")
        self.assertIn("MATTRESS_SIZE_UNKNOWN", rows[0]["blocker"])
        self.assertNotEqual(rows[0]["family_key"], "merged-with-newborn")

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
        by = {row["sku"]: row for row in rows}
        self.assertEqual({row["decision"] for row in rows}, {"ALREADY_APPLIED"})
        self.assertEqual(rows[0]["current_price"], rows[0]["expected_price"])
        self.assertEqual(len(by), 2)
        self.assertEqual(by["GR-09-1"]["mattress_width_cm"], 90)
        self.assertEqual(by["GR-18-1"]["mattress_width_cm"], 180)
        self.assertEqual(by["GR-18-1"]["axis_values"]["mattress_size"], "180 × 200 см")

    def test_applied_rows_keep_each_variant_size(self):
        merged = product(
            "CO-14-2",
            "Кровать Кантри с подъёмным механизмом",
            "country-london-paris",
            ["krovati"],
            variants=[
                variant("CO-14-2", "100", (90, 190)),
                variant("CO-15-2", "200", (120, 190)),
            ],
        )
        for item, width in zip(merged["variants"], (90, 120)):
            item["metadata"]["variant_axes"] = {
                "mattress_size": {
                    "label": "Размер спального места",
                    "display": f"{width} × 190 см",
                    "sort": width,
                }
            }
        rows = classify([merged])["rows"]
        by = {row["sku"]: row for row in rows}
        self.assertEqual(by["CO-14-2"]["mattress_width_cm"], 90)
        self.assertEqual(by["CO-15-2"]["mattress_width_cm"], 120)
        self.assertEqual(by["CO-14-2"]["axis_values"]["mattress_size"], "90 × 190 см")
        self.assertEqual(by["CO-15-2"]["axis_values"]["mattress_size"], "120 × 190 см")

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
        self.assertEqual({row["decision"] for row in rows}, {"SAFE_VARIANT_FAMILY"})
        self.assertEqual(rows[0]["proposed_clean_title"], rows[1]["proposed_clean_title"])
        self.assertNotEqual(rows[0]["axis_values"]["side"], rows[1]["axis_values"]["side"])

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
        self.assertEqual(by["S-1"]["family_key"], by["L-1"]["family_key"])
        self.assertEqual(by["S-1"]["axis_values"]["size"], "Малый")
        self.assertEqual(by["L-1"]["axis_values"]["size"], "Большой")
        self.assertNotEqual(by["S-1"]["axis_values"]["side"], by["S-2"]["axis_values"]["side"])
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
