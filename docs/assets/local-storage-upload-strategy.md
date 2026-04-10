# Local storage upload strategy (MVP Medusa)

Контролируемая выгрузка processed-ассетов в локальную файловую схему Medusa для стабильных публичных URL перед `seed-real-data` / расширением `seed.ts`.

Связанные документы: [`asset-storage-strategy.md`](asset-storage-strategy.md), [`asset-url-mapping-notes.md`](asset-url-mapping-notes.md), [`product-asset-binding-strategy.md`](product-asset-binding-strategy.md).

---

## Цель

- **Materialize** файлы из `data/processed/storefront-assets/...` в каталог, из которого Medusa отдаёт статику.
- **Разделить** загрузку (filesystem) и entity mapping (`entity-mapping.json`, `product-asset-binding.json`).
- **Не включать** продукты вне `seed_ready` / `seed_ready_with_caveat` и не тянуть VV / unresolved / excluded.

---

## Куда копировать (локальный layout)

Рекомендуемый путь от корня монорепо (совпадает с `express.static` Medusa v2 → URL `/static/...`):

```text
apps/backend/static/{target_storage_key}
```

Пример: ключ `products/oliver/OL-01-2_main.jpg` → файл  
`apps/backend/static/products/oliver/OL-01-2_main.jpg`.

Скрипт `upload-assets-to-local-storage.py` материализует файлы в `apps/backend/static`. Каталог `apps/backend/uploads/` не обслуживается HTTP по умолчанию и может использоваться только как локальный архив/исторический путь.

`target_storage_key` уже включает префикс `products/...` (см. `asset-upload-manifest.json`). **Не** дублировать `products` в пути.

Проверка согласованности с пилотом: `seed-greenwich.ts` строит публичные URL как `{backend}/static/{storage_key}`; файлы лежат под `apps/backend/static/products/...`.

---

## От processed path к storage key

1. **Processed:** `data/processed/storefront-assets/{collection}/{FILENAME}.jpg`
2. **Storage key:** `products/{collection}/{FILENAME}.jpg` (как в манифестах)
3. **Локальный абсолютный путь назначения:** `{REPO_ROOT}/apps/backend/static/{storage_key}`

Скрипт `scripts/upload-assets-to-local-storage.py` читает **`data/normalized/asset-upload-execution-manifest.json`** (только seed-eligible строки).

---

## Публичный URL (MVP / staging)

**Договорённый префикс для real-data seed (Medusa v2, локальный `express.static`):**

```text
ASSET_BASE_URL=http://localhost:9000/static
```

**Итоговый URL файла:**

```text
{ASSET_BASE_URL}/{target_storage_key}
```

Пример: `http://localhost:9000/static/products/oliver/OL-01-2_main.jpg`.

Для staging замените только origin, например `https://staging-api.example/static` — **storage key не меняется**.

> Medusa v2 монтирует статику из каталога `static` приложения на путь **`/static`** (см. `@medusajs/framework` express-loader). Путь `/uploads/...` для файлов на диске **не** обслуживается этим механизмом — поэтому real-data и Greenwich используют одну модель: файлы в `apps/backend/static/`, URL с префиксом `/static/`.

---

## Provenance

Для каждой записи execution-манифеста сохраняются:

- `processed_path` — исходный файл в `data/processed/...`
- `target_storage_key` — стабильный ключ в хранилище
- `workbook_row_key`, `product_code_normalized`, `canonical_name` — связь с workbook / entity mapping
- `asset_role`, `asset_quality_status`, `source_type` (из binding / upload manifest)
- `upload_ready_status` / статусы прогона в `data/processed/asset-manifests/local-upload-*.json`

Исключённые продукты (`unresolved_mapping`, `blocked_by_business_decision`, `no_confirmed_assets`) **не попадают** в execution manifest и **не копируются**.

---

## Идемпотентность

- Повторный запуск: если целевой файл **существует** и **размер + SHA256** совпадают с источником — запись **skipped_identical**.
- Если содержимое отличается — по умолчанию **не перезаписывать** и логировать конфликт.
- Перезапись различающегося файла разрешается только явным флагом `--overwrite-different`.
- После copy выполняется post-copy validation: проверка существования целевого файла и совпадения SHA256.

---

## Почему excluded вне scope

По [`entity-mapping-readiness-report.md`](../content/entity-mapping-readiness-report.md) и `data/normalized/entity-mapping-summary.json`: без подтверждённых ассетов или с бизнес-блоком (VV) продукты не должны попадать в первый production-like seed — иначе ломается детерминизм и проверяемость витрины.
