# Legacy Site Audit

Анализ https://woodright.ru/ как content donor.

---

## Site Status

- Сайт работает, но с нестабильным откликом (таймауты на многих страницах)
- Платформа: CS-Cart (dispatch-based URLs)
- Языковая версия: русский
- Контакты: г. Москва + г. Иваново (производство)

---

## Category / Collection / Room Structure

### 1. Предметы (Product Categories)

Видимые категории на `/catalog/`:

| Категория | URL slug | Примечание |
|-----------|----------|------------|
| Банкетки и скамьи | `/predmety/banketki-i-skami/` | |
| Детали | `/predmety/interiernye-kartiny/` | URL не соответствует названию |
| Детские кроватки | `/predmety/detskie-krovatki/` | |
| Диваны | `/predmety/divany/` | |
| Комоды | `/predmety/komody/` | |
| Кресла | `/predmety/kresla/` | В workbook кресла не выделены |
| Кровати | `/predmety/krovati/` | |
| Полки | `/predmety/polki/` | |
| Прочее | `/predmety/decor/` | |
| Стеллажи | `/predmety/stellazhi/` | |
| Столы и столики | `/predmety/stoly-i-stoliki/` | |
| Стулья, табуретки | `/predmety/stulya-taburetki/` | |
| Тумбы | `/predmety/tumby/` | |
| Шкафы | `/predmety/shkafy/` | |

**Итого: 14 категорий**

### 2. Коллекции

Видимые на catalog page как отдельные ссылки:

| Коллекция (legacy) | URL slug | Коллекция в workbook |
|--------------------|----------|---------------------|
| Sweet Home | `/sweet-home/` | ВВ (роспись SH) |
| Albion | `/albion/` | ВВ (роспись AL) |
| Rural Scenery | `/rural-scenery/` | ВВ (роспись RS) |
| Templars | `/templars/` | ВВ (роспись TE) |
| Infanta | `/infanta/` | ВВ (роспись IN) |
| Royal Lilies | `/royal-lilies/` | ВВ (роспись RL) |
| Teddy Bear | `/teddy-bear/` | ВВ (роспись TB) |
| Ant's Village | `/ants-village/` | ВВ (роспись AV) |
| Brigantine blue | `/brigantine-blue/` | ВВ (роспись BRB) |
| Brigantine ivory | `/briganrine-ivory/` | ВВ (роспись BRI) |
| Fairies | `/fairies/` | ВВ (роспись FA) |
| Fantasy Kingdom | `/fantasy-kingdom/` | ВВ (роспись FK) |
| Royal Guardsmen | `/royal-guardsmen/` | ВВ (роспись RG) |
| Tiggy-Winkle | `/tiggy-winkle/` | ВВ (роспись TW) |
| Pastoral | `/pastoral/` | ВВ (роспись PA) |
| Ballet | `/ballet/` | ВВ (роспись BA) |
| Tommy | `/tommy/` | ВВ (роспись MO/TO) |
| Alice | `/alice/` | ВВ (роспись SC) |
| Tudor Oak | `/tudor-oak-ru/` | ? (не найдено в workbook) |
| Часы | `/chasy/` | КАНТРИ (CO-30-1 Часы) |

**Важный вывод:** Большинство «коллекций» на legacy site — это варианты росписи коллекции ВВ (Willie Winkie). В workbook они представлены как ценовые tier-ы внутри одного листа ВВ.

### 3. Сплит «Взрослые / Детские коллекции»

- `/vzroslie-kollekcii` — Взрослые коллекции (страница таймаутит)
- `/detskie-kollekcii` — Детские коллекции (страница таймаутит)

Этот сплит соответствует архитектурному решению kids section в storefront.

### 4. Комнаты (Rooms)

| Комната | URL slug |
|---------|----------|
| Гостиные | `/komnaty/gostinye/` |
| Детские | `/komnaty/detskie/` |
| Кабинеты | `/komnaty/kabinety/` |
| Спальни | `/komnaty/spalni/` |

**Итого: 4 типа комнат** — соответствует room_type в RoomSet модели.

### 5. Прочие разделы

- Этажерки (`/etazherki/`) — выделены в отдельный раздел
- Скидки (`/skidki/`)
- Распродажа (on_sale)
- Реализованные проекты (`/proekty`)
- Библиотека тканей (`/biblioteka-tkaney`)

---

## Useful Legacy Content Types

### Безопасно использовать

| Контент | Применение | Риск |
|---------|-----------|------|
| Логотип | Branding в storefront | Низкий |
| Product imagery | Карточки товаров, PDP | Низкий |
| Interior room photos | Room sets, hero sections | Низкий |
| Collection names (EN) | Naming reference | Низкий |
| Category structure | Taxonomy reference | Средний |
| Room type names | Room set types | Низкий |

### Unsafe Content Types

| Контент | Причина | Альтернатива |
|---------|---------|--------------|
| Цены | Могут быть устаревшими | Workbook |
| Размеры | Могут расходиться с workbook | Workbook |
| Описания товаров | Не верифицированы | Написать заново или верифицировать |
| Фильтры | Структура может не совпадать | Вывести из workbook |
| Stock / availability | Устаревшее | Backend data |
| Бонусные баллы, рассрочка | Маркетинговые условия | Бизнес-решение |

---

## Product Naming and Imagery Benefits

### Naming

Legacy site использует **английские названия для коллекций** (Albion, Infanta, Sweet Home и т.д.), а workbook — **русские** (ОЛИВЕР, ГРИНВИЧ, ВВ). Маппинг:

| Workbook | Legacy (EN) | Legacy (RU) |
|----------|-------------|-------------|
| ОЛИВЕР - ЧЕРНЫЙ | Oliver / Oliver Black | Оливер |
| ГРИНВИЧ | Greenwich | Гринвич |
| ВВ | Willie Winkie + 19 painting names | Вилли Винки |
| ОКСФОРД | Oxford | Оксфорд |
| ПРОВАНС | Provence White / Provence Dark | Прованс |
| ПРИНЦЕССА РОЗА | Princess Rose | Принцесса Роза |
| КАНТРИ-ЛОНДОН-ПАРИЖ | Country / London / Paris | Кантри / Лондон / Париж |
| МОНЧЕЛСИ | Monchelsea | Мончелси |

### Imagery

- Product cards на legacy site содержат фотографии товаров в интерьере
- Для каждой коллекции есть hero-изображение
- Room pages содержат composed room shots (ценно для room sets)

---

## Risks of Scraping or Mirroring

1. **Цены устаревшие** — прямое копирование цен с сайта приведёт к расхождению с workbook
2. **Таксономия не совпадает** — legacy site разворачивает коллекцию ВВ в 19 отдельных «коллекций» по росписи, а workbook хранит их как tier-ы внутри одного листа
3. **Категория «Детали»** — URL `/predmety/interiernye-kartiny/` (интерьерные картины), но контент — детали/запчасти
4. **Tudor Oak** — есть на сайте, отсутствует в workbook (возможно, снят с производства или новая коллекция)
5. **Кресла** — есть как категория на сайте, но в workbook кресла не выделены (могут быть в рамках коллекций)
6. **CS-Cart URL structure** — dispatch-based URLs неудобны для прямого маппинга

---

## Key Takeaways

1. Legacy site — ценный **visual reference**, но не source of truth для данных
2. Английские названия коллекций с legacy site нужны для bilingual naming
3. Категории предметов (14 шт.) дают хороший ориентир для filter taxonomy
4. Комнаты (4 типа) напрямую маппятся на room_type в backend
5. Сплит «взрослые / детские коллекции» подтверждает kids section architecture
6. Росписи ВВ на legacy site = отдельные «коллекции» — в storefront лучше моделировать как variant finish, а не коллекции
