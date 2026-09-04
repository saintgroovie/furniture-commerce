# Woodright Admin Workspace

Seller-facing workspace inside stock Medusa Admin. It does not replace native Admin.

## Purpose

Let a seller find a product, edit price / dimensions / visibility, create a draft, and prepare staged site contacts without touching native Medusa Advanced screens for everyday work.

## Routes

| Path | Role |
| --- | --- |
| `/woodright` | Overview: search, attention counts, recent |
| `/woodright/products` | Seller product list |
| `/woodright/products/new` | Create draft |
| `/woodright/products/:id` | Product Editor |
| `/woodright/contacts` | Staged contacts (not live) |
| `/woodright/sku` | Redirect to `/woodright/products`, no sidebar |

Sidebar shows **Woodright** and **Товары**. Create and Contacts are internal links. Admin SDK 2.17.2 does not support `nested: "/woodright"`.

## Architecture boundary

```
Medusa canonical SoT
  -> native Medusa APIs / modules / workflows
  -> narrow Woodright admin commands
  -> task-oriented seller Workspace
```

Forbidden: second DB, BFF, GraphQL, core fork, direct SQL, storefront-as-CMS.

## Canonical sources

| Data | Seller UI | Mutation | SoT |
| --- | --- | --- | --- |
| Price | Product Editor | native `POST /admin/products/:id/variants/:variantId` | Medusa pricing, RUB major units |
| Dimensions | Product Editor | `POST /admin/woodright/products/:id/dimensions` | `metadata.dimensions` + `dimensions_normalized` in mm |
| Hide | Product Editor | native `POST /admin/products/:id` `{ status: "draft" }` | Medusa product status |
| Publish | Product Editor / wizard | `POST /admin/woodright/products/:id/publish` only | Medusa status after server readiness |
| Classification | Create wizard | product-extension module + link | not `metadata.classification` |
| Collection | Create / publish gate | active catalog keys | same paused/active set as buyer catalog |
| Contacts | Contacts page | `PUT /admin/woodright/contacts` | `store.metadata.woodright_site_contacts` staged |

## Seller vs native Advanced

Workspace is the daily seller path. Native product page (including the site-status widget) stays for advanced diagnosis. Seller publish must not call native `status: "published"`.

## Staged contacts

Allowed: free call, write-or-call, messenger enablement. Address / email / hours / legal / bank fields are rejected. Public storefront still uses `showroom-contacts.ts`. Do not activate until a separate owner token.

## Publish readiness

One engine: `computeWorkspacePublishReadiness` / `decideWorkspacePublish`.

Blockers: missing title, UNKNOWN classification, missing/paused collection, missing SKU, missing price except BESPOKE, missing photo.

Warnings: missing dimensions, CONFIGURABLE without execution setup.

`material_tiers` alone is not an execution media contract.

## How to add a seller-editable field

1. Keep Medusa as SoT (native API or a narrow Woodright command).
2. Allowlist the payload. Do not accept a client `metadata` blob.
3. Merge unrelated metadata server-side.
4. Reuse the same readiness engine if the field affects publish.
5. Add a focused unit test. Do not add a migration unless owner-approved.

## Forbidden shortcuts

- Direct seller publish to native `published`
- Cart-allowed flags, fake price 0, duplicate Default options
- RBAC / `MEDUSA_FF_RBAC`
- Contacts go-live / storefront consumer
- Copying dirty source into the LaunchAgent runtime

## Runtime / release

`:9000` / `:3002` are canonical-primary. Feature review of a committed SHA uses a git worktree plus `scripts/local/durable_local_server.py` on alternate ports. Do not rsync uncommitted Workspace into the live runtime clone.
