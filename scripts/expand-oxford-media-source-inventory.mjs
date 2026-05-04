#!/usr/bin/env node
/**
 * Oxford media source expansion — read-only inventory + optional MVP JSON merge.
 * Does NOT touch Medusa DB, seed/validation/sync/runner, media apply, catalog-scope,
 * or Oxford pilot evidence JSON. Does NOT copy/move/delete source images.
 *
 * Usage (repo root):
 *   node scripts/expand-oxford-media-source-inventory.mjs
 *   node scripts/expand-oxford-media-source-inventory.mjs --no-merge-mvp
 *
 * Writes:
 *   data/normalized/oxford-source-expansion-inventory.json
 *   data/normalized/oxford-source-expansion-summary.json
 *   docs/project/oxford-source-expansion-report.md
 *
 * With merge (default): extends (does not replace) MVP artifacts:
 *   data/normalized/oxford-local-mvp-media-inventory.json
 *   data/normalized/oxford-local-mvp-sku-media-candidate-map.json
 *   data/normalized/oxford-local-mvp-media-assignment-plan.json
 */

import fs from "fs"
import path from "path"
import crypto from "crypto"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, "..")

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"])

const YANDEX_WHITE_BG_SUFFIX = path.join("WOODRIGHT", "Контент ", "Фото на белом фоне")

const ABSOLUTE_YANDEX_ROOT_CANDIDATES = [
  "/WOODRIGHT/Контент /Фото на белом фоне",
  "/Users/leonidmbp/Yandex.Disk/WOODRIGHT/Контент /Фото на белом фоне",
  "/Users/leonidmbp/Yandex Disk/WOODRIGHT/Контент /Фото на белом фоне",
]

const REPO_SCAN_ROOTS = [
  "apps/backend/static/products/oxford",
  "apps/backend/static/products",
  "apps/backend/uploads/products",
  "data/raw/assets",
  "data/raw/downloaded-assets",
  "data/processed/storefront-assets",
  "data/raw/pdf-assets/extracted/Oxford_full",
  "data/raw/pdf-assets/extracted",
  "data/raw/pdf-assets/manifests",
  "data/processed/asset-manifests",
  "data/raw/front",
]

const REFERENCE_JSON_GLOB = "data/normalized"

/** Only scan JSON that may list media paths — never evidence / promotion governance blobs. */
/** Exclude MVP outputs we merge into (would only duplicate path strings). */
const OXFORD_JSON_PATH_SCAN_ALLOWLIST = new Set([
  "oxford-visual-source-inventory.json",
  "oxford-visual-candidate-map.json",
  "oxford-mapping-manifest.json",
  "oxford-review-queue.json",
])

const SKU_TOKEN_RE = /\b(OX-\d{2,3}-\d{1,2}|S-OX-\d{2,3}|SH-\d{2,3}-\d{1,2}|MC-OX-\d{2,3}-\d+)\b/gi

function readJson(rel) {
  const abs = path.join(REPO, rel)
  if (!fs.existsSync(abs)) return null
  try {
    return JSON.parse(fs.readFileSync(abs, "utf8"))
  } catch {
    return null
  }
}

function safeRel(p) {
  return path.relative(REPO, p).replace(/\\/g, "/")
}

function isImageFile(name) {
  return IMAGE_EXT.has(path.extname(name).toLowerCase())
}

function posix(s) {
  return String(s || "").replace(/\\/g, "/").trim()
}

function isOxfordRelatedRel(rel) {
  const s = posix(rel).toLowerCase()
  if (s.includes("/oxford/")) return true
  if (s.includes("/коллекции /oxford") || s.includes("/коллекции/oxford")) return true
  if (s.includes("oxford_full")) return true
  if (s.includes("оксфорд")) return true
  if (/ox-\d{2}-\d{1,2}/.test(s)) return true
  if (/s-ox-\d{2}/.test(s)) return true
  if (/sh-\d{2}-\d{1,2}/.test(s)) return true
  if (/mc-ox-/i.test(s)) return true
  if (/^ox-\d{2}-\d{1,2}_interim/.test(path.basename(s))) return true
  if (/^oxford\s*\d+\.(jpe?g|png|webp|gif|avif)$/i.test(path.basename(s))) return true
  if (/\boxford\b/.test(s) && (s.includes("woodright") || s.includes("/oxford"))) return true
  return false
}

function isOxfordRelatedAbs(absPath) {
  return isOxfordRelatedRel(absPath)
}

function discoverVolumeYandexRoots() {
  const out = []
  const volBase = "/Volumes"
  try {
    if (!fs.existsSync(volBase)) return out
    for (const name of fs.readdirSync(volBase)) {
      if (name === "Macintosh HD") continue
      const candidate = path.join(volBase, name, YANDEX_WHITE_BG_SUFFIX)
      out.push(candidate)
    }
  } catch {
    /* ignore */
  }
  return out
}

function classifyAbsoluteRoot(absPath) {
  try {
    if (!fs.existsSync(absPath)) return { status: "missing", detail: null }
    const st = fs.statSync(absPath)
    if (!st.isDirectory()) return { status: "not_accessible", detail: "not_a_directory" }
    let entries
    try {
      entries = fs.readdirSync(absPath)
    } catch (e) {
      return { status: "not_accessible", detail: e?.message || String(e) }
    }
    if (!entries.length) return { status: "empty", detail: null }
    return { status: "mounted", detail: null }
  } catch (e) {
    return { status: "not_accessible", detail: e?.message || String(e) }
  }
}

function classifyRepoRoot(relFromRepo) {
  const abs = path.join(REPO, relFromRepo)
  try {
    if (!fs.existsSync(abs)) return { status: "missing", abs }
    const st = fs.statSync(abs)
    if (st.isFile()) return { status: "mounted", abs }
    if (!st.isDirectory()) return { status: "not_accessible", abs }
    const entries = fs.readdirSync(abs)
    if (!entries.length) return { status: "empty", abs }
    return { status: "mounted", abs }
  } catch (e) {
    return { status: "not_accessible", abs: e?.message }
  }
}

function matchSkuFromFilename(filename) {
  const set = new Set()
  const fn = filename || ""
  const mHandle = fn.match(/^(ox-\d{2,3}-\d{1,2})(?=[_\-.])/i)
  if (mHandle) set.add(mHandle[1].toUpperCase())
  const mS = fn.match(/^(s-ox-\d{2,3})(?=[_\-.])/i)
  if (mS) set.add(mS[1].toUpperCase().replace(/^s-ox-/i, "S-OX-"))
  let m
  const reUpper = /\b(OX-\d{2,3}-\d{1,2}|S-OX-\d{2,3}|SH-\d{2,3}-\d{1,2}|MC-OX-\d{2,3}-\d{1,2})\b/gi
  while ((m = reUpper.exec(fn))) {
    set.add(m[1].toUpperCase().replace(/^OX-/i, "OX-").replace(/^S-OX-/i, "S-OX-"))
  }
  return [...set]
}

function skuToHandle(sku) {
  return String(sku || "")
    .trim()
    .toLowerCase()
}

function loadKnownOxfordSkus() {
  const set = new Set()
  const wb = readJson("data/normalized/product-workbook-asset-map.json")
  for (const r of wb?.rows || []) {
    if (r?.collection_name_normalized === "oxford" && r?.product_code_normalized) {
      set.add(String(r.product_code_normalized).toUpperCase())
    }
  }
  const seed = readJson("data/normalized/seed-products.oxford-pilot-four.json") || []
  for (const row of seed) {
    if (row?.medusa_variant_sku) set.add(String(row.medusa_variant_sku).toUpperCase())
  }
  const cmap = readJson("data/normalized/oxford-visual-candidate-map.json")
  for (const row of cmap?.rows || []) {
    if (row?.sku) set.add(String(row.sku).toUpperCase())
  }
  const skuMap = readJson("data/normalized/oxford-local-mvp-sku-media-candidate-map.json")
  for (const row of skuMap?.rows || []) {
    if (row?.sku) set.add(String(row.sku).toUpperCase())
  }
  return set
}

function sha256File(absPath) {
  try {
    const hash = crypto.createHash("sha256")
    const buf = fs.readFileSync(absPath)
    hash.update(buf)
    return { hash: hash.digest("hex"), size_bytes: buf.length }
  } catch {
    return { hash: null, size_bytes: null }
  }
}

function readImageDimensions(absPath) {
  try {
    const fd = fs.openSync(absPath, "r")
    const buf = Buffer.allocUnsafe(32768)
    const n = fs.readSync(fd, buf, 0, buf.length, 0)
    fs.closeSync(fd)
    const b = buf.subarray(0, n)
    const ext = path.extname(absPath).toLowerCase()
    if (ext === ".png" && b.length >= 24 && b[0] === 0x89 && b.readUInt32BE(12) === 0x49484452) {
      return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
    }
    if ((ext === ".jpg" || ext === ".jpeg") && b.length > 4) {
      let i = 0
      while (i < b.length - 1) {
        if (b[i] === 0xff && (b[i + 1] === 0xc0 || b[i + 1] === 0xc2) && i + 9 < b.length) {
          return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) }
        }
        i++
      }
    }
    if (ext === ".gif" && b.length >= 10 && b.slice(0, 3).toString() === "GIF") {
      return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) }
    }
    if (ext === ".webp" && b.length >= 30 && b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP") {
      const chunk = b.slice(12, 16).toString()
      if (chunk === "VP8X" && b.length >= 30) {
        return {
          width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)),
          height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)),
        }
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

function inferSourceKindFromRel(rel) {
  const s = posix(rel)
  if (s.startsWith("apps/backend/static/products/")) return "backend_static"
  if (s.startsWith("apps/backend/uploads/")) return "uploaded"
  if (s.startsWith("data/raw/pdf-assets/")) return "pdf_extract"
  if (s.startsWith("data/raw/downloaded-assets") || s.startsWith("data/raw/assets")) return "downloaded_asset"
  if (s.startsWith("data/processed/storefront-assets")) return "processed_asset"
  if (s.startsWith("data/processed/asset-manifests")) return "processed_asset"
  if (s.startsWith("data/raw/front/")) return "legacy_front"
  return "unknown"
}

function inferMediaClassGuess(rel, filename, sourceKind) {
  const lower = (posix(rel) + filename).toLowerCase()
  if (lower.includes("фото на белом") || lower.includes("white_bg")) return "white_background_candidate_unverified"
  if (/_interim_pdf_gallery/i.test(filename)) return "interim_non_white"
  if (/Oxford_full_p/i.test(filename)) return "pdf_crop"
  if (/^oxford\s*\d+/i.test(filename)) return "legacy_reference"
  if (sourceKind === "legacy_front") return "legacy_reference"
  return "interim_non_white"
}

function previewRouteExpectedForRepoRel(repoRel, exists) {
  const rel = posix(repoRel)
  if (!exists) return { is_previewable_now: false, preview_route_expected: null }
  if (rel.startsWith("apps/backend/static/")) {
    const suffix = rel.replace(/^apps\/backend\/static\//, "")
    return {
      is_previewable_now: true,
      preview_route_expected: `{MEDUSA_ORIGIN}/static/${suffix}`,
    }
  }
  const allowedPrefixes = [
    "data/raw/pdf-assets/extracted/Oxford_full/",
    "data/raw/assets/",
    "data/raw/downloaded-assets/",
    "data/processed/storefront-assets/",
    "data/raw/front/",
  ]
  if (rel.startsWith("data/") && allowedPrefixes.some((p) => rel.startsWith(p)) && isImageFile(path.basename(rel))) {
    if (rel.startsWith("data/raw/front/") && rel.endsWith(".json")) {
      return { is_previewable_now: false, preview_route_expected: null }
    }
    return {
      is_previewable_now: true,
      preview_route_expected: `/qa/oxford-local-mvp-media-review/preview?rel=${encodeURIComponent(rel)}`,
    }
  }
  return { is_previewable_now: false, preview_route_expected: null }
}

function walkRepoImages(rootRel, maxDepth, seenRel, out) {
  const absRoot = path.join(REPO, rootRel)
  const cls = classifyRepoRoot(rootRel)
  if (cls.status === "missing") return { walk_status: cls.status, files: 0 }
  if (cls.status === "not_accessible" || cls.status === "empty") return { walk_status: cls.status, files: 0 }

  function walk(dir, depth) {
    if (depth > maxDepth) return
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        if (ent.name === "node_modules" || ent.name === ".git") continue
        walk(full, depth + 1)
      } else if (ent.isFile() && isImageFile(ent.name)) {
        const rel = safeRel(full)
        if (!isOxfordRelatedRel(rel)) continue
        if (seenRel.has(rel)) continue
        seenRel.add(rel)
        out.push(rel)
      }
    }
  }

  const st = fs.statSync(absRoot)
  if (st.isFile()) {
    const rel = safeRel(absRoot)
    if (isImageFile(absRoot) && isOxfordRelatedRel(rel) && !seenRel.has(rel)) {
      seenRel.add(rel)
      out.push(rel)
    }
    return { walk_status: "ok", files: 1 }
  }
  walk(absRoot, 0)
  return { walk_status: "ok", files: out.length }
}

function walkAbsoluteImages(absRoot, maxDepth, outAbs) {
  const cls = classifyAbsoluteRoot(absRoot)
  if (cls.status !== "mounted") return cls

  function walk(dir, depth) {
    if (depth > maxDepth) return
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        walk(full, depth + 1)
      } else if (ent.isFile() && isImageFile(ent.name)) {
        if (isOxfordRelatedAbs(full)) outAbs.push(full)
      }
    }
  }
  walk(absRoot, 0)
  return { status: "mounted", detail: null }
}

function frontManifestOxfordPredicate(row) {
  if (!row || typeof row !== "object") return false
  const hint = String(row.collection_hint || "").toLowerCase()
  if (hint === "oxford" || hint.includes("oxford")) return true
  const ref = posix(row.source_ref || "")
  const fn = String(row.filename || "")
  const blob = `${ref} ${fn}`.toLowerCase()
  if (/оксфорд/i.test(blob)) return true
  if (/\/oxford\s*\//i.test(ref) || /\/коллекции\s*\/oxford/i.test(ref)) return true
  if (/\b(ox-\d{2}-\d{1,2}|s-ox-\d{2,3})\b/i.test(blob)) return true
  if (/\boxford\s+\d+/i.test(blob)) return true
  if (ref && isOxfordRelatedRel(ref)) return true
  if (fn && isOxfordRelatedRel(fn)) return true
  return false
}

function loadFrontManifestOxfordRows() {
  const fm = readJson("data/raw/front/front-manifest.json")
  if (!Array.isArray(fm)) return []
  return fm.filter(frontManifestOxfordPredicate)
}

function scanNormalizedOxfordJsonRefs() {
  const dir = path.join(REPO, REFERENCE_JSON_GLOB)
  const refs = []
  if (!fs.existsSync(dir)) return refs
  let files
  try {
    files = fs.readdirSync(dir)
  } catch {
    return refs
  }
  for (const f of files) {
    if (!f.endsWith(".json")) continue
    if (!OXFORD_JSON_PATH_SCAN_ALLOWLIST.has(f)) continue
    const abs = path.join(dir, f)
    let raw
    try {
      raw = fs.readFileSync(abs, "utf8")
    } catch {
      continue
    }
    const seen = new Set()
    let m
    const rx = /([a-z0-9_./\\-]+\.(?:png|jpe?g|webp|gif|avif))/gi
    while ((m = rx.exec(raw))) {
      let p = m[1].replace(/\\/g, "/")
      if (p.startsWith("http")) continue
      if (!isOxfordRelatedRel(p)) continue
      if (seen.has(p)) continue
      seen.add(p)
      refs.push({ from_json: posix(path.join(REFERENCE_JSON_GLOB, f)), path_guess: p })
    }
  }
  return refs
}

function classifyMatch(skuCandidates, knownSkus) {
  const normalized = skuCandidates.map((s) => String(s).toUpperCase())
  const knownHits = normalized.filter((s) => knownSkus.has(s))
  if (knownHits.length === 1) return { confidence: "high", bucket: "confirmed_sku_match", sku_candidates: knownHits }
  if (knownHits.length > 1) return { confidence: "medium", bucket: "ambiguous_oxford_media", sku_candidates: knownHits }
  if (normalized.length === 1 && !knownSkus.has(normalized[0]))
    return { confidence: "low", bucket: "probable_sku_match", sku_candidates: normalized }
  if (normalized.length > 1)
    return { confidence: "low", bucket: "ambiguous_oxford_media", sku_candidates: normalized }
  return { confidence: "low", bucket: "orphan_oxford_media", sku_candidates: [] }
}

function buildExpansionRecord(opts) {
  const {
    source_root,
    source_kind,
    path_or_url,
    repo_relative_path,
    filename,
    exists_locally,
    knownSkus,
    match_reason,
    hash,
    size_bytes,
    dimensions,
    warnings,
    recommended_next_action,
    manifest_row,
  } = opts

  const fn = filename || path.basename(path_or_url || "")
  const skuFromName = matchSkuFromFilename(fn)
  const pathTokens = matchSkuFromFilename(posix(path_or_url))
  const skuCandidates = [...new Set([...skuFromName, ...pathTokens])]
  const cls = classifyMatch(skuCandidates, knownSkus)

  const media_class_guess = inferMediaClassGuess(repo_relative_path || path_or_url || "", fn, source_kind)

  let preview = { is_previewable_now: false, preview_route_expected: null }
  if (repo_relative_path && exists_locally) {
    preview = previewRouteExpectedForRepoRel(repo_relative_path, true)
  } else if (exists_locally && /^\/Users|^\/Volumes|^\/WOODRIGHT/.test(path_or_url)) {
    preview = {
      is_previewable_now: false,
      preview_route_expected: null,
    }
    warnings.push("external_absolute_path_not_in_storefront_preview_allowlist")
    recommended_next_action =
      recommended_next_action ||
      "Copy into repo under apps/backend/static/products/oxford/ or data/raw/... allowlisted path, or extend preview policy explicitly."
  }

  return {
    source_root,
    source_kind,
    path_or_url: posix(path_or_url),
    repo_relative_path: repo_relative_path ? posix(repo_relative_path) : null,
    filename: fn,
    exists_locally: Boolean(exists_locally),
    is_previewable_now: preview.is_previewable_now,
    preview_route_expected: preview.preview_route_expected,
    hash: hash || null,
    size_bytes: size_bytes ?? null,
    dimensions: dimensions || null,
    match_reason,
    sku_candidates: cls.sku_candidates,
    confidence: cls.confidence,
    media_class_guess,
    warnings: [...new Set(warnings)],
    recommended_next_action: recommended_next_action || null,
    match_bucket: cls.bucket,
    front_manifest_asset_id: manifest_row?.asset_id ?? null,
  }
}

function dedupeExpansionRecords(records) {
  const byHash = new Map()
  const byPath = new Map()
  const byNameSize = new Map()
  const out = []
  for (const r of records) {
    const pkey = r.repo_relative_path ? posix(r.repo_relative_path) : posix(r.path_or_url)
    if (byPath.has(pkey)) continue
    byPath.set(pkey, true)
    if (r.hash) {
      if (byHash.has(r.hash)) {
        r.warnings = [...(r.warnings || []), "duplicate_hash_same_bytes_as_other_entry"]
        r.dedupe_of_hash = byHash.get(r.hash)
      } else byHash.set(r.hash, pkey)
    }
    const ns = `${r.filename}|${r.size_bytes ?? "na"}`
    if (byNameSize.has(ns) && r.repo_relative_path) {
      r.warnings = [...(r.warnings || []), "possible_duplicate_filename_size"]
    } else byNameSize.set(ns, pkey)
    out.push(r)
  }
  return out
}

function inventoryKeyFromMvpRecord(rec) {
  const rr = rec.repo_relative_path ? posix(rec.repo_relative_path) : ""
  const sr = rec.source_ref ? posix(rec.source_ref) : ""
  const ik = rec.inventory_key ? String(rec.inventory_key) : ""
  return rr || sr || ik
}

function candidateDedupeKey(c) {
  return `${posix(c.repo_relative_path || "")}|${posix(c.source_path_or_url || "")}|${c.filename || ""}`
}

function collectRepoRelativePathsFromSkuMap(map) {
  const s = new Set()
  for (const row of map.rows || []) {
    for (const c of row.candidates || []) {
      const rr = c.repo_relative_path ? posix(String(c.repo_relative_path)) : ""
      if (rr) s.add(rr)
    }
  }
  return s
}

function mergeMvpArtifacts(expansionRecords, iso) {
  const invPath = path.join(REPO, "data/normalized/oxford-local-mvp-media-inventory.json")
  const mapPath = path.join(REPO, "data/normalized/oxford-local-mvp-sku-media-candidate-map.json")
  const planPath = path.join(REPO, "data/normalized/oxford-local-mvp-media-assignment-plan.json")

  const inv = readJson("data/normalized/oxford-local-mvp-media-inventory.json")
  const map = readJson("data/normalized/oxford-local-mvp-sku-media-candidate-map.json")
  const plan = readJson("data/normalized/oxford-local-mvp-media-assignment-plan.json")
  if (!inv || !map || !plan) {
    console.error("MVP JSON missing; skip merge. Run build-oxford-local-mvp-media-artifacts.mjs first.")
    return { merged: false }
  }

  const existingKeys = new Set()
  for (const rec of inv.inventory_records || []) {
    existingKeys.add(inventoryKeyFromMvpRecord(rec))
  }

  const staticBase = "http://localhost:9000/static"
  let addedInv = 0
  const newInventoryRecords = [...(inv.inventory_records || [])]

  for (const r of expansionRecords) {
    if (r.match_bucket === "rejected_not_oxford") continue
    const key = r.repo_relative_path ? posix(r.repo_relative_path) : posix(r.path_or_url)
    if (!key || existingKeys.has(key)) continue

    const invRec = {
      inventory_id: `expansion_${crypto.createHash("sha256").update(key).digest("hex").slice(0, 20)}`,
      repo_relative_path: r.repo_relative_path,
      source_ref: r.repo_relative_path ? null : r.path_or_url,
      filename: r.filename,
      source_kind: r.source_kind,
      exists_locally: r.exists_locally,
      inherited_from: "scripts/expand-oxford-media-source-inventory.mjs",
      match_tier: "new_source_expansion_candidate",
      media_class: r.media_class_guess,
      filename_sku_tokens: r.sku_candidates?.length ? r.sku_candidates : matchSkuFromFilename(r.filename),
      expansion_notes: r.match_reason,
      local_binary_status: r.exists_locally ? null : "source_not_mounted_or_external_only",
    }
    if (!r.repo_relative_path) {
      invRec.exists_locally = r.exists_locally
      if (!r.exists_locally) invRec.local_binary_status = "source_not_mounted_or_external_only"
    }
    newInventoryRecords.push(invRec)
    existingKeys.add(key)
    addedInv += 1
  }

  inv.inventory_records = newInventoryRecords
  inv.total_inventory_records = newInventoryRecords.length
  inv.audit_meta = {
    ...(inv.audit_meta || {}),
    last_expansion_merge_at: iso,
    expansion_pass: "oxford_media_source_expansion",
  }

  const rows = map.rows || []
  const handleBySku = new Map(rows.map((x) => [String(x.sku).toUpperCase(), x.handle]))
  const globalRepoRel = collectRepoRelativePathsFromSkuMap(map)

  let addedCand = 0
  for (const sm of rows) {
    const sku = String(sm.sku || "").toUpperCase()
    const existingCandKeys = new Set((sm.candidates || []).map(candidateDedupeKey))
    for (const r of expansionRecords) {
      if (!r.repo_relative_path || !r.exists_locally) continue
      if (r.match_bucket === "ambiguous_oxford_media") continue
      if (!r.sku_candidates?.includes(sku)) continue
      const rel = posix(r.repo_relative_path)
      if (globalRepoRel.has(rel)) continue
      let source_path_or_url = rel
      if (rel.startsWith("apps/backend/static/")) {
        source_path_or_url = `${staticBase}/${rel.replace(/^apps\/backend\/static\//, "")}`
      }
      const cand = {
        source_path_or_url,
        repo_relative_path: rel,
        filename: r.filename,
        source_kind: r.source_kind,
        match_tier: "new_source_expansion_candidate",
        matched_sku: sku,
        matched_handle: handleBySku.get(sku) || skuToHandle(sku),
        confidence: r.match_bucket === "confirmed_sku_match" ? "confirmed" : r.match_bucket === "probable_sku_match" ? "probable" : "unassigned",
        media_class: r.media_class_guess,
        recommended_use: "keep_unassigned_for_review",
        reason: `Source expansion inventory: ${r.match_reason}`,
        warnings: [...(r.warnings || []), "not_white_background_ready", "expansion_merge_review_required"],
      }
      const ck = candidateDedupeKey(cand)
      if (existingCandKeys.has(ck)) continue
      existingCandKeys.add(ck)
      sm.candidates = [...(sm.candidates || []), cand]
      globalRepoRel.add(rel)
      addedCand += 1
    }
    sm.candidate_file_count = (sm.candidates || []).length
  }

  let planGalleryAdds = 0
  const planRows = plan.rows || []
  for (const pr of planRows) {
    const sku = String(pr.sku || "").toUpperCase()
    const gallery = [...(pr.proposed_gallery_urls || [])]
    const seen = new Set(gallery.map((u) => posix(u)))
    const backlog = [...(pr.gallery_review_backlog_urls || [])]
    const seenB = new Set(backlog.map((u) => posix(u)))
    const primary = pr.proposed_primary_url ? posix(pr.proposed_primary_url) : ""

    for (const r of expansionRecords) {
      if (!r.repo_relative_path || !r.exists_locally) continue
      if (!r.sku_candidates?.includes(sku)) continue
      if (r.match_bucket !== "confirmed_sku_match") continue
      const rel = posix(r.repo_relative_path)
      if (!rel.startsWith("apps/backend/static/")) continue
      const url = `${staticBase}/${rel.replace(/^apps\/backend\/static\//, "")}`
      if (!url.startsWith("http")) continue
      if (seen.has(url) || seenB.has(url) || url === primary) continue
      gallery.push(url)
      seen.add(url)
      planGalleryAdds += 1
    }
    pr.proposed_gallery_urls = gallery
  }

  plan.audit_meta = { ...(plan.audit_meta || {}), last_expansion_merge_at: iso }

  fs.writeFileSync(invPath, JSON.stringify(inv, null, 2) + "\n")
  fs.writeFileSync(mapPath, JSON.stringify(map, null, 2) + "\n")
  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2) + "\n")

  return { merged: true, addedInv, addedCand, planGalleryAdds }
}

function main() {
  const argv = new Set(process.argv.slice(2))
  const noMerge = argv.has("--no-merge-mvp")
  const iso = new Date().toISOString()
  const knownSkus = loadKnownOxfordSkus()

  const rootsReport = []

  for (const p of ABSOLUTE_YANDEX_ROOT_CANDIDATES) {
    const c = classifyAbsoluteRoot(p)
    rootsReport.push({
      source_root: p,
      repo_relative: false,
      role: "yandex_white_bg_expected",
      status: c.status === "mounted" ? "mounted" : c.status === "missing" ? "missing" : c.status === "empty" ? "empty" : "not_accessible",
      detail: c.detail,
    })
  }
  for (const p of discoverVolumeYandexRoots()) {
    const c = classifyAbsoluteRoot(p)
    rootsReport.push({
      source_root: p,
      repo_relative: false,
      role: "volumes_yandex_white_bg_candidate",
      status: c.status === "mounted" ? "mounted" : c.status === "missing" ? "missing" : c.status === "empty" ? "empty" : "not_accessible",
      detail: c.detail,
    })
  }

  const repoWalkSeen = new Set()
  const repoRelFiles = []
  for (const root of REPO_SCAN_ROOTS) {
    const depth = (() => {
      if (root.includes("asset-manifests")) return 3
      if (root === "data/raw/pdf-assets/extracted") return 4
      if (root.includes("static/products") && !root.endsWith("oxford")) return 8
      return 10
    })()
    const cls = classifyRepoRoot(root)
    const st =
      cls.status === "missing"
        ? "missing"
        : cls.status === "empty"
          ? "empty"
          : cls.status === "not_accessible"
            ? "not_accessible"
            : "mounted"
    rootsReport.push({
      source_root: path.join(REPO, root),
      repo_relative_path: root,
      role: "repo_scan",
      status: st,
      detail: cls.status === "missing" ? null : String(cls.abs || ""),
    })
    if (st !== "mounted") continue
    walkRepoImages(root, depth, repoWalkSeen, repoRelFiles)
  }

  const expansionRecords = []

  for (const rel of repoRelFiles) {
    const abs = path.join(REPO, rel)
    const exists = fs.existsSync(abs)
    const { hash, size_bytes } = exists ? sha256File(abs) : { hash: null, size_bytes: null }
    const dimensions = exists ? readImageDimensions(abs) : null
    const source_kind = inferSourceKindFromRel(rel)
    expansionRecords.push(
      buildExpansionRecord({
        source_root: rel.split("/")[0] + "/…",
        source_kind,
        path_or_url: rel,
        repo_relative_path: rel,
        filename: path.basename(rel),
        exists_locally: exists,
        knownSkus,
        match_reason: "repo_walk_oxford_related_path",
        hash,
        size_bytes,
        dimensions,
        warnings: [],
        recommended_next_action: null,
        manifest_row: null,
      })
    )
  }

  const absScanRoots = [...ABSOLUTE_YANDEX_ROOT_CANDIDATES, ...discoverVolumeYandexRoots()]
  const seenAbs = new Set()
  for (const root of absScanRoots) {
    const c = classifyAbsoluteRoot(root)
    if (c.status !== "mounted") continue
    const files = []
    walkAbsoluteImages(root, 14, files)
    for (const abs of files) {
      if (seenAbs.has(abs)) continue
      seenAbs.add(abs)
      const exists = fs.existsSync(abs)
      const { hash, size_bytes } = exists ? sha256File(abs) : { hash: null, size_bytes: null }
      const dimensions = exists ? readImageDimensions(abs) : null
      expansionRecords.push(
        buildExpansionRecord({
          source_root: root,
          source_kind: "yandex_or_external_disk",
          path_or_url: abs,
          repo_relative_path: null,
          filename: path.basename(abs),
          exists_locally: exists,
          knownSkus,
          match_reason: "absolute_yandex_tree_walk",
          hash,
          size_bytes,
          dimensions,
          warnings: [],
          recommended_next_action: null,
          manifest_row: null,
        })
      )
    }
  }

  const fmRows = loadFrontManifestOxfordRows()
  for (const row of fmRows) {
    const ref = posix(row.source_ref || "")
    const fn = String(row.filename || path.basename(ref))
    let exists = false
    if (ref.startsWith("/")) exists = fs.existsSync(ref)
    expansionRecords.push(
      buildExpansionRecord({
        source_root: "data/raw/front/front-manifest.json",
        source_kind: "legacy_front_manifest",
        path_or_url: ref,
        repo_relative_path: null,
        filename: fn,
        exists_locally: exists,
        knownSkus,
        match_reason: "front_manifest_oxford_predicate",
        hash: null,
        size_bytes: row.file_size_kb != null ? Math.round(Number(row.file_size_kb) * 1024) : null,
        dimensions: null,
        warnings: exists ? [] : ["manifest_path_not_resolved_locally"],
        recommended_next_action: exists ? null : "Mount Yandex/WOODRIGHT mirror or copy asset into repo for preview.",
        manifest_row: row,
      })
    )
  }

  for (const ref of scanNormalizedOxfordJsonRefs()) {
    const rel = posix(ref.path_guess)
    if (!rel || rel.includes("..")) continue
    const abs = path.join(REPO, rel)
    const exists = fs.existsSync(abs)
    if (!exists) {
      expansionRecords.push(
        buildExpansionRecord({
          source_root: ref.from_json,
          source_kind: "normalized_json_path_reference",
          path_or_url: rel,
          repo_relative_path: rel.startsWith("data/") || rel.startsWith("apps/") ? rel : null,
          filename: path.basename(rel),
          exists_locally: false,
          knownSkus,
          match_reason: `path_string_in_${path.basename(ref.from_json)}`,
          hash: null,
          size_bytes: null,
          dimensions: null,
          warnings: ["json_reference_file_missing_on_disk"],
          recommended_next_action: "Restore missing path or regenerate upstream artifact.",
          manifest_row: null,
        })
      )
      continue
    }
    const { hash, size_bytes } = sha256File(abs)
    const dimensions = readImageDimensions(abs)
    expansionRecords.push(
      buildExpansionRecord({
        source_root: ref.from_json,
        source_kind: "normalized_json_path_reference",
        path_or_url: rel,
        repo_relative_path: rel,
        filename: path.basename(rel),
        exists_locally: true,
        knownSkus,
        match_reason: `path_string_in_${path.basename(ref.from_json)}`,
        hash,
        size_bytes,
        dimensions,
        warnings: [],
        recommended_next_action: null,
        manifest_row: null,
      })
    )
  }

  const deduped = dedupeExpansionRecords(expansionRecords)

  const summary = {
    generated_at: iso,
    roots_scanned: rootsReport.length,
    roots_mounted: rootsReport.filter((r) => r.status === "mounted").length,
    roots_missing: rootsReport.filter((r) => r.status === "missing").length,
    expansion_records_total: deduped.length,
    oxford_images_found: deduped.length,
    previewable_now: deduped.filter((r) => r.is_previewable_now).length,
    unpreviewable: deduped.filter((r) => !r.is_previewable_now).length,
    white_bg_class_guess: deduped.filter((r) => r.media_class_guess === "white_background_candidate_unverified").length,
    legacy_front_manifest_rows: fmRows.length,
    pdf_or_static_guess: deduped.filter((r) =>
      ["pdf_extract", "backend_static"].includes(r.source_kind)
    ).length,
    duplicates_flagged: deduped.filter((r) => (r.warnings || []).some((w) => w.includes("duplicate"))).length,
    by_bucket: {},
    source_mount_needed_for_full_oxford_media_pool: {
      verdict: "partial_until_yandex_white_bg_mounted",
      expected_white_bg_roots: ABSOLUTE_YANDEX_ROOT_CANDIDATES,
      manifest_refs_not_local: deduped.filter(
        (r) => r.source_kind === "legacy_front_manifest" && !r.exists_locally
      ).length,
      operator_search_hints: {
        folder_tokens: ["Oxford", "oxford", "OX", "Оксфорд", "OX-", "S-OX", "ox-", "s-ox"],
        sku_patterns: ["OX-*", "S-OX-*"],
      },
    },
  }
  for (const r of deduped) {
    summary.by_bucket[r.match_bucket] = (summary.by_bucket[r.match_bucket] || 0) + 1
  }

  const outInv = {
    audit_meta: {
      pass_name: "oxford_media_source_expansion_inventory",
      generated_at: iso,
      scope: "local_dev_source_discovery_only",
      not_production_rollout: true,
      constraints: [
        "No Medusa DB / seed / validation / sync / runner / media apply",
        "No catalog-scope.ts / evidence JSON / source file moves",
        "JSON + docs artifacts only",
      ],
    },
    roots: rootsReport,
    records: deduped,
  }

  fs.mkdirSync(path.join(REPO, "data/normalized"), { recursive: true })
  fs.writeFileSync(
    path.join(REPO, "data/normalized/oxford-source-expansion-inventory.json"),
    JSON.stringify(outInv, null, 2) + "\n"
  )
  fs.writeFileSync(
    path.join(REPO, "data/normalized/oxford-source-expansion-summary.json"),
    JSON.stringify(summary, null, 2) + "\n"
  )

  let mergeResult = { merged: false }
  if (!noMerge) mergeResult = mergeMvpArtifacts(deduped, iso)

  const reportPath = path.join(REPO, "docs/project/oxford-source-expansion-report.md")
  const md = `# Oxford source expansion report

**Generated:** ${iso}  
**Verdict:** Local dev **source discovery / inventory expansion** only — **not** rollout, **not** white-background certification.

## A. Verdict

- Expansion pass indexed **${deduped.length}** Oxford-related image references (after path/hash dedupe).
- **${summary.previewable_now}** are previewable on the storefront review board today (repo-relative allowlisted paths or backend static HTTP).
- **${summary.unpreviewable}** are not previewable in-browser from current Next rules (external disk paths, missing files, or non-allowlisted data paths).
- Full white-background Yandex pool requires **WOODRIGHT** mirror mount; see \`source_mount_needed_for_full_oxford_media_pool\` in \`data/normalized/oxford-source-expansion-summary.json\`.

## B. Roots scanned / mount status

- Total root probes: **${rootsReport.length}**
- Mounted: **${summary.roots_mounted}**, Missing: **${summary.roots_missing}**
- Details: \`oxford-source-expansion-inventory.json\` → \`roots\`.

## C. Oxford images found

- **${summary.oxford_images_found}** records in expansion inventory.

## D. Previewable vs unpreviewable

- Previewable now: **${summary.previewable_now}**
- Not previewable: **${summary.unpreviewable}**

## E. SKU assignment coverage (heuristic buckets)

${JSON.stringify(summary.by_bucket, null, 2)}

## F. Review board / MVP JSON merge

- Merge MVP artifacts: **${mergeResult.merged ? "yes" : "skipped"}**${mergeResult.merged ? ` (inventory +${mergeResult.addedInv}, sku candidates +${mergeResult.addedCand}, plan gallery URLs +${mergeResult.planGalleryAdds})` : ""}.
- Re-run storefront after merge; ensure repo \`data/\` is visible to Next (Docker mounts) or sync QA JSON copies.

## G. Artifacts

| Artifact | Purpose |
|----------|---------|
| \`data/normalized/oxford-source-expansion-inventory.json\` | Full per-file expansion rows |
| \`data/normalized/oxford-source-expansion-summary.json\` | Counts + mount-needed block |
| \`scripts/expand-oxford-media-source-inventory.mjs\` | Regenerator |

## H. Safety facts

- No Medusa DB writes; no seed/validation/sync/runner; no media apply.
- No \`catalog-scope.ts\` edits; no Oxford pilot evidence JSON edits.
- No source image copy/move/delete; no binary commits from this script.

## I. Next manual step

1. Mount Yandex Disk / **WOODRIGHT** paths listed in summary JSON and re-run this script to pull additional bytes + hashes for white-background candidates.
2. Open \`/qa/oxford-local-mvp-media-review\` and confirm new **unassigned** / SKU rows show previews for new static/repo files.
3. Optional: \`node apps/storefront/scripts/sync-oxford-local-mvp-qa-json.mjs\` if using Docker without \`data/\` mount.
`
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, md)

  console.log("Wrote data/normalized/oxford-source-expansion-inventory.json")
  console.log("Wrote data/normalized/oxford-source-expansion-summary.json")
  console.log("Wrote docs/project/oxford-source-expansion-report.md")
  if (mergeResult.merged) {
    console.log(
      `Merged MVP JSON: inventory +${mergeResult.addedInv}, candidates +${mergeResult.addedCand}, plan galleries +${mergeResult.planGalleryAdds}`
    )
  } else if (noMerge) {
    console.log("Skipped MVP merge (--no-merge-mvp)")
  }
}

main()
