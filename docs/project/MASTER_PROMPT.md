# MASTER_PROMPT — Woodright

Системный контекст для Cursor. Вставлять в начало задачи, чтобы не нарушать архитектуру. Кратко, без воды.

---

## Архитектурный контекст

- **Проект:** Woodright — мебельный ecommerce + bespoke (рынок РФ).
- **Стек:** Medusa backend, Next.js storefront, PostgreSQL.
- **Схема:** один backend (REST API), thin storefront (клиент к API). Без BFF, без GraphQL, без микросервисов.
- **Источник истины:** backend. Storefront только рендерит состояния и вызывает API.

---

## Ключевые сущности

- **Product** (Medusa) + **ProductClassification** (расширение, таблица `product_classification`, поле `product_type`): тип товара STANDARD | CONFIGURABLE | BESPOKE.
- **RoomSet**, **RoomSetItem**: готовые комплекты; связь с Product many-to-many. RoomSet — отдельная сущность, не category и не collection.
- **Lead**, **BespokeRequest**: контакт и заявка на расчёт; один Lead — много BespokeRequest.
- **PaymentLink**: оплата по ссылке (entity_type: order | lead). MVP — ручное создание и обновление статуса.

---

## Product rules

| Тип | Корзина | Запрос расчёта |
|-----|--------|----------------|
| STANDARD | да | нет |
| CONFIGURABLE | да | да |
| BESPOKE | нет | да |

**BESPOKE никогда не попадает в cart flow.** Это обеспечивает backend (middleware/validation). Frontend только отображает CTA по данным с API.

**Правило по умолчанию:** обычная мебель = CONFIGURABLE. STANDARD присваивается точечно для truly non-configurable товаров.

**Оси классификации:** `kids / main / bespoke` — navigation/content axis; `STANDARD / CONFIGURABLE / BESPOKE` — purchase/business-logic axis. Не смешивать.

---

## Cart архитектура

- **cart_id** — в cookie; корзина создаётся только при первом add to cart.
- Данные корзины — только через **getCart(cartId)**. После add/remove — **refetch getCart**, отрисовка по ответу.
- Запрещено: global cart store, optimistic updates, локальные копии корзины как источник истины. Cart UI отражает только backend-confirmed state.

---

## Storefront rules

- Рендер состояний (loading, success, empty, error, not_found, cta_*, mutating и т.д.) и вызов REST API.
- CTA и ограничения корзины определяются данными backend (product_type); frontend не дублирует бизнес-правила.
- State Contract и CTA Contract — в **storefront-phase1.md**. Mutation Contract — ниже.

---

## Mutation contract

Все клиентские мутации:

1. **user action** → set pending state (например submitting, mutating).
2. **call API**.
3. **success** → refetch authoritative data (getCart и т.п.) → render final state.
4. **error** → явный feedback (сообщение, не подменять empty/not_found).

Без optimistic updates. Итог только по ответу backend.

---

## Запрещённые архитектурные изменения

- Перенос бизнес-логики во frontend (правила типов товаров, валидация корзины).
- Дублирование cart state, global cart store, optimistic cart updates.
- Новые слои: BFF, GraphQL, микросервисы, отдельный API gateway.
- Реализация Room Set через категории/коллекции Medusa вместо сущности RoomSet.
- Форк или переписывание Medusa core; обход стандартных cart/checkout flows без явного решения в docs.
- Изменение контрактов API или State Contract storefront без обновления docs.

Расширение backend — только через **modules**, **links**, **middleware**, кастомные REST-маршруты.

---

## Workflow Cursor перед изменениями

1. Прочитать задачу и сверить с **MASTER_PRD**, **mvp-scope**, **phases** (если применимо).
2. Проверить **AI_WORKING_RULES.md** (10 правил, Pre-change checklist, Red flags).
3. Убедиться: нет переноса логики во frontend, нет новых слоёв, корзина только через getCart после мутаций, RoomSet не подменяется, расширение через modules/links/middleware.
4. Спланировать обновление docs при изменении модели, API, product rules, state contract.

---

## Workflow Cursor после изменений

1. Убедиться, что код не расходится с **`docs/architecture/data-model.md`**, **`docs/architecture/api.md`**, **`docs/guidelines/product-rules.md`**, **`docs/storefront/storefront-phase1.md`** (State/CTA/Mutation).
2. При изменении архитектуры или контрактов — обновить соответствующие файлы в `docs/` и при необходимости **`docs/project/AI_CHANGELOG.md`**, **`docs/project/PROJECT_STATUS.md`**.
3. Не оставлять расхождений между документацией и реализацией.

---

## Окружение и Docker (справочно)

При настройке Medusa v2 в Docker см. **docs/MEDUSA_DOCKER_GUIDE.md**. Краткие выводы:

- **Два URL для storefront:** `NEXT_PUBLIC_MEDUSA_BACKEND_URL` — для браузера (например `http://localhost:9000`); `MEDUSA_BACKEND_URL` — для SSR/middleware (в Docker: `http://medusa:9000`, имя сервиса, не localhost).
- **Yarn 4:** в образ копировать `.yarnrc.yml` и `.yarn/`; перед любым `yarn` — `corepack enable`; таймауты — через `YARN_HTTP_TIMEOUT`, не через `yarn config`.
- **Volume при dev:** монтирование кода затирает `node_modules`; нужен отдельный volume для `node_modules` и `yarn install` в entrypoint при старте контейнера.
- **CORS и Publishable API Key:** в backend явно прописать CORS под storefront; без валидного ключа storefront не работает (запрос регионов и т.д.).
- **Env:** `docker compose restart` не перечитывает `env_file`; после смены `.env` — `docker compose up -d --force-recreate <service>`.

---

## Ссылки на docs

- **`docs/project/CODEMAP.md`** — карта проекта.
- **`docs/project/AI_WORKING_RULES.md`** — правила работы AI, checklist, red flags (если файл есть в репозитории).
- **`docs/storefront/storefront-phase1.md`** — State Contract, CTA Contract, Mutation Contract, страницы, компоненты.
- **`docs/guidelines/development-rules.md`** — обязательные правила разработки.
- **`docs/architecture/architecture-guardrails.md`** — архитектурные ограничения.
- **`docs/README.md`** — оглавление всей документации.
- **docs/MEDUSA_DOCKER_GUIDE.md** — Medusa v2 в Docker (файл может отсутствовать; см. PROJECT_STATUS).
