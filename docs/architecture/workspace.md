# Woodright workspace

Employee UI for Woodright. Medusa Admin at `/app` stays the emergency fallback.

## Boundary

`apps/workspace` is a first-party Next.js app. It is not a second commerce backend, not a copy of the Medusa database, and not a fork of Medusa core.

The browser talks only to the workspace origin. The workspace server calls Medusa Admin APIs with the staff session. The session token lives in an httpOnly cookie named for the desk. It is not written to `localStorage`.

Mailbox passwords, Yandex OAuth tokens, SMTP credentials, and database credentials are not part of this app. `mailConnectorEnabled()` always returns false in Phase 1.

Public hostname `admin.woodright.ru` is refused as a fallback URL.

## Ownership

| Fact | Owner |
| --- | --- |
| Product, variant, price, price list, customer, cart, order, payment, fulfillment | Medusa |
| Classification `STANDARD` / `CONFIGURABLE` / `BESPOKE` | Woodright module `product-extension` |
| Kids | Storefront navigation metadata, not a product type |
| Room set | Woodright module `room-set` |
| Lead, which the desk calls a person | Woodright module `lead` |
| Bespoke request | Woodright module `bespoke-request` |
| Manufacturing stage | Woodright module `order-process` |
| Promotion slot | Woodright module `promotion-slot`. Price stays on the Medusa price list |
| Person link to a Medusa customer and a staff assignee | Woodright module `person-link` |
| Email archive | Yandex, when a mailbox is later confirmed. Not this app |

A Medusa order status and a Woodright manufacturing stage stay separate on the order screen.

## What the employee opens

Primary daily UI: Стол (`apps/workspace`).

Navigation: Сегодня, Заявки, Заказы, Люди, Каталог, Комнаты, Акции, Медиа, Сайт.

Почта is not in the menu. There is no empty settings item.

`/app` remains available for the owner and for anything the desk does not cover yet. The link «Открыть в Medusa» renders only when `WOODRIGHT_WORKSPACE_OWNER_EMAILS` contains the signed-in email. An empty allowlist does not grant that link to every admin. Daily catalog and order capabilities stay open for every authenticated admin so existing staff are not locked out. That role split is code, not a production permission migration.

## CRM

Contact is the existing lead. There is no second person table.

`woodright_person_link` stores an optional Medusa `customer_id` and an optional Medusa user id as `assignee_id`. Orders and payments are not copied.

Matching uses normalized email or phone. One hit can be linked by an explicit button. Two hits return `needs_review` and are not merged.

Requests stay `bespoke_request` records. One person can have many requests. A request does not become an Opportunity.

## Mail

Future shapes `CommunicationThreadShape` and `CommunicationShape` live in `apps/backend/src/lib/woodright-workspace/mail-boundary.ts`. They have no body and no attachment columns. No migration creates them. No IMAP or SMTP client exists.

## Person-link migration gate

File: `apps/backend/src/modules/person-link/migrations/Migration20260930180000.ts`.

It creates `woodright_person_link` and drops that table on the way down.

This change was not applied to production and was not applied to the daily QA database. Apply only with an owner decision, on a backup, with `medusa db:migrate` from the release that contains this module. Until then, people and requests still read. Link and assignee writes return 503.

## DNS mail debt

Do not change DNS from the workspace work. Observed on 2026-09-30 and recorded in the discovery pass:

- `woodright.ru` MX `10 mx.yandex.net` and `20 mail.woodright.ru`
- SPF `v=spf1 ip4:79.133.175.238 a mx ~all` while the apex A is no longer the July address
- no public DMARC TXT was returned
- DKIM selectors were not confirmed
- `woodright.com` has no MX

Later path: observe, verify the Yandex organization, verify the real mailbox, verify DNS, owner approval, then change. Absence of a public record is not proof that the Yandex panel is empty.

## Local preview

`WOODRIGHT_WORKSPACE_FIXTURES=1` together with `WOODRIGHT_WORKSPACE_RUNTIME=local-preview` shows sample screens without Medusa. Either flag alone does nothing. Do not set these on production or demo.
