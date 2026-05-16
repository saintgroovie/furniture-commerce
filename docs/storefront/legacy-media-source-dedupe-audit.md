# Legacy media source dedupe audit

Generated: 2026-05-16T22:53:34.701Z

## Source availability

| Source | Available |
|--------|-----------|
| legacy-media-inventory.json | true (3439 items) |
| legacy-media-board-products.json | true (194 products) |
| product-workbook-asset-map | true |
| retail-price-current.xlsx | true |

## Yandex white-background roots

- `/WOODRIGHT/Контент /Фото на белом фоне` — not mounted
- `/Users/leonidmbp/Yandex.Disk/WOODRIGHT/Контент /Фото на белом фоне` — not mounted
- `/Users/leonidmbp/Yandex Disk/WOODRIGHT/Контент /Фото на белом фоне` — not mounted

## SKU crosswalk

- Board SKUs: **194**
- Price list / workbook SKUs: **145**
- Inventory SKUs: **678**
- Matched (board ∩ price ∩ inventory): **4**
- Inventory not in price list: **659**
- Price list without inventory media: **126**
- Board without price list: **108**

## Duplicate summary

- duplicate_group_key groups with 2+ items: **642**
- content_quick_hash+basename groups with 2+: **1069**
- normalized basename groups with 2+: **1070**

### Top duplicate-heavy SKUs

- `ol-23-1`: 26 multi-item groups (78 inventory rows)
- `gr-26-1`: 25 multi-item groups (75 inventory rows)
- `gr-02-1`: 23 multi-item groups (69 inventory rows)
- `gr-08-2`: 22 multi-item groups (66 inventory rows)
- `gr-08-1`: 21 multi-item groups (63 inventory rows)
- `gr-67-1`: 21 multi-item groups (63 inventory rows)
- `gr-02-2`: 20 multi-item groups (60 inventory rows)
- `gr-44-1`: 20 multi-item groups (60 inventory rows)
- `gr-05-1`: 16 multi-item groups (48 inventory rows)
- `co-62-1`: 10 multi-item groups (30 inventory rows)
- `co-65-1`: 10 multi-item groups (30 inventory rows)
- `co-02-1`: 9 multi-item groups (27 inventory rows)

## Board changes

Legacy Media Assignment Board groups suggestions per SKU+color, dedupes exact/near duplicates via duplicate_group_key/content_quick_hash/basename, picks canonical white-bg/previewable primary, hides duplicates from card strip (Details only).

## Manual follow-ups

- SKUs in inventory but not in price list need workbook row or naming fix.
- Mounted Yandex roots: verify white-bg files are linked in inventory on next inventory rebuild (out of scope here).
- possible_duplicate near-matches still require human review in Details.

Full JSON: `data/normalized/legacy-media-source-dedupe-audit.json`
