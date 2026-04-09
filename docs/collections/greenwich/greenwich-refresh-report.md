# Отчёт: Greenwich metadata refresh

Дата: 2026-04-10.

---

## 1. Summary

Выбран **Greenwich-only metadata backfill** (`refresh-greenwich.ts`): обновление `product.metadata` по `handle` из `data/normalized/greenwich-ingestion.json` без пересоздания продуктов, без изменения thumbnail/images/variants. Это устраняет рассинхрон после улучшения контракта отображения и старого поведения seed («все handle уже есть → выход»). Документация: `docs/collections/greenwich/greenwich-refresh-audit.md`, `docs/collections/greenwich/greenwich-refresh-strategy.md`. В `docs/storefront/storefront-content-model.md` исправлена устаревшая формулировка про Willie Winkie.

---

## 2. Audit findings

См. `docs/collections/greenwich/greenwich-refresh-audit.md`. Кратко: у уже засиденных Greenwich продуктов в типичном случае отсутствовали `collection_label`, `canonical_name`, `display_group*`, поля трассировки workbook; ingestion и витрина ожидают полный набор из контракта (`docs/storefront/catalog-interpretation-rules.md` §9). **GR-09-1:** два продукта (`greenwich-gr-09-1-mirror` / `greenwich-gr-09-1-bed-90`) обновляются раздельно по уникальному `handle`.

---

## 3. Chosen refresh strategy

**Вариант B** — см. `docs/collections/greenwich/greenwich-refresh-strategy.md`. Re-seed отклонён из‑за риска дубликатов и пересборки медиа.

---

## 4. Files changed

| Файл | Назначение |
|------|------------|
| `apps/backend/src/scripts/refresh-greenwich.ts` | **Новый** — backfill metadata |
| `apps/backend/package.json` | Скрипт `yarn refresh-greenwich` |
| `apps/backend/src/scripts/seed-greenwich.ts` | Памятка + metadata `workbook_row_key`, `workbook_row_index`, `product_code_normalized` для новых сидов |
| `scripts/seed-greenwich.ts` | То же для копии у корня `scripts/` |
| `docs/collections/greenwich/greenwich-refresh-audit.md` | **Новый** |
| `docs/collections/greenwich/greenwich-refresh-strategy.md` | **Новый** |
| `docs/collections/greenwich/greenwich-refresh-report.md` | **Новый** (этот файл) |
| `docs/storefront/storefront-content-model.md` | Выровняна нота про WW paintings |
| `docs/storefront/catalog-interpretation-rules.md` | Дополнены строки таблицы metadata (workbook поля) |

---

## 5. Execution result

В среде выполнения агента **не удалось** запустить `medusa exec` (нет `npm`/`yarn` в PATH, нет установленного `node_modules` в backend). Команда для локальной/staging среды:

```bash
cd apps/backend
yarn install   # или npm install
yarn refresh-greenwich
```

Ожидаемый лог: `Updated metadata for N Greenwich products` (N ≤ 17; если части handle нет в БД — строки `SKIP (not in DB)` и при необходимости отдельный прогон `seed-greenwich`).

---

## 6. Verification result

Проверки нужно выполнить **после** успешного `yarn refresh-greenwich` у себя:

| Проверка | Ожидание |
|----------|----------|
| Число Greenwich продуктов | Не увеличилось (нет новых дубликатов по handle) |
| `GET /store/products` | У Greenwich: `metadata.collection`, `collection_label`, `canonical_name`, `dimensions`, у кроватей `display_group` / `display_group_title` / `display_group_sort` |
| GR-09-1 mirror vs bed | Разные `id`/handle; у зеркала нет `display_group`, у кровати — `greenwich-bed` |
| Каталог | Карточки с коллекцией, артикулом, размерами; кровати — одна группа «Кровать», цена «от …» |
| PDP | Галерея, canonical при отличии от title, блок «Другие размеры» между размерами кровати |
| Картинки | URL thumbnail/images **не менялись** скриптом |

---

## 7. Docs aligned

- **`storefront-content-model.md`:** удалена рекомендация моделировать WW paintings как обычные variant finish; заменена на соответствие `catalog-interpretation-rules.md` (подколлекции / отдельные уровни каталога).
- **`catalog-interpretation-rules.md`:** в таблицу metadata добавлены `workbook_row_key`, `workbook_row_index`, `product_code_normalized` для согласованности с ingestion и refresh.

---

## 8. Remaining caveats

- Скрипт **не** синхронизирует цены/описания/SKU с JSON — только metadata. Смена цен из workbook — отдельная задача (workflow variants).
- Повторный `seed-greenwich` по-прежнему не обновляет существующие строки; для metadata используйте `refresh-greenwich` после изменений JSON.
- При смене Medusa API сигнатуры `listProducts`/`updateProducts` скрипт может потребовать точечной правки (типизация в файле намеренно узкая).

---

## 9. Reference pattern & next steps

После успешной верификации в вашей БД **Greenwich** можно считать эталоном pilot-потока: ingestion JSON → seed (create) → **refresh-greenwich** (metadata drift). Следующие шаги: такой же backfill-паттерн для следующей активной коллекции; расширение refresh при необходимости (цены); навигация WW по подколлекциям — отдельный контент/маршруты.
