# System Boundaries — Woodright

Этот документ фиксирует архитектурные границы проекта Woodright. Нарушение этих границ требует явного архитектурного решения и обновления документации.

---

## 1. Граница системной архитектуры

Архитектура проекта:

- один backend (single backend)
- тонкий storefront (thin storefront)
- REST API

Запрещено:

- вводить BFF-слой
- вводить GraphQL
- вводить микросервисы
- разделять backend на несколько сервисов без архитектурного решения

Backend — Medusa. Storefront — Next.js.

---

## 2. Доменная граница

Доменные сущности:

- Product
- ProductClassification
- RoomSet
- RoomSetItem
- Lead
- BespokeRequest
- PaymentLink

RoomSet является отдельной сущностью.

Запрещено:

- представлять RoomSet как category
- представлять RoomSet как collection
- превращать RoomSet в обычный product

---

## 3. Граница бизнес-логики

Backend владеет бизнес-логикой.

Frontend не должен:

- реализовывать доменные правила
- принимать решения о допустимости операций
- дублировать правила cart или checkout

Frontend может только:

- отображать состояния
- вызывать API

---

## 4. Граница корзины (Cart)

Корзина контролируется backend.

Frontend не должен:

- хранить собственную копию корзины
- делать optimistic cart updates
- поддерживать global cart store

Авторитетное состояние корзины — только на backend.

---

## 5. Граница поведения товара (Product)

ProductClassification (таблица `product_classification`, поле `product_type`) определяет поведение товара:

- STANDARD → корзина
- CONFIGURABLE → корзина + запрос расчёта
- BESPOKE → только запрос расчёта

По умолчанию обычная мебель считается CONFIGURABLE. Тип STANDARD присваивается точечно для truly non-configurable товаров.

Frontend может отображать CTA, но backend остаётся источником истины.

Оси классификации не смешивать:

- `kids / main / bespoke` — navigation/content axis (структура сайта, будущее направление)
- `STANDARD / CONFIGURABLE / BESPOKE` — purchase/business-logic axis (поведение корзины и CTA)

---

## 6. Граница API

Storefront взаимодействует с backend только через REST API.

Запрещено:

- прямое обращение к базе данных
- обход Medusa flows
- дублирование бизнес-логики API

---

## 7. Граница расширения (Extension)

Backend расширяется только через:

- modules
- links
- middleware

Запрещено:

- форкать Medusa core
- переписывать Medusa flows без необходимости

---

## 8. Граница сложности

Архитектура должна оставаться простой.

Запрещено добавлять:

- enterprise abstraction layers
- избыточные архитектурные паттерны
- преждевременную оптимизацию

Предпочитать:

- простые решения
- расширения Medusa
- тонкий storefront

---

## 9. Граница документации

Любое изменение архитектуры требует обновления:

- /docs/architecture/architecture.md
- /docs/architecture/data-model.md
- /docs/architecture/api.md
- /docs/storefront/storefront-phase1.md
- /docs/project/PROJECT_STATUS.md
- /docs/project/AI_CHANGELOG.md

При изменении границ системы — обновить настоящий документ (SYSTEM_BOUNDARIES.md).

Документация является source of truth.

---

## 10. Эскалация изменений

Если изменение затрагивает system boundaries:

1. Остановиться.
2. Проверить архитектурные документы (`architecture/architecture.md`, `architecture/architecture-guardrails.md`, `guidelines/development-rules.md`).
3. Предложить архитектурное решение и зафиксировать его в docs.
4. Обновить документацию.

Только после этого менять код.
