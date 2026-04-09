# Greenwich refresh audit: ожидаемый контракт vs состояние после старого seed

Дата: 2026-04-10. Источник истины по полям: `data/normalized/greenwich-ingestion.json` + `docs/storefront/catalog-interpretation-rules.md` (§9).

---

## 1. Сколько продуктов Greenwich в ingestion

В `greenwich-ingestion.json` **17** записей, уникальные `handle`:

- `greenwich-gr-09-1-mirror` (зеркало, SKU `GR-09-1-M`) — **отдельно** от кровати с тем же кодом workbook
- `greenwich-gr-09-1-bed-90` … `greenwich-gr-18-1` — включая группу кроватей с `display_group: "greenwich-bed"`

Критично: **GR-09-1** остаётся разведённым по двум продуктам (mirror vs bed); refresh должен обновлять **по `handle`**, никогда не сливать записи.

---

## 2. Поля metadata: ожидание (контракт витрины + ingestion)

| Поле | Источник в ingestion | Использование storefront |
|------|----------------------|---------------------------|
| `collection` | `collection` (всегда `greenwich`) | `catalog-scope`, `getDisplayGroupMembers` |
| `collection_label` | `collection_label` | Карточка, PDP |
| `canonical_name` | `canonical_name` | PDP (подзаголовок при отличии от title) |
| `dimensions` | `dimensions` | Карточка, PDP |
| `display_group` | только у кроватей группы | Группировка листинга, «Другие размеры» |
| `display_group_title` | кровати | Title карточки группы |
| `display_group_sort` | кровати | Порядок размеров |
| `asset_tier` | да | Не обязательно для UI Phase 1 |
| `asset_quality` | да | Не обязательно для UI Phase 1 |
| `subcollection_label` | нет в Greenwich JSON | N/A для Greenwich |
| `product_code_normalized` | да | Аудит / админ; артикул в UI = variant SKU |
| `workbook_row_key` | да | Трассировка; у GR-09-1 зеркало и кровать **делят** один и тот же ключ — дизambiguation по `handle` + `workbook_row_index` |
| `workbook_row_index` | да | Рекомендуется в metadata для однозначности строки workbook |

**Нет в контракте витрины:** `dimensions_summary` (не выводится текущим кодом; при необходимости добавить позже в ingestion и `product-metadata`).

---

## 3. Состояние «старый seed» (до refresh)

Скрипт `seed-greenwich.ts` ранее при **уже существующих** продуктах делал **ранний выход** (`All Greenwich products already exist. Skipping creation.`) и **не обновлял** строки в БД.

Типичный профиль уже засиденного продукта (устаревший backend seed до выравнивания):

| Поле | Часто в БД | Проблема |
|------|------------|----------|
| `collection` | Иногда только `greenwich` без остального | Неполный контракт |
| `collection_label` | **Отсутствовал** | Карточка не показывала коллекцию |
| `canonical_name` | **Отсутствовал** | PDP не мог показать workbook-слой |
| `display_group*` | **Отсутствовал** | Не работала группировка кроватей и блок «Другие размеры» |
| `dimensions` | Мог быть | Зависит от версии сида |
| `asset_tier` / `asset_quality` | Могли быть | Обычно OK |
| `workbook_row_key` / `product_code_normalized` | **Не заданы в сиде** | Слабая трассировка |

**Вывод:** расхождение основное — **display / catalog metadata**, а не обязательно изображения или SKU.

---

## 4. Live DB в этом репозитории

Локальная PostgreSQL / Medusa в среде агента может быть **не поднята** (`node_modules` отсутствует). Фактический снимок БД здесь не снят; эталон сравнения — **ingestion JSON** и описанный выше профиль старого сида.

После выполнения `refresh-greenwich.ts` в вашей среде проверяйте выборочно продукты с handle `greenwich-gr-09-1-mirror` и `greenwich-gr-09-1-bed-90` и любую кровать из `greenwich-bed`.

---

## 5. Риски, на которые указывает аудит

- **Дубликаты:** re-seed через `createProducts` при конфликте handle — опасен; предпочтителен **update по id**.
- **Ассеты:** массовая перезапись `thumbnail`/`images` через workflow может пересоздать связи; для refresh достаточно **metadata-only**.
- **GR-09-1:** оба продукта должны остаться с разными handle и SKU; metadata обновляется **независимо** по строке ingestion.
