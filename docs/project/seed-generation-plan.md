# Seed generation plan (real data, Oliver / Provence / CLP)

План внедрения **первого** сида из нормализованных JSON без замены канонического `seed.ts` до ревью.

Связанные документы: [`real-seed-readiness-report.md`](real-seed-readiness-report.md), [`../assets/local-storage-upload-strategy.md`](../assets/local-storage-upload-strategy.md), [`../content/entity-mapping-readiness-report.md`](../content/entity-mapping-readiness-report.md).

---

## Источники данных (seed input layer)

| Файл | Назначение |
|------|------------|
| `data/normalized/seed-collections.json` | Product collections (handle + title) |
| `data/normalized/seed-categories.json` | Product categories (handle + title) |
| `data/normalized/seed-products.json` | Выход генератора: товары (108 строк после дедупликации `medusa_product_handle` при конфликте handle) |
| `data/normalized/seed-products.fixed.json` | Pre-seed слой: 109 товаров, **уникальные** handles (разведение дубликата `ol-08-1`) |
| `data/normalized/seed-products.fixed2.json` | Поверх fixed: **URL-safe** handles (кириллические homoglyphs → латиница); **первый** приоритет для `seed-real-data.ts` (см. [`invalid-handle-audit.md`](invalid-handle-audit.md), [`draft-seed-rerun-report.md`](draft-seed-rerun-report.md)) |
| `data/normalized/seed-assets.json` | Плоский реестр storage_key → public_url (прослеживаемость) |
| `data/normalized/seed-summary.json` | Сводка генерации (`dedupe_warnings` при конфликте handle) |

Генератор: `scripts/upload-assets-to-local-storage.py --write-seed-inputs` (после актуального `entity-mapping.json`).

**Префикс URL:** `ASSET_BASE_URL` (по умолчанию `http://localhost:9000/uploads`). Должен совпадать с тем, как Medusa отдаёт скопированные файлы (см. local-storage-upload-strategy).

---

## Что потребляет черновик `seed-real-data.ts`

- `seed-collections.json` → `createProductCollections` (идемпотентно: list → create)
- `seed-categories.json` → `createProductCategories`
- продукты → `createProductsWorkflow` (тот же контракт полей): **сначала** `seed-products.fixed2.json`, затем `seed-products.fixed.json`, иначе `seed-products.json` (в логе видно, какой файл взят)
- Регион РФ / RUB через `createRegionsWorkflow` (как в текущем `seed.ts`)
- Связь категорий: `batchLinkProductsToCategoryWorkflow`
- `ProductClassification`: тип из `medusa_product_type` (CONFIGURABLE / STANDARD)
- Stock location + inventory levels (упрощённо, как в draft)

**Защита от случайного запуска:** `REAL_DATA_SEED_CONFIRM=1` обязателен.

---

## Порядок создания сущностей

1. Region (если нет)
2. Collections
3. Categories
4. Products (с URLs изображений)
5. Links product → category
6. Links product → ProductClassification
7. Stock / inventory (для вариантов)

---

## Изображения

- `thumbnail` / `main_image_url` — из `main_image_storage_key` entity mapping (публичный URL).
- `images` — полный список URL из `upload_manifest_refs` (включая color variants) для сохранения полноты; витрина может использовать подмножество позже.

---

## CONFIGURABLE vs STANDARD

- Как в данных: большинство **CONFIGURABLE**, часть **STANDARD** (см. `entity-mapping-summary.json`).
- В первом сиде: **один вариант «Default»** на продукт для обоих типов (как текущий MVP `seed.ts` / пилот Greenwich). Полноценные опции — отдельная итерация после подтверждения осей вариантов.

---

## Что намеренно вне первого сида

- Коллекции вне Oliver, Provence, Country-London-Paris (Greenwich — отдельный `seed-greenwich.ts`).
- Willie Winkie, Monchelsea, Oxford, Princess Rose и пр. — см. excluded в `entity-mapping-readiness-report` / `entity-mapping-excluded.json`.
- Продукты без `seed_ready` / `seed_ready_with_caveat`.

---

## Слияние с каноническим `seed.ts`

После ручной проверки на staging:

1. Решить: заменить демо-товары или добавить параллельный сценарий.
2. Согласовать Room Sets (текущий `seed.ts` ссылается на demo SKU; real-data SKU другие — **не** переносить room set блок без отдельного маппинга).
3. Обновить документацию и `package.json` scripts при принятии.
