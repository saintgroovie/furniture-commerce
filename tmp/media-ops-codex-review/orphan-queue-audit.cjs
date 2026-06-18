#!/usr/bin/env node

const fs = require("fs")
const path = require("path")

const repoRoot = path.resolve(__dirname, "../..")
const auditDir = path.join(repoRoot, "tmp/source-media-completeness-audit-full-legacy-cache")
const outDir = path.join(repoRoot, "tmp/media-ops-codex-review")

const inputs = {
  queue: path.join(auditDir, "source-orphan-priority-queue.json"),
  manifest: path.join(auditDir, "all-source-media-manifest.json"),
  seed: path.join(repoRoot, "data/normalized/seed-products.json"),
  inventory: path.join(repoRoot, "data/normalized/legacy-media-inventory.json"),
  workbook: path.join(repoRoot, "data/raw/workbook/parsed-sheets.json"),
  legacyProducts: path.join(repoRoot, "data/raw/legacy/legacy-products.json"),
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"))
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

function countBy(rows, getKey) {
  const out = {}
  for (const row of rows) {
    const key = String(getKey(row) ?? "(missing)")
    out[key] = (out[key] ?? 0) + 1
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])))
}

function groupBy(rows, getKey) {
  const out = new Map()
  for (const row of rows) {
    const key = getKey(row)
    if (key == null || key === "") continue
    const list = out.get(key) ?? []
    list.push(row)
    out.set(key, list)
  }
  return out
}

function normalizeBasenameForDedupe(filename) {
  let b = String(filename || "").replace(/\\/g, "/").split("/").pop().toLowerCase()
  b = b.replace(/\.(jpe?g|png|webp|gif|avif)$/i, "")
  b = b.replace(/(\s*\(\d+\)|[-_\s]+(copy|копия)(?=$|[-_.\s])|[-_](\d+)(?=\.))/gi, "")
  b = b.replace(/[-_]+/g, "-").replace(/^-+|-+$/g, "")
  return b
}

function monchelseaJoinKey(code) {
  if (!code || !String(code).trim()) return null
  const c = String(code).trim()
  if (!/^(MNm|MNM|MN)-/i.test(c)) return c.toUpperCase()
  return c.replace(/^MNm-/i, "MN-").replace(/^MNM-/i, "MN-").toUpperCase()
}

function joinKeyVariants(code) {
  const jk = monchelseaJoinKey(code)
  if (!jk) return []
  const out = new Set([jk])
  if (jk.startsWith("MN-")) {
    const tail = jk.slice(3)
    out.add(`MNm-${tail}`)
    out.add(`MNM-${tail}`)
  }
  return Array.from(out)
}

function normalizeProductCodeForLookup(code) {
  if (!code) return ""
  return monchelseaJoinKey(code) || String(code).trim().toLowerCase()
}

function rawCodeKey(code) {
  return String(code || "").trim().toLowerCase()
}

function basenameFromUrl(url) {
  const clean = String(url || "").split("?")[0]
  try {
    return decodeURIComponent(clean.split("/").pop() || "")
  } catch {
    return clean.split("/").pop() || ""
  }
}

function compactRow(row) {
  return {
    source_id: row.source_id,
    source_kind: row.source_kind,
    basename: row.basename,
    source_url: row.source_url ?? null,
    source_path: row.source_path ?? null,
    local_cache_path: row.local_cache_path ?? null,
    sku_guess: row.sku_guess ?? null,
    handle_guess: row.handle_guess ?? null,
    resolved_handle: row.resolved_handle ?? null,
    resolved_collection: row.resolved_collection ?? null,
    classification_status: row.classification_status,
    priority_tier: row.priority_tier,
    priority_score: row.priority_score,
    priority_reasons: row.priority_reasons ?? [],
    triage_bucket: row.triage_bucket,
  }
}

function pct(n, d) {
  if (!d) return 0
  return Number(((n / d) * 100).toFixed(2))
}

function topGroups(map, options = {}) {
  const min = options.min ?? 2
  const limit = options.limit ?? 50
  const sample = options.sample ?? 12
  const shape = []
  for (const [key, rows] of map.entries()) {
    if (rows.length < min) continue
    shape.push({
      key,
      count: rows.length,
      source_kind_counts: countBy(rows, (r) => r.source_kind),
      priority_tier_counts: countBy(rows, (r) => r.priority_tier),
      classification_status_counts: countBy(rows, (r) => r.classification_status),
      rows: rows.slice(0, sample).map(compactRow),
    })
  }
  return shape.sort((a, b) => b.count - a.count || String(a.key).localeCompare(String(b.key))).slice(0, limit)
}

function setAddIndex(map, key, value) {
  if (!key) return
  const list = map.get(key) ?? []
  list.push(value)
  map.set(key, list)
}

fs.mkdirSync(outDir, { recursive: true })

const queueRaw = readJson(inputs.queue)
const manifestRaw = readJson(inputs.manifest)
const seedProducts = readJson(inputs.seed)
const inventoryRaw = readJson(inputs.inventory)
const workbookRows = readJson(inputs.workbook)
const legacyProducts = readJson(inputs.legacyProducts)

const manifestById = new Map((manifestRaw.items || []).map((item) => [item.source_id, item]))
const queueRows = queueRaw.full_queue || []

const seedByCode = new Map()
const seedByRawCode = new Map()
const seedByHandle = new Map()
for (const p of seedProducts) {
  if (p.product_code_normalized && p.medusa_product_handle) {
    const record = {
      code: p.product_code_normalized,
      handle: String(p.medusa_product_handle).toLowerCase(),
      collection: String(p.medusa_collection_handle || "").toLowerCase() || null,
      title: p.medusa_product_title || p.canonical_name || null,
    }
    seedByRawCode.set(rawCodeKey(p.product_code_normalized), record)
    seedByCode.set(normalizeProductCodeForLookup(p.product_code_normalized), record)
    for (const variant of joinKeyVariants(p.product_code_normalized)) {
      seedByCode.set(normalizeProductCodeForLookup(variant), record)
    }
    seedByHandle.set(record.handle, record)
  }
}

const workbookByCode = new Map()
const workbookByRawCode = new Map()
for (const row of workbookRows) {
  if (!row.product_code_normalized) continue
  const record = {
    code: row.product_code_normalized,
    collection: row.collection_name_normalized || null,
    title: row.product_name_canonical || row.product_name_raw || null,
    source_sheet: row.source_sheet || null,
  }
  setAddIndex(workbookByRawCode, rawCodeKey(row.product_code_normalized), record)
  setAddIndex(workbookByCode, normalizeProductCodeForLookup(row.product_code_normalized), record)
  for (const variant of joinKeyVariants(row.product_code_normalized)) {
    setAddIndex(workbookByCode, normalizeProductCodeForLookup(variant), record)
  }
}

const inventoryBySku = new Map()
const inventoryByRawSku = new Map()
const inventoryByHandle = new Map()
const inventoryByExactBasename = new Map()
const inventoryByNormBasename = new Map()
for (const item of inventoryRaw.items || []) {
  if (item.sku_hint) {
    setAddIndex(inventoryByRawSku, rawCodeKey(item.sku_hint), item)
    setAddIndex(inventoryBySku, normalizeProductCodeForLookup(item.sku_hint), item)
    for (const variant of joinKeyVariants(item.sku_hint)) {
      setAddIndex(inventoryBySku, normalizeProductCodeForLookup(variant), item)
    }
  }
  if (item.handle_hint) setAddIndex(inventoryByHandle, String(item.handle_hint).toLowerCase(), item)
  if (item.filename) {
    setAddIndex(inventoryByExactBasename, String(item.filename).toLowerCase(), item)
    setAddIndex(inventoryByNormBasename, normalizeBasenameForDedupe(item.filename), item)
  }
}

const legacyCodeRows = []
for (const lp of legacyProducts) {
  const code = lp.product_code_raw || lp.product_code_from_image
  if (!code) continue
  legacyCodeRows.push({
    code,
    collection: lp.collection_hint || null,
    title: lp.product_title_raw || null,
    page_url: lp.page_url || null,
  })
}
const legacyByCode = new Map()
for (const row of legacyCodeRows) {
  setAddIndex(legacyByCode, normalizeProductCodeForLookup(row.code), row)
  for (const variant of joinKeyVariants(row.code)) {
    setAddIndex(legacyByCode, normalizeProductCodeForLookup(variant), row)
  }
}

function resolveSeed(sku) {
  if (!sku) return null
  const raw = seedByRawCode.get(rawCodeKey(sku))
  if (raw) return { ...raw, match_kind: "raw" }
  const norm = normalizeProductCodeForLookup(sku)
  if (seedByCode.has(norm)) return { ...seedByCode.get(norm), match_kind: "normalized" }
  for (const variant of joinKeyVariants(sku)) {
    const hit = seedByCode.get(normalizeProductCodeForLookup(variant))
    if (hit) return { ...hit, match_kind: "alias_variant" }
  }
  return null
}

function hasCrossSkuRisk(row) {
  return row.classification_status === "blocked_cross_sku" || (row.priority_reasons || []).some((r) => /cross_sku|possible_cross_sku/i.test(r))
}

function isGateCollection(collection) {
  return ["oxford", "monchelsea", "willie-winkie"].includes(String(collection || "").toLowerCase())
}

function isOperableCollection(collection) {
  return ["country-london-paris", "oliver", "provence"].includes(String(collection || "").toLowerCase())
}

const mergedRows = queueRows.map((q) => {
  const m = manifestById.get(q.source_id) || {}
  const sku = m.sku_guess ?? q.sku_guess ?? null
  const seedHit = resolveSeed(sku)
  const handleGuess = m.handle_guess ?? q.handle_guess ?? null
  const handleHit = handleGuess ? seedByHandle.get(String(handleGuess).toLowerCase()) : null
  const resolvedHandle = seedHit?.handle ?? handleHit?.handle ?? null
  const resolvedCollection = seedHit?.collection ?? handleHit?.collection ?? m.collection_guess ?? null
  const basename = m.basename ?? q.basename ?? basenameFromUrl(m.source_url ?? q.source_url)
  const exactInvMatches = inventoryByExactBasename.get(String(basename).toLowerCase()) || []
  const normInvMatches = inventoryByNormBasename.get(normalizeBasenameForDedupe(basename)) || []
  const invSkuMatches = sku ? inventoryBySku.get(normalizeProductCodeForLookup(sku)) || [] : []
  const workbookMatches = sku ? workbookByCode.get(normalizeProductCodeForLookup(sku)) || [] : []
  const legacyMatches = sku ? legacyByCode.get(normalizeProductCodeForLookup(sku)) || [] : []
  return {
    ...q,
    ...m,
    source_id: q.source_id,
    source_kind: q.source_kind,
    basename,
    source_url: m.source_url ?? q.source_url ?? null,
    source_path: m.source_path ?? q.source_path ?? null,
    local_cache_path: m.local_cache_path ?? null,
    sku_guess: sku,
    handle_guess: handleGuess,
    classification_status: m.classification_status ?? q.classification_status,
    priority_tier: q.priority_tier,
    priority_score: q.priority_score,
    priority_reasons: q.priority_reasons || [],
    seed_hit: seedHit,
    resolved_handle: resolvedHandle,
    resolved_collection: resolvedCollection,
    workbook_match_count: workbookMatches.length,
    inventory_sku_match_count: invSkuMatches.length,
    legacy_product_match_count: legacyMatches.length,
    inventory_basename_match_count: new Set([...exactInvMatches, ...normInvMatches].map((x) => x.id)).size,
    cross_sku_risk: hasCrossSkuRisk({ ...q, classification_status: m.classification_status ?? q.classification_status }),
  }
})

for (const row of mergedRows) {
  const duplicateEvidence = row.inventory_basename_match_count > 0
  if (duplicateEvidence) {
    row.triage_bucket = "duplicate_can_merge"
  } else if (isGateCollection(row.resolved_collection)) {
    row.triage_bucket = "blocked_by_collection_gate"
  } else if (row.resolved_handle && !row.cross_sku_risk && isOperableCollection(row.resolved_collection)) {
    row.triage_bucket = "auto_routeable"
  } else if (row.priority_tier === "P3_low_noise_or_ambiguous" && !row.sku_guess && row.priority_score <= 0) {
    row.triage_bucket = "orphan_noise"
  } else if (row.classification_status === "needs_manual_mapping" || !row.resolved_handle) {
    row.triage_bucket = "needs_manual_mapping"
  } else {
    row.triage_bucket = "needs_manual_mapping"
  }
}

const sourceUrlDuplicates = topGroups(groupBy(mergedRows, (r) => r.source_url), { limit: 100 })
const basenameAcrossSourceKind = topGroups(
  new Map(
    Array.from(groupBy(mergedRows, (r) => String(r.basename || "").toLowerCase()).entries()).filter(([, rows]) => new Set(rows.map((r) => r.source_kind)).size > 1)
  ),
  { limit: 100 }
)
const normalizedBasenameGroups = topGroups(groupBy(mergedRows, (r) => normalizeBasenameForDedupe(r.basename)), { limit: 100 })
const skuClusters = topGroups(groupBy(mergedRows, (r) => r.sku_guess && normalizeProductCodeForLookup(r.sku_guess)), { limit: 100, min: 3 })
const legacyYandexOverlapByBasename = topGroups(
  new Map(
    Array.from(groupBy(mergedRows, (r) => String(r.basename || "").toLowerCase()).entries()).filter(([, rows]) => {
      const kinds = new Set(rows.map((r) => r.source_kind))
      return kinds.has("legacy_site") && kinds.has("yandex_public")
    })
  ),
  { limit: 100 }
)
const legacyYandexOverlapBySku = topGroups(
  new Map(
    Array.from(groupBy(mergedRows, (r) => r.sku_guess && normalizeProductCodeForLookup(r.sku_guess)).entries()).filter(([, rows]) => {
      const kinds = new Set(rows.map((r) => r.source_kind))
      return kinds.has("legacy_site") && kinds.has("yandex_public")
    })
  ),
  { limit: 100 }
)

const exactDuplicateSourceUrlRows = sourceUrlDuplicates.reduce((sum, g) => sum + g.count, 0)
const duplicateCanMergeRows = mergedRows.filter((r) => r.triage_bucket === "duplicate_can_merge")
const crossSkuRiskRows = mergedRows.filter((r) => r.cross_sku_risk)
const p0NoSkuRows = mergedRows.filter((r) => r.priority_tier === "P0_review_first" && !r.sku_guess)
const yandexNoCacheRows = mergedRows.filter((r) => r.source_kind === "yandex_public" && !r.local_cache_path)

const rowsWithSku = mergedRows.filter((r) => r.sku_guess)
const rowsMissingSku = mergedRows.filter((r) => !r.sku_guess)
const seedMatched = rowsWithSku.filter((r) => r.seed_hit)
const seedRawMatched = rowsWithSku.filter((r) => r.seed_hit?.match_kind === "raw")
const inventorySkuMatched = rowsWithSku.filter((r) => r.inventory_sku_match_count > 0)
const workbookMatched = rowsWithSku.filter((r) => r.workbook_match_count > 0)
const legacyProductMatched = rowsWithSku.filter((r) => r.legacy_product_match_count > 0)
const handleMismatches = mergedRows.filter((r) => r.handle_guess && r.resolved_handle && String(r.handle_guess).toLowerCase() !== r.resolved_handle)

const monchelseaRows = rowsWithSku.filter((r) => /^(mnm|mn)-/i.test(r.sku_guess))
const monchelseaAliasResolved = monchelseaRows.filter((r) => r.seed_hit && r.seed_hit.match_kind !== "raw")
const monchelseaUnresolved = monchelseaRows.filter((r) => !r.seed_hit)
const monchelseaRawMissAliasHit = monchelseaRows.filter((r) => !seedByRawCode.has(rawCodeKey(r.sku_guess)) && Boolean(resolveSeed(r.sku_guess)))

const triageBuckets = {}
for (const [bucket, rows] of groupBy(mergedRows, (r) => r.triage_bucket).entries()) {
  const sorted = rows.slice().sort((a, b) => b.priority_score - a.priority_score || String(a.basename).localeCompare(String(b.basename)))
  triageBuckets[bucket] = {
    count: rows.length,
    percent_of_queue: pct(rows.length, mergedRows.length),
    by_priority_tier: countBy(rows, (r) => r.priority_tier),
    by_source_kind: countBy(rows, (r) => r.source_kind),
    top_20: sorted.slice(0, 20).map(compactRow),
  }
}

const stats = {
  generated_at: new Date().toISOString(),
  inputs,
  queue: {
    total_rows: mergedRows.length,
    declared_total_orphan_and_manual: queueRaw.total_orphan_and_manual ?? null,
    by_priority_tier: countBy(mergedRows, (r) => r.priority_tier),
    by_source_kind: countBy(mergedRows, (r) => r.source_kind),
    by_classification_status: countBy(mergedRows, (r) => r.classification_status),
    by_collection_guess: countBy(mergedRows, (r) => r.resolved_collection || r.collection_guess || "(missing)"),
  },
  sku_article_correspondence: {
    sku_present: rowsWithSku.length,
    sku_missing: rowsMissingSku.length,
    sku_present_percent: pct(rowsWithSku.length, mergedRows.length),
    sku_missing_by_tier: countBy(rowsMissingSku, (r) => r.priority_tier),
    sku_present_by_tier: countBy(rowsWithSku, (r) => r.priority_tier),
    seed_product_code_match_count: seedMatched.length,
    seed_product_code_match_rate_of_sku_rows: pct(seedMatched.length, rowsWithSku.length),
    seed_raw_match_count: seedRawMatched.length,
    seed_alias_or_normalized_match_count: seedMatched.length - seedRawMatched.length,
    legacy_media_inventory_sku_match_count: inventorySkuMatched.length,
    legacy_media_inventory_sku_match_rate_of_sku_rows: pct(inventorySkuMatched.length, rowsWithSku.length),
    workbook_product_code_match_count: workbookMatched.length,
    workbook_product_code_match_rate_of_sku_rows: pct(workbookMatched.length, rowsWithSku.length),
    legacy_products_code_match_count: legacyProductMatched.length,
    legacy_products_code_match_rate_of_sku_rows: pct(legacyProductMatched.length, rowsWithSku.length),
    handle_guess_mismatch_count: handleMismatches.length,
    monchelsea: {
      rows_with_mn_family_sku: monchelseaRows.length,
      alias_resolved_count: monchelseaAliasResolved.length,
      raw_miss_alias_hit_count: monchelseaRawMissAliasHit.length,
      unresolved_count: monchelseaUnresolved.length,
    },
  },
  duplicates: {
    exact_duplicate_source_url_group_count: sourceUrlDuplicates.length,
    exact_duplicate_source_url_row_count: exactDuplicateSourceUrlRows,
    duplicate_basename_across_source_kind_group_count: basenameAcrossSourceKind.length,
    normalized_basename_duplicate_group_count: normalizedBasenameGroups.length,
    sku_cluster_size_3_plus_count: skuClusters.length,
    legacy_yandex_overlap_basename_group_count: legacyYandexOverlapByBasename.length,
    legacy_yandex_overlap_sku_group_count: legacyYandexOverlapBySku.length,
    duplicate_can_merge_rows: duplicateCanMergeRows.length,
  },
  risk_flags: {
    cross_sku_priority_reason_count: crossSkuRiskRows.length,
    p0_items_without_sku_guess_count: p0NoSkuRows.length,
    yandex_public_without_local_cache_path_count: yandexNoCacheRows.length,
  },
  triage: {
    by_bucket: Object.fromEntries(Object.entries(triageBuckets).map(([k, v]) => [k, v.count])),
    auto_routeable_percent: pct(triageBuckets.auto_routeable?.count ?? 0, mergedRows.length),
    manual_or_blocked_percent: pct(
      (triageBuckets.needs_manual_mapping?.count ?? 0) + (triageBuckets.blocked_by_collection_gate?.count ?? 0),
      mergedRows.length
    ),
  },
}

const duplicates = {
  generated_at: stats.generated_at,
  exact_duplicate_source_url: sourceUrlDuplicates,
  duplicate_basename_across_source_kind: basenameAcrossSourceKind,
  normalized_basename_duplicate_groups: normalizedBasenameGroups,
  same_sku_guess_clusters_size_3_plus: skuClusters,
  legacy_site_vs_yandex_public_overlap: {
    by_basename: legacyYandexOverlapByBasename,
    by_sku_guess: legacyYandexOverlapBySku,
  },
}

const skuMismatches = {
  generated_at: stats.generated_at,
  counts: stats.sku_article_correspondence,
  samples: {
    sku_not_in_seed_products: rowsWithSku.filter((r) => !r.seed_hit).slice(0, 50).map(compactRow),
    sku_not_in_legacy_media_inventory: rowsWithSku.filter((r) => r.inventory_sku_match_count === 0).slice(0, 50).map(compactRow),
    sku_not_in_workbook: rowsWithSku.filter((r) => r.workbook_match_count === 0).slice(0, 50).map(compactRow),
    handle_guess_differs_from_seed_resolution: handleMismatches.slice(0, 50).map(compactRow),
    monchelsea_alias_raw_miss_alias_hit: monchelseaRawMissAliasHit.slice(0, 50).map(compactRow),
    monchelsea_unresolved: monchelseaUnresolved.slice(0, 50).map(compactRow),
    cross_sku_risk: crossSkuRiskRows.slice(0, 50).map(compactRow),
    p0_without_sku_guess: p0NoSkuRows.slice(0, 50).map(compactRow),
    yandex_without_local_cache_path: yandexNoCacheRows.slice(0, 50).map(compactRow),
  },
}

const triage = {
  generated_at: stats.generated_at,
  buckets: triageBuckets,
}

const verdict = crossSkuRiskRows.length > 0 || yandexNoCacheRows.length > 0 || stats.triage.auto_routeable_percent < 10
  ? "approve-with-notes"
  : "approve"

const topActions = [
  `Route ${triageBuckets.auto_routeable?.count ?? 0} auto_routeable rows first; all have seed handles, no cross-SKU risk, and are in CLP/Oliver/Provence.`,
  `Review ${crossSkuRiskRows.length} cross-SKU risk rows before any assignment; keep them out of automated routing.`,
  `Treat ${duplicateCanMergeRows.length} rows with inventory basename evidence as duplicate_can_merge candidates.`,
  `Resolve ${triageBuckets.needs_manual_mapping?.count ?? 0} needs_manual_mapping rows by SKU/article lookup before assignment.`,
  `Do not auto-map ${triageBuckets.blocked_by_collection_gate?.count ?? 0} Oxford/Monchelsea/Willie Winkie gated rows until collection-specific QA gates clear.`,
  `Ignore or defer ${triageBuckets.orphan_noise?.count ?? 0} low-score P3 no-SKU rows unless a product owner requests broader recovery.`,
  `Backfill or re-download ${yandexNoCacheRows.length} yandex_public queue rows without local_cache_path before visual review.`,
  `Use the ${legacyYandexOverlapBySku.length} legacy/Yandex SKU overlap groups to merge review decisions across sources.`,
  `Investigate ${monchelseaUnresolved.length} unresolved MN/MNm/MNM alias rows; ${monchelseaAliasResolved.length} MN-family rows already resolve via alias rules.`,
  `Sample the largest SKU clusters before bulk action; high cluster sizes often mix gallery, color, and possible cross-SKU filenames.`,
]

const md = `# Orphan Queue Audit

- Generated: ${stats.generated_at}
- Verdict: **${verdict}**
- Queue rows audited: **${mergedRows.length}**
- Estimated auto-routeable: **${triageBuckets.auto_routeable?.count ?? 0} (${stats.triage.auto_routeable_percent}%)**
- Estimated manual or gated: **${(triageBuckets.needs_manual_mapping?.count ?? 0) + (triageBuckets.blocked_by_collection_gate?.count ?? 0)} (${stats.triage.manual_or_blocked_percent}%)**

## P0 Findings

- P0 rows: **${stats.queue.by_priority_tier.P0_review_first ?? 0}**
- P0 rows without sku_guess: **${p0NoSkuRows.length}**
- P0 cross-SKU risk rows: **${crossSkuRiskRows.filter((r) => r.priority_tier === "P0_review_first").length}**
- P0 duplicate_can_merge rows: **${duplicateCanMergeRows.filter((r) => r.priority_tier === "P0_review_first").length}**

## P1 Findings

- Exact duplicate source_url groups: **${sourceUrlDuplicates.length}** (${exactDuplicateSourceUrlRows} rows)
- Duplicate basename across source_kind groups: **${basenameAcrossSourceKind.length}**
- Legacy-site vs Yandex overlap by basename: **${legacyYandexOverlapByBasename.length}** groups
- Legacy-site vs Yandex overlap by sku_guess: **${legacyYandexOverlapBySku.length}** groups
- yandex_public queue rows without local_cache_path: **${yandexNoCacheRows.length}**

## P2 Findings

- Rows with sku_guess: **${rowsWithSku.length} (${pct(rowsWithSku.length, mergedRows.length)}%)**
- Seed product_code match rate among sku rows: **${seedMatched.length}/${rowsWithSku.length} (${pct(seedMatched.length, rowsWithSku.length)}%)**
- Legacy-media-inventory SKU match rate among sku rows: **${inventorySkuMatched.length}/${rowsWithSku.length} (${pct(inventorySkuMatched.length, rowsWithSku.length)}%)**
- Workbook product_code match rate among sku rows: **${workbookMatched.length}/${rowsWithSku.length} (${pct(workbookMatched.length, rowsWithSku.length)}%)**
- Handle guess mismatches after seed resolution: **${handleMismatches.length}**
- MN/MNm/MNM alias rows: **${monchelseaRows.length}**, alias-resolved: **${monchelseaAliasResolved.length}**, unresolved: **${monchelseaUnresolved.length}**

## P3 Findings

- P3 rows: **${stats.queue.by_priority_tier.P3_low_noise_or_ambiguous ?? 0}**
- P3 rows without sku_guess: **${rowsMissingSku.filter((r) => r.priority_tier === "P3_low_noise_or_ambiguous").length}**
- orphan_noise bucket: **${triageBuckets.orphan_noise?.count ?? 0}**

## Triage Buckets

| Bucket | Rows | Percent |
| --- | ---: | ---: |
${Object.entries(triageBuckets).sort((a, b) => b[1].count - a[1].count).map(([bucket, value]) => `| ${bucket} | ${value.count} | ${value.percent_of_queue}% |`).join("\n")}

## Top 10 Operator Actions

${topActions.map((x, i) => `${i + 1}. ${x}`).join("\n")}

## Review Artifacts

- Full stats: \`tmp/media-ops-codex-review/orphan-queue-audit-stats.json\`
- Duplicate groups: \`tmp/media-ops-codex-review/orphan-queue-duplicates.json\`
- SKU mismatches and risk samples: \`tmp/media-ops-codex-review/orphan-queue-sku-mismatches.json\`
- Triage buckets: \`tmp/media-ops-codex-review/orphan-queue-triage-buckets.json\`
- Rerunnable script: \`tmp/media-ops-codex-review/orphan-queue-audit.cjs\`

## Code Fixes

No P1 storefront or audit-logic code fix was applied. The audit ran as a read-only analysis over the generated queue and normalized source indexes.
`

writeJson(path.join(outDir, "orphan-queue-audit-stats.json"), stats)
writeJson(path.join(outDir, "orphan-queue-duplicates.json"), duplicates)
writeJson(path.join(outDir, "orphan-queue-sku-mismatches.json"), skuMismatches)
writeJson(path.join(outDir, "orphan-queue-triage-buckets.json"), triage)
fs.writeFileSync(path.join(outDir, "orphan-queue-audit.md"), md)

console.log(JSON.stringify({
  generated_at: stats.generated_at,
  total_rows: mergedRows.length,
  verdict,
  auto_routeable: triageBuckets.auto_routeable?.count ?? 0,
  auto_routeable_percent: stats.triage.auto_routeable_percent,
  manual_or_blocked_percent: stats.triage.manual_or_blocked_percent,
  cross_sku_risk: crossSkuRiskRows.length,
  yandex_without_local_cache_path: yandexNoCacheRows.length,
  outputs: [
    "tmp/media-ops-codex-review/orphan-queue-audit.cjs",
    "tmp/media-ops-codex-review/orphan-queue-audit-stats.json",
    "tmp/media-ops-codex-review/orphan-queue-duplicates.json",
    "tmp/media-ops-codex-review/orphan-queue-sku-mismatches.json",
    "tmp/media-ops-codex-review/orphan-queue-triage-buckets.json",
    "tmp/media-ops-codex-review/orphan-queue-audit.md",
  ],
}, null, 2))
