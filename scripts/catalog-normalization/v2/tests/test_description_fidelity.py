import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from catalog_norm.description_fidelity import classify_family_description, title_problem


def sku(code, mattress=None, **dims):
    return {"sku": code, "mattress": mattress, "axes": {}, "dimensions": dims}


class DescriptionFidelityTest(unittest.TestCase):
    def test_shared_nightstand_copy_is_family_safe(self):
        result = classify_family_description(
            "Тумбочка прикроватная. Есть варианты исполнения - уточним в заявке",
            [
                {"sku": "OL-08-1", "mattress": "", "axes": {"door": "Без дверки"}, "dimensions": {}},
                {"sku": "OL-08-2", "mattress": "", "axes": {"door": "С дверкой"}, "dimensions": {}},
            ],
        )
        self.assertEqual(result["classification"], "FAMILY_SAFE")
        self.assertEqual(result["disposition"], "safe")

    def test_oliver_size_sentence_is_a_hold(self):
        result = classify_family_description(
            "Односпальная кровать Oliver под матрас 90 × 190 см: ширина корпуса 99 см.",
            [
                {"sku": "OL-14-1", "mattress": "90 × 190 см", "axes": {"mattress_size": "90 × 190 см"}, "dimensions": {"width_mm": 990}},
                {"sku": "OL-15-1", "mattress": "120 × 190 см", "axes": {"mattress_size": "120 × 190 см"}, "dimensions": {"width_mm": 1290}},
            ],
        )
        self.assertEqual(result["classification"], "VARIANT_SPECIFIC")
        self.assertEqual(result["disposition"], "DESCRIPTION_VARIANT_SPECIFIC_HOLD")
        self.assertEqual(result["source_sku"], "OL-14-1")
        self.assertIn("90x190", result["claims"])

    def test_shared_body_size_is_not_a_claim(self):
        variants = [
            {"sku": "OL-95-1", "mattress": "80 × 150 см", "axes": {"fabric": "С рисунком"}, "dimensions": {"width_mm": 906, "depth_mm": 1806, "height_mm": 1179}},
            {"sku": "OL-95-3", "mattress": "80 × 150 см", "axes": {"fabric": "С тканью"}, "dimensions": {"width_mm": 906, "depth_mm": 1806, "height_mm": 1179}},
        ]
        result = classify_family_description(
            "Кровать под матрас 80 × 150 см. Спинку украшает рисунок. Корпус 91 × 181 см.",
            variants,
        )
        self.assertEqual(result["classification"], "VARIANT_SPECIFIC")
        self.assertNotIn("80x150", result["claims"])
        self.assertNotIn("91x181", result["claims"])
        self.assertIn("fabric", result["claims"])

    def test_empty(self):
        result = classify_family_description("", [sku("OL-08-1")])
        self.assertEqual(result["classification"], "EMPTY")

    def test_clean_title_keeps_a_shared_construction_phrase(self):
        variants = [
            {"sku": "PV-14-1", "axes": {"mattress_size": "90 × 190 см"}},
            {"sku": "PV-18-1", "axes": {"mattress_size": "180 × 200 см"}},
        ]
        self.assertEqual(title_problem("Кровать Прованс без изножья", variants), "")
        self.assertEqual(title_problem("Кровать Оливер 90 × 190", variants), "size or sku in title")


if __name__ == "__main__":
    unittest.main()
