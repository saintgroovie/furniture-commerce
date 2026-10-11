import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from catalog_norm.sparse_apply import align_buyer_public_title


class AlignBuyerPublicTitle(unittest.TestCase):
    def test_missing_public_title_is_not_invented(self):
        meta = {"source_title": "Гардероб 2-дв. с ящиками"}
        self.assertIsNone(align_buyer_public_title(meta, "Гардероб Гринвич"))
        self.assertEqual(meta["source_title"], "Гардероб 2-дв. с ящиками")

    def test_matching_public_title_does_not_write(self):
        meta = {"public_title": "Кровать Оливер"}
        self.assertIsNone(align_buyer_public_title(meta, "Кровать Оливер"))

    def test_only_stale_canonical_name_returns_empty_patch(self):
        meta = {"canonical_name": "Кровать 1-сп. (90*190)"}
        patched = align_buyer_public_title(meta, "Кровать Оливер")
        self.assertEqual(patched, {})
        self.assertIsNotNone(patched)
        survivor = dict(meta) if patched is None else patched
        self.assertEqual(survivor, {})
        self.assertEqual(meta["canonical_name"], "Кровать 1-сп. (90*190)")

    def test_stale_canonical_name_is_removed(self):
        meta = {
            "public_title": "Кровать Оливер",
            "canonical_name": "Кровать 1-сп. (90*190)",
            "source_title": "Кровать 1-сп. (90*190)",
        }
        patched = align_buyer_public_title(meta, "Кровать Оливер")
        self.assertIsNotNone(patched)
        self.assertNotIn("canonical_name", patched)
        self.assertEqual(patched["public_title"], "Кровать Оливер")
        self.assertEqual(patched["source_title"], "Кровать 1-сп. (90*190)")
        self.assertEqual(meta["canonical_name"], "Кровать 1-сп. (90*190)")

    def test_variant_axis_leftover_is_replaced(self):
        cases = [
            (
                "Гардероб 2-дв. с ящиками Level",
                "Гардероб Гринвич",
            ),
            (
                "Прикроватная тумба с 2 ящиками Hole",
                "Прикроватная тумба Гринвич",
            ),
            (
                "Стол письменный двухтумбовый Provence (полки слева, ящики справа)",
                "Стол письменный двухтумбовый Прованс",
            ),
        ]
        for stale, clean in cases:
            meta = {"public_title": stale, "source_title": stale}
            patched = align_buyer_public_title(meta, clean)
            self.assertIsNotNone(patched)
            self.assertEqual(patched["public_title"], clean)
            self.assertEqual(patched["source_title"], stale)
            self.assertEqual(meta["public_title"], stale)


if __name__ == "__main__":
    unittest.main()
