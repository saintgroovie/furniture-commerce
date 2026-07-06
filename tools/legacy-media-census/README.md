# Legacy Media Census — локальный read-only toolkit

Node.js-скрипты для переписи (census) legacy-контента `woodright.ru` и `woodright-kids.ru` по **локальному** экспорту, скачанному оператором (см. `tmp/legacy-source-export/legacy-readonly-export-operator-checklist.md`). Результаты — CSV-манифесты для будущего Legacy Media Ops / Legacy Media Assignment Board.

**Текущий статус:** `scan-files.mjs` — рабочая инвентаризация; три build-скрипта — **guarded skeletons** (валидируют пути, печатают схему, завершаются кодом 2 с меткой `SKELETON_NOT_IMPLEMENTED`).

---

## Safety contract (не нарушать)

- Скрипты работают **только** с private export root:
  `/Users/leonidmbp/Documents/woodright-legacy-private-export/YYYY-MM-DD/`
- **Читают** только `raw/`, **пишут** только `census/` той же даты. Файлы в `raw/` никогда не изменяются. В repo скрипты не пишут ничего.
- **Нет сети**: никаких fetch/http/axios/undici, никаких обращений к живым сайтам.
- **Нет БД-подключений**: дампы парсятся как локальные текстовые файлы; никаких mysql/pg клиентов.
- **Нет секретов**: скрипты не принимают и не хранят credentials; аргумент — только `--date`.
- Архивы и SQL-дампы инвентаризируются по метаданным и hash; **не распаковываются и не исполняются**.
- **Нет Medusa apply**: манифесты — вход для operator review; seed/apply/publish/product-media apply этим toolkit не выполняются и не будут.
- **No commit / no push**: артефакты `census/` живут вне repo; изменения самого toolkit не коммитятся и не пушатся до отдельного явного approval.
- Обязательный независимый **Codex CLI review** (см. `tmp/legacy-source-export/codex-review-prompt.md`) до любого использования результатов.

## Порядок запуска

```bash
node tools/legacy-media-census/scan-files.mjs          --date YYYY-MM-DD
node tools/legacy-media-census/build-media-census.mjs  --date YYYY-MM-DD   # skeleton, exit 2
node tools/legacy-media-census/build-product-census.mjs --date YYYY-MM-DD  # skeleton, exit 2
node tools/legacy-media-census/build-url-map.mjs       --date YYYY-MM-DD   # skeleton, exit 2
```

## Expected input

```
<export-root>/raw/
├── woodright.ru/{files,db,admin-export}/
├── woodright-kids.ru/{files,db,admin-export}/
└── meta/
```

- `files/` — файловый архив сайта (минимум каталог картинок, например `images/detailed/`)
- `db/` — дампы `*.sql` / `*.sql.gz` (CS-Cart-подобные)
- `admin-export/` — CSV/XLSX экспорт из админки CMS (если есть)

## Expected output

```
<export-root>/census/
├── files-inventory.csv        # scan-files.mjs (работает)
├── legacy-media-census.csv    # build-media-census.mjs (skeleton)
├── legacy-products-census.csv # build-product-census.mjs (skeleton)
└── legacy-url-map.csv         # build-url-map.mjs (skeleton)
```

---

## CSV schemas v1

Разделитель — запятая, UTF-8, первая строка — header, значения экранируются по RFC 4180. Изменение схемы — только с bump-ом `schema_version` в header-комментарии скрипта.

### files-inventory.csv (v1)

| Колонка | Описание |
|---|---|
| `legacy_site` | `woodright.ru` / `woodright-kids.ru` / `meta` / `unknown` (первый сегмент под `raw/`) |
| `relative_path` | путь относительно `raw/` |
| `absolute_path` | полный локальный путь |
| `filename` | имя файла |
| `extension` | расширение lower-case, с точкой |
| `size_bytes` | размер |
| `mtime_iso` | mtime, ISO 8601 |
| `sha256` | контрольная сумма (пусто для skipped) |
| `file_kind` | `image / sql / archive / html / doc / other` |
| `skipped` | `true/false` |
| `skip_reason` | `symlink / unreadable / …` (пусто если не skipped) |

### legacy-media-census.csv (v1)

| Колонка | Описание |
|---|---|
| `legacy_site` | сайт-источник |
| `legacy_file_path` | путь картинки в `raw/` |
| `legacy_public_url_guess` | предполагаемый публичный URL (guess, не факт) |
| `filename` / `extension` | имя и расширение |
| `width` / `height` | размеры в px (если извлечены локально) |
| `size_bytes` / `sha256` | размер и hash |
| `image_kind_guess` | `product_detail / thumbnail / logo / promo / unknown` |
| `used_in_db` | `true/false` — есть ли ссылка в дампе |
| `used_in_html` | `true/false` — найдена ли в HTML-снимках |
| `legacy_product_id` | ID товара из дампа (если связь установлена) |
| `legacy_product_slug` / `legacy_product_url` / `legacy_product_name` | атрибуты связанного товара |
| `legacy_category` / `legacy_collection` | категория/коллекция |
| `is_main_image` / `is_gallery_image` | роль картинки у товара |
| `sort_order` | порядок в галерее |
| `alt_text` / `title_text` | тексты из БД/HTML |
| `candidate_new_handle` | кандидат Medusa handle (только предложение) |
| `candidate_confidence` | по шкале ниже |
| `evidence` | код evidence (см. ниже), обязателен и непуст |
| `needs_operator_review` | `true/false` |

### legacy-products-census.csv (v1)

| Колонка | Описание |
|---|---|
| `legacy_site` | сайт-источник |
| `legacy_product_id` | `cscart_products.product_id` |
| `legacy_product_url` / `legacy_product_slug` | URL/slug из `cscart_seo_names` |
| `legacy_product_name` | название из descriptions |
| `legacy_article` | article code (`product_code`) |
| `legacy_sku` | SKU, если отличается |
| `legacy_category` / `legacy_collection` | классификация legacy |
| `legacy_price` | цена из дампа (справочно, не для применения) |
| `legacy_dimensions` | размеры, если есть |
| `legacy_status` | active/hidden/disabled из дампа |
| `main_image_path` | путь главной картинки |
| `gallery_image_paths` | `; `-список путей галереи |
| `candidate_new_medusa_handle` | кандидат handle (только предложение) |
| `candidate_new_classification` | кандидат категории/коллекции в новом Woodright |
| `candidate_confidence` | по шкале ниже |
| `evidence` | код evidence |
| `needs_operator_review` | `true/false` |

### legacy-url-map.csv (v1)

| Колонка | Описание |
|---|---|
| `legacy_site` | сайт-источник |
| `old_url` | полный старый URL |
| `old_path` | путь без домена |
| `entity_type` | `product / category / collection / page / other` |
| `legacy_product_id` | если entity_type=product |
| `legacy_product_name` | название |
| `legacy_category` | категория |
| `candidate_new_url` | кандидат нового URL (только предложение) |
| `candidate_new_handle` | кандидат Medusa handle |
| `redirect_priority` | `high / medium / low` — консервативно |
| `evidence` | код evidence |
| `needs_operator_review` | `true/false` |

---

## Confidence scale (консервативная)

| Confidence | Условие |
|---|---|
| `0.9` | прямая DB-связь product↔image (`cscart_images_links`) |
| `0.8` | admin export явно связывает product и image |
| `0.75` | картинка найдена на странице товара (HTML-снимок) |
| `0.5` | совпадение article / slug / folder |
| `0.3` | fuzzy-совпадение названия |
| `0.0` | unknown / нет пригодной связи |

## Rules

- `confidence < 0.8` → `needs_operator_review = true`, без исключений.
- Fuzzy-only совпадения **никогда** не применяются автоматически.
- Ни один output не может использоваться для Medusa apply без отдельного явного approval.
- Filename hints (например `ol-14-1-…` → `OL-14-1`) — это только hints, не evidence уровня 1.0.

## Evidence codes

Каждая строка манифеста обязана иметь непустое `evidence`:

- `db_product_image_relation` — прямая связь в дампе
- `db_product_gallery_relation` — галерейная связь в дампе
- `admin_export_column` — колонка admin export
- `html_img_on_product_page` — `<img>` на странице товара (снимок)
- `filename_matches_article` — article code в имени файла
- `directory_matches_product_slug` — папка совпадает со slug
- `manual_operator_hint` — ручная подсказка оператора
- `no_relation_found` — связь не найдена (`confidence 0.0`)

## Operator review rules

- Все строки с `needs_operator_review=true` проходят через Legacy Media Assignment Board / ручную проверку до любого применения.
- `verified`-подобные (>=0.8) и fuzzy-строки не смешиваются в одном решении.
- Оператор может понизить, но не повысить confidence без нового evidence.

## Codex review requirement

После каждого этапа работы toolkit обязателен независимый Codex CLI review по промпту `tmp/legacy-source-export/codex-review-prompt.md`. До verdict `safe_to_keep` результаты не используются дальше по пайплайну.

## Commit / push policy

Stage/commit/push файлов toolkit и любых артефактов — **запрещены** до отдельного явного approval оператора. Артефакты census и содержимое private export root в repo не попадают никогда.
