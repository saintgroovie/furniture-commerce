# Owner decisions — compact board

Goal: few strong decisions, not 80 micro-questions.
Identity packet: `docs/owner/legal-content-owner-review.md`
Commercial/service website facts, publication status, contract provenance, and owner-decision constraints: `docs/content-audit/SITE_COMMERCIAL_SERVICE_SOT.md`. This board stays the OD index; it is not the full contract-derived publication SoT.
Future customer-contract warranty wording (12 months, start from transfer): `docs/owner/contract-template-reconciliation.md`. External Word source verified **12 months** 2026-08-31 (`OD-04 = B`). Not a new OD.

Silence ≠ approval of the **full** legal pack.

### Recorded (2026-08-15 / 2026-08-17 / 2026-08-19)

```text
OD-01 = A — seller ООО «Роэл-Техник»
OD-02 = B — OWNER CONFIRMED — delivery quote-only
OD-03 = B — OWNER CONFIRMED — manager-assisted returns with explicit legal baseline
OD-04 = B — OWNER CONFIRMED — commercial warranty 12 months (owner-set)
OD-05 = A — OWNER CONFIRMED — manual PaymentLink / invoice after manager confirmation
OD-10 = B — bank details not public

OWNER_CONFIRM_WOODRIGHT_SELLER_ROEL_TECHNIK
OWNER_DECISION_OD01_A_CONFIRMED
OWNER_DECISION_OD02_B_DELIVERY_QUOTE_ONLY
OWNER_DECISION_OD03_B_MANAGER_ASSISTED_RETURNS_WITH_LEGAL_BASELINE
OWNER_DECISION_OD04_B_WARRANTY_12_MONTHS_OWNER_SET
OWNER_DECISION_OD05_A_MANUAL_INVOICE_PAYMENT_LINK
OWNER_DECISION_OD10_B_BANK_DETAILS_NOT_PUBLIC
WOODRIGHT_OD01_SELLER_CONFIRMED_OD10_BANK_DETAILS_PRIVATE
WOODRIGHT_OD05_PAYMENTLINK_INVOICE_OWNER_RATIFIED
WOODRIGHT_OD02_DELIVERY_QUOTE_ONLY_OWNER_RATIFIED
WOODRIGHT_OD03_MANAGER_ASSISTED_RETURNS_OWNER_RATIFIED
WOODRIGHT_OD04_WARRANTY_12_MONTHS_OWNER_RATIFIED
```

```text
PAYMENT_ON_CHECKOUT = NO
PAYMENT_AFTER_MANAGER_CONFIRMATION = YES
MANUAL_PAYMENT_LINK = YES
INVOICE = YES
ONLINE_ACQUIRING_PUBLIC_PROMISE = NO
QR_PUBLIC_PROMISE = NO
INSTALLMENT_PUBLIC_PROMISE = NO
PUBLIC_BANK_DETAILS = NO

DELIVERY_MODEL = QUOTE_ONLY
PUBLIC_DELIVERY_TARIFF = NO
PUBLIC_FIXED_DELIVERY_TARIFF = NO
CHECKOUT_DELIVERY_PRICE_IS_NOT_COMMERCIAL_SOT = YES
CHECKOUT_SHIPPING_ZERO = TECHNICAL / NON-COMMERCIAL
DELIVERY_TERMS_CONFIRMED_BY_MANAGER = YES
DELIVERY_TERMS_CONFIRMED_BEFORE_PAYMENT = YES
LEGACY_DELIVERY_TARIFFS = NOT NEW-SITE SOT

RETURNS_LAUNCH_MODEL = MANAGER_ASSISTED
MANDATORY_CONSUMER_RIGHTS = PRESERVED
WOODRIGHT_CUSTOM_RETURN_SOP = NOT YET APPROVED
LEGACY_14_DAYS = NOT NEW-SITE SOT
DEMO_MAGAZIN_RETURN_COPY = INVALID
BESPOKE_LABEL_AUTOMATIC_NO_RETURN = NO
PRODUCT_CLASSIFICATION_AUTOMATIC_LEGAL_CLASSIFICATION = NO

COMMERCIAL_WARRANTY_TERM = 12 MONTHS
PUBLIC_COMMERCIAL_WARRANTY_TERM = 12 MONTHS
WARRANTY_TERM_SOURCE = CURRENT OWNER DECISION
LEGACY_18_MONTHS = NOT NEW-SITE SOT
LEGACY_GENERIC_12_MONTHS = NOT SOURCE OF CURRENT DECISION
PRODUCT_LABEL_AUTOMATIC_WARRANTY_TERM = NO
```

**Autonomous closures 2026-08-20** (not owner tokens; pack: `20260820_LAUNCH_COMPLETION.md`):

```text
OD-06A = IMPLEMENTATION DECISION + LEGAL REVIEW
         OD06A_ORDER_SUBMIT_IS_REQUEST_NOT_ACCEPTANCE
OD-06B = NO ADDITIONAL COMMERCIAL PROMISE
         OD06B_NO_EXTRA_COMMERCIAL_SLA
OD-07  = LAUNCH WITHOUT UNCONFIRMED HOURS OR EMAIL
         OD07_CONTACTS_PHONES_MESSENGERS_NO_UNCONFIRMED_HOURS_EMAIL
OD-08  = NO UNSUPPORTED ON-SITE SERVICE PROMISE
         OD08_DO_NOT_PROMISE_MEASUREMENT_INSTALL_TURNKEY
OD-09  = SOFT PROFESSIONAL COOPERATION / NO PUBLIC TRADE TERMS
         OD09_SOFT_COOPERATION_NO_PUBLIC_TRADE_PROGRAMME
OD-11  = INFORMATION ARCHITECTURE DECISION
         OD11_NO_GENERIC_SERVICES_HUB
OD-12  = DEFERRED / NOT LAUNCH-CRITICAL
         OD12_DO_NOT_REVIVE_WEAK_LEGACY_CARE_PAGES
FINAL_OWNER_GATE = NONE
OWNER_LEGAL_CONTENT_APPROVED = NOT ISSUED
```

These are **not** remaining owner-open launch blockers. Unconfirmed geography / lift / assembly / hours / email / trade pack / component warranty are **omitted**, not invented.

Delivery **subfacts** still unpublished: geography, lift, assembly, fleet, dates, pickup.
Returns **subfacts** still `LEGAL REVIEW`: reverse logistics SOP; refund SOP; claims email; product-to-legal mapping. Claims SLA is **not** a public Woodright promise (`OD-06B`).
Warranty **subfacts** still `LEGAL REVIEW`: start wording; obligor; component scope; exclusions; claims SOP. Term 12 months is closed (`OD-04 = B`).
**Not recorded:** `OWNER_LEGAL_CONTENT_APPROVED`. Full legal pack still `owner_review` / `READY_FOR_OWNER_LEGAL_ACCEPTANCE` after implementation.

`OD-03` ratifies launch communication/process model; it does **not** constitute legal approval of all return clauses.

**Product-model clarification (2026-08-17, not a new OD number):**

```text
WOODRIGHT_BESPOKE = NEW NAME + PREMIUM RETHINK OF «По проекту»
SAME_BUSINESS_ENTITY = YES
/bespoke/catalog = NOT DEFAULT IA
BESPOKE_CART = NEVER
```

SoT: `docs/content-audit/BESPOKE_POSITIONING.md`. Short nav label may stay open; it is **not** a question of two different directions. `OD-08` / `OD-09` unchanged.

---

## P0 — blocks correct public information

### OD-01 — Seller identity for new site

**Status:** **A / owner confirmed** (2026-08-15). Seller identity closed. Privacy email / PD operator copy **not** closed by this decision.

**Tokens:** `OWNER_CONFIRM_WOODRIGHT_SELLER_ROEL_TECHNIK` · `OWNER_DECISION_OD01_A_CONFIRMED`

**Confirmed seller** (`FACT — CURRENT OWNER CONFIRMED`; provenance: owner-provided company card):

```text
Общество с ограниченной ответственностью «Роэл-Техник»
ООО «Роэл-Техник»
ОГРН: 1153702012848
ИНН: 3702111074
КПП: 370201001
Юридический адрес: 153025, г. Иваново, ул. Дзержинского, д. 39, оф. 514
Фактический адрес: тот же
```

Also on the card (not showroom SoT; not a privacy email): phone `8 (4932) 35-99-47`; OKATO `24401367000`; OKPO `14954699`.

**Still unresolved under this OD (do not invent):**

```text
PRIVACY CONTACT: STILL MISSING
PD OPERATOR COPY: STILL REQUIRES CONTENT/LEGAL COMPLETION
FULL LEGAL PACK: NOT YET APPROVED
```

Do not use legacy public emails (`woodright.t@yandex.ru`, `order@woodright.com`) as privacy contact.

**Prior evidence (provenance only):** live `/oferta/` + LEG-SQL + external registries already named this entity; 2026-08-04 packet still said MISSING. Owner card now supersedes «MISSING» for seller identity.

---

### OD-02 — Delivery + lift + assembly commercial model

**Status:** **B / OWNER CONFIRMED** (2026-08-17). Delivery **pricing model** closed. Geography / lift / assembly / pickup **not** closed by this decision.

**Token:** `OWNER_DECISION_OD02_B_DELIVERY_QUOTE_ONLY`
**Status token:** `WOODRIGHT_OD02_DELIVERY_QUOTE_ONLY_OWNER_RATIFIED`
**Evidence pack:** `docs/content-audit/OD02_DELIVERY_SERVICES_VERIFICATION.md`

**Confirmed** (`FACT — CURRENT OWNER CONFIRMED`):

```text
DELIVERY_MODEL = QUOTE_ONLY
PUBLIC_DELIVERY_TARIFF = NO
PUBLIC_FIXED_DELIVERY_TARIFF = NO
CHECKOUT_DELIVERY_PRICE_IS_NOT_COMMERCIAL_SOT = YES
CHECKOUT_SHIPPING_ZERO = TECHNICAL / NON-COMMERCIAL
DELIVERY_TERMS_CONFIRMED_BY_MANAGER = YES
DELIVERY_TERMS_CONFIRMED_BEFORE_PAYMENT = YES
LEGACY_DELIVERY_TARIFFS = NOT NEW-SITE SOT
```

Canonical journey (aligned with `OD-05 = A`; **not** offer acceptance / `OD-06`):

```text
Order submit
→ manager reviews order
→ manager agrees delivery conditions and final commercial details
→ PaymentLink or invoice
→ customer pays
```

Buyer-facing COPY sense (SoT only; **not** shipped in this task):

> Стоимость и условия доставки зависят от адреса и состава заказа. После оформления менеджер проверит детали и согласует условия до оплаты.

`/delivery` = **READY_FOR_COPY_PHASE_WITH_SERVICE_GAPS**

Checkout `0 ₽` is **not** free delivery, not a commercial tariff.

**Legacy numbers (historical only; not a launch default):** `2000 ₽`; `1000 ₽ + 50 ₽/км`; assembly `3%`; delivery `1%`; lift `0,7%` / `0,5%` / `1,5%`. Status: `LEGACY DIVERGENCE` / `REJECT AS NEW-SITE SOT`.

**Not confirmed by OD-02 = B (do not invent):** geography (RF / Moscow / MKAD / МО / cities); own fleet / contractor / ТК; dates or time windows; free delivery; lift; assembly; installation / panels / Bespoke install (`OD-08`); pickup (`PARTIAL` - depends on `OD-07`).

---

### OD-03 — Returns policy (incl. bespoke exclusions)

**Status:** **B / OWNER CONFIRMED** (2026-08-19). Launch **communication/process model** closed. Full return legal pack **not** closed by this decision.

**Token:** `OWNER_DECISION_OD03_B_MANAGER_ASSISTED_RETURNS_WITH_LEGAL_BASELINE`
**Status token:** `WOODRIGHT_OD03_MANAGER_ASSISTED_RETURNS_OWNER_RATIFIED`
**Evidence pack:** `docs/content-audit/OD03_RETURNS_VERIFICATION.md`

**Confirmed** (`FACT — CURRENT OWNER CONFIRMED` - **business/communication model only**):

```text
OD-03 = B
RETURNS_LAUNCH_MODEL = MANAGER_ASSISTED
MANDATORY_CONSUMER_RIGHTS = PRESERVED
WOODRIGHT_CUSTOM_RETURN_SOP = NOT YET APPROVED
LEGACY_14_DAYS = NOT NEW-SITE SOT
LEGACY_14_DAYS = NOT OWNER-RATIFIED RETURN WINDOW
DEMO_MAGAZIN_RETURN_COPY = INVALID
BESPOKE_LABEL_AUTOMATIC_NO_RETURN = NO
CONFIGURABLE_LABEL_AUTOMATIC_INDIVIDUALLY_DEFINED = NO
PRODUCT_CLASSIFICATION_AUTOMATIC_LEGAL_CLASSIFICATION = NO
REVERSE_LOGISTICS_SOP = MISSING
WOODRIGHT_REFUND_OPERATIONAL_SOP = MISSING
AUTOMATED_REFUND = NO EVIDENCE
CLAIMS_SLA = MISSING / OD-06
```

Canonical launch journey (aligned with `OD-05 = A`):

```text
applicable legal rights preserved
→ customer contacts Woodright (showroom phones / messengers)
→ manager identifies order / case
→ applicable process determined by circumstances and legal baseline
→ no unsupported legacy/custom restrictions
```

Buyer-facing COPY sense (SoT only; **not** shipped):

> Если вы хотите отказаться от заказа, вернуть товар или сообщить о проблеме, свяжитесь с Woodright. Менеджер уточнит номер заказа и обстоятельства и подскажет дальнейшие действия. Условия возврата зависят от ситуации и применимых требований закона.

`/returns` = **READY_FOR_COPY_PHASE_WITH_LEGAL_REVIEW**. Not `READY_FOR_PRODUCTION`.

**Legal facts stay `EXTERNAL VERIFICATION`:** ЗоЗПП ст. 26.1 / 18–24; KS РФ 17.02.2026 № 7-П; ПП 2463 (дистанционка). This ratification does **not** mean `OWNER CONFIRMED: 7 days` or `OWNER CONFIRMED: 10 days`.

**Not confirmed by OD-03 = B (do not invent):** reverse logistics arranger/payer as a Woodright SOP; automated refund; claims email; TG/WA as the *formal* claims channel without legal review; cancellation fee / non-refundable advance / production-start = impossible; blanket Bespoke/CONFIGURABLE no-return; warranty **start/obligor/exclusions** (term closed separately as `OD-04 = B` = 12 months); claims SLA (`OD-06`).

**Invalid as new-site SoT (historical evidence kept):** live `/vozvrat/` 14 days + ООО «Демо Магазин» + `sales@demostore.ru` = `LEGACY PUBLIC DEFECT`. Demo Magazin is **not** an unresolved identity question (`OD-01 = A` = ООО «Роэл-Техник»).

`BESPOKE LABEL != AUTOMATIC NO-RETURN RULE`. Woodright Bespoke and «По проекту» remain one entity - not two return policies. Cases 1–6 stay analysis in the evidence pack, not production policy.

---

### OD-04 — Warranty term/scope

**Status:** **B / OWNER CONFIRMED** (2026-08-19). Commercial **term** closed. Start / obligor / component scope / exclusions / claims SOP **not** closed by this decision.

**Token:** `OWNER_DECISION_OD04_B_WARRANTY_12_MONTHS_OWNER_SET`
**Status token:** `WOODRIGHT_OD04_WARRANTY_12_MONTHS_OWNER_RATIFIED`
**Evidence pack:** `docs/content-audit/OD04_WARRANTY_VERIFICATION.md`

```text
OD-04 = B
COMMERCIAL_WARRANTY_TERM = 12 MONTHS
PUBLIC_COMMERCIAL_WARRANTY_TERM = 12 MONTHS
WARRANTY_TERM_SOURCE = CURRENT OWNER DECISION
LEGACY_18_MONTHS = NOT NEW-SITE SOT
LEGACY_GENERIC_12_MONTHS = NOT SOURCE OF CURRENT DECISION
PRODUCT LABEL != AUTOMATIC WARRANTY TERM
STATUTORY_DEFECT_RIGHTS = PRESERVED
WARRANTY_START = LEGAL REVIEW / CONTENT COMPLETION
MANUFACTURER = NOT YET CONFIRMED
WARRANTY_OBLIGOR_LEGAL_WORDING = LEGAL REVIEW
```

**Confirmed** (`FACT — CURRENT OWNER CONFIRMED`; provenance: **explicit owner decision 2026-08-19**, not a legacy source):

Launch public commercial warranty term = **12 months**. Neutral buyer label: «Гарантия Woodright» until legal review of obligor.

This **B** is an owner-set business rule. It is **not** research Candidate B («found another current operational term»). Research 2026-08-19 found **no** current approved term (`NOT FOUND`) and recommended **C**. Owner then set 12 months as new launch policy.

**Not the source of this number:** CS-Cart generic theme 12 months; dump EN oferta/dogovor of ИП Елисеев; live `/oferta/` 18 months; old dogovor 18 months.

**Invalid as new-site SoT (historical evidence kept):** live `/oferta/` **18 months** = `REJECT AS NEW-SITE SOT` / `LEGACY PUBLIC DIVERGENCE` if CS-Cart still prints it. Generic dump **12 months** remains `STALE / GENERIC TEMPLATE`. Coincidence of the digit 12 does **not** promote that template.

**Not confirmed by OD-04 = B (do not invent):** start «с момента передачи»; manufacturer name; «гарантия производителя»; hardware / mechanisms / upholstery / finish / third-party / panels separate terms; assembly/DIY/humidity voids; natural-material blanket «не дефект»; talon; free master visit; claims email; claims SLA (`OD-06`). STANDARD / CONFIGURABLE / BESPOKE do **not** get different terms from the label.

`/warranty` = **READY_FOR_COPY_PHASE_WITH_LEGAL_REVIEW** (not production). Storefront not shipped in this task.

**2026-08-31 (pointer only, not a new OD):** the 2026 client Word template was updated and verified to **12 (Двенадцать) месяцев с момента передачи Товара**. Template vs website term aligned. Live CS-Cart 18 months remains legacy. Postal/returns/claims gates unchanged. Record: `docs/owner/contract-template-reconciliation.md`.

---

### OD-05 — Payment mode for launch

**Status:** **A — OWNER CONFIRMED** (2026-08-15).

**Token:** `OWNER_DECISION_OD05_A_MANUAL_INVOICE_PAYMENT_LINK`

**Decision:** Keep manual invoice / PaymentLink as sole public payment story at launch.

```text
OD-05 = A
PAYMENT_ON_CHECKOUT = NO
PAYMENT_AFTER_MANAGER_CONFIRMATION = YES
MANUAL_PAYMENT_LINK = YES
INVOICE = YES
ONLINE_ACQUIRING_PUBLIC_PROMISE = NO
QR_PUBLIC_PROMISE = NO
INSTALLMENT_PUBLIC_PROMISE = NO
PUBLIC_BANK_DETAILS = NO
```

**Canonical launch model** (`FACT — CURRENT OWNER CONFIRMED`):

> Покупатель оформляет заказ без немедленной оплаты на сайте. После проверки и согласования заказа менеджер отправляет ссылку на оплату или счёт.

**COPY (approved sense; not shipped to storefront in this task):**

> Оплачивать заказ сразу на сайте не нужно. После оформления менеджер проверит детали заказа и отправит ссылку на оплату или счёт.

`/payment` = **READY_FOR_COPY_PHASE** (payment facts). Route may still be missing in this tree; legal pack remains `owner_review` for offer/privacy - that does not block payment *copy*.

**Operational caveats (keep):** manager confirmation is a real process, not a coded payment gate; `PaymentLink.url` is operator-supplied; system does not auto-send the link; no payment webhook; `pp_system_default` is not buyer-facing acquiring; live CS-Cart card/QR/installment = `LEGACY DIVERGENCE` / `NOT NEW-SITE SOT`.

Does **not** close `OD-06` (offer acceptance). Invoice as a private payment document may include bank details; that does not change `OD-10 = B`.

---

### OD-06 — Offer acceptance moment + claim SLA

**Status 2026-08-20:** split. **Not** kept owner-open as a mixed P0.

See `docs/content-audit/20260820_LAUNCH_COMPLETION.md`.

**OD-06A** - `IMPLEMENTATION DECISION` + `LEGAL REVIEW`
`OD06A_ORDER_SUBMIT_IS_REQUEST_NOT_ACCEPTANCE`

Current checkout does **not** contain an «принимаю оферту» control. Success copy is request-for-confirmation. Launch `/offer` states: site submit = заявка на подтверждение, not public-offer acceptance. Exact civil-law acceptance moment remains `LEGAL REVIEW`. Do **not** publish payment=акцепт as a settled rule. This is **not** an `OWNER DECISION`.

**OD-06B** - `NO ADDITIONAL COMMERCIAL PROMISE`
`OD06B_NO_EXTRA_COMMERCIAL_SLA`

No current internal SLA. Do not publish 3 / 10 / 30 / 45 days. Buyer copy points to applicable law, not a Woodright service SLA.

**Historical note:** earlier board text said checkout already accepts the offer. That was stale relative to current `checkoutCopy` (2026-08-20 re-verify).

---

## P1 — shapes buyer journey

### OD-07 — Showroom visit model (hours vs appointment)

**Status 2026-08-20:** `LAUNCH WITHOUT UNCONFIRMED HOURS OR EMAIL`
**Token:** `OD07_CONTACTS_PHONES_MESSENGERS_NO_UNCONFIRMED_HOURS_EMAIL`

Confirmed: showroom Khimki / Гранд-2 / phones / TG / WA / MAX.
Not published: hours (live 10–21 is `SUSPECT`); public emails (legacy footer emails are not new-site SoT); privacy email (`MISSING`).

`/contacts` is not blocked. Visit copy may ask the buyer to call or write first. That is **not** a new appointment-only owner policy.

**Historical owner-choice list** (A/B/C hours) remains available if owner later wants to publish hours/email. It is not required to ship contacts.

---

### OD-08 — On-site services: measurement, panel install, «под ключ»

**Status 2026-08-20:** `NO UNSUPPORTED ON-SITE SERVICE PROMISE`
**Token:** `OD08_DO_NOT_PROMISE_MEASUREMENT_INSTALL_TURNKEY`

Absence of evidence = do not promise. Launch does **not** publish замер, монтаж панелей, универсальную сборку, «под ключ», интерьерный дизайн as a service, реставрацию, золочение, бронзу.

Panels remain a capability mention, not a fake service page. Historical Bespoke proof (20+ years, named projects) does **not** create a current install menu.

If owner later confirms a real service, that can be added. It is not required to ship Bespoke / delivery / designers.

**Historical owner checklist** kept as future ops input, not a launch gate.

---

### OD-09 — Designers programme depth

**Status 2026-08-20:** `SOFT PROFESSIONAL COOPERATION / NO PUBLIC TRADE TERMS`
**Token:** `OD09_SOFT_COOPERATION_NO_PUBLIC_TRADE_PROGRAMME`

This is the previously recommended Candidate A, applied as conservative launch (no new commercial pack). Not a fabricated trade programme. `/designers/terms` redirects to `/designers`. Do not use the heading «Условия сотрудничества» without terms.

Bespoke hub links here; it does not duplicate trade promises.

---

### OD-10 — Publish bank details on `/requisites`?

**Status:** **B / bank details not public** (2026-08-15).

**Token:** `OWNER_DECISION_OD10_B_BANK_DETAILS_NOT_PUBLIC`

```text
OD-10 = B
PUBLIC_BANK_DETAILS = NO
NEW_SITE_PUBLIC_BANK_DETAILS = NO
BANK_DETAILS_INTERNAL_CONFIRMED = YES
```

Internal bank details were confirmed from the owner company card (2026-08-15). Values are **not stored in this public repository**. Invoice documents may use them privately. Buyer-facing surfaces stay identity-only (`OD-10 = B`).

Do **not** publish on `/requisites`, footer, `/contacts`, `/payment`, public offer bank block, privacy, FAQ, metadata, structured data, or any other new-site public surface.

Absence on public `/requisites` is intentional, not a bug.

When `/requisites` is later implemented (legal pack still `owner_review` - not this task), allowed: seller name, OGRN, INN, KPP if needed, legal address. Forbidden: bank account / correspondent / BIK.

Live CS-Cart oferta bank block = **legacy divergence**, not new-site permission.

Invoice as a **private payment document** may include bank details. That does not authorize a public bank block (`OD-10 = B` unchanged).

---

## P2 — later

### OD-11 — IA: separate `/services` vs sections inside delivery/bespoke

**Status 2026-08-20:** `INFORMATION ARCHITECTURE DECISION`
**Token:** `OD11_NO_GENERIC_SERVICES_HUB`

No generic `/services`. `/delivery` owns delivery. `/bespoke` owns project work. `/designers` owns professional cooperation. No standalone panels service page.

### OD-12 — Revive «правила эксплуатации» / assembly instructions pages

**Status 2026-08-20:** `DEFERRED / NOT LAUNCH-CRITICAL`
**Token:** `OD12_DO_NOT_REVIVE_WEAK_LEGACY_CARE_PAGES`

Do not recreate weak CS-Cart care/assembly pages to fill the footer.

---

## Suggested owner response format (remaining)

```text
OD-01: A CONFIRMED (2026-08-15) - privacy email / PD copy still open
OD-02: B CONFIRMED (2026-08-17) OWNER_DECISION_OD02_B_DELIVERY_QUOTE_ONLY
OD-03: B CONFIRMED (2026-08-19) OWNER_DECISION_OD03_B_MANAGER_ASSISTED_RETURNS_WITH_LEGAL_BASELINE
OD-04: B CONFIRMED (2026-08-19) OWNER_DECISION_OD04_B_WARRANTY_12_MONTHS_OWNER_SET — 12 months owner-set; not legacy 12/18
OD-05: A CONFIRMED (2026-08-15) OWNER_DECISION_OD05_A_MANUAL_INVOICE_PAYMENT_LINK
OD-06A: IMPLEMENTATION + LEGAL REVIEW (submit = request, not acceptance)
OD-06B: NO EXTRA COMMERCIAL SLA
OD-07: LAUNCH WITHOUT UNCONFIRMED HOURS/EMAIL
OD-08: DO NOT PROMISE UNCONFIRMED ON-SITE SERVICES
OD-09: SOFT COOPERATION / NO PUBLIC TRADE TERMS
OD-10: B CONFIRMED (2026-08-15) PUBLIC_BANK_DETAILS = NO
OD-11: NO GENERIC /services
OD-12: DEFERRED, not launch-critical
FINAL_OWNER_GATE = NONE

LEGAL TOKEN (when ready; not issued):
OWNER_LEGAL_CONTENT_APPROVED | …_WITH_NOTES | …_REJECTED
```

Keep `owner_review` for the full legal pack. Do not treat live CS-Cart numbers as new-site SoT.
