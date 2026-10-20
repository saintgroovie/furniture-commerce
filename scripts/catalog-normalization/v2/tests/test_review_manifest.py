import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from catalog_norm.decisions import classify
from catalog_norm.review_manifest import build_manifest, effective_capabilities, manifest_text


def axis(display):
    return {"value": display, "display": display}


def variant(sku, amount, axes=None, capabilities=None):
    metadata = {}
    if axes:
        metadata["variant_axes"] = {key: axis(value) for key, value in axes.items()}
    if capabilities is not None:
        metadata["capabilities"] = capabilities
    return {
        "id": f"variant_{sku}",
        "sku": sku,
        "deleted_at": None,
        "metadata": metadata,
        "prices": [{"amount": amount, "price_list_id": None}],
    }


def product(pid, handle, title, variants, collection="oliver", status="published", metadata=None):
    return {
        "id": pid,
        "handle": handle,
        "title": title,
        "status": status,
        "deleted_at": None,
        "collection_handle": collection,
        "categories": ["krovati"],
        "classification": "CONFIGURABLE",
        "images": ["a.jpg"],
        "metadata": metadata or {},
        "variants": variants,
    }


def catalog():
    bed = product("prod_bed", "ol-14-1", "Кровать Оливер", [
        variant("OL-14-1", "100", {"footboard": "С изножьем", "mattress_size": "90 × 190 см"}),
        variant("OL-16-1", "120", {"footboard": "С изножьем", "mattress_size": "160 × 200 см"}),
        variant("OL-14-2", "90", {"footboard": "Без изножья", "mattress_size": "90 × 190 см"},
                capabilities={"fabric_upholstery_labels": {"lorna": "Lorna"}}),
    ], metadata={"fabric_upholstery_labels": {"lorna": "Lorna", "lillian": "Lilian"}, "material_tiers": {"solid_full": {}}})
    chest = product("prod_chest", "te-05-1", "Комод стандартный Рыцари",
                    [variant("TE-05-1", "50")], collection="willie-winkie", metadata={"motif_slug": "templars"})
    return [bed, chest]


class ReviewManifestTest(unittest.TestCase):
    def test_variant_capabilities_replace_product_defaults(self):
        bed = catalog()[0]
        self.assertEqual(effective_capabilities(bed, bed["variants"][0]),
                         {"fabric_upholstery_labels": ["lillian", "lorna"], "material_tiers": ["solid_full"]})
        self.assertEqual(effective_capabilities(bed, bed["variants"][2]),
                         {"fabric_upholstery_labels": ["lorna"]})

    def test_rejected_combination_is_listed_not_created(self):
        products = catalog()
        manifest = build_manifest(classify(products)["rows"], products)
        self.assertEqual(manifest["sku_rows"], 4)
        self.assertEqual(manifest["rejected_combinations"], 1)
        self.assertEqual(manifest["rejected"][0]["combination"],
                         {"footboard": "Без изножья", "mattress_size": "160 × 200 см"})
        self.assertNotIn("OL-16-2", {entry["sku"] for entry in manifest["skus"]})
        by = {entry["sku"]: entry for entry in manifest["skus"]}
        self.assertEqual(by["OL-14-2"]["variant_key"], "footboard=Без изножья|mattress_size=90 × 190 см")
        self.assertEqual(by["OL-16-1"]["price"], by["OL-16-1"]["expected_price"])
        self.assertEqual(by["TE-05-1"]["motif_title"], "Рыцари")
        self.assertEqual(by["TE-05-1"]["motif_slug"], "templars")
        self.assertEqual(by["OL-14-1"]["motif_title"], "")

    def test_manifest_is_deterministic(self):
        products = catalog()
        first = manifest_text(build_manifest(classify(products)["rows"], products))
        shuffled = list(reversed(products))
        second = manifest_text(build_manifest(list(reversed(classify(shuffled)["rows"])), shuffled))
        self.assertEqual(first, second)


if __name__ == "__main__":
    unittest.main()
