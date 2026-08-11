# Sales mode matrix

## Modes (MVP)

| Code | Owner label | Buyer CTA | Cart | Stock relevant |
|---|---|---|---|---|
| `in_stock` | В наличии | Купить | yes | yes |
| `made_to_order` | Изготавливается на заказ | Заказать | yes | no (0 stock OK) |
| `configurable_to_order` | Изготавливается в выбранной конфигурации | Настроить и заказать | after config | no |
| `quote_required` | Цена и срок по запросу | Запросить расчёт | no | no |
| `bespoke_project` | Индивидуальный проект | Обсудить проект | no | no |
| `showroom_sample` | Выставочный образец | Забронировать образец | yes (qty≤available) | yes |
| `unavailable` | Недоступен для заказа | disabled / Узнать о возобновлении | no | ignored |

## Modifiers

| Code | Owner | Buyer hint | Notes |
|---|---|---|---|
| `preorder` | Предзаказ | Можно оформить заранее | forbidden with `unavailable` |
| `only_as_set` | Только в комплекте | Доступен в составе комплекта | requires `related_room_set_id` |
| `showroom_only` | Только в шоуруме | Смотрите в шоуруме | |
| `limited_series` | Ограниченная серия | Ограниченный тираж | |
| `discontinued` | Снят с производства | Больше не производится | forbidden with `in_stock` unless `showroom_sample` mode |
| `manager_confirmation_required` | Нужно подтверждение менеджера | Менеджер подтвердит детали | |

## Forbidden combinations (validator)

- `unavailable` + `preorder`
- `discontinued` + `in_stock` (mode)
- `only_as_set` without `related_room_set_id`
- `showroom_sample` + `only_as_set` (MVP simplify: sample is singular SKU)
- `bespoke_project` + `preorder`

## Compat projection (no DB write)

When policy missing:

| ProductClassification | Projected sales_mode | Notes |
|---|---|---|
| `STANDARD` | `made_to_order` | Proposal only; cart remains allowed |
| `CONFIGURABLE` | `configurable_to_order` | |
| `BESPOKE` | `bespoke_project` | cart gate remains fail-closed |
| missing | treat as validation failure for cart | keep existing gate |

`metadata.launch_mode=request_quote` ⇒ force purchase_flow `quote` / CTA «Запросить расчёт» even if classification STANDARD/CONFIGURABLE.

## Buyer DTO (Store)

```ts
{
  sales_mode: SalesMode
  modifiers: SalesModifier[]
  can_purchase: boolean
  purchase_flow: "cart" | "quote" | "bespoke" | "none"
  cta_label: string
  availability_label: string
  requires_configuration: boolean
  requires_manager: boolean
  stock_relevant: boolean
  reason_code: string | null // internal; Store may omit or map to safe text
  lead_time_text: string | null
  buyer_message: string | null
}
```

Storefront must not re-derive CTA from raw enums when DTO present.
