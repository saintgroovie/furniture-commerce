# Gallery return-to-main — RCA & anti-regression

**Status:** 2026-07-14 (hotfixed; split contract locked).  
**Audience:** Cursor Agent / Codex / ChatGPT.  
**Do not treat older Oliver lesson #11 / Provence P2 wording as license to put main on every PDP strip.**

---

## Timeline (causal chain)

| Step | What happened |
|------|----------------|
| T0 | Card + PDP share `ProductThumbCarousel`, but **hero UX differs**: card hero = `Link`; PDP hero = large image / lightbox. |
| T1 | Historical “fix duplicate”: PDP dropped main from strip (`buildPdpThumbStripUrls`). Correct for PDP; wrong if copied to cards. |
| T2 | Cards lost return-to-main when strip became extras-only (or main dropped by probe). |
| T3 | Bad unification: **main-first on all PDP** + `showThumbRow = visibleStrip.length > 1` everywhere. |
| T4 | Operator impact: **duplicates** (hero = first thumb) and **missing rails** (1-length extras-only strip hidden; near-dup → only main → rail off). |
| T5 | Hotfix: restore **split contract**; encode in rule + fidelity + operator docs; `yarn build:qa`. |

---

## Symptom A — cannot return to main (card)

After picking an extra thumb, no way back: hero is not a reset control; strip had no main thumb.

## Symptom B — regression from bad fix (site-wide)

- PDP: same photo in hero and first thumb (“дубликаты”).
- Card/PDP: gallery rail missing (“фото пропали”).

---

## Root causes

| ID | Cause | Mechanism |
|----|--------|-----------|
| R1 | False equivalence | “Hero also appears as thumb” ≠ media duplicate |
| R2 | One policy for two surfaces | Card needs main thumb; PDP must not prepend hero |
| R3 | Wrong rail gate | `visibleStrip.length > 1` on **extras-only** PDP hides 2-photo SKUs (strip length 1) |
| R4 | Near-dup + main-first PDP | Collapse leaves `[main]` → gate hides rail |
| R5 | Stale QA `:3002` | `next start` / `.next-build` without `yarn build:qa` |
| R6 | Doc/script drift | Lessons and smokes taught opposite contracts; agents reintroduced the wrong one |

---

## Canon (locked)

| Surface | Strip | Rail visible when | Return-to-main |
|---------|-------|-------------------|----------------|
| Catalog **card** | `buildGalleryStripUrls` (main first) | ≥ 1 thumb (`shouldShowBuyerGalleryRail`) | Click main thumb |
| **PDP** core / generic | `buildPdpThumbStripUrls` (extras only); single-photo → main via `resolveBuyerGalleryThumbStrip` | ≥ 1 thumb | Re-click active extra; lightbox |
| **Oliver PDP** | Pair → Gallery; else PdpThumb (+ single-photo main fallback) | ≥ 1 thumb | same; pair may show main |

Force-keep main in `visibleStrip` **only if** it was a strip candidate.

True duplicate = same URL twice in strip, or evidence near-dup → fix **media**, not strip omission on cards.

After gallery source edits: **`yarn build:qa`** before claiming `:3002` OK.

---

## Production call sites

| File | Role |
|------|------|
| `product-card-media-gallery-core.tsx` | `layout==="pdp"` → PdpThumb; else Gallery |
| `product-pdp-media-switcher.tsx` | PdpThumb + photo-set rail |
| `oliver-pdp-thumb-strip.ts` | pair exception only |
| `oliver-pdp-media-switcher.tsx` | Oliver PDP consumer |

---

## Anti-regression controls

| Control | Path |
|---------|------|
| Cursor rule (glob) | `.cursor/rules/gallery-return-to-main.mdc` |
| Helper fidelity | `catalog-card-gallery-dedupe.fidelity.test.ts` |
| Source + rail-gate fidelity | `gallery-strip-buyer-contract.fidelity.test.ts` |
| Photo-set fidelity | `pdp-gallery-photo-set.fidelity.test.ts` |
| Package script | `apps/storefront`: `yarn test:gallery-contract` |
| Operator pointers | Oliver lesson #11; Provence PDP thumb + P2; `docs/ai/AI_CONTEXT.md` |

### Agent / Codex stop conditions

Refuse / request-changes if a PR:

1. Uses `buildGalleryStripUrls` as default for all PDP paths  
2. Gates PDP rail with `visibleStrip.length > 1` without `buildPdpGalleryPhotoSet`  
3. Removes main from **card** strips to “fix duplicate”  
4. Claims `:3002` pass without rebuild after strip edits  

---

## Verification commands

```bash
cd apps/storefront
yarn test:gallery-contract
# after UI edits that affect strip/gallery:
yarn build:qa
yarn check:landing-css
```

Mandatory for gallery strip PRs: `yarn test:gallery-contract` must pass before claim of done / commit-ready.