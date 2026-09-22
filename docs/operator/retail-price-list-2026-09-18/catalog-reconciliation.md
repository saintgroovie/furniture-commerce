# Price list ↔ live catalog reconciliation

**Role:** mapping only. Not a Medusa apply. Not website price publication.

**Catalog SoT:** live Timeweb demo merchandising, scrape 2026-09-19 (117 SKU) plus catalog handles that already split workbook collisions.

**Price source:** `Розничный Прайс 18.09.2026.xlsx`

## Verdict counts (price rows)

| Verdict | N | Meaning |
|---|---:|---|
| `MATCH_EXACT` | 109 | Same SKU is a live PDP |
| `MATCH_SPLIT_HANDLE` | 4 | Workbook reused a SKU; live site already split handles |
| `MATCH_WW_MOTIF_BODY` | 2 | WW body code maps to live motif SKU(s) |
| `CROSS_COLLECTION_DO_NOT_MAP` | 19 | Princess Rose `PR-*` vs live Provence `PV-*` same number |
| `NO_CATALOG` | 268 | Not on current live demo |

Usable for a future price apply (identity only): **115** rows.

## Hard rules confirmed by this pass

1. Live `PV-*` is **Provence** (media folder `provence/`). Map workbook sheet `ПРОВАНС`, not `ПРИНЦЕССА РОЗА`.
2. Princess Rose `PR-*` is **not** in the current 117. Same numbers as Provence are **not** substitutes (`NO CROSS-COLLECTION`).
3. `OL-08-1` and `GR-09-1` collisions are already split in the catalog:
   - `ol-08-1` = тумбочка
   - `ol-08-1-mirror` = овальное зеркало
   - `greenwich-gr-09-1-mirror` = зеркало
   - `greenwich-gr-09-1-bed-90` = кровать 90×200
   - bare `greenwich-gr-09-1` is a 404
4. Country `CO-*` is one live SKU with color media. Workbook London/Paris columns are finish overlays, not extra SKUs.
5. Oliver BI +15% and LDSP are options on the same live SKU, not extra products.
6. Sampled live ₽ on demo are **not** the workbook list price (likely promo). Do not overwrite demo from this file without a separate apply decision.

## Live demo coverage (117 SKU)

| Coverage verdict | N |
|---|---:|
| `MATCH_EXACT` | 109 |
| `SPLIT_ON_CATALOG` | 2 |
| `MATCH_WW_MOTIF_BODY` | 6 |
| `UNMATCHED` | 0 |

UNMATCHED live SKUs: 0
- none

## By workbook collection

### Accessories

| Verdict | N |
|---|---:|
| `NO_CATALOG` | 8 |

### Country / London / Paris

| Verdict | N |
|---|---:|
| `NO_CATALOG` | 17 |
| `MATCH_EXACT` | 13 |

### Greenwich

| Verdict | N |
|---|---:|
| `MATCH_EXACT` | 13 |
| `MATCH_SPLIT_HANDLE` | 2 |

### Monchelsea

| Verdict | N |
|---|---:|
| `NO_CATALOG` | 63 |

### Oliver

| Verdict | N |
|---|---:|
| `MATCH_EXACT` | 57 |
| `NO_CATALOG` | 10 |
| `MATCH_SPLIT_HANDLE` | 2 |

### Oxford

| Verdict | N |
|---|---:|
| `NO_CATALOG` | 23 |

### Parts

| Verdict | N |
|---|---:|
| `NO_CATALOG` | 66 |

### Princess Rose

| Verdict | N |
|---|---:|
| `CROSS_COLLECTION_DO_NOT_MAP` | 19 |
| `NO_CATALOG` | 15 |

### Provence

| Verdict | N |
|---|---:|
| `MATCH_EXACT` | 26 |
| `NO_CATALOG` | 9 |

### Willie Winkie

| Verdict | N |
|---|---:|
| `NO_CATALOG` | 57 |
| `MATCH_WW_MOTIF_BODY` | 2 |

## What can be related now (identity)

Exact live SKU + split handles + WW bodies that exist on demo: **115** workbook rows.

WW live motif set is small: `BA-05-3`, `FA-05-3`, `PA-05-3`, `RS-05-3`, `TE-05-3` (body `05-3`) and `RL-67-1` (body `67-1`). Category from the WW legend: BA/PA/RS/TE = cat 3, FA = cat 2, RL = cat 1.

## What cannot go into the current catalog

Princess Rose (34 rows), Monchelsea (63), Oxford (23), most WW bodies, spare parts, accessories, and Oliver/Country/Provence rows whose SKU is not live.

### Princess Rose vs live Provence (do not merge)

- `PR-55-2` · Банкетка большая
- `PR-55-1` · Банкетка малая
- `PR-09-1` · Зеркало навесное
- `PR-09-2` · Зеркало напольное
- `PR-14-1` · Кровать 1-сп. (90*190) с рисунком, без изн.
- `PR-69-1` · Полка книжная
- `PR-62-1` · Стеллаж для книг
- `PR-65-5` · Стол письменный 1-тумб. 0П (ручки СВАРОВСКИ)
- … ещё 11

### Furniture in the workbook but not on live demo (sample)

- `OL-84-2` · Бортик к кровати большой
- `OL-84-1` · Бортик к кровати малый
- `OL-86-1` · Каркас для балдахина
- `OL-95-3` · Кровать - трансформер (80*150) с тканью
- `OL-14-3` · Кровать  1-сп. (90*190) с под механиз SINGLE
- `OL-15-3` · Кровать 1,5-сп. (120*190) с подъемн.мех-змом
- `OL-16-3` · Кровать 1,5-сп. (140*190) с подъемн.мех
- `OL-65-1` · Стол письменный 1-тумб. 0П
- `OL-65-2` · Стол письменный 1-тумб. П0
- `OL-83-1` · Столешница пеленальная съемная
- `MNM-55-1` · Банкетка малая
- `MNM-57-3` · Диван с выкатной кроватью
- `MNM-09-1` · Зеркало навесное
- `MNM-09-2` · Зеркало напольное
- `MNM-09-3` · Зеркало настольное
- `MNM-05-3` · Комод высокий
- `MNM-05-2` · Комод широкий
- `MNM-05-4` · Комод с зеркалом
- `MNM-15-1` · Кровать 1,5-сп. (120*190)
- `MNM-15-2` · Кровать 1,5-сп. (120*190) без изножья
- … ещё 174

## Files

- `catalog-reconciliation.csv` - every workbook row
- `catalog-coverage.csv` - every live demo SKU
- `catalog-split-handles.csv` - collision handles

## Safety

No Medusa write. No demo mutation. Mapping is not a commercial approval to sell or to change price.
