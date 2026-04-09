# PDF Extraction Strategy

Стратегия извлечения visual assets из PDF-каталогов Woodright как fallback source.

---

## Priority PDFs

| PDF | Collection | Missing | Fuzzy | Priority |
|-----|-----------|---------|-------|----------|
| Oxford.pdf / Oxford_full.pdf | oxford | 23 | 0 | **1 (critical)** |
| Country.pdf | country-london-paris | 25 | 1 | **2** |
| London.pdf | country-london-paris | (shared) | — | **2** |
| Greenwich.pdf | greenwich | 5 | 7 | **3** |
| Monchelsea.pdf | monchelsea | 3 | 28 | **4** |
| Princess Rose.pdf | princess-rose | 5 | 9 | **5** |
| Oliver.pdf | oliver | 4 | 6 | **6** |
| Provence White.pdf | provence | 1 | 7 | **7** |

---

## Extraction Modes

### Mode 1: Embedded Image Extraction

- Extract images directly embedded in PDF using PyMuPDF `page.get_images()`
- Reconstruct as PNG/JPEG from raw pixel data
- **Pros:** Original resolution, clean product shots if catalog uses cutout images
- **Cons:** May include logos, backgrounds, decorative elements alongside products
- **Filter:** Only extract images ≥ 200×200 pixels (skip icons, bullets, small decorations)
- **Asset kind:** `product_candidate` (needs review) or `catalog_element` (if too small/decorative)

### Mode 2: Page Rendering

- Render each PDF page as a high-resolution image (300 DPI)
- **Pros:** Captures full page layout including products that span the page
- **Cons:** Not product-level — full catalog page with multiple products, text, backgrounds
- **Asset kind:** `catalog_page`
- **Use:** Reference for manual matching; not usable as product_main without cropping

### Text Extraction

- Extract text from each page using `page.get_text()`
- Look for product names, article codes, collection identifiers
- Use as matching hint — not as definitive mapping

---

## Asset Marking

| Kind | Description | Storefront Use |
|------|-------------|---------------|
| `product_candidate` | Large embedded image likely showing a product | Potential product_main after review |
| `catalog_page` | Full rendered page | Reference only |
| `collection_visual` | Lifestyle/room shot from catalog | Interior images |
| `catalog_element` | Logo, icon, background, small graphic | Not usable |

---

## Confidence Rules for PDF Assets

| Scenario | Confidence | Status |
|----------|-----------|--------|
| Embedded image with article code in page text | 0.7 | `pdf_candidate` |
| Embedded image with product name in page text | 0.6 | `pdf_candidate` |
| Large embedded image, no text match | 0.4 | `pdf_candidate` |
| Rendered page, collection-level only | 0.3 | `catalog_page` |
| Small or decorative element | 0.1 | `catalog_element` |

PDF images are NEVER auto-promoted to `verified` — they are `pdf_candidate` until human review.

---

## Quality Considerations

- Embedded images: native resolution (varies, typically 300-600 DPI for print catalogs)
- Rendered pages: controlled at 300 DPI (good for reference, overkill for web)
- PDF compression may introduce JPEG artifacts in embedded images
- Some PDFs use vector graphics — these render cleanly at any resolution
- Color profiles may differ from web sRGB

---

## Output Structure

```
data/raw/pdf-assets/
├── source-pdfs/          # Downloaded PDFs
├── extracted/            # Embedded images (per PDF subfolder)
│   ├── Oxford/
│   ├── Country/
│   └── ...
├── pages/                # Rendered page images (per PDF subfolder)
│   ├── Oxford/
│   └── ...
└── manifests/            # JSON metadata
    ├── pdf-asset-manifest.json
    ├── pdf-asset-summary.json
    └── pdf-extraction-warnings.json
```
