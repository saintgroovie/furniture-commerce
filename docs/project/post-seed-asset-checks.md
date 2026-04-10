# Post-seed asset checks (draft real-data)

Дата проверки: **2026-04-10**.  
Метод: выборка **15** URL из `data/normalized/seed-products.fixed2.json` (по коллекциям + обязательный `ol-05-n`).  
HTTP: запрос **GET** с хоста разработчика к `http://localhost:9000/...` (Python `urllib`, таймаут 5s).  
ФС: `docker exec medusa_backend test -f <path>`; путь = `/server` + суффикс `/uploads/...` из URL (после хоста).

---

## Результаты

| # | Handle | Коллекция | Image URL (из seed) | HTTP | Файл в контейнере | Заметка |
|---|--------|-----------|---------------------|------|-------------------|---------|
| 1 | `ol-05-n` | oliver | `http://localhost:9000/uploads/products/oliver/OL-05-Н_main.jpg` | **404** | **OK** | Handle латиница; имя файла на диске с кириллицей `Н` — файл найден; HTTP не отдаёт `/uploads/` |
| 2 | `ol-00-1` | oliver | `.../oliver/OL-00-1_main.jpg` | **404** | **OK** | Типичный Oliver main |
| 3 | `ol-01-2` | oliver | `.../oliver/OL-01-2_main.jpg` | **404** | **OK** | — |
| 4 | `ol-02-1` | oliver | `.../oliver/OL-02-1_main.jpg` | **404** | **OK** | — |
| 5 | `ol-03-1` | oliver | `.../oliver/OL-03-1_main.jpg` | **404** | **OK** | — |
| 6 | `pv-02-1` | provence | `.../provence/PV-02-1_main.jpg` | **404** | **OK** | Provence |
| 7 | `pv-03-1` | provence | `.../provence/PV-03-1_main.jpg` | **404** | **OK** | — |
| 8 | `pv-05-2` | provence | `.../provence/PV-05-2_main.jpg` | **404** | **OK** | — |
| 9 | `co-02-1` | country-london-paris | `.../country-london-paris/CO-02-1_gallery_01.jpg` | **404** | **OK** | Использован gallery URL (как в seed) |
| 10 | `co-05-1` | country-london-paris | `.../country-london-paris/CO-05-1_main.jpg` | **404** | **OK** | — |
| 11 | `co-08-1` | country-london-paris | `.../country-london-paris/CO-08-1_gallery_01.jpg` | **404** | **OK** | — |
| 12 | `co-14-2` | country-london-paris | `.../country-london-paris/CO-14-2_gallery_01.jpg` | **404** | **OK** | — |
| 13 | `co-15-2` | country-london-paris | `.../country-london-paris/CO-15-2_main.jpg` | **404** | **OK** | — |
| 14 | `co-61-1` | country-london-paris | `.../country-london-paris/CO-61-1_gallery_01.jpg` | **404** | **OK** | — |
| 15 | `co-62-1` | country-london-paris | `.../country-london-paris/CO-62-1_gallery_01.jpg` | **404** | **OK** | — |

**Контрольный эталон (другой префикс в БД):** URL вида `http://localhost:9000/static/products/greenwich/...` для Greenwich даёт **HTTP 200** на том же процессе Medusa — то есть статическая отдача **настроена для `/static/`**, а не для `/uploads/` в этом окружении.

---

## Вывод по видимой корректности

- **Файлы ассетов real-data присутствуют** под `/server/uploads/products/...` в контейнере `medusa_backend` (все 15 проверенных путей — существуют).  
- **Публичные URL в seed-слое (`ASSET_BASE_URL` + `/uploads/...`) в текущем HTTP-стеке не обслуживаются** (ответ **404**). Это влияет на отображение изображений в Admin/Storefront, пока не согласован префикс с конфигурацией static/file module Medusa или reverse-proxy.  
- Кейс **`ol-05-n`**: продукт и файл консистентны с seed; ограничение только на уровне HTTP-маршрута `/uploads/`, не на уровне нормализации handle.

---

## Повторение проверки

HTTP (пример):

```bash
python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:9000/uploads/products/oliver/OL-00-1_main.jpg', timeout=5)"
```

ФС (пример):

```bash
docker exec medusa_backend test -f /server/uploads/products/oliver/OL-00-1_main.jpg && echo OK
```
