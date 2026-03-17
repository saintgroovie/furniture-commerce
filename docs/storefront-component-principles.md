# Storefront Component Principles

Component-level design principles для Woodright storefront.
Каждый компонент описан как design brief: цель, поведение, приоритет информации, правила.

Связанные документы:
- `storefront-design-implementation-rules.md` — visual direction, tokens, anti-patterns.
- `storefront-page-patterns.md` — page-level context.

---

## 1. Header

### Purpose

Постоянная точка навигации и ориентации. Header — самый частый элемент на всех страницах. Должен быть тихим, но всегда доступным.

### Visual Behavior

- Sticky (fixed to top).
- Высота: 56–64px на desktop, 48–56px на мобильном.
- Background: `--color-surface` (white) с subtle bottom border (1px, `--color-border`).
- Не transparent, не gradient, не glassmorphism.
- При скролле — остаётся неизменным. Без shrink-on-scroll, без hide-on-scroll-down.

### Information Priority

1. Logo (слева) — ссылка на `/`.
2. Navigation links (центр или справа) — Каталог, Комнаты, (опционально) Заявка на расчёт.
3. Cart icon (справа) — с badge (count) при наличии items.

### Interaction Rules

- Logo click → homepage.
- Nav links — обычные `<a>`, не dropdown menus в Phase 1.
- Cart icon → `/cart`. Badge обновляется после add-to-cart.
- Active page — subtle visual indication (underline или font-weight).

### Responsive Behavior

- **Desktop:** полная навигация visible.
- **Mobile:** hamburger menu (три линии) → slide-in panel или fullscreen overlay с навигацией. Не bottom sheet, не accordion.
- Hamburger button — 44×44px touch target.
- Cart icon — всегда visible, и на мобильном.

### Anti-Patterns

| Избегать | Почему |
|----------|--------|
| Mega menus | Over-engineering для Phase 1. Flat navigation достаточно |
| Search bar в header (Phase 1) | Search — Phase 2+. Не занимать место |
| Promotional banner в header | Marketplace look. Отдельная секция, если необходимо |
| Transparent header с изменением на скролл | Сложная реализация, visual inconsistency |
| Header > 64px высотой | Забирает content space |

---

## 2. Navigation

### Purpose

Направить пользователя к нужному разделу сайта. Навигация — утилитарна, не декоративна.

### Visual Behavior

- Desktop: горизонтальные text links. Без icons в навигации (кроме cart).
- Font: body size, medium weight (500). Не uppercase, не small-caps.
- Spacing между links: space-lg (1.5rem).
- Active state: underline (2px, subtle) или color shift.
- Hover: underline appear (transition 150ms).

### Information Priority

Порядок ссылок (слева направо или сверху вниз на мобильном):

1. Каталог
2. Комнаты
3. Заявка на расчёт (опционально, может быть CTA отдельно)

Не более 5 пунктов в primary navigation.

### Interaction Rules

- Simple `<a>` links. Нет dropdowns, нет hover-reveal submenus в Phase 1.
- Keyboard navigation: Tab between links, Enter to activate.
- Focus visible: clear focus ring.

### Responsive Behavior

- **Desktop (≥ 768px):** горизонтальная строка.
- **Mobile (<768px):** hamburger → overlay. Links — vertical stack с крупными touch targets (≥ 44px height per item).
- Close button — visible, accessible.

### Anti-Patterns

| Избегать | Почему |
|----------|--------|
| Dropdown навигация с вложенностью | Overcomplicated для 5 страниц |
| Icons для каждого nav item | Визуальный шум, не premium |
| Animated hamburger → X transition | Unnecessary micro-animation |
| Bottom navigation bar (mobile) | App pattern, не ecommerce website |

---

## 3. Product Card

### Purpose

Preview товара в каталоге и на главной. Enough to evaluate — not enough to buy. Цель — привести пользователя на PDP.

### Visual Behavior

- Вертикальная ориентация: изображение сверху, текст снизу.
- Image: consistent aspect ratio (4:5 или 1:1) с `object-fit: cover`.
- Card background: `--color-surface` (white). Без тени или с minimal shadow (0 1px 3px rgba(0,0,0,0.04)).
- Border: тонкий (1px, `--color-border`) или без border (определяется при реализации; consistency важнее выбора).
- Border-radius: 4–8px.
- Padding inside card body: space-md to space-lg.
- Hover: subtle image zoom (scale 1.02, 200ms) или subtle card lift (translateY -2px).

### Information Priority

1. **Product image** — главный элемент. 60–70% площади карточки.
2. **Product name** — h3 или strong. Одна-две строки, text-overflow if needed.
3. **Price** — visible, clear. Формат: `45 000 ₽`.
4. **Product type badge** (опционально) — "На заказ" для BESPOKE. Один badge максимум.

Что **не** показывать в карточке:
- Полное описание
- Размеры и материалы
- CTA buttons (add to cart)
- Rating stars
- Discount percentages
- Multiple badges

### Interaction Rules

- Вся карточка — clickable (`<a>` на `/product/[id]`). Не отдельная кнопка "Подробнее".
- Hover feedback — на всей карточке, не только на изображении.
- Cursor: pointer на всей карточке.

### Responsive Behavior

- **Desktop:** 3–4 в ряд.
- **Tablet:** 2 в ряд.
- **Mobile:** 1–2 в ряд. При 2 — изображения меньше, но всё ещё dominant.
- На мобильном — image aspect ratio может быть 1:1 для компактности.

### Anti-Patterns

| Избегать | Почему |
|----------|--------|
| "Quick add" button в карточке | Мебель не покупается одним кликом. Карточка → PDP → CTA |
| Multiple badges ("NEW", "SALE", "BEST") | Marketplace noise |
| Truncated price | Цена — ключевая информация. Всегда полностью |
| Карточки разной высоты | Ломает grid rhythm. Fixed aspect ratio изображений = consistent height |
| Hover-only информация | Мобильные устройства не имеют hover. Вся информация — visible |
| Rating stars | Нет review системы в Phase 1. Не показывать пустые stars |

---

## 4. Category Card

### Purpose

Навигация по типам мебели на главной странице. Visual shortcut в каталог с фильтром по категории.

### Visual Behavior

- Крупное изображение (hero-style) с overlay или рядом с текстом.
- Название категории: крупный, confident text. Medium weight.
- Формат: горизонтальный или вертикальный — в зависимости от layout секции.
- Border-radius: как у product card (consistency).
- Minimal — имя + изображение. Без описания, без count.

### Information Priority

1. Category image (lifestyle или hero product фото)
2. Category name

### Interaction Rules

- Click → `/catalog?category_id=XXX`.
- Hover: subtle image darken или zoom.
- Keyboard accessible.

### Responsive Behavior

- **Desktop:** 3–5 в ряд (зависит от количества категорий).
- **Mobile:** горизонтальный scroll или vertical stack. Если scroll — с visible overflow indicator.

### Anti-Patterns

| Избегать | Почему |
|----------|--------|
| Icon-based categories (без фото) | Мебельные категории требуют visual representation |
| Count ("23 товара") | Устаревает, отвлекает. Пользователю не важно число |
| Decorative frames / borders | Visual noise |

---

## 5. Filter UI

### Purpose

Позволить пользователю сузить выбор в каталоге. Утилитарный элемент — функциональность > эстетика.

### Visual Behavior

- Горизонтальная строка над product grid (tab-style или chips).
- Active filter — визуально distinct (filled background или bold text).
- Inactive — muted, но clickable.
- Compact: не больше одной строки на desktop.
- Background: transparent или subtle fill на active.

### Information Priority

1. Тип товара (Все / Стандартные / Конфигурируемые / На заказ) — primary filter.
2. Категория — secondary filter (если добавлена).
3. Clear filters — link/button для сброса.

### Interaction Rules

- Click → apply filter → refetch products. Без submit button.
- Active filter — visually marked.
- Multiple filters: each click updates immediately (Phase 1 — URL query params).
- Keyboard: Tab between filters, Enter/Space to activate.

### Responsive Behavior

- **Desktop:** горизонтальные tabs / chips.
- **Mobile:** горизонтальный scroll если не помещаются. Или stacked vertical if few items.
- Touch targets: ≥ 44px height.

### Anti-Patterns

| Избегать | Почему |
|----------|--------|
| Sidebar filter panel | Забирает space от product grid |
| Collapsible accordion filters | Over-engineering для 2–3 фильтров |
| Range sliders (для цены в Phase 1) | Complex, не приоритетно |
| Faceted search UI | Enterprise pattern, не для MVP |
| Filter modal (mobile) | Friction. Inline filters достаточно |

---

## 6. Buttons

### Purpose

Явные триггеры действий: добавить в корзину, отправить заявку, перейти к checkout. Кнопка — единственный элемент, который может быть визуально "заметным".

### Visual Behavior

#### Primary Button

- Background: warm dark (espresso / deep walnut / charcoal-brown).
- Text: white.
- Border-radius: 4–6px.
- Height: 44–48px.
- Padding: space-md horizontal (16–24px).
- Font: body size (16px), weight 500. Не uppercase.
- Hover: subtle lightening (lightness +5%).
- Disabled: reduced opacity (0.5) или muted color. Cursor: not-allowed.
- Loading: text replaced with "..." или inline spinner. Remains disabled.

#### Secondary Button

- Background: transparent.
- Border: 1px solid warm dark.
- Text: warm dark.
- Same size as primary.
- Hover: subtle background fill (5% opacity).

#### Danger / Destructive Button

- Background: warm red (for delete actions in cart).
- Или text-only с red color (для less prominent destructive actions).

#### Text Button / Link Button

- Looks like a link, behaves like a button.
- Text color: primary fg. Underline on hover.
- Used for: "Продолжить покупки", "Сбросить фильтры".

### Information Priority

Button label:
- Verb-first: "Добавить в корзину", "Отправить заявку", "Оформить заказ".
- Concise: 2–4 слова максимум.
- Не generic "Отправить" или "OK". Конкретное действие.

### Interaction Rules

- Visible focus ring on Tab.
- Disabled state — clear visual difference.
- Loading state — button remains in place, no layout shift.
- Success state — brief change (checkmark or text) then reset, или redirect.
- Error state — button reset to normal + error message nearby.
- Double-click protection: disable on first click until action completes.

### Responsive Behavior

- **Mobile:** full-width для primary CTA. Sufficient height for touch (≥ 44px).
- **Desktop:** auto-width (content-based) или constrained max-width.
- Button group (primary + secondary): stack vertically on mobile, horizontal on desktop.

### Anti-Patterns

| Избегать | Почему |
|----------|--------|
| Gradient buttons | Flashy, dated |
| Rounded pill buttons (border-radius 9999px) | App-like, не ecommerce |
| Uppercase button text | Aggressive, shouting |
| Icon-only buttons (без label) | Accessibility issue, ambiguous meaning |
| Animated buttons (bounce, pulse, glow) | Distracting, not premium |
| Ghost buttons для primary CTA | Not visible enough for main action |

---

## 7. Form Fields

### Purpose

Собирать пользовательские данные: контакты в bespoke форме, адрес в checkout. Формы должны быть простыми, тёплыми и не пугающими.

### Visual Behavior

- Border: 1px solid `--color-border`. Warm gray.
- Background: `--color-surface` (white).
- Border-radius: 4–6px.
- Height: 44–48px.
- Padding: space-sm horizontal.
- Font: body size (16px) — на мобильном ≥ 16px чтобы избежать auto-zoom в iOS.
- Focus: border color change to warm accent + subtle box-shadow (0 0 0 2px warm-accent/20%).
- Error: border color → error red. Error message below field. Visible icon optional.
- Label: above the field. Font: small (14px), medium weight. Warm dark neutral.

### Information Priority

1. Label (что вводить)
2. Input field (где вводить)
3. Helper text (опционально — формат, подсказка)
4. Error message (при ошибке)

### Interaction Rules

- Label + input связаны через `htmlFor` / `id`.
- Placeholder text — subtle hint, не замена label. Тёплый muted color.
- Required fields: asterisk (*) рядом с label.
- Validation: on blur (когда пользователь покидает поле) или on submit. Не on keystroke.
- Success validation (green border) — не нужен. Neutral or error — два состояния.

### Responsive Behavior

- Full-width на мобильном.
- Max-width 480–560px на desktop для single-column forms.
- Stack labels above fields (не inline).
- Touch targets ≥ 44px height.

### Anti-Patterns

| Избегать | Почему |
|----------|--------|
| Float labels (label внутри поля) | Accessibility issues, confusing states |
| Placeholder-only (без label) | Исчезает при вводе, нет ориентира |
| Inline validation on every keystroke | Annoying, premature errors |
| Custom styled select/dropdown | Inconsistent behavior cross-browser. Native `<select>` acceptable in Phase 1 |
| Multi-column form layout | Harder to scan. Single column preferred |

---

## 8. Gallery (PDP)

### Purpose

Показать товар с разных ракурсов и в деталях. Gallery — главный инструмент принятия решения на PDP.

### Visual Behavior

- Main image: large, dominant. 55–60% ширины на desktop.
- Thumbnail strip (если несколько изображений): below main image или сбоку. Small, clickable.
- Active thumbnail: border или opacity indicator.
- Image background: neutral (белый или light gray) для honest product color.
- Border-radius: 4–8px на main image. Thumbnail — 4px.
- Нет decorative frame, нет shadow на изображении.

### Information Priority

1. Main product view (default: front or 3/4 angle).
2. Detail views (material, texture close-up).
3. Context views (in-room / lifestyle).

### Interaction Rules

- Click thumbnail → switch main image (без page reload, без animation кроме fade).
- Click main image → возможно fullscreen/zoom (Phase 2). Phase 1 — не обязательно.
- Swipe на мобильном (horizontal swipe between images).
- Keyboard: arrow keys для переключения (если implemented).

### Responsive Behavior

- **Desktop:** main image + thumbnail strip. Two-column layout с product info.
- **Mobile:** full-width main image. Thumbnails — horizontal scroll below. Или swipeable carousel (без autoplay).
- Main image — maximum available width on mobile.

### Anti-Patterns

| Избегать | Почему |
|----------|--------|
| Auto-playing slideshow | Removes user control. User decides which photo to see |
| Zoom-on-hover (magnifier) | Complex, not essential for furniture. Phase 2+ |
| Video autoplay in gallery | Performance, data usage, unexpected |
| Lightbox with navigation arrows only | Mobile: swipe is expected |
| Tiny thumbnails (< 48px) | Hard to tap, hard to see |
| More than 6–8 images | Diminishing returns. Curate, don't dump |

---

## 9. Price Display

### Purpose

Сообщить стоимость товара — чётко, однозначно, без surprises. Цена — второй по важности элемент после изображения.

### Visual Behavior

- Font: slightly larger than body (1.1–1.25rem). Semibold (600).
- Color: primary text color (warm dark). Не accent, не colored.
- Format: `45 000 ₽` — с разделителем тысяч (пробел), символ рубля после числа.
- Alignment: left-aligned с остальным текстом.
- Нет: зачёркнутой "старой цены", нет "скидка XX%", нет красного цвета для цен (Phase 1).
- "от" prefix для room sets: `от 120 000 ₽` — "от" в нормальном weight, цена — semibold.

### Information Priority

1. Price value (число)
2. Currency symbol (₽)
3. Prefix "от" (для room sets и configurable products)

### Interaction Rules

- Не clickable, не interactive.
- Обновляется при смене варианта (на PDP).

### Responsive Behavior

- Размер шрифта не уменьшается на мобильном. Цена — critical information.
- Position: consistent на card и на PDP (одно и то же место).

### Anti-Patterns

| Избегать | Почему |
|----------|--------|
| Red / green price colors | Marketplace discount aesthetic |
| Animated price changes | Unnecessary, can feel manipulative |
| Hidden price ("Узнать цену") | Trust violation for ecommerce |
| Tiny font for price | Цена — key decision factor. Не прятать |
| Multiple price formats on one page | Confusion. One format everywhere |
| Price without currency | Ambiguous. Always show ₽ |

---

## 10. Dimension Display

### Purpose

Показать размеры товара — ключевая информация для мебели. Покупатель должен понимать, поместится ли предмет в его пространство.

### Visual Behavior

- Compact inline display или small table.
- Format: `Ш 120 × Г 60 × В 75 см` или tabular layout.
- Font: body size или small. Regular weight.
- Color: secondary text color.
- Location: на PDP, в detail section. Не в карточке.
- Label: "Размеры" — clear heading.

### Information Priority

1. Width × Depth × Height (в привычном для мебели порядке).
2. Unit (см / мм).
3. Additional dimensions if relevant (seat height, table top thickness).

### Interaction Rules

- Static display. Не interactive.
- Если несколько вариантов — размеры обновляются при выборе варианта.

### Responsive Behavior

- На мобильном: single column, один размер на строку (если tabular).
- Или inline: `120 × 60 × 75 см` — compact enough для mobile.

### Anti-Patterns

| Избегать | Почему |
|----------|--------|
| 3D viewer for dimensions | Over-engineering для Phase 1 |
| Dimensions в tooltip | Hidden information. Мебель выбирают по размерам |
| Dimensions без единиц | Ambiguous — cm? mm? inches? |
| Mixing metric and imperial | Рынок РФ — метрическая система only |

---

## 11. Room Set Section

### Purpose

Визуальная презентация готовой комнаты: атмосфера + состав. Вдохновение + actionable information.

### Visual Behavior

- Hero-style image: wide, immersive. Room lifestyle photography.
- Card format (в listing): крупнее, чем product card. Ratio 16:9 или 3:2. Более editorial.
- Detail page: full-width hero → info → product list.
- Product list внутри room set: compact cards или table (thumbnail + name + qty + price).
- Style/room_type tags: subtle, как meta-info.

### Information Priority

#### Card (listing)

1. Room image (lifestyle)
2. Room name
3. Room type + style (meta)
4. Price "от"

#### Detail page

1. Hero image
2. Name + description
3. Price from
4. CTA group
5. Products in set (with links to PDP)

### Interaction Rules

- Card click → `/rooms/[slug]`.
- Product items в составе → links на `/product/[id]`.
- CTA "Купить комплект": добавляет eligible products в корзину.
- CTA "Адаптировать": → `/bespoke?room_set_id=...`.

### Responsive Behavior

- **Listing desktop:** 2–3 колонки. Крупные карточки.
- **Listing mobile:** 1 колонка. Full-width images.
- **Detail desktop:** hero full-width, info + products — constrained width.
- **Detail mobile:** stacked layout.

### Anti-Patterns

| Избегать | Почему |
|----------|--------|
| Room set как обычная product card | Room set — другой entity. Другой визуальный формат |
| Нет hero image | Room set без визуала — бессмысленно |
| Скрытый состав комплекта | Пользователь должен знать, что покупает |
| "Купить" без объяснения | Нужно ясно: "В корзину будут добавлены: стол, 4 стула, тумба" |

---

## 12. Bespoke CTA Blocks

### Purpose

Конвертировать посетителя в lead: "мы можем сделать мебель под ваши размеры". Bespoke CTA — один из ключевых conversion points.

### Visual Behavior

- Standalone section (на главной, на PDP для CONFIGURABLE/BESPOKE).
- Visual: тёплый фон (чуть темнее page background, или subtle warm tone) + текст + кнопка.
- Или: split layout — изображение (production / workshop) + text + CTA.
- Compact: не больше 1/3 экрана по высоте. Не hero-sized.
- Кнопка: secondary style или primary (если единственный CTA в этом контексте).

### Контексты использования

| Контекст | Вариант CTA |
|----------|-------------|
| Homepage | Секция "Мебель по вашим размерам" с фото и CTA "Получить расчёт" |
| PDP (CONFIGURABLE) | Secondary button "Сделать по моим размерам" → `/bespoke?product_id=...` |
| PDP (BESPOKE) | Primary button "Получить расчёт" → `/bespoke?product_id=...` |
| Room Set detail | Secondary button "Адаптировать под мою комнату" → `/bespoke?room_set_id=...` |

### Information Priority

1. Value proposition ("Мебель по вашим размерам" / "Адаптируем под вашу комнату")
2. Brief explanation (1–2 строки: что произойдёт)
3. CTA button

### Interaction Rules

- CTA → navigates to `/bespoke` с query params (product_id или room_set_id).
- На PDP: CTA интегрирован в product CTA group (не отдельная секция).
- На homepage: standalone секция.

### Responsive Behavior

- Full-width на мобильном.
- CTA button — full-width на мобильном.
- Image (если есть) — responsive, does not overflow.

### Anti-Patterns

| Избегать | Почему |
|----------|--------|
| Popup / modal bespoke CTA | Aggressive. Navigational CTA — достаточно |
| "Бесплатный расчёт!" с восклицательным знаком | Marketplace tone. Calm statement |
| Bespoke CTA на каждой странице | Overexposure. Только контекстно релевантные места |
| Длинное описание в CTA block | CTA block — teaser, не landing page. Кратко |
| Animated CTA (pulsing, bouncing) | Not premium. Static, confident |

---
