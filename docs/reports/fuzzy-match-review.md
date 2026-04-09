# Fuzzy Match Review

Детальный разбор всех 80 fuzzy matches по коллекциям.

---

## Summary

| Metric | Count |
|--------|-------|
| Total fuzzy reviewed | 80 |
| Safely promoted | 22 |
| Remain fuzzy | 58 |
| Rejection reasons documented | 58 |

---

## Promoted Matches by Collection

### Oliver (4 promoted, 6 remain)

| # | Workbook | Legacy | Reason | Conf |
|---|----------|--------|--------|------|
| 1 | Диван большой | Диван большой 80*190 OLIVER | abbreviation_match | 0.85 |
| 2 | Комод высокий (ниже на 1 ярус ящиков) | Комод высокий OLIVER | detail_suffix | 0.80 |
| 3 | Тумбочка прикроватная с дверкой (руч.лев/пр) | Тумбочка прикроватная OLIVER | detail_suffix | 0.80 |
| 4 | Шкаф угловой (руч.лев/пр) | Шкаф угловой OLIVER | detail_suffix | 0.80 |

**Still fuzzy (6):** 3 beds with подъемный механизм matched to beds with изножьем (mechanism mismatch), 2 desks with different drawer configs, 1 cabinet type mismatch.

### Provence (7 promoted, 7 remain)

| # | Workbook | Legacy | Reason | Conf |
|---|----------|--------|--------|------|
| 1 | Кровать 1-сп. (90×190) без изножья | same, PROVENCE | exact_name | 0.85 |
| 2 | Кровать 1,5-сп. (140×190) без изножья | 120×190 PROVENCE | size_variant | 0.75 |
| 3 | Кровать 2-сп. (160×200) без изножья | 180×200 PROVENCE | size_variant | 0.75 |
| 4 | Стол письменный 1-тумб. 0Я | ...ОЯ PROVENCE | abbreviation (0→О) | 0.85 |
| 5 | Тумба для телевизора | same, PROVENCE | exact_name | 0.85 |
| 6 | Этажерка большая 6 полок | Этажерка большая PROVENCE | detail_suffix | 0.80 |
| 7 | Этажерка малая 3 полки | Этажерка малая PROVENCE | detail_suffix | 0.80 |

**Still fuzzy (7):** 5 beds "с тканью" (fabric variant mismatch), 1 desk config mismatch, 1 nightstand drawer count mismatch.

### Monchelsea (5 promoted, 28 remain)

| # | Workbook | Legacy | Reason | Conf |
|---|----------|--------|--------|------|
| 1 | Кровать 1,5-сп. (120×190) | 140×190 MONCHELSEA | size_variant | 0.75 |
| 2 | Кровать 1,5-сп. (140×190) | same MONCHELSEA | exact_name | 0.85 |
| 3 | Кровать 2-сп. (160×200) | 180×200 MONCHELSEA | size_variant | 0.75 |
| 4 | Полка книжная | Полка книжная MONCHELSEA | exact_name | 0.85 |
| 5 | Тумба для телевизора (модуль) | Тумба для ТВ MONCHELSEA | detail_suffix | 0.80 |

**Still fuzzy (28):** Monchelsea has the most remaining fuzzy matches — predominantly modular wardrobe variants (1-дв vs 2-дв, various internal configs ЯП/ЯШ/Ш), beds with wrong size class (90 vs 160), and dresser/desk mismatches.

### Princess Rose (3 promoted, 9 remain)

| # | Workbook | Legacy | Reason | Conf |
|---|----------|--------|--------|------|
| 1 | Бортик к кровати большой | same, PRINCESS ROSE | exact_name | 0.85 |
| 2 | Бортик к кровати малый | same, PRINCESS ROSE | exact_name | 0.85 |
| 3 | Этажерка малая 3 полки | Этажерка малая PRINCESS ROSE | detail_suffix | 0.80 |

**Still fuzzy (9):** Beds with size mismatches (140→90), desk configs (1-тумб vs 2-тумб, drawer layout), one shelf with Swarovski ambiguity.

### Greenwich (3 promoted, 7 remain)

| # | Workbook | Legacy | Reason | Conf |
|---|----------|--------|--------|------|
| 1 | Консоль | Консоль Step | name_subset | 0.80 |
| 2 | Рабочий стол | Рабочий стол Base | name_subset | 0.80 |
| 3 | Шкаф-витрина Кристалл | Шкаф-витрина Cristal | abbreviation (transliteration) | 0.85 |

**Still fuzzy (7):** Generic workbook names ("Комод", "Гардероб 2-дв.") matched to named Greenwich models ("Комод Scale", "Гардероб Level"). Beds matched to wrong model ("Кровать Frame" for all sizes). Need PDF extraction or explicit name mapping.

### Country-London-Paris (0 promoted, 1 remains)

Single fuzzy match: 3-дв wardrobe matched to 2-дв → door count mismatch. Cannot promote.

---

## Rejection Reasons Distribution

| Reason | Count | Description |
|--------|-------|-------------|
| `no_safe_match` | 38 | Name too different after all normalizations |
| `door_count_mismatch` | 10 | 1-дв matched to 2-дв or 3-дв |
| `fabric_variant_mismatch` | 5 | "с тканью" matched to non-fabric |
| `mechanism_vs_footboard_mismatch` | 3 | подъемный механизм vs с изножьем |
| `product_subtype_mismatch` | 2 | буфетный vs книжный |

---

## Evidence Requirements for Remaining 58 Fuzzy

To promote any remaining fuzzy match, one of these is needed:

1. **Visual confirmation** — human sees the legacy image and confirms it matches the workbook product
2. **PDF catalog cross-reference** — product found in PDF with clear name, matching the workbook item
3. **Business confirmation** — product team confirms the match
4. **Article code discovery** — code found on legacy product page (requires detail page scrape)
