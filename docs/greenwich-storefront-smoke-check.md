# Greenwich storefront smoke check

Дата: 2026-04-10.

## 1. Summary

Короткий smoke check после успешного Greenwich refresh пройден. Проверка сделана на живой витрине (`http://127.0.0.1:8000`) и через storefront-facing data layer (`/store/products`, `/store/products/:id` с publishable key). По Greenwich подтверждены card/PDP требования, bed grouping и GR-09 disambiguation.

## 2. Checked pages/components

- `GET /catalog` (SSR HTML snapshot)
- `GET /product/prod_01KM1QHNHZXXSRPFEKAZRSFPDE` (Greenwich bed PDP)
- `GET /product/prod_01KM1QHNHMVXN3YQ3JDZCYQTM5` (Greenwich mirror PDP)
- Store API cross-check:
  - `GET /store/products`
  - `GET /store/products/:id`
- Компонентная проекция (без изменения кода):
  - `apps/storefront/src/components/product-card.tsx`
  - `apps/storefront/src/app/product/[id]/page.tsx`
  - `apps/storefront/src/lib/display-group.ts`
  - `apps/storefront/src/lib/product-metadata.ts`

## 3. What passed

- **Обычная Greenwich card**
  - Есть collection context (`Greenwich · ...`).
  - Есть article (SKU в контексте карточки).
  - Есть dimensions (`card-dimensions`).
  - Есть price.
  - Display hierarchy выглядит корректно: context line -> title (`h3`) -> dimensions -> price.

- **Grouped bed card**
  - Не распадается на 5 дублей: в каталоге один `h3>Кровать</h3` при 5 bed members.
  - Групповая семантика есть:
    - цена `от 71 900 ₽`
    - подсказка `5 размеров`
  - Bed group members в данных: 5 (GR-09-1-bed-90, GR-12-1, GR-14-1, GR-16-1, GR-18-1).

- **Greenwich PDP (bed)**
  - Показывает collection (`Greenwich`).
  - Показывает canonical_name (`pdp-canonical-name` присутствует).
  - Показывает article (`Арт. GR-09-1`).
  - Показывает dimensions (`pdp-dimensions`).
  - Показывает gallery (`product-detail-gallery` присутствует).
  - Показывает блок `Другие размеры` (4 ссылки соседних размеров).

- **GR-09 pair**
  - Mirror и bed не перепутаны:
    - mirror PDP: title `Зеркало навесное`, article `GR-09-1-M`, asset `GR-09-1_temp_main_01.png`
    - bed PDP: article `GR-09-1`, asset `beds-shared/GR-BED-POOL_frame_01.jpg`
  - Asset/title confusion не обнаружен.

## 4. What failed

- Критичных ошибок в smoke check не выявлено.

## 5. Exact breakpoints if any

- Breakpoints не выявлены:
  - metadata in DB/API: OK
  - API response: OK
  - storefront render: OK
  - grouping logic: OK
  - display hierarchy: OK

## 6. Is Greenwich now a true reference pattern?

Да. На текущем этапе Greenwich можно считать true reference pattern для active-collection flow:

- ingestion -> seed/create -> metadata refresh/backfill
- корректная storefront-проекция card/group/PDP
- сохранённая GR-09 mirror/bed disambiguation

## 7. Recommended next step

1. Зафиксировать этот smoke check как baseline в release checklist (короткая регрессия: `/catalog` + bed PDP + mirror PDP).
2. Перейти к Oliver readiness pass, используя тот же metadata/display контракт и верификационный шаблон.
