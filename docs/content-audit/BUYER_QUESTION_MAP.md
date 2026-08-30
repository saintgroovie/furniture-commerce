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
| Можно вернуть товар? | `PARTIAL` | Launch: обратиться в Woodright (`OD-03 = B`). Custom SOP `NOT YET APPROVED`. Live 14 days = not new-site SoT |
| Сколько есть времени? | `LEGAL REVIEW` / `PARTIAL` | Do **not** publish 14. Statutory windows remain `EXTERNAL VERIFICATION`, not owner numbers. Mapping `LEGAL REVIEW` |
| Использует ли Woodright старое правило 14 дней? | `ANSWERABLE` | Нет. `LEGACY_14_DAYS = NOT NEW-SITE SOT` |
| Bespoke всегда невозвратен? | `ANSWERABLE` | Нет. `BESPOKE LABEL != AUTOMATIC NO-RETURN RULE` |
| Куда обращаться по возврату / проблеме с заказом? | `PARTIAL` / `ANSWERABLE FOR LAUNCH` | Showroom phones / messengers. Claims email `MISSING`. TG/WA not ratified as formal claims filing |
| Можно обменять? | `MISSING` | No current exchange SOP |
| Можно вернуть стандартный товар? | `LEGAL REVIEW` / `PARTIAL` | Case 1: 26.1 *may* apply; make-to-order after pay **MISSING**. No Woodright policy |
| Можно вернуть товар с выбранной штатной обивкой? | `LEGAL REVIEW` | Case 2: CONFIGURABLE preset ≠ automatic individually-defined. Do not publish «обивка = невозврат» |
| Можно вернуть товар штатного цвета / штатного размера? | `LEGAL REVIEW` | Case 3: same as preset options |
| Что если размер сделали специально (вне списка, напр. 187 см)? | `LEGAL REVIEW` | Case 4: product-wise BESPOKE; legal exception is a *candidate*, not a published ban |
| Что если мебель по проекту / Woodright Bespoke? | `LEGAL REVIEW` | Same entity as «По проекту». `BESPOKE LABEL != AUTOMATIC NO-RETURN RULE`. Cases 5–6 |
| Можно ли отменить заказ до оплаты / до PaymentLink? | `MISSING` / `LEGAL REVIEW` | `OD-05`: order may exist unpaid. No SOP |
| Можно ли отменить после PaymentLink, но до оплаты? | `MISSING` | No SOP |
| Можно ли отменить после оплаты, до производства? | `PARTIAL` | 26.1 before transfer; ops `MISSING` |
| Что вместо возврата: ремонт / замена? | `MISSING` ops; law 18–24 for defects | Journey on `/returns`; commercial term 12 months on `/warranty` (`OD-04 = B`) |
| Что если товар с дефектом? | `PARTIAL` | Statutory 18–24 cannot be waived (`EXTERNAL VERIFICATION`). Woodright process `MISSING`. Not the same as a published 18-month commercial term |
| Что если повредили при доставке? | `PARTIAL` / `MISSING` | Historical: inspect / act. Current SOP `MISSING`. Not warranty |
| Что если не хватает детали? | `MISSING` current | Live page 7 calendar days = `STALE` |
| Куда обращаться? | `PARTIAL` | Showroom phones/messengers confirmed. Dedicated claims email `MISSING`. Not demostore / not privacy email |
| Какие документы нужны? | `MISSING` ops; law allows other proof of purchase | Photos/act not in current SOP |
| Кто забирает мебель? | `MISSING` | |
| Кто платит за обратную доставку? | `MISSING` ops / `LEGAL REVIEW` | 26.1 deduct for good-quality remote refuse; Rospotrebnadzor: defective return at seller expense. Not an unconstrained owner pick |
| Когда вернут деньги? | `MISSING` ops; 26.1 says 10 days from demand for that scenario | PaymentLink ≠ auto-refund |
| Можно ли отказаться до доставки? | `PARTIAL` | 26.1: anytime before transfer (`LEGAL REQUIREMENT` for consumer remote sale). Ops `MISSING` |
| Можно ли отменить заказ после оплаты? | `MISSING` / `LEGAL REVIEW` | Before handover: 26.1 may still apply. After production start: do not invent fee |
| Что происходит, если производство уже началось? | `MISSING` / `LEGAL REVIEW` | No retainer / cancellation-fee SoT. Do not invent |
| Гарантийный срок? | `ANSWERABLE` | `OD-04 = B`: **12 months** owner-set. Live 18 months = `LEGACY PUBLIC DIVERGENCE`. Statutory defect rights remain (`EXTERNAL VERIFICATION`) |

## Warranty (verified 2026-08-19; `OD-04 = B` 2026-08-19)

Do not treat live `/oferta/` 18 months as answers. Pack: `docs/content-audit/OD04_WARRANTY_VERIFICATION.md`. `PRODUCT LABEL != AUTOMATIC WARRANTY TERM`.

| Question | Status | Notes |
| --- | --- | --- |
| Есть ли коммерческая гарантия Woodright? | `ANSWERABLE` | Да. Launch commercial term = **12 months** (`OD-04 = B`). Provenance = explicit owner decision 2026-08-19, not legacy sources |
| Сколько действует? | `ANSWERABLE` | 12 месяцев |
| С какого момента? | `LEGAL REVIEW` / `CONTENT COMPLETION` | Legacy «с момента передачи» not owner-confirmed. Do not publish that phrase yet |
| На изделие целиком / конструкцию? | `PARTIAL` / `LEGAL REVIEW` | Base public term 12 months; no approved scope matrix |
| На фурнитуру / механизмы / обивку / ЛКП? | `PARTIAL` / `LEGAL REVIEW` | `NOT SEPARATELY CONFIRMED`. Not «0 months» / not «no warranty» |
| На Bespoke / штатную обивку / штатный размер? | `ANSWERABLE` (principle) | Label does not set a different term. Base = 12 months. Contract-specific exceptions must be separate |
| На стеновые панели / монтаж? | `MISSING` | OD-08 OPEN. Do not invent |
| Что делать при недостатке? | `PARTIAL` / `ANSWERABLE FOR LAUNCH` | Contact showroom phones (`OD-03`). Detailed SOP not approved. Claims email `MISSING` |
| Когда ответят? | `MISSING` | `OD-06B` = no extra public SLA. Do not invent SLA |
| Как рекламация? | `PARTIAL` | Contact showroom; no extra Woodright SLA (`OD-06B`). Warranty-specific SOP `MISSING` (term closed by `OD-04 = B`) |
| Приедет мастер / кто платит ремонт / везти мебель? | `MISSING` | Do not promise a free visit |
| Сам собрал / сторонние сборщики? | `LEGAL REVIEW` | Dogovor 5.6 `SUSPECT` - do not port |
| Что после коммерческого срока? | `ANSWERABLE` at law | ЗоЗПП ст. 19 (2 years / proof). `EXTERNAL VERIFICATION`. 12 months does not wipe statutory rights |
| Нужен гарантийный талон? | `ANSWERABLE` | Current talon **not found**. Do not tell buyers to keep one |
| Какие фото / документы? | `MISSING` ops | Legacy: packaging/labels. Law: purchase proof not only receipt |

## After purchase / returns (continued)

| Question | Status | Notes |
| --- | --- | --- |
| Как рекламация? | `PARTIAL` | Contact showroom; no extra Woodright SLA (`OD-06B`). Warranty-specific SOP `MISSING` (term closed by `OD-04 = B`) |
| Возврат надлежащего качества? | `CONFLICT` / `MISSING` current | Public 14 days + Demo Magazin = invalid. Rem TBD |
| Исключения для заказных? | `LEGAL REVIEW` + `OWNER DECISION` only for extra goodwill | Not «запретить всё» |

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
