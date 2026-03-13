# Storefront Phase 1 — архитектура (тонкий клиент)

Источник истины для реализации apps/storefront. Без BFF, без GraphQL. Storefront — тонкий клиент к backend REST API. Системный контекст и workflow Cursor: **MASTER_PROMPT.md**.

---

## Storefront Phase 1 Core Rules

- **Frontend** рендерит состояния и инициирует вызовы API; **backend** владеет бизнес-правилами и авторитетным результатом.
- **Cart rule:** UI корзины никогда не предсказывает итог; отображает только подтверждённое backend состояние.
- **CTA rule:** UI может разветвлять отображение по типу сущности (product_type), но доменное применение правил всегда остаётся за backend.

---

## Mutation Contract

Все клиентские мутации:

1. user action → set pending state  
2. call API  
3. on success → refetch authoritative data → render final state  
4. on error → show feedback  

Без optimistic updates; итог только по ответу backend.

---

## Запрещено на frontend

- Вычислять доменные ограничения.
- Интерпретировать бизнес-правила backend.
- Дублировать cart state.
- Делать optimistic updates.
- Подменять error состоянием empty.
- Подменять not_found состоянием error.

---

## 1. Структура `apps/storefront`

Рекомендуемая структура (Next.js App Router):

```
apps/storefront/
├── package.json
├── next.config.js
├── .env.local              # NEXT_PUBLIC_MEDUSA_BACKEND_URL
├── src/
│   ├── app/
│   │   ├── layout.tsx      # корневой layout, провайдеры
│   │   ├── page.tsx        # главная (ссылки на catalog, rooms)
│   │   ├── catalog/
│   │   │   └── page.tsx
│   │   ├── product/[id]/
│   │   │   └── page.tsx
│   │   ├── rooms/
│   │   │   ├── page.tsx
│   │   │   └── [slug]/
│   │   │       └── page.tsx
│   │   ├── bespoke/
│   │   │   └── page.tsx
│   │   ├── cart/
│   │   │   └── page.tsx
│   │   └── checkout/
│   │       └── page.tsx
│   ├── components/         # UI-компоненты Phase 1
│   │   ├── product-card.tsx
│   │   ├── product-cta.tsx
│   │   ├── room-set-card.tsx
│   │   ├── room-set-cta.tsx
│   │   ├── bespoke-form.tsx
│   │   ├── cart-summary.tsx
│   │   └── ...
│   ├── lib/
│   │   └── api.ts         # тонкая обёртка: fetch к Medusa store API, без бизнес-логики
│   └── types/             # минимальные типы для ответов API (опционально)
└── public/
```

Принципы:

- Один слой: страницы и компоненты вызывают только функции из `lib/api.ts`, которые делают `fetch` на backend.
- В storefront нет правил типов товаров, валидации корзины и т.п. — только отображение данных и вызов API; вся логика — в backend.

---

## 2. Страницы и назначение

| Маршрут | Назначение |
|--------|------------|
| `/` | Главная: ссылки на каталог, комнаты, кратко о бренде. |
| `/catalog` | Список товаров, фильтры по категории и product_type. |
| `/product/[id]` | Карточка товара: галерея, описание, цена, варианты; CTA по product_type. |
| `/rooms` | Список Room Sets (активные). |
| `/rooms/[slug]` | Страница Room Set: описание, список товаров, цена «от», CTA «Купить комплект» / «Адаптировать». |
| `/bespoke` | Форма заявки на расчёт (без привязки к товару/комнате или с опциональными product_id/room_set_id из query). |
| `/cart` | Корзина: line items, итог, переход в checkout. |
| `/checkout` | Оформление заказа: адрес, доставка, контакты; создание заказа в Medusa, без приёма оплаты на сайте. |

---

## 3. Backend endpoints по страницам

| Страница | Метод | Endpoint | Назначение |
|----------|--------|----------|------------|
| `/catalog` | GET | `GET /store/products?category_id=&product_type=` | Список товаров для каталога. |
| `/catalog` | GET | Категории — по текущему API (если есть store categories) или из продуктов | Фильтры/навигация. |
| `/product/[id]` | GET | `GET /store/products/:id` | Детали продукта с вариантами и productType. |
| `/rooms` | GET | `GET /store/room-sets` | Список активных Room Sets. |
| `/rooms/[slug]` | GET | `GET /store/room-sets/:slug` | Room Set с items и product для каждого item. |
| `/bespoke` | POST | `POST /store/leads` | Создание Lead (контакты, source, comment). |
| `/bespoke` | POST | `POST /store/bespoke-requests` | Создание BespokeRequest (lead_id, опционально product_id/room_set_id, dimensions, materials, budget, comment). |
| `/cart` | GET | Medusa store cart (стандартный эндпоинт получения корзины) | Отображение корзины. |
| `/cart` | POST | `POST /store/carts/:id/line-items` | Добавить в корзину (backend вернёт 400 для BESPOKE). |
| `/cart` | DELETE | Удаление line item (стандартный Medusa store API) | Удалить позицию. |
| `/checkout` | GET | Регион, опции доставки (стандартные Medusa store) | Адрес, доставка. |
| `/checkout` | POST | Стандартный Medusa store flow: создание заказа из корзины | Создание заказа без оплаты на сайте. |

Категории: если в backend есть только продукты с привязкой к категориям, список категорий для фильтра может браться из отдельного store API категорий (если добавлен) или из агрегации по продуктам на клиенте (минимально). В Phase 1 допустимо ограничиться фильтром по `category_id` и `product_type` через существующий `GET /store/products`.

---

## 4. State Contract (полный)

### Catalog (/catalog)

- **loading** → skeleton grid.
- **success** → рендер списка товаров.
- **empty** → сообщение «Товары не найдены».
- **error** → сообщение «Не удалось загрузить каталог».

### Product (/product/[id])

- **loading** → skeleton.
- **success** → рендер продукта.
- **not_found** → «Товар не найден».
- **error** → ошибка загрузки.
- **cta_pending** → disable CTA.
- **cta_success** → confirmation UI.
- **cta_error** → показать server error.

### Rooms (/rooms)

- **loading** → skeleton.
- **success** → список Room Sets.
- **empty** → «Комплекты не найдены».
- **error** → ошибка загрузки.

### Room set (/rooms/[slug])

- **loading** → skeleton.
- **success** → состав комплекта; primary CTA «Купить комплект», secondary «Запросить расчёт».
- **not_found** → «Комплект не найден».
- **error** → ошибка загрузки.
- **cta_pending / cta_success / cta_error** — как у product.

### Bespoke (/bespoke)

- **idle / editing** → форма.
- **submitting** → disable submit.
- **success** → confirmation message.
- **error_validation** → ошибки полей.
- **error_server** → общая ошибка.

### Cart (/cart)

- **loading** → skeleton.
- **empty** → «Корзина пуста».
- **ready** → line items + итог.
- **mutating** → disable item actions; после мутации: mutation → getCart → render.
- **error** → ошибка загрузки/удаления.
- **invalid_state** → cart_id есть, но cart не существует; сообщение + очистка session.

### Checkout (/checkout)

- **loading** → проверка cart.
- **empty_cart** → нет cart_id или корзина пуста (очистка session, checkout недоступен).
- **ready** → форма + order summary (если есть).
- **submitting** → disable submit.
- **success** → order confirmation.
- **error_validation** → ошибки формы.
- **error_server** → серверная ошибка.
- **invalid_cart_state** → cart_id есть, но cart не найден (404) или недоступна.

### CTA Contract

- **STANDARD:** primary CTA — add to cart.
- **CONFIGURABLE:** primary — add to cart; secondary — request quote.
- **BESPOKE:** primary — request quote; never show add to cart.
- **ROOM SET:** primary — buy set; secondary — request quote (если предусмотрено).

---

## 5. Компоненты Phase 1

- **Layout / навигация:** header с ссылками (Catalog, Rooms, Cart), footer при необходимости.
- **Каталог:** список карточек товаров, блок фильтров (категория, product_type — STANDARD/CONFIGURABLE/BESPOKE).
- **ProductCard:** миниатюра, название, цена, ссылка на `/product/[id]`.
- **ProductPage:** галерея, название, описание, цена, варианты (если есть); **ProductCta** — одна или несколько кнопок в зависимости от product_type (см. п. 6).
- **RoomSetCard:** превью, название, цена «от», ссылка на `/rooms/[slug]`.
- **RoomSetPage:** описание, список товаров комплекта (название, количество, при необходимости цена); **RoomSetCta** — «Купить комплект», «Адаптировать под мою комнату».
- **BespokeForm:** поля контактов (имя, email, телефон), source (bespoke/room_adapt/contact), comment; опционально product_id/room_set_id (скрытые или из query); dimensions, materials, budget при необходимости; отправка POST lead → POST bespoke-request (с lead_id из первого ответа).
- **Cart:** список line items, итог, кнопка «Оформить заказ» → `/checkout`.
- **Checkout:** компонент CheckoutForm (client): состояния empty_cart, loading, ready, submitting, success, validation_error, server_error, invalid_cart_state. Форма: email, адрес доставки (имя, фамилия, адрес, город, индекс, страна). Отправка: updateCart(cartId, { email, shipping_address }) → completeCart(cartId); при успехе (type === "order") — clearCartIdFromSession(), отображение success и id заказа. Без оплаты на сайте; сообщение про оплату по ссылке от менеджера.

Компоненты только отображают данные и вызывают API; решения «можно ли в корзину», «какие CTA показывать» завязаны на данные с backend (product_type и т.д.).

---

## 6. CTA по типам товаров и Room Set (CTA contract)

Поведение целиком определяется данными с backend (`product.productType.product_type`). Storefront не является источником истины по ограничениям корзины.

- **STANDARD:** показывать только «Добавить в корзину». По клику — ensureCart + addLineItem; при ошибке backend — cta_error.
- **CONFIGURABLE:** показывать «Добавить в корзину» и «Сделать по моим размерам» (ссылка на `/bespoke?product_id=...`).
- **BESPOKE:** показывать только «Получить расчёт» (ссылка на `/bespoke?product_id=...`). Никогда не показывать «Добавить в корзину».
- **Room set:** «Купить комплект» (ensureCart + addLineItem только для cart-eligible товаров; BESPOKE не добавлять) и «Адаптировать под мою комнату» (ссылка на `/bespoke?room_set_id=...`). CTA success/error после «Купить комплект».

Никакой дублирующей бизнес-логики на фронте: только отображение кнопок по product_type и вызов API.

---

## 7. Room Sets на storefront

- **Список `/rooms`:** запрос `GET /store/room-sets`, отображение карточек (RoomSetCard) с ссылкой на `/rooms/[slug]`.
- **Страница `/rooms/[slug]`:** запрос `GET /store/room-sets/:slug`; в ответе room_set с полями и массив items (каждый item с product). Отобразить описание, цену «от», список товаров (название, количество, при необходимости цена из product).
- **CTA «Купить комплект»:** для каждого item взять product; по product_type (STANDARD/CONFIGURABLE) вызвать добавление в корзину (variant_id). BESPOKE-товары в корзину не добавлять; при желании показать сообщение «Товар X доступен по запросу» или оставить только добавление допускаемых типов.
- **CTA «Адаптировать под мою комнату»:** переход на `/bespoke?room_set_id=...` (или открытие формы с room_set_id); в форме после создания Lead отправить BespokeRequest с room_set_id, без product_id.

Вся логика «что можно в корзину» — на backend; storefront только использует product_type из ответа и не добавляет в корзину позиции с BESPOKE.

---

## 8. Definition of Done — Storefront Phase 1

- Реализованы страницы: `/`, `/catalog`, `/product/[id]`, `/rooms`, `/rooms/[slug]`, `/bespoke`, `/cart`, `/checkout`.
- Каталог: данные с `GET /store/products`, фильтры по category_id и product_type (query params → тот же endpoint).
- Карточка товара: данные с `GET /store/products/:id`; CTA по product_type (STANDARD — только корзина; CONFIGURABLE — корзина + заявка; BESPOKE — только заявка).
- Room Sets: список с `GET /store/room-sets`, детали с `GET /store/room-sets/:slug`; CTA «Купить комплект» (добавление в корзину только STANDARD/CONFIGURABLE) и «Адаптировать» (форма заявки с room_set_id).
- Форма bespoke: создание Lead и BespokeRequest через `POST /store/leads` и `POST /store/bespoke-requests`; поддержка опциональных product_id и room_set_id (из query или формы).
- Корзина и checkout: работа через стандартные Medusa store API (корзина, line items, создание заказа); при попытке добавить BESPOKE показывается ошибка 400 от backend.
- Storefront не содержит бизнес-логики (правила типов товаров, валидация корзины); только вызовы REST API и отображение данных.
- Нет BFF, нет GraphQL; один backend URL (например `NEXT_PUBLIC_MEDUSA_BACKEND_URL`).
- Обработка состояний: загрузка, пустые списки, ошибки API с отображением message/code от backend.
- DoD из phases.md для каталога/карточки/корзины/checkout/rooms/bespoke выполнены: три типа товаров отображаются корректно, в корзину попадают только STANDARD и выбранные CONFIGURABLE; BESPOKE не добавляется; поток корзина → checkout → заказ работает; Room Sets и форма заявки работают и видны в админке.
