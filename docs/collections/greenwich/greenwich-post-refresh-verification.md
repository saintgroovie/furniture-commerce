# Greenwich post-refresh verification

Дата: 2026-04-10.  
Окружение проверки: **Cursor agent sandbox** (выполнение команд в рабочей копии `furniture-commerce`).

Успешный refresh в **локальном Docker** (другой прогон): [`greenwich-post-refresh-verification-local-docker-success.md`](greenwich-post-refresh-verification-local-docker-success.md).

---

## 1. Summary

**Refresh (`yarn refresh-greenwich`) в этой среде не выполнялся.** Причина зафиксирована, без импровизации:

- В PATH **нет** `node`, `npm`, `yarn` (`command -v` → not found даже с `/usr/local/bin` и `/opt/homebrew/bin`).
- Каталог `apps/backend/node_modules` **существует, но пуст** (только `.` / `..`, дата Mar 13 2025) — зависимости Medusa CLI **не установлены**, бинарника `medusa` в `node_modules/.bin` нет.

Поэтому **пост-refresh проверка БД и полный E2E витрины в этом прогоне невозможны.** Ниже — результаты pre-run, что удалось проверить без Node, и **точные команды** для повторения у себя после `yarn install`.

Отдельно: HTTP `GET http://127.0.0.1:9000/store/products` в среде агента **отвечает** (Medusa жив), но возвращает `Publishable API key required` — без заголовка `x-publishable-api-key` проверить состав продуктов/metadata через Store API здесь нельзя (ключ в репозитории не хранится для автопроверки).

---

## 2. Execution command(s)

**Рекомендуемый эталонный прогон (локально / staging):**

```bash
cd apps/backend
yarn install
yarn refresh-greenwich
```

Эквивалент:

```bash
cd apps/backend
npx medusa exec ./src/scripts/refresh-greenwich.ts
```

(только при установленных зависимостях и настроенном `.env` с `DATABASE_URL` и прочим для Medusa v2).

**В среде агента:** команды **не запускались** — см. §1.

---

## 3. Refresh result

| Статус | Деталь |
|--------|--------|
| Выполнен | **Нет** — нет Node toolchain и пустой `node_modules` |
| Ожидаемый эффект после успешного прогона | До **17** продуктов с handle из `greenwich-ingestion.json` получают обновлённый `metadata` (без дубликатов, без смены images/variants) |

---

## 4. Pre-run check (ШАГ 1) — факты

| Проверка | Результат |
|----------|-----------|
| Backend HTTP | `127.0.0.1:9000` отвечает; Store API требует `x-publishable-api-key` |
| Node / Yarn | **Недоступны** в PATH |
| `apps/backend/node_modules` | Папка есть, **пакеты не установлены** (пусто) |
| Скрипт refresh | Путь корректен: `apps/backend/src/scripts/refresh-greenwich.ts` |
| `data/normalized/greenwich-ingestion.json` | **Присутствует** |
| Ожидаемое число Greenwich handle в JSON | **17** (включая `greenwich-gr-09-1-mirror` и `greenwich-gr-09-1-bed-90`) |
| Статические ассеты Greenwich под uploads | **Присутствуют** (пример: `uploads/products/greenwich/GR-09-1_temp_main_01.png`, галереи `GR-*_gallery_*.jpg`) |

---

## 5. DB/API verification (ШАГ 3) — после refresh у себя

**Здесь не выполнялась** (нет доступа к `medusa exec` и к Store API с ключом).

Чеклист для локальной проверки:

1. **Количество:** в админке или SQL — ровно **17** Greenwich-продуктов по известным handle (не больше из-за refresh).
2. **Дубликаты:** нет второго продукта с тем же `handle`.
3. **Metadata** (выборочно + все кровати группы `greenwich-bed`):
   - `collection` = `greenwich`
   - `collection_label`
   - `canonical_name`
   - `workbook_row_key`, `workbook_row_index`, `product_code_normalized`
   - `dimensions` (объект с `width_mm` / `depth_mm` / `height_mm` как в ingestion)
   - для кроватей: `display_group`, `display_group_title`, `display_group_sort`
4. **GR-09-1:** два продукта — `greenwich-gr-09-1-mirror` и `greenwich-gr-09-1-bed-90`, разные `id`; у зеркала **нет** `display_group`, у кровати — есть.

Store API: `GET /store/products` с валидным `x-publishable-api-key` — в JSON у каждого продукта должно быть поле `metadata` с перечисленными ключами (Medusa отдаёт `metadata` в graph для products route).

---

## 6. Storefront verification (ШАГ 4) — статический разрыв vs live

**Live-проверка витрины в агенте не проводилась** (нет гарантированного ключа и неизвестно, обновлена ли БД после refresh).

**Проекция кода (если metadata в API полный — явного бага слоя отображения не видно):**

- Карточка: `apps/storefront/src/components/product-card.tsx` + `product-metadata.ts` — коллекция, артикул (variant SKU), габариты из `metadata.dimensions`, цена; для группы — `display-group.ts` оставляет представителя и «от N ₽».
- PDP: `apps/storefront/src/app/product/[id]/page.tsx` — коллекция, `canonical_name` при отличии от title, артикул, размеры, галерея, «Другие размеры» при `display_group` + второй запрос `getProducts()`.

**Точка разрыва, если что-то «не видно» на витрине после успешного refresh:**

| Симптом | Где искать первым |
|---------|-------------------|
| Поля пустые в UI | `GET /store/products` и `GET /store/products/:id` — есть ли `metadata` в ответе |
| Metadata есть в БД, нет в API | контракт `query.graph` / поля в `apps/backend/src/api/store/products/route.ts` (сейчас `*` должен включать metadata) |
| API полный, UI пустой | конкретный компонент и ключ metadata (опечатка ключа vs ingestion) |

Без фактического ответа API после refresh **уточнять разрыв дальше нельзя** — это не гадание, а обязательный следующий шаг локально.

---

## 7. Remaining breakpoints

1. **Инструменты:** невозможность запустить `yarn refresh-greenwich` в среде агента — **блокер** для подтверждения «данные в БД обновлены».
2. **Store API:** проверка списка продуктов без **publishable key** недоступна; ключ задаётся в админке Medusa и обычно в `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` витрины.
3. **После того как refresh пройдёт у вас:** если UI всё ещё неверен — первый измеримый шаг: сравнить JSON одного Greenwich product из API с ожиданиями ingestion.

---

## 8. Recommended next step

1. **На машине разработчика / staging:** `cd apps/backend && yarn install && yarn refresh-greenwich`, затем чеклист §5 и ручной просмотр каталога/PDP.
2. Если refresh и API в порядке, а UI нет — зафиксировать один пример `product.id` + фрагмент JSON + скрин; тогда допустима точечная правка витрины (вне этой задачи, если подтверждён projection bug).
3. **Oliver readiness** — только после того, как Greenwich принят как эталон по данным и E2E у вас; до этого смысла переносить паттерн нет.

---

## 9. Reference pattern

**Считать Greenwich эталоном по данным и отображению можно только после** успешного `yarn refresh-greenwich` и подтверждения §5–§6 на вашей среде. В рамках данного прогона агента статус: **«эталон по процессу (ingestion → seed → refresh) описан; исполнение refresh и E2E — не подтверждены»**.

---

### Формат ответа (чеклист)

1. **Summary** — §1  
2. **Execution command(s)** — §2  
3. **Refresh result** — §3  
4. **DB/API verification** — §4–§5  
5. **Storefront verification** — §6  
6. **Remaining breakpoints** — §7  
7. **Recommended next step** — §8  
