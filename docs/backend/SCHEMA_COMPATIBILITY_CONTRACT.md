# Backend schema compatibility contract

Status: prerequisite for clean `origin/main` backends against the existing Woodright DB.

## Source of truth

- Live database already contains:
  - core Medusa `product_type` (catalog types; may be empty)
  - Woodright `product_classification` (STANDARD / CONFIGURABLE / BESPOKE)
  - link table with `product_classification_id`
- Compatibility work aligns **code** to that schema.
- No migration / DDL / DML is required for this contract.

## Woodright identity

| Concern | Contract |
| --- | --- |
| Model | `ProductClassification` via `model.define("product_classification", …)` |
| Enum field | `product_type`: `STANDARD` \| `CONFIGURABLE` \| `BESPOKE` |
| Module service | registers `ProductClassification` |
| Link | `ProductModule.linkable.product` ↔ `ProductExtensionModule.linkable.productClassification` |
| Graph field | `product_classification.*` / `product_classification.product_type` |

Do not bind Woodright classification to core `ProductType` / table `product_type`.

## Date models

Custom models must not use `.default(() => new Date())` on `created_at` / `updated_at`.
Medusa owns timestamps; route handlers convert string inputs with `new Date(...)` where needed.

## BESPOKE cart guard (fail-closed)

Middleware on `POST /store/carts/:id/line-items`:

1. Collect every `variant_id` from body (`variant_id` and `items[]`).
2. Resolve product + `product_classification.product_type`.
3. Missing product / missing / non-string classification → `500` `PRODUCT_TYPE_VALIDATION_FAILED`.
4. `BESPOKE` → `400` `BESPOKE_NOT_ALLOWED_IN_CART`.
5. Kids metadata / stamps never bypass this backend guard.

## Out of scope (separate streams)

- Catalog browse projection / `MAX_IMAGES`
- Media serving / admin build symlink
- Seed script rename
- Admin UX
- Migrations

## Related branch

`fix/backend-runtime-schema-compatibility-20260716`
