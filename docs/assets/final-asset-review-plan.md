# Final Asset Review Plan

Гайд по manual review для оставшихся unresolved image mappings.

---

## Review Order

| Priority | Queue | Count | Rationale |
|----------|-------|-------|-----------|
| 1 | `pdf_candidate` | 32 | Have specific images, need visual confirmation |
| 2 | `remaining fuzzy` | 52 | Have legacy candidate, need visual comparison |
| 3 | `true missing` | 28 | No candidate at all, need sourcing decision |
| 4 | `disk_candidate` (VV base) | 15 | Have base images, blocked by business decision |
| — | `blocked` (VV no image) | 48 | Cannot proceed until business decides |

---

## Review Process

### Phase 1: PDF Candidates (32 items)

**Input:** `data/normalized/review-queue-pdf-candidates.json`

For each item:
1. Open the referenced PDF page image (in `data/raw/pdf-assets/pages/`)
2. Compare product description in PDF text with workbook `canonical_name`
3. Check if the embedded image on that page clearly shows the listed product

**Confirm** when:
- Product name in PDF text matches workbook name (exact or obvious synonym)
- Image on the page visibly depicts the correct product type
- No competing product on the same page that could be confused

**Reject** when:
- PDF page shows a different product or a multi-product composition where target is unclear
- Product name mismatch (e.g., "Стол 1-тумб." on page but entry is "Стол 2-тумб.")
- Image is a lifestyle/room shot with no identifiable single product

**Result:** Set `review_status` to `confirmed` or `rejected`.

### Phase 2: Fuzzy Matches (52 items)

**Input:** `data/normalized/review-queue-fuzzy.json`

For each item:
1. Open the legacy candidate image URL
2. Compare with workbook `canonical_name` and `product_code_normalized`
3. If `pdf_evidence` exists, cross-reference with the PDF catalog page

**Confirm** when:
- Legacy image clearly shows the exact product (same type, same collection style)
- Product name and image are consistent
- If size variants exist, the image can reasonably represent the product
- PDF cross-reference supports the match

**Reject** when:
- Image shows a clearly different product (wrong type, wrong door count, etc.)
- Names suggest different sub-variants with no visual overlap
- No supporting evidence from any secondary source

**Result:** Set `review_status` to `confirmed` or `rejected`.

### Phase 3: True Missing (28 items)

**Input:** `data/normalized/review-queue-missing.json`

For each item:
1. Note the product type and collection
2. Check if any unmatched disk/legacy/PDF assets could belong to this product
3. Decide: can it be sourced, or is it genuinely unavailable?

**Action options:**
- `deferred` — no image available, skip for first production pass
- `manual_source` — image exists somewhere, needs manual URL/path entry
- `not_needed` — product is a detail/internal part unlikely to need a storefront image

---

## Source Priority

When multiple image sources exist for the same product:

| Priority | Source | Rationale |
|----------|--------|-----------|
| 1 | `disk_verified` (white_bg) | Highest quality, clean product shot |
| 2 | `preferred_main_image` (disk) | White-bg upgrade for already-matched item |
| 3 | `verified` / `promoted` (legacy) | Confirmed match from website scrape |
| 4 | `pdf_candidate` (confirmed) | Catalog image, lower quality than product shot |
| 5 | `fuzzy` (confirmed) | Weaker match, acceptable if confirmed |

---

## Evidence Rules for Confirmation

### Sufficient for confirmation

- Article code match (exact or normalized variant)
- Same collection + same product type + same key descriptor
- Visual match: image clearly shows the described furniture piece
- PDF cross-reference: product name appears on same page as image

### Insufficient — keep as unresolved

- Name overlap is only the product type word (e.g., just "Комод" or "Шкаф")
- Image could be any of several similar products
- No visual confirmation possible (image too small/blurry)
- Size mismatch with no evidence that image represents the product family

---

## Output Format

After review, each item should have:

```json
{
  "review_status": "confirmed | rejected | deferred | not_needed",
  "reviewer_note": "Brief explanation of decision",
  "confirmed_source": "disk_verified | legacy | pdf | null",
  "confirmed_at": "ISO date"
}
```
