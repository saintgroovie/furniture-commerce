# Storefront Page Patterns

Page-level design patterns для Woodright storefront.
Каждая страница описана как самостоятельный design brief: цель, иерархия, блочная структура, тон.

Связанный документ: `storefront-design-implementation-rules.md` — общие visual и UX правила.

---

## 1. Homepage (`/`)

### Primary Goal

Сформировать первое впечатление о бренде: "качественная мебель от производителя, сделанная с вниманием к деталям". Показать масштаб ассортимента и направить к действию (каталог, комнаты, заявка).

### Hierarchy of Information

1. Brand statement + hero imagery (кто мы, что делаем)
2. Категории / навигация по каталогу (куда идти)
3. Room Sets — визуальные готовые решения (вдохновение)
4. Bespoke CTA — возможность заказать по размерам (уникальность)
5. Доверие (кратко о производстве, материалах, подходе)

### Recommended Block Order

| # | Блок | Высота | Содержание |
|---|------|--------|------------|
| 1 | Hero | 60–80vh | Одно сильное изображение или коллаж. Заголовок (1 строка). Подзаголовок (1–2 строки). 1–2 CTA кнопки (Каталог, Получить расчёт) |
| 2 | Categories | Compact | 3–5 карточек категорий (столы, шкафы, стулья...). Ссылки на catalog с фильтром |
| 3 | Featured Room Sets | Medium | 2–3 карточки room sets. Lifestyle photography. Ссылка "Все комнаты" |
| 4 | Bespoke CTA | Medium | Текст + изображение. "Мебель по вашим размерам." Одна CTA-кнопка |
| 5 | About / Trust | Compact | 3–4 коротких value proposition (производство, материалы, доставка, гарантия). Без длинного текста |
| 6 | Footer | Standard | Контакты, навигация, copyright |

### UX Priorities

- **Speed to intent:** пользователь за 5 секунд понимает, куда ему идти — каталог или заявка.
- **Visual impact:** hero image устанавливает quality bar для всего сайта.
- **Brevity:** минимум текста, максимум визуала. Главная — не информационная страница.

### Visual Tone

Spacious, image-led, calm. Много воздуха. Тёплый, но не тёмный. Фотография > текст.

### Common Mistakes to Avoid

| Ошибка | Почему плохо |
|--------|-------------|
| Slider / carousel в hero | Размывает message. Пользователь не ждёт смены слайда. Каждый следующий слайд получает на 90% меньше внимания |
| Все товары на главной | Это не каталог. Главная — entry point, не listing |
| Длинный текст "О нас" | Пользователь пришёл за мебелью, не за историей. Краткость |
| Popup / modal при входе | Агрессивный UX. Против принципов calm interface |
| Чересчур много CTA | Больше 2–3 CTA на первом экране — перегрузка. Один primary, один secondary |
| Auto-playing video hero | Performance cost, не контролируется пользователем |

---

## 2. Catalog / PLP (`/catalog`)

### Primary Goal

Дать пользователю быстро найти нужный товар: через визуальное сканирование, фильтры или browsing. Показать ассортимент без перегрузки.

### Hierarchy of Information

1. Page title / breadcrumb (где я)
2. Filters (как сузить выбор)
3. Product grid (что есть)
4. Individual product cards (name, image, price, type)

### Recommended Block Order

| # | Блок | Содержание |
|---|------|------------|
| 1 | Page heading | "Каталог" или название категории. Compact, не hero |
| 2 | Filter bar | Горизонтальная полоса фильтров: категория, тип товара. Без sidebar |
| 3 | Product grid | Сетка карточек. 3 колонки desktop, 2 tablet, 1–2 mobile |
| 4 | Empty state | "Товары не найдены" — если фильтры ничего не вернули. С suggestion сбросить фильтры |
| 5 | Pagination / Load more | Если товаров > 12–16 |

### UX Priorities

- **Scanability:** пользователь должен визуально оценить 6–12 товаров за один экран.
- **Filter clarity:** активные фильтры — видимы. Сброс — доступен.
- **Consistent rhythm:** все карточки одинакового размера, одинаковый image ratio.
- **Price visibility:** цена видна в карточке без необходимости клика.

### Visual Tone

Structured, clean, utility-oriented. Менее emotional, чем главная. Фокус на функциональности и продуктовой информации.

### Common Mistakes to Avoid

| Ошибка | Почему плохо |
|--------|-------------|
| Sidebar filters на desktop | Сужает product grid, создаёт enterprise UX |
| Разная высота карточек (masonry) | Хаотичный ритм, невозможно сканировать |
| Слишком много информации в карточке | Карточка — preview, не PDP. Имя, изображение, цена, тип — достаточно |
| Мелкие изображения в grid | Изображение — главный элемент оценки товара. Не экономить |
| Отсутствие empty state | Пустой экран = broken experience |
| Infinite scroll без индикатора | Пользователь теряет позицию, не может вернуться |

---

## 3. Product Detail Page / PDP (`/product/[id]`)

### Primary Goal

Дать достаточно информации для покупки или запроса: изображение, цена, материалы, размеры, варианты, CTA. Снять тревожность покупателя.

### Hierarchy of Information

1. Product images (визуальная оценка)
2. Product name and price (что это и сколько стоит)
3. Primary CTA (добавить в корзину / получить расчёт)
4. Variants / options (размер, материал, цвет — если есть)
5. Description (подробности)
6. Dimensions / specifications (технические характеристики)
7. Delivery and production info (когда получу)
8. Related products (что ещё посмотреть)

### Recommended Block Order

| # | Блок | Layout |
|---|------|--------|
| 1 | Image gallery + Product info | Two-column: image (55–60%) / info (40–45%). На мобильном — stack: image сверху, info снизу |
| 2 | Product info block | Name → Price → Variant selector (если есть) → CTA кнопки → Краткое описание |
| 3 | Details section | Description, dimensions, materials — в одной колонке ниже. Можно accordion / tabs для компактности |
| 4 | Delivery / trust info | Срок изготовления, условия доставки, гарантия — compact block |
| 5 | Related products | Горизонтальная полоса 3–4 карточки. "Похожие товары" |

### UX Priorities

- **Image quality:** изображение — главный инструмент продажи. Крупное, детальное, с возможностью zoom.
- **CTA visibility:** кнопка покупки/запроса видна без scroll (на desktop). На мобильном — сразу после основного изображения.
- **Anxiety reduction:** цена, сроки, возможность возврата — visible. Не прятать за клик.
- **Variant selection:** если есть варианты — понятный селектор. Цена обновляется при выборе.
- **Type-aware CTA:** CTA зависит от product_type (backend data). STANDARD — "Добавить в корзину". CONFIGURABLE — "Добавить в корзину" + "Сделать по моим размерам". BESPOKE — только "Получить расчёт".

### Visual Tone

Focused, detailed, confident. Spacious layout вокруг изображений. Информация структурирована, но не загромождена.

### Common Mistakes to Avoid

| Ошибка | Почему плохо |
|--------|-------------|
| Маленькие изображения | Товар стоимостью 50 000+ ₽ нельзя оценить по thumbnail |
| CTA below fold (desktop) | Пользователь должен скроллить, чтобы купить — friction |
| Слишком много текста на первом экране | Информационная перегрузка. Описание — ниже |
| Нет dimensions / sizes | Мебель покупается по размерам. Их отсутствие — deal breaker |
| Auto-play gallery | Забирает контроль. Пользователь сам выбирает, какое фото смотреть |
| Нет indication текущего состояния CTA | При loading, success, error — пользователь должен получить feedback |

---

## 4. Cart (`/cart`)

### Primary Goal

Показать содержимое корзины, позволить удалить позиции, перейти к оформлению. Без surprises, без upsell-давления.

### Hierarchy of Information

1. Cart items (что в корзине — изображение, название, количество, цена)
2. Total (итог)
3. Checkout CTA (перейти к оформлению)
4. Continue shopping link (вернуться в каталог)

### Recommended Block Order

| # | Блок | Содержание |
|---|------|------------|
| 1 | Page heading | "Корзина" |
| 2 | Cart items list | Каждый item: thumbnail, название, вариант (если есть), цена, кнопка удаления. Vertical list, не grid |
| 3 | Cart total | Итоговая сумма. Compact, выровнена вправо или в отдельном блоке |
| 4 | CTA | "Оформить заказ" — primary button. "Продолжить покупки" — text link |
| 5 | Empty state | "Корзина пуста" + ссылки: В каталог, Комнаты, На главную |

### UX Priorities

- **Clarity:** каждая позиция — понятна (что, сколько, за сколько).
- **Easy removal:** удалить позицию — один клик.
- **No surprises:** итоговая сумма видна сразу. Без скрытых fees.
- **Simple flow:** Cart → Checkout. Нет дополнительных шагов.

### Visual Tone

Functional, minimal. Меньше декора, больше утилитарности. Тёплый фон, чистая вёрстка.

### Common Mistakes to Avoid

| Ошибка | Почему плохо |
|--------|-------------|
| Aggressive upsell blocks | "Вам также понравится" с 12 товарами — marketplace. В premium — максимум 2–3 subtle suggestion |
| Скрытая кнопка удаления | Пользователь хочет контролировать корзину |
| Quantity selector with +/- | Для мебели не типично. Обычно 1 шт. Если нужен — простой, не fancy stepper |
| Визуальный шум вокруг total | Итог — ключевое число. Без рамок, теней, выделений. Крупный шрифт и пространство |
| Нет empty state | Пустая страница — потерянный пользователь |

---

## 5. Room Sets (`/rooms` и `/rooms/[slug]`)

### Primary Goal

**Listing (`/rooms`):** Показать готовые мебельные решения как источник вдохновения. Lifestyle-oriented, image-led.

**Detail (`/rooms/[slug]`):** Показать состав комплекта, вдохновить на покупку целой комнаты или заявку на адаптацию.

### Hierarchy of Information — Listing

1. Page title
2. Room Set cards (hero image, name, room type, style, price from)

### Hierarchy of Information — Detail

1. Room Set hero image (визуальное погружение)
2. Name + description (что это за комната)
3. Price from (сколько стоит)
4. Product list (состав комплекта — товары, количества)
5. CTA: "Купить комплект" + "Адаптировать под мою комнату"
6. Individual product links (возможность посмотреть каждый товар)

### Recommended Block Order — Listing

| # | Блок | Содержание |
|---|------|------------|
| 1 | Page heading | "Готовые комнаты" |
| 2 | Room Set grid | Карточки с lifestyle-фото. 2–3 колонки desktop, 1 мобильный. Крупные изображения |

### Recommended Block Order — Detail

| # | Блок | Содержание |
|---|------|------------|
| 1 | Hero image | Full-width или wide. Lifestyle интерьерная съёмка |
| 2 | Info block | Название, description, room_type, style, price_from |
| 3 | CTA group | "Купить комплект" (primary) + "Адаптировать под мою комнату" (secondary → `/bespoke/request?room_set_id=...`) |
| 4 | Products in set | Список товаров: thumbnail, название, количество, цена. С ссылками на PDP |
| 5 | Gallery (if available) | Дополнительные фотографии комнаты |

### UX Priorities

- **Inspirational:** Room Sets — это вдохновение, не utility. Крупные фото, lifestyle feel.
- **Actionable:** двойной CTA — купить целиком или заказать адаптацию.
- **Transparent:** состав комплекта — видимый. Пользователь знает, что получит.
- **Cross-linking:** каждый товар в комплекте — ссылка на PDP.

### Visual Tone

Inspirational, editorial, spacious. Больше атмосферы, чем utility. Room Sets — ближе к editorial content, чем к каталогу.

### Common Mistakes to Avoid

| Ошибка | Почему плохо |
|--------|-------------|
| Маленькие карточки room sets | Room Set — lifestyle visual. Мелкие карточки убивают вдохновение |
| Нет состава комплекта на странице | Пользователь не знает, что покупает |
| CTA "Купить" без объяснения что добавляется | Нужно ясно показать, какие товары будут в корзине |
| Room Set как "ещё одна карточка товара" | Room Set — отдельный визуальный формат. Не нужно выглядеть как product card |
| Нет ссылки на bespoke с room set контекстом | Потерянная конверсия. Пользователь хочет "такую комнату, но другого размера" |

---

## 6. Bespoke Request (`/bespoke/request`)

### Primary Goal

Собрать заявку на расчёт: контактные данные + описание потребности. Минимум friction, максимум доверия. Конвертировать интерес в lead.

### Hierarchy of Information

1. Page heading + объяснение (что произойдёт после отправки)
2. Form fields (контакты, описание потребности)
3. Submit CTA
4. Trust elements (что будет дальше, сроки ответа)
5. Success state (подтверждение отправки)

### Recommended Block Order

| # | Блок | Содержание |
|---|------|------------|
| 1 | Page heading | "Заявка на расчёт" или "Мебель по вашим размерам" |
| 2 | Context text | 1–2 предложения: что происходит. "Опишите вашу задачу — менеджер свяжется для расчёта в течение 1 рабочего дня" |
| 3 | Form | Имя, email, телефон, комментарий. Опционально: тип мебели, размеры, бюджет |
| 4 | Submit button | "Отправить заявку" — primary. Disabled при submitting |
| 5 | Trust note | "Мы не передаём данные третьим лицам" или подобное. Compact, рядом с кнопкой |
| 6 | Success state | Замена формы: "Заявка отправлена. Менеджер свяжется с вами." + ссылки: каталог, комнаты, главная |

### UX Priorities

- **Low friction:** минимум обязательных полей. Имя + email или телефон — достаточно.
- **Context preservation:** если пользователь пришёл с PDP или Room Set — показать, о каком товаре/комнате речь (product_id / room_set_id из query params).
- **Trust:** объяснить, что будет после отправки. Снять тревожность.
- **No distraction:** форма — единственный фокус на странице. Нет sidebar, нет related products.

### Visual Tone

Clean, focused, warm. Форма — простая, с большими полями, щедрым spacing. Ощущение personal attention, не конвейера.

### Common Mistakes to Avoid

| Ошибка | Почему плохо |
|--------|-------------|
| Слишком много обязательных полей | Каждое лишнее поле — это потерянные заявки |
| Нет объяснения "что будет дальше" | Пользователь не доверяет anonymous form. Объяснить процесс |
| CAPTCHAs на видном месте | Friction. Если нужна — invisible reCAPTCHA |
| Модальное окно для формы | Модалка ограничивает пространство формы и раздражает |
| Нет success state | Пользователь не знает, отправлена ли заявка |
| Redirect после submit | Дезориентирует. Показать success на той же странице |

---

## 7. Checkout (`/checkout`)

### Primary Goal

Оформить заказ: собрать адрес доставки и контактные данные. В MVP — без онлайн-оплаты (оплата через payment link от менеджера).

### Hierarchy of Information

1. Order summary (что покупается — compact list)
2. Contact info (email)
3. Shipping address (адрес доставки)
4. Submit CTA
5. Success state (заказ создан, ждите payment link)

### Recommended Block Order

| # | Блок | Содержание |
|---|------|------------|
| 1 | Page heading | "Оформление заказа" |
| 2 | Order summary | Compact список: название, количество, цена. Итог. Не editable — для изменений вернуться в /cart |
| 3 | Form | Email, имя, фамилия, адрес, город, индекс, страна |
| 4 | Submit button | "Оформить заказ" |
| 5 | Payment note | "После оформления менеджер отправит ссылку на оплату" — видимый, рядом с submit |
| 6 | Success state | "Заказ оформлен. Номер заказа: #XXX. Менеджер свяжется для оплаты." |

### UX Priorities

- **Transparency:** пользователь видит, что заказывает и за сколько.
- **Payment clarity:** в MVP нет онлайн-оплаты. Это нужно объяснить до submit, не после.
- **One page:** вся форма на одной странице. Нет multi-step wizard.
- **Validation:** ошибки — inline, рядом с полем. Не alert box.

### Visual Tone

Functional, trustworthy, minimal. Checkout — зона максимального доверия. Чистота, предсказуемость, отсутствие отвлекающих элементов.

### Common Mistakes to Avoid

| Ошибка | Почему плохо |
|--------|-------------|
| Multi-step checkout для MVP | Over-engineering. Одна страница — достаточно |
| Скрытие payment flow | Пользователь ожидает оплату онлайн. Если её нет — сказать до submit |
| Editable cart на checkout | Усложняет page state. Для изменений — ссылка на /cart |
| Нет order summary | Пользователь не помнит, что в корзине. Summary обязателен |
| Redirect до показа success | Пользователь должен увидеть подтверждение заказа |

---
