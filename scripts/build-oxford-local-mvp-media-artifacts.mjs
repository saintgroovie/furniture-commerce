#!/usr/bin/env node
/**
 * Oxford local MVP media — read-only harvest + assignment plan (no DB writes).
 * Does NOT run seed, validation, sync, or Oxford pilot runner scripts.
 *
 * Usage (repo root):
 *   node scripts/build-oxford-local-mvp-media-artifacts.mjs
 *
 * Optional Store probe: reads apps/storefront/.env.local for NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
 * and NEXT_PUBLIC_MEDUSA_BACKEND_URL (default http://localhost:9000).
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { spawnSync } from "child_process"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, "..")

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"])
const YANDEX_ROOTS = [
  "/WOODRIGHT/Контент /Фото на белом фоне",
  "/Users/leonidmbp/Yandex.Disk/WOODRIGHT/Контент /Фото на белом фоне",
  "/Users/leonidmbp/Yandex Disk/WOODRIGHT/Контент /Фото на белом фоне",
]

const SCAN_ROOTS = [
  "apps/backend/static/products/oxford",
  "apps/backend/static/products",
  "apps/backend/uploads/products",
  "data/raw/assets",
  "data/raw/downloaded-assets",
  "data/processed/storefront-assets",
  "data/raw/pdf-assets/extracted/Oxford_full",
  "data/raw/pdf-assets/manifests",
  "data/processed/asset-manifests",
]

const SKU_TOKEN_RE = /\b(OX-\d{2,3}-\d+|S-OX-\d{2,3}|SH-\d{2,3}-\d+|MC-OX-\d{2,3}-\d+)\b/gi

function readJson(rel) {
  const abs = path.join(REPO, rel)
  if (!fs.existsSync(abs)) return null
  return JSON.parse(fs.readFileSync(abs, "utf8"))
}

function safeRel(p) {
  return path.relative(REPO, p).replace(/\\/g, "/")
}

function isImageFile(name) {
  return IMAGE_EXT.has(path.extname(name).toLowerCase())
}

function isOxfordRelatedRel(rel) {
  const s = rel.replace(/\\/g, "/").toLowerCase()
  if (s.includes("/oxford/")) return true
  if (s.includes("oxford_full")) return true
  if (/ox-\d{2}-\d{1,2}/.test(s)) return true
  if (/s-ox-\d{2}/.test(s)) return true
  if (/sh-\d{2}-\d{1,2}/.test(s)) return true
  if (/mc-ox-/i.test(s)) return true
  if (/ox-\d{2}-\d{1,2}_interim/.test(s)) return true
  if (/^oxford \d+\.jpe?g$/i.test(path.basename(s))) return true
  return false
}

function walkImages(rootRel, maxDepth, out, seenPaths) {
  const absRoot = path.join(REPO, rootRel)
  if (!fs.existsSync(absRoot)) {
    return { status: "local_source_absent", detail: absRoot }
  }
  const stat = fs.statSync(absRoot)
  if (stat.isFile()) {
    if (!isImageFile(absRoot)) return { status: "ok", files: 0 }
    const rel = safeRel(absRoot)
    if (isOxfordRelatedRel(rel) && !seenPaths.has(rel)) {
      seenPaths.add(rel)
      out.push({ repo_relative_path: rel, source_root: rootRel })
    }
    return { status: "ok", files: 1 }
  }
  let n = 0
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
      const rel = safeRel(full)
      if (ent.isDirectory()) {
        if (ent.name === "node_modules" || ent.name === ".git") continue
        walk(full, depth + 1)
      } else if (ent.isFile() && isImageFile(ent.name)) {
        if (!isOxfordRelatedRel(rel)) continue
        if (seenPaths.has(rel)) continue
        seenPaths.add(rel)
        out.push({ repo_relative_path: rel, source_root: rootRel })
        n++
      }
    }
  }
  walk(absRoot, 0)
  return { status: "ok", files: n }
}

function skuToHandle(sku) {
  return String(sku || "")
    .trim()
    .toLowerCase()
}

function loadWorkbookOxfordRows() {
  const j = readJson("data/normalized/product-workbook-asset-map.json")
  const rows = j?.rows
  if (!Array.isArray(rows)) return []
  return rows.filter((r) => r?.collection_name_normalized === "oxford")
}

function loadEnvLocal() {
  const p = path.join(REPO, "apps/storefront/.env.local")
  if (!fs.existsSync(p)) return {}
  const raw = fs.readFileSync(p, "utf8")
  const o = {}
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    o[m[1]] = v
  }
  return o
}

function inferTierFromPath(rel, filename, priorInvCandidate) {
  if (priorInvCandidate?.confidence === "confirmed") {
    if (/_interim_pdf_gallery_01\.png$/i.test(filename)) return "confirmed_existing_interim_map"
    if (priorInvCandidate?.possible_sku_tokens?.length) return "confirmed_filename_sku_match"
    return "confirmed_existing_interim_map"
  }
  if (priorInvCandidate?.confidence === "probable") return "pdf_page_level_probable"
  if (priorInvCandidate?.confidence === "ambiguous") return "ambiguous_visual_review_needed"

  const m = filename.match(SKU_TOKEN_RE)
  if (m) return "confirmed_filename_sku_match"
  if (/Oxford_full_p\d+_i\d+/i.test(filename)) return "pdf_page_level_probable"
  if (/^oxford\s*\d+\.jpe?g$/i.test(filename)) return "probable_filename_or_legacy_match"
  if (/\/oxford\//i.test(rel)) return "probable_filename_or_legacy_match"
  return "orphan_oxford_media_unassigned"
}

function inferMediaClass(rel, filename, tier) {
  const lower = (rel + filename).toLowerCase()
  if (lower.includes("фото на белом") || lower.includes("white_bg")) return "white_background_candidate_unverified"
  if (/_interim_pdf_gallery/i.test(filename)) return "interim_non_white"
  if (/Oxford_full_p/i.test(filename)) return "pdf_crop"
  if (/^oxford\s*\d+/i.test(filename)) return "legacy_reference"
  if (tier === "confirmed_filename_sku_match" && /\.jpe?g$/i.test(filename)) return "lifestyle"
  return "interim_non_white"
}

function inferSourceKind(rel) {
  const s = rel.replace(/\\/g, "/")
  if (s.startsWith("apps/backend/static/products/")) return "backend_static"
  if (s.startsWith("apps/backend/uploads/")) return "uploaded"
  if (s.startsWith("data/raw/pdf-assets/")) return "pdf_extract"
  if (s.startsWith("data/raw/downloaded-assets") || s.startsWith("data/raw/assets"))
    return "downloaded_asset"
  if (s.startsWith("data/processed/storefront-assets")) return "processed_asset"
  if (s.startsWith("data/processed/asset-manifests")) return "processed_asset"
  return "unknown"
}

function matchSkuFromFilename(filename) {
  /** Medusa-style `ox-14-11_…` / `s-ox-05_…` prefixes plus workbook `OX-…` tokens. */
  const set = new Set()
  const mHandle = filename.match(/^(ox-\d{2,3}-\d{1,2})(?=[_\-.])/i)
  if (mHandle) set.add(mHandle[1].toUpperCase())
  const mS = filename.match(/^(s-ox-\d{2,3})(?=[_\-.])/i)
  if (mS) set.add(mS[1].toUpperCase().replace(/^S-OX-/i, "S-OX-"))
  const reUpper = /\b(OX-\d{2,3}-\d+|S-OX-\d{2,3})\b/gi
  let m
  while ((m = reUpper.exec(filename))) {
    set.add(m[1].toUpperCase().replace(/^OX-/i, "OX-").replace(/^S-OX-/i, "S-OX-"))
  }
  return [...set]
}

function main() {
  const iso = new Date().toISOString()
  const date = iso.slice(0, 10)

  const rootsReport = []
  for (const y of YANDEX_ROOTS) {
    rootsReport.push({
      path: y,
      role: "expected_yandex_white_background_mirror",
      mounted_or_found: fs.existsSync(y),
      absent_reason: fs.existsSync(y) ? null : "source_not_mounted",
    })
  }

  const walked = []
  const seen = new Set()
  for (const root of SCAN_ROOTS) {
    const depth = root.includes("asset-manifests") ? 2 : root.includes("static/products") && !root.endsWith("oxford") ? 6 : 8
    const r = walkImages(root, depth, walked, seen)
    rootsReport.push({
      path: root,
      repo_relative: true,
      role: "local_scan",
      walk_status: r.status,
      note: r.detail || null,
    })
  }

  const priorInv = readJson("data/normalized/oxford-visual-source-inventory.json")
  const priorCandidates = priorInv?.candidates ?? []
  const invByPath = new Map()
  for (const c of priorCandidates) {
    if (c?.source_path) invByPath.set(c.source_path.replace(/\\/g, "/"), c)
  }

  /** @type {Map<string, object>} */
  const inventoryRecords = new Map()

  function addRecord(rec) {
    const key = rec.repo_relative_path || rec.inventory_key || rec.source_ref
    if (!key) return
    if (!inventoryRecords.has(key)) inventoryRecords.set(key, rec)
  }

  for (const c of priorCandidates) {
    const rel = String(c.source_path || "").replace(/\\/g, "/")
    if (!rel) continue
    const abs = path.join(REPO, rel)
    const exists = fs.existsSync(abs)
    addRecord({
      inventory_id: c.id || `legacy_inv_${inventoryRecords.size}`,
      repo_relative_path: rel,
      filename: c.filename || path.basename(rel),
      source_kind: c.source_type || inferSourceKind(rel),
      exists_locally: exists,
      inherited_from: "data/normalized/oxford-visual-source-inventory.json",
      prior_confidence: c.confidence || null,
      prior_notes: c.notes || null,
    })
  }

  for (const w of walked) {
    const rel = w.repo_relative_path
    const prior = invByPath.get(rel)
    const fn = path.basename(rel)
    const tier = inferTierFromPath(rel, fn, prior)
    const skuFromName = matchSkuFromFilename(fn)
    const mediaClass = inferMediaClass(rel, fn, tier)
    addRecord({
      inventory_id: `scan_${Buffer.from(rel).toString("base64url").slice(0, 24)}`,
      repo_relative_path: rel,
      filename: fn,
      source_kind: inferSourceKind(rel),
      exists_locally: true,
      inherited_from: null,
      match_tier: tier,
      filename_sku_tokens: skuFromName,
      media_class: mediaClass,
    })
  }

  /** Front manifest Oxford collection rows (paths on Disk; usually no local binary in repo). */
  const fm = readJson("data/raw/front/front-manifest.json")
  if (Array.isArray(fm)) {
    for (const row of fm) {
      if (row?.collection_hint !== "oxford") continue
      const ref = String(row.source_ref || "")
      addRecord({
        inventory_key: `front_manifest:${row.asset_id}`,
        inventory_id: `front_manifest_${row.asset_id}`,
        repo_relative_path: null,
        source_ref: ref,
        filename: row.filename || path.basename(ref),
        source_kind: "legacy_front",
        exists_locally: false,
        local_binary_status: "source_not_mounted_or_external_only",
        inherited_from: "data/raw/front/front-manifest.json",
        match_tier: "probable_filename_or_legacy_match",
        media_class: "legacy_reference",
      })
    }
  }

  const inventoryList = [...inventoryRecords.values()]

  const workbookOxford = loadWorkbookOxfordRows()
  const pilotSeed = readJson("data/normalized/seed-products.oxford-pilot-four.json") || []
  const candidateMap = readJson("data/normalized/oxford-visual-candidate-map.json")
  const mapRows = candidateMap?.rows ?? []

  const skuIndex = new Map()
  for (const wb of workbookOxford) {
    const sku = wb.product_code_normalized
    const handle = skuToHandle(sku)
    skuIndex.set(sku, {
      sku,
      handle,
      canonical_name: wb.canonical_name ?? null,
      workbook_row_key: wb.workbook_row_key ?? null,
      medusa_handle_candidate: wb.medusa_handle_candidate ?? handle,
      identity_sources: ["product-workbook-asset-map.json"],
    })
  }
  for (const row of pilotSeed) {
    const sku = row.medusa_variant_sku
    if (!sku) continue
    const cur = skuIndex.get(sku) || {
      sku,
      handle: skuToHandle(sku),
      canonical_name: null,
      workbook_row_key: row.workbook_row_key,
      identity_sources: [],
    }
    cur.canonical_name = cur.canonical_name || row.canonical_name || row.medusa_product_title
    cur.medusa_product_title = row.medusa_product_title
    cur.medusa_product_type = row.medusa_product_type
    cur.seed_main_image_url = row.main_image_url
    cur.identity_sources.push("seed-products.oxford-pilot-four.json")
    skuIndex.set(sku, cur)
  }

  const env = loadEnvLocal()
  const base = (env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")
  const pubKey = env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

  let storeProbe = { ok: false, reason: "no_publishable_key", base_url: base }
  /** @type {Map<string, object>} */
  const medusaByHandle = new Map()

  if (pubKey) {
    try {
      const r = spawnSync(
        "curl",
        ["-sS", "-m", "25", "-H", `x-publishable-api-key: ${pubKey}`, `${base}/store/products`],
        { encoding: "utf8", maxBuffer: 80 * 1024 * 1024 }
      )
      if (r.error) throw r.error
      if (r.status !== 0) throw new Error(r.stderr || `curl_exit_${r.status}`)
      const out = r.stdout || "{}"
      const j = JSON.parse(out)
      storeProbe = { ok: true, base_url: base, product_count: (j.products || []).length }
      for (const p of j.products || []) {
        const h = p?.handle
        if (typeof h === "string" && h) {
          medusaByHandle.set(h.toLowerCase(), {
            id: p.id,
            handle: h,
            title: p.title,
            thumbnail: p.thumbnail,
            images: p.images,
            variants: p.variants,
            product_classification: p.product_classification,
            status: p.status,
          })
        }
      }
    } catch (e) {
      storeProbe = { ok: false, reason: e?.message || String(e), base_url: base }
    }
  }

  const staticBase = `${base}/static`

  /** Build per-file candidate rows for sku map */
  const fileCandidates = []
  for (const rec of inventoryList) {
    if (!rec.repo_relative_path) {
      fileCandidates.push({
        source_path_or_url: rec.source_ref || "",
        repo_relative_path: null,
        filename: rec.filename || "",
        source_kind: "legacy_front",
        match_tier: rec.match_tier || "probable_filename_or_legacy_match",
        matched_sku: null,
        matched_handle: null,
        confidence: "probable",
        media_class: "legacy_reference",
        recommended_use: "keep_unassigned_for_review",
        reason: "Manifest-only Disk path; no local binary in repo unless separately synced.",
        warnings: ["source_not_mounted_or_external_only", "ambiguous_per_sku_assignment", "not_white_background_ready"],
      })
      continue
    }
    const rel = rec.repo_relative_path
    const fn = rec.filename || path.basename(rel)
    const prior = invByPath.get(rel)
    let tier = rec.match_tier || inferTierFromPath(rel, fn, prior)
    const skuTokens = rec.filename_sku_tokens?.length
      ? rec.filename_sku_tokens
      : matchSkuFromFilename(fn)
    let matchedSku = skuTokens[0] || null
    let matchedHandle = matchedSku ? skuToHandle(matchedSku) : null

    if (tier === "pdf_page_level_probable") {
      if (/p4_i0/i.test(fn)) {
        matchedSku = "S-OX-05"
        matchedHandle = "s-ox-05"
      } else if (/p5_/i.test(fn)) {
        matchedSku = "OX-14-11"
        matchedHandle = "ox-14-11"
      } else if (/p6_/i.test(fn)) {
        matchedSku = null
        matchedHandle = null
      }
    }

    let confidence = "unassigned"
    if (
      tier.startsWith("confirmed") ||
      tier === "confirmed_existing_interim_map" ||
      tier === "confirmed_filename_sku_match" ||
      tier === "confirmed_existing_product_media"
    ) {
      confidence = "confirmed"
    } else if (tier.includes("probable") || tier === "pdf_page_level_probable") {
      confidence = "probable"
    } else if (tier === "ambiguous_visual_review_needed") {
      confidence = "ambiguous"
    } else if (tier === "rejected_not_oxford") {
      confidence = "rejected"
    } else if (tier === "orphan_oxford_media_unassigned") {
      confidence = "unassigned"
    }

    let recommended_use = "keep_unassigned_for_review"
    if (confidence === "confirmed") recommended_use = "primary_candidate"
    else if (confidence === "probable") recommended_use = "gallery_candidate"
    else if (confidence === "ambiguous") recommended_use = "keep_unassigned_for_review"
    else if (confidence === "rejected") recommended_use = "do_not_use"

    const mediaClass = rec.media_class || inferMediaClass(rel, fn, tier)
    const publicUrl =
      rel.startsWith("apps/backend/static/")
        ? `${staticBase}/${rel.replace(/^apps\/backend\/static\//, "")}`
        : null

    fileCandidates.push({
      source_path_or_url: publicUrl || rel,
      repo_relative_path: rel,
      filename: fn,
      source_kind: rec.source_kind || inferSourceKind(rel),
      match_tier: tier,
      matched_sku: matchedSku,
      matched_handle: matchedHandle,
      confidence,
      media_class: mediaClass,
      recommended_use,
      reason: prior?.notes || null,
      warnings: [
        mediaClass !== "white_background_confirmed" ? "not_white_background_ready" : null,
        tier === "pdf_page_level_probable" ? "page_level_not_sku_filename" : null,
      ].filter(Boolean),
    })
  }

  /** Per-SKU aggregation */
  const skuMapRows = []
  for (const skuRow of mapRows) {
    const sku = skuRow.sku
    const handle = skuRow.handle || skuToHandle(sku)
    const wb = skuIndex.get(sku)
    const med = medusaByHandle.get(handle?.toLowerCase?.() || "")
    const productInDb = Boolean(med?.id)

    let myFiles = fileCandidates.filter(
      (f) =>
        f.matched_sku === sku ||
        (f.matched_handle && f.matched_handle.toLowerCase() === handle?.toLowerCase())
    )
    const p6shared = fileCandidates.filter((f) => /Oxford_full_p6_/i.test(f.filename || ""))
    if (sku === "OX-14-1" || sku === "OX-90-1") {
      myFiles = [
        ...myFiles,
        ...p6shared.map((f) => ({
          ...f,
          shared_oxford_p6_gallery: true,
          confidence: "ambiguous",
          recommended_use: "keep_unassigned_for_review",
          warnings: [...(f.warnings || []), "shared_p6_context_review_before_auto_primary"],
        })),
      ]
    }
    {
      const seen = new Set()
      myFiles = myFiles.filter((f) => {
        const k = `${f.source_path_or_url}|${f.filename}`
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
    }
    const fromSeed = pilotSeed.find((p) => p.medusa_variant_sku === sku)

    skuMapRows.push({
      sku,
      handle,
      title_or_canonical: skuRow.canonical_name || wb?.canonical_name || fromSeed?.medusa_product_title || null,
      identity_sources: wb?.identity_sources || ["oxford-visual-candidate-map.json"],
      product_in_local_medusa_db: productInDb,
      medusa_product_id: med?.id || null,
      product_type: med?.product_classification?.product_type || fromSeed?.medusa_product_type || null,
      current_thumbnail: med?.thumbnail || null,
      current_gallery_count: Array.isArray(med?.images) ? med.images.length : 0,
      candidate_file_count: myFiles.length,
      mapping_status_from_prior_map: skuRow.mapping_status || null,
      candidates: myFiles,
    })
  }

  /** Assignment plan */
  const assignmentRows = []
  for (const sm of skuMapRows) {
    const ordered = [...sm.candidates].sort((a, b) => {
      const rank = (x) => {
        if (x.match_tier === "confirmed_existing_interim_map") return 0
        if (x.match_tier === "confirmed_filename_sku_match") return 1
        if (x.match_tier === "confirmed_existing_product_media") return 2
        if (x.confidence === "probable") return 3
        return 9
      }
      return rank(a) - rank(b)
    })

    const primary =
      ordered.find((c) => c.recommended_use === "primary_candidate" && c.source_path_or_url?.startsWith("http")) ||
      ordered.find((c) => c.recommended_use === "primary_candidate") ||
      ordered.find((c) => c.confidence === "probable" && c.source_path_or_url?.startsWith("http")) ||
      null

    const gallery = []
    const galleryReviewBacklog = []
    const seenU = new Set()
    for (const c of ordered) {
      const u = c.source_path_or_url
      if (!u || !u.startsWith("http")) continue
      if (seenU.has(u)) continue
      seenU.add(u)
      if (primary && u === primary.source_path_or_url) continue
      if (c.confidence === "unassigned") continue
      if (c.recommended_use === "do_not_use") continue
      if (c.confidence === "ambiguous") {
        galleryReviewBacklog.push(u)
        continue
      }
      gallery.push(u)
    }

    const applyAllowed =
      sm.product_in_local_medusa_db &&
      primary &&
      primary.confidence !== "ambiguous" &&
      primary.match_tier !== "orphan_oxford_media_unassigned"

    let applySkipReason = null
    if (!sm.product_in_local_medusa_db) applySkipReason = "product_missing_for_local_medusa"
    else if (!primary?.source_path_or_url?.startsWith("http")) applySkipReason = "no_eligible_primary_http_url"
    else if (!applyAllowed) applySkipReason = "apply_gates_failed"

    assignmentRows.push({
      sku: sm.sku,
      handle: sm.handle,
      product_in_local_medusa_db: sm.product_in_local_medusa_db,
      product_missing_for_media_assignment: !sm.product_in_local_medusa_db,
      proposed_primary_url: primary?.source_path_or_url || null,
      proposed_primary_tier: primary?.match_tier || null,
      proposed_gallery_urls: gallery,
      gallery_review_backlog_urls: galleryReviewBacklog,
      local_mvp_apply_allowed: Boolean(applyAllowed && primary?.source_path_or_url?.startsWith("http")),
      apply_skip_reason: applySkipReason,
    })
  }

  /** apply-result dry run */
  const applySnapshots = []
  for (const ar of assignmentRows) {
    if (!ar.product_in_local_medusa_db) {
      applySnapshots.push({
        handle: ar.handle,
        sku: ar.sku,
        outcome: "skipped_no_local_product",
        before_thumbnail: null,
        after_thumbnail_would_be: ar.proposed_primary_url,
        before_gallery_urls: [],
        after_gallery_urls_would_be: ar.proposed_gallery_urls,
      })
      continue
    }
    const med = medusaByHandle.get(ar.handle.toLowerCase())
    const beforeUrls = (med?.images || []).map((i) => i?.url).filter(Boolean)
    applySnapshots.push({
      handle: ar.handle,
      sku: ar.sku,
      outcome: ar.local_mvp_apply_allowed ? "dry_run_ready" : "dry_run_skip",
      before_thumbnail: med?.thumbnail || null,
      after_thumbnail_would_be: ar.proposed_primary_url,
      before_gallery_urls: beforeUrls,
      after_gallery_urls_would_be: ar.proposed_primary_url
        ? [ar.proposed_primary_url, ...ar.proposed_gallery_urls.filter((u) => u !== ar.proposed_primary_url)]
        : beforeUrls,
    })
  }

  const tierCounts = {}
  for (const f of fileCandidates) {
    tierCounts[f.match_tier] = (tierCounts[f.match_tier] || 0) + 1
  }
  const confCounts = {}
  for (const f of fileCandidates) {
    confCounts[f.confidence] = (confCounts[f.confidence] || 0) + 1
  }

  const inventoryOut = {
    audit_meta: {
      pass_name: "oxford_local_mvp_media_inventory",
      generated_at: iso,
      scope: "local_dev_mvp_preview_only",
      not_production_rollout: true,
      not_full_oxford_readiness: true,
      not_white_background_readiness: true,
      oxford_storefront_paused_governance_unchanged: true,
      constraints: [
        "No seed/validation/sync/Oxford pilot runner",
        "No mutation of oxford-four-pilot post-ingestion evidence JSON",
        "No catalog-scope.ts edits",
        "No raw asset rename/move/delete",
      ],
    },
    yandex_and_external_roots: rootsReport.filter((r) => r.role?.includes("yandex") || r.path?.startsWith("/")),
    scan_roots: rootsReport.filter((r) => r.role === "local_scan"),
    total_inventory_records: inventoryList.length,
    inventory_records: inventoryList,
  }

  const skuMapOut = {
    audit_meta: {
      pass_name: "oxford_local_mvp_sku_media_candidate_map",
      generated_at: iso,
      workbook_oxford_row_count: workbookOxford.length,
      sku_rows: skuMapRows.length,
      medusa_store_probe: storeProbe,
    },
    rows: skuMapRows,
  }

  const planOut = {
    audit_meta: {
      pass_name: "oxford_local_mvp_media_assignment_plan",
      generated_at: iso,
      assignment_policy: "local_mvp_preview_confirmed_and_probable_http_urls_only",
    },
    medusa_local_environment: storeProbe,
    rows: assignmentRows,
    summary: {
      sku_handles_total: assignmentRows.length,
      products_in_local_medusa: assignmentRows.filter((r) => r.product_in_local_medusa_db).length,
      apply_allowed_count: assignmentRows.filter((r) => r.local_mvp_apply_allowed).length,
      product_missing_count: assignmentRows.filter((r) => r.product_missing_for_media_assignment).length,
    },
  }

  const applyOut = {
    audit_meta: {
      pass_name: "oxford_local_mvp_media_apply_result",
      generated_at: iso,
      mode: "dry_run_snapshot_only",
    },
    local_apply_status: storeProbe.ok ? "dry_run_completed_no_db_writes" : "blocked_backend_unavailable_or_no_key",
    apply_gate_env: "OXFORD_LOCAL_MVP_MEDIA_APPLY_CONFIRM=1",
    medusa_store_probe: storeProbe,
    snapshots: applySnapshots,
    note:
      "No DB mutation in this artifact. Optional apply: apps/backend/src/scripts/oxford-local-mvp-media-apply.ts (medusa exec) with explicit env + --apply.",
  }

  const outDir = path.join(REPO, "data/normalized")
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, "oxford-local-mvp-media-inventory.json"), JSON.stringify(inventoryOut, null, 2) + "\n")
  fs.writeFileSync(path.join(outDir, "oxford-local-mvp-sku-media-candidate-map.json"), JSON.stringify(skuMapOut, null, 2) + "\n")
  fs.writeFileSync(path.join(outDir, "oxford-local-mvp-media-assignment-plan.json"), JSON.stringify(planOut, null, 2) + "\n")
  fs.writeFileSync(path.join(outDir, "oxford-local-mvp-media-apply-result.json"), JSON.stringify(applyOut, null, 2) + "\n")

  console.log("Wrote:")
  console.log("  data/normalized/oxford-local-mvp-media-inventory.json")
  console.log("  data/normalized/oxford-local-mvp-sku-media-candidate-map.json")
  console.log("  data/normalized/oxford-local-mvp-media-assignment-plan.json")
  console.log("  data/normalized/oxford-local-mvp-media-apply-result.json")
  console.log(JSON.stringify({ tierCounts, confCounts, storeProbe: { ok: storeProbe.ok, reason: storeProbe.reason } }, null, 2))
}

main()
