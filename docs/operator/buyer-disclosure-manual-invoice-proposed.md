# Proposed buyer disclosure - manual invoice (not wired to live runtime)

Status: **proposal for owner review only**  
Do not treat as live storefront copy until a later cycle explicitly connects it.

## Intent

Honest checkout confirmation when payment mode is manual invoice / manager payment link.

## Proposed success block

```text
Заказ отправлен менеджеру

Менеджер подтвердит наличие, стоимость и сроки
Способ оплаты согласуем после подтверждения

Отправка формы не означает автоматическую оплату
Онлайн-оплата на сайте сейчас не выполняется
```

## Proposed form clarity (supporting)

```text
Сейчас оплачивать заказ на сайте не нужно
После проверки менеджер свяжется и передаст способ оплаты
```

## Forbidden claims (must not appear)

- онлайн-оплата доступна
- заказ уже оплачен
- email обязательно придёт
- заказ автоматически принят продавцом без проверки менеджером

## Current live copy (reference)

Live storefront already uses similar honesty in `checkoutCopy` / `/payment` legal page under `manual_invoice`. This proposal is a review packet alignment artifact, not a runtime edit in this cycle.
