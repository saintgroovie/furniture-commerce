"""Regression checks for React streamed children in the read-only schema audit."""
import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location('catalog_schema_check', pathlib.Path(__file__).with_name('catalog-schema-check.py'))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class StreamedPanelTests(unittest.TestCase):
    def parse(self, body):
        page = audit.Page()
        page.feed(body)
        return page

    def test_relocated_cta_keeps_panel_ancestry(self):
        page = self.parse('<div class="pdp-panel"><template id="P:7"></template></div>'
                          '<div hidden id="S:7"><div><p>Изготавливается в выбранной конфигурации</p></div></div>'
                          '<script>$RS("S:7","P:7")</script><p>Footer must stay outside</p>')
        self.assertIn('Изготавливается в выбранной конфигурации', page.panel)
        self.assertNotIn('Footer must stay outside', page.panel)
        self.assertFalse(page.has('pdp-panel'))

    def test_relocated_price_and_gallery_keep_their_scope(self):
        page = self.parse('<div class="pdp-panel"><div class="product-detail-price"><template id="P:1"></template></div></div>'
                          '<div class="pdp-media"><template id="P:2"></template></div>'
                          '<div hidden id="S:1">134 900 ₽</div><script>$RS("S:1","P:1")</script>'
                          '<div hidden id="S:2"><img src="/product-static/photo.jpg"/></div><script>$RS("S:2","P:2")</script>')
        self.assertEqual(page.price, ['134 900 ₽'])
        self.assertEqual(page.images, ['/product-static/photo.jpg'])

    def test_hidden_original_slot_stays_hidden(self):
        page = self.parse('<div class="pdp-panel" aria-hidden="true"><template id="P:3"></template></div>'
                          '<div hidden id="S:3">Hidden availability</div><script>$RS("S:3","P:3")</script>')
        self.assertNotIn('Hidden availability', page.panel)

    def test_unrelated_segment_does_not_supply_panel_text(self):
        page = self.parse('<div class="pdp-panel"><template id="P:4"></template></div>'
                          '<div hidden id="S:5">Unrelated text</div><script>$RS("S:5","P:6")</script>')
        self.assertNotIn('Unrelated text', page.panel)


if __name__ == '__main__':
    unittest.main()
