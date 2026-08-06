# Customer timeline contract

## Reality check (audit)

Current storefront has **no** account orders. Checkout shows inline success with display number only.

## MVP surfaces

1. **Checkout success** - keep number; add deep link `/orders/track?order_id=…#token=…` when token issued (fragment only; never query).
2. **Track page** `/orders/track` — guest-safe order progress (token required).
3. Future account list — out of scope unless auth lands.

## Layout (track / detail)

Top: consolidated status (`deriveCustomerOrderStatus`).

Three blocks:

1. Оплата (derived)
2. Изготовление (process stage + customer_message + estimate)
3. Доставка (derived + tracking)

Timeline steps (buyer labels):

1. Заказ получен
2. Согласование
3. Заказ подтверждён
4. Производство
5. Проверка качества
6. Готов к передаче
7. Доставка
8. Доставлен

Customer-visible events list below.

Never show: internal_note, admin ids, raw enums, provider secrets, workflow ids.

## Loading / error / empty

- loading: «Загружаем статус заказа…»
- invalid/missing token: «Не удалось открыть заказ» + calm help (no existence leak)
- error: retry CTA

## A11y

- current step announced (`aria-current="step"`)
- status not color-only (text + tone word)
- responsive 390+
