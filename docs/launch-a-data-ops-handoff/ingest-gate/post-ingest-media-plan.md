# Post-ingest product-media plan — Flow A 28 handles

**Prerequisite:** scoped catalog ingest complete → **28/28** handles in Medusa with `status=draft`.

## Why separate gate

Flow A media files exist on disk / legacy URLs but ingest plan **intentionally creates products without images** (Oxford pilot pattern). Product-media executor requires Medusa `product.id` per handle.

## Inputs

| Source | Purpose |
|--------|---------|
| `data/processed/.../flow-a-affected-handles.json` | Media filenames per handle |
| `tmp/willie-winkie-flow-a-launch-a-draft/launch-a-product-draft.json` | handle ↔ legacy_cs_cart_product_id |
| Existing product-media apply scripts | Read-only pattern reference |

## Sequence

1. **Read-only preflight** — for each of 28 handles: Store API / Postgres `product_found`, media file exists on static path
2. **Dry-run apply** — log assignments, no writes
3. **Operator sign-off**
4. **Apply** — whitelist `--handles` or full 28 list; never full-catalog apply
5. **Read-only validation** — 28/28 thumbnail or gallery present; browser-safe URLs (no raw `medusa:9000`)

## Launch A constraints (carry forward)

- Products remain **draft** until separate publish gate
- No fake tier images
- Request-mode PDP: media for display only; price = «от …» + manager confirm

## Explicitly forbidden in media gate

- Re-seed / re-import products
- Mutate `data/normalized/**` without gate
- Apply media before product ingest verified
- CO-02-1, non-whitelist handles

## Success criteria

| Check | Target |
|-------|--------|
| Handles with product row | 28/28 |
| Handles with ≥1 previewable image | 28/28 (or documented exceptions) |
| Oxford / Oliver existing media | unchanged |

## Estimated command shape (placeholder — use existing executor when wired)

```bash
# After ingest + validator pass — NOT RUN YET
cd /Users/leonidmbp/Documents/projects/furniture-commerce
WW_FLOW_A_MEDIA_DRY_RUN=1 \
  npx tsx scripts/product-media-apply-flow-a-28.ts \
  --whitelist tmp/launch-a-ingest-gate/flow-a-ingest-whitelist.json
```

Replace with actual executor path from codebase when implementing media gate.
