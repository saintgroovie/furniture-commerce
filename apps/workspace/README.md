# Woodright OS — private Medusa connection

Premium interface selected by the owner, using the existing Woodright wordmark, navy/gold palette and OS on the right. The daily heading is «Рабочая очередь».

This app reuses the first-party Next.js workspace boundary and signed httpOnly staff session. The browser calls only this origin; the server calls Medusa. It does not create another commerce database. There is no IndexedDB seed, browser token, public admin hostname, email connector or accounting credential in the client bundle.

## Current scope

Implemented: Medusa staff login/logout, show/hide password, bounded reads, live products/variants/prices/readiness/media, leads, bespoke requests, orders, manufacturing snapshots and rooms. Prices from the seller API are major RUB; UI amounts use integer kopeks. Product ranges remain ranges. Manufacturing, payment and fulfillment stay independent. A missing source produces an explicit error, not a demo or an empty-success fallback.

Writes require both `WOODRIGHT_LIVE_WRITES=1` and installed server capabilities. Companies, contact/request creation and editing, company/employee assignment, reminders, private attachments, restoration, audit and operation receipts persist in Medusa's database. Version checks prevent silent overwrites by concurrent editors. Staff use native expiring invitations and server-bound seller, production, accountant, director and God roles. Production sees only assigned work and explicitly shared working files; financial files remain private to business roles.

Invoices support shared drafts with exact integer-kopeck calculations, payer and line snapshots, and manual registration of existing 1C documents by accounting or God. Registration requires actual number/date, a matching total and a private PDF. Registered facts and PDFs are immutable; archive preserves them and does not annul a 1C document. Payment confirmation and automatic 1C exchange remain disconnected. Never invent accounting numbers, taxes, bank details or payments. The invoice schema uses only the allowlisted `apps/backend/scripts/invoice-migration.cjs` runner after release qualification; a passing build is not a production apply. See `docs/operator/woodright-team-workspace.md`.

MANGO OFFICE is selected for telephony. The backend includes a disabled-by-default signed webhook receiver, durable event deduplication and monotonic call-leg projections, plus a tested callback intent. It does not make calls or expose recordings. The account/API, staff-extension mapping and provider callback route still need configuration; see `docs/architecture/woodright-os-integrations.md` from repository root.

## Data completeness

Order, lead, request, room and process APIs use bounded pagination with authoritative totals and a truncation notice. The custom product API enumerates its source on the backend. Do not infer company, customer link, promised date or bank/payment fact when the API does not supply it.

## Run and validation

`npm ci`, `npm test`, `npm run typecheck`, `npm run build` in this directory. Use the repository durable server helper for a private review, never an agent-shell daemon. The canonical buyer ports 3002/9000 are reserved. See `.env.example` for non-secret configuration names.

The local-private launcher binds loopback only and creates a session signing secret in memory; restart requires sign-in again. A hosted runtime must supply a managed secret, private HTTPS and a governed release identity. The owner-authorized hosted entry is https://woodright.ru/os with login-only access. Raw Medusa Admin remains private. Do not publish this app through a public prototype host.

## Provenance

Base repository: `490e5c03ece346d506c6de5babf34b786d17915c`.
Session and bounded request helpers reused from existing OS commit `51f224d1f0e4d5de152ca9191d71b09629fdb921`, not the owner's dirty checkout. The new app does not merge the incomplete CRM dependency chain or apply its migrations.

The CRM follow-up model/table is reused from committed OS source `51f224d1`, with a version field for concurrent updates; unrelated owner-branch company/mail modules remain untouched. Backend `woodright-desk` commands and the conditional CRM registration are part of this PR. Runtime evidence belongs outside Git; credentials and local state are ignored.
