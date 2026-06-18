#!/usr/bin/env node
/* Offline audit for Media Ops / legacy board v2 gallery ordering policy. */
const fs = require("fs")
const path = require("path")

const ROOT = path.resolve(__dirname, "..", "..")
const OUT_DIR = __dirname

const ROLE_RANK = {
  front_3_4: 10,
  closed_front: 20,
  hero_front: 21,
  front_anfas: 22,
  interior: 30,
  detail: 40,
  scheme: 50,
  lifestyle: 90,
  unknown: 80,
}

const FRONT_ROLES = new Set(["closed_front", "hero_front", "front_anfas"])
const WHITE_BG_ROLES = new Set(["front_3_4", "closed_front", "hero_front", "front_anfas", "interior", "detail", "scheme"])
const ROLE_COVERAGE = ["front_3_4", "front", "interior", "detail", "scheme", "lifestyle"]
const TARGET_COLLECTIONS = new Set(["country-london-paris", "oliver", "provence"])

const SCHEME_RE = /схем|черт[её]ж|blueprint|schematic|dimension|technical[_\s-]?draw|line[\s-]?art|plan[_\s-]?view|spec[_\s-]?sheet|(?:^|[_\-.])draw(?:ing)?(?:[_\-.]|$)|pdf[_\s-]?crop|vector|wireframe/i
const INTERIOR_RE = /interior|inside|внутр|открыт|open(?:ed)?[\s_-]?(?:door|wardrobe)|doors?[\s_-]?open|shelf|shelves|полк|drawer[\s_-]?open|interior[_\s-]?view|visible[\s_-]?shelf|pole|стойк/i
const DETAIL_RE = /detail|close[\s_-]?up|крупн|(?:^|[^a-z])handle(?:[^a-z]|$)|(?:^|[^a-z])knob(?:[^a-z]|$)|(?:^|[^a-z])leg(?:[^a-z]|$)|texture|фурнит|hardware|material[\s_-]?sample|drawer[\s_-]?detail|hinge|фурнитур|(?:^|[^a-z])joint(?:[^a-z]|$)|enlarged|crop/i
const LIFESTYLE_RE = /lifestyle|staged|in[\s_-]?room|room[\s_-]?shot|комнат|ambiente|setting|bedroom|living[\s_-]?room|kids[\s_-]?room|_int_/i
const FRONT_RE = /front|frontal|фасад|фронт|fasad|анфас|anfas/i
const HERO_RE = /(?:^|[_\-.])(main|hero|primary|cover)(?:[_\-.]|$)/i
const CLOSED_RE = /closed|закрыт|doors?[\s_-]?closed/i
const OPEN_RE = /\bopen(?:ed)?\b|открыт/i
const ANGLE_3_4_RE = /(?:^|[-_.])iso(?:[-_.]|$)|[-_]iso[-_]?\d|3-4|3\/4|three[\s_-]?quarter|angle|angled|боков|side[\s_-]?view|perspective/i
const SECOND_FRONT_RE = /second[\s_-]?front|alt[\s_-]?front|front[\s_-]?2|[_\-.]i0?2(?:[_\-.]|$)|gallery[_\-.]?02|[_\-.]02(?:[_\-.]|$)|color_[a-z]+_02/i
const FIRST_EXTERNAL_RE = /[_\-.]i0?1(?:[_\-.]|$)|[_\-.]01(?:[_\-.]|$)|gallery[_\-.]?01|[_\-.]color_[a-z]+[_\-.]1(?:[_\-.]|$)|color_[a-z]+_01|[-_]iso[-_]?1(?:\.|[-_]|$)/i
const GALLERY_FIRST_RE = /gallery[_\-.]?01/i
const GALLERY_THIRD_RE = /[-_]gallery[_\-.]?0?3(?:\.|[-_]|$)/i
const INTERIOR_INDEX_RE = /[-_]i(?:3|[4-9])(?:\.|[-_]|$)/i
const KNOWN_WARDROBE_INTERIOR_RE = /(?:^|[-_])co-02-1-i3(?:\.|[-_]|$)/i

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"))
}

function pct(n, d) {
  return d ? Number(((n / d) * 100).toFixed(1)) : 0
}

function basename(s) {
  return String(s || "").split("/").pop() || String(s || "")
}

function hayFromInv(inv) {
  return [
    inv.filename,
    inv.source_path,
    inv.repo_relative_path,
    inv.url,
    inv.page_url,
    inv.source_type,
    inv.collection_hint,
  ].filter(Boolean).join(" ").toLowerCase()
}

function isWhiteBgSourceHint(inv) {
  const hay = `${inv.source_type || ""} ${inv.source_path || ""} ${inv.repo_relative_path || ""}`.toLowerCase()
  return /white[_\s-]?bg|disk[_\s-]?white|белом\s*фоне|фото\s*на\s*белом/i.test(hay) || /yandex\.?disk|yandex disk/i.test(hay)
}

function isInteriorSourceHint(hay) {
  return INTERIOR_RE.test(hay) || (OPEN_RE.test(hay) && !CLOSED_RE.test(hay) && !FRONT_RE.test(hay))
}

function isWardrobeOpenInteriorShot(inv) {
  const hay = hayFromInv(inv)
  if (KNOWN_WARDROBE_INTERIOR_RE.test(hay)) return true
  return INTERIOR_INDEX_RE.test(hay) && INTERIOR_RE.test(hay)
}

function isThreeQuarterSourceHint(hay) {
  return ANGLE_3_4_RE.test(hay) || /[-_]iso[-_]?\d/i.test(hay)
}

function classifyRole(inv) {
  const hay = hayFromInv(inv)
  const whiteBg = isWhiteBgSourceHint(inv)
  const isPdfLike = /\.pdf/i.test(hay) || String(inv.source_type || "").toLowerCase().includes("pdf")
  if (SCHEME_RE.test(hay) || isPdfLike) return "scheme"
  if (GALLERY_THIRD_RE.test(hay) && !isWardrobeOpenInteriorShot(inv)) return "front_3_4"
  if (/[-_]iso[-_]?\d/i.test(hay) && !isWardrobeOpenInteriorShot(inv)) return "front_3_4"
  if (isWardrobeOpenInteriorShot(inv)) return "interior"
  if (isInteriorSourceHint(hay) && !isThreeQuarterSourceHint(hay)) return "interior"
  if (DETAIL_RE.test(hay)) return "detail"
  if (LIFESTYLE_RE.test(hay) && !whiteBg) return "lifestyle"

  const hasFront = FRONT_RE.test(hay)
  const hasClosed = CLOSED_RE.test(hay)
  const hasOpen = OPEN_RE.test(hay)
  if (/[-_]i0?2(?:\.|[-_]|$)/i.test(hay) && !isWardrobeOpenInteriorShot(inv)) return "front_3_4"
  if (/[-_]i0?1(?:\.|[-_]|$)/i.test(hay) && !isWardrobeOpenInteriorShot(inv) && !isThreeQuarterSourceHint(hay)) return hasClosed && !hasOpen ? "closed_front" : "front_anfas"
  if (/color_[a-z]+_01/i.test(hay) && !isWardrobeOpenInteriorShot(inv)) return hasClosed && !hasOpen ? "closed_front" : "front_anfas"
  if (/color_[a-z]+_02/i.test(hay) && !isWardrobeOpenInteriorShot(inv)) return "front_3_4"

  const hasHero = HERO_RE.test(hay)
  const isSecond = SECOND_FRONT_RE.test(hay)
  const isFirstExternal = FIRST_EXTERNAL_RE.test(hay) && !INTERIOR_INDEX_RE.test(hay)
  const isGalleryFirst = GALLERY_FIRST_RE.test(hay)
  const is34 = isThreeQuarterSourceHint(hay)
  if (is34) return /анфас|anfas|straight|front[\s_-]?facing|ровн/i.test(hay) && !/angle|angled|iso|3-4|3\/4/i.test(hay) ? "front_anfas" : "front_3_4"
  if (hasFront) {
    if (hasClosed && !hasOpen) return "closed_front"
    if (hasOpen && !hasClosed) return "interior"
    if (hasHero || (whiteBg && isFirstExternal && !isSecond)) return "hero_front"
    return "front_anfas"
  }
  if (isSecond && !isThreeQuarterSourceHint(hay)) return "front_anfas"
  if (isFirstExternal && !isGalleryFirst) return hasClosed && !hasOpen ? "closed_front" : (whiteBg ? "hero_front" : "front_anfas")
  if (isGalleryFirst) return hasOpen && !hasClosed ? "interior" : "closed_front"
  if (SECOND_FRONT_RE.test(hay) && !isInteriorSourceHint(hay)) return "front_3_4"
  if (whiteBg && !hasOpen && !isInteriorSourceHint(hay) && !DETAIL_RE.test(hay)) return "unknown"
  return "unknown"
}

function invFromUrl(url, seed) {
  const file = basename(url)
  const rel = String(url || "").replace(/^https?:\/\/localhost:\d+\/static\//, "apps/backend/static/")
  return {
    id: file,
    filename: file,
    source_type: /static\/products/i.test(url) ? "backend_static" : "seed_url",
    source_path: rel,
    repo_relative_path: rel,
    url,
    collection_hint: seed.medusa_collection_handle || null,
    sku_hint: seed.medusa_product_handle || seed.product_code_normalized || null,
    handle_hint: seed.medusa_product_handle || null,
  }
}

function roleBucket(role) {
  return FRONT_ROLES.has(role) ? "front" : role
}

function rank(role) {
  return ROLE_RANK[role] ?? 99
}

function auditSequence(handle, collection, source, entries) {
  const rows = entries.map((entry, index) => {
    const role = classifyRole(entry.inv)
    return {
      index,
      id: entry.id || entry.inv.id,
      file: entry.inv.filename,
      role,
      role_bucket: roleBucket(role),
      rank: rank(role),
      white_bg_source_hint: isWhiteBgSourceHint(entry.inv),
    }
  })
  const issues = []
  let last = -1
  let sawLifestyle = false
  for (const row of rows) {
    if (row.role === "lifestyle") sawLifestyle = true
    if (sawLifestyle && WHITE_BG_ROLES.has(row.role)) {
      issues.push({ severity: "P1", code: "white_bg_after_lifestyle", handle, collection, source, index: row.index, file: row.file, role: row.role })
    }
    if (row.rank < last) {
      issues.push({ severity: "P1", code: "gallery_role_order_violation", handle, collection, source, index: row.index, file: row.file, role: row.role })
    }
    last = Math.max(last, row.rank)
  }
  const idx34 = rows.findIndex((r) => r.role === "front_3_4")
  const idxFront = rows.findIndex((r) => FRONT_ROLES.has(r.role))
  if (idx34 >= 0 && idxFront >= 0 && idx34 > idxFront) {
    issues.push({ severity: "P1", code: "front_before_3_4", handle, collection, source, front_index: idxFront, front_3_4_index: idx34 })
  }
  return { rows, issues }
}

function addCoverage(stats, handle, collection, roles, source) {
  const buckets = new Set(roles.map(roleBucket))
  const okCanonicalLead = roles.length === 0 ? false : (() => {
    const compressed = roles.map((r) => FRONT_ROLES.has(r) ? "front" : r)
    const order = { front_3_4: 10, front: 20, interior: 30, detail: 40, scheme: 50, lifestyle: 90, unknown: 80 }
    let last = -1
    for (const r of compressed) {
      const v = order[r] ?? 99
      if (v < last) return false
      last = Math.max(last, v)
    }
    return true
  })()
  const rec = {
    handle,
    collection,
    source,
    image_count: roles.length,
    has_front_3_4: buckets.has("front_3_4"),
    has_front: buckets.has("front"),
    has_interior: buckets.has("interior"),
    has_detail: buckets.has("detail"),
    has_scheme: buckets.has("scheme"),
    has_lifestyle: buckets.has("lifestyle"),
    canonical_order_ok: okCanonicalLead,
  }
  stats.sku_coverage.push(rec)
}

function summarizeByCollection(skuCoverage, issues) {
  const by = new Map()
  for (const row of skuCoverage) {
    const k = row.collection || "unknown"
    if (!by.has(k)) by.set(k, { collection: k, sku_count: 0, role_coverage: {}, canonical_order_ok_count: 0, issue_counts: { P1: 0, P2: 0, P3: 0 }, top_issue_codes: {} })
    const dst = by.get(k)
    dst.sku_count++
    if (row.canonical_order_ok) dst.canonical_order_ok_count++
    for (const role of ROLE_COVERAGE) {
      const prop = `has_${role}`
      dst.role_coverage[role] = dst.role_coverage[role] || { count: 0, pct: 0 }
      if (row[prop]) dst.role_coverage[role].count++
    }
  }
  for (const issue of issues) {
    const k = issue.collection || "unknown"
    if (!by.has(k)) continue
    const dst = by.get(k)
    dst.issue_counts[issue.severity] = (dst.issue_counts[issue.severity] || 0) + 1
    dst.top_issue_codes[issue.code] = (dst.top_issue_codes[issue.code] || 0) + 1
  }
  for (const dst of by.values()) {
    dst.canonical_order_ok_pct = pct(dst.canonical_order_ok_count, dst.sku_count)
    for (const role of ROLE_COVERAGE) dst.role_coverage[role].pct = pct(dst.role_coverage[role].count, dst.sku_count)
    dst.top_issue_codes = Object.fromEntries(Object.entries(dst.top_issue_codes).sort((a, b) => b[1] - a[1]).slice(0, 8))
  }
  return [...by.values()].sort((a, b) => (b.issue_counts.P1 - a.issue_counts.P1) || a.collection.localeCompare(b.collection))
}

function writeSpec() {
  const spec = {
    version: "gallery-order-policy/v1",
    generated_at: new Date().toISOString(),
    grouping: ["collection", "sku", "color_variant"],
    color_variant_rules: {
      real_color_variants_only_for_color_tabs: true,
      unresolved_shared_bucket_key: "__needs_color__",
      unresolved_shared_bucket_label_ru: "Общие кадры",
      lifestyle_room_interior_shared_across_colors: true,
      shared_tail_roles: ["lifestyle"],
      borrowable_roles: ["interior", "detail", "lifestyle"],
      non_borrowable_external_roles: ["front_3_4", "closed_front", "hero_front", "front_anfas"],
    },
    white_background: {
      first: true,
      source_hint_fields: ["source_type", "source_path", "repo_relative_path"],
      positive_patterns: ["white_bg", "disk_white", "белом фоне", "фото на белом", "yandex disk"],
      note: "Current code uses source/path hints only, not pixel background detection.",
    },
    role_order: [
      { role: "front_3_4", rank: 10, label_ru: "3/4" },
      { role: "closed_front", rank: 20, label_ru: "фронт" },
      { role: "hero_front", rank: 21, label_ru: "фронт" },
      { role: "front_anfas", rank: 22, label_ru: "анфас" },
      { role: "interior", rank: 30, label_ru: "внутри / открытые двери" },
      { role: "detail", rank: 40, label_ru: "деталь" },
      { role: "scheme", rank: 50, label_ru: "схема" },
      { role: "unknown", rank: 80, label_ru: "неизвестно" },
      { role: "lifestyle", rank: 90, label_ru: "интерьер / lifestyle, общий хвост" }
    ],
    export_metadata: {
      operator_role_mapping: {
        front_3_4: "front_3_4",
        closed_front: "front",
        hero_front: "front",
        front_anfas: "front",
        lifestyle: "interior",
      },
      warning: "Mapping lifestyle to operator_role=interior in Medusa image metadata loses the open-doors vs room-interior distinction unless is_shared is also preserved."
    }
  }
  fs.writeFileSync(path.join(OUT_DIR, "gallery-order-policy-spec.json"), JSON.stringify(spec, null, 2) + "\n")
  return spec
}

function main() {
  const inventoryDoc = readJson("data/normalized/legacy-media-inventory.json")
  const inventory = inventoryDoc.items || []
  const invById = new Map(inventory.map((x) => [x.id, x]))
  const seedProducts = readJson("data/normalized/seed-products.json").filter((p) => TARGET_COLLECTIONS.has(p.medusa_collection_handle))
  const decisionsDoc = readJson("data/normalized/legacy-media-assignment-decisions.json")
  const decisions = decisionsDoc.products || []

  const stats = {
    generated_at: new Date().toISOString(),
    inputs: {
      legacy_media_inventory_items: inventory.length,
      seed_products: seedProducts.length,
      assignment_decision_products: decisions.length,
      local_storage_key: "furniture-legacy-media-assignment-v2board-state",
      local_storage_export_found: false,
    },
    sku_coverage: [],
    issues: [],
    sequence_samples: [],
  }

  for (const seed of seedProducts) {
    const handle = seed.medusa_product_handle
    const collection = seed.medusa_collection_handle
    const urls = [
      seed.thumbnail_url,
      ...(seed.image_urls || []),
      ...(seed.gallery_public_urls || []),
      ...(seed.images || []).map((x) => x && x.url),
    ].filter(Boolean)
    const seen = new Set()
    const entries = urls.filter((u) => !seen.has(u) && seen.add(u)).map((url) => ({ id: basename(url), inv: invFromUrl(url, seed) }))
    const audit = auditSequence(handle, collection, "seed-products", entries)
    stats.issues.push(...audit.issues)
    addCoverage(stats, handle, collection, audit.rows.map((r) => r.role), "seed-products")
    if (audit.issues.length) stats.sequence_samples.push({ handle, collection, source: "seed-products", rows: audit.rows.slice(0, 18), issues: audit.issues.slice(0, 8) })
  }

  for (const d of decisions) {
    if (!TARGET_COLLECTIONS.has(d.collection)) continue
    const ids = [d.primary_candidate, ...(d.gallery_candidates || [])].filter(Boolean)
    const entries = ids.map((id) => ({ id, inv: invById.get(id) })).filter((x) => x.inv)
    const audit = auditSequence(d.handle, d.collection, "legacy-media-assignment-decisions", entries)
    stats.issues.push(...audit.issues)
    addCoverage(stats, d.handle, d.collection, audit.rows.map((r) => r.role), "legacy-media-assignment-decisions")
  }

  const bySeverity = { P1: 0, P2: 0, P3: 0 }
  const byCode = {}
  for (const issue of stats.issues) {
    bySeverity[issue.severity] = (bySeverity[issue.severity] || 0) + 1
    byCode[issue.code] = (byCode[issue.code] || 0) + 1
  }
  const seedCoverage = stats.sku_coverage.filter((row) => row.source === "seed-products")
  const allSequenceCoverage = stats.sku_coverage
  const byCollection = summarizeByCollection(seedCoverage, stats.issues)
  stats.summary = {
    audited_sku_sequences: stats.sku_coverage.length,
    audited_unique_seed_skus: seedCoverage.length,
    total_issues: stats.issues.length,
    by_severity: bySeverity,
    by_code: Object.fromEntries(Object.entries(byCode).sort((a, b) => b[1] - a[1])),
    by_collection: byCollection,
    by_collection_sequence_volume: summarizeByCollection(allSequenceCoverage, stats.issues),
    top_collections_to_fix: byCollection.slice(0, 5).map((c) => ({
      collection: c.collection,
      P1: c.issue_counts.P1,
      canonical_order_ok_pct: c.canonical_order_ok_pct,
      missing_3_4_pct: Number((100 - c.role_coverage.front_3_4.pct).toFixed(1)),
      missing_interior_pct: Number((100 - c.role_coverage.interior.pct).toFixed(1)),
    })),
  }

  const spec = writeSpec()
  fs.writeFileSync(path.join(OUT_DIR, "gallery-order-audit-stats.json"), JSON.stringify(stats, null, 2) + "\n")
  fs.writeFileSync(path.join(OUT_DIR, "gallery-order-policy-analysis.md"), buildMarkdown(stats, spec), "utf8")
  console.log(`Wrote ${path.relative(ROOT, OUT_DIR)}/gallery-order-audit-stats.json`)
  console.log(`Audited ${stats.summary.audited_unique_seed_skus} seed SKUs / ${stats.summary.audited_sku_sequences} SKU sequences; P1=${stats.summary.by_severity.P1}, P2=${stats.summary.by_severity.P2}, P3=${stats.summary.by_severity.P3}`)
}

function buildMarkdown(stats) {
  const collRows = stats.summary.by_collection.map((c) =>
    `| ${c.collection} | ${c.sku_count} | ${c.issue_counts.P1} | ${c.canonical_order_ok_pct}% | ${c.role_coverage.front_3_4.pct}% | ${c.role_coverage.front.pct}% | ${c.role_coverage.interior.pct}% | ${c.role_coverage.detail.pct}% | ${c.role_coverage.scheme.pct}% | ${c.role_coverage.lifestyle.pct}% |`
  ).join("\n")
  const top = stats.summary.top_collections_to_fix.map((c, i) => `${i + 1}. ${c.collection}: P1=${c.P1}, order_ok=${c.canonical_order_ok_pct}%, missing_3_4=${c.missing_3_4_pct}%, missing_interior=${c.missing_interior_pct}%`).join("\n")
  return `# Gallery order policy analysis

Generated: ${stats.generated_at}

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

- Existing seed/assignment sequences have role-order violations at real-data scale. Most frequent codes: ${JSON.stringify(stats.summary.by_code)}.
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
${collRows}

## Top collections to fix

${top}

## Notes

- The coverage table is based on unique seed-products SKUs. P1 counts include both seed-products and readable assignment-decision sequences for CLP, Oliver, and Provence.
- The audit script is rerunnable: \`node tmp/media-ops-codex-review/run-gallery-order-audit.cjs\`.
- No clear P1 code edit was made because the rank constants already match policy; changing gallery_01/gallery_03 classification would be a data/legacy convention decision with broad blast radius.
`
}

main()
