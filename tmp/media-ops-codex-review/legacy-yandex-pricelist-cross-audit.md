# Cross-audit: legacy site × Yandex Disk × price list

**Date:** 2026-06-18  
**Verdict:** `request-changes` — Media Ops Inbox orphan **не готов** без audit pack  
**Stats:** `legacy-yandex-pricelist-cross-stats.json`  
**Prior reports:** `docs/reports/product-workbook-asset-coverage-audit.md`, `tmp/legacy-site-media-catalog-ingestion-plan/catalog-source-audit.json`

---

## A. Кто за что отвечает (source of truth)

| Семейство | SKU / код | Название | Медиа URL / файл |
|-----------|-----------|----------|------------------|
| **Прайс-лист** (`parsed-sheets.json`) | `product_code_normalized`, `workbook_row_key` | Коммерческое имя в workbook | Нет медиа |
| **Seed** (`seed-products.json`) | Из workbook | `price_list` если есть `workbook_row_key` | Каталог / board context |
| **Яндекс / front-manifest** | `product_code_hint` (не везде) | Слабо | `source_ref`; preview только если зеркало локально |
| **Legacy site scrape** | `product_code_from_image` (слабо) | `product_title_raw` | `main_image_url`; без gallery |
| **legacy-media-inventory** | hints | hints | Локальные файлы, dedupe; `legacy_site_public=0` |

---

## B. Join keys — что работает

| Join | Результат |
|------|-----------|
| Workbook → seed (код) | **108/108** seed в workbook |
| Workbook → seed (коллекции) | Только **CLP, Oliver, Provence** в seed |
| Seed handle → legacy scrape | **80** из 108 |
| Yandex front-manifest | **1150** assets (array); code hints есть у CLP/Oliver/Provence |
| Orphan → Assign | Только если handle в **108-product** board |

**Сломано:** Oxford / Monchelsea / WW в seed = 0; WW painting codes ≠ WW-* SKU; audit pack отсутствует → bootstrap 404.

---

## C. Покрытие по коллекциям (оператор)

| Коллекция | Workbook | Seed | Yandex/front | Оператор |
|-----------|----------|------|--------------|----------|
| CLP | 30 | 13 | ~113 assets | **Готово** для Inbox→Assign |
| Oliver | 71 | 66 | ~288 | В основном готово |
| Provence | 35 | 29 | ~69 | В основном готово |
| Oxford | 23 | 0 | 7 фото, 0 code hints | Ручная атрибуция фото→SKU |
| Monchelsea | 67 | 0 | 17; alias MNm/MN | Нужны alias + seed |
| Willie Winkie | 59 | 0 | painting codes | Блок: `vv-painting-sku-matrix` |

---

## D. Media Ops режимы

| Режим | Может | Не может |
|-------|-------|----------|
| **Inbox orphan** | Triage: map/reject/cross-SKU | Сейчас **404** без audit pack; не назначает роли |
| **Inbox supplement** | Approve/reject intake | Нет кнопки Assign |
| **Assign** | Роли/gallery для board products | Только seeded handles; не чинит workbook/Yandex gaps |

---

## E. Риски

- Cross-SKU (CO/WW patterns)
- Duplicate basenames в inventory (~1070 groups)
- **Audit pack missing** — блокер orphan UI
- Yandex path без local mirror — не assignable
- Legacy scrape listing-only — не SoT каталога

---

## F. Рекомендуемый pipeline оператора

1. Восстановить `tmp/source-media-completeness-audit-full-legacy-cache/`
2. Orphan P0 только с preview + `in_assignment_board`
3. Supplement gate отдельно от Assign
4. Assign: сначала CLP / Oliver / Provence
5. Oxford / Monchelsea / WW — hold до named prerequisites

---

## G. P1 / P2 / P3 (Codex)

**P1**

- Regenerate audit pack (блокер Inbox orphan)
- Исправлен parser stats: `compute-cross-stats.cjs` (front-manifest = array 1150)
- Operator warning: Yandex без local mirror ≠ assignable media

**P2**

- Monchelsea alias `MNm`/`MN`/`MNM`
- Oxford photo attribution map
- `vv-painting-sku-matrix` для WW

**P3**

- Документировать SoT: прайс = identity, Yandex = media hints, legacy scrape = evidence only

---

## Remediation this session

| P1 item | Status |
|---------|--------|
| Fix cross-stats parser | **done** — `compute-cross-stats.cjs` |
| Audit pack regen | **blocked** — script not in repo; operator must regenerate pack |
| Operator warning in UI | **deferred** — orphan UI blocked until audit pack exists |
