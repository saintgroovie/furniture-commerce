/**
 * Oxford-4 pilot: copy PDF extracts into apps/backend/static/products/oxford/
 * so /static/products/oxford/* URLs resolve. Does not run Medusa.
 *
 * Run from apps/backend: yarn oxford-pilot-four:materialize-static
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const backendRoot = path.join(__dirname, "..")
const repoRoot = path.join(backendRoot, "..", "..")
const rawDir = path.join(
  repoRoot,
  "data/raw/pdf-assets/extracted/Oxford_full"
)
const staticOxfordDir = path.join(
  backendRoot,
  "static/products/oxford"
)
const candidatesPath = path.join(
  repoRoot,
  "data/normalized/oxford-four-pdf-seed-interim-candidates.json"
)
const interimSourceMapPath = path.join(
  repoRoot,
  "data/normalized/oxford-four-pilot-interim-asset-source-map.json"
)

/** Interim hero filenames → source basename under Oxford_full (distinct heroes per SKU). */
const INTERIM_FROM_PRIMARY = {
  "ox-14-1_interim_pdf_gallery_01.png": "Oxford_full_p6_i1_887x621.png",
  "ox-14-11_interim_pdf_gallery_01.png": "Oxford_full_p5_i0_947x949.png",
  "ox-90-1_interim_pdf_gallery_01.png": "Oxford_full_p6_i0_887x614.png",
  "s-ox-05_interim_pdf_gallery_01.png": "Oxford_full_p4_i0_1306x951.png",
}

function storageBasename(storageKey) {
  const parts = storageKey.split("/")
  return parts[parts.length - 1]
}

function readInterimSourceMap() {
  if (!fs.existsSync(interimSourceMapPath)) {
    return new Map()
  }
  const raw = JSON.parse(fs.readFileSync(interimSourceMapPath, "utf-8"))
  const rows = raw.rows ?? []
  const map = new Map()
  for (const row of rows) {
    const target = row.target_static_path
    const selected = row.selected_source_paths
    if (typeof target !== "string" || !Array.isArray(selected)) {
      continue
    }
    const targetAbs = path.join(repoRoot, target)
    map.set(path.basename(targetAbs), selected.map((p) => path.join(repoRoot, p)))
  }
  return map
}

function main() {
  const dryRun = process.argv.includes("--dry-run")
  const raw = JSON.parse(fs.readFileSync(candidatesPath, "utf-8"))
  const rows = raw.entity_mapping_rows ?? []
  const interimSourceMap = readInterimSourceMap()
  const keys = new Set()
  for (const row of rows) {
    for (const k of row.upload_manifest_refs ?? []) {
      keys.add(k)
    }
  }

  fs.mkdirSync(staticOxfordDir, { recursive: true })

  const copies = []
  for (const storageKey of keys) {
    const base = storageBasename(storageKey)
    let srcCandidates = interimSourceMap.get(base) ?? []
    if (srcCandidates.length === 0) {
      let srcName = base
      if (INTERIM_FROM_PRIMARY[base]) {
        srcName = INTERIM_FROM_PRIMARY[base]
      }
      srcCandidates = [path.join(rawDir, srcName)]
    }
    const dest = path.join(staticOxfordDir, base)
    copies.push({ storageKey, srcCandidates, dest })
  }

  let ok = true
  for (const { storageKey, srcCandidates, dest } of copies) {
    const src = srcCandidates.find((p) => fs.existsSync(p))
    if (!src) {
      console.error(`Missing source for ${storageKey}. Checked: ${srcCandidates.join(", ")}`)
      ok = false
      continue
    }
    const srcName = path.basename(src)
    if (path.resolve(src) === path.resolve(dest)) {
      console.log(`Source already materialized for ${storageKey}: ${path.basename(dest)}`)
      continue
    }
    if (dryRun) {
      console.log(`[dry-run] would copy ${srcName} -> ${path.basename(dest)}`)
    } else {
      fs.copyFileSync(src, dest)
      console.log(`Copied ${srcName} -> static/products/oxford/${path.basename(dest)}`)
    }
  }

  if (!ok) {
    process.exit(1)
  }
}

main()
