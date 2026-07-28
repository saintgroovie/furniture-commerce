# Admin UX contract

## Product — «Как продаётся товар»

Zone: `product.details.side.after` (fallback: `product.details.after`).

Controls:

- Основной режим продажи (human labels)
- Дополнительные признаки (checkboxes with conflict validation)
- Ориентировочный срок изготовления
- Текст для покупателя
- Требуется подтверждение менеджера
- Связанный комплект (if only_as_set)
- Доступность выставочного образца
- Причина недоступности

Preview card: buyer label, CTA, short explanation, can_add_to_cart yes/no.

No raw enums as primary text. Reset override → delete policy / mark unspecified (compat projection resumes).

## Order — «Статус изготовления Woodright»

Zone: `order.details.after`.

Shows:

- current stage (human)
- description
- payment status read-only
- fulfillment status read-only
- estimate date
- customer message
- internal note
- history (newest first)
- next allowed transitions only

Action «Изменить этап» dialog:

- stage chips (allowed only)
- estimate
- customer message
- internal note
- notify checkbox
- customer preview
- expected_version hidden field

Dangerous: on_hold, canceled (if allowed), correction — confirm + reason.

## Order list

Prefer zone `order.list.after` summary + dedicated Admin route:

**Route:** `/woodright/production` — label «Производство»

Columns: display id, production stage, payment, fulfillment, overdue?, customer action?, manager action?

Filters: new, needs_confirmation, awaiting_customer, in_production, QC, ready, on_hold, overdue.

Do not break core Medusa order list.
