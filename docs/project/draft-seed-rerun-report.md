# Draft seed rerun report (URL-safe handles, fixed2)

Дата: 2026-04-10

---

## 1. Summary

Во входном слое draft seed обнаружен **один** невалидный для Medusa handle (`ol-05-н`, кириллическая «н»). Добавлен слой **`seed-products.fixed2.json`** с детерминированной нормализацией handle, сохранением provenance в `mapping_notes` и без изменения URL изображений/SKU/коллекций/категорий. Скрипт `seed-real-data.ts` загружает **fixed2 → fixed →** генераторный `seed-products.json`. Повторный прогон в контейнере `medusa_backend` **завершился успешно**: создано **109** продуктов, линковка категорий и остальной пайплайн отработали.

---

## 2. Invalid handle count

- **Найдено невалидных handles:** 1  
- **Нормализовано:** 1 (`ol-05-н` → `ol-05-n`)

Детали: `docs/project/invalid-handle-audit.md`, `data/normalized/invalid-handles.json`.

---

## 3. Normalization rules applied

1. Привести к нижнему регистру (в т.ч. латинские буквы в handle).  
2. Заменить известные **кириллические homoglyphs** на латинские эквиваленты (для `н` / `Н` → `n`).  
3. Очистить slug: только `[a-z0-9-]`, прочие символы → дефис; схлопнуть повторяющиеся дефисы; обрезать крайние дефисы.  
4. При коллизиях после нормализации — детерминированный суффикс от `workbook_row_key` (в данном прогоне **коллизий не было**).

---

## 4. Fixed input files

| Файл | Назначение |
|------|------------|
| `data/normalized/invalid-handles.json` | Аудит невалидных handles |
| `data/normalized/seed-products.fixed2.json` | 109 продуктов, все handles URL-safe |
| `data/normalized/seed-summary.fixed2.json` | Сводка + `handle_url_normalization` |
| `apps/backend/data/normalized/seed-products.fixed2.json` | Копия для Docker volume (`./apps/backend:/server`) |

Коллекции и категории: по-прежнему `seed-collections.json`, `seed-categories.json` (в контейнере — `apps/backend/data/normalized/`).

---

## 5. Rerun result

**Команда (точная):**

```bash
docker exec -e REAL_DATA_SEED_CONFIRM=1 medusa_backend sh -c 'cd /server && npx medusa exec ./src/scripts/seed-real-data.ts'
```

**Фактический результат:** exit code `0`. Логи:

- Загружен `data/normalized/seed-products.fixed2.json`, продуктов **109**.
- `Products to create=109, existing=0` → `Created products=109`.
- Категории, `product_type`, stock/inventory — без ошибок.
- Финальное сообщение: `=== Real Data Draft Seed Complete ===`.

---

## 6. Next blocker, if any

**На момент отчёта — нет.** Следующие шаги вне этой узкой задачи (по желанию):

- Исправить источник в workbook / `entity-mapping` (латинская буква вместо кириллической в коде `OL-05-Н`), чтобы генератор не выдавал небезопасные handles.
- При повторном сиде на непустую БД: идемпотентность по handle — уже существующие продукты пропускаются; при конфликтах с демо-данными смотреть лог «existing».
