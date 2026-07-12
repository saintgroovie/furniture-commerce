# Target information architecture — Woodright Admin

**Package:** A  
**Constraint:** Do not replace Medusa Admin shell unless an official extension allows it. Prefer a **Woodright** nav section + product workspace routes; keep stock Admin as fallback.

---

## Top-level (operator)

| Раздел | Назначение | Implementation |
|--------|------------|----------------|
| Главная | Операционные очереди и быстрые действия | Widget on stock dashboard + Woodright home route |
| Каталог | Товары, поиск по названию/SKU, фильтры полноты | Stock products + Woodright SKU/search route |
| Заказы | Заказы и черновики | Stock |
| Клиенты | Покупатели / группы | Stock |
| Заявки | Leads + Bespoke requests | **New** custom routes → existing Admin API |
| Комнаты | Room Sets | **New** custom routes |
| Акции | Понятный wizard + список | **New** route over stock Promotion/Campaign |
| Медиа | Очереди полноты галереи (не QA boards) | Links into Product Gallery workspace |
| Справочники | Коллекции, категории, типы | Stock + labels |
| Система | API keys, users, regions, currencies, raw diagnostics | Stock, collapsed / secondary |

Payment Links: under **Заявки** or **Заказы** context actions — not a top-level developer concept.

---

## Product Workspace (target)

Route (feature-flagged): `/app/woodright/products/:id`  
Fallback link: stock `/app/products/:id`

### Header

- Title, thumbnail, status (Черновик / Опубликован)
- Woodright type: Готовый / Настраиваемый / На заказ (see terminology map)
- Collection, variant count, price range, stock summary, gallery completeness
- Unsaved indicator, last saved, Preview, Save, Open stock page

### Tabs

1. Обзор — placement (catalog/kids/bespoke), short description, completeness checklist  
2. Варианты и цены — matrix  
3. Галерея — hero, order, associations (product-level SoT)  
4. Наличие — inventory summary  
5. Продвижение — linked promotions (read + deep link to wizard)  
6. SEO — handle, meta  
7. Служебное — metadata JSON, IDs, raw Medusa fields  

---

## What stays out of primary chrome

- Raw product UUID (technical drawer only)
- Workbook ingestion keys
- Price set internal IDs
- Promotion rule attribute names (translated in wizard)
- QA media board tooling (`/qa/...` storefront) — not Admin IA

---

## Permissions (later)

- Operator: Каталог, Заказы, Клиенты, Заявки, Акции, Медиа  
- Admin: + Система  
- Do not hide stock Admin entirely from admins
