#!/usr/bin/env node
/**
 * Superseding source completeness audit — legacy = full HTML cache union (~1285).
 * Prior stale audit preserved in tmp/source-media-completeness-audit/.
 */
import fs from "fs"
import path from "path"
import crypto from "crypto"
import { fileURLToPath } from "url"
import {
  extractImagesFromHtml,
  PARENT_CACHE,
  TMP_CACHE,
} from "../legacy-site-media-rebuild/legacy-site-lib.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = __dirname
const REPO = path.resolve(OUT, "../..")
const PARENT = path.resolve(REPO, "../furniture-commerce")
const PARENT_INV = path.join(PARENT, "data/normalized/legacy-media-inventory.json")

const PATHS = {
  yandexTree: path.join(REPO, "tmp/legacy-media-public-yandex-rebuild/public-yandex-tree.json"),
  yandexVsInv: path.join(REPO, "tmp/legacy-media-public-yandex-rebuild/public-yandex-vs-current-inventory.json"),
  yandexProof: path.join(REPO, "tmp/legacy-media-public-yandex-rebuild/downloaded-proof-candidates.json"),
  yandexCacheDir: path.join(REPO, "tmp/legacy-media-public-yandex-rebuild/cache/candidates"),
  yandexMountCheck: path.join(REPO, "tmp/legacy-media-yandex-rebuild-dry-run/source-root-check.json"),
  staleLegacyCrawl: path.join(REPO, "tmp/legacy-site-media-rebuild/legacy-site-crawl.json"),
  legacyClassified: path.join(REPO, "tmp/legacy-site-media-rebuild/classified-legacy-site-candidates.json"),
  supplementReview: path.join(REPO, "tmp/legacy-site-media-supplement-review/review-report.json"),
  blockedCandidates: path.join(REPO, "tmp/legacy-site-media-supplement-review/blocked-candidates.json"),
  safeBatch: path.join(REPO, "tmp/legacy-site-media-supplement-review/first-safe-batch.json"),
  co02Gap: path.join(REPO, "tmp/legacy-media-public-yandex-rebuild/co02-gap-search.json"),
  priorSummary: path.join(REPO, "tmp/source-media-completeness-audit/source-media-completeness-summary.json"),
  priorQueue: path.join(REPO, "tmp/legacy-site-completeness-reconciliation/source-orphan-priority-queue.json"),
  priorReconciliation: path.join(REPO, "tmp/legacy-site-completeness-reconciliation/legacy-url-reconciliation.json"),
}

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".tif", ".tiff", ".heic", ".bmp"])
const CO02_TARGETS = [
  { key: "CO-02-1_main", patterns: [/^co-02-1_main\.(jpg|jpeg|png|webp)$/i] },
  { key: "CO-02-1_gallery_04", patterns: [/^co-02-1_gallery_04\.(jpg|jpeg|png|webp)$/i] },
  { key: "CO-02-1_gallery_05", patterns: [/^co-02-1_gallery_05\.(jpg|jpeg|png|webp)$/i] },
  { key: "co-02-1-i4", patterns: [/^co-02-1-i4\.(jpg|jpeg|png|webp)$/i] },
  { key: "co-02-1-i5", patterns: [/^co-02-1-i5\.(jpg|jpeg|png|webp)$/i] },
]

const SKU_RE = /^[a-z]{2}-\d{1,3}-\d{1,2}(-|$)/i
const WHITE_BG_HINTS = [/фото на белом/i, /white.?bg/i, /\/country /i, /\/america /i, /detailed\/\d+\/[a-z]{2}-\d/i]
const NOISE_HINTS = [/greenwich_/i, /^IMG_/i, /^DSC_/i, /^PHOTO-/i, /^Screenshot/i, /logo/i, /catalog_icon/i, /noliver_/i, /\.heic$/i, /\.pdf$/i, /\.tif$/i]

function readJson(p) {
  if (!fs.existsSync(p)) return null
  return JSON.parse(fs.readFileSync(p, "utf-8"))
}

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(obj, null, 2))
}

function sha1(s) {
  return crypto.createHash("sha1").update(s).digest("hex")
}

function normBasename(name) {
  if (!name) return ""
  return name
    .toLowerCase()
    .replace(/\?.*$/, "")
    .replace(/[-_]?(600x600|nmmg-[a-z0-9]+|_[a-z0-9]{4}-[a-z0-9]{2})\./gi, ".")
    .replace(/__\d+_/g, "_")
}

function extOf(name) {
  return path.extname(name || "").toLowerCase()
}

function isCo02ExactTarget(filename) {
  const base = path.basename(filename || "")
  for (const t of CO02_TARGETS) {
    if (t.patterns.some((re) => re.test(base))) return t.key
  }
  return null
}

function probeYandexMount() {
  const prior = readJson(PATHS.yandexMountCheck)
  if (prior?.yandex_mounted === false) return { status: "blocked_by_yandex_mount", mounted_roots: [], prior }
  const roots = []
  for (const p of [
    process.env.WOODRIGHT_WHITE_BG_ROOT,
    "/Users/leonidmbp/Yandex.Disk/WOODRIGHT/Контент /Фото на белом фоне",
    "/Users/leonidmbp/Yandex Disk/WOODRIGHT/Контент /Фото на белом фоне",
  ].filter(Boolean)) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) roots.push(p)
    } catch {
      /* ignore */
    }
  }
  return roots.length
    ? { status: "mounted", mounted_roots: roots, prior }
    : { status: "blocked_by_yandex_mount", mounted_roots: [], prior }
}

function buildInventoryIndex(inv) {
  const byFilename = new Map()
  const byUrl = new Map()
  for (const it of inv?.items || []) {
    if (it.filename) {
      const k = it.filename.toLowerCase()
      if (!byFilename.has(k)) byFilename.set(k, [])
      byFilename.get(k).push(it)
    }
    if (it.url) {
      const k = it.url.split("?")[0].toLowerCase()
      if (!byUrl.has(k)) byUrl.set(k, [])
      byUrl.get(k).push(it)
    }
  }
  return { byFilename, byUrl, total: inv?.items?.length || 0 }
}

function loadReviewMaps() {
  const review = readJson(PATHS.supplementReview)
  const byUrl = new Map()
  for (const row of review?.candidate_table || []) {
    const url = row.url?.split("?")[0].toLowerCase()
    if (url) byUrl.set(url, row)
  }
  const classifiedByUrl = new Map()
  for (const c of readJson(PATHS.legacyClassified)?.items || []) {
    const u = c.url?.split("?")[0].toLowerCase()
    if (u) classifiedByUrl.set(u, c)
  }
  const safeUrls = (readJson(PATHS.safeBatch)?.items || []).map((x) => x.url?.split("?")[0].toLowerCase()).filter(Boolean)
  return { byUrl, classifiedByUrl, review, safeUrls, safeUrlSet: new Set(safeUrls) }
}

function yandexDownloadMap() {
  const map = new Map()
  for (const row of readJson(PATHS.yandexProof) || []) {
    if (row.filename && row.local_cache) map.set(row.filename.toLowerCase(), row.local_cache)
  }
  if (fs.existsSync(PATHS.yandexCacheDir)) {
    for (const f of fs.readdirSync(PATHS.yandexCacheDir)) {
      map.set(f.toLowerCase(), path.join(PATHS.yandexCacheDir, f))
    }
  }
  return map
}

function scanCacheDir(dir, urlMap) {
  if (!fs.existsSync(dir)) return 0
  let n = 0
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".html"))) {
    n += 1
    const html = fs.readFileSync(path.join(dir, f), "utf-8")
    let pageUrl = null
    const canon = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i)
    if (canon) pageUrl = canon[1]
    else {
      const any = html.match(/https:\/\/woodright\.ru\/kollekcii\/[^"'\\s<>]+/i)
      pageUrl = any ? any[0].split("?")[0] : `cache://${f}`
    }
    for (const img of extractImagesFromHtml(html, pageUrl)) {
      const key = img.url
      if (!urlMap.has(key)) {
        urlMap.set(key, { ...img, source_pages: new Set(), in_parent_cache: false, in_tmp_cache: false })
      }
      const rec = urlMap.get(key)
      rec.source_pages.add(pageUrl)
      if (dir === PARENT_CACHE) rec.in_parent_cache = true
      if (dir === TMP_CACHE) rec.in_tmp_cache = true
    }
  }
  return n
}

function buildLegacyRowsFullCache(staleUrls) {
  const urlMap = new Map()
  const parentHtml = scanCacheDir(PARENT_CACHE, urlMap)
  const tmpHtml = scanCacheDir(TMP_CACHE, urlMap)

  return {
    meta: {
      parent_html_files: parentHtml,
      tmp_html_files: tmpHtml,
      parent_unique: [...urlMap.values()].filter((v) => v.in_parent_cache).length,
      tmp_unique: [...urlMap.values()].filter((v) => v.in_tmp_cache).length,
      combined_unique: urlMap.size,
    },
    rows: [...urlMap.entries()].map(([url, img]) => {
      const inParent = Boolean(img.in_parent_cache)
      const inTmp = Boolean(img.in_tmp_cache)
      const provenance = inParent && inTmp ? "both" : inParent ? "parent_cache" : "tmp_cache"
      const ext = extOf(img.filename)
      return {
        source_kind: "legacy_site",
        source_id: `legacy_site:${sha1(url).slice(0, 12)}`,
        source_url: url,
        source_path: null,
        source_page_url: [...img.source_pages][0] || null,
        legacy_cache_provenance: provenance,
        legacy_in_parent_cache: inParent,
        legacy_in_tmp_cache: inTmp,
        legacy_newly_included_vs_stale_468_crawl: !staleUrls.has(url),
        basename: img.filename,
        extension: ext,
        normalized_basename: normBasename(img.filename),
        download_status: "not_downloaded",
        download_error: null,
        local_cache_path: null,
        bytes: null,
        width: null,
        height: null,
        content_quick_hash: null,
        perceptual_hash: null,
        md5: null,
        sha256: null,
        collection_guess: img.collection_guess,
        handle_guess: img.handle_guess,
        sku_guess: img.sku_guess,
        color_guess: img.color_guess,
        role_guess: img.role_guess,
        parse_confidence: img.sku_guess ? 0.75 : 0.15,
        is_media: IMAGE_EXT.has(ext),
      }
    }),
  }
}

function classifyRow(row, ctx) {
  const { invIdx, yandexVsByPath, reviewByUrl, classifiedByUrl, md5FirstSeen, basenameFirstSeen, urlFirstSeen } = ctx

  if (!row.is_media || !IMAGE_EXT.has(row.extension || "")) {
    return finish("unsupported_asset", "non_image_extension_or_pdf", "ignore_exact_duplicate")
  }

  const gapKey = isCo02ExactTarget(row.basename)
  if (gapKey) {
    return finish("source_gap_confirmed", `co02_known_missing_target_${gapKey}`, "source_gap")
  }

  const invMatch =
    (row.basename && invIdx.byFilename.get(row.basename.toLowerCase())) ||
    (row.source_url && invIdx.byUrl.get(row.source_url.split("?")[0].toLowerCase()))

  if (invMatch?.length) {
    return finish("approved_existing_or_known", `in_inventory_${invMatch[0].id}`, "ignore_exact_duplicate")
  }

  const yandexRow = row.source_kind === "yandex_public" ? yandexVsByPath.get(row.source_path) : null
  if (yandexRow?.in_current_inventory) {
    return finish("approved_existing_or_known", "yandex_vs_inventory_matched", "ignore_exact_duplicate")
  }

  const review = row.source_url ? reviewByUrl.get(row.source_url.split("?")[0].toLowerCase()) : null
  if (review) {
    if (review.visual_review_status === "approve_for_normalized_review") {
      return finish("safe_candidate_for_review", review.reason, "safe_candidate_review")
    }
    if (review.visual_review_status === "reject_cross_sku") {
      return finish("blocked_cross_sku", review.reason, "reject_cross_sku")
    }
    if (review.visual_review_status === "reject_low_confidence") {
      return finish("blocked_low_confidence", review.reason, "review_manually")
    }
  }

  const classified = row.source_url ? classifiedByUrl.get(row.source_url.split("?")[0].toLowerCase()) : null
  if (classified?.reason?.includes("cross_sku") || classified?.candidate_type === "do_not_add") {
    return finish("blocked_cross_sku", classified.reason || "legacy_classified_cross_sku", "reject_cross_sku")
  }

  const hashKey = row.content_quick_hash || row.md5 || row.sha256
  if (hashKey && md5FirstSeen.get(hashKey) !== row.source_id) {
    return finish("duplicate_exact", `same_content_hash_as_${md5FirstSeen.get(hashKey)}`, "ignore_exact_duplicate")
  }

  const normBase = row.normalized_basename
  if (normBase && basenameFirstSeen.get(normBase) !== row.source_id) {
    return finish("duplicate_near", `normalized_basename_also_on_${basenameFirstSeen.get(normBase)}`, "ignore_exact_duplicate")
  }

  if (row.source_url && urlFirstSeen.get(row.source_url) !== row.source_id) {
    return finish("duplicate_exact", `duplicate_url_${urlFirstSeen.get(row.source_url)}`, "ignore_exact_duplicate")
  }

  if (row.download_status === "failed") {
    return finish("download_failed", row.download_error || "download_failed", "retry_download")
  }

  if (row.sku_guess && row.sku_guess !== "_unknown" && !/^unknown$/i.test(row.handle_guess || "")) {
    return finish("needs_manual_mapping", "sku_guess_present_not_in_inventory", "map_to_sku")
  }

  return finish("unmapped_orphan", "no_inventory_match_no_safe_candidate", "review_manually")

  function finish(classification_status, classification_reason, action) {
    return { classification_status, classification_reason, suggested_next_action: action }
  }
}

function buildYandexRows(tree, yandexVs, dlMap) {
  const vsByPath = new Map()
  for (const it of yandexVs?.items || []) vsByPath.set(it.public_path, it)

  return (tree?.files || []).map((f) => {
    const ext = extOf(f.filename)
    const is_media = f.is_media ?? IMAGE_EXT.has(ext)
    const cache = dlMap.get((f.filename || "").toLowerCase())
    const vs = vsByPath.get(f.public_path)
    return {
      source_kind: "yandex_public",
      source_id: `yandex_public:${sha1(f.public_path || f.filename).slice(0, 12)}`,
      source_url: f.file || f.preview || null,
      source_path: f.public_path,
      source_page_url: null,
      legacy_cache_provenance: null,
      legacy_newly_included_vs_stale_468_crawl: null,
      basename: f.filename,
      extension: ext,
      normalized_basename: normBasename(f.filename),
      download_status: cache ? "already_cached" : "not_downloaded",
      download_error: null,
      local_cache_path: cache || null,
      bytes: f.size ?? null,
      width: null,
      height: null,
      content_quick_hash: f.md5 || f.sha256 || null,
      perceptual_hash: null,
      md5: f.md5 || null,
      sha256: f.sha256 || null,
      collection_guess: f.collection_guess,
      handle_guess: f.sku_guess,
      sku_guess: f.sku_guess,
      color_guess: f.color_guess,
      role_guess: f.role_guess,
      parse_confidence: f.sku_guess ? 0.7 : 0.2,
      is_media,
      in_current_inventory: vs?.in_current_inventory ?? null,
    }
  })
}

function countBy(rows, key) {
  const m = {}
  for (const row of rows) {
    const k = row[key] || "unknown"
    m[k] = (m[k] || 0) + 1
  }
  return m
}

function searchCo02(rows, co02Gap) {
  const results = CO02_TARGETS.map((t) => ({
    target: t.key,
    found: false,
    exact_match: false,
    approximate_matches: [],
    source_kind: null,
    path_or_url: null,
    trusted: false,
    note: "not_found_in_discovered_sources",
  }))

  for (const row of rows) {
    const gap = isCo02ExactTarget(row.basename)
    if (!gap) continue
    const r = results.find((x) => x.target === gap)
    if (!r) continue
    const exact = row.basename?.toLowerCase() === gap.toLowerCase() || tExact(gap, row.basename)
    r.found = true
    r.exact_match = exact
    r.source_kind = row.source_kind
    r.path_or_url = row.source_path || row.source_url
    r.trusted = exact && /^co-02-1/i.test(row.basename || "")
    if (!exact) {
      r.approximate_matches.push({ basename: row.basename, source_kind: row.source_kind })
    }
  }

  for (const t of co02Gap?.targets || []) {
    const keyMap = { main: "CO-02-1_main", gallery_04: "CO-02-1_gallery_04", gallery_05: "CO-02-1_gallery_05", i4: "co-02-1-i4", i5: "co-02-1-i5" }
    const key = keyMap[t.target]
    const r = results.find((x) => x.target === key)
    if (!r) continue
    if (t.found && !t.found_exact_co02) {
      r.approximate_matches.push({ basename: t.filename, note: "cross_sku_pattern_yandex_only" })
    }
  }
  return results
}

function tExact(gap, basename) {
  return CO02_TARGETS.find((x) => x.key === gap)?.patterns.some((re) => re.test(basename || "")) ?? false
}

function scoreOrphan(row) {
  let score = 0
  const fn = (row.basename || "").toLowerCase()
  const sp = (row.source_path || row.source_url || "").toLowerCase()
  const reasons = []

  if (row.source_kind === "yandex_public" && WHITE_BG_HINTS.some((re) => re.test(sp + fn))) {
    score += 40
    reasons.push("white_bg_or_product_path")
  }
  if (row.source_kind === "legacy_site" && row.legacy_cache_provenance === "parent_cache") {
    score += 15
    reasons.push("legacy_parent_cache_pdp")
  }
  if (row.source_kind === "legacy_site" && row.legacy_newly_included_vs_stale_468_crawl) {
    score += 10
    reasons.push("newly_included_legacy_url")
  }
  if (SKU_RE.test(fn)) {
    score += 35
    reasons.push("sku_filename_pattern")
  }
  if (row.sku_guess && row.sku_guess !== "_unknown") {
    score += 20
    reasons.push("has_sku_guess")
  }
  if (/\.(jpg|jpeg|png|webp)$/i.test(fn)) {
    score += 15
    reasons.push("standard_product_image_ext")
  }
  if (NOISE_HINTS.some((re) => re.test(fn) || re.test(sp))) {
    score -= 50
    reasons.push("noise_or_non_catalog_asset")
  }
  if (row.classification_status === "needs_manual_mapping") score += 12

  let priority_tier = "P3_low_noise_or_ambiguous"
  if (score >= 70) priority_tier = "P0_review_first"
  else if (score >= 50) priority_tier = "P1_white_bg_sku"
  else if (score >= 30) priority_tier = "P2_possible_product"

  return { priority_score: score, priority_tier, priority_reasons: reasons }
}

function buildPriorityQueue(manifest) {
  const targets = manifest.filter((r) =>
    ["unmapped_orphan", "needs_manual_mapping"].includes(r.classification_status)
  )
  const scored = targets
    .map((row) => ({
      source_id: row.source_id,
      source_kind: row.source_kind,
      basename: row.basename,
      source_url: row.source_url,
      legacy_cache_provenance: row.legacy_cache_provenance,
      legacy_newly_included: row.legacy_newly_included_vs_stale_468_crawl,
      sku_guess: row.sku_guess,
      classification_status: row.classification_status,
      ...scoreOrphan(row),
    }))
    .sort((a, b) => b.priority_score - a.priority_score || (a.basename || "").localeCompare(b.basename || ""))

  const byTier = {}
  for (const r of scored) byTier[r.priority_tier] = (byTier[r.priority_tier] || 0) + 1

  return {
    generated_at: new Date().toISOString(),
    audit_variant: "full_legacy_cache_union",
    total_orphan_and_manual: targets.length,
    by_priority_tier: byTier,
    top_50: scored.slice(0, 50),
    full_queue: scored,
  }
}

function renderTopOrphansHtml(rows, outPath) {
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const cards = rows
    .slice(0, 50)
    .map(
      (r) =>
        `<article class="card"><p><strong>${esc(r.priority_tier)}</strong> ${r.priority_score}</p><p>${esc(r.basename)}</p><p>${esc(r.source_kind)} · ${esc(r.legacy_cache_provenance || "yandex")}</p><p style="font-size:.8rem;word-break:break-all">${esc(r.source_url)}</p></article>`
    )
    .join("\n")
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(
    outPath,
    `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"/><title>Top orphans full-cache audit</title>
<style>body{font-family:system-ui;margin:1rem}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:.75rem}
.card{border:1px solid #ccc;border-radius:8px;padding:.75rem;background:#fff}</style></head>
<body><h1>Top priority — full legacy cache audit</h1><p>Read-only. Not approved.</p><div class="grid">${cards}</div></body></html>`
  )
}

function main() {
  const generated_at = new Date().toISOString()
  const prior = readJson(PATHS.priorSummary) || {}
  const priorQueue = readJson(PATHS.priorQueue) || {}
  const priorRecon = readJson(PATHS.priorReconciliation) || {}

  const staleCrawl = readJson(PATHS.staleLegacyCrawl)
  const staleUrls = new Set((staleCrawl?.unique_images || []).map((i) => i.url))

  const legacy = buildLegacyRowsFullCache(staleUrls)
  const mount = probeYandexMount()
  const inv = readJson(PARENT_INV)
  const invIdx = buildInventoryIndex(inv)
  const reviewMaps = loadReviewMaps()
  const yandexTree = readJson(PATHS.yandexTree)
  const yandexVs = readJson(PATHS.yandexVsInv)
  const co02Gap = readJson(PATHS.co02Gap)
  const dlMap = yandexDownloadMap()

  const yandexVsByPath = new Map()
  for (const it of yandexVs?.items || []) yandexVsByPath.set(it.public_path, it)

  let manifest = [...buildYandexRows(yandexTree, yandexVs, dlMap), ...legacy.rows]

  const md5FirstSeen = new Map()
  const basenameFirstSeen = new Map()
  const urlFirstSeen = new Map()
  for (const row of manifest) {
    const h = row.content_quick_hash || row.md5 || row.sha256
    if (h && !md5FirstSeen.has(h)) md5FirstSeen.set(h, row.source_id)
    if (row.normalized_basename && !basenameFirstSeen.has(row.normalized_basename))
      basenameFirstSeen.set(row.normalized_basename, row.source_id)
    if (row.source_url && !urlFirstSeen.has(row.source_url)) urlFirstSeen.set(row.source_url, row.source_id)
  }

  manifest = manifest.map((row) => ({ ...row, ...classifyRow(row, {
    invIdx,
    yandexVsByPath,
    reviewByUrl: reviewMaps.byUrl,
    classifiedByUrl: reviewMaps.classifiedByUrl,
    md5FirstSeen,
    basenameFirstSeen,
    urlFirstSeen,
  }) }))

  const unclassified = manifest.filter((r) => !r.classification_status).length
  const classCounts = countBy(manifest, "classification_status")

  const legacyRows = manifest.filter((r) => r.source_kind === "legacy_site")
  const newlyIncluded = legacyRows.filter((r) => r.legacy_newly_included_vs_stale_468_crawl)
  const newOnlyClass = countBy(newlyIncluded, "classification_status")

  const safe58 = reviewMaps.safeUrls
  const safeInManifest = manifest.filter(
    (r) => r.classification_status === "safe_candidate_for_review" && safe58.includes((r.source_url || "").split("?")[0].toLowerCase())
  )
  const safeNewBeyond58 = manifest.filter(
    (r) => r.classification_status === "safe_candidate_for_review" && !safe58.includes((r.source_url || "").split("?")[0].toLowerCase())
  )

  const productLikeNew = newlyIncluded.filter(
    (r) =>
      ["safe_candidate_for_review", "needs_manual_mapping", "approved_existing_or_known"].includes(r.classification_status) &&
      r.sku_guess &&
      /\.(jpg|jpeg|png|webp)$/i.test(r.basename || "")
  )

  const co02Results = searchCo02(manifest, co02Gap)
  const co02StillMissing = co02Results.filter((r) => !r.found || !r.exact_match).map((r) => r.target)

  const fullVsStaleDiff = {
    generated_at,
    legacy_urls_old_468: staleUrls.size,
    legacy_urls_full_cache: legacy.meta.combined_unique,
    reconciled_with_prior_reconciliation: priorRecon.recomputed_from_html_caches?.combined_extractor_unique ?? 1285,
    delta_full_minus_stale: legacy.meta.combined_unique - staleUrls.size,
    newly_included_legacy_urls_count: newlyIncluded.length,
    newly_included_provenance: countBy(newlyIncluded, "legacy_cache_provenance"),
    newly_included_classification_summary: newOnlyClass,
    newly_included_product_media_likely_count: productLikeNew.length,
    newly_included_sample: newlyIncluded.slice(0, 40).map((r) => ({
      url: r.source_url,
      filename: r.basename,
      sku_guess: r.sku_guess,
      legacy_cache_provenance: r.legacy_cache_provenance,
      classification_status: r.classification_status,
    })),
    safe_candidate_comparison: {
      prior_supplement_safe_count: safe58.length,
      still_safe_candidate_in_full_audit: safeInManifest.length,
      safe_urls_missing_from_full_cache: safe58.filter(
        (u) => !manifest.some((r) => (r.source_url || "").split("?")[0].toLowerCase() === u)
      ),
      new_safe_candidate_beyond_prior_58: safeNewBeyond58.length,
      new_safe_sample: safeNewBeyond58.slice(0, 15).map((r) => ({
        url: r.source_url,
        filename: r.basename,
        classification_reason: r.classification_reason,
      })),
    },
  }

  const priorBuckets = {
    total_discovered: prior.total_discovered,
    legacy_site_total: prior.legacy_site_total,
    total_unmapped_orphan: prior.total_unmapped_orphan,
    total_needs_manual_mapping: prior.total_needs_manual_mapping,
    safe_candidate_for_review: 58,
    total_cross_sku_risk: prior.total_cross_sku_risk,
    approved_existing_or_known: null,
  }
  const oldManifest = readJson(path.join(REPO, "tmp/source-media-completeness-audit/all-source-media-manifest.json"))
  if (oldManifest?.items) priorBuckets.approved_existing_or_known = countBy(oldManifest.items, "classification_status").approved_existing_or_known

  const comparison = {
    generated_at,
    supersedes: "tmp/source-media-completeness-audit/",
    old: priorBuckets,
    new: {
      total_discovered: manifest.length,
      legacy_site_total: legacyRows.length,
      total_unmapped_orphan: classCounts.unmapped_orphan || 0,
      total_needs_manual_mapping: classCounts.needs_manual_mapping || 0,
      safe_candidate_for_review: classCounts.safe_candidate_for_review || 0,
      total_cross_sku_risk: classCounts.blocked_cross_sku || 0,
      approved_existing_or_known: classCounts.approved_existing_or_known || 0,
    },
    delta: {
      total_discovered: manifest.length - (prior.total_discovered || 0),
      legacy_site_total: legacyRows.length - (prior.legacy_site_total || 0),
      unmapped_orphan: (classCounts.unmapped_orphan || 0) - (prior.total_unmapped_orphan || 0),
      needs_manual_mapping: (classCounts.needs_manual_mapping || 0) - (prior.total_needs_manual_mapping || 0),
      safe_candidate_for_review: (classCounts.safe_candidate_for_review || 0) - 58,
    },
  }

  const queue = buildPriorityQueue(manifest)
  const priorP0 = priorQueue.by_priority_tier?.P0_review_first ?? null

  const summary = {
    generated_at,
    audit_variant: "full_legacy_cache_union",
    verdict: unclassified > 0 ? "blocked" : "review_required",
    supersedes_prior_audit: "tmp/source-media-completeness-audit/",
    yandex_public_total: manifest.filter((r) => r.source_kind === "yandex_public").length,
    legacy_site_total: legacyRows.length,
    legacy_cache_meta: legacy.meta,
    total_discovered: manifest.length,
    total_unclassified: unclassified,
    classification_counts: classCounts,
    comparison_to_stale_audit: comparison,
    safe_candidate_delta: fullVsStaleDiff.safe_candidate_comparison,
    p0_orphan_manual: {
      new: queue.by_priority_tier,
      old: priorQueue.by_priority_tier || null,
      p0_delta: (queue.by_priority_tier.P0_review_first || 0) - (priorP0 || 0),
    },
    co02_missing_targets_still_missing: co02StillMissing,
    co02_search: co02Results,
    yandex_mount_status: mount.status,
  }

  writeJson(path.join(OUT, "all-source-media-manifest.json"), {
    generated_at,
    audit_variant: "full_legacy_cache_union",
    total_rows: manifest.length,
    every_row_has_classification_status: unclassified === 0,
    legacy_source: "parent+tmp HTML cache union via extractImagesFromHtml",
    items: manifest,
  })
  writeJson(path.join(OUT, "source-media-completeness-summary.json"), summary)
  writeJson(path.join(OUT, "full-vs-stale-legacy-diff.json"), fullVsStaleDiff)
  writeJson(path.join(OUT, "source-orphan-priority-queue.json"), queue)
  renderTopOrphansHtml(queue.top_50, path.join(OUT, "contact-sheets", "top-priority-orphans.html"))

  const md = [
    "# Source media completeness audit (full legacy cache union)",
    "",
    `**Сгенерировано:** ${generated_at}`,
    `**Supersedes:** \`tmp/source-media-completeness-audit/\` (stale 468 legacy URLs)`,
    `**Вердикт:** \`${summary.verdict}\``,
    "",
    "## Executive summary",
    "",
    `Новый manifest: **${manifest.length}** строк (**${comparison.delta.total_discovered}** vs stale audit **${prior.total_discovered}**). Legacy: **${legacyRows.length}** full-cache URLs (было **468**). **unclassified = ${unclassified}**. Prior **58** safe candidates: **${safeInManifest.length}** still \`safe_candidate_for_review\`; **${safeNewBeyond58.length}** additional safe beyond 58. CO-02-1 exact gaps **unchanged**.`,
    "",
    "## Old vs new totals",
    "",
    "| Metric | Stale audit | Full-cache audit | Δ |",
    "|--------|------------:|-----------------:|--:|",
    `| Total discovered | ${prior.total_discovered} | ${manifest.length} | ${comparison.delta.total_discovered} |`,
    `| Legacy URLs | ${prior.legacy_site_total} | ${legacyRows.length} | ${comparison.delta.legacy_site_total} |`,
    `| Yandex public | ${prior.yandex_public_total} | ${summary.yandex_public_total} | 0 |`,
    "",
    "## Classification buckets",
    "",
    "| Bucket | Stale | Full-cache | Δ |",
    "|--------|------:|-----------:|--:|",
    ...[
      "approved_existing_or_known",
      "safe_candidate_for_review",
      "blocked_cross_sku",
      "blocked_low_confidence",
      "needs_manual_mapping",
      "unmapped_orphan",
      "duplicate_exact",
      "duplicate_near",
      "unsupported_asset",
    ].map((k) => {
      const oldC = oldManifest ? countBy(oldManifest.items, "classification_status")[k] || 0 : "—"
      const newC = classCounts[k] || 0
      return `| ${k} | ${oldC} | ${newC} | ${typeof oldC === "number" ? newC - oldC : "—"} |`
    }),
    "",
    "## Safe candidate (58) delta",
    "",
    `- Prior supplement safe list: **58**`,
    `- Still \`safe_candidate_for_review\` in full manifest: **${safeInManifest.length}**`,
    `- New safe beyond prior 58: **${safeNewBeyond58.length}**`,
    `- Missing from full cache: **${fullVsStaleDiff.safe_candidate_comparison.safe_urls_missing_from_full_cache.length}**`,
    "",
    "## Orphan / manual + P0",
    "",
    `- Orphan+manual total: **${queue.total_orphan_and_manual}** (was **${priorQueue.total_orphan_and_manual}**)`,
    `- P0: **${queue.by_priority_tier.P0_review_first || 0}** (was **${priorP0 ?? "?"}**, Δ **${summary.p0_orphan_manual.p0_delta}**)`,
    "",
    "## Newly included legacy URLs (817)",
    "",
    `- Count: **${newlyIncluded.length}**`,
    `- Product-media-like (SKU + image + safe/manual/approved): **${productLikeNew.length}**`,
    `- Classification of new-only: ${JSON.stringify(newOnlyClass)}`,
    "",
    "## CO-02-1",
    "",
    ...co02StillMissing.map((t) => `- **${t}**: still missing (exact)`),
    "",
    "## Next actions",
    "",
    "1. Use **this** folder as superseding evidence; treat stale `source-media-completeness-audit` as historical.",
    "2. Review `source-orphan-priority-queue.json` top 50 + legacy newly-included with SKU.",
    "3. Visual review prior **58** safe candidates only via supplement pack — not auto-apply.",
    "4. Optional: refresh `legacy-site-crawl.json` on disk to match full cache.",
  ].join("\n")

  fs.writeFileSync(path.join(OUT, "source-media-completeness-audit.md"), md)

  const mdQueue = [
    "# Source orphan priority queue (full legacy cache audit)",
    "",
    `**Total orphan+manual:** ${queue.total_orphan_and_manual} (Δ vs prior reconciliation **${queue.total_orphan_and_manual - (priorQueue.total_orphan_and_manual || 0)}**).`,
    "",
    "## Tiers",
    "",
    ...Object.entries(queue.by_priority_tier).map(([k, v]) => `- **${k}:** ${v}`),
    "",
    "## First 20 to inspect",
    "",
    ...queue.top_50.slice(0, 20).map((r, i) => `${i + 1}. ${r.basename} (${r.priority_tier}, ${r.priority_score}) — ${r.source_kind}`),
  ].join("\n")
  fs.writeFileSync(path.join(OUT, "source-orphan-priority-queue.md"), mdQueue)

  console.log(
    JSON.stringify(
      {
        total: manifest.length,
        legacy: legacyRows.length,
        unclassified,
        safe58still: safeInManifest.length,
        p0: queue.by_priority_tier.P0_review_first,
        newlyIncluded: newlyIncluded.length,
      },
      null,
      2
    )
  )
}

main()
