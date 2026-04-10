# Pre-seed sanity check — duplicate `ol-08-1`

Узкая проверка перед тестовым прогоном draft seed ([`seed-generation-plan.md`](seed-generation-plan.md), [`real-seed-readiness-report.md`](real-seed-readiness-report.md)).

---

## 1. Какие строки конфликтовали

В `data/normalized/entity-mapping.json` **две** записи с:

| Поле | Значение (обе строки) |
|------|------------------------|
| `workbook_row_key` | `oliver:OL-08-1` |
| `product_code_normalized` | `OL-08-1` |
| `medusa_product_handle` | `ol-08-1` |
| `medusa_variant_sku` | `OL-08-1` |
| `upload_manifest_refs` | одинаковый набор (`OL-08-1_main`, gallery) |

Различаются только **`canonical_name` / `medusa_product_title`**:

1. **Зеркало навесное овальное**
2. **Тумбочка прикроватная**

Остальное (цена, габариты, коллекция, категория Medusa `tumby`, тип CONFIGURABLE) совпадает.

---

## 2. Классификация причины

Это **не** ошибка генерации handle из кода в смысле «алгоритм сломался»: обе строки **намеренно** получили один и тот же `medusa_product_handle` из одного `product_code_normalized`.

Корневая причина: **дублирование идентичности workbook / entity row** — два разных торговых названия разделены в данных как два entity-mapping объекта, но с **одним** ключом строки `oliver:OL-08-1` и одним артикулом **OL-08-1**. Либо в прайсе две строки с одним кодом, либо ошибка слияния при построении mapping.

Это **не** «wrong entity split» в смысле вариантов одного SKU: у Medusa для каталога нужны **уникальные** `handle` (и обычно уникальный SKU варианта).

**Категория в данных:** обе строки отнесены к `medusa_category_handle: tumby`; для зеркала это выглядит как **несоответствие контента** (зеркало в категории тумб) — **не исправлялось** в этой задаче (узкий scope).

---

## 3. Минимальное исправление (seed input layer)

Созданы артефакты **без** изменения `entity-mapping.json`, `seed.ts`, `seed-real-data.ts`:

| Файл | Назначение |
|------|------------|
| `data/normalized/seed-products.fixed.json` | 109 продуктов; уникальные `medusa_product_handle` |
| `data/normalized/seed-summary.fixed.json` | сводка + блок `handle_disambiguation` |

**Правило для пары OL-08-1:**

- **Тумбочка прикроватная** — сохраняют базовый код витрины: `ol-08-1`, SKU `OL-08-1` (линейка OL-08-x = тумбы).
- **Зеркало навесное овальное** — `ol-08-1-mirror`, SKU `OL-08-1-MIR` (явное отличие от тумбы).

Ассеты те же (общие файлы `products/oliver/OL-08-1_*.jpg`); связи collection/category не менялись. В `mapping_notes` добавлен префикс `handle_fix:...` для строки зеркала.

---

## 4. Почему это безопасно

- Не трогаем канонический `seed.ts` и storefront.
- Не переписываем upstream `entity-mapping.json` (требует пересогласования ingestion).
- Исправление **только** в промежуточном слое `.fixed.json`; откат — использовать прежний `seed-products.json`.
- Один продукт сохраняет привычный handle/SKU для основной позиции OL-08-1 (тумба); второй явно помечен суффиксом `-mirror` / `-MIR`.

---

## 5. Проверки после исправления

| Проверка | Результат |
|-----------|-----------|
| Число продуктов | **109** (= seed-eligible в entity-mapping) |
| Уникальность `medusa_product_handle` | **да** (`unique_handles_verified` в `seed-summary.fixed.json`) |
| Коллекции / категории | **3** / **17** (как до фикса) |
| Ассеты | **444** строк в плоском списке (два продукта делят одни и те же URL — ожидаемо) |

---

## 6. Готовность draft seed к тесту

`apps/backend/src/scripts/seed-real-data.ts` при `REAL_DATA_SEED_CONFIRM=1` загружает продукты в порядке: **`seed-products.fixed2.json`** (URL-safe handles) → **`seed-products.fixed.json`** → **`seed-products.json`**. Коллекции и категории — из `seed-collections.json` / `seed-categories.json`. Для Docker скопируйте актуальный JSON в `apps/backend/data/normalized/`, если гоняете только смонтированный backend (см. [`draft-seed-rerun-report.md`](draft-seed-rerun-report.md)).

Пробный запуск: при условии файлов под `apps/backend/uploads/` и рабочих URL:

`REAL_DATA_SEED_CONFIRM=1 npx medusa exec ./src/scripts/seed-real-data.ts` (из `apps/backend`).

---

## 7. Ручная проверка URL в браузере (5–10 штук)

Убедиться, что backend отдаёт файлы по `ASSET_BASE_URL` (по умолчанию `http://localhost:9000/uploads`):

1. `http://localhost:9000/uploads/products/oliver/OL-08-1_main.jpg` (общий для тумбы и зеркала в данных)
2. `http://localhost:9000/uploads/products/oliver/OL-01-2_main.jpg`
3. `http://localhost:9000/uploads/products/provence/PV-01-1_main.jpg`
4. `http://localhost:9000/uploads/products/country-london-paris/CO-02-1_gallery_01.jpg`
5. `http://localhost:9000/uploads/products/oliver/OL-05-1_main.jpg`
6. `http://localhost:9000/uploads/products/provence/PV-14-1_main.jpg` (если есть в манифесте — low-res flagged)
7. `http://localhost:9000/uploads/products/oliver/OL-07-1_main.jpg` (или первый gallery, если main null в данных)
8. `http://localhost:9000/uploads/products/country-london-paris/CO-05-1_main.jpg`

При 404 — сверить фактический префикс Medusa (`/uploads` vs `/static`, см. [`local-storage-upload-strategy.md`](../assets/local-storage-upload-strategy.md)).

---

## 8. Рекомендация на потом

Исправить источник `entity-mapping` / workbook: либо **разные** `product_code_normalized` для зеркала и тумбы, либо одна строка с корректной категорией (зеркало → `zerkala`), чтобы не опираться на суффикс `-mirror` вечно.
