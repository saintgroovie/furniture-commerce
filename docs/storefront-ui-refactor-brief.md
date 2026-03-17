# Storefront UI Refactor Brief

Практический implementation plan для поэтапного UI-рефакторинга storefront Woodright.
Основан на анализе текущего кода и design docs:
- `storefront-design-implementation-rules.md`
- `storefront-page-patterns.md`
- `storefront-component-principles.md`

---

## 1. Summary

Текущий storefront — функциональный MVP с корректной архитектурой (thin client, no business logic, proper state handling). Бизнес-логика и API-взаимодействие трогать не нужно.

Главные UI-проблемы: **cool gray palette** вместо тёплой, **system fonts** вместо premium typography, **разрозненные inline styles** вместо spacing system, **сырые `<img>` теги** вместо оптимизированных изображений, **текстовая homepage** без визуального impact.

Рефакторинг строится по принципу **foundation → tokens → components → pages** — каждая фаза безопасна, не трогает поведение, и даёт видимый результат.

---

## 2. Current UI Assessment

### 2.1. Color Palette — Cold, Generic

| Текущее | Проблема | Целевое (из design rules) |
|---------|----------|--------------------------|
| `--color-fg: #1a1a1a` | Cool near-black, no warmth | HSL(25°, 20%, 15%) — warm near-black |
| `--color-fg-secondary: #4b5563` | Tailwind slate/gray-600 — cold blue-gray | HSL(25°, 12%, 40%) — warm gray |
| `--color-fg-muted: #6b7280` | Tailwind gray-500 — cold | HSL(25°, 8%, 50%) — warm muted |
| `--color-accent: #2563eb` | Bright blue — startup/DTC, не premium furniture | Warm dark for CTAs; links inherit text color |
| `--color-border: #e5e7eb` | Tailwind gray-200 — cold | HSL(30°, 10%, 88%) — warm light gray |
| `--color-bg: #fafafa` | Cold neutral gray | HSL(35°, 15%, 97%) — warm white |
| `--color-success: #059669` | Bright emerald — high saturation | Desaturated warm green |
| `--color-error: #dc2626` | Alarm red — high saturation | Warm desaturated red |

**Вердикт:** вся палитра — дефолтные Tailwind cool grays. Ни одного тёплого тона. Это #1 blocker для premium feel.

### 2.2. Typography — System Fonts, Heavy Weights

| Проблема | Где в коде | Эффект |
|----------|-----------|--------|
| System font stack only | `globals.css:26` | Generic look, нет brand character |
| h1 weight 700 (bold) | `globals.css:52` | Heavy, marketplace feel. Design rules: 500–600 |
| h2 weight 600, h3 weight 600 | `globals.css:56-63` | Acceptable but could be 500 for subtlety |
| No custom font loaded | `package.json` — no `next/font`, no Google Fonts | Максимальный visual upgrade с минимальным code change |
| Button font 0.875rem (14px) | `globals.css:157` | Slightly small for premium; should be 0.9–1rem |

### 2.3. Spacing — Arbitrary Inline Styles

На данный момент **нет spacing tokens** в CSS custom properties. Все значения — adhoc.

Обнаружено 25+ inline `style={}` атрибутов в компонентах:

| Файл | Inline styles |
|------|---------------|
| `product-card.tsx` | `marginTop: "0.5rem"` × 2 |
| `room-set-card.tsx` | `fontSize: "0.8rem"`, `marginTop: "0.25rem"`, `marginTop: "0.5rem"` × 2 |
| `product/[id]/page.tsx` | `marginTop: "0.5rem"`, `fontSize: "1.35rem"` |
| `rooms/[slug]/page.tsx` | `marginTop: "0.5rem"`, `marginTop: "0.75rem"`, `marginTop: "1.5rem"` |
| `rooms/page.tsx` | `marginTop: "1.5rem"` |
| `catalog/page.tsx` | `marginTop: "0.5rem"`, `marginTop: "1rem"` × 2 |
| `cart-summary.tsx` | `height: "4rem"` × 2, `height: "3rem"`, `marginTop: "0.5rem"`, `marginTop: "1rem"`, `marginTop: "1.5rem"`, inline flex layout |
| `checkout-form.tsx` | `marginTop: "0.5rem"`, `marginTop: "0.75rem"`, `marginTop: "1rem"`, `height: "6rem"`, `height: "12rem"`, `marginTop: "1.5rem"` |
| `bespoke-form.tsx` | `marginTop: "1rem"` |

**Вердикт:** пространственный ритм — случайный. Нет consistency. Нужны CSS utility classes для spacing.

### 2.4. Images — Unoptimized, Too Small

| Проблема | Где | Эффект |
|----------|-----|--------|
| Raw `<img>` tags everywhere | product-card, room-set-card, PDP | Нет lazy loading, нет responsive sizes, нет WebP/AVIF, нет width/height → CLS |
| Fixed `height: 200px` для card images | `globals.css:219` `.card-img` | Мелкие изображения для мебели 50 000+ ₽. Aspect ratio не controlled |
| PDP image aspect 4:3 | `globals.css:458` `.product-detail-img` | Мебель лучше показывать в 4:5 или 3:4 portrait |
| No image placeholder | product-card рендерит nothing если нет thumbnail | Broken layout в grid без изображений |
| Room set hero_image not shown on detail page | `rooms/[slug]/page.tsx` | Hero image есть в данных, но не рендерится |
| No Next.js `<Image>` component | package.json — next доступен, но Image не используется | Потеря всех built-in optimizations |

### 2.5. Homepage — Text Only, No Visual Impact

```
Текущая homepage:
┌──────────────────┐
│   h1: "Мебель     │
│    на заказ"      │
│                   │
│   paragraph       │
│                   │
│  [Каталог] [Комн] │
│  [Заявка]         │
└──────────────────┘
```

Нет: hero image, категорий, room sets preview, bespoke CTA section, trust elements. Это текстовая заглушка, а не homepage мебельного бренда.

### 2.6. Product Card — Information Overload, Weak Image

| Проблема | Код | Design rules |
|----------|-----|-------------|
| Description в карточке | `product-card.tsx:53-56` | Карточка = image + name + price. Description — только на PDP |
| Link только на title, не на всю карточку | `product-card.tsx:46` | Вся карточка должна быть clickable |
| Badge показывает raw type ("STANDARD") | `product-card.tsx:48` | Не user-facing. Показывать только "На заказ" для BESPOKE |
| Маленькое изображение (200px height) | `.card-img` | Для мебели нужно больше: aspect-ratio 4:5 минимум |

### 2.7. Mobile — Almost No Responsive Design

| Проблема | Где | Эффект |
|----------|-----|--------|
| Нет hamburger menu | `layout.tsx:38-43` | На мобильном 4 горизонтальные ссылки — сжатые, трудно нажать |
| Только один breakpoint (768px) | `globals.css:448` — только для product-detail | Grid, hero, forms — не адаптируются |
| Нет mobile-first CSS | Весь CSS — desktop-first | Конфликт с design rules |
| Filter tabs не скроллятся | `globals.css:287` flex-wrap | На мобильном tabs переносятся на две строки, теряют аккуратность |

### 2.8. Code Quality Issues (Visual Only)

| Проблема | Где | Влияние на рефакторинг |
|----------|-----|----------------------|
| `formatRub` дублирована в 4 файлах | product-card, product/[id], cart-summary, checkout-form | Вынести в shared utility |
| `getPrice` дублирована в 2 файлах | product-card, product/[id] | Вынести в shared utility |
| `.btn-primary:hover` → hardcoded `#333` | `globals.css:174` | Должен быть через token |
| `.filter-tab-active:hover` → hardcoded `#333` | `globals.css:319` | Должен быть через token |
| Card hover shadow → `rgba(0,0,0,0.06)` | `globals.css:210` | Должен быть warm tone |

### 2.9. What Works Well (Keep)

| Элемент | Почему хорош |
|---------|-------------|
| Architecture: thin client, no business logic | Полностью correct. Не трогать |
| State contracts (data-state attributes) | Прозрачная state machine. Полезно для тестирования |
| CTA branching по product_type | Правильно реализовано. Не трогать логику |
| Cart/checkout state management | Proper loading/error/success/empty/invalid states |
| SEO: metadata, JSON-LD | Корректно. Не трогать |
| BespokeForm: ref guard для double-submit | Правильно. Не трогать |
| Room set CTA: eligible items filtering | Business logic correct. Не трогать |
| CSS custom properties approach | Правильный подход; нужно только заменить значения |

---

## 3. Refactor Priorities (Ranked by Impact)

### 3.1. High Impact / Low Risk

Изменения, которые дают максимальный визуальный эффект при минимальном риске сломать поведение.

| # | Задача | Файлы | Эффект | Риск |
|---|--------|-------|--------|------|
| 1 | **Заменить color tokens на warm palette** | `globals.css` — `:root` block only | Мгновенное изменение всего сайта. Из cold-generic в warm-premium | Zero — только CSS values меняются |
| 2 | **Подключить custom font через `next/font`** | `layout.tsx`, `globals.css` | Brand character. Самый заметный single upgrade | Zero — `next/font` is built-in, no new dependencies |
| 3 | **Добавить spacing tokens в `:root`** | `globals.css` — add variables | Foundation для дальнейшего cleanup inline styles | Zero — additive change |
| 4 | **Typography weights: h1 700→500, general adjustment** | `globals.css` — heading rules | Из "marketplace bold" в "premium medium" | Zero — cosmetic only |
| 5 | **Убрать description из ProductCard** | `product-card.tsx` — remove 4 lines | Чистые карточки, image-first | Zero — display-only removal |
| 6 | **Сделать ProductCard fully clickable** | `product-card.tsx` — wrap in `<Link>` | UX improvement, larger tap target | Low — только HTML structure |

### 3.2. Medium Impact / Medium Risk

Изменения, требующие немного больше работы, но дающие значимое улучшение.

| # | Задача | Файлы | Эффект | Риск |
|---|--------|-------|--------|------|
| 7 | **Заменить все `<img>` на Next.js `<Image>`** | product-card, room-set-card, product/[id] | Performance, CLS prevention, lazy loading, responsive | Medium — нужно добавить `next.config.js` image domains, задать width/height |
| 8 | **Увеличить card image area, задать aspect-ratio** | `globals.css` — `.card-img` | Bigger images → better product evaluation | Low — CSS only |
| 9 | **Добавить mobile hamburger menu** | `layout.tsx`, `globals.css` + возможно client component | Mobile usability | Medium — нужен client component для toggle state |
| 10 | **Заменить inline styles на CSS classes** | Все компоненты (25+ мест) | Consistency, maintainability | Low per change, medium total effort |
| 11 | **Badge: показывать readable labels, убрать для STANDARD** | `product-card.tsx`, `product/[id]` | Более user-friendly, менее noisy | Low — display logic only, не business logic |
| 12 | **PDP: увеличить image area до 55-60%** | `globals.css` — `.product-detail` grid | Больше impact для главного selling element | Zero — CSS only |
| 13 | **Room set detail: рендерить hero_image** | `rooms/[slug]/page.tsx` | Visual impact для страницы, которая сейчас text-only | Low — данные уже приходят с backend |
| 14 | **Вынести `formatRub` и `getPrice` в shared utils** | Создать `lib/format.ts`, update imports | DRY, maintainability | Low — mechanical refactor |

### 3.3. Later / Optional (Phase 2+ or Content-Dependent)

| # | Задача | Почему позже |
|---|--------|-------------|
| 15 | Homepage с секциями (categories, room sets, bespoke CTA) | Требует real content, images, copywriting. Без контента — placeholder hell |
| 16 | PDP gallery (multiple images) | Требует real product photography. С seed data — одно изображение |
| 17 | Room set card differentiation (larger, editorial format) | Дизайн зависит от наличия quality room photography |
| 18 | Skeleton loading для route-level Suspense | Polish, не critical. Можно добавить `loading.tsx` для каждого route |
| 19 | Image placeholder component | Нужен, но зависит от решения о placeholder design |
| 20 | Footer redesign | Low impact пока нет real content (контакты, links) |
| 21 | Filter UI refinement (chip style → flat tabs) | Functional, works. Polish later |
| 22 | Responsive breakpoints expansion (sm, lg, xl) | Сейчас одного md breakpoint + auto-fill grid достаточно |

---

## 4. Component Refactor Order

Порядок определяется dependencies: что должно быть готово, чтобы следующее работало корректно.

```
1. globals.css (:root tokens)        — foundation для всего
   ├── color tokens
   ├── spacing tokens
   ├── typography adjustments
   └── container/grid updates
        ↓
2. layout.tsx (font, header)         — виден на каждой странице
   ├── next/font setup
   └── header nav cleanup
        ↓
3. product-card.tsx                  — самый частый компонент
   ├── clickable card
   ├── remove description
   ├── badge cleanup
   ├── image optimization
   └── spacing classes
        ↓
4. room-set-card.tsx                 — аналогичная структура
   ├── image optimization
   ├── spacing classes
   └── clickable card
        ↓
5. product-cta.tsx                   — используется на PDP
   └── spacing classes only (логику не трогать)
        ↓
6. room-set-cta.tsx                  — аналогично
   └── spacing classes only
        ↓
7. bespoke-form.tsx                  — spacing, button label
   └── "Отправить" → "Отправить заявку"
        ↓
8. cart-summary.tsx                  — spacing, inline style cleanup
   └── заменить inline styles на classes
        ↓
9. checkout-form.tsx                 — spacing, inline style cleanup
   └── заменить inline styles на classes
```

**Shared utilities (parallel):**
- `lib/format.ts` — `formatRub`, `getPrice` — вынести до начала component refactor

---

## 5. Page Refactor Order

| Порядок | Страница | Почему в этом порядке |
|---------|----------|----------------------|
| 1 | **Catalog (PLP)** | Использует ProductCard — если card refactored, каталог автоматически улучшается. Нужно: убрать inline styles, проверить grid |
| 2 | **Product (PDP)** | High traffic page. Нужно: image aspect ratio, info layout, spacing. Логику CTA не трогать |
| 3 | **Rooms listing** | Использует RoomSetCard — если card refactored, listing автоматически улучшается |
| 4 | **Room set detail** | Нужно: показать hero_image, spacing cleanup. CTA логику не трогать |
| 5 | **Cart** | Spacing cleanup, inline style removal. Логику не трогать |
| 6 | **Bespoke** | Minimal changes: spacing, button label. Логику не трогать |
| 7 | **Checkout** | Minimal changes: spacing, payment note перед submit. Логику не трогать |
| 8 | **Homepage** | Последняя: требует контент (images, copy). Пока — обновить hero spacing и typography. Секции — только при наличии контента |

---

## 6. Dependencies and Prerequisites

### Must Be Done First (Before Any Component)

| Prerequisite | Почему |
|-------------|--------|
| Color tokens in `:root` | Все компоненты наследуют цвета. Менять потом — double work |
| Spacing tokens in `:root` | Нужны CSS classes для замены inline styles |
| Font setup in `layout.tsx` | Шрифт affects sizing, spacing, overall feel |
| `lib/format.ts` shared utilities | Убрать дублирование до начала component edits |

### Must Be Done Before Image Refactor

| Prerequisite | Почему |
|-------------|--------|
| `next.config.js` — image domains config | `<Image>` не работает с external domains без конфигурации |
| Определить aspect ratios | Карточки должны иметь consistent ratio до массовой замены |

### Can Be Done Independently (Parallel)

| Задача | Не зависит от |
|--------|--------------|
| Mobile hamburger menu | Можно делать параллельно с card refactor |
| Button style updates | Можно делать в рамках token update |
| Badge label cleanup | Можно делать в рамках card refactor |

---

## 7. Design-to-Code Mapping

### 7.1. Shared Styles (globals.css)

| Design Rule | Implementation Task |
|-------------|-------------------|
| Warm color palette | Replace all 8 color tokens in `:root` |
| Spacing scale (xs → 3xl) | Add 7 `--space-*` custom properties |
| Typography: weight 500 for h1 | Change `h1 { font-weight: 700 }` → `500` |
| Typography: type scale adjustments | Update h1, h2, h3 sizes and line-heights |
| Container max-width 1200px | Change `--max-width: 1100px` → `1200px` |
| Card image aspect ratio | Change `.card-img` from fixed height to `aspect-ratio: 4/5` |
| Button font size 1rem | Change button font-size from 0.875rem to 0.9375rem or 1rem |
| Button border-radius 4-6px | Current 6px — acceptable, keep |
| Filter tab border-radius | Change from `999px` (pill) to `var(--radius-sm)` (6px) |
| Hover colors via tokens | Replace hardcoded `#333` with token-derived values |
| Focus ring warm-toned | Change focus box-shadow from blue to warm accent |

### 7.2. Component API Cleanup

| Design Rule | Implementation Task |
|-------------|-------------------|
| Product card: image-first, no description | Remove description rendering from `product-card.tsx` |
| Product card: fully clickable | Wrap card in `<Link>` or use CSS to make entire card clickable |
| Badge: readable labels | Map STANDARD→hide, CONFIGURABLE→"Конфигурируемый", BESPOKE→"На заказ" |
| Room set detail: show hero image | Add `<img>`/`<Image>` for `roomSet.hero_image` in `rooms/[slug]/page.tsx` |
| Bespoke button label | Change "Отправить" → "Отправить заявку" |

### 7.3. Layout Refactor

| Design Rule | Implementation Task |
|-------------|-------------------|
| PDP: image 55-60% width | Change `.product-detail` grid-template-columns to `3fr 2fr` |
| PDP: image aspect 4:5 | Change `.product-detail-img` aspect-ratio from `4/3` to `4/5` |
| Mobile header: hamburger | Create `MobileNav` client component; update `layout.tsx` |
| Spacing utility classes | Add `.mt-sm`, `.mt-md`, etc. or use spacing tokens in component classes |
| Room set items: product links | Wrap item titles in `<Link>` to `/product/[id]` |

### 7.4. Content-Aware Adjustments (Wait for Content)

| Design Rule | Implementation Task | Dependency |
|-------------|-------------------|------------|
| Homepage sections (categories, room sets, bespoke CTA) | Server component fetching data + new section components | Нужны real images, copy |
| PDP gallery (multi-image) | Gallery component with thumbnails | Нужны multiple product photos |
| Room set card: editorial format, larger | Different card layout and grid | Нужны quality room photos |
| Image placeholders | Placeholder component | Определить placeholder design |

### 7.5. Image Handling Improvements

| Design Rule | Implementation Task |
|-------------|-------------------|
| Use Next.js `<Image>` | Replace all `<img>` with `<Image>` from `next/image` |
| Configure external images | Add `images.remotePatterns` in `next.config.js` |
| Set explicit width/height | Prevent CLS by defining dimensions |
| Responsive `sizes` attribute | Add `sizes` for grid context (e.g., `(max-width: 768px) 100vw, 33vw`) |
| Consistent aspect ratios | CSS `aspect-ratio` on image containers |

---

## 8. Phased Implementation Plan

### Phase A: Foundation Polish

**Цель:** установить visual foundation — палитру, типографику, spacing tokens — чтобы всё последующее строилось на правильной основе.

**Scope:**

1. Заменить все color tokens в `:root` на warm palette.
2. Подключить custom font через `next/font` в `layout.tsx`.
3. Добавить spacing tokens (`--space-xs` → `--space-3xl`) в `:root`.
4. Обновить heading weights (h1: 700 → 500).
5. Обновить button font-size (0.875rem → 0.9375rem).
6. Заменить hardcoded hover colors (#333) на token-derived значения.
7. Обновить focus ring color с blue на warm accent.
8. Увеличить `--max-width` с 1100px до 1200px.
9. Создать `lib/format.ts` и вынести `formatRub` + `getPrice`.
10. Уменьшить filter tab border-radius с pill (999px) до flat (6px).

**Why now:** всё остальное наследует эти tokens. Без этого — double work.

**What not to touch:**
- Никакую JS/TS логику компонентов.
- Не менять HTML structure.
- Не трогать API calls, state management, routing.

**Expected outcome:** сайт визуально "потеплеет", типографика станет спокойнее, общее ощущение сдвинется от generic к premium. При этом layout, content, behavior — идентичны.

---

### Phase B: Catalog and Card System

**Цель:** привести product card и catalog к target quality. Это самые visible и repeated компоненты.

**Scope:**

1. `product-card.tsx`:
   - Сделать всю карточку clickable (wrap в `<Link>`).
   - Убрать description.
   - Badge: показывать только для BESPOKE ("На заказ"), скрыть для STANDARD.
   - Заменить inline styles на CSS classes с spacing tokens.
   - Заменить `<img>` на `<Image>` (при готовности Phase A).
2. `room-set-card.tsx`:
   - Сделать всю карточку clickable.
   - Заменить inline styles на CSS classes.
   - Заменить `<img>` на `<Image>`.
3. `globals.css`:
   - `.card-img`: заменить `height: 200px` на `aspect-ratio: 4/5` (или 1/1).
   - Добавить CSS utility classes для spacing (`mt-sm`, `mt-md`, `mt-lg` etc., или dedicated component classes).
4. `next.config.js`: добавить `images.remotePatterns` для backend image domains.
5. `catalog/page.tsx`: заменить inline styles на CSS classes.
6. `rooms/page.tsx`: заменить inline styles.

**Why now:** cards и catalog — самые частые точки контакта. Рефакторинг здесь multiplied by every product.

**What not to touch:**
- Filter logic (URL params, type filtering) — works correctly.
- Product type labels map — functional, keep.
- JSON-LD generation — works correctly.
- `getProducts` API call — correct.

**Expected outcome:** каталог выглядит как premium furniture grid, а не generic card layout. Крупные изображения, чистые карточки, единый ритм.

---

### Phase C: PDP and Room Sets

**Цель:** улучшить две ключевые detail-страницы: товар и комплект комнаты.

**Scope:**

1. `product/[id]/page.tsx`:
   - Image grid: `1fr 1fr` → `3fr 2fr` (55/45 split).
   - Image aspect: 4/3 → 4/5.
   - Заменить `<img>` на `<Image>`.
   - Заменить inline styles на CSS classes.
   - Badge: readable label.
2. `rooms/[slug]/page.tsx`:
   - Добавить рендеринг `hero_image` (данные уже в ответе backend).
   - Добавить ссылки на PDP для товаров в составе комплекта.
   - Заменить inline styles.
3. `product-cta.tsx`:
   - Только spacing cleanup (inline styles → classes).
   - **Не менять CTA logic, state management, API calls.**
4. `room-set-cta.tsx`:
   - Только spacing cleanup.
   - **Не менять eligible items logic, buy set flow, error handling.**

**Why now:** PDP — где принимается решение о покупке. Room set — ключевое conversion flow. Но зависит от Phase B (cards, images).

**What not to touch:**
- `ProductCta` state machine (adding/success/error).
- `RoomSetCta` state machine.
- `handleAddToCart` / `handleBuySet` implementations.
- `getCartEligibleItems` logic.
- Price extraction logic (`getPrice`).
- generateMetadata implementations.

**Expected outcome:** PDP — крупное изображение, spacious layout, confident typography. Room set — visual hero, clickable products in composition.

---

### Phase D: Cart, Checkout, Bespoke Refinement

**Цель:** привести utility-страницы к тому же visual standard без изменения behavior.

**Scope:**

1. `cart-summary.tsx`:
   - Заменить все inline styles (6+ мест) на CSS classes.
   - Skeleton: использовать CSS classes вместо inline height.
   - **Не менять state machine, handleRemove, cart loading logic.**
2. `checkout-form.tsx`:
   - Заменить все inline styles (6+ мест).
   - Добавить payment note **перед** submit button (не только после success).
   - Skeleton: CSS classes.
   - **Не менять state machine, handleSubmit, validation, completeCart.**
3. `bespoke-form.tsx`:
   - Button label: "Отправить" → "Отправить заявку".
   - Заменить inline styles.
   - **Не менять form submission logic, ref guard, lead/bespoke-request creation.**
4. `cart/page.tsx`, `checkout/page.tsx`, `bespoke/page.tsx`:
   - Spacing adjustments.

**Why now:** после Phase A-C эти страницы будут визуально inconsistent. Phase D выравнивает.

**What not to touch:**
- Cart state management (loading/empty/ready/mutating/error/invalid_state).
- Checkout state management (all 8 states).
- BespokeForm submission flow (createLead → createBespokeRequest).
- Cookie session management.
- Validation logic.

**Expected outcome:** единообразный spacing, typography и цвет на всех страницах. Utility-страницы выглядят как часть одного бренда.

---

### Phase E: Content-Driven Final Pass

**Цель:** final visual polish, который имеет смысл только при наличии реального контента.

**Scope (при наличии контента):**

1. Homepage секции:
   - Hero с brand image.
   - Category cards (нужны category images).
   - Featured room sets (нужны hero images комнат).
   - Bespoke CTA section.
2. PDP gallery (multi-image switching) — при наличии нескольких фото на товар.
3. Room set card: editorial format (крупнее, immersive) — при наличии quality room photos.
4. Image placeholder component — для товаров/комнат без фото.
5. `loading.tsx` для ключевых routes.

**Why later:** без реального контента (фото, копирайтинг) эти улучшения — placeholder hell. Homepage с placeholder image хуже, чем text-only homepage. Gallery с одной фотографией — бессмысленна.

**What not to touch:**
- Architecture.
- Backend.
- API contracts.
- State management patterns.

**Expected outcome:** полноценный premium storefront с реальным content. Но только если контент готов.

---

## 9. Key Risks

### 9.1. Risk: Accidentally Changing Behavior

| Зона риска | Как проявляется | Как избежать |
|-----------|----------------|-------------|
| ProductCta refactor | Случайно сломать CTA branching по product_type | **Не менять условия** `if (productType === "BESPOKE")` и `if (productType === "CONFIGURABLE")`. Только CSS/spacing |
| RoomSetCta refactor | Случайно сломать eligible items filtering | **Не менять** `getCartEligibleItems()`. Только CSS/spacing |
| CartSummary refactor | Случайно сломать state transitions | **Не менять** `useEffect`, `handleRemove`, `viewState` logic. Только CSS/spacing |
| CheckoutForm refactor | Случайно сломать form submission | **Не менять** `handleSubmit`, state machine, `completeCart` call |
| Badge display change | Выглядит как "display logic" но может быть business logic | Badge — display only. Не трогать `custom_product_type` access pattern |

**Rule of thumb:** если строка содержит `useState`, `useEffect`, `await`, `fetch`, `ensureCart`, `addLineItem`, `createLead`, `createBespokeRequest`, `getCart`, `updateCart`, `completeCart` — **не трогать**.

### 9.2. Risk: Introducing Frontend Logic

| Зона риска | Пример нарушения | Правильный подход |
|-----------|-------------------|-------------------|
| Badge label mapping | Добавить "Хит продаж" badge на основе frontend условия | Badge labels — mapping от backend data. Не добавлять frontend-only badges |
| Price formatting | Добавить "скидка" calculation на frontend | Цена приходит от backend. Frontend только форматирует |
| Product card filtering | Скрывать BESPOKE товары из каталога на frontend | Фильтрация — backend (query params). Frontend рендерит всё, что получил |
| Room set "available" logic | Добавить frontend проверку "есть ли варианты в наличии" | Наличие — backend concern |

### 9.3. Risk: Polish Without Real Consistency

| Зона риска | Как проявляется | Как избежать |
|-----------|----------------|-------------|
| Inline styles → random classes | Заменить `marginTop: "0.5rem"` на `.custom-margin-product-card-price` | Использовать spacing tokens. Одинаковый gap = одинаковый class |
| Inconsistent image handling | Одни карточки с `<Image>`, другие с `<img>` | Менять все карточки за один commit/phase |
| Mixed font weights | Часть headings 700, часть 500 | Менять все heading weights в globals.css одновременно |

### 9.4. Risk: Content-Dependent Work Done Too Early

| Зона | Почему ждать |
|------|-------------|
| Homepage sections | Без images/copy — placeholder sitefeels worse than text-only |
| Gallery component | С одной фотографией gallery бессмысленна |
| Room set editorial card | Без quality room photography — визуально не лучше текущего |

---

## 10. Recommended Immediate Next Coding Tasks

### Task 1: Warm Color Palette + Spacing Tokens

**Файл:** `apps/storefront/src/app/globals.css`

**Что делать:**
- Заменить 8 color tokens в `:root` на warm palette.
- Добавить 7 spacing tokens.
- Обновить heading weights.
- Обновить `--max-width`.
- Заменить hardcoded #333 hover colors.
- Обновить focus ring.
- Изменить filter tab border-radius.

**Не делать:** менять HTML, JS, компоненты.

### Task 2: Custom Font Setup

**Файлы:** `apps/storefront/src/app/layout.tsx`, `apps/storefront/src/app/globals.css`

**Что делать:**
- Установить font через `next/font/google` (Inter или подобный).
- Применить CSS variable к `html` font-family.
- Удалить system font stack.

**Не делать:** менять остальную структуру layout.

### Task 3: Shared Utilities

**Файлы:** создать `apps/storefront/src/lib/format.ts`, обновить импорты в 4 файлах.

**Что делать:**
- Вынести `formatRub` (из product-card, product/[id], cart-summary, checkout-form).
- Вынести `getPrice` (из product-card, product/[id]).
- Обновить импорты.

**Не делать:** менять логику функций.

### Task 4: Product Card Cleanup

**Файлы:** `apps/storefront/src/components/product-card.tsx`, `globals.css`

**Что делать:**
- Сделать карточку fully clickable (`<Link>` wrapper).
- Убрать description.
- Badge: скрыть для STANDARD, показать readable label для BESPOKE.
- Card image: заменить `height: 200px` на `aspect-ratio: 4/5`.
- Заменить inline styles на CSS classes.

**Не делать:** менять price extraction, type access pattern.

### Task 5: Next.js Image Setup + PDP Image Improvement

**Файлы:** `next.config.js`, `product-card.tsx`, `room-set-card.tsx`, `product/[id]/page.tsx`

**Что делать:**
- Добавить `images.remotePatterns` в `next.config.js`.
- Заменить `<img>` на `<Image>` в cards и PDP.
- PDP: изменить grid split на `3fr 2fr`, aspect ratio на `4/5`.

**Не делать:** менять layout logic, metadata, JSON-LD.

---

## 11. First Component to Refactor

**`globals.css` (`:root` tokens)** — это не компонент, но это foundation. Без него component refactor будет на неправильной цветовой основе.

**Первый настоящий компонент:** `product-card.tsx` — самый repeated, самый visible, самый impactful.

---

## 12. First Page to Refactor

**`/catalog`** — наибольший visual return. После рефакторинга card + tokens каталог автоматически улучшается. Нужно только убрать inline styles на странице.

---

## 13. What Should Wait for Content Mapping

| Задача | Почему ждать | Когда делать |
|--------|-------------|-------------|
| Homepage секции (categories, rooms, bespoke CTA) | Без реальных hero images и копирайтинга — placeholder hell | После content migration или наличия placeholder images от дизайнера |
| PDP multi-image gallery | В seed данных — одно изображение на товар | После загрузки реальных product photos |
| Room set editorial card format | Без quality room photography — не лучше текущего | После загрузки room set photography |
| Room set hero image on detail page | Можно рендерить сейчас (данные есть), но без real photo — пустой placeholder | Можно сделать в Phase C если hero_image не null |
| Image placeholder component | Нужно решение по design: что показывать вместо фото | После определения placeholder strategy |
| SEO-оптимизированный alt text | Seed data имеет generic titles | После content migration с реальными описаниями |

---
