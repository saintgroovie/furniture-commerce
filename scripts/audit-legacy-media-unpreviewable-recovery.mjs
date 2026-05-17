/**
 * Read-only audit: resolve unpreviewable legacy-media-inventory rows against repo/local sources.
 * Writes:
 *   data/normalized/legacy-media-unpreviewable-recovery-audit.json
 *   data/normalized/legacy-media-preview-recovery-map.json
 *   docs/storefront/legacy-media-unpreviewable-recovery-audit.md
 *
 * Usage (repo root):
 *   node scripts/audit-legacy-media-unpreviewable-recovery.mjs
 */

import fs from "fs"
import path from "path"
import crypto from "crypto"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, "..")

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"])

const SCAN_ROOTS = [
  "apps/backend/static",
  "apps/backend/static/products",
  "apps/backend/public",
  "apps/storefront/public",
  "data/raw/downloaded-assets",
  "data/processed/storefront-assets",
  "data/raw/front",
  "data/raw/pdf-assets",
  "data/raw/pdf-assets/extracted",
  "data/raw/legacy",
  "data/raw/legacy/cache",
  "data/raw/assets",
]

const RECOVERED_STATUSES = new Set([
  "recovered_exact",
  "recovered_basename",
  "recovered_case_insensitive",
  "recovered_pdf_extract",
  "recovered_backend_static",
  "recovered_duplicate_group",
  "recovered_variant_basename",
])

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(REPO, rel), "utf8"))
}

function posixRel(abs) {
  return path.relative(REPO, abs).replace(/\\/g, "/")
}

function normalizePosix(s) {
  return String(s || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\//, "")
}

function normKey(s) {
  return s.normalize("NFC").toLowerCase()
}

function md5(s) {
  return crypto.createHash("md5").update(s).digest("hex")
}

function decodeBasename(fn) {
  try {
    return decodeURIComponent(fn)
  } catch {
    return fn
  }
}

function basenameVariants(fn) {
  const out = new Set()
  const lower = fn.toLowerCase()
  out.add(lower)
  out.add(normKey(fn))
  out.add(decodeBasename(fn).toLowerCase())
  const base = fn.replace(/\.[^.]+$/, "")
  const ext = path.extname(fn).toLowerCase() || ".jpg"
  out.add(base.toLowerCase() + ext)
  out.add(base.replace(/-i\d+$/i, "").toLowerCase() + ext)
  out.add(base.replace(/-/g, "_").toLowerCase() + ext)
  for (const alt of [".jpg", ".jpeg", ".png", ".webp"]) {
    if (alt !== ext) out.add(base.toLowerCase() + alt)
  }
  return [...out]
}

function pdfPatternTokens(fn) {
  const base = fn.replace(/\.[^.]+$/, "")
  const m = base.match(/^(.*?_)?p(\d+)_i(\d+)_(\d+)x(\d+)$/i)
  if (!m) return []
  const [, prefix = "", p, i, w, h] = m
  const coll = (prefix || "").replace(/_$/i, "").toLowerCase()
  return [
    `p${p}_i${i}_${w}x${h}`,
    `${coll}_p${p}_i${i}`,
    `p${p}_i${i}`,
    `${w}x${h}`,
  ].filter(Boolean)
}

function buildFileIndex() {
  const byBasename = new Map()
  const byNormBasename = new Map()
  const byPdfToken = new Map()
  let filesIndexed = 0

  const add = (rel, name) => {
    const key = name.toLowerCase()
    if (!byBasename.has(key)) byBasename.set(key, [])
    byBasename.get(key).push(rel)
    const nk = normKey(name)
    if (!byNormBasename.has(nk)) byNormBasename.set(nk, [])
    byNormBasename.get(nk).push(rel)
    for (const tok of pdfPatternTokens(name)) {
      if (!byPdfToken.has(tok)) byPdfToken.set(tok, [])
      byPdfToken.get(tok).push(rel)
    }
    filesIndexed++
  }

  const walk = (absDir, relPrefix, depth = 0) => {
    if (depth > 14 || filesIndexed > 80000) return
    let ents
    try {
      ents = fs.readdirSync(absDir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of ents) {
      if (ent.name === "node_modules" || ent.name === ".git") continue
      const full = path.join(absDir, ent.name)
      const rel = relPrefix ? `${relPrefix}/${ent.name}` : ent.name
      if (ent.isDirectory()) walk(full, rel, depth + 1)
      else if (ent.isFile()) {
        const ext = path.extname(ent.name).toLowerCase()
        if (!IMAGE_EXT.has(ext)) continue
        add(rel, ent.name)
      }
    }
  }

  const rootsScanned = []
  for (const root of SCAN_ROOTS) {
    const abs = path.join(REPO, root)
    if (!fs.existsSync(abs)) continue
    rootsScanned.push(root)
    walk(abs, root)
  }
  return { byBasename, byNormBasename, byPdfToken, rootsScanned, filesIndexed }
}

function fileExistsRel(rel) {
  if (!rel) return false
  const safe = normalizePosix(rel)
  if (!safe || safe.includes("..")) return false
  const abs = path.join(REPO, safe)
  try {
    return fs.statSync(abs).isFile()
  } catch {
    return false
  }
}

function pickUnique(hits) {
  if (!hits?.length) return null
  const uniq = [...new Set(hits)]
  if (uniq.length === 1) return { rel: uniq[0], confidence: "exact" }
  return { rel: uniq[0], confidence: "basename", ambiguous: uniq.length }
}

function classifyFoundPath(rel) {
  if (rel.startsWith("data/raw/pdf-assets/")) return "recovered_pdf_extract"
  if (rel.startsWith("apps/backend/static/")) return "recovered_backend_static"
  return "recovered_exact"
}

function auditHtmlCache(row) {
  const url = row.page_url || row.legacy_product_url
  if (!url) return null
  const cacheFile = path.join(REPO, "data/raw/legacy/cache", `${md5(url)}.html`)
  if (!fs.existsSync(cacheFile)) return null
  const html = fs.readFileSync(cacheFile, "utf8")
  const fn = row.filename
  const base = fn.replace(/\.[^.]+$/, "")
  const attrs = [...html.matchAll(/(?:src|data-src|srcset)=["']([^"']+)["']/gi)].map((m) => m[1])
  const matching = attrs.filter((u) => u.includes(fn) || u.includes(base) || u.includes(encodeURIComponent(fn)))
  if (!matching.length) return null
  const local = matching.filter((u) => !/^https?:\/\//i.test(u))
  if (local.some((u) => fileExistsRel(u.replace(/^\//, "")))) {
    const hit = local.find((u) => fileExistsRel(u.replace(/^\//, "")))
    return {
      recovery_status: "recovered_exact",
      found_path: normalizePosix(hit.replace(/^\//, "")),
      confidence: "html_cache_local",
      reason: "Legacy HTML cache references a local path that exists in repo.",
    }
  }
  return {
    recovery_status: "remote_reference_found_local_missing",
    found_path: null,
    confidence: "html_cache_remote",
    reason: "Legacy HTML cache references image URL(s) but no matching local binary in repo.",
    remote_urls: matching.slice(0, 5),
  }
}

function matchRow(row, index, previewableByDg) {
  const current_path = row.repo_relative_path || row.source_path || null

  for (const rel of [row.repo_relative_path, row.source_path].filter(Boolean)) {
    const n = normalizePosix(rel)
    if (n.startsWith("data/") || n.startsWith("apps/")) {
      if (fileExistsRel(n)) {
        return {
          recovery_status: classifyFoundPath(n),
          found_path: n,
          confidence: "path_exact",
          reason: "Inventory path resolves on disk under repo.",
        }
      }
    }
  }

  if (row.duplicate_group_key && previewableByDg.has(row.duplicate_group_key)) {
    const peer = previewableByDg.get(row.duplicate_group_key)
    return {
      recovery_status: "recovered_duplicate_group",
      found_path: peer.repo_relative_path || peer.source_path,
      confidence: "duplicate_group_key",
      reason: `Same duplicate_group_key as previewable row ${peer.id}.`,
      peer_inventory_id: peer.id,
    }
  }

  const variants = basenameVariants(row.filename)
  for (const v of variants) {
    const hits = index.byBasename.get(v) || index.byNormBasename.get(normKey(v)) || []
    const picked = pickUnique(hits)
    if (picked) {
      const st =
        v !== row.filename.toLowerCase() ? "recovered_variant_basename" : picked.confidence === "exact" ? classifyFoundPath(picked.rel) : "recovered_basename"
      return {
        recovery_status: st,
        found_path: picked.rel,
        confidence: picked.confidence,
        reason:
          st === "recovered_variant_basename"
            ? "Matched via filename variant (e.g. stripped -iN suffix or extension swap)."
            : picked.ambiguous
              ? `Multiple basename matches (${picked.ambiguous}); first allowlisted hit used.`
              : "Unique basename match in scanned roots.",
      }
    }
  }

  for (const tok of pdfPatternTokens(row.filename)) {
    const hits = index.byPdfToken.get(tok) || []
    const picked = pickUnique(hits)
    if (picked) {
      return {
        recovery_status: "recovered_pdf_extract",
        found_path: picked.rel,
        confidence: "pdf_pattern",
        reason: `PDF crop token match (${tok}).`,
      }
    }
  }

  const html = auditHtmlCache(row)
  if (html) return html

  if (!row.filename || !IMAGE_EXT.has(path.extname(row.filename).toLowerCase())) {
    return {
      recovery_status: "unsupported_type",
      found_path: null,
      confidence: "none",
      reason: "Not an image extension or missing filename.",
    }
  }

  if ((row.preview_reason || "").includes("woodright") || String(row.source_path || "").startsWith("/WOODRIGHT")) {
    return {
      recovery_status: "still_missing",
      found_path: null,
      confidence: "none",
      reason: "WOODRIGHT/Yandex source path not mounted; no basename mirror in scanned repo roots.",
    }
  }

  return {
    recovery_status: "still_missing",
    found_path: null,
    confidence: "none",
    reason: row.preview_reason || "No local file match in scanned roots.",
  }
}

function main() {
  const generatedAt = new Date().toISOString()
  const inv = readJson("data/normalized/legacy-media-inventory.json")
  const items = inv.items ?? []
  const unpreviewable = items.filter((it) => it.previewable === false)

  const previewableByDg = new Map()
  for (const it of items) {
    if (it.previewable && it.duplicate_group_key && !previewableByDg.has(it.duplicate_group_key)) {
      previewableByDg.set(it.duplicate_group_key, it)
    }
  }

  const index = buildFileIndex()
  const rows = []
  const recoveryEntries = {}

  let recovered_previewable_count = 0
  let still_missing_count = 0
  let remote_reference_only_count = 0
  let unsupported_type_count = 0
  const byStatus = {}

  for (const row of unpreviewable) {
    const result = matchRow(row, index, previewableByDg)
    byStatus[result.recovery_status] = (byStatus[result.recovery_status] || 0) + 1
    if (RECOVERED_STATUSES.has(result.recovery_status)) recovered_previewable_count++
    else if (result.recovery_status === "still_missing") still_missing_count++
    else if (result.recovery_status === "remote_reference_found_local_missing") remote_reference_only_count++
    else if (result.recovery_status === "unsupported_type") unsupported_type_count++

    const current_path = row.repo_relative_path || row.source_path || null
    const auditRow = {
      media_id: row.id,
      filename: row.filename,
      current_path,
      found_path: result.found_path,
      recovery_status: result.recovery_status,
      confidence: result.confidence,
      reason: result.reason,
      source_type: row.source_type,
      preview_reason: row.preview_reason,
      collection_hint: row.collection_hint,
      sku_hint: row.sku_hint,
      handle_hint: row.handle_hint,
      page_url: row.page_url,
      legacy_product_url: row.legacy_product_url,
      ...(result.peer_inventory_id ? { peer_inventory_id: result.peer_inventory_id } : {}),
      ...(result.remote_urls ? { remote_urls: result.remote_urls } : {}),
    }
    rows.push(auditRow)

    if (RECOVERED_STATUSES.has(result.recovery_status) && result.found_path) {
      recoveryEntries[row.id] = {
        found_path: result.found_path,
        recovery_status: result.recovery_status,
        confidence: result.confidence,
        reason: result.reason,
      }
    }
  }

  const audit = {
    audit_meta: {
      pass_name: "legacy_media_unpreviewable_recovery",
      pass_kind: "read_only_no_db_no_seed",
      generated_at: generatedAt,
      generated_by: "scripts/audit-legacy-media-unpreviewable-recovery.mjs",
      constraints: [
        "No Medusa DB, seed, catalog-scope, evidence JSON, or production assignment.",
        "No external image download.",
        "QA preview recovery only; does not confirm product identity.",
      ],
      inventory_generated_at: inv.audit_meta?.generated_at ?? null,
      roots_scanned: index.rootsScanned,
      files_indexed: index.filesIndexed,
    },
    total_unpreviewable: unpreviewable.length,
    recovered_previewable_count,
    still_missing_count,
    remote_reference_only_count,
    unsupported_type_count,
    by_recovery_status: byStatus,
    rows,
  }

  const recoveryMap = {
    audit_meta: {
      pass_name: "legacy_media_preview_recovery_map",
      generated_at: generatedAt,
      generated_by: "scripts/audit-legacy-media-unpreviewable-recovery.mjs",
      source_audit: "data/normalized/legacy-media-unpreviewable-recovery-audit.json",
      entry_count: Object.keys(recoveryEntries).length,
    },
    entries: recoveryEntries,
  }

  const auditPath = path.join(REPO, "data/normalized/legacy-media-unpreviewable-recovery-audit.json")
  const mapPath = path.join(REPO, "data/normalized/legacy-media-preview-recovery-map.json")
  fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2) + "\n", "utf8")
  fs.writeFileSync(mapPath, JSON.stringify(recoveryMap, null, 2) + "\n", "utf8")

  const topRecovered = rows.filter((r) => RECOVERED_STATUSES.has(r.recovery_status)).slice(0, 8)
  const topMissing = rows.filter((r) => r.recovery_status === "still_missing").slice(0, 8)
  const oxford = rows.filter((r) => r.collection_hint === "oxford").slice(0, 3)
  const mon = rows.filter((r) => r.collection_hint === "monchelsea").slice(0, 3)
  const country = rows.filter((r) => r.collection_hint === "country-london-paris").slice(0, 3)

  const md = `# Legacy media unpreviewable recovery audit (read-only)

Generated: **${generatedAt.slice(0, 19)}Z** by \`scripts/audit-legacy-media-unpreviewable-recovery.mjs\`.

## Summary

| Metric | Value |
|--------|------:|
| Unpreviewable rows audited | ${unpreviewable.length} |
| Recovered previewable (QA layer) | ${recovered_previewable_count} |
| Still missing (local binary) | ${still_missing_count} |
| Remote reference only (HTML cache) | ${remote_reference_only_count} |
| Unsupported type | ${unsupported_type_count} |

### By recovery_status

${Object.entries(byStatus)
  .sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `- **${k}:** ${v}`)
  .join("\n")}

## Roots scanned

${index.rootsScanned.map((r) => `- \`${r}\``).join("\n")}

**Files indexed:** ${index.filesIndexed}

## Top recoverable examples

${topRecovered.length ? topRecovered.map((r) => `- \`${r.filename}\` → \`${r.found_path}\` (${r.recovery_status}, ${r.confidence})`).join("\n") : "_None in this environment._"}

## Top missing patterns

${topMissing.length ? topMissing.map((r) => `- \`${r.filename}\` — ${r.reason}`).join("\n") : "_None._"}

## Collection samples

**Oxford:** ${oxford.map((r) => r.filename).join(", ") || "—"}  
**Monchelsea:** ${mon.map((r) => r.filename).join(", ") || "—"}  
**Country:** ${country.map((r) => r.filename).join(", ") || "—"}

## Next safe step

1. Re-run audit after mounting WOODRIGHT mirror or importing basename mirrors under \`data/raw/downloaded-assets/\`.
2. QA board reads \`legacy-media-preview-recovery-map.json\` — previews can show without changing inventory \`previewable\` or assignment identity rules.
3. Do **not** run production media executor from recovery map alone.

## Outputs

- \`data/normalized/legacy-media-unpreviewable-recovery-audit.json\`
- \`data/normalized/legacy-media-preview-recovery-map.json\`

## Safety

- No Medusa DB, seed, catalog-scope, evidence JSON, backend runtime, or executor/apply.
- Recovery improves QA preview only; \`suggestion-product-guard\` unchanged.
`

  const mdPath = path.join(REPO, "docs/storefront/legacy-media-unpreviewable-recovery-audit.md")
  fs.writeFileSync(mdPath, md, "utf8")

  console.log("Wrote", auditPath)
  console.log("Wrote", mapPath)
  console.log("Wrote", mdPath)
  console.log(
    "Summary:",
    unpreviewable.length,
    "unpreviewable,",
    recovered_previewable_count,
    "recovered,",
    still_missing_count,
    "still_missing"
  )
}

main()
