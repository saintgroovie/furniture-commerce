# Post-seed QA plan (draft real-data seed)

Документ задаёт, что проверять **после** успешного прогона `seed-real-data.ts` с `REAL_DATA_SEED_CONFIRM=1` и входным слоем `seed-products.fixed2.json` / `seed-summary.fixed2.json`.

Связанные артефакты: [`seed-generation-plan.md`](seed-generation-plan.md), [`real-seed-readiness-report.md`](real-seed-readiness-report.md), [`pre-seed-sanity-check.md`](pre-seed-sanity-check.md), [`draft-seed-rerun-report.md`](draft-seed-rerun-report.md), [`invalid-handle-audit.md`](invalid-handle-audit.md).

---

## 1. Цель QA

Подтвердить, что состояние Medusa **соответствует заявленному real-data scope** (109 продуктов Oliver / Provence / Country-London-Paris), без расширения на excluded mapping и без регрессий по типам и связям.

**Вне scope этого плана:** правки storefront, канонического `seed.ts`, новых ingestion-пайплайнов, изменение архитектуры.

---

## 2. Ожидаемые сущности (эталон из seed input)

| Сущность | Ожидание (fixed2 / seed JSON) |
|----------|-------------------------------|
| Продукты (real-data subset) | 109 строк в `seed-products.fixed2.json`; уникальные `medusa_product_handle` |
| Коллекции | 3: `oliver`, `provence`, `country-london-paris` (`seed-collections.json`) |
| Категории | 17 (`seed-categories.json`) |
| Типы (ProductClassification) | Как в seed: в текущем артефакте **105 × CONFIGURABLE**, **4 × STANDARD** |
| Регион / валюта | РФ / RUB (создаётся скриптом; не дублируем проверку здесь детально) |
| Исключённые строки mapping | Не должны появляться как продукты с handle из excluded subset (выборочно) |

**Важно:** в БД может быть **больше** продуктов, чем 109 (например, после канонического `seed.ts`). Счётчик «109» относится к **пересечению** с множеством handles из `seed-products.fixed2.json`, а не к `COUNT(*)` по всей таблице `product`.

---

## 3. Автоматические проверки

1. **PostgreSQL (контейнер `medusa_postgres`)**  
   - `COUNT` продуктов с `handle IN (<109 handles из fixed2>)` = 109.  
   - Уникальность handle в этом множестве (следует из уникального индекса + совпадения состава).  
   - Сверка `title`, `collection_id` → `product_collection.handle`, `metadata.workbook_row_key` с JSON.  
   - Связь `product_category_product`: каждый из 109 имеет ожидаемую категорию по `medusa_category_handle`.  
   - Связь `product_productextensionmodule_product_classificat*` → `product_classification.product_type` совпадает с `medusa_product_type` в JSON.

2. **Целостность против JSON**  
   - Нет «лишних» продуктов среди 109 относительно fixed2 (по handle).  
   - Дубликат `workbook_row_key` для пары `ol-08-1` / `ol-08-1-mirror` — **ожидаемое** следствие pre-seed disambiguation (два продукта, один ключ в workbook); фиксируется в отчёте, не как дефект сида.

3. **Сверка с `seed-assets.json` / `seed-summary.fixed2.json`**  
   - Согласованность чисел: известный drift `seed-assets.json` (441) vs `asset_row_count` в summary (444) — зафиксировать, не «чинить» в рамках QA.  
   - Логическая проверка: URL изображений в fixed2 указывают на ожидаемые пути storage (см. раздел 4).

---

## 4. Ручные и полуавтоматические проверки (ассеты)

1. **HTTP**  
   - Выборка **10–15** публичных URL из `seed-products.fixed2.json` (главное изображение или первое из `image_urls`).  
   - Запрос с хоста или из контейнера: код ответа, отсутствие 404.

2. **Файловая система (fallback)**  
   - Если HTTP даёт 404 при существующих файлах: проверить наличие файла под `/server/uploads/...` в контейнере `medusa_backend` (volume `./apps/backend`).

3. **Обязательные подвыборки**  
   - Oliver, Provence, Country-London-Paris.  
   - Отдельно продукт с нормализованным handle **`ol-05-n`** (исходный символ в пути файла — кириллица в имени `OL-05-Н_main.jpg`).

---

## 5. Edge cases

| Кейс | Что проверить |
|------|----------------|
| `ol-05-n` | Handle в Medusa = `ol-05-n`; файл на диске с кириллицей в имени; URL в seed не ломает ссылку при кодировании |
| `ol-08-1` / `ol-08-1-mirror` | Оба созданы; разные SKU; одинаковый `workbook_row_key` в metadata — документировать |
| Продукты без `main_image_url` | В JSON возможен `null` при непустых `image_urls`; Medusa может проставить thumbnail из изображений — не считать ошибкой без бизнес-правила |
| Демо-продукты из `seed.ts` | Остаются в БД; QA по **109** только по пересечению handles |

---

## 6. Выходные артефакты QA

- [`post-seed-qa-report.md`](post-seed-qa-report.md) — результаты проверок сущностей и целостности.  
- [`post-seed-asset-checks.md`](post-seed-asset-checks.md) — таблица URL, HTTP-статус, проверка ФС, краткий комментарий.

Фактическое выполнение фиксируется датой в отчётах (см. заголовки файлов).
