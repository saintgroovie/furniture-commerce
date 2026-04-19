# Greenwich post-refresh verification — локальный Docker (успех)

Дата: 2026-04-10.

Отчёт о **успешном** refresh в локальном контейнере. Другой контекст (песочница агента без Node в PATH): [`greenwich-post-refresh-verification.md`](greenwich-post-refresh-verification.md).

## Summary

Greenwich-only refresh выполнен успешно в локальной среде через backend container. Хостовая команда по задаче завершилась ошибкой `yarn: command not found`, после чего использован безопасный эквивалент в `medusa_backend`. По итогам refresh и Store API проверки Greenwich подтверждён как корректный reference pattern: все ожидаемые handle на месте, metadata-контракт заполнен, bed grouping сохранён, GR-09 mirror/bed disambiguation не нарушен.

## Execution commands

Хостовый запуск (требуемый, но неуспешный):

```bash
cd apps/backend && yarn install && yarn refresh-greenwich
```

Ошибка:

```text
yarn: command not found
```

Фактический успешный запуск:

```bash
docker exec medusa_backend sh -lc 'cd /server && yarn install --immutable && yarn refresh-greenwich'
```

## Refresh result

- Refresh завершился успешно (`exit_code: 0`).
- Ключевой результат выполнения:
  - `Updated metadata for 15 Greenwich products.`
- Признаков создания дубликатов или удаления продуктов в процессе refresh не обнаружено.

## DB/API verification

Проверка выполнена через Store API с publishable key из `apps/storefront/.env.local`.

- Expected handles: 15
- Matched handles: 15
- `collection`: 15
- `collection_label`: 15
- `canonical_name`: 15
- `workbook_row_key`: 15
- `workbook_row_index`: 15
- `product_code_normalized`: 15
- `dimensions`: 15
- `display_group`: 5
- bed group members: 5
- GR-09 pair OK

Дополнительно по GR-09:
- `greenwich-gr-09-1-mirror` и `greenwich-gr-09-1-bed-90` остаются разными продуктами (`id` разные).
- У mirror SKU `GR-09-1-M`, у bed SKU `GR-09-1`.
- `display_group` присвоен только bed (`greenwich-bed`).

Storefront-facing parity (по данным API и текущей проекции витрины):
- Обычная Greenwich card data-ready: `collection_label`, article (SKU), `dimensions`, price присутствуют.
- Bed grouping не распался: raw bed items = 5, grouped card entries = 1.
- PDP data-ready для bed: `collection_label`, `canonical_name`, article, `dimensions`, gallery, and "Другие размеры" candidates (4 соседних размера).

## Remaining breakpoints

- На хосте по-прежнему отсутствует `yarn` в PATH, поэтому прямой запуск из условия задачи не работает; рабочий путь — через backend container.
- По данным Greenwich после refresh критичных разрывов DB/API не выявлено.
- Отдельный короткий UI smoke в браузере остаётся финальным подтверждением визуального E2E.

## Recommended next step

1. Выполнить короткий storefront smoke check (каталог + PDP Greenwich: карточка группы кроватей, «Другие размеры», коллекция/артикул/габариты/цена).
2. После smoke check перейти к **Oliver readiness pass** по тому же metadata/display контракту.
