# Launch A — Flow A data-ops handoff

Durable resume package for Willie Winkie / Molly Flow A (28 handles).  
**Do not rely on Cursor chat memory or browser localStorage.**

| Field | Value |
|-------|--------|
| Branch | `qa/willie-winkie-flow-a-matrix-board` |
| HEAD (at handoff) | `9a0574e` |
| Generated | 2026-06-15 |

## Canonical QA route

**Matrix board (operator tool):** `/qa/willie-winkie-flow-a-matrix-board`

**URL (local):** http://localhost:3004/qa/willie-winkie-flow-a-matrix-board

**Not the primary tool:** `/qa/willie-winkie-business-gate-board` (older business gate; Docker `:8000` often lacks tmp packet / media).

## How to start the board

From repo root:

```bash
cd apps/storefront
FURNITURE_REPO_ROOT=/Users/leonidmbp/Documents/projects/furniture-commerce npx next dev --port 3004
```

Persistent dev (recommended on macOS — survives Cursor session end):

```bash
cd apps/storefront
yarn dev:ww-matrix-board:open      # opens Terminal.app + daemon
# or
yarn dev:ww-matrix-board:daemon    # from your own terminal
yarn dev:ww-matrix-board:status    # check running + HTTP
yarn dev:ww-matrix-board:stop      # stop
```

Requires `FURNITURE_REPO_ROOT` pointing at repo with:

- `tmp/willie-winkie-flow-a-matrix-template/vv-painting-sku-matrix-filled.csv`
- `tmp/legacy-site-media-product-apply-dry-run-latest/affected-handles.json` (media filenames)

## Media / static notes

- **Thumbnails in matrix board:** same-origin QA proxy  
  `/qa/willie-winkie-flow-a-matrix-board/api/preview?path=/static/products/...`
- Proxy reads from disk (`apps/backend/static/products/...`) when `FURNITURE_REPO_ROOT` is set; falls back to `localhost:9000`.
- **Open image in new tab:** direct `http://localhost:9000/static/products/...` (backend static must be up for that link).

## Flow A operator status (28 handles)

| Item | Status |
|------|--------|
| Operator matrix approved | **28/28** |
| `medusa_product_type` | CONFIGURABLE (28/28) |
| `variant_strategy` | configurable_tiers (28/28) |
| `status_draft_or_published` | draft (28/28) |
| Workbook mapping | exact **28/28** |
| Launch mode | **request_quote** (Launch A) |
| Collection context | Kids / Детская / Woodright Kids |
| Material tiers | `solid_full`, `solid_front_ldsp_body` |
| Tier prices in matrix | **TODO / blank** — accepted for Launch A (no fake prices) |
| CO-02-1 / AM-02-1 | **absent** (verified) |
| Seed / ingest / DB / product-media | **not run** |

See: `matrix/operator-approval-summary.json`, `launch-a/launch-a-request-mode-policy.json`

## Launch-blocking vs post-launch

### Launch A blockers (must gate separately)

1. **Scoped ingest gate** — `ingest-gate/` artifacts; whitelist + dry-run plan
2. **Scoped ingest** — import only 28 whitelisted handles
3. **Product-media apply** — only after products exist in Medusa
4. **Buyer-facing request flow** — PDP CTA, form/checkout-as-request, UI copy audit

### Post-launch (not Launch A blockers)

- Full material tier variants with explicit prices in Medusa
- Online payment / checkout capture
- Orphan P0 processing
- CO-02-1
- Broad seed / full catalog ingestion
- `data/normalized/**` writes without separate gate

## Exact next steps (new Cursor account)

1. Read `ingest-gate/ready-scope-summary.md` + `flow-a-ingest-whitelist.json`
2. Run scoped ingest **gate** (dry-run only until approved)
3. Scoped ingest (28 products only)
4. Product-media apply scoped to imported handles only
5. Buyer-facing UI/request flow audit using `launch-a/launch-a-ui-copy.md`

## Forbidden actions (unless explicitly gated)

- No full seed
- No broad product-media apply
- No orphan P0 processing
- No CO-02-1
- No `data/normalized/**` mutation
- No DB mutation without operator approval
- No secrets in commits (no `.env.local`, no DB dumps)

## localStorage warning

**Do not rely on browser localStorage.** Matrix board state can be lost when switching browser, profile, or Cursor account.

Before closing a session:

1. **Save filled CSV** on matrix board
2. **Copy JSON** / **Download JSON** / **Download CSV**
3. Treat `tmp/willie-winkie-flow-a-matrix-template/vv-painting-sku-matrix-filled.csv` as source of truth after save

This handoff folder contains a **snapshot** at commit time; re-save from board after further edits.

## Preserved artifacts in this folder

| Subfolder | Contents |
|-----------|----------|
| `matrix/` | Filled CSV, operator approval summary, readiness check |
| `launch-a/` | Product draft, request-mode policy, import readiness, UI copy |
| `ingest-gate/` | Whitelist, ingest command/plan, post-ingest media plan, DB audit snapshot |
| `artifact-manifest.json` | Machine-readable index + sha256 |

## Tmp artifacts still not git-tracked

Large or operational paths remain in `tmp/` — see `artifact-manifest.json` `source_tmp_path` entries:

- `tmp/willie-winkie-flow-a-matrix-template/` (live matrix + scripts)
- `tmp/willie-winkie-flow-a-launch-a-draft/`
- `tmp/launch-a-ingest-gate/`
- `tmp/willie-winkie-flow-a-business-gate-packet/` (legacy)
- `apps/backend/static/products/willie-winkie/` (gitignored static media)
- Proof folders under `tmp/*-proof/`

## Board source commits (reference)

```
9a0574e fix(qa): support Willie Winkie material price tiers
aea0eac fix(qa): show media previews in Willie Winkie matrix board
be9f155 fix(qa): add safe bulk workbook candidate fill
7904172 fix(qa): use browser-safe media URLs in Willie Winkie matrix board
1f08ff6 fix(qa): add workbook candidates to Willie Winkie matrix board
2e1840d fix(qa): make Willie Winkie matrix board row-focused
74c6667 feat(qa): add Willie Winkie Flow A matrix board
```

Path: `apps/storefront/src/app/qa/willie-winkie-flow-a-matrix-board/`

## Uncommitted work at handoff (separate review)

Not included in this docs commit:

- `apps/storefront/package.json` — `dev:ww-matrix-board:*` scripts
- `apps/storefront/scripts/dev-ww-matrix-board-*.sh` — persistent dev helpers
- Unrelated dirty `apps/backend/**` (not part of Flow A handoff)
