# Owner review - public_production payment and notification decisions

Document status: **owner decision required**  
Not legal approval. Not deploy authorization. Not OWNER PASS.

Related:

- Legal Draft PR `#162` remains Draft (missing entity / INN / OGRN / legal address)
- Monitor/backup contracts merged (`5af1e39…`) - runtime provision still pending
- Active public_demo remains `22cbd68…` (unchanged)

---

## A - Current technical behavior

### Checkout / payment (factual)

1. Storefront `/checkout` updates cart, attaches shipping, creates Medusa payment collection.
2. Payment session provider is hard-coded **`pp_system_default`** (Medusa system / no-op PSP).
3. `POST /store/carts/:id/complete` creates a real Medusa order **without external PSP charge**.
4. Woodright process starts at stage **`new`**.
5. Buyer success copy states order is sent for manager confirmation; does **not** claim online payment completed.
6. Product env mode: `WOODRIGHT_PAYMENT_MODE=manual_invoice`.
7. Backend launch mode default: `manager_payment_link` (PaymentLink is admin manual overlay).
8. PaymentLink `paid` is an operator status - not proof of PSP settlement.
9. Risk: Medusa Admin capture on system provider can mark framework captured without real money.
10. Launch profile: `WOODRIGHT_PAYMENT_DECISION_STATUS=pending` - public production launch blocked.

### Notifications (factual)

1. `WOODRIGHT_NOTIFICATIONS` default **`fake`**: in-memory outbox + DB delivery rows; **no SMTP send**.
2. Triggers: `order.placed` (customer fake channels); admin stage transition with «Уведомить клиента».
3. **No** automatic sales/admin new-order email.
4. **No** Woodright password-reset / account-verification mail path.
5. Lead / bespoke / contact: persist only - no outbound notify.
6. Profile: `WOODRIGHT_NOTIFICATION_MODE=unset`, `WOODRIGHT_NOTIFICATION_DECISION_STATUS=pending`.
7. Fake outbox is **not** a production notification provider.

---

## B - Payment decision

### Option A - Manual invoice

Token:

`MANUAL_INVOICE_ACCEPTED_FOR_LAUNCH`

Means:

- launch may proceed **only after** this token + filled sales SOP + other gates (legal, monitor, DNS, images…)
- checkout remains unpaid / manager-confirmed
- buyer must not be told online payment is available
- sales owns queue polling and invoice delivery outside the site

Blockers if chosen without SOP/authorization: validator fails.

### Option B - Online payment required

Token:

`ONLINE_PAYMENT_REQUIRED_BEFORE_LAUNCH`

Means:

- **launch blocked** until separate PSP readiness cycle (merchant agreement, webhooks, reconciliation, security, buyer smoke, owner acceptance)
- this cycle does **not** select a PSP

### Recommendation for owner discussion

If Woodright continues manager-assisted sales for public launch, Option A matches current code.  
If card/online checkout is required before public launch, choose Option B and accept delay.

---

## C - Notification decision

### Option A - Provider required

Token:

`SMTP_OR_NOTIFICATION_PROVIDER_REQUIRED_BEFORE_LAUNCH`

Means launch blocked until provider readiness (sender domain, templates, retry, credentials, test delivery, owner acceptance).  
No provider is implemented in this PR.

### Option B - Temporary manual monitoring

Token:

`TEMPORARY_MANUAL_ORDER_MONITORING_ACCEPTED_FOR_LAUNCH`

Means:

- no automatic buyer/sales email
- measurable polling SOP required (roles, cadence, max response minutes, expiry)
- workaround **must** expire; follow-up provider cycle mandatory

Without expiry + polling SOP: **invalid**.

---

## D - Manual sales SOP checklist

Templates:

- `docs/operator/public-production-manual-invoice-sales-sop.md`
- `docs/operator/public-production-manual-notification-sop.md`

Owner must fill blanks before treating Option A payment or Option B notification as operable.

Proposed buyer disclosure (not wired):

- `docs/operator/buyer-disclosure-manual-invoice-proposed.md`

---

## E - Required owner response

Choose **exactly one** payment token and **exactly one** notification token.

### Combination 1

`MANUAL_INVOICE_ACCEPTED_FOR_LAUNCH`  
`SMTP_OR_NOTIFICATION_PROVIDER_REQUIRED_BEFORE_LAUNCH`

### Combination 2

`MANUAL_INVOICE_ACCEPTED_FOR_LAUNCH`  
`TEMPORARY_MANUAL_ORDER_MONITORING_ACCEPTED_FOR_LAUNCH`

### Combination 3

`ONLINE_PAYMENT_REQUIRED_BEFORE_LAUNCH`  
+ either notification token

Silence is **not** approval.

After tokens: new cycle writes authorization IDs into approved fixtures, re-runs tests/Codex, then Ready/merge of decision contracts. Legal `#162` stays separate.
