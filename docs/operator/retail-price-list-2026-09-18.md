# Retail price list 18.09.2026

**Role:** internal operator ingest. Not buyer-facing copy. Not a Medusa apply. Not website commercial SoT.

**Status:** `INTERNAL_RETAIL_PRICE_WORKBOOK_INGESTED_2026_09_18`

**Do not** publish these numbers to the storefront, and **do not** treat the special-order «45 рабочих дней» as a public lead time (`SITE_COMMERCIAL_SERVICE_SOT.md`).

## Source

| Field | Value |
|---|---|
| Owner file | `Розничный Прайс 18.09.2026.xlsx` |
| SHA-256 | `55f37ab0a987e271e63f0784bfe2457a7b4e0bcbd4083745b93b07b2838d957c` |
| Bytes | 179062 |
| Filename date | 2026-09-18 |
| Oliver sheet header date | 2026-09-19 |
| Private copy (not git) | local operator folder; xlsx binary stays outside git |
| Public Yandex Disk (owner) | `https://disk.yandex.ru/d/I6hrlYyDxZXiTw` |
| Seller line in workbook | ООО «Роэл-Техник» (same seller as OD-01; INN/OGRN already in legal packet, not repeated here) |

Macros were not executed. Displayed values (`data_only=True`).

## What this workbook is

Current factory retail grid by collection. Quantity columns are an order form (all sampled qty = 0). Several sheets carry finish overlays on one body SKU:

- Oliver: solid + black gloss BI (+15%) + LDSP where not `НЕТ`
- Greenwich / Monchelsea: solid + LDSP
- Willie Winkie: motif price categories 1 / 2 / 3 + LDSP column 4; body codes without motif prefix (`55-1`, not `BA-55-1`)
- Provence: white / dark
- Country / London / Paris: three finish prices on `CO-*` codes
- Princess Rose: workbook `PR-*` is Princess Rose. Live demo `PV-*` is Provence. **No global `PR→PV`.**

## Counts

| Metric | N |
|---|---:|
| Sheets | 11 |
| Product / part / accessory rows parsed | 402 |
| Rows with a solid/base RUB price | 381 |
| Unique `sku_normalized` | 400 |
| Duplicate normalized SKU | 2 |
| Special-order rows | 34 |
| Live demo merchandising SKU (2026-09-19 scrape) | 117 |
| Usable identity rows (exact + split handles + WW bodies on demo) | 115 |
| Princess Rose rows with same number as live Provence (do not map) | 19 |

### By collection

| Collection | Rows | With base price | Usable catalog identity |
|---|---:|---:|---|
| Oliver | 69 | 69 | 59 |
| Parts | 66 | 47 | 0 |
| Monchelsea | 63 | 63 | 0 |
| Willie Winkie | 59 | 59 | 2 |
| Provence | 35 | 35 | 26 |
| Princess Rose | 34 | 34 | 0 |
| Country / London / Paris | 30 | 28 | 13 |
| Oxford | 23 | 23 | 0 |
| Greenwich | 15 | 15 | 15 |
| Accessories | 8 | 8 | 0 |

Hard rule: workbook `PR-*` = Princess Rose; live `PV-*` = Provence; no global `PR→PV`. Same numbers are `CROSS_COLLECTION_DO_NOT_MAP`, not substitutes. `MNm→MNM` is case-normalize only.

Willie Winkie body codes do not equal live motif SKUs (`BA-05-3` vs price body `05-3`). Only bodies present on demo (`05-3`, `67-1`) are usable identity.

Live demo merchandising (117 SKU, scrape 2026-09-19): every demo SKU has a workbook identity via exact SKU, already-split handles, or WW motif-prefix + body. That is coverage of identity, not a price apply. See `catalog-reconciliation.md`.

## Known SKU collisions in the workbook

Do not merge these. Same code, different products:

| Code | Row A | Row B |
|---|---|---|
| `OL-08-1` | Зеркало навесное овальное · 19 950 ₽ | Тумбочка прикроватная · 34 950 ₽ |
| `GR-09-1` | Зеркало навесное · 28 400 ₽ | Кровать 1-сп. (90×200) · 71 900 ₽ |

## Special order (INTERNAL)

Sheet `Спецзаказ` mixes **multipliers** (0.7 … 1.4) and **absolute RUB** rows. Repeated cell «45 рабочих дней» is workbook operations text. It is **not** authorized website copy and is **not** a universal public lead time.

See `special-order.csv`.

## Files in this folder

- `rows.csv` - normalized product/part/accessory rows
- `special-order.csv` - multipliers and special SKUs
- `summary.json` - machine counts
- `catalog-reconciliation.md` / `.csv` - identity map vs live 117
- `catalog-coverage.csv` - every live demo SKU
- `catalog-split-handles.csv` - `OL-08-1` / `GR-09-1` live handles

## Catalog mapping (2026-09-21)

See `retail-price-list-2026-09-18/catalog-reconciliation.md`.

Usable identity rows: 115. Live `PV-*` = Provence. Princess Rose `PR-*` must not map onto `PV-*`. Collisions `OL-08-1` / `GR-09-1` follow already-split live handles.

## Safety

- No Medusa price write
- No demo / production mutation
- xlsx binary is **not** in git
- No global `PR→PV`
