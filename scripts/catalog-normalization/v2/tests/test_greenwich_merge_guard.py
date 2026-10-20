import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from catalog_norm.beds_greenwich_merge import merge_allowed


def row(sku, width, finish="same", images=None, classification="STANDARD", price="1", orders=0):
    return {
        "sku": sku,
        "metadata": {
            "fabric_upholstery_executions": finish,
            "upholstery_color_executions": finish,
            "frame_material_executions": finish,
            "headboard_model_executions": finish,
            "finish_color_executions": finish,
            "paint_finish_executions": finish,
        },
        "image_urls": images or ["a", "b"],
        "classification": classification,
        "status": "published",
        "dimensions": {"height_mm": 1050, "width_mm": width, "depth_mm": 2207},
        "base_amount": price,
        "orders": orders,
    }


SKUS = [
    ("GR-09-1", 1030, "71900"),
    ("GR-12-1", 1330, "81100"),
    ("GR-14-1", 1530, "89700"),
    ("GR-16-1", 1730, "94000"),
    ("GR-18-1", 1930, "110400"),
]


def greenwich():
    return [row(sku, width, price=price) for sku, width, price in SKUS]


class GreenwichMergeGuardTest(unittest.TestCase):
    def test_identical_greenwich_may_merge(self):
        self.assertEqual(merge_allowed(greenwich()), [])

    def test_different_finish_blocks_merge(self):
        rows = greenwich()
        rows[1] = row("GR-12-1", 1330, finish="other", price="81100")
        self.assertIn("finish payloads differ", merge_allowed(rows))

    def test_orders_block_merge(self):
        rows = greenwich()
        rows[0]["orders"] = 1
        self.assertIn("order lines exist", merge_allowed(rows))

    def test_paint_finish_blocks_merge(self):
        rows = greenwich()
        rows[2]["metadata"]["paint_finish_executions"] = {"red": 1}
        self.assertIn("finish payloads differ", merge_allowed(rows))

    def test_non_standard_blocks_merge(self):
        rows = greenwich()
        rows[0]["classification"] = "CONFIGURABLE"
        self.assertIn("classification is not STANDARD", merge_allowed(rows))


if __name__ == "__main__":
    unittest.main()
