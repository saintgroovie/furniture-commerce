# Woodright OS: integration decisions, 2026-10-20

Owner confirmed accounting product: **«1С:Бухгалтерия 8.0»**. Treat this as the product family until the actual platform build/configuration edition, hosting and available exchange are verified. Do not assume that platform 8.0 has the REST features of modern 8.3.

Owner will ask the accountant about hosting. Owner also selected **MANGO OFFICE** for telephony. Both are part of the same OS implementation; accounting discovery does not block independent CRM/file work.

## Sources of truth

| Domain | System | OS responsibility |
|---|---|---|
| Product, variant, commerce price, customer, cart, order, payment/fulfillment | Existing Medusa | Staff view and authorized native commands |
| Request, lead, manufacturing, room | Existing Woodright Medusa modules | Preserve IDs and independent states |
| Invoice number, accounting document, bank receipts and corrections | Existing 1С:Бухгалтерия | Prepare intent, show confirmed accounting facts |
| Client files and invoice PDFs | Private S3, metadata in a Medusa module | Authorized upload/download, binding and history |
| Product photos | Existing Medusa file provider | Display/manage only through product media contracts |
| Mail archive | Confirmed Yandex mailbox | Thread links and explicit employee replies |

## Priority 1: existing Medusa, no parallel CRM

Promote the existing OS modules after isolated migration tests and permission checks. The open #290/#297 chain is not a verified main/production dependency. Live reads must use current production contracts. Add counts/offset/limit to legacy module lists and transactional version checks for request updates before enabling saves. An API read must not call the legacy order-process detail endpoint, whose GET ensures/creates a process. Use the list snapshot for a read-only screen.

Current private candidate uses Medusa user authentication and a signed httpOnly cookie. It has no fixture escape hatch or generic data replacement API. Owner/non-owner fallback display is not a permission system; granular staff permissions need an actual backend gate.

Implemented in this PR, verified on disposable `workspace_it*` databases: transactional request CAS, replayable operation receipts, mandatory action journal, follow-up creation/completion/reopen, and private attachment metadata/upload/download/soft removal. Every route checks a current Medusa staff user. The legacy request PATCH joins the same guard when the feature is enabled. Migrations intentionally refuse production database names; promotion requires a separately reviewed production migration/release bundle. No live migration or feature flag was changed.

## Priority 2: 1С:Бухгалтерия

Preferred transport after version confirmation: a narrowly scoped HTTP service/extension on the accounting side, reached by the Medusa integration worker over private HTTPS. If the existing installation cannot publish the necessary service, use an explicitly mapped XML exchange with visible import results. A bespoke exchange contract is not a stock 1C API.

Flow:

1. Manager prepares a draft from a specific request or order, with confirmed payer and exact variants/quantities/prices.
2. Medusa stores draft and outbox event in one transaction. Stable operation ID is never regenerated on retry.
3. Worker submits an invoice intent. After a timeout, query by external ID; do not issue a second invoice blindly.
4. 1C validates organization, counterparty, item/tax mappings and bank account, then assigns its number and accounting ID.
5. OS displays the confirmed document and private PDF. A missing acknowledgement is «Ожидает подтверждения», not «Счёт создан».
6. Bank receipts/partial payments/corrections return from 1C with unique document IDs and source version. Do not set Medusa payment status from a manual UI checkbox or a manufacturing transition. Reconciliation with the existing payment provider requires a separate explicit workflow.

Map by stable IDs: Medusa variant ↔ 1C nomenclature; lead/customer/company ↔ counterparty; seller ↔ organization; invoice ↔ accounting document. Ambiguous matches require review. Do not fuzzy-merge contacts or create duplicate counterparties silently. Seller bank requisites are absent from the project source and must come from the confirmed accounting organization.

`apps/workspace/src/server/integrations/accounting-contract.mjs` supplies a tested intent/receipt boundary, including integer kopeks, tax/item mappings, fingerprint and stable external ID. It does not contact or claim to implement an unverified 1C endpoint. Persistent drafts, outbox, worker, transport and receipt journal remain the next backend stage.

## Priority 3: private attachments

Prefer a private Timeweb S3 bucket, reusing the existing hosting provider. Keep client contracts, drawings and PDFs separate from public catalog photos. Medusa owns attachment metadata: exact entity ID/type, original filename, detected MIME/size/hash, storage key, uploader, timestamps, version, quarantine and soft-delete state.

Authorize every download against the linked entity. Issue short-lived signed URLs only after that check. Validate actual bytes, apply size limits and scan untrusted documents before release from quarantine. Upload retries finalize the same upload ID. An incomplete upload is not a saved attachment. Preserve soft delete/restore and a retention policy confirmed by the owner.

The current isolated implementation uses an explicitly configured private filesystem directory outside the backend application root, with 0700 directory/0600 immutable blobs and no symlinks. Uploads are bounded to 8 MiB, stored with SHA-256 and returned only as authenticated attachment downloads with no-store/nosniff. Original MIME is not trusted for inline rendering. Soft removal preserves bytes and an action event. Failed commits can leave private orphan blobs, requiring reviewed reconciliation; the code does not delete bytes after uncertain database completion. S3 transport, malware quarantine/scanning, user-facing restore and retention/backup policy remain deployment work. Do not point this pilot at a public/static uploads directory or enable production uploads before those operational requirements are settled.

## MANGO OFFICE: selected telephony provider

The implemented receiver is `POST /hooks/woodright/mango/events/call` in Medusa, disabled unless both `WOODRIGHT_MANGO_ENABLED=1` and `WOODRIGHT_DESK_FEATURES=1`. Server-only configuration names are `WOODRIGHT_MANGO_API_KEY` and `WOODRIGHT_MANGO_SIGNING_KEY`. Never put them in browser variables, Git or the chat. No provider credentials were installed and no real call was initiated.

The receiver verifies the provider key and SHA-256 signature against the exact JSON string, then commits an event receipt and call-leg projection in one transaction. Repeated `(tenant, call_id, seq)` events are idempotent; delayed events remain in history without rolling the current state back. Keep `entry_id` (whole routed conversation) distinct from `call_id` (one leg); do not count transfers as separate customer conversations. Signed conflicting payloads with an existing sequence require reconciliation. Acknowledge only committed events.

Next connected UX: inbound call card, exact phone match with a chooser for ambiguous contacts, call history in person/request/order, a missed-call work queue, and explicit click-to-call. Never auto-merge people or automatically bind a call to an arbitrary open request. Complete-call statistics reconcile missed-call status and duration; a missing Connected notification is not proof of a missed conversation. Recordings remain provider references and require a separate staff permission/proxy, not public file URLs. ASR/transcripts are optional, not automatically enabled.

`buildMangoCallback` uses a server-owned Medusa-user → MANGO-extension mapping and a stable command ID. MANGO explicitly does **not** deduplicate `command_id`. Before enabling outbound calls, add a persistent dispatch/reconciliation workflow: claim once, send once, wait for result/call events, mark an uncertain timeout as unknown and inspect before retry. There is no automatic call retry in this PR. Caller-ID lines and employee extensions must be verified in the actual account.

Before connection: obtain account administrator access, confirm API availability, map employees/extensions, provision the server secret values, and configure an HTTPS provider event route without exposing the staff admin. Reconcile an inbound, outbound, transferred and missed test conversation with actual provider history. The production rollout must use the repository release/migration governance.

## Priority 4: Yandex 360 mail

First confirm organization/domain and one real working mailbox. Prior fixture `desk@woodright.ru` is not evidence of a mailbox. Use OAuth/XOAUTH2 for IMAP/SMTP where supported. Directory inventory access does not imply reading message bodies or sending mail. Keep the connector and mail permissions disabled until configured.

Store thread IDs, linkage and synchronization state in the existing communication module; keep the authoritative archive in Yandex. Replies are an explicit send action with recipients, attachments and delivery/error state. Do not use one staff mailbox password as a shared OS credential. DNS changes are outside this integration implementation.

## Later, only for a confirmed workflow

Internal OS notifications first. Telegram can later carry concise event notifications and authenticated deep links, without client files or personal/financial detail in the message. Add delivery providers, EDI/Diadoc or messaging channels only after the actual provider/workflow is selected. Do not introduce Bitrix24, amoCRM, a second stock/accounting system, a payment acquirer or a new cloud database just for the redesign.

## Official technical references

- [1C integration mechanisms](https://v8.1c.ru/platforma/integraciya/)
- [1C REST interface](https://v8.1c.ru/platforma/rest-interfeys/); [REST introduced in 8.3.5.1068](https://wonderland.v8.1c.ru/blog/avtomaticheskiy-rest-interfeys-prikladnykh-resheniy/)
- [Timeweb private buckets and S3 access](https://timeweb.cloud/docs/s3-storage/manage-storage/manage-buckets)
- [Timeweb supported S3 capabilities](https://timeweb.cloud/docs/s3-storage/supported-features)
- [Yandex Mail OAuth](https://yandex.ru/support/yandex-360/business/mail/ru/web/security/oauth)
- [MANGO call events and sequence ordering](https://docs.mango-office.ru/ru/5_api-i-razrabotka/1_api-mango-office/5_opisanie_metodov_api_virtualnoy_ats_mango/1_1_api_realtime/3_1_2_uvedomlenie_o_vyzove.html)
- [MANGO callback command and command-ID semantics](https://docs.mango-office.ru/ru/5_api-i-razrabotka/1_api-mango-office/5_opisanie_metodov_api_virtualnoy_ats_mango/2_2_api_komandy/3_2_1_initsiirovanie_vyzova_ot_imeni.html)
- [MANGO request signing examples](https://docs.mango-office.ru/ru/4_integratsii/6_arhiv-integratsii/1_support-integratsiya-api/3_restapivatshelp/1_obshchie_voprosy_po_api_vats_mango_office/index.html)

These references establish possible protocols, not that the Woodright accounts have been connected.
