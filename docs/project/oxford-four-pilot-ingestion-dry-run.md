# Oxford-4 controlled pilot ingestion — dry-run report

**Pass:** `oxford-4-controlled-pilot-ingestion-dry-run`  
**Date:** 2026-04-27  
**Input (only):** [`data/normalized/oxford-four-pdf-seed-interim-candidates.json`](../../data/normalized/oxford-four-pdf-seed-interim-candidates.json)  
**Machine-readable:** [`data/normalized/oxford-four-pilot-ingestion-dry-run.json`](../../data/normalized/oxford-four-pilot-ingestion-dry-run.json)

Scope: **pilot**, not Oxford rollout. Greenwich, Oliver, remaining Oxford SKU, storefront scope — **out of scope** (unchanged).

---

## 1. Static smoke

| Check | Result |
|-------|--------|
| `apps/backend/static/products/oxford/*` for all `upload_manifest_refs` | **FAIL** — каталог `static` в репозитории пуст / ключи не материализованы (**11** уникальных storage keys отсутствуют) |
| Исходные PDF-extract (`Primary source` из `mapping_notes`) | **OK** — все четыре primary path существуют под `data/raw/pdf-assets/extracted/Oxford_full/` |

**Verdict:** static-ready для Medusa URL **ещё нет**; без preprocess/copy ingestion даст битые `thumbnail` / `images`.

---

## 2. Upload path integrity

Ожидаемая модель (как в существующих отчётах): `storage_key` `products/oxford/...` → физический файл `apps/backend/static/products/oxford/...` → публичный URL `/static/products/oxford/...`.

Сейчас: **integrity not satisfied** (файлы отсутствуют).

---

## 3. Seed contract compatibility (`seed-real-data.ts`)

| Requirement | Pilot |
|-------------|--------|
| Источник продуктов | Скрипт читает **`seed-products.fixed2.json`** (или fixed / seed-products), **не** `entity-mapping.json` и не candidates manifest |
| `readiness_status` в типе `SeedProduct` | Только `seed_ready` \| `seed_ready_with_caveat` — **`pdf_seed_interim` не допускается** без изменения типа/маппера |
| Коллекции | Из **`seed-collections.json`** — **`oxford` отсутствует** |
| Категории | Из **`seed-categories.json`** — **`complex`**, **`toy-box`** отсутствуют |
| Поля продукта | Нужны `main_image_url`, `image_urls[]`, `currency_code` и др. — в candidates только entity-mapping слой |

**Verdict:** прямой запуск **`seed-real-data.ts`** с текущими входами **небезопасен** и **не совместим** с пилотным subset без отдельного transform + отдельного входного JSON (или отдельного exec-скрипта).

---

## 4. Product payload completeness (Medusa create shape)

На уровне **entity-mapping / candidates** поля для будущего продукта в целом заполнены (title, handle, price, variant sku, metadata dimensions и т.д.).

Для **фактического** `createProductsWorkflow` не хватает: готовых **абсолютных** image URL, `currency_code`, валидного `readiness_status` под контракт сида, гарантии наличия **collection_id** / **category_id** для `oxford` / `complex` / `toy-box`.

---

## 5. Ingestion readiness verdict

| | |
|--|--|
| **Verdict** | **BLOCKED** (не `safe` для немедленного subset ingestion через текущий `seed-real-data.ts`) |
| **Главные blockers** | (1) Нет файлов под `static` для interim keys. (2) Нет `oxford` в `seed-collections.json`. (3) Нет `complex` / `toy-box` в `seed-categories.json`. (4) Нет `SeedProduct[]` пилотного JSON + маппинг `pdf_seed_interim` → caveat. (5) Нельзя смешивать пилот с полным `seed-real-data` без guard. |

---

## 6. Exact required seed mutations (минимальный набор)

1. **Materialize assets** — выполнить [`oxford-four-pdf-static-preprocess-plan.json`](../../data/processed/asset-manifests/oxford-four-pdf-static-preprocess-plan.json); убедиться, что каждый ключ из `upload_manifest_refs` существует под `apps/backend/static/`.
2. **`seed-products.oxford-pilot-four.json`** (новый файл) — ровно **4** строки в форме `SeedProduct`: `readiness_status: "seed_ready_with_caveat"`, `currency_code: "rub"`, `main_image_url` / `image_urls` из `ASSET_BASE_URL` + static keys.
3. **Коллекция `oxford`** — либо одна запись в отдельном JSON, который читает **только** пилотный скрипт, либо (менее желательно для baseline) дополнение `seed-collections.json` — предпочтительно **изолированный** пилот-скрипт с inline `createProductCollections` для `oxford`.
4. **Категории `complex` и `toy-box`** — создать в пилотном скрипте или добавить в `seed-categories.json` (продуктовое решение: не маппить на существующие handles без согласования).
5. **`seed-oxford-pilot-four.ts`** (новый `medusa exec`) — загрузка **только** пилотного JSON + `OXFORD_PILOT_CONFIRM=1`; без изменения `seed-products.fixed2.json` и без вызова полного real-data seed в том же прогоне.

---

## 7. Pilot-only seed execution plan (после снятия blockers)

1. Preprocess → static smoke **200** на всех URL пилота.  
2. Добавить `seed-products.oxford-pilot-four.json` + (при выборе архитектуры) минимальные коллекции/категории.  
3. Реализовать `seed-oxford-pilot-four.ts`: create collection `oxford`, categories при необходимости, `createProductsWorkflow` для **4** handle, links, `ProductClassification` по аналогии с `seed-real-data`.  
4. `OXFORD_PILOT_CONFIRM=1 npx medusa exec ./src/scripts/seed-oxford-pilot-four.ts` из `apps/backend`.  
5. Проверка Admin: ровно **4** новых продукта; нет других Oxford SKU; Oliver/Greenwich товары не пересоздаются.

**Explicit non-goals:** не запускать `seed-real-data.ts` с подмешанным Oxford; не unpause каталог; не расширять subset за пределы `include_workbook_row_keys`.

---

## 8. Baseline safety

При соблюдении изолированного скрипта и отдельного product JSON **baseline Oliver/Greenwich и общий `seed-products.fixed2.json` не затрагиваются** — это условие «безопасного пилота» после устранения blockers.

---

## 9. Реализованный изолированный pilot path (после dry-run)

Все команды из каталога **`apps/backend/`** (Yarn 4).

| Шаг | Команда | Назначение |
|-----|---------|------------|
| 1 | `yarn oxford-pilot-four:materialize-static` | Копирует файлы из `data/raw/pdf-assets/extracted/Oxford_full/` в `static/products/oxford/` по ключам из `oxford-four-pdf-seed-interim-candidates.json` (включая interim hero как копию primary extract). |
| 2 | `yarn oxford-pilot-four:smoke` | Проверяет subset (ровно 4 `oxford:*` ключа), наличие файлов static, форму `seed-products.oxford-pilot-four.json`; пишет [`data/normalized/oxford-four-pilot-ingestion-smoke.json`](../../data/normalized/oxford-four-pilot-ingestion-smoke.json). |
| 3 | `OXFORD_PILOT_CONFIRM=1 yarn oxford-pilot-four:seed` | `medusa exec` → [`seed-oxford-pilot-four.ts`](../../apps/backend/src/scripts/seed-oxford-pilot-four.ts): только пилотный JSON, guard без env — no-op. |
| 4 | `OXFORD_PILOT_POST_INGESTION_VALIDATE=1 yarn oxford-pilot-four:validate-post-ingestion` | Read-only проверка БД + контракт паузы витрины; отчёт [`oxford-four-pilot-post-ingestion-validation.md`](./oxford-four-pilot-post-ingestion-validation.md) / JSON. |

**Readiness semantics:** в entity-слое статус остаётся `pdf_seed_interim`; в Medusa в `metadata.readiness_status` попадает `seed_ready_with_caveat` из пилотного JSON; дополнительно `metadata.entity_layer_readiness_status: "pdf_seed_interim"` и `metadata.oxford_pilot_four: true`. Это **не** делает Oxford `storefront_ready`: в `catalog-scope.ts` коллекция `oxford` по-прежнему в `PAUSED_COLLECTION_KEYS` (файл витрины для пилота не менялся).

**Входные файлы:** [`seed-products.oxford-pilot-four.json`](../../data/normalized/seed-products.oxford-pilot-four.json); `seed-real-data.ts` и `seed-products.fixed2.json` пилотный exec **не читает**.

**Governance / evidence (после pilot path):** [`oxford-four-pilot-ingested-evidence.md`](./oxford-four-pilot-ingested-evidence.md), machine-readable [`oxford-four-pilot-ingested-evidence.json`](../../data/normalized/oxford-four-pilot-ingested-evidence.json).
