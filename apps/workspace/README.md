# Woodright OS — private Medusa connection

Premium interface selected by the owner, using the existing Woodright wordmark, navy/gold palette and OS on the right. The daily heading is «Рабочая очередь».

This app reuses the first-party Next.js workspace boundary and signed httpOnly staff session. The browser calls only this origin; the server calls Medusa. It does not create another commerce database. There is no IndexedDB seed, browser token, public admin hostname, email connector or accounting credential in the client bundle.

## Current scope

Implemented: Medusa staff login/logout, show/hide password, bounded reads, live products/variants/prices/readiness/media, leads, bespoke requests, orders, manufacturing snapshots and rooms. Prices from the seller API are major RUB; UI amounts use integer kopeks. Product ranges remain ranges. Manufacturing, payment and fulfillment stay independent. A missing source produces an explicit error, not a demo or an empty-success fallback.

The first connected candidate is read-only. `WOODRIGHT_LIVE_WRITES=0` is the deployment default. The existing order transition contract has expected version and idempotency. Request writes additionally remain refused because the currently deployed request route lacks transactional compare-and-swap. This is a code limitation, not a request for repeated owner approval.

Not connected: company/assignee/follow-up modules from the unmerged OS branches, private client attachments, issuing invoices, accounting payment reconciliation, mailbox and outbound notifications. Their actions show connection requirements rather than pretending to save locally. The standalone prototype remains separate at `../../../../woodright-os` and its demo records must never be imported.

## Data completeness

The core order API is paginated with a bounded cap, explicit total and truncation notice. Current custom product API enumerates its source on the backend. Legacy lead/request/room/process APIs do not return authoritative totals; the UI must not claim a complete inventory from those lists. Promote paginated native routes before wider staff rollout. Do not infer company, customer link, promised date or bank/payment fact when the API does not supply it.

## Run and validation

`npm ci`, `npm test`, `npm run typecheck`, `npm run build` in this directory. Use the repository durable server helper for a private review, never an agent-shell daemon. The canonical buyer ports 3002/9000 are reserved. See `.env.example` for non-secret configuration names.

The local-private launcher binds loopback only and creates a session signing secret in memory; restart requires sign-in again. A hosted runtime must supply a managed secret, private HTTPS and a governed release identity. Keep admin off public buyer domains. Do not publish this app through a public prototype host.

## Provenance

Base repository: `490e5c03ece346d506c6de5babf34b786d17915c`.
Session and bounded request helpers reused from existing OS commit `51f224d1f0e4d5de152ca9191d71b09629fdb921`, not the owner's dirty checkout. The new app does not merge the incomplete CRM dependency chain or apply its migrations.

Only the files under `apps/workspace` are part of this implementation. Runtime evidence belongs outside Git; credentials and local state are ignored.
