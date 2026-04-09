# Стратегия обновления Greenwich в Medusa

## Решение: **B — Greenwich-only metadata backfill** (с опциональным A только для новых handle)

### Почему не полный re-seed (A)

- `createProductsWorkflow` для уже существующих handle либо не вызывается текущим seed (skip all), либо при попытке создать заново грозит **дубликатами** и пересозданием **images/thumbnail**.
- Требование: **не ломать asset associations**, **не удалять данные**, **не плодить дубликаты**.

### Почему backfill (B)

- Обновляет только `product.metadata` (и при необходимости в будущем — отдельный шаг для цен), **сохраняя** `id`, варианты, изображения, связи категорий и классификации.
- Сопоставление **строго по `handle`** из `greenwich-ingestion.json` — в scope попадают только строки ingestion; демо-товары из `seed.ts` не имеют этих handle и **не затрагиваются**.
- Для строк ingestion без соответствующего продукта в БД скрипт **логирует предупреждение**; создание новых продуктов остаётся за `seed-greenwich` (когда handle ещё нет в БД).

### Смешанный подход (C)

- Не требуется: backfill покрывает 100% случая «продукт уже есть, metadata устарел»; seed по-прежнему создаёт отсутствующие Greenwich handle.

---

## Поведение `refresh-greenwich.ts`

1. Загрузить `greenwich-ingestion.json` (те же пути поиска, что у seed).
2. Собрать множество ожидаемых `handle`.
3. Загрузить из Medusa продукты с этими handle (batch `listProducts` или фильтр по handle — в зависимости от API модуля).
4. Для каждой найденной пары **handle → ingestion row**:
   - слить существующий `metadata` с полями контракта;
   - если у строки нет `display_group`, **удалить** из metadata ключи `display_group`, `display_group_title`, `display_group_sort` (чтобы не оставалось старых ошибочных групп);
   - записать `workbook_row_key`, `workbook_row_index`, `product_code_normalized` для аудита.
5. Вызвать `updateProducts` модуля продукта один батчем или по одному.
6. **Не** менять `title`, `thumbnail`, `images`, `variants` в этом скрипте (v1 refresh).

---

## GR-09-1

- Зеркало: `greenwich-gr-09-1-mirror`, SKU `GR-09-1-M`, без `display_group`.
- Кровать 90×200: `greenwich-gr-09-1-bed-90`, SKU `GR-09-1`, с `display_group: greenwich-bed`.

Обе строки обрабатываются как две независимые записи ingestion; коллизия `workbook_row_key` компенсируется полем `workbook_row_index` в metadata.

---

## Запуск

Из каталога `apps/backend` (с установленными зависимостями и `.env`):

```bash
yarn refresh-greenwich
# или
npx medusa exec ./src/scripts/refresh-greenwich.ts
```

Идемпотентность: повторный запуск перезаписывает те же ключи metadata из актуального JSON — безопасно.
