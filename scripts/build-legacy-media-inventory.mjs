/**
 * Read-only legacy + local media inventory for QA triage (no copy, no DB).
 *
 * Usage (repo root):
 *   node scripts/build-legacy-media-inventory.mjs
 */

import fs from "fs"
import path from "path"
import crypto from "crypto"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, "..")

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"])

const WALK_ROOTS = [
  { abs: path.join(REPO, "apps/backend/static/products"), source_type: "backend_static", label: "apps/backend/static/products" },
  { abs: path.join(REPO, "data/raw/downloaded-assets"), source_type: "downloaded_asset", label: "data/raw/downloaded-assets" },
  { abs: path.join(REPO, "data/processed/storefront-assets"), source_type: "processed_asset", label: "data/processed/storefront-assets" },
  { abs: path.join(REPO, "data/raw/front"), source_type: "legacy_front", label: "data/raw/front" },
  { abs: path.join(REPO, "data/raw/pdf-assets"), source_type: "unknown", label: "data/raw/pdf-assets" },
]

const FRONT_MANIFEST = path.join(REPO, "data/raw/front/front-manifest.json")
const MAX_WALK_FILES = 12000

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf-8"))
}

function posixRel(abs) {
  return path.relative(REPO, abs).replace(/\\/g, "/")
}

function inferCollectionFromRel(relPosix) {
  const s = relPosix.toLowerCase()
  if (s.includes("/oxford/") || s.includes("static/products/oxford")) return "oxford"
  if (s.includes("/oliver/")) return "oliver"
  if (s.includes("country-london-paris") || s.includes("/country/")) return "country-london-paris"
  if (s.includes("monchelsea")) return "monchelsea"
  if (s.includes("willie") || s.includes("/ww/") || s.includes("winkie")) return "willie-winkie"
  if (s.includes("provence")) return "provence"
  if (s.includes("princess")) return "princess-rose"
  if (s.includes("greenwich")) return "greenwich"
  return null
}

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
    handleLike.add(raw.toLowerCase())
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

function tryImageDimensions(absPath) {
  try {
    const fd = fs.openSync(absPath, "r")
    try {
      const buf = Buffer.allocUnsafe(65536)
      const n = fs.readSync(fd, buf, 0, 65536, 0)
      const slice = buf.subarray(0, n)
      if (slice.length >= 24 && slice[0] === 0x89 && slice[1] === 0x50 && slice[2] === 0x4e && slice[3] === 0x47) {
        const w = slice.readUInt32BE(16)
        const h = slice.readUInt32BE(20)
        if (w > 0 && w < 50000 && h > 0 && h < 50000) return { width: w, height: h }
      }
      if (slice.length >= 2 && slice[0] === 0xff && slice[1] === 0xd8) {
        let i = 2
        while (i < slice.length - 8) {
          if (slice[i] !== 0xff) {
            i++
            continue
          }
          const m = slice[i + 1]
          if (m === 0xc0 || m === 0xc1 || m === 0xc2) {
            const h = slice.readUInt16BE(i + 5)
            const w = slice.readUInt16BE(i + 7)
            if (w > 0 && w < 50000 && h > 0 && h < 50000) return { width: w, height: h }
          }
          const segLen = slice.readUInt16BE(i + 2)
          if (segLen < 2) break
          i += 2 + segLen
        }
      }
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    /* ignore */
  }
  return { width: null, height: null }
}

function quickContentHash(absPath) {
  try {
    const fd = fs.openSync(absPath, "r")
    try {
      const buf = Buffer.allocUnsafe(4096)
      const n = fs.readSync(fd, buf, 0, 4096, 0)
      return crypto.createHash("sha256").update(buf.subarray(0, n)).digest("hex").slice(0, 24)
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return null
  }
}

function duplicateGroupKey({ filename, extension, size_bytes, width, height, content_quick_hash }) {
  const base = `${String(filename).toLowerCase()}|${extension}|${size_bytes ?? "na"}|${width ?? "x"}|${height ?? "x"}|${content_quick_hash ?? "nohash"}`
  return `dg_${crypto.createHash("sha256").update(base).digest("hex").slice(0, 20)}`
}

/** First-hit basename → repo-relative posix for mirror lookup */
function buildBasenameMirrorIndex() {
  const map = new Map()
  const roots = [
    path.join(REPO, "data/raw/downloaded-assets"),
    path.join(REPO, "data/processed/storefront-assets"),
    path.join(REPO, "apps/backend/static/products"),
    path.join(REPO, "data/raw/front"),
  ]
  let scanned = 0
  const walk = (dir) => {
    if (scanned > 50000) return
    let ents
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of ents) {
      if (scanned > 50000) return
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        if (ent.name === "node_modules" || ent.name === ".git") continue
        walk(full)
      } else if (ent.isFile()) {
        scanned++
        const ext = path.extname(ent.name).toLowerCase()
        if (!IMAGE_EXT.has(ext)) continue
        const bn = ent.name.toLowerCase()
        if (!map.has(bn)) map.set(bn, posixRel(full))
      }
    }
  }
  for (const r of roots) {
    if (fs.existsSync(r)) walk(r)
  }
  return { map, files_scanned_for_mirror: scanned }
}

function makeInventoryRecord(base) {
  return {
    id: base.id,
    source_type: base.source_type,
    source_path: base.source_path,
    repo_relative_path: base.repo_relative_path,
    url: base.url ?? null,
    filename: base.filename,
    extension: base.extension,
    collection_hint: base.collection_hint ?? null,
    sku_hint: base.sku_hint ?? null,
    handle_hint: base.handle_hint ?? null,
    product_name_hint: base.product_name_hint ?? null,
    page_url: base.page_url ?? null,
    legacy_product_url: base.legacy_product_url ?? null,
    exists_locally: base.exists_locally,
    previewable: base.previewable,
    preview_reason: base.preview_reason,
    width: base.width ?? null,
    height: base.height ?? null,
    size_bytes: base.size_bytes ?? null,
    duplicate_group_key: base.duplicate_group_key,
    content_quick_hash: base.content_quick_hash ?? null,
    manifest_asset_id: base.manifest_asset_id ?? null,
    notes: base.notes ?? null,
  }
}

function enrichLocalFile(absPath, source_type, hints = {}) {
  let st
  try {
    st = fs.statSync(absPath)
  } catch {
    return null
  }
  if (!st.isFile()) return null
  const filename = path.basename(absPath)
  const extension = path.extname(filename).toLowerCase()
  if (!IMAGE_EXT.has(extension)) return null
  const rel = posixRel(absPath)
  const tok = inferTokens(absPath, filename)
  const { width, height } = tryImageDimensions(absPath)
  const content_quick_hash = quickContentHash(absPath)
  const size_bytes = st.size
  const rec = {
    id: `leginv_${crypto.createHash("sha256").update(rel).digest("hex").slice(0, 16)}`,
    source_type,
    source_path: rel,
    repo_relative_path: rel,
    url: null,
    filename,
    extension,
    collection_hint: hints.collection_hint ?? inferCollectionFromRel(rel),
    sku_hint: hints.sku_hint ?? (tok.skuTokens[0] ?? null),
    handle_hint: hints.handle_hint ?? (tok.handleTokens[0] ?? null),
    product_name_hint: hints.product_name_hint ?? null,
    page_url: null,
    legacy_product_url: null,
    exists_locally: true,
    previewable: true,
    preview_reason: "local_image_under_repo",
    width,
    height,
    size_bytes,
    content_quick_hash,
    duplicate_group_key: null,
    manifest_asset_id: null,
    notes: hints.notes ?? null,
  }
  rec.duplicate_group_key = duplicateGroupKey(rec)
  return makeInventoryRecord(rec)
}

function main() {
  const generatedAt = new Date().toISOString()
  const items = []
  const mirror = buildBasenameMirrorIndex()
  let walkCount = 0

  const pushWalk = (absRoot, declaredSourceType, label) => {
    if (!fs.existsSync(absRoot)) return
    const walk = (dir) => {
      if (walkCount >= MAX_WALK_FILES) return
      let ents
      try {
        ents = fs.readdirSync(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const ent of ents) {
        if (walkCount >= MAX_WALK_FILES) return
        const full = path.join(dir, ent.name)
        if (ent.isDirectory()) {
          if (ent.name === "node_modules" || ent.name === ".git") continue
          walk(full)
        } else if (ent.isFile()) {
          const ext = path.extname(ent.name).toLowerCase()
          if (ent.name === "front-manifest.json" || ext === ".json") continue
          if (!IMAGE_EXT.has(ext)) continue
          const rec = enrichLocalFile(full, declaredSourceType, {
            notes: `Walked from ${label}`,
          })
          if (rec) {
            items.push(rec)
            walkCount++
          }
        }
      }
    }
    walk(absRoot)
  }

  for (const r of WALK_ROOTS) {
    if (r.label === "data/raw/pdf-assets" && !fs.existsSync(r.abs)) continue
    pushWalk(r.abs, r.source_type, r.label)
  }

  let legacyManifestRows = 0
  if (fs.existsSync(FRONT_MANIFEST)) {
    const rows = readJson(FRONT_MANIFEST)
    if (Array.isArray(rows)) {
      legacyManifestRows = rows.length
      let i = 0
      for (const row of rows) {
        const filename = String(row.filename ?? "")
        const sourceRef = String(row.source_ref ?? row.source_folder ?? "")
        const ext = path.extname(filename).toLowerCase() || ".jpg"
        const kb = row.file_size_kb
        const size_bytes = typeof kb === "number" && !Number.isNaN(kb) ? Math.round(kb * 1024) : null

        const absWood = sourceRef && !sourceRef.startsWith("http") ? sourceRef : null
        const existsWood = absWood && fs.existsSync(absWood)
        const mirrorRel = filename ? mirror.map.get(filename.toLowerCase()) ?? null : null
        const existsMirror = mirrorRel && fs.existsSync(path.join(REPO, mirrorRel))
        const repoRel = existsMirror ? mirrorRel : null
        const exists_locally = Boolean(existsWood || existsMirror)
        const localAbs = existsWood ? absWood : existsMirror ? path.join(REPO, mirrorRel) : null

        let width = null
        let height = null
        let content_quick_hash = null
        if (localAbs) {
          const dim = tryImageDimensions(localAbs)
          width = dim.width
          height = dim.height
          content_quick_hash = quickContentHash(localAbs)
        }

        const previewable = Boolean(localAbs && IMAGE_EXT.has(ext))
        let preview_reason = "manifest_reference_only"
        if (previewable) preview_reason = "local_binary_resolved"
        else if (sourceRef.startsWith("/WOODRIGHT")) preview_reason = "woodright_path_not_mounted"
        else if (sourceRef.startsWith("/Users") || sourceRef.startsWith("/Volumes")) preview_reason = "external_absolute_path_not_mounted"
        else if (sourceRef.startsWith("http")) preview_reason = "http_url_manifest_not_used_for_auto_preview"

        const pch = row.product_code_hint != null ? String(row.product_code_hint) : null
        const skuTokens = inferTokens(sourceRef + filename, filename).skuTokens
        const handleTokens = inferTokens(sourceRef + filename, filename).handleTokens
        if (pch) {
          skuTokens.unshift(pch, pch.toUpperCase())
        }

        const rec = {
          id: `leginv_legacy_${row.asset_id ?? i}`,
          source_type: "legacy_front",
          source_path: sourceRef || null,
          repo_relative_path: repoRel,
          url: null,
          filename,
          extension: ext,
          collection_hint: row.collection_hint ?? null,
          sku_hint: pch,
          handle_hint: handleTokens[0] ?? null,
          product_name_hint: row.product_name_hint != null ? String(row.product_name_hint) : null,
          page_url: row.page_url != null ? String(row.page_url) : null,
          legacy_product_url: row.legacy_product_url != null ? String(row.legacy_product_url) : null,
          exists_locally,
          previewable,
          preview_reason,
          width,
          height,
          size_bytes,
          content_quick_hash,
          duplicate_group_key: null,
          manifest_asset_id: row.asset_id != null ? String(row.asset_id) : null,
          notes: [row.notes ? String(row.notes) : "", row.likely_asset_kind ? `kind=${row.likely_asset_kind}` : ""]
            .filter(Boolean)
            .join(" | "),
        }
        rec.handle_hint = rec.handle_hint || (pch ? String(pch).toLowerCase().replace(/_/g, "-") : null)
        rec.duplicate_group_key = duplicateGroupKey(rec)
        items.push(makeInventoryRecord(rec))
        i++
      }
    }
  }

  const bySource = {}
  let previewableN = 0
  let unpreviewableN = 0
  for (const it of items) {
    bySource[it.source_type] = (bySource[it.source_type] || 0) + 1
    if (it.previewable) previewableN++
    else unpreviewableN++
  }

  const out = {
    audit_meta: {
      pass_name: "legacy_media_inventory",
      pass_kind: "read_only_no_copy_no_db",
      generated_at: generatedAt,
      generated_by: "scripts/build-legacy-media-inventory.mjs",
      constraints: [
        "Legacy front-manifest and repo-local asset roots only; no external crawler.",
        "No Medusa mutation; no production media assignment.",
        "WOODRIGHT/Yandex paths are reference hints unless mirrored locally.",
      ],
      sources_scanned: [
        "data/raw/front/front-manifest.json",
        ...WALK_ROOTS.map((r) => posixRel(r.abs)),
      ],
      basename_mirror_index_files_scanned: mirror.files_scanned_for_mirror,
      walk_file_cap: MAX_WALK_FILES,
      walk_files_indexed: walkCount,
    },
    summary: {
      total_items: items.length,
      previewable: previewableN,
      unpreviewable: unpreviewableN,
      legacy_manifest_rows: legacyManifestRows,
      by_source_type: bySource,
    },
    items,
  }

  const outPath = path.join(REPO, "data/normalized/legacy-media-inventory.json")
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n", "utf-8")

  const reportPath = path.join(REPO, "docs/storefront/legacy-media-inventory-report.md")
  const report = `# Legacy media inventory (read-only)

Generated: **${generatedAt.slice(0, 10)}** by \`scripts/build-legacy-media-inventory.mjs\`.

## Purpose

QA / triage index of **legacy front-manifest references** plus **repo-local** images under static/downloaded/processed/pdf/front trees.  
This is a **reference layer**, not a canonical commercial source and **not** an automatic production media apply.

## Summary

| Metric | Value |
|--------|------:|
| Total indexed items | ${out.summary.total_items} |
| Previewable (local binary resolvable in this environment) | ${out.summary.previewable} |
| Unpreviewable (manifest or ref without local preview) | ${out.summary.unpreviewable} |
| \`front-manifest.json\` rows ingested | ${out.summary.legacy_manifest_rows} |

### By \`source_type\`

${Object.entries(out.summary.by_source_type)
  .sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `- **${k}:** ${v}`)
  .join("\n")}

## Output

- Machine-readable: \`data/normalized/legacy-media-inventory.json\`
- Matcher (next step): \`scripts/build-legacy-media-product-candidate-map.mjs\` → \`data/normalized/legacy-media-product-candidate-map.json\`

## Safety

- No database writes, no Medusa product/seed/metadata mutation, no asset copy/rename in this pass.
`

  fs.writeFileSync(reportPath, report, "utf-8")
  console.log("Wrote", outPath)
  console.log("Wrote", reportPath)
  console.log("Items", items.length, "previewable", previewableN)
}

main()
