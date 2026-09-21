# Product descriptions rewrite (2026-07-14)

**Scope:** только `product.description` в Medusa (157 SKU).  
**Не в scope:** `woodright-copy.ts`, RoomSet, SEO/UI страниц.

## Правила

- Тире только ` - `
- Убран операторский шум (ЛДСП в теле, «стоимость по заявке»)
- Greenwich: тип предмета раньше EN-имени модели
- **На каждой карточке суффикс:** `Есть варианты исполнения - уточним в заявке` (без слова «корпус»)

## Apply

```sh
cd apps/backend
# dry-run
npx medusa exec ./src/scripts/apply-product-descriptions-2026-07-14.ts

# apply
PRODUCT_DESCRIPTIONS_CONFIRM=1 npx medusa exec ./src/scripts/apply-product-descriptions-2026-07-14.ts
```

Payload: `data/content/product-descriptions-2026-07-14.json`
