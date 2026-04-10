# Invalid product handle audit (draft seed input)

Дата: 2026-04-10  
Источник проверки: `data/normalized/seed-products.fixed.json` (и совпадающая запись в `seed-products.json`).  
Критерий «валидно»: handle соответствует шаблону Medusa для URL-safe slug — только сегменты `a-z`, `0-9`, разделённые одним дефисом: `^[a-z0-9]+(?:-[a-z0-9]+)*$`.

---

## Результат

| workbook_row_key | canonical_name | original_handle | Почему невалиден | proposed normalized_handle |
|------------------|----------------|-----------------|------------------|----------------------------|
| `oliver:OL-05-Н` | Комод высокий (ниже на 1 ярус ящиков) | `ol-05-н` | Символ **U+043D** (кириллическая «н») не входит в допустимый набор URL-safe латиницы/цифр; Medusa: *Invalid product handle … must contain URL safe characters* | `ol-05-n` |

Машиночитаемый список: `data/normalized/invalid-handles.json`.

---

## Нормализация (fixed2)

Реализовано в `data/normalized/seed-products.fixed2.json` и зафиксировано в `data/normalized/seed-summary.fixed2.json` → `handle_url_normalization`.

- Исходный handle сохранён в `mapping_notes` как `handle_provenance: original_medusa_product_handle=…`.
- Публичные URL ассетов (`OL-05-Н_main.jpg` и т.д.) **не менялись** — только поле `medusa_product_handle` для совместимости с валидацией Medusa.

---

## Связанные документы

- [`pre-seed-sanity-check.md`](pre-seed-sanity-check.md) — предыдущий слой disambiguation (`ol-08-1`).
- [`seed-generation-plan.md`](seed-generation-plan.md) — порядок загрузки draft seed.
