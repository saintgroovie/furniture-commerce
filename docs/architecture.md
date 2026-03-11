# Architecture

Источник: MASTER_PRD.md, архитектурный план.

---

## Высокоуровневая схема

- **Backend:** Medusa (один инстанс).
- **Storefront:** Next.js (публичный сайт).
- **База данных:** PostgreSQL (одна, принадлежит Medusa).
- **Админка:** Medusa Admin + кастомные расширения внутри backend. Отдельного приложения `apps/admin` нет.

Storefront и Admin общаются только с Medusa (REST). BFF и GraphQL на первом этапе не используются.

---

## Компоненты

| Компонент | Назначение |
|-----------|------------|
| Medusa | Каталог, корзина, заказы, заявки, payment links, регионы, клиенты. Единственный источник правды. |
| Next.js storefront | Каталог, карточка товара, корзина, checkout, формы заявок, Room Sets. |
| Medusa Admin | Управление товарами, заказами, категориями, Room Sets, Leads, Bespoke Requests, Payment Links. Кастомизация — расширения в backend. |
| PostgreSQL | Хранение всех данных. |

---

## Потоки данных

**Ecommerce:** Storefront → Medusa API (cart, checkout) → Order. Оплата в MVP — по Payment Link (внешний сервис); обновление статуса при необходимости вручную.

**Bespoke:** Storefront (форма) → Medusa API → Lead + BespokeRequest → в админке создаётся Payment Link → клиенту отправляется ссылка; статус оплаты при необходимости обновляется вручную.

---

## Решения

- Один backend — проще консистентность и разработка через AI.
- Админка только как расширение Medusa Admin — без отдельного приложения и дублирования логики.
- REST API со стороны Medusa — без GraphQL в MVP.
