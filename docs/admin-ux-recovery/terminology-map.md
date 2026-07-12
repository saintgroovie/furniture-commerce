# Terminology map — operator vs Medusa

**Locale:** Russian (operator). Technical names stay in «Технические сведения».

| Оператор | Medusa / код | Notes |
|----------|--------------|-------|
| Товар | Product | |
| Вариант | Product Variant | |
| Артикул (SKU) | `variant.sku` | |
| Опция | Product Option | e.g. цвет — when modeled |
| Цена | Price (RUB) | Always show currency |
| Остаток | Inventory level | |
| Главное фото | `product.thumbnail` | Buyer hero |
| Галерея | `product.images` | Ordered frames |
| Черновик / Опубликован | `draft` / `published` | |
| Готовый | STANDARD | Cart |
| Настраиваемый | CONFIGURABLE | Cart + quote |
| На заказ | BESPOKE | Quote only; never cart |
| Коллекция | Collection | Use display labels |
| Категория | Product Category | |
| Комната | RoomSet | Custom module |
| Заявка | BespokeRequest | |
| Клиент (лид) | Lead | |
| Ссылка на оплату | PaymentLink | Manual MVP |
| Акция | Promotion | Not a price rewrite |
| Кампания | Campaign | Grouping for promotions |
| Промокод | Promotion code rule | |
| Витрина | Storefront | Preview link |
| Служебные данные | metadata / IDs | Collapsed |
| Главное фото (= главное изображение) | `product.thumbnail` | Single term in UI: «Главное фото» |
| Параметры варианта | Variant options (`variant.options`) | Combination must be unique |
| Акции товара | Product workspace tab (promotions with explicit product/collection rules) | Tab «Акции товара» |
| Акции (раздел) | Woodright promotions list `/app/woodright/promotions` | Dashboard / widget / deep link (not a second sidebar peer) |
| Рабочий стол Woodright | Dashboard `/app/woodright` | Package F landing |
| Стандартная админка Medusa | Stock Medusa Admin `/app` | The only approved label for stock links (F-01) |

## Promotion statuses (Package E, operator labels)

Raw field is `status: draft | active | inactive`; campaign dates/budget refine it.

| UI | Kind (code) | Source |
|----|-------------|--------|
| Черновик | `draft` | `promotion.status = draft` |
| Выключена | `inactive` | `promotion.status = inactive` |
| Действует | `active` | `status = active`, campaign window open |
| Запланирована | `scheduled` | `status = active`, campaign starts in the future |
| Завершена | `expired` | `status = active`, campaign ended |
| Бюджет исчерпан | `budget_exhausted` | campaign spend budget used up |
| Лимит применений исчерпан | `usage_exhausted` | campaign usage budget used up |
| Ошибка настройки | `invalid` | e.g. campaign ends before it starts |
| Статус не определён | `unknown` | unexpected raw status |

«Требуют внимания» in the promotions list = `invalid`, `unknown`, `budget_exhausted`, `usage_exhausted` (plus unsupported promotion shapes). There is **no server-side global counter** for these statuses - the list filter counts only the loaded page.

## Forbidden in primary UI copy

- price set, application method, rule attribute, workflow, module, link definition  
- raw HTTP status as the only message  
- “payload”, “endpoint”, “null”, “undefined”  

## Status enums (BespokeRequest)

Docs use Russian labels; code uses English enums — map in UI:

| UI | Code (example) |
|----|----------------|
| Новая | `new` |
| Связались | `contacted` |
| … | follow model in `bespoke-request` module |
