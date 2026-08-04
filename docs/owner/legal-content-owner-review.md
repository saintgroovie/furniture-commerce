# Legal content - owner review packet

**Date:** 2026-08-04 (Europe/Moscow)
**Branch:** `feat/legal-content-remediation-20260804`
**Base:** `796855a` (profile/SEO merge)
**Document status:** `owner_review`
**Engineering status:** `legal_content_blocked_missing_business_identity`

This packet is **not** a legal opinion and **not** deployment authorization.

Required owner response (one of):

- `OWNER_LEGAL_CONTENT_APPROVED`
- `OWNER_LEGAL_CONTENT_APPROVED_WITH_NOTES`
- `OWNER_LEGAL_CONTENT_REJECTED`

Silence is **not** approval.

---

## Section A - Identity

| Field | Source | Value / status | Conflict |
|---|---|---|---|
| Showroom title | `showroom-contacts.ts` | Шоурум Woodright | none |
| Venue | same | МТК «Гранд-2», вход 3, 4 этаж, подиум Woodright | none |
| City / street | same | МО, г. Химки, ул. Бутаково, д. 4 | none |
| Free call | same | +7 (800) 555-17-36 | none |
| Write/call | same | +7 967 258-71-44 | none |
| Telegram / WhatsApp / MAX | same | confirmed URLs | none |
| Legal entity name | owner env / sealed | **MISSING** | blocks approval |
| INN | owner env | **MISSING** | blocks approval |
| OGRN / OGRNIP | owner env | **MISSING** | blocks approval |
| Legal address | owner env | **MISSING** | blocks approval |
| Privacy email | owner env | **MISSING** | blocks launch |
| PD operator | owner env | **MISSING** | blocks launch |
| Bank details | none | not published (needs owner permission) | n/a |

---

## Section B - Operational decisions

Answer concretely (do not leave blank if approving):

1. **Возврат:** сроки, исключения для изделий по проекту, кто оплачивает обратную доставку
2. **Гарантия:** срок и объём по товарной политике
3. **Доставка:** география, расчёт, подъём, сборка, ориентиры сроков
4. **Индивидуальные товары:** отмена / изменения до старта производства
5. **Оплата:** оставить `manual_invoice` или требовать online payment
6. **Подтверждение заказа:** момент акцепта оферты
7. **Претензии:** канал и срок ответа
8. **Реквизиты:** публиковать ли банковские данные на `/requisites`

---

## Section C - Document-by-document

| Route | Before | After | Unresolved |
|---|---|---|---|
| `/contacts` | live showroom | unchanged SoT | - |
| `/delivery` | generic + showroom | structured; no invented tariffs | regions/terms |
| `/payment` | PaymentLink honesty | + owner decision note | payment mode |
| `/returns` | «подготовка» title | clean title + contact path | return window |
| `/privacy` | prep chrome | structured policy skeleton | entity + PD rules |
| `/personal-data` | 404 | new consent document | - |
| `/terms` | prep / purchase mix | site-use rules + links to offer | - |
| `/offer` | «черновик» | structured offer for review | entity + acceptance |
| `/cookies` | 404 | cart_id + no analytics claim | - |
| `/requisites` | 404 | identity when provided; else missing note | entity fields |
| `/warranty` | «подготовка» | clean + contact path | warranty term |

Screenshots: local preview after durable start (see evidence/screenshots).

---

## Section D - Required owner response

1. Supply missing identity fields (entity, INN, OGRN, legal address, privacy email, PD operator).
2. Answer Section B decisions.
3. Reply with one token:

`OWNER_LEGAL_CONTENT_APPROVED`
`OWNER_LEGAL_CONTENT_APPROVED_WITH_NOTES`
`OWNER_LEGAL_CONTENT_REJECTED`

Until then:

- `LEGAL_CONTENT_STATUS` stays `owner_review` (not `approved`)
- public launch gate stays blocked
- no merge without the approval token
- no VM deploy / OWNER PASS inheritance from `22cbd68`
