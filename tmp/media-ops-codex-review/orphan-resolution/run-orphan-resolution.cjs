#!/usr/bin/env node

const fs = require("fs")
const path = require("path")

const repoRoot = path.resolve(__dirname, "../../..")
const outDir = __dirname
const auditDir = path.join(repoRoot, "tmp/source-media-completeness-audit-full-legacy-cache")

const inputs = {
  queue: path.join(auditDir, "source-orphan-priority-queue.json"),
  manifest: path.join(auditDir, "all-source-media-manifest.json"),
  seed: path.join(repoRoot, "data/normalized/seed-products.json"),
  inventory: path.join(repoRoot, "data/normalized/legacy-media-inventory.json"),
  workbook: path.join(repoRoot, "data/raw/workbook/parsed-sheets.json"),
  legacyProducts: path.join(repoRoot, "data/raw/legacy/legacy-products.json"),
}

const OPERABLE_COLLECTIONS = new Set(["country-london-paris", "oliver", "provence"])
const GATED_COLLECTIONS = new Set(["oxford", "monchelsea", "willie-winkie"])

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"))
}

function writeJson(name, value) {
  fs.writeFileSync(path.join(outDir, name), `${JSON.stringify(value, null, 2)}\n`)
}

function writeText(name, value) {
  fs.writeFileSync(path.join(outDir, name), value)
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

function setAdd(map, key, value) {
  if (!key) return
  const list = map.get(key) ?? []
  list.push(value)
  map.set(key, list)
}

function pct(n, d) {
  return d ? Number(((n / d) * 100).toFixed(2)) : 0
}

function rawKey(code) {
  return String(code || "").trim().toLowerCase()
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

function normCode(code) {
  if (!code) return ""
  return monchelseaJoinKey(code) || String(code).trim().toLowerCase()
}

function normBase(filename) {
  let b = String(filename || "").replace(/\\/g, "/").split("/").pop().toLowerCase()
  b = b.replace(/\.(jpe?g|png|webp|gif|avif)$/i, "")
  b = b.replace(/\s*\(\d+\)$/g, "")
  b = b.replace(/[-_\s]+(copy|копия)$/gi, "")
  b = b.replace(/[-_]+/g, "-").replace(/^-+|-+$/g, "")
  return b
}

function cameraDumpKey(row) {
  const b = String(row.basename || "").toLowerCase()
  if (/^\d{4}-\d{2}-\d{2}[\s_-]\d{2}[-:]\d{2}[-:]\d{2}/.test(b)) return normBase(b)
  if (/^(img|dsc|dscf|photo|image)[-_ ]?\d{3,}/i.test(b)) return normBase(b)
  return null
}

function hasCrossSkuRisk(row) {
  return row.classification_status === "blocked_cross_sku" || (row.priority_reasons || []).some((r) => /cross_sku|possible_cross_sku/i.test(r))
}

function compact(row) {
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
    resolved_collection: row.resolved_collection ?? row.collection_guess ?? null,
    priority_tier: row.priority_tier,
    priority_score: row.priority_score,
    classification_status: row.classification_status,
    priority_reasons: row.priority_reasons || [],
  }
}

function chooseKeeper(rows) {
  return rows.slice().sort((a, b) => {
    const score = (r) =>
      (r.inventory_matches.length ? 1000 : 0) +
      (r.source_kind === "legacy_site" ? 100 : 0) +
      (r.local_cache_path ? 50 : 0) +
      (r.priority_score || 0) -
      (/\(\d+\)/.test(r.basename || "") ? 10 : 0)
    return score(b) - score(a) || String(a.basename).localeCompare(String(b.basename))
  })[0]
}

fs.mkdirSync(outDir, { recursive: true })

const queueRaw = readJson(inputs.queue)
const manifestRaw = readJson(inputs.manifest)
const seedRaw = readJson(inputs.seed)
const inventoryRaw = readJson(inputs.inventory)
const workbookRaw = readJson(inputs.workbook)
const legacyRaw = readJson(inputs.legacyProducts)

const seedProducts = Array.isArray(seedRaw) ? seedRaw : seedRaw.products || []
const manifestById = new Map((manifestRaw.items || []).map((item) => [item.source_id, item]))

const seedByCode = new Map()
const seedByHandle = new Map()
for (const p of seedProducts) {
  if (!p.product_code_normalized || !p.medusa_product_handle) continue
  const record = {
    code: p.product_code_normalized,
    handle: String(p.medusa_product_handle).toLowerCase(),
    collection: String(p.medusa_collection_handle || "").toLowerCase() || null,
    title: p.medusa_product_title || p.canonical_name || null,
  }
  seedByCode.set(rawKey(p.product_code_normalized), { ...record, match_kind: "seed_raw_code" })
  seedByCode.set(normCode(p.product_code_normalized), { ...record, match_kind: "seed_normalized_code" })
  for (const v of joinKeyVariants(p.product_code_normalized)) {
    seedByCode.set(normCode(v), { ...record, match_kind: "seed_alias_code" })
  }
  seedByHandle.set(record.handle, record)
}

const inventoryBySku = new Map()
const inventoryByHandle = new Map()
const inventoryByBase = new Map()
for (const item of inventoryRaw.items || []) {
  if (item.sku_hint) {
    setAdd(inventoryBySku, rawKey(item.sku_hint), item)
    setAdd(inventoryBySku, normCode(item.sku_hint), item)
    for (const v of joinKeyVariants(item.sku_hint)) setAdd(inventoryBySku, normCode(v), item)
  }
  if (item.handle_hint) setAdd(inventoryByHandle, rawKey(item.handle_hint), item)
  if (item.filename) {
    setAdd(inventoryByBase, rawKey(item.filename), item)
    setAdd(inventoryByBase, normBase(item.filename), item)
  }
}

const workbookByCode = new Map()
for (const row of workbookRaw) {
  if (!row.product_code_normalized) continue
  const rec = {
    code: row.product_code_normalized,
    collection: row.collection_name_normalized || null,
    title: row.product_name_canonical || row.product_name_raw || null,
    source_sheet: row.source_sheet || null,
  }
  setAdd(workbookByCode, rawKey(row.product_code_normalized), rec)
  setAdd(workbookByCode, normCode(row.product_code_normalized), rec)
  for (const v of joinKeyVariants(row.product_code_normalized)) setAdd(workbookByCode, normCode(v), rec)
}

const legacyByCode = new Map()
for (const row of legacyRaw) {
  const code = row.product_code_raw || row.product_code_from_image
  if (!code) continue
  const rec = {
    code,
    collection: row.collection_hint || null,
    title: row.product_title_raw || null,
    page_url: row.page_url || null,
  }
  setAdd(legacyByCode, rawKey(code), rec)
  setAdd(legacyByCode, normCode(code), rec)
  for (const v of joinKeyVariants(code)) setAdd(legacyByCode, normCode(v), rec)
}

function resolveSeed(sku, handleGuess) {
  const keys = [rawKey(sku), normCode(sku), ...joinKeyVariants(sku).map(normCode)].filter(Boolean)
  for (const key of keys) {
    const hit = seedByCode.get(key)
    if (hit) return hit
  }
  if (handleGuess) {
    const hit = seedByHandle.get(rawKey(handleGuess))
    if (hit) return { ...hit, match_kind: "seed_handle_guess" }
  }
  return null
}

function uniqueBy(items, getKey) {
  const seen = new Set()
  const out = []
  for (const item of items) {
    const key = getKey(item)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

const rows = (queueRaw.full_queue || []).map((q) => {
  const m = manifestById.get(q.source_id) || {}
  const sku = m.sku_guess ?? q.sku_guess ?? null
  const handleGuess = m.handle_guess ?? q.handle_guess ?? null
  const seedHit = resolveSeed(sku, handleGuess)
  const basename = m.basename ?? q.basename
  const invBySku = sku ? uniqueBy([...(inventoryBySku.get(rawKey(sku)) || []), ...(inventoryBySku.get(normCode(sku)) || [])], (x) => x.id) : []
  const invByHandle = handleGuess ? inventoryByHandle.get(rawKey(handleGuess)) || [] : []
  const invByBase = uniqueBy([...(inventoryByBase.get(rawKey(basename)) || []), ...(inventoryByBase.get(normBase(basename)) || [])], (x) => x.id)
  const workbook = sku ? uniqueBy([...(workbookByCode.get(rawKey(sku)) || []), ...(workbookByCode.get(normCode(sku)) || [])], (x) => `${x.code}:${x.source_sheet}`) : []
  const legacy = sku ? uniqueBy([...(legacyByCode.get(rawKey(sku)) || []), ...(legacyByCode.get(normCode(sku)) || [])], (x) => `${x.code}:${x.page_url}`) : []
  const collection = seedHit?.collection || m.collection_guess || q.collection_guess || invBySku[0]?.collection_hint || legacy[0]?.collection || workbook[0]?.collection || null
  const handle = seedHit?.handle || (handleGuess ? String(handleGuess).toLowerCase() : null) || invBySku[0]?.handle_hint || null
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
    inventory_matches: uniqueBy([...invByBase, ...invBySku, ...invByHandle], (x) => x.id),
    inventory_basename_matches: invByBase,
    workbook_matches: workbook,
    legacy_matches: legacy,
    resolved_handle: handle,
    resolved_collection: collection ? String(collection).toLowerCase() : null,
    cross_sku_risk: hasCrossSkuRisk({ ...q, classification_status: m.classification_status ?? q.classification_status }),
  }
})

function proposalFor(row) {
  const evidence = []
  let confidence = "low"
  let action = "operator_review"
  if (row.seed_hit) {
    confidence = OPERABLE_COLLECTIONS.has(row.seed_hit.collection) && !row.cross_sku_risk ? "high" : "medium"
    action = OPERABLE_COLLECTIONS.has(row.seed_hit.collection) && !row.cross_sku_risk ? "suggest_assign" : "suggest_blocked_review"
    evidence.push({ source: "seed-products", match_kind: row.seed_hit.match_kind, handle: row.seed_hit.handle, collection: row.seed_hit.collection, title: row.seed_hit.title })
  }
  if (row.inventory_matches.length) {
    if (confidence === "low") confidence = "medium"
    evidence.push({
      source: "legacy-media-inventory",
      match_count: row.inventory_matches.length,
      sample: row.inventory_matches.slice(0, 5).map((m) => ({
        id: m.id,
        filename: m.filename,
        sku_hint: m.sku_hint,
        handle_hint: m.handle_hint,
        collection_hint: m.collection_hint,
        repo_relative_path: m.repo_relative_path,
      })),
    })
  }
  if (row.workbook_matches.length) {
    if (confidence === "low" && row.resolved_handle) confidence = "medium"
    evidence.push({ source: "workbook", match_count: row.workbook_matches.length, sample: row.workbook_matches.slice(0, 5) })
  }
  if (row.legacy_matches.length) {
    evidence.push({ source: "legacy-products", match_count: row.legacy_matches.length, sample: row.legacy_matches.slice(0, 5) })
  }
  if (row.handle_guess && !row.seed_hit) {
    evidence.push({ source: "filename_handle_guess", handle_guess: row.handle_guess })
  }
  return {
    do_not_auto_apply: true,
    action,
    confidence,
    source: compact(row),
    proposed_handle: row.resolved_handle,
    proposed_collection: row.resolved_collection,
    evidence,
    blockers: [
      row.cross_sku_risk ? "cross_sku_risk" : null,
      row.resolved_collection && GATED_COLLECTIONS.has(row.resolved_collection) ? "collection_gate" : null,
      !row.resolved_handle ? "no_seed_or_inventory_handle" : null,
    ].filter(Boolean),
  }
}

const proposals = rows.filter((r) => r.sku_guess || r.resolved_handle || r.legacy_matches.length || r.workbook_matches.length || r.inventory_matches.length).map(proposalFor)

const autoRoute = proposals
  .filter((p) => p.action === "suggest_assign" && p.confidence === "high" && p.proposed_handle && OPERABLE_COLLECTIONS.has(p.proposed_collection) && p.blockers.length === 0)
  .map((p) => ({
    ...p,
    operator_next_step: "Assign to proposed_handle after visual check; export is advisory only.",
  }))

const blocked = proposals
  .filter((p) => p.blockers.includes("collection_gate"))
  .map((p) => ({
    ...p,
    operator_next_step: "Hold until collection-specific gate is approved.",
  }))

const normGroups = Array.from(groupBy(rows, (r) => normBase(r.basename)).entries())
  .filter(([, group]) => group.length > 1)
  .map(([key, group]) => {
    const keeper = chooseKeeper(group)
    const hasInventoryEvidence = group.some((r) => r.inventory_basename_matches.length)
    const cameraKey = group.some((r) => cameraDumpKey(r))
    return {
      do_not_auto_apply: true,
      group_key: key,
      recommended_action: hasInventoryEvidence ? "merge_against_existing_inventory_or_ignore_duplicate" : cameraKey ? "defer_camera_burst_group" : "operator_compare_before_merge",
      confidence: hasInventoryEvidence ? "high" : cameraKey ? "medium" : "low",
      recommended_keeper_source_id: keeper.source_id,
      keeper: compact(keeper),
      rows: group
        .slice()
        .sort((a, b) => String(a.basename).localeCompare(String(b.basename)))
        .map((r) => ({
          ...compact(r),
          inventory_basename_evidence: r.inventory_basename_matches.slice(0, 5).map((m) => ({
            id: m.id,
            filename: m.filename,
            sku_hint: m.sku_hint,
            handle_hint: m.handle_hint,
            repo_relative_path: m.repo_relative_path,
          })),
        })),
    }
  })
  .sort((a, b) => b.rows.length - a.rows.length || a.group_key.localeCompare(b.group_key))

const duplicateMergePlan = normGroups.filter((g) => g.confidence !== "low" || g.rows.some((r) => r.inventory_basename_evidence.length))

const deferDismiss = rows
  .filter((r) => {
    const clearNoise = r.priority_tier === "P3_low_noise_or_ambiguous" && !r.sku_guess && r.priority_score <= 0
    const cameraDump = Boolean(cameraDumpKey(r)) && !r.sku_guess
    return clearNoise || cameraDump
  })
  .map((r) => ({
    do_not_auto_apply: true,
    action: r.priority_score <= 0 ? "dismiss_noise" : "defer_noise",
    confidence: r.priority_score <= 0 || cameraDumpKey(r) ? "high" : "medium",
    reason: cameraDumpKey(r) ? "camera_dump_filename_without_sku" : "p3_low_noise_without_sku",
    source: compact(r),
  }))

const coveredSourceIds = new Set()
for (const p of proposals) coveredSourceIds.add(p.source.source_id)
for (const p of autoRoute) coveredSourceIds.add(p.source.source_id)
for (const p of blocked) coveredSourceIds.add(p.source.source_id)
for (const row of deferDismiss) coveredSourceIds.add(row.source.source_id)
for (const group of duplicateMergePlan) {
  for (const row of group.rows) coveredSourceIds.add(row.source_id)
}
const uncoveredRows = rows.filter((r) => !coveredSourceIds.has(r.source_id))

const summary = {
  generated_at: new Date().toISOString(),
  do_not_auto_apply: true,
  inputs,
  total_queue_rows: rows.length,
  counts_by_priority_tier: countBy(rows, (r) => r.priority_tier),
  counts_by_source_kind: countBy(rows, (r) => r.source_kind),
  counts_by_collection: countBy(rows, (r) => r.resolved_collection || "(missing)"),
  action_counts: {
    auto_route_manifest_rows: autoRoute.length,
    sku_handle_proposals: proposals.length,
    sku_handle_high_confidence: proposals.filter((p) => p.confidence === "high").length,
    sku_handle_medium_confidence: proposals.filter((p) => p.confidence === "medium").length,
    sku_handle_low_confidence: proposals.filter((p) => p.confidence === "low").length,
    duplicate_merge_groups: duplicateMergePlan.length,
    duplicate_merge_rows: duplicateMergePlan.reduce((sum, g) => sum + g.rows.length, 0),
    defer_dismiss_rows: deferDismiss.length,
    collection_gate_blocked_rows: blocked.length,
    unique_rows_covered_by_artifacts: coveredSourceIds.size,
    operator_manual_reanalysis_remaining: uncoveredRows.length,
  },
  rates: {
    auto_route_percent_of_queue: pct(autoRoute.length, rows.length),
    proposal_percent_of_queue: pct(proposals.length, rows.length),
    defer_dismiss_percent_of_queue: pct(deferDismiss.length, rows.length),
  },
  applied: {
    normalized_writes: 0,
    medusa_seed_writes: 0,
    operator_suggestion_artifacts_only: true,
  },
}

writeJson("resolution-summary.json", summary)
writeJson("auto-route-manifest.json", {
  generated_at: summary.generated_at,
  do_not_auto_apply: true,
  rows: autoRoute,
})
writeJson("sku-handle-proposals.json", {
  generated_at: summary.generated_at,
  do_not_auto_apply: true,
  rows: proposals,
})
writeJson("duplicate-merge-plan.json", {
  generated_at: summary.generated_at,
  do_not_auto_apply: true,
  groups: duplicateMergePlan,
})
writeJson("defer-dismiss.json", {
  generated_at: summary.generated_at,
  do_not_auto_apply: true,
  rows: deferDismiss,
})
writeJson("collection-gate-blocked.json", {
  generated_at: summary.generated_at,
  do_not_auto_apply: true,
  rows: blocked,
})

writeText(
  "README.md",
  `# Orphan Resolution Artifacts

Generated: ${summary.generated_at}

All JSON exports are advisory and include \`do_not_auto_apply: true\`. No normalized data or Medusa seed files were written.

## What was produced

- \`auto-route-manifest.json\`: ${autoRoute.length} high-confidence rows with seed-backed handle, operable collection, and no detected cross-SKU blocker.
- \`sku-handle-proposals.json\`: ${proposals.length} SKU/handle suggestions with evidence from seed products, legacy media inventory, workbook, legacy products, and filename hints.
- \`duplicate-merge-plan.json\`: ${duplicateMergePlan.length} duplicate/camera-burst groups with recommended keeper.
- \`defer-dismiss.json\`: ${deferDismiss.length} clear P3/no-SKU noise rows operators can dismiss or defer.
- \`collection-gate-blocked.json\`: ${blocked.length} suggestions held behind collection gates.
- \`resolution-summary.json\`: counts by action and source.

## Operator next steps

1. Start with \`auto-route-manifest.json\`; visually confirm each source image, then use Assign in the inbox.
2. Use \`duplicate-merge-plan.json\` to ignore exact/near filename duplicates that already exist in inventory or to collapse camera-burst groups.
3. Use \`sku-handle-proposals.json\` for manual assignments. Treat \`high\` as ready for visual confirmation, \`medium\` as needs source-page/context check, and \`low\` as evidence only.
4. Keep \`collection-gate-blocked.json\` out of Assign until Oxford/Monchelsea/Willie Winkie gates clear.
5. Apply \`defer-dismiss.json\` only as an inbox triage decision; do not delete source media.

Rerun with:

\`\`\`sh
node tmp/media-ops-codex-review/orphan-resolution/run-orphan-resolution.cjs
\`\`\`
`
)

fs.writeFileSync(
  path.join(repoRoot, "tmp/media-ops-codex-review/orphan-resolution-autonomous.md"),
  `# Autonomous Orphan Resolution

- Generated: ${summary.generated_at}
- Verdict: approve operator-only suggestions; no normalized auto-apply.
- Queue rows: ${rows.length}
- Auto-route manifest rows: ${autoRoute.length}
- SKU/handle proposals: ${proposals.length}
- Duplicate merge groups: ${duplicateMergePlan.length}
- Defer/dismiss rows: ${deferDismiss.length}
- Collection-gate blocked rows: ${blocked.length}

## P1

- Use \`orphan-resolution/auto-route-manifest.json\` first. These are seed-backed, operable collection rows with no cross-SKU risk.
- Keep \`orphan-resolution/collection-gate-blocked.json\` blocked until collection-specific gates are approved.

## P2

- Work \`orphan-resolution/sku-handle-proposals.json\` by confidence. Medium/low rows need source-page or visual confirmation before Assign.
- Use \`orphan-resolution/duplicate-merge-plan.json\` to collapse known duplicate basenames and camera-burst groups.

## P3

- \`orphan-resolution/defer-dismiss.json\` contains low-value no-SKU noise suitable for defer/dismiss triage.

## Applied vs Operator-only

- Applied: rerunnable artifact generation and a narrow bootstrap seed JSON shape fix.
- Operator-only: all assignment, merge, defer, and dismiss decisions. Every export keeps \`do_not_auto_apply\`.
`
)

console.log(JSON.stringify(summary, null, 2))
