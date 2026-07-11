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
