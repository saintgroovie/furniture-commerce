# Legal content - owner review packet (canonical)

**Document status:** `owner_review`
**Full legal pack:** **NOT APPROVED**
**This file is not** `OWNER_LEGAL_CONTENT_APPROVED`.

Decision board SoT: `docs/content-audit/OWNER_DECISIONS.md`
Commercial/service website facts, publication status, contract provenance, and owner-decision constraints: `docs/content-audit/SITE_COMMERCIAL_SERVICE_SOT.md`.
Controlled 2026 Word-template warranty term (`OD-04 = B`, 12 months, start from transfer) and seller postal index (`153025`): `docs/owner/contract-template-reconciliation.md`. External `.docx` verified 12 months and 153025 on 2026-08-31. Returns SOP / warranty spec 2026-09-01: `docs/owner/returns-sop.md`, `docs/owner/warranty-public-policy.md`. Not legal approval of the full pack. Binary not in git.
Historical 2026-08-04 packet (remediation worktree only): identity was still `MISSING` there; seller identity is now recorded **here** (canonical).

---

## Recorded tokens (2026-08-15 / 2026-08-17 / 2026-08-19, Europe/Moscow)

```text
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

Do **not** treat OD-03/OD-04 ratification as `OWNER_LEGAL_CONTENT_APPROVED`, storefront ship, or Word mutation.

`OD-06` is **split** (2026-08-20): submit = request (`IMPLEMENTATION DECISION` + `LEGAL REVIEW`); no extra commercial claims SLA. Not kept as an owner-open mixed P0. Pack: `docs/content-audit/20260820_LAUNCH_COMPLETION.md`.

`OD-03 = B` (2026-08-19): launch interaction model confirmed. **Addendum 2026-09-01:** returns SOP verified (`docs/owner/returns-sop.md`; `RETURNS_SOP_VERIFIED_AND_READY`). Extra goodwill / reverse-logistics arranger **not** chosen. Storefront `/returns` not shipped. `BESPOKE LABEL != AUTOMATIC NO-RETURN RULE`.

`OD-04 = B` (2026-08-19): commercial term **12 months** owner-set (`OWNER_DECISION_OD04_B_WARRANTY_12_MONTHS_OWNER_SET`). Provenance = explicit owner decision, **not** legacy 18 months and **not** generic dump 12 months. **Addendum 2026-09-01:** public-policy spec verified (`docs/owner/warranty-public-policy.md`; `WARRANTY_PUBLIC_POLICY_VERIFIED_AND_READY`) - start from transfer; seller obligor ООО «Роэл-Техник»; narrow exclusions; statutory disclaimer. Storefront `/warranty` not shipped. `PRODUCT LABEL != AUTOMATIC WARRANTY TERM`.

---

## Section A - Identity

| Field | Status | Value / note |
| --- | --- | --- |
| Legal entity (full) | **CONFIRMED** `FACT — CURRENT OWNER CONFIRMED` | Общество с ограниченной ответственностью «Роэл-Техник» |
| Legal entity (short) | **CONFIRMED** | ООО «Роэл-Техник» |
| OGRN | **CONFIRMED** | 1153702012848 |
| INN | **CONFIRMED** | 3702111074 |
| KPP | **CONFIRMED** | 370201001 |
| Legal address | **CONFIRMED** | 153025, г. Иваново, ул. Дзержинского, д. 39, оф. 514 |
| Actual address (card) | **CONFIRMED** | same as legal address |
| Company-card phone | **CONFIRMED** (not showroom SoT) | 8 (4932) 35-99-47 - do not replace showroom phones |
| OKATO | **CONFIRMED** | 24401367000 |
| OKPO | **CONFIRMED** | 14954699 |
| Privacy email | **MISSING** | do not invent; do not use legacy public emails |
| PD operator public copy | **STILL REQUIRES CONTENT/LEGAL COMPLETION** | entity name is known; privacy wording is not approved |
| Showroom contacts | unchanged | `showroom-contacts.ts` (Химки) |

**Provenance:** owner-provided current company card / карточка предприятия ООО «Роэл-Техник» (2026-08-15). Card issue date not stated - do not invent.

**Semantics:**

```text
SELLER IDENTITY: RESOLVED
SELLER = ООО «Роэл-Техник»
OD-01 = A
PRIVACY CONTACT: STILL MISSING
PD OPERATOR COPY: STILL REQUIRES CONTENT/LEGAL COMPLETION
FULL LEGAL PACK: NOT YET APPROVED
```

---

## Section A2 - Bank details (internal)

```text
OD-10 = B
PUBLIC_BANK_DETAILS = NO
NEW_SITE_PUBLIC_BANK_DETAILS = NO
BANK_DETAILS_INTERNAL_CONFIRMED = YES
```

Internal bank details were confirmed from the owner company card (2026-08-15). Values are **not stored in this public repository**. Invoice documents may use them privately. Buyer-facing surfaces stay identity-only (`OD-10 = B`).

**Do not publish** on `/requisites`, footer, `/contacts`, `/payment`, public offer bank block, privacy, FAQ, metadata, structured data, or any other new-site public surface.

Absence on public `/requisites` is an **intentional owner decision**, not a missing-data bug.

Live CS-Cart `/oferta/` may still show older bank lines. That is **legacy divergence**, not permission for the new site.

Invoice as a private payment document may include bank details. That does **not** change `OD-10 = B` or authorize a public bank block on `/payment`.

---

## Public `/requisites` (when implemented; not this task)

Allowed identity: ООО «Роэл-Техник»; ОГРН; ИНН; КПП if the page structure needs it; юридический адрес.
Forbidden until a later owner decision: settlement account, correspondent account, BIK, bank name block.

Do not treat a later `/requisites` page as permission to publish bank details (`OD-10 = B` unchanged). Implementation of identity-only `/requisites` is in the 2026-08-20 cycle (`20260820_LAUNCH_COMPLETION.md`).

---

## Section B - Operational decisions

Remaining unanswered in this packet:

1. ~~Возврат (`OD-03`)~~ **closed: OD-03 = B**. Launch SOP verified 2026-09-01: `docs/owner/returns-sop.md`. Extra goodwill / live Demo Magazin / Word §5.10 remain follow-ups. `/returns` not shipped.
2. ~~Гарантия (`OD-04`)~~ **closed: OD-04 = B**. Public-policy spec 2026-09-01: `docs/owner/warranty-public-policy.md` (12 months; start from transfer; seller obligor). `/warranty` not shipped. Manufacturer **name** still missing. Pack: `docs/content-audit/OD04_WARRANTY_VERIFICATION.md`.
3. ~~Доставка (`OD-02`)~~ **closed: OD-02 = B** (`OWNER_DECISION_OD02_B_DELIVERY_QUOTE_ONLY`). Quote-only; no public tariff; checkout `0 ₽` is technical. `/delivery` READY_FOR_COPY_PHASE_WITH_SERVICE_GAPS. Does **not** confirm geography, lift, assembly, or pickup. Pack: `docs/content-audit/OD02_DELIVERY_SERVICES_VERIFICATION.md`.
4. ~~Индивидуальные товары (legal mapping)~~ **2026-09-01:** criterion in `docs/owner/returns-sop.md` (ст. 26.1). Product labels still not automatic no-return. Not a new OD.
5. ~~Оплата (`OD-05`)~~ **closed: OD-05 = A** (`OWNER_DECISION_OD05_A_MANUAL_INVOICE_PAYMENT_LINK`). `/payment` READY_FOR_COPY_PHASE.
6. ~~Момент акцепта (`OD-06A`)~~ **2026-08-20:** `IMPLEMENTATION DECISION` + `LEGAL REVIEW`. Site submit = request, not acceptance. Not an owner-open mixed P0.
7. ~~Претензии / SLA (`OD-06B`)~~ **2026-08-20:** `NO ADDITIONAL COMMERCIAL PROMISE`. No invented 3/10/30/45-day SLA.
8. ~~Реквизиты: публиковать ли банк~~ **closed: OD-10 = B**
9. Hours / emails (`OD-07`): launch without unconfirmed data
10. On-site services (`OD-08`): do not promise
11. Designers (`OD-09`): soft cooperation, no public trade terms
12. IA (`OD-11`): no `/services`. Care pages (`OD-12`): deferred

See `docs/content-audit/20260820_LAUNCH_COMPLETION.md`. `FINAL_OWNER_GATE = NONE`.

Required full-pack tokens (not issued):

- `OWNER_LEGAL_CONTENT_APPROVED`
- `OWNER_LEGAL_CONTENT_APPROVED_WITH_NOTES`
- `OWNER_LEGAL_CONTENT_REJECTED`
