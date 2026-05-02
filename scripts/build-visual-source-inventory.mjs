/**
 * Read-only inventory + candidate map generator for MVP media planning.
 * Does not copy files, mutate DB, or call apply.
 *
 * Usage (from repo root):
 *   node scripts/build-visual-source-inventory.mjs
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, "..")

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"])

const YANDEX_ROOTS = [
  { path: "/WOODRIGHT/Контент /Фото на белом фоне", label: "woodright_white_bg" },
  {
    path: "/Users/leonidmbp/Yandex.Disk/WOODRIGHT/Контент /Фото на белом фоне",
    label: "yandex_disk_dot",
  },
  {
    path: "/Users/leonidmbp/Yandex Disk/WOODRIGHT/Контент /Фото на белом фоне",
    label: "yandex_disk_space",
  },
]

const LOCAL_SCAN_ROOTS = [
  {
    abs: path.join(REPO, "apps/backend/static/products"),
    label: "apps/backend/static/products",
    system: "backend_static_existing",
  },
  {
    abs: path.join(REPO, "data/raw/downloaded-assets"),
    label: "data/raw/downloaded-assets",
    system: "yandex_disk",
  },
  {
    abs: path.join(REPO, "data/processed/storefront-assets"),
    label: "data/processed/storefront-assets",
    system: "yandex_disk",
  },
]

const MAX_DISK_INVENTORY = 8000

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf-8"))
}

function rootStatus(absPath) {
  try {
    const st = fs.statSync(absPath)
    return { path: absPath, status: st.isDirectory() ? "present_dir" : "present_not_dir", source_root_missing: false }
  } catch {
    return { path: absPath, status: "source_root_missing", source_root_missing: true }
  }
}

/** Pull plausible product tokens from filename + path (case-insensitive on basename). */
function inferTokens(filePath, basename) {
  const lowerPath = filePath.toLowerCase()
  const base = basename.toLowerCase()
  const hay = `${lowerPath}/${base}`
  const skuLike = new Set()
  const handleLike = new Set()
  const re =
    /\b((?:co|ox|ol|mn|mnm|ww|s-ox|s-ox-)[a-z0-9]*-?\d{1,3}-\d{1,3}(?:-[a-z0-9]+)?)\b/gi
  let m
  while ((m = re.exec(hay)) !== null) {
    const raw = m[1]
    skuLike.add(raw)
    skuLike.add(raw.toUpperCase())
    handleLike.add(raw)
    if (raw.startsWith("mnm-")) handleLike.add(raw.replace(/^mnm-/, "mnm-"))
  }
  const compact = basename.toLowerCase().match(/^([a-z]{2,4}-\d{2}-\d+)/i)
  if (compact) {
    const t = compact[1].toLowerCase()
    skuLike.add(t)
    skuLike.add(t.toUpperCase())
    handleLike.add(t)
  }
  return { skuTokens: [...skuLike], handleTokens: [...handleLike] }
}

function inferCollectionFromRel(relPosix) {
  const s = relPosix.toLowerCase()
  if (s.includes("/static/products/oxford/") || s.includes("/oxford/")) return "oxford"
  if (s.includes("/static/products/oliver/") || s.includes("/oliver/")) return "oliver"
  if (s.includes("country-london-paris") || s.includes("/country/")) return "country-london-paris"
  if (s.includes("monchelsea")) return "monchelsea"
  if (s.includes("willie") || s.includes("/ww/") || s.includes("winkie")) return "willie-winkie"
  if (s.includes("provence")) return "provence"
  if (s.includes("princess")) return "princess-rose"
  if (s.includes("greenwich")) return "greenwich"
  return null
}

function whiteBgLikely(rel, basename, sourceSystem) {
  const p = (rel + basename).toLowerCase()
  if (p.includes("white") || p.includes("бел") || p.includes("white_bg")) return true
  if (p.includes("interim") || p.includes("pdf") || p.includes("gallery")) return false
  if (sourceSystem === "backend_static_existing" && p.includes("oxford")) return false
  return null
}

function walkDiskInventory(out, counters) {
  let n = 0
  const walk = (dir, meta) => {
    if (n >= MAX_DISK_INVENTORY) return
    let ents
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of ents) {
      if (n >= MAX_DISK_INVENTORY) return
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        if (ent.name === "node_modules" || ent.name === ".git") continue
        walk(full, meta)
      } else if (ent.isFile()) {
        const ext = path.extname(ent.name).toLowerCase()
        if (!IMAGE_EXT.has(ext)) continue
        let st
        try {
          st = fs.statSync(full)
        } catch {
          continue
        }
        const rel = path.relative(REPO, full).replace(/\\/g, "/")
        const tok = inferTokens(full, ent.name)
        const coll = inferCollectionFromRel(rel)
        const id = `inv_disk_${meta.label.replace(/[^a-z0-9]+/gi, "_")}_${n}`
        out.push({
          id,
          source_system: meta.system,
          source_root: meta.label,
          path_or_ref: full,
          filename: ent.name,
          extension: ext,
          size_bytes: st.size,
          inferred_collection_key: coll,
          inferred_sku_tokens: tok.skuTokens.slice(0, 8),
          inferred_product_handle_tokens: tok.handleTokens.slice(0, 8),
          white_background_likely: whiteBgLikely(rel, ent.name, meta.system),
          source_confidence: tok.skuTokens.length ? "probable" : "ambiguous",
          notes: "Local filesystem scan; identity from filename/path heuristics only.",
        })
        n++
        counters.byRoot[meta.label] = (counters.byRoot[meta.label] || 0) + 1
      }
    }
  }
  for (const r of LOCAL_SCAN_ROOTS) {
    if (!fs.existsSync(r.abs)) continue
    walk(r.abs, { label: r.label, system: r.system })
  }
  counters.disk_inventory_total = n
  counters.scan_truncated = n >= MAX_DISK_INVENTORY
}

function legacyInventory(out, counters) {
  const fmPath = path.join(REPO, "data/raw/front/front-manifest.json")
  const rows = readJson(fmPath)
  if (!Array.isArray(rows)) return
  let i = 0
  for (const row of rows) {
    const fn = String(row.filename ?? "")
    const ref = String(row.source_ref ?? row.source_folder ?? "")
    const ext = path.extname(fn).toLowerCase() || ".jpg"
    const kb = row.file_size_kb
    const sizeBytes = typeof kb === "number" && !Number.isNaN(kb) ? Math.round(kb * 1024) : null
    const wb = row.source_type === "white_bg" ? true : row.source_type ? false : null
    const confNum = typeof row.confidence === "number" ? row.confidence : 0
    let sc = "ambiguous"
    if (confNum >= 0.9) sc = "confirmed"
    else if (confNum >= 0.75) sc = "probable"
    const id = `inv_legacy_${row.asset_id ?? i}`
    const mountMissing = ref.startsWith("/WOODRIGHT") && !fs.existsSync(ref)
    out.push({
      id,
      source_system: "legacy_front",
      source_root: "data/raw/front/front-manifest.json",
      path_or_ref: ref,
      filename: fn,
      extension: ext,
      size_bytes: sizeBytes,
      inferred_collection_key: row.collection_hint ?? null,
      inferred_sku_tokens: row.product_code_hint ? [String(row.product_code_hint)] : [],
      inferred_product_handle_tokens: [],
      white_background_likely: wb,
      source_confidence: sc,
      notes: [
        row.notes ? String(row.notes) : "",
        mountMissing ? "Referenced path not on local filesystem (Yandex/WOODRIGHT mount)." : "",
      ]
        .filter(Boolean)
        .join(" "),
    })
    i++
  }
  counters.legacy_front_rows = rows.length
}

function normalizedManifestInventory(out, counters) {
  const p = path.join(REPO, "data/normalized/visual-asset-candidate-manifest.json")
  if (!fs.existsSync(p)) return
  const doc = readJson(p)
  const rows = doc.rows ?? []
  let idx = 0
  for (const row of rows) {
    const coll = row.collection_key ?? null
    const sku = row.sku ?? null
    const primary = row.primary_image_candidate
    if (primary && typeof primary === "string") {
      const fn = path.basename(primary.split("?")[0])
      const ext = path.extname(fn).toLowerCase() || null
      const exists = primary.startsWith("http") ? null : fs.existsSync(primary)
      out.push({
        id: `inv_norm_primary_${idx}`,
        source_system: "normalized_manifest",
        source_root: "data/normalized/visual-asset-candidate-manifest.json",
        path_or_ref: primary,
        filename: fn,
        extension: ext,
        size_bytes: null,
        inferred_collection_key: coll,
        inferred_sku_tokens: sku ? [String(sku)] : [],
        inferred_product_handle_tokens: row.handle ? [String(row.handle)] : [],
        white_background_likely: row.primary_image_source_type === "white_background" ? true : row.primary_image_source_type === "non_white" ? false : null,
        source_confidence: row.primary_image_confidence ?? "probable",
        notes: `Manifest row; can_use_for_card_now=${String(row.can_use_for_card_now)}; local_exists=${exists === null ? "n/a_url" : exists}`,
      })
    }
    const gals = row.gallery_candidates ?? []
    let g = 0
    for (const u of gals) {
      if (typeof u !== "string") continue
      const fn = path.basename(u.split("?")[0])
      const ext = path.extname(fn).toLowerCase() || null
      const exists = u.startsWith("http") ? null : fs.existsSync(u)
      out.push({
        id: `inv_norm_gallery_${idx}_${g}`,
        source_system: "normalized_manifest",
        source_root: "data/normalized/visual-asset-candidate-manifest.json",
        path_or_ref: u,
        filename: fn,
        extension: ext,
        size_bytes: null,
        inferred_collection_key: coll,
        inferred_sku_tokens: sku ? [String(sku)] : [],
        inferred_product_handle_tokens: row.handle ? [String(row.handle)] : [],
        white_background_likely: false,
        source_confidence: row.primary_image_confidence ?? "probable",
        notes: `Gallery candidate; local_exists=${exists === null ? "n/a_url" : exists}`,
      })
      g++
    }
    idx++
  }
  counters.normalized_manifest_inventory_rows = out.filter((x) => x.source_system === "normalized_manifest").length
}

function buildCandidateMap(inventory, mvpMapPath) {
  const mvp = readJson(mvpMapPath)
  const products = mvp.products ?? []
  const blockedMvp = mvp.blocked ?? []
  const candidates = []
  const blockedOrAmbiguous = []
  const byColl = {}
  const bySys = {}
  const byUsage = {}

  const bump = (obj, k, f) => {
    if (!obj[k]) obj[k] = { candidates: 0, blocked: 0 }
    obj[k][f] = (obj[k][f] || 0) + 1
  }

  const findInvIdForPath = (pref) => {
    const hit = inventory.find((x) => x.path_or_ref === pref)
    return hit?.id ?? null
  }

  for (const pr of products) {
    const skuRaw = String(pr.product_sku_or_handle ?? "")
    const coll = pr.collection_key ?? "unknown"
    const ref = String(pr.selected_primary_image_path_or_ref ?? "")
    const invId = findInvIdForPath(ref) ?? findInvIdForPath(ref.trim())
    const stype = String(pr.selected_primary_image_type ?? "unknown")
    const mapSourceType =
      stype === "white_background"
        ? "white_background"
        : stype === "backend_static_existing"
          ? "backend_static_existing"
          : stype === "legacy_front"
            ? "legacy_front"
            : "unknown"
    const idConf = pr.identity_confidence ?? "probable"
    const mvpUsage = pr.mvp_usage_status ?? "reference_only"
    let basis = "legacy_manifest_match"
    if (ref.startsWith("http")) basis = "handle_match"
    if (ref.startsWith("/WOODRIGHT")) basis = "sku_in_filename"
    if (ref.includes("front-manifest rows")) basis = "weak_text_match"

    let wb = stype === "white_background"
    let suitability = "acceptable"
    if (wb && idConf === "confirmed") suitability = "good"
    if (stype === "legacy_front" && idConf === "probable") suitability = "weak_but_usable"
    if (coll === "oxford") suitability = "acceptable"

    let visualUsage = "use_as_temporary_primary"
    if (mvpUsage === "use_as_primary") visualUsage = "use_as_primary"
    if (coll === "oxford" || coll === "monchelsea") visualUsage = "use_as_temporary_primary"

    let needsHuman = idConf === "probable" || coll === "monchelsea"
    let needsAi = pr.needs_later_ai_generation === true
    let safeNext = "Dry-run executor only after source path exists; no apply without governance."
    if (coll === "oxford") safeNext = "Pilot interim only; paused collection — not public apply-ready."
    if (ref.startsWith("/WOODRIGHT") && !fs.existsSync(ref)) {
      suitability = "not_safe"
      visualUsage = "reference_only"
      needsHuman = true
      safeNext = "Mount Yandex/WOODRIGHT or materialize static + align ref before any card use."
    }

    const cid = `cand_mvp_${candidates.length}`
    candidates.push({
      id: cid,
      collection_key: coll,
      product_sku_or_handle: skuRaw,
      product_name_if_available: pr.product_name_if_available ?? null,
      candidate_source_id: invId,
      candidate_path_or_ref: ref,
      source_system: ref.startsWith("http") ? "backend_static_existing" : ref.startsWith("/WOODRIGHT") ? "yandex_disk" : "legacy_front",
      source_type: mapSourceType,
      identity_match_basis: basis,
      identity_confidence: idConf,
      visual_usage_status: visualUsage,
      mvp_card_suitability: suitability,
      white_background_confirmed: wb,
      needs_human_review: needsHuman,
      needs_later_ai_generation: needsAi,
      reason: String(pr.reason_for_choice ?? pr.reason ?? ""),
      safe_next_action: safeNext,
    })
    bump(byColl, coll, "candidates")
    bump(bySys, mapSourceType, "candidates")
    bump(byUsage, visualUsage, "candidates")
  }

  for (const b of blockedMvp) {
    blockedOrAmbiguous.push({
      id: `blk_mvp_${blockedOrAmbiguous.length}`,
      kind: "mvp_media_map_blocked_row",
      product_sku_or_handle: b.product_sku_or_handle,
      collection_key: b.collection_key,
      reason: b.block_reason ?? "",
      notes: (b.warnings ?? []).join("; "),
    })
    bump(byColl, b.collection_key ?? "unknown", "blocked")
  }

  /** Disk files with no SKU heuristic */
  let orphan = 0
  for (const inv of inventory) {
    if (inv.source_system !== "yandex_disk" && inv.source_system !== "backend_static_existing") continue
    if (inv.inferred_sku_tokens && inv.inferred_sku_tokens.length > 0) continue
    if (orphan < 400) {
      blockedOrAmbiguous.push({
        id: `blk_orphan_${orphan}`,
        kind: "disk_file_no_clear_product_identity",
        path_or_ref: inv.path_or_ref,
        filename: inv.filename,
        source_root: inv.source_root,
        reason: "No SKU-like token inferred from path/filename",
      })
    }
    orphan++
  }
  if (orphan > 400) {
    blockedOrAmbiguous.push({
      id: "blk_orphan_truncation",
      kind: "summary",
      reason: `Additional orphan disk files omitted from blocked list (${orphan - 400}+)`,
    })
  }

  return {
    candidates,
    blockedOrAmbiguous,
    summary_by_collection: byColl,
    summary_by_source_system: bySys,
    summary_by_usage_status: byUsage,
    orphan_disk_files_count: orphan,
  }
}

function main() {
  const generatedDate = new Date().toISOString().slice(0, 10)
  const sourceRootsChecked = YANDEX_ROOTS.map((r) => ({
    ...rootStatus(r.path),
    label: r.label,
  }))
  const sourceFilesChecked = [
    "data/raw/front/front-manifest.json",
    "data/normalized/collection-asset-intake-summary.json",
    "docs/content/collection-asset-intake-summary.md",
    "data/normalized/storefront-mvp-best-available-media-map.json",
    "data/normalized/storefront-mvp-media-assignment-dry-run.json",
    "data/normalized/storefront-mvp-media-source-contract.json",
    "data/normalized/visual-asset-candidate-manifest.json",
    "data/normalized/storefront-best-available-photo-candidates.json",
    "data/normalized/storefront-best-available-photo-approval-review.json",
    "data/processed/asset-manifests/disk-download-manifest.json",
    "data/normalized/product-workbook-asset-map.json",
    "data/normalized/oxford-four-pilot-interim-asset-source-map.json",
    "data/normalized/seed-products.oxford-pilot-four.json",
  ]

  const inventory = []
  const counters = { byRoot: {}, disk_inventory_total: 0, scan_truncated: false, legacy_front_rows: 0, normalized_manifest_inventory_rows: 0 }

  walkDiskInventory(inventory, counters)
  legacyInventory(inventory, counters)
  normalizedManifestInventory(inventory, counters)

  const coFile = "/WOODRIGHT/Контент /Фото на белом фоне /country /co-02-1-blue-i1.jpg"
  const summary = {
    total_inventory_rows: inventory.length,
    by_source_system: {},
    yandex_mount_roots_missing: sourceRootsChecked.filter((r) => r.source_root_missing).length,
    disk_scan: {
      total_files_indexed: counters.disk_inventory_total,
      scan_truncated: counters.scan_truncated,
      per_root_counts: counters.byRoot,
    },
    legacy_front_manifest_rows: counters.legacy_front_rows,
    normalized_manifest_derived_rows: counters.normalized_manifest_inventory_rows,
    co_02_1_blue_i1: {
      canonical_path: coFile,
      local_filesystem_exists: fs.existsSync(coFile),
      legacy_front_filename_rows: counters.legacy_front_rows
        ? readJson(path.join(REPO, "data/raw/front/front-manifest.json")).filter((r) => r.filename === "co-02-1-blue-i1.jpg").length
        : 0,
    },
  }
  for (const inv of inventory) {
    summary.by_source_system[inv.source_system] = (summary.by_source_system[inv.source_system] || 0) + 1
  }

  const indexOut = {
    audit_meta: {
      pass_name: "visual_source_inventory_index",
      pass_kind: "read_only_inventory_no_runtime_mutation",
      generated_date: generatedDate,
      generated_by: "scripts/build-visual-source-inventory.mjs",
      constraints: [
        "No DB / product mutation",
        "No media apply",
        "No asset copy or rename",
        "No catalog-scope or storefront changes",
        "Heuristic SKU/collection inference from paths only",
      ],
    },
    source_roots_checked: sourceRootsChecked,
    source_files_checked: sourceFilesChecked,
    inventory,
    summary,
  }

  const mvpPath = path.join(REPO, "data/normalized/storefront-mvp-best-available-media-map.json")
  const map = buildCandidateMap(inventory, mvpPath)

  const candidateOut = {
    audit_meta: {
      pass_name: "visual_source_product_candidate_map",
      pass_kind: "read_only_matching_no_runtime_mutation",
      generated_date: generatedDate,
      generated_by: "scripts/build-visual-source-inventory.mjs",
    },
    matching_rules: [
      "MVP media map rows anchor primary commercial planning; inventory links by exact path_or_ref match first.",
      "WOODRIGHT paths without local mount → mvp_card_suitability not_safe, reference_only until mount/static.",
      "Oxford pilot rows remain temporary / paused governance; not public apply-ready.",
      "Monchelsea probable → needs_human_review; no auto-apply.",
      "Disk orphan files (no SKU token) listed in blocked_or_ambiguous (capped).",
    ],
    candidates: map.candidates,
    blocked_or_ambiguous: map.blockedOrAmbiguous,
    summary_by_collection: map.summary_by_collection,
    summary_by_source_system: map.summary_by_source_system,
    summary_by_usage_status: map.summary_by_usage_status,
    summary: {
      candidates_count: map.candidates.length,
      blocked_or_ambiguous_count: map.blockedOrAmbiguous.length,
      orphan_disk_files_count: map.orphan_disk_files_count,
    },
  }

  const outIndex = path.join(REPO, "data/normalized/visual-source-inventory-index.json")
  const outMap = path.join(REPO, "data/normalized/visual-source-product-candidate-map.json")
  fs.writeFileSync(outIndex, JSON.stringify(indexOut, null, 2) + "\n", "utf-8")
  fs.writeFileSync(outMap, JSON.stringify(candidateOut, null, 2) + "\n", "utf-8")
  console.log("Wrote", outIndex)
  console.log("Wrote", outMap)
  console.log("Inventory rows", inventory.length)
}

main()
