# Woodright OS: integration decisions, 2026-10-20

Owner confirmed accounting product: **«1С:Бухгалтерия 8.0»**. Treat this as the product family until the actual platform build/configuration edition, hosting and available exchange are verified. Do not assume that platform 8.0 has the REST features of modern 8.3.

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

No migration, bucket creation, public ACL, credentials, scans or invoice PDF storage were silently provisioned by the frontend work.

## Priority 4: Yandex 360 mail

First confirm organization/domain and one real working mailbox. Prior fixture `desk@woodright.ru` is not evidence of a mailbox. Use OAuth/XOAUTH2 for IMAP/SMTP where supported. Directory inventory access does not imply reading message bodies or sending mail. Keep the connector and mail permissions disabled until configured.

Store thread IDs, linkage and synchronization state in the existing communication module; keep the authoritative archive in Yandex. Replies are an explicit send action with recipients, attachments and delivery/error state. Do not use one staff mailbox password as a shared OS credential. DNS changes are outside this integration implementation.

## Later, only for a confirmed workflow

Internal OS notifications first. Telegram can later carry concise event notifications and authenticated deep links, without client files or personal/financial detail in the message. Add telephony, delivery providers, EDI/Diadoc or messaging channels only after the actual provider/workflow is selected. Do not introduce Bitrix24, amoCRM, a second stock/accounting system, a payment acquirer or a new cloud database just for the redesign.

## Official technical references

- [1C integration mechanisms](https://v8.1c.ru/platforma/integraciya/)
- [1C REST interface](https://v8.1c.ru/platforma/rest-interfeys/); [REST introduced in 8.3.5.1068](https://wonderland.v8.1c.ru/blog/avtomaticheskiy-rest-interfeys-prikladnykh-resheniy/)
- [Timeweb private buckets and S3 access](https://timeweb.cloud/docs/s3-storage/manage-storage/manage-buckets)
- [Timeweb supported S3 capabilities](https://timeweb.cloud/docs/s3-storage/supported-features)
- [Yandex Mail OAuth](https://yandex.ru/support/yandex-360/business/mail/ru/web/security/oauth)

These references establish possible protocols, not that the Woodright accounts have been connected.
