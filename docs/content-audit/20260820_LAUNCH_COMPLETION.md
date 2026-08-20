# Woodright content + legal launch completion (2026-08-20)

**Worktree:** `/Users/leonidmbp/Developer/woodright-content-legal-launch-20260820`
**Branch:** `content/legal-launch-completion-20260820`
**Base:** `origin/main` @ `4533c5334b75eab8e353b69c14d894fed0d423ae`
**Mode:** autonomous cycle. Research is a tool, not the product.

This file is the **active** SoT for remaining OD closures and launch IA. Historical packs stay provenance. Do not rewrite 2026-08-12 research as if it already contained these closures.

```text
OWNER_LEGAL_CONTENT_APPROVED = NOT ISSUED
READY_FOR_OWNER_LEGAL_ACCEPTANCE = TARGET OF THIS CYCLE
FINAL_OWNER_GATE = NONE (see §9)
```

---

## 1. Owner authority used as-is (do not reopen)

| OD | Status | Token |
| --- | --- | --- |
| OD-01 = A | Seller ООО «Роэл-Техник» | `OWNER_CONFIRM_WOODRIGHT_SELLER_ROEL_TECHNIK` |
| OD-02 = B | Delivery quote-only | `OWNER_DECISION_OD02_B_DELIVERY_QUOTE_ONLY` |
| OD-03 = B | Manager-assisted returns + legal baseline | `OWNER_DECISION_OD03_B_MANAGER_ASSISTED_RETURNS_WITH_LEGAL_BASELINE` |
| OD-04 = B | Commercial warranty **12 months**, owner-set 2026-08-19 | `OWNER_DECISION_OD04_B_WARRANTY_12_MONTHS_OWNER_SET` |
| OD-05 = A | PaymentLink / invoice after manager | `OWNER_DECISION_OD05_A_MANUAL_INVOICE_PAYMENT_LINK` |
| OD-10 = B | Bank details not public | `OWNER_DECISION_OD10_B_BANK_DETAILS_NOT_PUBLIC` |

Bespoke product model unchanged:

```text
WOODRIGHT_BESPOKE = NEW NAME + PREMIUM RETHINK OF «По проекту»
SAME_BUSINESS_ENTITY = YES
BESPOKE_CART = NEVER
/bespoke/catalog = NOT DEFAULT IA
```

Standing conservative rule for this cycle: **unconfirmed promise is omitted, not invented.**

---

## 2. Remaining OD - autonomous closures (not fake owner decisions)

These are **not** `OWNER DECISION` tokens. Correct statuses only.

### OD-06A - offer acceptance

**Status:** `IMPLEMENTATION DECISION` + `LEGAL REVIEW`
**Token:** `OD06A_ORDER_SUBMIT_IS_REQUEST_NOT_ACCEPTANCE`

Evidence:

- Checkout CTA is «Отправить заказ»; success copy is «Заказ отправлен на подтверждение».
- OD-05 journey: submit → manager review → PaymentLink / invoice → pay off-site.
- No checkout checkbox «принимаю оферту».
- No evidence that submit currently forms a paid contract.

Safe launch model (matches the live journey; does **not** invent a civil-law acceptance moment):

```text
order submit on site = request for confirmation
order submit on site ≠ public-offer acceptance
exact contract / acceptance moment = LEGAL REVIEW
```

Public `/offer` must say honestly that sending an order is a request, that a manager confirms terms, and that payment happens later via PaymentLink / invoice. It must **not** declare that payment (or any other later step) is the settled legal акцепт.

Formal qualification of the exact civil-law acceptance moment remains `LEGAL REVIEW`. This is **not** an owner business choice between inventing A/B/C overnight.

### OD-06B - claims SLA

**Status:** `NO ADDITIONAL COMMERCIAL PROMISE`
**Token:** `OD06B_NO_EXTRA_COMMERCIAL_SLA`

No current internal SLA found. Legacy 30 / 45 days are `STALE`. Do not publish 3 / 10 / 30 / 45 days as a Woodright service SLA.

Buyer copy: contact Woodright; the case is reviewed under applicable law. No voluntary response-time promise.

### OD-06 combined

**Status:** `NOT OWNER-OPEN FOR LAUNCH BLOCKING`
Split, not a mixed owner question. Full legal pack still needs `OWNER_LEGAL_CONTENT_APPROVED` (owner token, not this cycle).

### OD-07 - showroom hours / emails

**Status:** `LAUNCH WITHOUT UNCONFIRMED HOURS OR EMAIL`
**Token:** `OD07_CONTACTS_PHONES_MESSENGERS_NO_UNCONFIRMED_HOURS_EMAIL`

Confirmed: Khimki showroom, phones, TG/WA/MAX, Yandex Maps venue card.
Not confirmed as new-site SoT: mall hours 10-21; `woodright.t@yandex.ru`; `order@woodright.com`; privacy email.

`/contacts` ships without hours and without public email. Visit copy may say to call or write before coming. That is omission, not a new appointment-only policy.

Pickup from showroom remains `PARTIAL` / not promised as a service (DEL-001).

### OD-08 - on-site services

**Status:** `NO UNSUPPORTED ON-SITE SERVICE PROMISE`
**Token:** `OD08_DO_NOT_PROMISE_MEASUREMENT_INSTALL_TURNKEY`

Do not publish as current services: замер; монтаж панелей; универсальная сборка; «под ключ»; интерьерный дизайн as a service; реставрация; золочение; бронза.

Wall panels stay a **capability mention** (footer / designers / Bespoke), not a fake service page. No invented tariffs, visit, or install tech.

Checkout/cart must not promise «сборка» as a confirmed service.

### OD-09 - designers

**Status:** `SOFT PROFESSIONAL COOPERATION / NO PUBLIC TRADE TERMS`
**Token:** `OD09_SOFT_COOPERATION_NO_PUBLIC_TRADE_PROGRAMME`

Keep: work with designers and architects; non-standard / individual tasks; furniture by project; special sizes/configurations via Bespoke; wall panels as a direction; conditions discussed individually.

Remove fabricated public trade pack: fixed discount, commission, cashback, priority SLA, free samples, free delivery, reserved stock, guaranteed dedicated account manager, «специальные условия и вознаграждение» as a published benefit.

`/designers/terms` already redirects to `/designers`. Do not title a page «Условия сотрудничества» without terms.

### OD-11 - IA

**Status:** `INFORMATION ARCHITECTURE DECISION`
**Token:** `OD11_NO_GENERIC_SERVICES_HUB`

No `/services`. Delivery owns delivery. Bespoke owns project work. Designers owns professional cooperation. Panels do not get a standalone service route.

### OD-12 - legacy care / assembly pages

**Status:** `DEFERRED / NOT LAUNCH-CRITICAL`
**Token:** `OD12_DO_NOT_REVIVE_WEAK_LEGACY_CARE_PAGES`

Do not recreate CS-Cart «правила эксплуатации» / assembly instruction pages without current fact.

---

## 3. Launch IA (buyers)

```text
Покупателям
  /contacts
  /delivery
  /payment
  /returns
  /warranty

Юридические
  /offer
  /privacy
  /personal-data
  /cookies
  /terms
  /requisites

Проект
  /bespoke
  /bespoke/request
  /designers

Бренд
  /about
  /about/production
  /about/materials
```

`/bespoke/catalog` may remain as a historical route. It is **not** nav, footer, sitemap target, or CTA. Nav compact label: **Bespoke**. Page H1 / landing: **Woodright Bespoke**.

No `/services`. No panels service page.

---

## 4. Content ownership

| Fact | Primary | Elsewhere |
| --- | --- | --- |
| Payment | `/payment` | checkout short note; `/offer` legal summary |
| Delivery | `/delivery` | checkout «согласуется менеджером» |
| Returns | `/returns` | `/offer` legal summary |
| Warranty 12 months | `/warranty` | `/returns` cross-link; `/offer` summary |
| Seller identity | `/requisites` | `/offer` `/privacy` reuse fields |
| Contacts | `/contacts` | CTA / phones on other pages |
| Cookies `cart_id` | `/cookies` | `/privacy` short mention |
| Bespoke | `/bespoke` | designers cross-link, not a duplicate |
| Designers | `/designers` | Bespoke cross-link |

---

## 5. Privacy / 152-FZ

Privacy **email** remains `MISSING`. Do not invent. Do not reuse legacy public emails.

Launch contact channels for PD subjects:

- operator identity = ООО «Роэл-Техник» (OD-01)
- legal / postal address (OD-01)
- confirmed showroom phones and messengers (CON-001…004)

152-FZ requires the operator to identify itself and to provide a policy. It does **not** uniquely require a dedicated email field if a postal address and telephone are published. Status: `EXTERNAL VERIFICATION` of that reading; email remains a desirable ops field, **not** a hard launch blocker for this cycle.

`FINAL_OWNER_GATE` does **not** include privacy email as a blocking item.

Cookies (re-verified 2026-08-20 on this branch): first-party `cart_id` only. No Google Analytics, Yandex Metrica, Meta Pixel, or advertising cookies in storefront code.

---

## 6. Legal review remaining (not owner micro-questions)

Keep marked `LEGAL REVIEW` / not production legal approval:

- exact civil-law acceptance moment wording in a court sense
- ZoZPP 26.1 / KS RF 17.02.2026 № 7-П application to specific Woodright deals
- warranty start / obligor / component exclusions
- reverse logistics and refund SOP
- `OWNER_LEGAL_CONTENT_APPROVED`

Safe launch copy does not convert these into fake numbers or blanket Bespoke no-return.

---

## 7. Forbidden leakage (implementation must hold)

- Demo Magazin / `sales@demostore.ru`
- public bank / BIK / account
- warranty `18 месяцев` as current term
- legacy delivery ₽ / %
- checkout `0 ₽` as free delivery
- card / QR / installment as current payment
- `14 дней` as Woodright return policy
- «под ключ» / «проекты любой сложности» as current offer
- `/bespoke/catalog` as recommended journey

---

## 8. Nav label

Presentation only: compact chrome **Bespoke**; landing **Woodright Bespoke**. Not a new owner gate.

---

## 9. FINAL_OWNER_GATE

`OWNER_LEGAL_CONTENT_APPROVED` is a later owner token, not an OD-06…12 quiz. Storefront `isLegalLaunchComplete()` stays fail-closed until that token / the remaining legal-review field is actually supplied. Buyer pages can still show honest production copy.

```text
FINAL_OWNER_GATE = NONE
```

Optional later (not blocking; not asked tonight): official privacy email; mall hours; trade programme; measurement/install if those services actually exist.

Owner still must later issue or refuse `OWNER_LEGAL_CONTENT_APPROVED`. That is legal-pack acceptance, not an OD-06…12 quiz.

---

## 10. Codex reviews (this cycle)

| Review | Scope | Final P0 | Final P1 |
| --- | --- | --- | --- |
| #1 SoT | Owner/content SoT consistency | 0 | 0 |
| #2 remaining OD | Combined with #1 rerun | 0 | 0 |
| #3 copy/legal | Buyer copy + legal consistency | 0 | 0 |
| #4 implementation | Storefront diff | 0 | 0 |
| #5 preview/UX | Preview gate + a11y/copy | 0 | 0 (after 3 P1 fixes) |
| #6 commit gate | Staged diff | 0 | 0 (`safe_to_commit`) |
| Final PR | After push | pending |

P1 closed before commit: nested `<main>`; Bespoke `/privacy` link; requisites bank wording not tied to PaymentLink. Bank numbers redacted from public git docs.
