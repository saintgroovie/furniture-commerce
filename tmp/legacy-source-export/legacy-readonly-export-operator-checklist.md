# Legacy Read-Only Export — Operator Checklist

Чеклист для **человека-оператора**. Агенты (Cursor/Fable/Codex/ChatGPT) этот экспорт **не выполняют**: они не получают credentials, не логинятся в панели и не подключаются к живым legacy-системам. Агенты работают только с файлами, которые оператор скачал локально по этому чеклисту.

**Legacy-источники:**

- `https://woodright.ru/` (похож на CS-Cart)
- `https://woodright-kids.ru/`

---

## 0. Цель экспорта

Получить локальный **source-of-truth снимок** legacy-контента (файлы, БД, admin export) для будущего Legacy Media Census: перепись картинок и товаров, связи image↔product с evidence, карта старых URL. Экспорт — строго read-only: только скачивание, ноль изменений на источниках.

## 1. Безопасность (прочитать первым)

- **Не вставлять пароли, ключи, cookies, session-токены в AI-инструменты**: Cursor, ChatGPT, Codex, любые чаты. Никогда.
- Пароли можно вводить **только** в: браузер (форма логина панели/phpMyAdmin), SFTP/FTP-клиент, скрытый интерактивный prompt терминала (например `mysqldump -p` без пароля в команде). Больше никуда.
- **Не коммитить** в git: дампы БД, архивы, картинки, скриншоты с доступами, `.env`, credentials — ничего из export-директории.
- Credentials (hosting panel, SFTP/FTP, DB, admin) — только у оператора: локальный менеджер паролей, не файлы в repo и не export-директория.
- Скриншоты панелей с видимыми паролями/токенами не сохранять в export-директорию и не показывать агентам.
- Если шаг требует «что-то изменить на сервере, чтобы скачать» — **остановиться** и записать blocker в раздел 10.

## 2. Private export root (структура)

Все экспорты живут **только вне repo**:

```
/Users/leonidmbp/Documents/woodright-legacy-private-export/YYYY-MM-DD/
```

Создать структуру (дата — MSK):

```bash
export EXPORT_DATE=$(date +%F)   # пример: 2026-07-07
BASE=~/Documents/woodright-legacy-private-export/$EXPORT_DATE
mkdir -p $BASE/raw/woodright.ru/{files,db,admin-export}
mkdir -p $BASE/raw/woodright-kids.ru/{files,db,admin-export}
mkdir -p $BASE/raw/meta
```

Итог:

```
YYYY-MM-DD/
├── raw/
│   ├── woodright.ru/
│   │   ├── files/          # файловый архив сайта (как есть)
│   │   ├── db/             # дампы БД (.sql / .sql.gz)
│   │   └── admin-export/   # CSV/XLSX экспорт из админки CMS
│   ├── woodright-kids.ru/
│   │   ├── files/
│   │   ├── db/
│   │   └── admin-export/
│   └── meta/               # листинги, чексуммы, лог скачивания
└── census/                 # сюда пишут ТОЛЬКО локальные census-скрипты
```

Правила:

- В `raw/` — только скачанное, **без изменений**: не переименовывать, не пережимать, не «чистить».
- Директория никогда не попадает в git и не копируется в repo.
- Никаких файлов с паролями внутри export-директории.

## 3. Что скачать: woodright.ru

| Что | Откуда | Куда |
|---|---|---|
| Файлы сайта (минимум `images/detailed/`) | SFTP/FTP или файловый менеджер панели | `raw/woodright.ru/files/` |
| Дамп БД | бэкап панели / phpMyAdmin export / mysqldump | `raw/woodright.ru/db/` |
| Admin export товаров (CSV/XLSX), если CMS умеет | админка CMS → Export | `raw/woodright.ru/admin-export/` |

Ориентиры (hints, **не** evidence уровня 1.0):

- Сайт похож на CS-Cart; картинки часто в `images/detailed/{folder}/{file}`.
- Article codes могут быть в имени файла: `ol-14-1-…` может соответствовать `OL-14-1`.
- Сохранять структуру подпапок как на сервере (например `detailed/8/ol-14-1-lillian-140.jpg`).

- [ ] `images/detailed/` скачан полностью, структура сохранена
- [ ] Дамп БД скачан в `db/`
- [ ] Admin export скачан (или отмечено «CMS не умеет»)

## 4. Что скачать: woodright-kids.ru

То же самое, в `raw/woodright-kids.ru/`:

- [ ] Файловый архив (минимум каталог картинок) → `files/`
- [ ] Дамп БД → `db/`
- [ ] Admin export товаров → `admin-export/` (или отметка «недоступен»)
- [ ] Тип CMS зафиксирован в разделе 9 (metadata)

## 5. Read-only архив файлов (как)

Предпочтительно — готовый архив/бэкап из панели хостинга (ничего не запускать на сервере). Либо SFTP:

```bash
sftp <user>@<host>
sftp> get -r images/detailed <локальный путь в raw/<site>/files/images/detailed>
```

Либо архив средствами панели («скачать директорию как .zip») — положить архив в `files/` не распаковывая, или распаковать локально рядом (оригинал архива сохранить).

## 6. DB dump (как)

Порядок от безопасного к менее удобному:

1. **Готовый ночной бэкап хостинга** — просто скачать последний.
2. **phpMyAdmin / adminer / панель**: `Export` → SQL, вся БД. Только Export, никаких запросов на изменение.
3. **mysqldump по SSH** (если есть shell). Шаблон **без реального пароля** (пароль спросит интерактивно):

```bash
mysqldump --single-transaction --skip-lock-tables \
  -h <DB_HOST> -u <DB_READONLY_USER> -p <DB_NAME> \
  | gzip > woodright-<site>-$EXPORT_DATE.sql.gz
```

Потенциально важные CS-Cart таблицы (если полный дамп невозможен):

| Таблица | Зачем |
|---|---|
| `cscart_products` | product_id, product_code (article), статус |
| `cscart_product_descriptions` | названия/описания (RU) |
| `cscart_images` | image_path — имена файлов картинок |
| `cscart_images_links` | связь image ↔ product (главное evidence) |
| `cscart_products_categories` | связь product ↔ category |
| `cscart_categories` + `cscart_category_descriptions` | дерево категорий |
| `cscart_seo_names` | slugs / старые URL для url-map |
| `cscart_product_options*` | опции/варианты (если есть) |

- [ ] Дамп не 0 байт; `gunzip -t файл.sql.gz` — без ошибок
- [ ] Пароль нигде не сохранён (ни в файле, ни в shell history с `-p<пароль>`)

## 7. Что НЕ трогать (запреты)

Категорически запрещено во время экспорта:

- ❌ менять товары, цены, остатки;
- ❌ удалять файлы на сервере;
- ❌ загружать картинки на сервер;
- ❌ менять настройки CMS;
- ❌ менять DNS, Cloudflare, записи регистратора (nic.ru);
- ❌ менять `robots.txt`, `sitemap.xml`, `.htaccess`;
- ❌ чистить cache CMS/hosting;
- ❌ запускать updates/upgrades CMS, плагинов, PHP;
- ❌ выполнять в БД `UPDATE / DELETE / INSERT / ALTER / DROP / TRUNCATE`;
- ❌ использовать AI (Cursor/ChatGPT/Codex/браузерные агенты) для входа в админку или панель;
- ❌ трогать платежи, почту, заказы, продажи, CarrotQuest, аналитику.

## 8. Checksums и листинги

После скачивания зафиксировать состояние:

```bash
cd $BASE
find raw -type f | sort > raw/meta/file-listing.txt
find raw -type f -exec shasum -a 256 {} \; > raw/meta/sha256sums.txt
du -sh raw/* > raw/meta/sizes.txt
```

- [ ] `file-listing.txt`, `sha256sums.txt`, `sizes.txt` созданы

## 9. Metadata скачивания

В `raw/meta/download-log.txt` записать (без секретов!):

```
export date: YYYY-MM-DD
operator: <имя>
woodright.ru: CMS=<CS-Cart?>, files=<скачано/частично>, db=<скачано>, admin-export=<есть/нет>
woodright-kids.ru: CMS=<?>, files=<...>, db=<...>, admin-export=<...>
started: <ISO time> finished: <ISO time>
```

- [ ] `download-log.txt` заполнен, секретов в нём нет

## 10. Проблемы / blockers

Фиксировать здесь и в `raw/meta/download-log.txt`: что не скачалось, где нужен повторный заход, какие шаги потребовали бы изменений на сервере (и потому не выполнялись).

- —

## 11. Когда можно запускать census-скрипты

Только когда всё выполнено:

1. Структура `raw/` создана по разделу 2.
2. Скачаны файлы и дампы хотя бы одного сайта, чексуммы посчитаны.
3. В export-директории нет ни одного файла с credentials.
4. Заполнен `download-log.txt`.

Тогда — сообщить агенту **только дату** (`YYYY-MM-DD`) и известные пробелы, и запускать:

```bash
node tools/legacy-media-census/scan-files.mjs --date YYYY-MM-DD
```

Скрипты читают только `raw/`, пишут только `census/` той же даты, в repo не пишут ничего.
