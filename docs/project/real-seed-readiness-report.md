# Real-data seed readiness report

Дата генерации отчёта: 2026-04-10 (по артефактам в репозитории).

---

## 1. Asset upload (локально)

| Метрика | Значение |
|---------|----------|
| Строк в `asset-upload-execution-manifest.json` | 441 |
| Уникальных `workbook_row_key` в execution manifest | 108 |
| Продуктов в `entity-mapping.json` (seed-eligible) | 109 |
| Примечание | Два ряда entity mapping с одним `workbook_row_key` `oliver:OL-08-1` и одним `medusa_product_handle` `ol-08-1` (зеркало vs тумба) — **ошибка данных**; в `seed-products.json` второй ряд отброшен (см. `seed-summary.json` → `dedupe_warnings`) |
| Продуктов в `seed-products.json` после дедупликации handle | 108 |
| Последний прогон копирования | `skipped_identical_count`: 441 (файлы уже присутствовали в `apps/backend/uploads/` с тем же содержимым) |
| Ошибок копирования | 0 |

Детали: `data/processed/asset-manifests/local-upload-summary.json`, `local-upload-status.json`, `local-upload-failures.json`.

Скрипт: `scripts/upload-assets-to-local-storage.py`.

---

## 2. Seed input scope

| Файл | Содержимое |
|------|------------|
| `seed-products.json` | 108 продуктов (109 eligible в entity-mapping, 1 дубликат handle отфильтрован на этапе генерации) |
| `seed-products.fixed.json` | 109 продуктов, уникальные handles; **черновик `seed-real-data.ts` загружает этот файл первым**, если он есть (см. `pre-seed-sanity-check.md`) |
| `seed-collections.json` | 3 коллекции: oliver, provence, country-london-paris |
| `seed-categories.json` | 17 категорий |
| `seed-assets.json` | 441 строка (совпадает с execution manifest; без двойного учёта дубликата handle) |
| `seed-summary.json` | метаданные генерации |

Публичный префикс: `http://localhost:9000/uploads` (`ASSET_BASE_URL`).

---

## 3. Draft seed

- Файл: `apps/backend/src/scripts/seed-real-data.ts`
- Поведение: читает `data/normalized/seed-collections.json`, `seed-categories.json`; для продуктов — **`seed-products.fixed.json` при наличии**, иначе `seed-products.json`. **Не выполняется** без `REAL_DATA_SEED_CONFIRM=1`.
- Канонический `seed.ts` **не изменялся**.

---

## 4. Исключения (вне первого real-data сида)

По `entity-mapping-summary.json` / readiness report (233 excluded):

| Причина | Кол-во (справочно) |
|---------|---------------------|
| `no_confirmed_assets` | 86 |
| `unresolved_mapping` | 84 |
| `blocked_by_business_decision` (VV и др.) | 63 |

Эти строки **не** вошли в `seed-products.json` и **не** в execution manifest (фильтр по seed-eligible ключам).

---

## 5. Готовность к запуску draft seed

| Критерий | Статус |
|----------|--------|
| Нормализованные seed JSON согласованы с entity mapping | Да |
| Локальные файлы под `apps/backend/uploads/` | Да (проверено идемпотентным прогоном) |
| Публичные URL согласованы с копией | Требует проверки в **живом** Medusa (`GET` на несколько URL) |
| Конфликт handle с существующей БД | Возможен, если demo seed уже создан — скрипт пропускает существующие handle |

**Вывод:** проект готов к **пробному** запуску `npx medusa exec ./src/scripts/seed-real-data.ts` с `REAL_DATA_SEED_CONFIRM=1` после ручной проверки URL и бэкапа БД.

---

## 6. Ручные проверки перед merge в канонический seed

1. Открыть 5–10 случайных `target_public_url` из execution manifest в браузере при запущенном backend.
2. Сверить `ASSET_BASE_URL` с фактическим префиксом Medusa (`/uploads` vs `/static` — см. [`local-storage-upload-strategy.md`](../assets/local-storage-upload-strategy.md)).
3. Прогнать draft seed на чистой БД или осознанно очистить конфликтующие продукты.
4. Проверить категории/коллекции в Admin и витрине.
5. Зафиксировать решение по Room Sets (не входят в draft).

---

## 7. Известные пробелы

- **Дубликат `ol-08-1`:** исправить `entity-mapping.json` / источник workbook (развести handle или строки), иначе один из двух товаров (OL-08-1) не попадёт в каталог.
- `docs/MEDUSA_DOCKER_GUIDE.md` отсутствует.
- Расхождение Greenwich-пилота (`/static/...` в `seed-greenwich.ts`) vs документированный `/uploads/...` для Oliver/Provence/CLP — унифицировать при интеграции.
- `ingestion/README` — только навигация; расширение коллекций — отдельные ветки данных.
