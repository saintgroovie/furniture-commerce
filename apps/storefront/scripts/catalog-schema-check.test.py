import importlib.util
import json
import pathlib
import unittest

spec = importlib.util.spec_from_file_location("catalog_check", pathlib.Path(__file__).with_name("catalog-schema-check.py"))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)
URL = "https://woodright.ru/product/bed"
PHOTO = "https://woodright.ru/product-static/new-photo.jpg"
PRODUCT = {"@type": "Product", "name": "Кровать", "sku": "BED-1", "url": URL, "image": [PHOTO],
           "offers": {"price": 70300, "priceCurrency": "RUB", "availability": "https://schema.org/BackOrder"}}


def html(product=PRODUCT, price="70 300 ₽", photo=PHOTO, availability="Изготавливается под заказ"):
    return f'''<link rel="canonical" href="{URL}">
    <script type="application/ld+json">{json.dumps(product)}</script>
    <div class="pdp-media"><img src="{photo}"><div hidden><img src="/old.jpg"></div></div>
    <div class="pdp-panel"><span class="pdp-article">Артикул BED-1</span>
    <p class="product-detail-price"><span><span class="sr-only">Цена сейчас</span>{price}</span>
    <span class="price-sale-was">90 000 ₽</span><span hidden>100 000 ₽</span></p>
    <p>{availability}</p></div>'''


class Regression(unittest.TestCase):
    def test_current_price_and_hero_ignore_hidden_and_old_content(self):
        row = audit.inspect_page(html(), URL)
        self.assertEqual(row["issues"], [])
        self.assertEqual(row["price_rub"], 70300)
        self.assertEqual(row["hero"], PHOTO)
        streamed = '<div hidden id="S:1">' + html() + '</div>'
        self.assertEqual(audit.inspect_page(streamed, URL)["issues"], [])
        # A gallery need not be fully rendered before hydration.
        product = dict(PRODUCT, image=[PHOTO, "https://woodright.ru/product-static/later-photo.jpg"])
        self.assertEqual(audit.inspect_page(html(product), URL)["issues"], [])

    def test_price_photo_and_availability_drift_are_detected(self):
        for content, expected in [(html(price="77 300 ₽"), "visible_price_mismatch"),
                                  (html(photo="/product-static/wrong.jpg"), "hero_mismatch"),
                                  (html(availability="В наличии"), "visible_availability_mismatch"),
                                  (html(dict(PRODUCT, offers=dict(PRODUCT["offers"], priceCurrency="USD"))), "visible_price_mismatch")]:
            self.assertIn(expected, audit.inspect_page(content, URL)["issues"])

    def test_selected_material_cannot_hide_bad_price(self):
        choices = [dict(PRODUCT, url=URL + "?material=ldsp", material="ЛДСП"),
                   dict(PRODUCT, url=URL + "?material=solid", material="Массив", offers=dict(PRODUCT["offers"], price=89900))]
        group = {"@type": "ProductGroup", "hasVariant": choices}
        row = audit.inspect_page(html(group), URL + "?material=solid")
        self.assertIn("visible_price_mismatch", row["issues"])
        self.assertEqual(row["targets"], [c["url"] for c in choices])

    def test_missing_offer_and_unsafe_targets_do_not_become_success(self):
        product = {k: v for k, v in PRODUCT.items() if k != "offers"}
        self.assertIn("no_unambiguous_offer", audit.inspect_page(html(product), URL)["held"])
        self.assertFalse(audit.safe_product_url("https://other.example/product/bed", URL))
        self.assertFalse(audit.safe_product_url(URL + "?redirect=admin", URL))
        self.assertFalse(audit.safe_product_url(URL + "?material=a&material=b", URL))
        self.assertRaises(ValueError, audit.image_url, "https://other.example/photo.jpg", URL)
        self.assertIn("invalid_json_ld", audit.inspect_page('<script type="application/ld+json">{broken}</script>', URL)["issues"])

    def test_variant_only_url_uses_visible_material_without_overriding_explicit_query(self):
        choices = [dict(PRODUCT, url=URL + "?variant=v1&material=ldsp", material="ЛДСП"),
                   dict(PRODUCT, url=URL + "?variant=v1&material=solid", material="Массив",
                        offers=dict(PRODUCT["offers"], price=89900))]
        group = {"@type": "ProductGroup", "hasVariant": choices}
        content = html(group) + '<span class="pdp-material-trigger-value">ЛДСП</span>'
        self.assertEqual(audit.inspect_page(content, URL + "?variant=v1")["issues"], [])
        self.assertIn("visible_price_mismatch", audit.inspect_page(content, URL + "?variant=v1&material=solid")["issues"])
        self.assertIn("ambiguous_selected_variant", audit.inspect_page(content, URL + "?variant=unrelated")["issues"])


if __name__ == "__main__":
    unittest.main()
