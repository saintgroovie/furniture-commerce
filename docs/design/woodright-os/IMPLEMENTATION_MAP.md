# Woodright OS - implementation map (apps/workspace)

Техническая карта миграции существующего `apps/workspace` на утверждённую IA
`Сегодня / Клиенты / Заказы / Товары / Витрина`. UX SoT: `UX_UI_DESIGN_PROJECT.md`.
Backend остаётся source of truth; все write paths - существующие Medusa / Woodright admin API.

Категории расхождений: P = presentation, IA = структура, I = interaction model, B = business behavior (не меняем).

## Навигация

| Было (sidebar) | Стало | Route (employee URL) | Compat |
|---|---|---|---|
| Сегодня | Сегодня | `/today` | - |
| Заявки, Люди | Клиенты (режимы Люди · Заявки) | `/clients?mode=people|requests` | `/people` → `/clients?mode=people`, `/requests` → `/clients?mode=requests`; `/people/:id`, `/requests/:id` без изменений |
| Заказы | Заказы (Список · Производство) | `/orders`, `/orders/:id`, `/orders/production` | - |
| Каталог, Комнаты, Медиа | Товары (Товары · Комнаты) | `/catalog`, `/catalog/:id`, `/rooms` | `/media` → `/catalog?filter=missing_media`; `/products`, `/products/:id` → `/catalog…` (alias) |
| Акции, Сайт | Витрина (Карточка на витрине + блок «Контакты сайта») | `/promo` | `/site` → `/promo`; `/storefront` → `/promo` (alias) |
| - | Входящие | не в навигации | DESIGN_FUTURE, shell допускает добавление пункта |
| Открыть в Medusa (footer) | Техническая админка (footer, только owner) | `medusa_admin_url` из `/admin/woodright/access` | без изменений |

Технические имена routes (`/catalog`, `/promo`, `/api/catalog/*`) сохранены: смена URL ради красоты не нужна, deep links и `href` из backend `desk` продолжают работать.

## Экраны

| Новый экран | Route | Компоненты | API (read) | Write operations (существующие) | Что меняется | Что остаётся |
|---|---|---|---|---|---|---|
| Сегодня | `/today` | `PageHeader`, `QueueItem`, `Status`, `EmptyState` | `GET /admin/woodright/desk` (`inbox`, `attention`) | - | P/IA: группы «Требует ответа / Каталог / Производство», причина + объект + действие; счётчики ведут в отфильтрованные списки | backend queue, href из backend |
| Клиенты · Люди | `/clients?mode=people` | `PageHeader`, `ModeTabs`, `ObjectRow`, `Status` | `GET /admin/woodright/people` | - | IA/P: единый раздел с заявками | данные leads + person links |
| Клиенты · Заявки | `/clients?mode=requests` | `ObjectRow`, `Status` | `GET /admin/bespoke-requests`, `GET /admin/leads` | - | IA/P | статусы заявки |
| Клиенты · Компании | - | - | нет backend-сущности | - | DESIGN_FUTURE: режим не показывается | - |
| Человек | `/people/:id` | `ObjectHeader`, `Status`, `ObjectRow`, `Timeline`, `AssigneeControl`, `PersonMatch` (бывший `PersonActions`) | `GET /admin/woodright/people/:id` (`person`, `requests`, `orders`, `link`, `suggestion`, `staff`) | `POST /admin/woodright/people/:id/link` `{customer_id}` / `{unlink}` / `{assignee_id}` через `/api/people/:id/link` и новый `/api/people/:id/assignee` | P/I: карточка по 5 вопросам; «Нужно проверить связь» с кандидатами и «Это он»; «Назначить меня» через существующий `assignee_id` link-поля | explicit link/unlink, no auto-merge, `lookup_incomplete` withhold |
| Заявка | `/requests/:id` | `ObjectHeader`, `Status`, `Timeline`, `SidePanel` («Связаться») | `GET /admin/bespoke-requests`, `GET /admin/leads`, `GET /admin/woodright/people/:lead` (для staff/assignee) | `PATCH /admin/bespoke-requests/:id` `{status, internal_notes}` через новый `/api/requests/:id` (legacy admin route, auth-gated, без desk audit - отмечено как gate) | I: смена этапа и заметка contextual | статусы `new → … → completed` |
| Follow-up «Напомнить» | - | - | нет persistent модели | - | DESIGN_FUTURE: контрол не показывается | - |
| Заказы · Список | `/orders` | `PageHeader`, `ModeTabs`, `OrderAxes`, `Status`, таблица | `GET /admin/woodright/orders?filter=` | - | P: три оси в строке, ответственный не в list API (не показываем, без N+1) | фильтры backend |
| Заказы · Производство | `/orders/production` | доска по этапам из того же `GET /admin/woodright/orders?filter=all` | - | P/IA: режим, не раздел; карточки ведут в `/orders/:id` | нет отдельного production state |
| Заказ | `/orders/:id` | `ObjectHeader`, `OrderAxes`, `Timeline`, `AssigneeControl`, `SidePanel` (этап), `PendingForm` | `GET /admin/woodright/orders/:id` | `POST …/order-processes/:id/transitions` (`expected_version`, `correction`), `…/note`, `…/assignee` через существующие `/api/orders/:id/*` | P/I: header с осями и следующим действием; primary CTA = первый `allowed_stages` от backend; откат - с причиной | CAS по версии, no optimistic |
| Товары · Список | `/catalog` | `ObjectRow`, `Status`, фильтры качества данных | `GET /admin/woodright/products` | - | P: строка = фото · название · SKU · тип · цена · готовность · проблема; один primary «открыть» | фильтры |
| Товары · Комнаты | `/rooms` | `ObjectRow` | `GET /admin/room-sets` | - | P/IA: режим внутри Товаров | room-set отдельная сущность, read-only |
| Товар | `/catalog/:id` | `ObjectHeader`, `ReadinessChecklist`, `PriceEditor`, `ConflictPanel`, `MediaGallery`, `MediaUpload`, `SectionNav` | `GET /admin/woodright/products/:id` (+ `promo_price` в проекции варианта - см. backend) | `profile`, `dimensions`, `price` (create / CAS), `promo-price`, `media` (hero / reorder / detach), `media/upload`, `publish`, `unpublish`, `classification` через `/api/catalog/:id` | P/I: секции вместо tabs, переменный primary по readiness, Было → Будет, конфликт 409 `stale_price` с `current_amount`; тип - read-only + смена через confirm | все write paths; storefront probe после цены/публикации |
| Витрина | `/promo` | `PageHeader`, `Status`, `ObjectRow`, блок «Контакты сайта» | `GET /admin/woodright/catalog-promo`, `GET /admin/woodright/contacts` | `PUT /admin/woodright/catalog-promo` через `/api/promo` | P/IA: «Показываем на витрине» vs «Цена покупателя» визуально разделены; товар в слот выбирается из списка, не вводом id | slot ≠ price list |
| Поиск ⌘K | везде | `CommandPalette` | `GET /admin/woodright/search` через `/api/search` | - | P: группы, контекст из `hint`, команды-навигация; write-команд нет | debounce, Esc |

## Backend-изменения (минимальные, только проекция)

| Файл | Что | Почему |
|---|---|---|
| `apps/backend/src/lib/woodright-admin/seller-product-types.ts`, `seller-product.ts`, `price-sanity.ts`, `seller-product-promo.ts` | `SellerVariant.promo_price: { amount, price_list_id } \| null` - RUB-строка канонического промо-листа, прочитанная через pricing module по `price_set_id` (граф товара не отдаёт строки прайс-листов) | Без этого страница товара не может честно показать «Акционная цена рядом с обычной». Чтение, не правило |
| `apps/workspace/src/server/medusa.ts` | `DeskHttpError.code` / `payload` из JSON ответа | Конфликт цены (`stale_price`, `current_amount`) должен дойти до UI |

Не трогаем: миграции, `workspace_it` guard, capability gates, order process rules, price list ownership.

## Reusable components (`apps/workspace/src/components/`)

AppShell (`shell.tsx`), `Sidebar` + `MobileNav` (`desk-nav.tsx`), `PageHeader`, `ObjectHeader`, `Status`, `ModeTabs`, `ObjectRow`, `QueueItem`, `ReadinessChecklist`, `OrderAxes`, `Timeline`, `AssigneeControl`, `SidePanel`, `PriceEditor`, `ConflictPanel`, `MediaGallery`, `EmptyState`, `LoadingState` (route `loading.tsx`), `ResultToast`, `PendingForm`, `ConfirmAction` (native `<dialog>` для снятия с витрины / удаления акции / удаления из слота), `CommandPalette`.

Pure projections (тестируемые без React): `src/lib/nav.ts`, `src/lib/order-presentation.ts`, `src/lib/product-presentation.ts`, `src/lib/person-presentation.ts`, `src/lib/price-presentation.ts`, `src/lib/today-presentation.ts`.

## Статус (заполняется после реализации)

### Implemented
- Shell: 5 разделов (`src/lib/nav.ts`), бренд `Стол`, footer с сотрудником и «Техническая админка» только при `escape_hatch`, topbar с Cmd+K, bottom nav 390 (4 раздела + Поиск)
- Сегодня: очередь по группам (Требует ответа / Заказы / Каталог), срезы-ссылки в реальные фильтры, пустое состояние
- Клиенты: `/clients?mode=people|requests`, фильтры, карточка человека (состояния, кандидаты «Это он», AssigneeControl через person-link), карточка заявки (SidePanel «Результат и этап» → `PATCH /admin/bespoke-requests/:id`)
- Заказы: таблица с тремя осями + `needs-action`, режим Производство (доска по `PRODUCTION_COLUMNS`), карточка заказа (primary = первый разрешённый переход, остальные в SidePanel, исправление с причиной, Деньги/Доставка/Изготовление, История, заметка с сохранением текста при ошибке)
- Товары: список с проблемой/публикацией/готовностью, карточка с ReadinessChecklist, переменным primary CTA, PriceEditor (обычная/акционная/процент/Было→Будет), ConflictPanel на `stale_price` (server_amount из ответа backend), MediaGallery + dropzone-загрузка, Публикация/Тип/Связи; Комнаты как режим
- Витрина: «Показываем на витрине» (слот, select вместо raw id, buyer price vs base) + «Цена покупателя» + контакты как статус
- Redirects: `next.config.ts` 307 для `/people`, `/requests`, `/media`, `/site`, `/products(/:id)`, `/storefront`; page-fallback на `redirect()` оставлен
- Backend (проекция): `SellerVariant.promo_price` только из канонического прайс-листа каталога (`findCatalogPromoPriceList` + `listCatalogPromoPrices` по `price_set_id` - тот же источник, что и write-путь; граф `variants.price_set.prices` строки прайс-листов не отдаёт; без известного списка - `null`, при ошибке чтения - `promo_price_available=false`); `DeskHttpError.code/payload` на стороне workspace
- Tests: `nav.test.ts`, `commands.test.ts`, `os-presentation.test.ts` (31 workspace tests), backend price-sanity (+1)

### Deferred
- дни на этапе в доске производства: в list API нет `stage_since` (нужна проекция backend)
- ответственный в списке заказов: в list API нет `assignee_id`
- счётчик у «Сегодня» в сайдбаре: потребует fetch desk на каждом экране; пока без счётчика
- `/api/requests/[id]` идёт в legacy `PATCH /admin/bespoke-requests/:id` (auth-only, без desk capability и desk-audit) - вынести в `/admin/woodright/requests` отдельным backend-шагом
- `next/image` для медиа (сейчас `<img>`, lint warning, как и до редизайна)

### Future (DESIGN_FUTURE)
- Входящие / почта
- Компании
- Напомнить (follow-up)
- Проекты
