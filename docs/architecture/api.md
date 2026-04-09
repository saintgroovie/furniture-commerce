# API

Высокоуровневое описание контрактов. Без кода. Источник: MASTER_PRD.md.

---

## Общее

- Все API — REST, со стороны Medusa.
- Storefront и Medusa Admin обращаются только к Medusa (свои и стандартные эндпоинты).
- Аутентификация: по стандартному механизму Medusa (session/token для админки, при необходимости для storefront — гостевой checkout).

---

## Каталог и товары

- Продукты: список, фильтр по категории, по `product_type` (STANDARD, CONFIGURABLE, BESPOKE).
- Продукт по id/slug: детали, варианты, опции, цены.
- Категории: дерево для навигации и фильтров.

---

## Корзина и заказы

- Cart: CRUD, добавление/удаление line items. При добавлении в корзину — проверка `product_type`: BESPOKE не допускается; при нарушении — ошибка 4xx и понятное сообщение.
- Checkout: адрес, доставка, создание заказа (или draft order при оплате по ссылке). Без приёма оплаты на сайте в MVP.

---

## Room Sets

- Список: GET (активные Room Sets, при необходимости фильтры).
- Детали: GET по slug или id (Room Set + вложенные продукты).
- Только чтение со стороны storefront; изменения — через Medusa Admin.

---

## Заявки (Lead и BespokeRequest)

- Создание Lead: POST (контакты, source, comment, payload). Возврат id созданного Lead.
- Создание BespokeRequest: POST (lead_id, опционально product_id, room_set_id, описание/размеры/материалы/бюджет/комментарий). Один Lead может иметь несколько BespokeRequest.
- Список/детали для админки: GET (Leads, BespokeRequests). PATCH bespoke-request по id: обновление status, internal_notes, quoted_at.

---

## Payment Link

- Создание: POST (entity_type, entity_id, amount, currency, purpose, опционально expires_at). Backend генерирует или сохраняет url, возвращает сущность PaymentLink.
- Список/детали: GET для админки.
- Обновление статуса: PATCH (в MVP — вручную, например paid/expired). Webhook от платёжного провайдера не обязателен на первом этапе.

---

## Регионы и доставка

- Регион: один (РФ), валюта RUB. Стандартные эндпоинты Medusa для регионов и опций доставки (если используются).
