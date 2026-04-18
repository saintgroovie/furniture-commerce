# Post-seed QA report (draft real-data)

Дата: **2026-04-10**  
Окружение: Docker (`medusa_backend`, `medusa_postgres`), БД `medusa-store`.  
Эталон входа: `data/normalized/seed-products.fixed2.json`, `data/normalized/seed-summary.fixed2.json`.

План проверок: [`post-seed-qa-plan.md`](post-seed-qa-plan.md).  
Ассеты (HTTP + ФС): [`post-seed-asset-checks.md`](post-seed-asset-checks.md).

---

## 1. Products

| Проверка | Результат |
|----------|-----------|
| Число продуктов **в scope fixed2** (handle ∈ fixed2) | **109** — совпадает с JSON |
| Уникальность handles в fixed2 | **109** уникальных в JSON; в БД уникальный индекс по `handle` |
| Наличие title | **0** пустых `medusa_product_title` в fixed2; для всех 109 в БД `title` совпадает с JSON |
| Критические поля | **15** продуктов в JSON с `main_image_url: null` но непустыми `image_urls` (ожидаемо по данным); в БД у части из них заполнен `thumbnail` — см. minor issues |
| Полные продукты в БД (все не удалённые) | **139** — **ожидаемо выше 109**, т.к. в БД остаются продукты из канонического `seed.ts` и др.; QA scope = **только пересечение с fixed2** |

**Edge `ol-05-n`:** продукт с handle `ol-05-n` присутствует; `metadata` содержит `workbook_row_key` `oliver:OL-05-Н`, provenance в `mapping_notes` согласован с [`invalid-handle-audit.md`](invalid-handle-audit.md).

---

## 2. Collections

| Проверка | Результат |
|----------|-----------|
| Ожидаемое число коллекций (seed) | **3** |
| Факт в БД (`product_collection`, `deleted_at IS NULL`) | **3** — handles: `country-london-paris`, `oliver`, `provence`; titles совпадают с `seed-collections.json` |
| Распределение продуктов по коллекциям (109 строк fixed2) | `oliver` **67**, `provence` **29**, `country-london-paris` **13** — совпадает с агрегатом по JSON |
| Ссылка продукта на коллекцию | Для всех **109** продуктов `product.collection_id` указывает на коллекцию с тем же `handle`, что в JSON |

---

## 3. Categories

| Проверка | Результат |
|----------|-----------|
| Ожидаемое число категорий | **17** (`seed-categories.json`) |
| Факт в БД | **17** строк в `product_category` |
| Handles | Совпадают с seed; отображаемые `name` в БД местами в другом регистре (**Комоды** vs **комоды**) из-за `normalizeCategoryName` в `seed-real-data.ts` — **minor** |
| Связь продукт → категория | **109 / 109** имеют связь в `product_category_product` с ожидаемым `medusa_category_handle` (**0** mismatches) |

---

## 4. Product types (ProductClassification)

| Проверка | Результат |
|----------|-----------|
| Распределение vs fixed2 | **CONFIGURABLE 105**, **STANDARD 4** — в БД по join на `product_classification` для всех **109** handles **совпадает** с JSON |
| Лишние BESPOKE в этом subset | **Нет** |
| Связь classification | **109** продуктов имеют активную запись в link-таблице `product_productextensionmodule_product_classificat7e368fb4` |

---

## 5. Excluded / scope leakage

- Выборочно проверены **50** непустых `medusa_product_handle` из `entity-mapping-excluded.json`: **ни один** не найден как `product.handle` в БД.  
- Полный набор real-data ограничен **109** handles из fixed2; excluded **не входят** в этот набор по определению пайплайна.

---

## 6. Data integrity vs seed inputs

| Проверка | Результат |
|----------|-----------|
| `seed-products.fixed2.json` count | **109** |
| БД count по тем же handles | **109** |
| Пропущенных / лишних в пересечении | **0** |
| Дубликаты handle | **0** в JSON; индекс в БД уникален |
| Дубликат `workbook_row_key` | **Один** ключ `oliver:OL-08-1` отображается на **два** продукта (`ol-08-1`, `ol-08-1-mirror`) — **ожидаемо** ([`pre-seed-sanity-check.md`](pre-seed-sanity-check.md), [`seed-summary.fixed2.json`](../../data/normalized/seed-summary.fixed2.json)) |
| `seed-assets.json` rows | **441** vs `asset_row_count` **444** в `seed-summary.fixed2.json` — **известный drift документации/артефактов**, в рамках QA не исправлялся |
| `product-asset-binding.json` / `asset-upload-execution-manifest.json` | Не пересчитывались в этом QA; логическая связь «продукт → URL в fixed2» сохранена при сиде |

---

## 7. Issues (без правок в коде)

### Critical blockers

1. **HTTP 404 для всех проверенных URL с префиксом `/uploads/`** при том, что файлы **есть** на диске в `medusa_backend` (`/server/uploads/...`). Для Greenwich в БД используются URL с **`/static/`**, которые отдают **200**. До согласования префикса (конфиг Medusa / static provider / proxy) **витрина и админка не смогут надёжно показывать картинки real-data по текущим URL из seed.**  
   - Не исправлялось в рамках задачи (QA only).  
   - См. детали: [`post-seed-asset-checks.md`](post-seed-asset-checks.md).

### Minor issues

1. **Thumbnail vs `main_image_url`:** для **15** продуктов в JSON `main_image_url` пустой, но в БД `thumbnail` заполнен — вероятно Medusa/воркфлоу подставляет первое изображение из списка. Несоответствие поля в JSON vs колонка в БД — зафиксировать при документировании «источника истины» для превью.  
2. **Регистр названий категорий** в БД vs `seed-categories.json` (косметика).  
3. **Drift 441 vs 444** между `seed-assets.json` и summary — отдельная задача на выравнивание отчётности, не блокер сида.

### Cleanup later (вне текущего QA)

- Решить, должен ли ASSET_BASE_URL в real-data совпадать с фактическим public path (`/static/` vs `/uploads/`).  
- При merge в канонический seed flow — явная политика: одна БД без демо или отдельный профиль окружения.

---

## 8. Final recommendation

| Вопрос | Ответ |
|--------|--------|
| **Валидность draft seed (данные и связи)** | **Conditionally valid** — структура каталога для **109** продуктов, коллекции, категории, типы и метаданные **соответствуют** `seed-products.fixed2.json`. |
| **Готовность к использованию изображений по текущим URL** | **Not ready** для end-user без устранения **critical** пункта про HTTP `/uploads/`. |
| **Можно ли использовать `seed-real-data.ts` как MVP real-data path** | **Да, с оговоркой:** guard `REAL_DATA_SEED_CONFIRM=1`, вход **fixed2**; при этом **обязательно** планировать выравнивание публичных URL ассетов с тем, что реально отдаёт Medusa/инфраструктура. |
| **Что нужно перед merge в канонический seed flow** | (1) Закрыть вопрос **доставки static файлов** для real-data. (2) Решение по **сосуществованию** демо-продуктов и real-data в одной БД. (3) Финальный sign-off по caveat-товарам (`seed_ready_with_caveat`). (4) При необходимости — починить источник `OL-05-Н` в workbook (латиница), чтобы не полагаться только на draft-слой. |

---

## 9. Команды, использованные для проверки (справочно)

```sql
-- Пример: число продуктов с handle из фиксированного списка (список подставляется из fixed2)
SELECT COUNT(*) FROM product WHERE deleted_at IS NULL AND handle IN (...);
```

```bash
docker exec medusa_postgres psql -U postgres -d medusa-store -c "SELECT handle, title FROM product_collection WHERE deleted_at IS NULL ORDER BY handle;"
docker exec medusa_backend test -f /server/uploads/products/oliver/OL-00-1_main.jpg
```

Полная выборка URL и HTTP — в [`post-seed-asset-checks.md`](post-seed-asset-checks.md).

---

## Greenwich final status

**Technical verdict:** OK for Greenwich readiness  
**Manual browser sign-off:** pending only if final human visual/browser QA has not yet been re-run in the target environment

### Evidence
- Store API: **15/15 Greenwich products** returned with complete expected `metadata`
- `display_group` present on the **5 bed SKUs**
- `GR-09` mirror and bed are correctly separated at data level
- Storefront `/catalog`: **200 OK**
- Catalog shows:
  - **one grouped bed card** with `от …` and `5 размеров`
  - normal **GR-05-1** card with collection / SKU / dimensions / price
- Bed PDP:
  - correct selected SKU data
  - `Другие размеры` block present
  - **4 sibling links**
- Mirror PDP:
  - no `Другие размеры` block
  - distinct preview/media from bed PDP
- Server-rendered product and catalog pages returned expected content in the verified environment

### Conclusion
No technical inconsistencies were found in data, grouping, server-rendered page output, or Greenwich PDP/listing behavior in the verified environment.

### Note
Final release approval may still require manual browser QA in the target environment, including visual checks such as typography, spacing, responsive layout, and interaction polish.

---

## Oliver final status

**Canonical closure doc:** [`oliver-final-technical-media-readiness.md`](oliver-final-technical-media-readiness.md) — scope, commits, validated status, interpretation (reference stack vs manual QA vs other environments), follow-ups, conclusion.

**Technical verdict:** OK on validated reference stack  
**Manual browser sign-off:** pending as a separate visual gate after deployment in the target environment

### Evidence (summary)
- **Metadata** — `07cdb80` (`Oliver readiness fix`): `collection`, `collection_label`, `canonical_name`, `dimensions`.
- **Media delivery** — `9a4d06a` (`Oliver media delivery fix`): `/uploads/products/oliver/...` → `/static/products/oliver/...`.
- **Storefront** — `ec260bd` (`Oliver media correctness: OG image + explicit no-photo media`).
- **API image order** — `e37b12b` (`Oliver API image-order sync`): **11** SKUs, `thumbnail === images[0]`.
- **Regression (reference stack)** — Greenwich counters / grouping checks unchanged when Oliver fixes were applied; Store API, catalog SSR, PDP SSR, and direct static media URL checks passed where exercised for Oliver.

### Note
Earlier draft observations in §7 about `/uploads/` reflected the pre-fix snapshot for the QA date; Oliver collection media on the reference stack is served under `/static/products/oliver/...` after the delivery fix above. Operational scripts and environment interpretation: see the canonical closure doc.

### Conclusion
Oliver technical/media readiness is **closed** on the validated reference stack; detailed wording and next-step interpretation are in [`oliver-final-technical-media-readiness.md`](oliver-final-technical-media-readiness.md).
