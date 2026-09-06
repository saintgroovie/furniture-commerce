# Buyer question map

Status codes: `ANSWERED` | `PARTIAL` | `CONFLICT` | `MISSING` | `N/A` | `OWNER DECISION` | `LEGAL REVIEW`

**Current remaining-OD status (2026-08-20):** `docs/content-audit/20260820_LAUNCH_COMPLETION.md`. Rows below that still say `OD-06 still OPEN` / `OD-08 OPEN` are **historical as of the audit date**, superseded for launch blocking.

## Before order

| Question | Status | Notes |
| --- | --- | --- |
| Где посмотреть мебель? | `ANSWERED` | Showroom Химки, Гранд-2 (SHOW-REM) |
| Часы работы шоурума? | `CONFLICT` / `SUSPECT` | Public footer `Пн-Вс 10–21`; not in showroom SoT; rem says «по записи» / «по договорённости» |
| Нужна ли запись? | `PARTIAL` | Rem delivery: самовывоз/примерка по записи; hours unclear |
| Можно консультацию? | `PARTIAL` | CTA «Получить консультацию» → contacts; no SLA |
| Можно изменить размер / материал? | `PARTIAL` | Штатный предусмотренный вариант = CONFIGURABLE (корзина). Нестандарт, которого нет среди опций = Bespoke (заявка). Сам факт «изменить размер» категорию не задаёт |
| Это склад или на заказ? | `PARTIAL` | Sales modes exist in code; buyer FAQ thin |
| Делаете нестандарт / Bespoke? | `PARTIAL` | Same service as historical «По проекту», now named Woodright Bespoke (owner clarification). Live nav still «По проекту»; «под ключ» overclaim. Commercial terms `MISSING` |
| Работа через моего дизайнера? | `PARTIAL` | Designers pages exist; no commercial programme |
| Образец материала? | `PARTIAL` | Designers materials promise; no how/cost/return |
| Нужен ли замер? Кто? Платно? | `MISSING` | Only AI media alt «замерщик» |
| Стеновые панели: как заказать / монтаж? | `MISSING` | Footer bullet only |

## Checkout / payment

| Question | Status | Notes |
| --- | --- | --- |
| Как оплатить? | `ANSWERED` | `OD-05 = A`: без оплаты на checkout; после согласования - ссылка или счёт. `/payment` READY_FOR_COPY_PHASE |
| Нужна предоплата %? | `MISSING` | Not in buyer pages; OD-05 does not set a percent |
| Когда остаток? | `MISSING` | |
| Карта / QR / Сбербанк на сайте? | `ANSWERED` (no) | **NOT PROMISED** on new site. Live CS-Cart = `LEGACY DIVERGENCE` |
| Счёт юрлицу? | `PARTIAL` | Invoice is in the ratified model; B2B paperwork details not specified |
| Рассрочка? | `ANSWERED` (no) | **NOT PROMISED**. Live «своя рассрочка» = `NOT NEW-SITE SOT` |
| Когда акцепт оферты? | `OWNER DECISION` | `OD-06` still OPEN - not implied by OD-05 |
| Согласие на ПДн / оферту при checkout | `LEGAL REVIEW` | Consent copy exists; offer still `owner_review`; OD-06 open |

## Delivery / lift / assembly

Verified 2026-08-15; **OD-02 = B** ratified 2026-08-17 (`OWNER_DECISION_OD02_B_DELIVERY_QUOTE_ONLY`). Legacy ₽/% = `LEGACY DIVERGENCE` / `REJECT AS NEW-SITE SOT`. Geography / lift / assembly / pickup **not** implied.

| Question | Status | Notes |
| --- | --- | --- |
| Доставляете? | `PARTIAL` | Process yes (manager-agreed). Fleet/contractor `MISSING` |
| Куда доставляете? | `MISSING` / owner input required | Not implied by OD-02 = B. Medusa `ru` = plumbing only |
| Сколько стоит? | `ANSWERABLE` | Quote-only: стоимость после оформления, согласование менеджером до оплаты |
| За МКАД / регионы? | `MISSING` / owner input required | Legacy МО formula / ТК = not new-site SoT |
| Сроки / дата? | `MISSING` | |
| Что входит? Разгрузка? | `MISSING` | |
| Подъём / без лифта / входит ли? | `MISSING` | Legacy % rejected; current policy not confirmed |
| Сборка входит? Цена? Кто? | `PARTIAL` / `UNRESOLVED` | Checkout may discuss assembly; 3% rejected; not confirmed as a service |
| Самовывоз? | `PARTIAL` - depends on OD-07 / further owner confirmation | Rem showroom-by-appointment; no checkout pickup |
| Когда узнаю стоимость доставки? | `ANSWERABLE` | After order, with manager confirmation, before PaymentLink/invoice |
| Нужно ли оплачивать доставку сразу на checkout? | `ANSWERABLE` | Нет. Коммерческие условия уточняются до PaymentLink/invoice (`OD-05` + `OD-02`) |
| Дата доставки как согласовать? | `MISSING` | |

## Measurement / install / panels

| Question | Status | Notes |
| --- | --- | --- |
| Собираете мебель у клиента? | `PARTIAL` / `UNRESOLVED` | Mentioned in checkout; not confirmed by OD-02 = B |
| Монтаж стеновых панелей? | `MISSING` | |
| Требования к основанию? | `MISSING` | |
| Проектирование панелей? | `MISSING` | |

## After purchase / returns (verified 2026-08-17; `OD-03 = B` 2026-08-19)

Do not treat live `/vozvrat/` as answers. Pack: `docs/content-audit/OD03_RETURNS_VERIFICATION.md`.

| Question | Status | Notes |
| --- | --- | --- |
| Можно вернуть товар? | `PARTIAL` | Launch SOP: `docs/owner/returns-sop.md`. Contact Woodright. Live 14 days = not new-site SoT |
| Сколько есть времени? | `ANSWERABLE` as **law**, not Woodright extra | Remote: 7 days / 3 months (26.1). Offline exchange: ст. 25. Not owner-set 14 |
| Можно обменять? | `PARTIAL` | Offline ст. 25; гарнитур list 2463 п. 8; remote uses 26.1 not 14-day theme |
| Можно вернуть стандартный товар? | `PARTIAL` | Remote 26.1 *may* apply; individually-determined test on **facts**. SOP ready |
| Что если товар с дефектом? | `PARTIAL` | ст. 18–24; consumer chooses remedy. Intake in SOP |
| Какие документы нужны? | `ANSWERABLE` | Order id; other proof OK. No cheque-only bar |
| Кто платит за обратную доставку? | `PARTIAL` | Good-quality remote: seller may deduct consumer-to-seller ship (26.1). Defects / bulky: seller (18 п. 7 / Rospotrebnadzor). Arranger playbook still ops |
| Когда вернут деньги? | `PARTIAL` | 10 days = `LEGAL OBLIGATION` (26.1 / 22). PaymentLink ≠ auto-refund |
| Использует ли Woodright старое правило 14 дней? | `ANSWERABLE` | Нет. `LEGACY_14_DAYS = NOT NEW-SITE SOT` |
| Bespoke всегда невозвратен? | `ANSWERABLE` | Нет. `BESPOKE LABEL != AUTOMATIC NO-RETURN RULE` |
| Куда обращаться по возврату / проблеме с заказом? | `PARTIAL` / `ANSWERABLE FOR LAUNCH` | Showroom phones / messengers. Claims email `MISSING`. TG/WA not ratified as exclusive filing |
| Можно вернуть товар с выбранной штатной обивкой? | `ANSWERABLE` as method | CONFIGURABLE preset ≠ automatic individually-defined. SOP: do not publish «обивка = невозврат» |
| Можно вернуть товар штатного цвета / штатного размера? | `ANSWERABLE` as method | Same as preset options |
| Что если размер сделали специально (вне списка, напр. 187 см)? | `PARTIAL` | Stronger *candidate* for individually-defined; not a published ban. SOP facts test |
| Что если мебель по проекту / Woodright Bespoke? | `ANSWERABLE` as method | `BESPOKE LABEL != AUTOMATIC NO-RETURN RULE`. Defects still 18–24 |
| Можно ли отменить заказ до оплаты / до PaymentLink? | `MISSING` / `LEGAL REVIEW` | `OD-05`: order may exist unpaid. No cancellation-fee SoT |
| Можно ли отменить после PaymentLink, но до оплаты? | `MISSING` | No SOP |
| Можно ли отменить после оплаты, до производства? | `PARTIAL` | 26.1 before transfer; ops arranger `MISSING` |
| Что вместо возврата: ремонт / замена? | `PARTIAL` | ст. 18–24 consumer choice. Journey on `/returns` when shipped |
| Что если повредили при доставке? | `PARTIAL` | Inspect / act for visible defects. Hidden defects later. Not warranty void |
| Что если не хватает детали? | `PARTIAL` | Treat as defect / incomplete delivery. Live 7-day notice = `STALE` |
| Кто забирает мебель? | `PARTIAL` | Law: bulky defects seller’s cost (18 п. 7). Good-quality remote: buyer-side ship may be deducted. Arranger playbook ops |
| Можно ли отказаться до доставки? | `ANSWERABLE` as law | 26.1 anytime before transfer. Ops `MISSING` |
| Можно ли отменить заказ после оплаты? | `PARTIAL` | Before handover: 26.1 may apply. After production start: do not invent fee |
| Что происходит, если производство уже началось? | `PARTIAL` | Do not invent retainer. Individually-defined facts may matter |
| Гарантийный срок? | `ANSWERABLE` | `OD-04 = B`: **12 months**. Live 18 months = `LEGACY PUBLIC DIVERGENCE`. Statutory rights remain |

## Warranty (verified 2026-08-19; `OD-04 = B` 2026-08-19)

Do not treat live `/oferta/` 18 months as answers. Pack: `docs/content-audit/OD04_WARRANTY_VERIFICATION.md`. `PRODUCT LABEL != AUTOMATIC WARRANTY TERM`.

| Question | Status | Notes |
| --- | --- | --- |
| Есть ли коммерческая гарантия Woodright? | `ANSWERABLE` | Да. Launch commercial term = **12 months** (`OD-04 = B`). Provenance = explicit owner decision 2026-08-19, not legacy sources |
| Сколько действует? | `ANSWERABLE` | 12 месяцев |
| С какого момента? | `ANSWERABLE` (spec 2026-09-01) | From transfer. Storefront not shipped. Spec: `docs/owner/warranty-public-policy.md` |
| На изделие целиком / конструкцию? | `PARTIAL` | Manufacturing defects; no component matrix |
| На фурнитуру / механизмы / обивку / ЛКП? | `PARTIAL` | `NOT SEPARATELY CONFIRMED`. Not «0 months» |
| На Bespoke / штатную обивку / штатный размер? | `ANSWERABLE` (principle) | Label does not set a different term. Base = 12 months |
| На стеновые панели / монтаж? | `MISSING` | OD-08 OPEN. Do not invent |
| Что делать при недостатке? | `PARTIAL` / `ANSWERABLE FOR LAUNCH` | Contact showroom. SOP: `docs/owner/returns-sop.md`. Claims email `MISSING` |
| Когда ответят? | `MISSING` as Woodright SLA | `OD-06B`. Statutory 10 days are legal duties, not a commercial promise |
| Как рекламация? | `PARTIAL` | Contact showroom; no extra Woodright SLA (`OD-06B`) |
| Приедет мастер / кто платит ремонт / везти мебель? | `PARTIAL` | Do not promise a free visit. Bulky defects: ст. 18 п. 7 |
| Сам собрал / сторонние сборщики? | `ANSWERABLE` as spec | DIY damages vs independent manufacturing defects. Not total void |
| Что после коммерческого срока? | `ANSWERABLE` at law | ЗоЗПП ст. 19 (2 years / proof). 12 months does not wipe statutory rights |
| Нужен гарантийный талон? | `ANSWERABLE` | Current talon **not found**. Do not tell buyers to keep one |
| Какие фото / документы? | `PARTIAL` | Photos optional. Purchase proof not only receipt |

## After purchase / returns (continued)

| Question | Status | Notes |
| --- | --- | --- |
| Как рекламация? | `PARTIAL` / `ANSWERABLE FOR LAUNCH` | Contact showroom. Intake: `docs/owner/returns-sop.md` + `docs/owner/warranty-public-policy.md`. Claims email `MISSING`. No extra Woodright SLA (`OD-06B`) |
| Возврат надлежащего качества? | `ANSWERABLE` as SOP; live still `CONFLICT` | SOP: remote 26.1. Public 14 days + Demo Magazin = invalid live. Rem `/returns` not shipped |
| Исключения для заказных? | `ANSWERABLE` as criterion | Individually-determined two-limb test. Extra goodwill **not** chosen. Not «запретить всё» |

## Legal / identity

| Question | Status | Notes |
| --- | --- | --- |
| Кто продавец (юрлицо)? | `ANSWERED` | `OD-01 = A` (2026-08-15): ООО «Роэл-Техник». `FACT — CURRENT OWNER CONFIRMED`. Privacy email still `MISSING`. Full legal pack not approved |
| Реквизиты / банк? | `ANSWERED` (policy) | `OD-10 = B`: identity may be public later; **bank not public** on new site. Live CS-Cart bank block = legacy divergence |
| Privacy email? | `MISSING` | Do not invent; do not reuse legacy public emails |

## Designers / trade

| Question | Status | Notes |
| --- | --- | --- |
| Есть ли скидка / комиссия? | `MISSING` | No evidence in buyer copy |
| Чем designers ≠ bespoke? | `MISSING` | Same request form |
| SLA ответа? | `MISSING` | |
