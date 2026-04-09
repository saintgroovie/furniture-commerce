# Asset Upload Readiness Report

Оценка готовности к upload и переходу к entity mapping / seed generation.

---

## Upload-Ready Assets

| Metric | Value |
|--------|-------|
| Total files in upload manifest | **441** |
| Unique products | 108 |
| Products with main image | 93 |
| Total size | 20.2 MB |
| Quality: ok | 413 (94%) |
| Quality: caveated | 28 (6%) |
| Duplicate storage keys | 0 |

### Per Collection

| Collection | Main | Gallery | Color | Total |
|-----------|------|---------|-------|-------|
| Oliver | 51 | 111 | 120 | 282 |
| Provence | 29 | 41 | 0 | 70 |
| Country-London-Paris | 13 | 26 | 50 | 89 |
| **Total** | **93** | **178** | **170** | **441** |

---

## Products Fully Ready After Upload

**81 products** are fully ready (quality: `ok`) — no caveats, high-quality disk white-bg sources.

**28 products** are ready with caveats:

| Caveat | Count | Severity |
|--------|-------|----------|
| Gallery-only (no dedicated main) | 21 | Low — first gallery image as main |
| Legacy fallback (not white-bg) | 5 | Low — acceptable quality |
| Low resolution temporary | 1 | Medium — PV-14-1 (522×532) |
| Needs reshoot | 1 | High — PV-68-1 (225×287) |

---

## Blockers Before seed.ts

| Blocker | Type | Status |
|---------|------|--------|
| **Choose storage backend** | Decision | Medusa local (MVP) or S3 (production) |
| **Upload processed files** | Execution | 441 files, ~20MB, simple copy or sync |
| **Verify public URL accessibility** | Verification | Test one URL end-to-end |
| **Build entity mapping** | Development | Workbook → Medusa Product/Variant/Collection |
| **Write seed.ts** | Development | Uses binding + URL mapping as input |

### Non-Blocking (Can Happen Later)

| Item | Impact |
|------|--------|
| 58 products without assets | Expandable later |
| VV business decision (48+ items) | Separate batch |
| PV-68-1 reshoot | Replace image after reshoot |
| Oxford/Greenwich/Accessories | Future expansion |

---

## Is Entity Mapping the Next Correct Step?

**Yes**, with one prerequisite: storage backend must be chosen first.

### Reasoning

1. Upload manifest is built (441 files, storage keys defined)
2. Binding layer maps products → assets with quality flags
3. Workbook data provides all commercial fields (price, dimensions, category)
4. What's missing: **how workbook products map to Medusa entities**

### Entity Mapping Will Define

| Workbook concept | Medusa entity |
|-----------------|---------------|
| Collection (Oliver, Provence, ...) | `ProductCollection` |
| Category (Шкафы, Кровати, ...) | `ProductCategory` |
| Product (OL-01-2 Шкаф для одежды) | `Product` |
| Size/variant | `ProductVariant` |
| Color variant images | Variant-level images or options |
| Price | `MoneyAmount` on variant |
| Main image | `Product.images[0]` (thumbnail) |
| Gallery images | `Product.images[1..N]` |

---

## Recommended Execution Order

```
1. Choose storage backend (decision — 5 min)
       ↓
2. Upload 441 files to chosen storage (execution — 10 min)
       ↓
3. Verify public URLs work (test — 5 min)
       ↓
4. Build entity mapping layer (development — 4-8 hours)
       ↓
5. Generate seed.ts (development — 4-8 hours)
       ↓
6. Run seed, verify in Admin + Storefront
```

**Estimated total: 1-2 working days** from storage choice to first seeded catalog.

---

## Files Created

| File | Purpose |
|------|---------|
| `docs/assets/asset-storage-strategy.md` | Storage options and recommendation |
| `docs/assets/asset-url-mapping-notes.md` | URL mapping chain documentation |
| `docs/reports/assets/asset-upload-readiness-report.md` | This report |
| `data/normalized/asset-upload-manifest.schema.json` | Upload manifest schema |
| `data/normalized/asset-upload-manifest.json` | 441 upload-ready entries |
| `data/normalized/asset-upload-manifest-summary.json` | Manifest summary stats |
