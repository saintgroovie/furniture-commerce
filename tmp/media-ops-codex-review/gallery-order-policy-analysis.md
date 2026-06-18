# Gallery order policy analysis

Generated: 2026-06-18T21:49:55.616Z

## Verdict

VISUAL_ROLE_RANK and BUYER_ROLE_RANK match the canonical numeric order: 3/4 -> front -> open doors/interior -> detail -> scheme -> lifestyle tail. The main divergence is not the rank table; it is classification and data semantics around "interior" vs "lifestyle", source-hint-only white background detection, and v2 board shared bucket behavior.

No catalog, seed, normalized, or Medusa data was modified. This audit is offline and reads legacy-media-inventory, seed-products, and legacy-media-assignment-decisions.

## Policy to code map

- VISUAL_ROLE_RANK: front_3_4=10, front family=20..22, interior=30, detail=40, scheme=50, unknown=80, lifestyle=90.
- Buyer sort: duplicates the same ranks and extracts lifestyle into sharedTailUrls for finish_color_executions.
- v2 color variants: real color tabs are detected from filename tokens; __needs_color__ is a shared/common bucket, with UI copy saying + all galleries appends to every color.
- Gallery assignment: role slots include front_3_4, front_anfas, interior, detail, lifestyle, scheme. Non-main role assignment auto-adds to gallery.
- Media Ops shell: assign route embeds LegacyMediaBoardV2Client and exports the same v2 board JSON via bridge; persisted browser state key is furniture-legacy-media-assignment-v2board-state.

## Key gaps

### P1

- Existing seed/assignment sequences have role-order violations at real-data scale. Most frequent codes: {"gallery_role_order_violation":1266,"front_before_3_4":136}.
- "gallery_01" is classified as closed/front and "gallery_03" as 3/4, so existing CLP-style gallery_01, gallery_02, gallery_03 order often violates the canonical 3/4-first policy.
- The role label "interior" is overloaded: open doors / inside wardrobe should be white-bg rank 30, while room interior/lifestyle should be shared tail rank 90.

### P2

- White-background detection is source/path hint based, not pixel/image based. It recognizes yandex/disk/white_bg hints but can miss local static white backgrounds and can over-trust source type.
- __needs_color__ is a common bucket, not a real color; this matches the "shared tail" workflow but can also contain unresolved product shots that still need color assignment.
- toMedusaImages maps lifestyle to operator_role=interior and relies on is_shared=true to preserve tail semantics.

### P3

- Unknown is rank 80, before lifestyle. That is defensible for keeping uncertain product-like frames out of the lifestyle tail, but it means unknown room shots can appear before shared tail until manually classified.
- Primary eligibility excludes front_3_4 even though policy wants 3/4 first in gallery; main/thumbnail logic is intentionally separate and should stay explicit.

## Per-collection stats

| Collection | Seed SKUs | P1 | Order OK | 3/4 | Front | Open/interior | Detail | Scheme | Lifestyle |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| oliver | 66 | 882 | 13.6% | 47% | 92.4% | 0% | 0% | 0% | 0% |
| country-london-paris | 13 | 282 | 15.4% | 84.6% | 100% | 0% | 0% | 0% | 0% |
| provence | 29 | 238 | 37.9% | 24.1% | 72.4% | 0% | 0% | 0% | 0% |

## Top collections to fix

1. oliver: P1=882, order_ok=13.6%, missing_3_4=53%, missing_interior=100%
2. country-london-paris: P1=282, order_ok=15.4%, missing_3_4=15.4%, missing_interior=100%
3. provence: P1=238, order_ok=37.9%, missing_3_4=75.9%, missing_interior=100%

## Notes

- The coverage table is based on unique seed-products SKUs. P1 counts include both seed-products and readable assignment-decision sequences for CLP, Oliver, and Provence.
- The audit script is rerunnable: `node tmp/media-ops-codex-review/run-gallery-order-audit.cjs`.
- No clear P1 code edit was made because the rank constants already match policy; changing gallery_01/gallery_03 classification would be a data/legacy convention decision with broad blast radius.
