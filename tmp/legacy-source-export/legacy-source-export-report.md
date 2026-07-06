# Legacy Source Export — Report

> **Статус: TEMPLATE / DRY RUN.** Экспорт ещё не выполнялся. Шаблон заполняется оператором/агентом после завершения чеклиста `legacy-readonly-export-operator-checklist.md`. Credentials, пароли, tokens, cookies в этот отчёт не вносятся никогда.

## Verdict

_not filled — template_ (варианты: done / partial / blocked)

## Export date

`YYYY-MM-DD` — _не заполнено_

## Operator

_не заполнено_

## Sites covered

| Site | Files | DB | Admin export |
|---|---|---|---|
| woodright.ru | ☐ | ☐ | ☐ |
| woodright-kids.ru | ☐ | ☐ | ☐ |

## Private export root

`/Users/leonidmbp/Documents/woodright-legacy-private-export/YYYY-MM-DD/` — вне repo, в git не попадает.

## Files archive status

- woodright.ru: _не скачано / частично / полностью_; путь: `raw/woodright.ru/files/`; примечания: —
- woodright-kids.ru: _…_; путь: `raw/woodright-kids.ru/files/`; примечания: —

## DB dump status

- woodright.ru: _не скачан / скачан_; файл(ы): —; `gunzip -t`: —
- woodright-kids.ru: _…_; файл(ы): —; `gunzip -t`: —

## Admin export status

- woodright.ru: _есть / нет / CMS не поддерживает_; формат: —
- woodright-kids.ru: _…_

## Media folders found

_Перечень найденных директорий с картинками (например `images/detailed/`, подпапки), по сайтам._

- —

## Product sources found

_Какие источники данных о товарах доступны: таблицы дампа (`cscart_products`, `cscart_images_links`, …), admin export колонки, HTML._

- —

## URL sources found

_Источники старых URL: `cscart_seo_names`, sitemap-снимки, admin export._

- —

## Census outputs

| Файл | Статус |
|---|---|
| `census/files-inventory.csv` | ☐ не создан / ☐ создан |
| `census/legacy-media-census.csv` | ☐ (skeleton, не реализован) |
| `census/legacy-products-census.csv` | ☐ (skeleton, не реализован) |
| `census/legacy-url-map.csv` | ☐ (skeleton, не реализован) |

## Counts

| Метрика | woodright.ru | woodright-kids.ru |
|---|---|---|
| Файлов в `files/` | — | — |
| Из них изображений | — | — |
| Дампов в `db/` | — | — |
| Строк в files-inventory | — | — |

## Risks

_Известные риски: неполный экспорт, битые файлы, неоднозначные связи image↔product, отсутствие admin export и т.п._

- —

## Secrets handling

- Credentials в export-директории: **отсутствуют** (обязательное условие)
- Credentials в отчёте/чате/repo: **отсутствуют**
- Пароль mysqldump вводился интерактивно, в shell history не сохранён: ☐

## What was not touched

Подтверждение read-only режима:

- Товары, цены, файлы на серверах — не изменялись
- CMS settings, DNS, Cloudflare, robots.txt, sitemap.xml, .htaccess — не изменялись
- Платежи, почта, заказы, продажи, CarrotQuest, аналитика — не затрагивались
- БД: только чтение/экспорт, никаких UPDATE/DELETE/INSERT/ALTER/DROP/TRUNCATE
- Medusa (новый Woodright): ничего не применялось

## Next safe steps

1. `node tools/legacy-media-census/scan-files.mjs --date YYYY-MM-DD` — инвентаризация.
2. Реализация build-скриптов (media/product/url census) отдельной задачей после review инвентаря.
3. Codex CLI review артефактов до любого использования манифестов.
4. Никакого Medusa apply без отдельного явного approval.
