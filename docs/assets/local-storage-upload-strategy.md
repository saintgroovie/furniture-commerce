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

Рекомендуемый путь от корня монорепо:

```text
apps/backend/uploads/{target_storage_key}
```

Пример: ключ `products/oliver/OL-01-2_main.jpg` → файл  
`apps/backend/uploads/products/oliver/OL-01-2_main.jpg`.

`target_storage_key` уже включает префикс `products/...` (см. `asset-upload-manifest.json`). **Не** дублировать `products` в пути.

Проверка согласованности с пилотом: `seed-greenwich.ts` и комментарии в репозитории указывают на размещение под `apps/backend/uploads/products/...`.

---

## От processed path к storage key

1. **Processed:** `data/processed/storefront-assets/{collection}/{FILENAME}.jpg`
2. **Storage key:** `products/{collection}/{FILENAME}.jpg` (как в манифестах)
3. **Локальный абсолютный путь назначения:** `{REPO_ROOT}/apps/backend/uploads/{storage_key}`

Скрипт `scripts/upload-assets-to-local-storage.py` читает **`data/normalized/asset-upload-execution-manifest.json`** (только seed-eligible строки).

---

## Публичный URL (MVP / staging)

**Договорённый префикс для первого real-data seed:**

```text
ASSET_BASE_URL=http://localhost:9000/uploads
```

**Итоговый URL файла:**

```text
{ASSET_BASE_URL}/{target_storage_key}
```

Пример: `http://localhost:9000/uploads/products/oliver/OL-01-2_main.jpg`.

Для staging замените только origin: `https://staging-api.example/uploads` — **storage key не меняется**.

> Примечание: в пилотном `seed-greenwich.ts` может использоваться шаблон `/static/...`. Для Oliver/Provence/CLP MVP мы **выравниваемся** с [`asset-url-mapping-notes.md`](asset-url-mapping-notes.md) и `uploads`-префиксом; при расхождении среды поправить `ASSET_BASE_URL` или nginx/static mapping **до** прогона seed.

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
