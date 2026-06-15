# Launch A request mode policy

**Generated:** 2026-06-15T17:04:53.281Z

## Launch A (Option A)

Быстрый запуск каталога/заявки без блокера онлайн-оплаты и без фейковых tier-цен.

### Pricing

- Workbook `price_rub` → `reference_price_rub` / `source_price_rub`
- Отображение: **«Цена от … ₽»** + уточнение исполнения
- Tier-цены не выдумываются; cheaper tier не считается по формуле
- Итоговая цена — **подтверждение менеджера**

### Material tiers (metadata)

1. **solid_full** — Полностью массив  
2. **solid_front_ldsp_body** — Фронты массив + боковины/задники ЛДСП  

На Launch A: только labels + metadata. Полные variants — post-launch.

### Payment

- Онлайн-оплата: **не требуется**
- Checkout capture: **нет**
- Поток: заявка → менеджер → подтверждение цены/сроков/исполнения

### Blockers vs post-launch

**Launch blockers:** UI request flow, catalog products exist, media apply (отдельные гейты)

**Not blockers (Option A):** full tier seed, exact tier prices, online payment

JSON: `launch-a-request-mode-policy.json`
