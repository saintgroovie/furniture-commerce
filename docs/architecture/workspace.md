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

This change was not applied to production and was not applied to the daily QA database. The migration itself refuses any database whose name does not start with `workspace_it`. `yarn db:migrate:workspace-it` loads the same env files as Medusa, then allows the migration only when `WOODRIGHT_DB_ISOLATION=isolated` and the URL is loopback, not port `5432`, database name starts with `workspace_it`, and the URL does not override host or port. That flag does not make a forbidden target allowed.

On an isolated database named `workspace_it` the migration applied, a second run was a no-op, a dropped table rolled back inside a transaction, and a second link for the same lead was rejected by the unique index.

Lead, bespoke request, room-set, product classification and payment link previously had no committed migrations, so a fresh database had no tables. Draft product create failed with `product_classification does not exist` and left an inventory item behind. Additive `create table if not exists` migrations were added. Their `down` refuses every database except `workspace_it`, so a mistaken rollback cannot drop the live tables. On `workspace_it`, creating a STANDARD draft then returned 201 and stayed a draft.

The desk session cookie is httpOnly. Its expiry is signed with `WOODRIGHT_WORKSPACE_SESSION_SECRET` (at least 32 characters, server only). A cookie with a changed expiry is rejected. Without that secret, login does not issue a session.

## Admin fallback is not access control

`WOODRIGHT_WORKSPACE_OWNER_EMAILS` only decides whether Стол shows «Открыть в Medusa». It does not close `/app`. Any Medusa admin who can sign in can still open `/app` directly. Existing staff are not locked out. New workspace writes still require a Medusa admin session. The escape hatch stays closed unless the email is on the allowlist.

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
