# Woodright Site Commercial & Service Source of Truth

**Document role:** durable Source of Truth for commercial, service, and contractual *website* facts.  
**Audience:** Cursor/agents and operators. Not buyer-facing copy.  
**Created:** 2026-08-28 (Europe/Moscow).  
**Status token:** `WOODRIGHT_COMMERCIAL_SERVICE_SOT_PERSISTED`

This file is the **mandatory** first read before any agent invents, drafts, or changes buyer-facing content or behavior about payment, delivery, warranty, claims, returns, after-sales service, order acceptance, natural-material disclaimers, or Bespoke commercial terms.

Related boards (do not treat as competing SoT):

| File | Role vs this SoT |
| --- | --- |
| `docs/content-audit/OWNER_DECISIONS.md` | Compact OD board. Owner decisions here remain authoritative. |
| `docs/owner/legal-content-owner-review.md` | Seller identity packet. Full legal pack token `OWNER_LEGAL_CONTENT_APPROVED` issued 2026-09-03. |
| `docs/owner/contract-template-reconciliation.md` | Word-template warranty-term and postal-index record (`OD-04 = B`; postal `153025`). External `.docx` verified **12 months** and **153025** 2026-08-31. Not a replacement contract. |
| `docs/owner/returns-sop.md` | Launch returns SOP (`RETURNS_SOP_VERIFIED_AND_READY`). Not production `/returns` copy. |
| `docs/owner/warranty-public-policy.md` | `/warranty` public-policy spec (`WARRANTY_PUBLIC_POLICY_VERIFIED_AND_READY`). Not production copy. |
| `docs/content-audit/RETURNS_WARRANTY_LEGAL_LEDGER.md` | Current-law ledger (ст. 26.1 / 18–25 / PP 2463 / КС 7-П). Not a second SoT. |
| `docs/content-audit/FACT_LEDGER.md` | Research ledger. Evidence, not a second commercial policy. |
| `docs/content-audit/OD02_*.md` … `OD05_*.md` | Verification packs for individual ODs. |
| `docs/content-audit/BESPOKE_POSITIONING.md` | Product/IA positioning for Woodright Bespoke. |

Do **not** copy this document onto storefront pages in the same task that only maintains this SoT.

---

## Purpose

1. Persist facts extracted from the 2026 client supply-contract template of ООО «Роэл-Техник».
2. Keep four layers distinct: contract-confirmed facts; current owner decisions for the new site; stale or doubtful contract wording; unresolved owner/legal conflicts.
3. Stop future agents from inventing lead times, tariffs, warranty terms, payment methods, or return rules.

This contract is a **provenance source** for an existing/used contractual model. It does **not** automatically outrank a newer explicit owner decision for the new website.

---

## Authority and precedence

Highest to lowest for *website product/content behavior*:

1. Explicit current owner instruction in the active task.
2. Security / secrets / data-safety (including `OD-10` bank non-publication).
3. **Current owner decisions** in `docs/content-audit/OWNER_DECISIONS.md` (exact OD status lives there).
4. Current canonical repo governance (Cursor rules and this SoT’s publication status).
5. Verified current operational facts.
6. Contract-derived facts (provenance; not automatic public promises).
7. Legacy live CS-Cart pages and dumps.
8. Historical assumptions.

An owner website decision does **not** silently rewrite a still-used legal contract. Website *behavior/copy* follows the owner decision; legal/document consistency remains an explicit gate.

Rules:

- A number in the client contract is **not** automatically a public current website promise.
- A newer explicit owner decision wins for website behavior.
- A conflict between an owner decision and the still-used contract **must remain an explicit governance/legal gate**. Do not hide it.
- Checkout plumbing is **not** commercial SoT (`shipping = 0` is not free delivery).
- Semantic copy candidates below are **source guidance**, not production copy and not an instruction to ship UI in this file’s maintenance tasks.

---

## Source provenance

| ID | Source | Date / type | How to cite |
| --- | --- | --- | --- |
| CTR-2026 | Client template `ДОГОВОР ПОСТАВКИ ТОВАРА` / ООО «Роэл-Техник» / director Парадзинская И.Г. / year line `2026 г.` | 2026 template (operator file, not stored in git) | `CONTRACT — 2026 TEMPLATE` |
| OD-BOARD | `docs/content-audit/OWNER_DECISIONS.md` | 2026-08-15 / 17 / 19 | `CURRENT OWNER DECISION` |
| OWN-CARD | Owner-provided company card, recorded in `docs/owner/legal-content-owner-review.md` | 2026-08-15 | `CURRENT OWNER CONFIRMED` |
| LIVE-CSCART | Public `woodright.ru` CS-Cart (oferta, delivery, returns, payment) | last probed in content-audit 2026-08 | `LEGACY PUBLIC` / not new-site SoT |

**Provenance tags used in this file:**

| Tag | Meaning |
| --- | --- |
| `CONTRACT — 2026 TEMPLATE` | Present in the 2026 client contract template |
| `CURRENT OWNER DECISION` | Recorded OD for the new site |
| `CURRENT OWNER CONFIRMED` | Owner-confirmed fact (card or OD) |
| `OPEN / NEEDS RECONCILIATION` | Conflict or missing confirmation; do not silently pick a side |
| `INTERNAL ONLY` | Keep in repo; do not put on the public site |
| `SAFE PUBLIC FACT` | Meaning may be used after editorial adaptation |
| `SAFE WITH EDITORIAL ADAPTATION` | Sense OK; wording is not shipped copy |
| `DO NOT PUBLISH AS-IS` | Contract/legacy text must not become website copy unchanged |
| `VERIFY CURRENT OPS` | Ops must confirm before any public promise |
| `OPEN LEGAL GATE` | Owner/legal must close before public policy |

Unknown items are marked unknown. Recommendations are not confirmed facts.

---

## Current owner decisions

These override or constrain contract-derived *website* copy. Do not rewrite them here.

### OD-01 - Seller

`OD-01 = A`  
Seller for the new site: **ООО «Роэл-Техник»** (full: Общество с ограниченной ответственностью «Роэл-Техник»).  
Token: `OWNER_DECISION_OD01_A_CONFIRMED`  
Status: `CURRENT OWNER CONFIRMED` + contract corroboration (see Seller identity).

### OD-02 - Delivery

`OD-02 = B` / quote-only  
Token: `OWNER_DECISION_OD02_B_DELIVERY_QUOTE_ONLY`

- No public universal delivery tariff.
- Cost is calculated individually.
- Technical checkout shipping `0` is **not** free delivery and is **not** a commercial promise.

### OD-03 - Returns

Recorded board: `OD-03 = B` (2026-08-19) - launch **communication/process** = manager-assisted; mandatory consumer rights preserved.  
Token: `OWNER_DECISION_OD03_B_MANAGER_ASSISTED_RETURNS_WITH_LEGAL_BASELINE`

**Launch SOP (2026-09-01):** `docs/owner/returns-sop.md` - `RETURNS_SOP_VERIFIED_AND_READY`. Manager-assisted; statutory remote / defect / individually-determined tests recorded. Extra goodwill window **not** chosen.

`OD-03 = B` is still **not** by itself `OWNER_LEGAL_CONTENT_APPROVED`. The pack token was issued separately on 2026-09-03.

`BESPOKE` label is **not** an automatic no-return rule.
Contract §5.10 / PP 55: `SUPERSEDED / NOT CURRENT PUBLIC AUTHORITY` - do not publish. Future Word mutation.

### OD-04 - Warranty

`OD-04 = B`  
Public launch commercial warranty: **12 months**.  
Token: `OWNER_DECISION_OD04_B_WARRANTY_12_MONTHS_OWNER_SET`  
Provenance: explicit owner decision 2026-08-19, **not** inheritance of legacy 12/18-month wording.

**P0/P1 gate (closed 2026-08-31 for Word vs website term):** current contract template **12 months**. See Warranty. Live CS-Cart 18 months remains `LEGACY PUBLIC DIVERGENCE`.

### OD-05 - Payment

`OD-05 = A`  
Manager confirmation, then invoice / PaymentLink.  
Token: `OWNER_DECISION_OD05_A_MANUAL_INVOICE_PAYMENT_LINK`

Do not promise: embedded on-site acquiring; QR; installments; a prepayment percentage.

### OD-06 - Offer acceptance + claims SLA

Exact current-main registry (2026-08-20). Do **not** collapse this to a false `OD-06 = OPEN` owner-blocker.

**OD-06A** = `IMPLEMENTATION DECISION` + `LEGAL REVIEW`  
Token: `OD06A_ORDER_SUBMIT_IS_REQUEST_NOT_ACCEPTANCE`  
Site submit = request for confirmation, not public-offer acceptance. Exact civil-law acceptance moment remains `LEGAL REVIEW`. Do not publish payment = акцепт as a settled rule. This is **not** an owner decision.

**OD-06B** = `NO ADDITIONAL COMMERCIAL PROMISE`  
Token: `OD06B_NO_EXTRA_COMMERCIAL_SLA`  
No current internal SLA. Do not publish 3 / 5 / 10 / 30 / 45 days as a Woodright service SLA.

The 2026 contract template still contains **5 working days** (warranty claims) and **5 calendar days** (dispute pretension). Those numbers are contract provenance, not a public website SLA. Do not silently choose one for buyer-facing copy.

### OD-10 - Bank details

`OD-10 = B` / **not public**  
Token: `OWNER_DECISION_OD10_B_BANK_DETAILS_NOT_PUBLIC`  
Do not show bank account / correspondent account / BIK to the website visitor.

Autonomous launch closures 2026-08-20 (not owner tokens; see `OWNER_DECISIONS.md` / `20260820_LAUNCH_COMPLETION.md`): OD-07, OD-08, OD-09, OD-11, OD-12 are **not** remaining owner-open launch blockers. Privacy email / PD copy remain incomplete. Full legal pack token `OWNER_LEGAL_CONTENT_APPROVED` **issued 2026-09-03** (fail-closed pack acceptance of the published caf82b0 buyer legal pages; does not invent a privacy email).

---

## Seller identity

| Field | Value | Authority | Public status |
| --- | --- | --- | --- |
| Legal entity | ООО «Роэл-Техник» | `CURRENT OWNER CONFIRMED` + `CONTRACT — 2026 TEMPLATE` | `SAFE` (identity) |
| OGRN | `1153702012848` | same | `SAFE` |
| INN | `3702111074` | same | `SAFE` |
| KPP | `370201001` | same | `SAFE` |
| Director | Парадзинская Ирина Григорьевна | `CONTRACT — 2026 TEMPLATE` | `INTERNAL ONLY` until a public-requisites task asks for it |
| Legal address (owner card) | `153025, г. Иваново, ул. Дзержинского, д. 39, оф. 514` | `CURRENT OWNER CONFIRMED` | `SAFE` for identity pages after legal pack |
| Legal address (current contract template) | `153025, г. Иваново, ул. Дзержинского, 39, оф. 514` | `CONTRACT — 2026 TEMPLATE` (verified 2026-08-31) | **aligned** with owner card |

**Postal index:** current seller and current Word template are **153025**. CTR-2026 previously contained `153000` (same street and office). Historical discrepancy retained; gate closed. Record: `docs/owner/contract-template-reconciliation.md`.

**Bank details:** present in the 2026 contract template and on the owner card. **Do not duplicate account numbers in this website SoT.** `OD-10 = NOT PUBLIC`. Invoice as a private payment document may include them; that does not authorize `/requisites`, footer, `/payment`, offer, FAQ, or structured data.

Privacy email / PD operator copy: still `MISSING`. Do not invent. Do not reuse legacy public emails.

---

## Orders and specification

**What is sold (contract):** furniture and/or interior décor objects. Assortment, quantity, price, and the agreed supply date are set in the Счёт-заказ (Appendix 1).

Status: `CONTRACT CONFIRMED`

**No universal catalogue lead time exists in the contract.** Do not invent site-wide `30` / `45` / `60` days unless another *current* SoT confirms it.

The Счёт-заказ must record: article numbers; extra elements; hardware; décors; finish variants; other chosen characteristics. Extra annexes and sketches are used when needed.

Principle: the agreed configuration lives in the order (and annexes), not only as a manager’s oral promise.

**Order changes (contract):** changes to the Счёт-заказ may be made no later than **2 working days** after prepayment; a change may shift the supply date.

Status: `CONTRACT CONFIRMED` / `VERIFY BEFORE PUBLIC PROMISE`  
Do not guarantee the public number `2 рабочих дня` unless current operations confirm it.

FAQ-sense (not shipped copy): changes can be agreed with a manager within a limited time after prepayment; a change may affect manufacturing time.

---

## Manufacturing and delivery timing

| Fact | Authority | Public status |
| --- | --- | --- |
| Supply deadline is individual, in the Счёт-заказ | `CONTRACT — 2026 TEMPLATE` | `SAFE WITH EDITORIAL ADAPTATION` |
| Delivery date is set by the manager with the buyer | `CONTRACT — 2026 TEMPLATE` | `SAFE WITH EDITORIAL ADAPTATION` |
| Changing the order may change the deadline | `CONTRACT — 2026 TEMPLATE` | `SAFE WITH EDITORIAL ADAPTATION` |
| Buyer should warn ≥ 10 days before the manufacturing date in the order to change the delivery date | `CONTRACT — 2026 TEMPLATE` | `VERIFY CURRENT OPS` / `DO NOT PUBLISH AS-IS` |

Safe public meaning (semantic only):

> Срок изготовления и поставки зависит от конкретного заказа. Точный срок подтверждает менеджер при оформлении заказа. Дата доставки согласовывается заранее.

---

## Payment

### Contract facts (`CONTRACT — 2026 TEMPLATE`)

- Prepayment is used; **the percentage/amount field is blank** in the template.
- Prepayment is due no later than **3 working days** after the Счёт-заказ is issued.
- The prepayment date is the start date of the contract.
- The unpaid remainder is due no later than **10 calendar days** before the shipment date in the order.
- Goods are handed over only after **full payment**.
- Payment methods in the template: cash to the seller’s cashier, or bank transfer to the seller’s account.

Do not publish the blank prepayment percentage, cash-to-cashier, or public bank-account payment as the new-site model.

### Current website owner decision (`OD-05 = A`)

Public model:

1. The order is confirmed by a manager.
2. Then the buyer receives a payment method.
3. Invoice / PaymentLink are allowed.
4. Do not promise on-site acquiring, QR, or installments.
5. Do not invent a prepayment percentage.

At conflict, **do not mix** contract cashier/bank-transfer wording with the website PaymentLink story.

Safe website semantic copy (not shipped here):

> После подтверждения заказа менеджер направит информацию для оплаты. Условия и этапы оплаты фиксируются в заказе. Передача мебели производится после полной оплаты.

---

## Delivery

### Current website owner decision (`OD-02 = B`)

- Quote-only. No public universal tariff.
- Technical `shipping = 0` ≠ free delivery.

### Contract tariffs (`CONTRACT — 2026 TEMPLATE` / `DO NOT PUBLISH AS CURRENT WEBSITE TARIFF`)

| Geography | Template figure | Public status |
| --- | --- | --- |
| Moscow | `2000` руб. | `DO NOT PUBLISH AS-IS` |
| Moscow Oblast | `1000` руб. + `50` руб./km from MKAD | `DO NOT PUBLISH AS-IS` |

Keep as historical provenance. New owner decision requires quote-only.

### Geography

Contract: seller **may** arrange delivery to any city in Russia via a carrier **at the buyer’s expense**.  
Status: `CONTRACT CONFIRMED` for the *possibility*.

Safe semantic fact:

> Woodright может организовать доставку заказов по России; способ, стоимость и условия согласовываются индивидуально.

Same contract clause: in that carrier model, delivery from the carrier warehouse, lift, installation, and assembly **may** be done by the buyer.  
Status: `VERIFY CURRENT OPERATIONS BEFORE PUBLICATION`. Do not treat this as nationwide operational policy.

### Standard delivery definition (`CONTRACT — 2026 TEMPLATE`)

Standard delivery = bringing the vehicle with furniture to:

- the entrance area of an apartment building, or
- the front door of a private house,

if access is available. Carry distance in the template: **not further than 50 metres**; carrying beyond that is a separate paid service (`0,5%` of order value per 50 m).

Metres/tariffs: `CONTRACT DETAIL` / `DO NOT PUBLISH WITHOUT CURRENT OPS CONFIRMATION`.

Semantic distinction that **is** important:

> Обычная доставка не равна подъёму и установке мебели внутри помещения.

### Time window

Template: `08:00-18:00`; weekday chosen by the seller.  
Status: `CONTRACT — VERIFY CURRENT OPERATIONS`. Do not publish as a current promise.

---

## Lift / assembly / installation

### Lift

Lift is separate from standard delivery.

Template tariffs (`DO NOT PUBLISH AS CURRENT TARIFF`):

| Case | Template rate |
| --- | --- |
| Freight elevator | `0,7%` of order value |
| Manual lift (apartment) | `0,5%` of order value per floor, from the first floor inclusive |
| Stair inside a private house | `0,5%` per floor |
| Spiral stair (if technically possible) | `1,5%` per floor |

Semantic fact until ops confirm prices:

> Подъём является отдельной услугой и должен быть согласован при оформлении доставки.

### Openings

- Standard lift requires door/corridor width of at least **80 cm**.
- Stairs and corridors must allow the furniture through.
- The buyer must report difficulties in advance.
- Oversized pieces that cannot go the standard way need a separate decision.

80 cm: `CONTRACT CONFIRMED` / `VERIFY CURRENT DELIVERY STANDARD BEFORE MAKING PROMINENT PUBLIC PROMISE`.

Useful guidance candidate:

> Перед доставкой сообщите менеджеру об узких дверных проёмах, лестницах, отсутствии грузового лифта и других особенностях подъёма.

### Assembly

**Key contract fact:** furniture is supplied **assembled**. Oversized or heavy pieces may arrive partly disassembled.

- Assembled-by-default: `CONTRACT CONFIRMED`
- Assembly tariff `3%` of order value: `DO NOT PUBLISH WITHOUT CURRENT OPS CONFIRMATION`

Safe semantic candidate (do not turn «большинство» into an absolute for every SKU):

> Большинство предметов Woodright поставляются в собранном виде. Для крупногабаритной мебели может потребоваться частичная сборка на месте. Необходимость и условия согласовываются заранее.

### Installation

Installation ≠ delivery. Installation = moving delivered furniture **beyond the hallway** inside the dwelling.

Seller staff do **not** automatically: move the buyer’s other furniture; drill walls; hang wall shelves; take doors off; clear passages; remove skirting; carry out the buyer’s belongings; other unagreed work.

The buyer must prepare the place and a free path.

Safe semantic candidate:

> Перед доставкой необходимо подготовить свободный проход и место для установки мебели. Дополнительные работы, необходимые для заноса или монтажа, следует согласовать заранее.

### Packaging removal

Staff may remove packaging only under limited conditions (buyer present; special container within 100 m). Otherwise packaging may be left on the stair landing.  
Status: `CONTRACT DETAIL` / `DO NOT PUBLISH WITHOUT CURRENT OPS CONFIRMATION`.

---

## Receiving the order

On receipt the buyer or authorized person must check appearance, quantity, assortment, completeness / obvious defects, and record claims on the acceptance act. Handover is a bilateral act. Title passes on signing.

Safe semantic content:

> При получении заказа необходимо осмотреть мебель и проверить комплектность. Видимые повреждения или несоответствия следует указать в акте приёма-передачи.

**Presence:** buyer or authorized representative must be present. Simple written power of attorney is mentioned.  
Status: `CONTRACT CONFIRMED` / `VERIFY CURRENT PROCESS BEFORE DETAILED PUBLIC COPY`.

**Failed handover (buyer’s fault):** if nobody is present and the buyer cannot be reached within **15 minutes**, goods return to the warehouse; a new delivery is agreed separately and paid separately. Template range: `7000–20000` руб.  
All figures: `DO NOT PUBLISH AS CURRENT WEBSITE TARIFF`.

Safe semantic idea:

> Если принять заказ в согласованное время не получится, необходимо заранее связаться с менеджером. Повторная доставка может оплачиваться отдельно.

---

## Natural materials

High-value reusable fact. `CONTRACT CONFIRMED` / `HIGH-VALUE SAFE PUBLIC FACT` (with careful editing).

Contract: natural wood is non-uniform; texture, shade, and grain may differ; such natural differences are **not** a defect by themselves. Upholstery shade may differ slightly between production batches; absolute match of colour and texture across batches is not guaranteed.

Recommended semantic wording:

> Натуральное дерево уникально. Рисунок волокон, фактура и оттенок могут отличаться от образца и между отдельными изделиями. Такие различия являются естественной особенностью натурального материала.

> Оттенок обивки может незначительно различаться между производственными партиями.

Relevant to: PDP, materials/help, FAQ, cart/order confirmation, showroom/sample explanations.

**Agent rule:** natural variation may be explained to the buyer; it is **not** a universal excuse for any defect.

---

## Warranty

### Term (aligned 2026-08-31)

| Side | Term | Authority |
| --- | --- | --- |
| Current 2026 client Word template (verified) | **12 months** from transfer of the goods | `CONTRACT — 2026 TEMPLATE` after `OD-04 = B` source edit |
| New-site owner decision `OD-04 = B` | **12 months** | `CURRENT OWNER DECISION` |
| Previous CTR-2026 Word wording (historical) | **18 months** from transfer | provenance; not current template term |
| Live CS-Cart `/oferta/` `/dogovor-postavki/` | **18 months** | `LEGACY PUBLIC DIVERGENCE` |

```text
CURRENT CONTRACT TEMPLATE WARRANTY = 12 MONTHS
CURRENT WEBSITE OWNER DECISION = 12 MONTHS
WARRANTY START = FROM TRANSFER OF GOODS TO BUYER
STATUS = CONTRACT/WEBSITE WARRANTY TERM ALIGNED
PREVIOUS CTR-2026 TEMPLATE WORDING = 18 MONTHS
RECONCILED UNDER OD-04 = B
ACTUAL WORD SOURCE UPDATED = YES
VERIFIED = 2026-08-31
```

Do **not** change the website 12 → 18. Do **not** treat live CS-Cart 18 months as current template. Evidence: `docs/owner/contract-template-reconciliation.md`.

Physical contract **term** alignment plus 2026-09-01 legal verification **closes** the public-policy spec for start / seller-obligor / narrow exclusions: `docs/owner/warranty-public-policy.md` (`WARRANTY_PUBLIC_POLICY_VERIFIED_AND_READY`). `OWNER_LEGAL_CONTENT_APPROVED` issued 2026-09-03 for the published caf82b0 pack. This line does not reopen commercial warranty facts.

### Start date

Contract: warranty starts **at transfer of the goods to the buyer**.  
Status: `CONTRACT CONFIRMED`. ЗоЗПП ст. 19 п. 2 matches. Public-policy wording **verified 2026-09-01** (not a new OD):

> Гарантийный срок - 12 месяцев с момента передачи товара покупателю

Implementation of that sentence on `/warranty` is a later storefront task.

### What is a warranty case

Buyer may claim on manufacturing defects found at assembly or during warranty use. Seller may inspect quality. An act records the claim, findings, and remedy. Confirmed defects are remedied by the seller, at the seller’s cost, in an agreed time.

Status: `CONTRACT CONFIRMED`

Safe semantic model:

> Если в течение гарантийного срока обнаружен производственный недостаток, покупатель может обратиться в Woodright. При необходимости проводится проверка качества, после которой подтверждённые недостатки устраняются продавцом.

### Exclusions (careful summary)

Contract exclusions include: breach of use rules; repair by unauthorized persons; mechanical damage; intentional damage; third-party unlawful acts; force majeure. Separate condition: delivery/lift/assembly by the buyer or third parties, except manufacturing defects.

Cautious semantic summary (do **not** expand consumer-right limits beyond what law allows):

> Гарантия относится к производственным недостаткам и не распространяется на повреждения, возникшие вследствие нарушения правил эксплуатации, механического воздействия, самостоятельного ремонта или других внешних причин.

STANDARD / CONFIGURABLE / BESPOKE labels do **not** get different warranty terms from the label alone.

---

## Claims

### SLA - not a public Woodright promise (`OD-06B`)

| Place in 2026 template | Period |
| --- | --- |
| Warranty section (claims at the purchase place) | **5 working days** |
| Dispute-resolution section | **5 calendar days** from receipt of the pretension |

`OD-06B` = no additional commercial SLA. Do not publish «ответим за 5 дней» or any other Woodright service deadline. Contract 5-working / 5-calendar wording stays provenance until owner/legal say otherwise. `OD-06A` (acceptance moment) remains `LEGAL REVIEW` and is a different question.

### Channel / location

Contract physical claims address:

`Московская область, г. Химки, ул. Бутакова, д. 4, МТК Гранд-2, вход 3, этаж 4, торговый подиум WOODRIGHT`

Status: `CONTRACT ADDRESS — MUST VERIFY CURRENTNESS`  
Do not make this the only buyer-facing claims channel.

Preferred new-site *product* direction (not contract-proven): contact manager/support, describe the issue, attach photos, receive instructions. A digital claims flow is **not** confirmed by the contract. Do not invent email, form, or SLA.

---

## After-warranty service

Contract: paid service is possible for non-warranty cases and after the warranty ends.  
Status: `CONTRACT CONFIRMED`

Safe semantic candidate:

> После окончания гарантийного срока можно обратиться в Woodright по вопросу сервисного обслуживания. Возможность и стоимость работ определяются индивидуально.

Do not promise a work list or SLA without further confirmation.

---

## Returns

**Do not use contract §5.10 as new-site returns copy.**  
Tag: `DO NOT USE CONTRACT §5.10 AS NEW-SITE RETURNS COPY`

The template cites `Постановление Правительства РФ №55 от 19.01.1998` (`SUPERSEDED` from 01.01.2021; current list is ПП 2463 п. 8 **гарнитуры**, and **not** a remote-sale override).

Do **not** port §5.10 as a universal current-site rule:

- PP 55 is not current public authority;
- distance-selling (ст. 26.1 + КС 7-П) is not replaced by in-salon ст. 25;
- a `BESPOKE` label is not an automatic returns ban;
- buyer rights depend on the legal circumstances of the specific sale.

Launch communication model (`OD-03 = B`) plus verified SOP: `docs/owner/returns-sop.md`.
Storefront `/returns` still not shipped. Extra goodwill **not** chosen.

Showroom/exposition goods (special case, `CONTRACT CONFIRMED`): buyer inspects visually; condition is recorded in the Счёт-заказ or act; known defects are recorded. Do not apply this to the whole catalogue.

---

## Bespoke

Contract proof (`CONTRACT CONFIRMED`): changing standard furniture sizes; making a new piece to the customer’s wishes/sizes; recording that in the Счёт-заказ; extra annex with sketches; buyer confirmation of the agreed specification.

This supports the product concept **Woodright Bespoke**. Current product model:

- `STANDARD`
- `CONFIGURABLE`
- `BESPOKE`

Bespoke is not another catalogue category; it must not enter the ordinary cart flow; it is manager-led; non-standard parameters are designed/agreed; the result is fixed in specification / order / sketch.

Contract-derived workflow:

> обращение → обсуждение с менеджером → спецификация → при необходимости эскиз → подтверждение → изготовление

Do **not** read the contract as a promise to make “absolutely anything” or “any complexity”.  
`BESPOKE` ≠ automatic legal ban on returns.

Product positioning detail: `docs/content-audit/BESPOKE_POSITIONING.md`.

---

## Internal-only commercial terms

Do not publish as a general website offer without a new owner/ops confirmation.

| Topic | Template term | Status |
| --- | --- | --- |
| Storage after readiness | 7 calendar days, then `0,1%` of goods value per day | `CONTRACT COMMERCIAL TERM` / `DO NOT PUBLISH AS CURRENT POLICY` |
| Deferred receipt | Agreed terms may be held up to **6 months**; after that the seller may revise terms including price | `CONTRACT COMMERCIAL TERM` / `INTERNAL ONLY` |
| Unjustified refusal / unilateral cancellation | template **30%** penalty of goods value | `INTERNAL ONLY` / `OPEN LEGAL GATE` vs consumer law |
| Seller delay > 5 working days | `0,05%` per day of the paid amount (cap) or return of prepayment | `INTERNAL ONLY` |
| Force majeure | standard block; deadlines shift by the duration of the obstacle | legal-contract detail; not marketing/help copy unless needed |

Safe storage FAQ sense (not a published penalty):

> Перенос даты получения готового заказа необходимо заранее согласовать с менеджером. При длительном хранении могут действовать отдельные условия договора.

---

## Public website information matrix

| Topic | Fact / rule | Authority | Public status | Notes |
| --- | --- | --- | --- | --- |
| Seller identity | ООО «Роэл-Техник»; OGRN/INN/KPP as above | Owner + contract | `SAFE` | OD-01 |
| Legal address | Owner card + current Word `153025` … оф. 514 | Owner card | `OWNER DECISION` | CTR-2026 previously `153000`; reconciled 2026-08-31 |
| Bank details | Exist in contract and card | OD-10 | `INTERNAL ONLY` | Never public |
| Manufacturing/delivery timing | Individual; manager confirms | Contract + no universal SLA | `SAFE WITH EDITORIAL ADAPTATION` | Do not invent 30/45/60 days |
| Payment | Manager → invoice / PaymentLink; handover after full payment | OD-05; contract full-pay | `OWNER DECISION` | Mix neither with cashier/QR/acquiring |
| Delivery price | Quote-only | OD-02 | `OWNER DECISION` | Checkout `0` is technical |
| Moscow delivery | Template `2000` руб. | Contract 2026 | `DO NOT PUBLISH AS-IS` | Provenance only |
| Russia delivery | May arrange via carrier at buyer cost | Contract | `SAFE WITH EDITORIAL ADAPTATION` | DIY last-mile/lift not auto policy |
| Lift | Separate service; template % | Contract / OD-02 | `VERIFY CURRENT OPS` | Semantic: not included in delivery |
| Assembly | Supplied assembled; template `3%` | Contract | assembled = `SAFE WITH EDITORIAL ADAPTATION`; `3%` = `DO NOT PUBLISH AS-IS` | Not every SKU |
| Installation | Beyond hallway; extras not included | Contract | `SAFE WITH EDITORIAL ADAPTATION` | Launch `OD-08` = do not promise measurement/install/«под ключ» |
| Preparation for delivery | Free path; report tight openings | Contract | `SAFE WITH EDITORIAL ADAPTATION` | 80 cm = verify before prominent promise |
| Acceptance | Inspect; record on the act | Contract | `SAFE WITH EDITORIAL ADAPTATION` | Presence process = verify |
| Natural wood | Variation ≠ defect by itself | Contract | `SAFE WITH EDITORIAL ADAPTATION` | Not a blanket defect waiver |
| Upholstery batches | Slight shade difference | Contract | `SAFE WITH EDITORIAL ADAPTATION` | |
| Warranty term | Website **12 months**; current Word template **12 months** | OD-04 + verified CTR-2026 | `ALIGNED` (term) | Live CS-Cart 18 months = legacy. History: template was 18 until 2026-08-31 |
| Warranty start | From transfer | Contract + ст. 19 п. 2 | `SAFE WITH EDITORIAL ADAPTATION`; spec closed 2026-09-01; `/warranty` not shipped | |
| Warranty defects | Manufacturing defects; seller remedies | Contract | `SAFE WITH EDITORIAL ADAPTATION` | |
| Claims SLA | Not a public Woodright promise; contract 5 working / 5 calendar days | OD-06B + contract | `OWNER DECISION` (no extra SLA) + contract provenance | Do not publish 5 days |
| Claims channel | Khimki showroom address in contract | Contract | `VERIFY CURRENT OPS` | Not the only channel |
| After-warranty service | Paid service possible | Contract | `SAFE WITH EDITORIAL ADAPTATION` | No SLA/list |
| Returns | Manager-assisted + verified SOP | OD-03 B + `returns-sop.md` | `SOP READY`; `/returns` not shipped | PP 55 superseded; no Bespoke auto-ban |
| Bespoke | Spec/sketch/manager; no cart | Contract + product model | `OWNER DECISION` | Not “we make anything” |
| Deferred delivery | 6-month hold then seller may revise | Contract | `INTERNAL ONLY` | |

---

## Open conflicts and governance gates

### GATE-WARRANT-TERM (closed 2026-08-31 for Word vs website)

Current Word template **12 months** and `OD-04 = B` **12 months** are aligned. Previous CTR-2026 wording **18 months** is historical provenance. Live CS-Cart 18 months remains `LEGACY PUBLIC DIVERGENCE`. Record: `docs/owner/contract-template-reconciliation.md`. Public-policy spec (start / seller-obligor / narrow exclusions): `docs/owner/warranty-public-policy.md`. Storefront `/warranty` not shipped.

### GATE-CLAIMS-SLA / acceptance

`OD-06B`: no public Woodright SLA. Contract 5 working vs 5 calendar days remain provenance. `OD-06A`: civil-law acceptance moment is `LEGAL REVIEW`, not an owner-closed rule.

### GATE-RETURNS (SOP closed 2026-09-01; storefront not shipped)

Launch SOP: `RETURNS_SOP_VERIFIED_AND_READY`. Do not ship contract §5.10 / PP 55 (`SUPERSEDED`). `OD-03 = B` remains the communication model. Extra goodwill / live `/vozvrat/` cutover / Word §5.10 remain follow-ups.

### GATE-POSTAL-INDEX (closed 2026-08-31)

Current seller postal index and current Word template postal index are **153025**. Previous CTR-2026 template value was **153000** (same street/office). Token: `WOODRIGHT_POSTAL_INDEX_RECONCILED`. Evidence: `docs/owner/contract-template-reconciliation.md`. Do not reopen from historical `153000` wording.

### GATE-TARIFFS

Contract ₽/% tables vs `OD-02` quote-only. Tariffs stay provenance.

### GATE-OPS-SUBFACTS

Geography DIY last-mile, `08:00-18:00` window, 80 cm, 50 m, packaging removal, 15-minute failed-delivery, storage 0.1%, 2-working-day change window: verify ops before public promises.

---

## Rules for agents

1. A number in the client contract is not automatically a public current website promise.
2. A newer explicit owner decision has priority for website product/content behavior.
3. If an owner decision and the live contract conflict, keep the conflict as a governance/legal gate. Do not hide it.
4. Do not invent: manufacturing lead time; delivery lead time; delivery price; prepayment percentage; payment methods; claims SLA; returns terms; warranty exclusions; service scope.
5. Checkout technical behavior is not commercial SoT.
6. `shipping = 0` does not mean free delivery.
7. `BESPOKE` does not mean an automatic legal ban on returns.
8. Natural-material variation may be explained; it is not a universal excuse for any defect.
9. Contract tariffs stay provenance facts until owner/ops confirm they are still used.
10. Bank details stay non-public.
11. Before creating or changing a page or flow for `delivery`, `payment`, `warranty`, `returns`, `service`, `FAQ`, or `bespoke` commercial terms, **read this SoT first**.

---

## Known repository conflicts / follow-ups

Do **not** rewrite buyer-facing product pages in the task that only maintains this SoT. Classification only.

| Location | What conflicts | Severity | Notes |
| --- | --- | --- | --- |
| `docs/content-audit/CONFLICTS.md` CF-03 | Website term 12 months (`OD-04 = B`); **current Word template 12 months** (verified 2026-08-31). Historical CTR-2026 wording was 18 months | closed for template-vs-website term | Live CS-Cart 18 months still `LEGACY PUBLIC DIVERGENCE` |
| `docs/content-audit/OWNER_DECISIONS.md` / `OD04_WARRANTY_VERIFICATION.md` | `LEGACY_18_MONTHS = NOT NEW-SITE SOT` | P2 docs | Do not flip OD-04 to 18. Template term now matches |
| `docs/content-audit/OD04_WARRANTY_VERIFICATION.md` start section | Public start wording **verified** in `warranty-public-policy.md` (2026-09-01); `/warranty` still unimplemented | P2 | Spec ≠ storefront ship |
| Canonical `apps/storefront/src/lib/woodright-copy.ts` and `apps/storefront/src/lib/legal/legal-content.ts` | Buyer-facing «Гарантия Woodright - 12 месяцев»; no start / seller / exclusions | term aligned; spec 2026-09-01 has start/obligor/exclusions | Next implementation cycle; **do not** change 12 → 18 |
| Live `https://woodright.ru/oferta/` | Public 18-month warranty + bank block | P0 live (legacy) | Already `LEGACY PUBLIC DIVERGENCE`; not this repo’s storefront |
| Live `https://woodright.ru/dostavka-i-sborka/` | Fixed ₽/% tariffs | P0 live | Conflicts with `OD-02` |
| Live `https://woodright.ru/vozvrat/` | 14 days + ООО «Демо Магазин» + PP 55 | P0 live | `LEGACY PUBLIC DEFECT` |
| Live `https://woodright.ru/oplata-i-dostavka/` | Card / QR / installment | P0 live | Conflicts with `OD-05` |
| Canonical checkout shipping `0` | Technical zero | P2 if copy ever says «бесплатно» | Already documented as non-commercial |
| Stale local worktrees (not canonical) | May contain «Гарантия Woodright - 12 месяцев» without the 18-month contract gate | P2 evidence only | Do not treat worktrees as SoT; do not copy into this repo as authority |
| `docs/content-audit/FACT_LEDGER.md` DEL-009 | Delivery geography `MISSING` for the new site | P2 | Contract allows RF carrier delivery as *possibility* only; still not a public tariff |

No second commercial SoT should be created. Point here instead of restating tariffs or warranty numbers in new docs.

---

## Change log

| Date | Change |
| --- | --- |
| 2026-08-28 | Initial persist of 2026 client-contract facts + current owner decisions + publication matrix. No buyer-facing code changed. |
| 2026-08-28 | Promoted onto fresh `origin/main`. OD-06 text aligned to current registry (`OD-06A` / `OD-06B`); pointers added to tracked content-audit/owner docs. |
| 2026-08-30 | Warranty 12/18: added controlled Word amendment (`docs/owner/contract-template-reconciliation.md`). Gate stays open until the external template is edited. Postal index still `POSTAL_INDEX_RECONCILIATION_REQUIRED`. No buyer-facing code. |
| 2026-08-31 | External Word template warranty term verified `18 → 12` months (start-from-transfer unchanged). Template vs website term **aligned**. Historical 18-month wording retained. Postal/returns/claims gates unchanged at that pass. No buyer-facing code. |
| 2026-08-31 | External Word template seller postal index verified `153000 → 153025` (warranty 12 months unchanged). Owner card / seller source / current template **aligned**. Historical `153000` retained. Returns/claims/`/warranty` copy gates unchanged. No buyer-facing code. |
| 2026-09-01 | Returns SOP + warranty public-policy spec verified (no Word / storefront mutation). PP 55 classified `SUPERSEDED`. КС 7-П interim remote-return method recorded. Postal and warranty **term** unchanged. |
)
