import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from catalog_norm.description_fidelity import classify_family_description
from catalog_norm.description_normalize import propose_family_description, propose_family_subtitle


OLIVER = [
    {"sku": "OL-14-2", "mattress": "90 × 190 см", "axes": {"mattress_size": "90 × 190 см", "footboard": "Без изножья"}, "dimensions": {"width_mm": 990, "depth_mm": 2030, "height_mm": 1150}},
    {"sku": "OL-15-1", "mattress": "120 × 190 см", "axes": {"mattress_size": "120 × 190 см", "footboard": "С изножьем"}, "dimensions": {"width_mm": 1290, "depth_mm": 2030, "height_mm": 1150}},
]

DESK = [
    {"sku": "CO-65-2", "mattress": "", "axes": {"side": "Слева"}, "dimensions": {"width_mm": 1132, "depth_mm": 640, "height_mm": 780}},
    {"sku": "CO-65-1", "mattress": "", "axes": {"side": "Справа"}, "dimensions": {"width_mm": 1132, "depth_mm": 640, "height_mm": 780}},
]


class DescriptionNormalizeTest(unittest.TestCase):
    def test_oliver_drops_one_sku_size_and_footboard(self):
        source = (
            "Односпальная кровать Oliver под матрас 90 × 190 см: ширина корпуса 99 см. "
            "Обивка выбирается из двух тканей - Lorna или Lillian. "
            "Есть версия без изножья, если проход совсем узкий. "
            "Есть варианты исполнения - уточним в заявке"
        )
        proposed = propose_family_description(source, "Кровать Оливер", OLIVER)
        self.assertEqual(proposed["action"], "REWRITE_FAMILY_SAFE")
        text = proposed["proposed_description"]
        self.assertNotIn("90", text)
        self.assertNotIn("изнож", text.lower())
        self.assertNotIn("узк", text.lower())
        self.assertIn("Lorna", text)
        cleared = propose_family_subtitle(
            "Односпальная кровать Oliver под матрас 90 × 190 см с тканевым изголовьем.",
            OLIVER,
        )
        self.assertEqual(cleared["action"], "CLEAR_VARIANT_SPECIFIC")
        self.assertEqual(cleared["proposed_subtitle"], "")
        verdict = classify_family_description(text, OLIVER)
        self.assertEqual(verdict["classification"], "FAMILY_SAFE")

    def test_side_words_are_not_family_facts(self):
        source = (
            "Письменный стол с тумбой справа. "
            "Открытая левая сторона оставляет посадку свободной. "
            "Пять цветов на выбор. "
            "Есть варианты исполнения - уточним в заявке"
        )
        hold = classify_family_description(source, DESK)
        self.assertEqual(hold["classification"], "VARIANT_SPECIFIC")
        proposed = propose_family_description(source, "Стол письменный Кантри", DESK)
        text = proposed["proposed_description"]
        self.assertNotIn("справа", text)
        self.assertNotIn("левая", text)
        self.assertIn("Пять цветов", text)
        self.assertEqual(classify_family_description(text, DESK)["classification"], "FAMILY_SAFE")

    def test_willie_title_keeps_the_motif(self):
        variants = [
            {"sku": "PA-05-1", "mattress": "", "axes": {"form": "Стандартный"}, "dimensions": {"depth_mm": 440}},
            {"sku": "PA-05-3", "mattress": "", "axes": {"form": "Высокий"}, "dimensions": {"depth_mm": 500}},
        ]
        source = "Стандартный комод серии Pastoral. Есть варианты исполнения - уточним в заявке"
        proposed = propose_family_description(source, "Комод Полевые цветы", variants)
        self.assertIn("Полевые цветы", proposed["proposed_description"])
        self.assertNotIn("Стандартный", proposed["proposed_description"])
        self.assertEqual(
            classify_family_description(proposed["proposed_description"], variants)["classification"],
            "FAMILY_SAFE",
        )

    def test_shared_mattress_stays_when_only_fabric_differs(self):
        variants = [
            {"sku": "OL-95-1", "mattress": "80 × 150 см", "axes": {"fabric": "С рисунком", "mattress_size": "80 × 150 см"}, "dimensions": {"width_mm": 910, "depth_mm": 1810, "height_mm": 1180}},
            {"sku": "OL-95-3", "mattress": "80 × 150 см", "axes": {"fabric": "С тканью", "mattress_size": "80 × 150 см"}, "dimensions": {"width_mm": 910, "depth_mm": 1810, "height_mm": 1180}},
        ]
        source = (
            "Кровать-трансформер под матрас 80 × 150 см. "
            "Спинку украшает рисунок, парная модель с тканевой вставкой выглядит спокойнее. "
            "Есть варианты исполнения - уточним в заявке"
        )
        proposed = propose_family_description(source, "Кровать-трансформер Оливер", variants)
        self.assertIn("80 × 150", proposed["proposed_description"])
        self.assertNotIn("рисунок", proposed["proposed_description"].lower())
        self.assertEqual(
            classify_family_description(proposed["proposed_description"], variants)["classification"],
            "FAMILY_SAFE",
        )


if __name__ == "__main__":
    unittest.main()
