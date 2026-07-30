# Owner legal decision packet - public launch (2026-07-30)

Purpose: collect the exact decisions/facts needed to move each of the 5
legal pages (`apps/storefront/src/lib/legal-content.ts`) from `draft` /
`missing_owner_input` to `approved`. This document does **not** contain any
answers - no legal facts (INN, OGRN, prices, PSP names, guarantees,
timelines) are invented anywhere in this repo, and none should be added here
either. It only lists the questions.

Once the owner answers these, update `LEGAL_PAGES` in
`apps/storefront/src/lib/legal-content.ts` with the real text and set
`status: "approved"` for the pages that are complete - `assertLegalApprovedForPublicIndexable()`
gates `public_indexable` readiness on all 5 being approved.

## Privacy (`/privacy`)

- What is the legal entity operating Woodright (full name, INN, OGRN,
  registered address)? None of this is currently confirmed anywhere in the
  repo.
- Who is the data controller / DPO contact for personal-data questions, if
  different from the general showroom contact
  (`apps/storefront/src/lib/showroom-contacts.ts`)?
- What personal data categories are actually collected (name, phone, email,
  delivery address - confirmed via checkout form fields) vs. anything
  additional (analytics, marketing consent, cookies) that needs disclosure?
- Retention period for order/contact data?
- Any third-party processors (CRM, analytics, hosting) that need to be named?
- Consent mechanism for marketing communications, if any exist today.

## Terms / условия покупки (`/terms`)

- What is the exact offer/contract structure - is this a public offer
  (публичная оферта) under Russian law, and if so what is its effective
  text?
- Order confirmation mechanics beyond what's already confirmed in
  `checkoutCopy` (`apps/storefront/src/lib/woodright-copy.ts`): is there a
  formal acceptance moment, cancellation window, or price-lock rule?
- Any minimum order value, regional exclusions, or B2B vs. B2C distinctions?

## Delivery (`/delivery`)

- Which regions/cities are actually served, and are there different
  delivery mechanics for Moscow/MO vs. other regions?
- Delivery cost structure (free threshold, flat fee, distance-based) - none
  of this is confirmed anywhere in the repo today.
- Typical delivery/production timelines - do NOT invent a number; this must
  come from the owner.
- Assembly service: included, optional, or separately priced?
- Carrier/logistics partner name(s), if any should be disclosed publicly.

## Payment (`/payment`)

- Confirmed today: no online card payment on-site; the manager sends a
  payment link after order confirmation
  (`checkoutCopy.paymentClarity` in `apps/storefront/src/lib/woodright-copy.ts`;
  `pp_system_default` in `apps/storefront/src/lib/api/checkout.ts` is
  checkout plumbing, not a PSP).
- What PSP/invoicing mechanism actually generates that payment link today
  (bank invoice, specific PSP name, marketplace-style link)? Needed before
  this page can say anything more specific than "менеджер пришлёт ссылку на
  оплату".
- Are there payment options beyond the single link flow (installment,
  corporate invoice/NDS, cash on delivery)?
- Refund mechanics if an order is cancelled before production starts vs.
  after?

## Returns (`/returns`)

- Return/exchange window (calendar days) - do NOT invent a number.
- Condition requirements for a valid return (unused, original packaging,
  custom/bespoke exclusions)?
- Is custom/bespoke furniture (по проекту) return-eligible at all, or
  excluded by nature of the product?
- Refund timeline and mechanism (same channel as payment, bank transfer,
  etc.)?
- Who covers return shipping cost?

## How to close this packet

1. Owner answers the questions above (outside this repo, e.g. in a call or a
   separate doc - this file stays question-only).
2. Update the relevant `sections` in
   `apps/storefront/src/lib/legal-content.ts` with the real text, keeping the
   existing provenance-comment convention.
3. Flip `status` to `"approved"` only for pages that are fully confirmed -
   partial answers keep a page at `"draft"`.
4. Re-run `apps/storefront/src/lib/legal-content.fidelity.test.ts` (it will
   need updating once any page carries real text) and
   `scripts/release/check-public-launch-readiness.cjs` with a fresh
   `--legal-manifest`.
