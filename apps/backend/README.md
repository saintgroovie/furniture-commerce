# Furniture Backend (Medusa v2)

Backend для мебельного ecommerce + bespoke. Источник требований: `/docs/MASTER_PRD.md`, `/docs/architecture.md`, `/docs/data-model.md`.

## Стек

- Medusa v2
- PostgreSQL

## Настройка

1. Скопировать `.env.example` в `.env` и задать `DATABASE_URL`, `JWT_SECRET`.
2. Установить зависимости: `npm install`.
3. Сгенерировать миграции для кастомных модулей и применить их:

```bash
# Генерация миграций по одному модулю (ProductType, RoomSet, RoomSetItem, Lead, BespokeRequest, PaymentLink)
npx medusa db:generate productExtensionModuleService
npx medusa db:generate roomSetModuleService
npx medusa db:generate leadModuleService
npx medusa db:generate bespokeRequestModuleService
npx medusa db:generate paymentLinkModuleService

# Применить миграции
npx medusa db:migrate

# Синхронизировать link-таблицы (Product ↔ ProductType, Product ↔ RoomSetItem)
npx medusa db:sync-links
```

4. Запуск: `npm run dev` (разработка) или `npm run start` (production).

5. Seed (опционально): `npx medusa exec ./src/scripts/seed.ts` — регион РФ/RUB, категории, продукты с product_type, Room Sets. Требует предварительно применённых миграций и при необходимости дефолтный shipping profile / sales channel в БД.

6. **Локальный admin (обязательно для входа в `/app`):** seed не создаёт пользователей админки.

```bash
npm run ensure-local-admin
# по умолчанию: admin@woodright.ru / admin123
```

Локально: **`npm run dev`** (рекомендуется) или **`npm run build` + `MEDUSA_ALLOW_START_IN_DEV=1 npm run start`**.

**`Cannot GET /app` или `/app/products`:** на порту 9000 запущен не тот процесс (часто `medusa start` без admin build вместо `medusa develop`).

```bash
lsof -ti :9000 | xargs kill
cd apps/backend && npm run dev:reset
```

Guard `ensure-admin-runtime-ready.mjs` блокирует `npm run start` при `NODE_ENV=development` и занятый «битый» порт.

Вход: **`http://localhost:9000/app/login`**

Если форма «крутится» — очистите cookies для `localhost` и перезапустите backend.

**Ошибка admin `Failed to fetch dynamically imported module .../.medusa/vite/deps/...`:** устаревший hash в браузере или прерванный Vite optimize-deps (часто после смены `medusa-config` / i18n). Исправление:

```bash
npm run dev:reset
# в браузере: Cmd+Shift+R на http://localhost:9000/app
```

Кэш admin Vite хранится в `.medusa/vite-<PORT>-<ADMIN_VITE_PORT>/` (например `vite-9000-5173`). Перед каждым `npm run dev` bootstrap финализирует `deps_temp_*` → `deps/`; при первом 404 на chunk страница один раз перезагрузится сама.

**Белый экран / моргание на `/app`:** устаревший Vite-кэш или цикл HMR reload. Исправление — `npm run dev:reset`, затем **Cmd+Shift+R**.

По умолчанию **admin HMR выключен** — UI стабилен. Для правок `src/admin`: `ADMIN_VITE_HMR=1 npm run dev`.

Для production-admin без Vite: `npm run build` → `npm run start` (не открывать старую вкладку dev-admin).

Альтернатива без конфликта с `:9000`: `npm run dev:admin-local` → `http://localhost:9001/app/login`.

7. **Checkout без онлайн-оплаты (MVP):** один раз на окружение:

```bash
npm run ensure-checkout-ready
```

Скрипт привязывает `pp_system_default`, создаёт вариант доставки «Доставка согласуется менеджером» и линкует товары к default shipping profile. Без этого `complete cart` падает с `Payment collection has not been initiated for cart`.

8. **Цены (важно):** Medusa v2 хранит суммы в **рублях** (major units), не в копейках. Если каталог импортирован со `* 100`, в админке будут «миллионы»:

```bash
PRICE_AMOUNT_DIVIDE_100_CONFIRM=1 npm run normalize-price-amounts
```

После нормализации оформите **новый** заказ — старые order snapshots в БД не пересчитываются.

## Язык админки (русский)

Medusa Admin **нативно** поддерживает русский (`ru.json` в `@medusajs/dashboard`). В Woodright:

- по умолчанию включён **`ADMIN_DEFAULT_LOCALE=ru`** (см. `.env.example`);
- недостающие ~268 ключей новых экранов дополнены в `src/admin/i18n/ru-supplement.json` (deep merge с Medusa).

Сменить язык вручную: **Настройки → Профиль → Язык → Русский**.

После обновления переводов: `npm run dev:reset` и жёсткое обновление страницы (`Cmd+Shift+R`).

## Кастомные модули

- **product-extension** — поле `product_type` (STANDARD / CONFIGURABLE / BESPOKE), связь 1:1 с Product через link.
- **room-set** — RoomSet и RoomSetItem; связь RoomSetItem ↔ Product через link (удобно подгружать продукты в Room Set).
- **lead** — Lead (контакт/источник заявки).
- **bespoke-request** — BespokeRequest (запрос на расчёт), явные поля: dimensions, materials, budget, comment, status.
- **payment-link** — PaymentLink (ручной режим в MVP, без webhook).

## API (по /docs/api.md)

**Store:**  
`GET /store/products` (query: product_type, category_id), `GET /store/room-sets`, `GET /store/room-sets/:slug`, `POST /store/leads`, `POST /store/bespoke-requests`.

**Admin:**  
`GET/POST /admin/room-sets`, `GET/PATCH/DELETE /admin/room-sets/:id`, `GET /admin/leads`, `GET /admin/leads/:id`, `GET /admin/bespoke-requests` (query: status), `GET/PATCH /admin/bespoke-requests/:id`, `GET/POST /admin/payment-links`, `GET/PATCH /admin/payment-links/:id`.

## Проверка корзины (BESPOKE)

Middleware на `POST /store/carts/:id/line-items`: перед стандартным add-to-cart проверяется `product_type` по link Product ↔ ProductType. Если тип BESPOKE — ответ 400, иначе запрос передаётся в стандартный flow Medusa.

## Документация

- Архитектура и модель данных: `/docs/architecture.md`, `/docs/data-model.md`.
- API и продуктовые правила: `/docs/api.md`, `/docs/product-rules.md`.
- MVP и этапы: `/docs/mvp-scope.md`, `/docs/phases.md`.
