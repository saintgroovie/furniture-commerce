# Storefront Design Implementation Rules

Источник истины по визуальному и UX-направлению storefront Woodright.
Этот документ определяет design code проекта — до уровня конкретных токенов и компонентов.

---

## 1. Visual Direction

Woodright — premium мебельный бренд-производитель. Storefront должен передавать:

- **тактильность** натуральных материалов (дерево, ткань, камень)
- **спокойствие и пространство** — интерфейс ощущается как тихая галерея, а не как магазин
- **уверенность** — вещи говорят сами за себя, без визуального напора
- **мастерство** — аккуратность деталей, чистота сетки, выверенный ритм

Визуальный язык — **editorial ecommerce**: изображения и типографика ведут, интерфейс поддерживает.

---

## 2. Brand / Interface Adjectives

Позитивные (то, чем интерфейс должен быть):

| Категория | Слова |
|-----------|-------|
| Ощущение | calm, warm, spacious, airy |
| Характер | restrained, confident, honest, precise |
| Стиль | editorial, minimal, tactile, understated |
| Доверие | trustworthy, clear, professional, premium |

Негативные (то, чем интерфейс не должен быть):

| Категория | Слова |
|-----------|-------|
| Визуал | flashy, heavy, dark, cluttered, decorative |
| Стиль | marketplace, discount, noisy, trendy, rustic |
| Взаимодействие | aggressive, pushy, overwhelming, busy |

---

## 3. Design Principles

### 3.1. Content first, chrome second

Фотографии товаров, текст и цены — главные элементы. Всё остальное (borders, shadows, badges, icons) — обслуживает контент. Если элемент интерфейса не помогает пользователю принять решение — он лишний.

### 3.2. Generous space

Пространство — это часть дизайна, а не пустота. Большие поля, свободный margin между блоками, air вокруг изображений. Щедрое пространство создаёт ощущение premium.

### 3.3. Quiet hierarchy

Иерархия через размер шрифта, weight и пространство — не через цвет, тени и рамки. Один уровень визуального акцента за раз. Без визуального крика.

### 3.4. Honest materials

Интерфейс не притворяется чем-то другим. Нет faux textures, нет декоративных теней, нет скевоморфизма. Честные плоские поверхности, чистые линии, натуральные цвета.

### 3.5. Functional warmth

Тёплая палитра служит навигации и читаемости, а не только эстетике. Тепло — в фоне и акцентах; информационные элементы остаются чёткими и контрастными.

### 3.6. Image authority

Фотография — главный инструмент продажи. Интерфейс не конкурирует с изображениями. Вокруг фотографий — воздух. Подписи и контролы — вторичны.

### 3.7. Progressive disclosure

Показывать необходимое, раскрывать остальное по запросу. Не перегружать первый экран. Размеры, материалы, доставка — доступны, но не навязаны.

---

## 4. Color Direction

### 4.1. Palette Philosophy

Палитра строится на принципе **warm neutrals with confident contrast**. Фон — тёплые белые тона. Текст — тёмный, уверенный, с лёгким тёплым оттенком. Акцент — минимальный и функциональный.

### 4.2. Background Tones

| Роль | Направление | Ограничение |
|------|-------------|-------------|
| Page background | Warm white / bone (HSL: 30-45°, 10-30%, 96-98%) | Не уходить ниже 95% lightness — иначе фон станет заметным и тяжёлым |
| Surface (cards, header) | Чистый белый (#ffffff) или едва тёплый white | Контраст с page background должен быть ≤ 2% lightness, чтобы не создавать "карточную" эстетику |
| Section alternation | Мягкий sand/linen для чередования секций (97-98% lightness) | Максимум два оттенка фона на страницу; иначе — визуальный шум |

### 4.3. Foreground / Text Tones

| Роль | Направление | Обязательное ограничение |
|------|-------------|--------------------------|
| Primary text (body) | Very dark warm neutral (HSL: 20-30°, 15-30%, 12-18%) | WCAG AA: contrast ratio ≥ 4.5:1 на warm-white фоне. Проверять инструментально |
| Headings | Допустим чуть более выраженный warm brown (HSL: 20-30°, 20-35%, 15-20%) | Contrast ratio ≥ 4.5:1. На font-size ≥ 24px / bold ≥ 18.66px допустим ratio ≥ 3:1 (WCAG AA large text) |
| Secondary text | Warm gray (HSL: 20-30°, 8-15%, 35-45%) | Contrast ratio ≥ 4.5:1 на белом фоне |
| Muted / captions | Warm gray (HSL: 20-30°, 5-12%, 45-55%) | Допустим ≥ 3:1 для decorative/supplementary text, но для informational text — ≥ 4.5:1 |
| UI lines / borders | Light warm gray (HSL: 25-35°, 8-15%, 85-90%) | Достаточно отличаться от фона (ΔL ≥ 8%), но не создавать "рамочный" эффект |

### 4.4. Accent and Functional Colors

| Роль | Направление | Примечание |
|------|-------------|------------|
| Primary action (CTA) | Warm dark tone (deep walnut / espresso / charcoal-brown) | Кнопка должна быть заметной, но не кричащей. Не синий, не оранжевый |
| Interactive / links | Inherited from text color или subtle underline | Не blue-500. В premium ecommerce ссылки часто — текстовый цвет + underline |
| Success | Muted green (desaturated, warm) | Не яркий emerald |
| Error | Warm red (desaturated) | Не alarm-red; но достаточно контрастный для распознавания |
| Focus ring | Visible, warm-toned | Accessibility: чёткий focus visible на tab-navigation |

### 4.5. Critical Color Rules

1. **Никогда не использовать pure black (#000000) для текста.** Использовать very dark warm neutral.
2. **Никогда не использовать cool grays (blue-gray, slate).** Все серые — warm (hue 20-35°).
3. **Не использовать сатурированные цвета для фона или больших поверхностей.** Saturation фона ≤ 30%.
4. **Проверять contrast ratio инструментально**, а не на глаз. Warm-on-warm — зона риска.
5. **Не более 5 цветовых токенов в одном экране** (fg, fg-secondary, bg, surface, accent). Меньше — лучше.

### 4.6. Warm Palette Risks and Guardrails

| Риск | Как проявляется | Ограничение |
|------|----------------|-------------|
| Muddy interface | Тёплый фон + тёплый текст + тёплые тени = всё сливается | Поддерживать lightness gap ≥ 75% между fg и bg. Тени — минимальные или отсутствуют |
| Yellowing | Фон выглядит жёлтым, особенно на некалиброванных мониторах | Saturation фона ≤ 20%. Hue ≤ 40°. Тестировать на разных экранах |
| Old-fashioned feel | Слишком много бежевого = сайт из 2005 | Держать lightness ≥ 96%. Комбинировать с modern typography и generous whitespace |
| Lost contrast | Тёплые текст и фон одного тона | Проверять contrast ratio каждой пары. Не полагаться на hue difference — только lightness |
| Photo color cast | Тёплый фон искажает восприятие цвета товара | Фотографии — на нейтральном/белом backdrop внутри тёплого layout. Или использовать #fff surface под фото |

---

## 5. Typography Principles

### 5.1. Font Strategy

- **Primary:** один sans-serif шрифт с хорошей читаемостью на экране и premium feel. Рекомендации для рассмотрения: Inter, Instrument Sans, или подобный geometric/humanist sans.
- **Optional display:** serif или semi-serif для hero headings (Instrument Serif, DM Serif Display, или подобный). Только если добавляет brand character без усложнения.
- **System fallback:** `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`.
- **Ограничение:** максимум 2 шрифта на проекте. Один — допустимый минимум.

### 5.2. Type Scale

Спокойная, контрастная шкала. Не слишком много ступеней.

| Роль | Size (desktop) | Weight | Line-height |
|------|---------------|--------|-------------|
| Hero heading | 2.5–3rem | 400–500 | 1.1–1.2 |
| Page heading (h1) | 1.75–2rem | 500–600 | 1.2–1.3 |
| Section heading (h2) | 1.25–1.5rem | 500–600 | 1.25–1.35 |
| Subsection (h3) | 1.05–1.15rem | 500–600 | 1.3–1.4 |
| Body | 1rem (16px) | 400 | 1.6–1.7 |
| Small / caption | 0.85–0.875rem | 400 | 1.4–1.5 |
| Price | 1.1–1.25rem | 600 | 1.2 |
| Button | 0.9–1rem | 500 | 1 |

### 5.3. Typography Rules

1. **Headings — light weight, not bold.** Premium typography часто использует regular или medium weight для заголовков, а не bold. Тяжёлые bold заголовки = marketplace.
2. **Body — достаточный line-height (≥ 1.6).** Длинные описания товаров должны комфортно читаться.
3. **Uppercase — только для микро-labels** (badge, category tag), и с letter-spacing 0.05–0.1em. Не для заголовков, не для кнопок.
4. **Letter-spacing:** заголовки — 0 или слегка отрицательный (-0.01em). Body — нормальный. Labels — положительный.
5. **Max line width:** 65–75 символов для body text. Контролировать через max-width на текстовых блоках.
6. **Не использовать font-size менее 14px** для значимого контента.

### 5.4. Dark Brown Typography Assessment

| Контекст | Рекомендация | Обоснование |
|----------|-------------|-------------|
| Headings (h1, h2) | Допустим warm dark brown | Большой размер компенсирует потерю контраста. Создаёт brand character |
| Body text | Very dark warm neutral, визуально почти чёрный | Читаемость важнее бренда. Body text читают долго — любая потеря контраста утомляет |
| Captions, meta | Warm gray (не brown) | Слишком тёплые мелкие тексты выглядят грязно. Лёгкий warm tint — максимум |
| Buttons (text on dark bg) | White или near-white | Обратный контраст: светлый текст на тёмной кнопке. Не brown |
| Buttons (text on light bg) | Dark warm neutral | Контраст ratio ≥ 4.5:1 обязателен |
| Price | Dark warm neutral, medium weight | Цена должна быть чёткой. Допустим warm tint, но не ценой контраста |
| Labels / badges | Тёмный на светлом или светлый на тёмном — высокий контраст | Badges мелкие — contrast критичен |
| Error / validation | Functional color (warm red), не brown | Информационные цвета — функциональны, не brand |

**Итог:** dark brown как accent цвет заголовков — усиливает бренд. Как цвет body text — рискованно, допустим только при инструментально подтверждённом контрасте ≥ 4.5:1. Рекомендация: primary text = HSL(25°, 20%, 15%) — визуально "тёплый почти-чёрный", а не "коричневый".

---

## 6. Spacing and Rhythm

### 6.1. Spacing Scale

Использовать consistent spacing scale, кратную базовому значению.

| Token | Value | Использование |
|-------|-------|---------------|
| space-xs | 0.25rem (4px) | Между icon и label, внутренние отступы мелких элементов |
| space-sm | 0.5rem (8px) | Между элементами в группе, внутренние padding мелких блоков |
| space-md | 1rem (16px) | Padding кнопок, отступ между полями формы |
| space-lg | 1.5rem (24px) | Padding карточек, gap в grid |
| space-xl | 2.5rem (40px) | Отступ между секциями внутри страницы |
| space-2xl | 4rem (64px) | Отступ между крупными секциями страницы |
| space-3xl | 6rem (96px) | Hero padding, top/bottom page margin |

### 6.2. Rhythm Rules

1. **Вертикальный ритм** — элементы на странице чередуются предсказуемо: контент → space-xl → контент → space-xl. Большие секции разделяются space-2xl или space-3xl.
2. **Горизонтальные отступы** — consistent container padding (space-lg на мобильном, space-xl на десктопе).
3. **Отступы внутри карточки** — одинаковые по всем сторонам (space-lg), не разные сверху и снизу.
4. **Не использовать произвольные значения** (margin-top: 0.35rem). Только токены из scale.
5. **Inline style для spacing запрещены** — только CSS classes или CSS variables.

---

## 7. Grid and Layout

### 7.1. Container

- Max-width: 1200px (рассмотреть увеличение с текущих 1100px для более spacious layout).
- Center-aligned с horizontal padding.
- Одинаковый container на всех страницах.

### 7.2. Product Grid

- Desktop: 3 или 4 колонки (3 — для premium feel; 4 — для utility).
- Tablet: 2 колонки.
- Mobile: 1 колонка (допустимо 2 узких для мелких товаров).
- Gap: space-lg (1.5rem) minimum.
- Рекомендация: CSS Grid с `auto-fill, minmax(280px, 1fr)`.

### 7.3. Content Layout

- Двухколоночная раскладка для PDP: image (60%) + info (40%), или image (50%) + info (50%).
- Одноколоночная раскладка для текстовых страниц, форм, checkout.
- Full-width для hero sections и room set galleries.

### 7.4. Layout Rules

1. **Не использовать sidebar navigation** на каталоге в Phase 1. Фильтры — горизонтальные или dropdown.
2. **Максимум 4 колонки** в product grid. Мелкие карточки = marketplace look.
3. **Не заполнять пространство ради заполнения.** Пустота — design element.
4. **Breakpoints:** mobile-first. Рекомендация: 640px (sm), 768px (md), 1024px (lg), 1280px (xl).

---

## 8. Photography Usage

### 8.1. Image Philosophy

Фотография — главный носитель бренда на storefront. Интерфейс подчинён изображениям.

### 8.2. Image Requirements

| Контекст | Aspect ratio | Размер min | Стиль |
|----------|-------------|------------|-------|
| Product card thumbnail | 4:5 или 1:1 | 600×750 или 600×600 | Product on neutral background или lifestyle |
| PDP gallery main | 4:5 или 3:4 | 1200×1500 | High-resolution, product detail |
| Room set hero | 16:9 или 3:2 | 1600×900 | Lifestyle interior photography |
| Room set card | 16:9 | 800×450 | Interior scene |
| Hero (homepage) | 16:9 или wider | 1920×1080 | Atmospheric, brand-level |

### 8.3. Image Rules

1. **Consistent aspect ratio** внутри одного grid. Все карточки товаров — одинаковый ratio. Все room set cards — одинаковый ratio.
2. **Object-fit: cover** с аккуратным crop center. Не stretch, не contain с пустыми полями.
3. **Placeholder** для отсутствующих изображений — neutral warm surface с subtle icon или product name, не broken image.
4. **Lazy loading** для всех изображений ниже fold. `loading="lazy"` или Next.js Image component.
5. **Фон фотографий** — нейтральный (белый или light gray). Тёплый background layout не должен влиять на color perception товара.
6. **Не добавлять CSS-эффекты на изображения** (filters, overlays, vignetted edges, rounded excessive corners). Максимум: subtle border-radius (4–8px) на карточках.

---

## 9. Interaction Principles

### 9.1. Interaction Philosophy

Тишина. Каждая анимация и transition должна быть обоснована функционально. Движение — для feedback, не для decoration.

### 9.2. Allowed Interactions

| Взаимодействие | Допустимый эффект | Duration |
|---------------|-------------------|----------|
| Button hover | Subtle background shift (lightness ±5%) | 150ms ease |
| Button press | Scale 0.98 или subtle darken | 100ms |
| Link hover | Underline appear/disappear | 150ms |
| Card hover | Subtle lift (translateY -2px) или image slight zoom (scale 1.02) | 200ms ease-out |
| Focus | Visible focus ring (2px offset, warm tone) | instant |
| Page transition | Нет специальных transition (Next.js default) | — |
| Loading | Skeleton shimmer (существующий) | continuous |
| Form error | Field border color change + error message appear | 150ms |
| Toast / feedback | Fade in / fade out | 200ms in, 300ms out |

### 9.3. Forbidden Interactions

- Parallax scrolling
- Scroll-triggered animations (scroll reveal, fade-in-on-scroll)
- CSS particle effects, blurs, glassmorphism
- Auto-playing carousels
- Hover-dependent content (tooltips с обязательной информацией)
- Infinite scroll без явного "load more" (для каталога)
- Bounce, elastic, spring physics animations
- Animated gradient backgrounds
- Modal overlays для navigation

### 9.4. Loading States

- **Skeleton screens** — предпочтительнее spinners. Skeleton повторяет layout контента.
- **Button loading** — text заменяется на "..." или subtle spinner внутри кнопки. Кнопка disabled.
- **Нет full-page loading overlays.** Каждая секция загружается независимо.

---

## 10. Performance-Aware Design Principles

### 10.1. Font Loading

- Максимум 2 font files (regular + medium/semibold). Subset для кириллицы и латиницы.
- `font-display: swap` для предотвращения FOIT.
- Рассмотреть `next/font` для self-hosting и optimization.

### 10.2. Image Optimization

- Next.js `<Image>` component для automatic optimization, responsive sizes, lazy loading.
- WebP / AVIF formats.
- Explicit width/height для предотвращения layout shift (CLS).
- Responsive `sizes` attribute на всех изображениях.

### 10.3. CSS

- Минимальное количество CSS. Один global stylesheet допустим для Phase 1.
- Нет CSS-in-JS runtime. Нет styled-components в runtime.
- CSS variables для tokens — уже используется, продолжать.
- Избегать animation-heavy CSS, которая trigger layout/paint.

### 10.4. Component Weight

- Не добавлять тяжёлые UI-библиотеки (carousel libs, animation libs, icon fonts).
- Prefer native HTML elements (details/summary, dialog) over JavaScript widgets.
- Иконки — inline SVG, не icon font, не sprite sheet.

---

## 11. Anti-Patterns — What to Avoid

### 11.1. Visual Anti-Patterns

| Anti-pattern | Почему плохо | Вместо этого |
|-------------|-------------|-------------|
| Heavy drop shadows on cards | Marketplace look, visual weight | Тонкий border или subtle elevation (1-2px shadow, 5% opacity) |
| Rounded corners > 12px | Childish, app-like, не premium | 4–8px для карточек, 4–6px для кнопок |
| Badge overload (3+ badges на карточку) | Marketplace, visual noise | Максимум 1 badge на карточку, только функционально важный |
| Gradient backgrounds | Flashy, dated | Solid warm whites |
| Decorative dividers / ornaments | Rustic, outdated | Whitespace или тонкий 1px border |
| Background textures / patterns | Rustic, heavy, performance | Solid colors |
| Gold / brass colored UI elements | Pseudo-luxury, tacky | Warm dark neutrals |
| Full-black backgrounds | Jewellery-store aesthetic, heavy | Warm white, light backgrounds |
| Neon or high-saturation accents | DTC/startup aesthetic | Muted functional colors |

### 11.2. Layout Anti-Patterns

| Anti-pattern | Почему плохо | Вместо этого |
|-------------|-------------|-------------|
| Cards touching edge to edge | Cluttered, no breathing room | Consistent gap, generous padding |
| Text wall without hierarchy | Unreadable | Clear type hierarchy, spacing between paragraphs |
| Sticky elements everywhere | Noisy, reduces content space | Sticky header only, and only if slim |
| Horizontal scroll for products | Mobile-game UX, not ecommerce | Vertical grid or clear "Show more" |
| Multi-level nested navigation | Complex, enterprise feel | Flat navigation, max 2 levels |

### 11.3. Content Anti-Patterns

| Anti-pattern | Почему плохо | Вместо этого |
|-------------|-------------|-------------|
| Marketing superlatives in UI labels | "BEST SELLER!!! HOT!!!" — marketplace | Factual labels: тип, материал, наличие |
| Lorem ipsum in production | Unprofessional | Real content or clear placeholder markers |
| Inconsistent price formatting | Confusing | One format everywhere: `45 000 ₽` |
| Missing alt text on images | Accessibility violation | Descriptive alt text from product name |
| Decorative icons without meaning | Visual noise | Icons only when they clarify (search, cart, menu) |

---

## 12. Balance: Warmth vs. Neutrality

### 12.1. The Core Tension

Тёплая палитра усиливает бренд мебели из натуральных материалов, но ecommerce требует чистоты, контраста и universal readability. Задача — найти точку, где тепло ощущается, но не мешает.

### 12.2. Recommended Balance

| Поверхность / элемент | Степень тепла | Почему |
|----------------------|---------------|--------|
| Page background | Subtle warm (едва заметный тёплый оттенок, visually "white") | Создаёт атмосферу, но не мешает восприятию цвета товара |
| Card surface | Neutral white (#fff) | Нейтральная основа под фотографию — не искажает цвет товара |
| Text | Very slightly warm (тёплый "почти чёрный") | Brand touch без потери читаемости |
| Borders / lines | Warm gray | Объединяет palette |
| Buttons | Warm dark (espresso / charcoal-brown) | Brand statement, но не на большой поверхности |
| Form inputs | Neutral white с warm border | Чистые поля — важнее для usability, чем для brand |
| Icons | Warm dark neutral | Consistent с текстом |
| Photography backdrop | Neutral | Не искажать цвет товара |

### 12.3. The 80/20 Rule

80% интерфейса — нейтральный (белый, near-white, тёмный текст). 20% — warm accent (фон страницы, кнопки, borders). Тепло должно ощущаться подсознательно, а не бросаться в глаза.

### 12.4. Testing Warmth

- Показать страницу человеку и спросить: "Какого цвета фон?" Если ответ "белый" — тепло правильное. Если "бежевый" или "жёлтый" — перебор.
- Сделать screenshot и обесцветить (desaturate). Контраст и иерархия должны сохраниться.
- Проверить на разных мониторах: MacBook Pro (warm), Dell office monitor (cool), phone OLED.

---

## 13. Contrast and Accessibility Guidance

### 13.1. WCAG Compliance Target

- **WCAG 2.1 AA** — minimum standard.
- All text: contrast ratio ≥ 4.5:1.
- Large text (≥ 24px regular, ≥ 18.66px bold): ≥ 3:1.
- UI components and graphical objects: ≥ 3:1.

### 13.2. Warm-Palette-Specific Risks

| Сценарие | Риск | Как проверять |
|----------|------|---------------|
| Warm brown text on warm white bg | Hue similarity reduces perceived contrast | Инструментально: contrast-ratio.com или browser DevTools |
| Muted text on warm bg | Fades into background | Minimum 4.5:1, regardless of warmth |
| Warm border on warm bg | Invisible border | Minimum lightness difference 8% |
| Focus ring on warm surface | Not visible enough | Test with browser tab-key navigation |
| Error red on warm bg | Warm red on warm bg — less alarming | Use sufficient saturation for error state |

### 13.3. Testing Checklist

1. Run automated contrast check on all text/background pairs.
2. Test with simulated color blindness (protanopia, deuteranopia).
3. Test in bright outdoor light (mobile).
4. Test focus visibility with keyboard navigation.
5. Verify text readability at 200% zoom.

---

## 14. Responsive Design Principles

### 14.1. Approach

Mobile-first CSS. Design for mobile, enhance for desktop.

### 14.2. Breakpoints

| Name | Value | Typical device |
|------|-------|----------------|
| sm | 640px | Large phone / small tablet |
| md | 768px | Tablet portrait |
| lg | 1024px | Tablet landscape / small desktop |
| xl | 1280px | Desktop |

### 14.3. Mobile Considerations

1. **Touch targets** — minimum 44×44px (WCAG).
2. **No hover-dependent information** — hover is supplementary only.
3. **Single column** for most content on mobile.
4. **Sticky header height** — compact on mobile (≤ 56px).
5. **Product images** — full-width on mobile for impact.
6. **CTA buttons** — full-width on mobile for easy tap.
7. **Font sizes** — same or slightly smaller than desktop. Never below 14px.

---
