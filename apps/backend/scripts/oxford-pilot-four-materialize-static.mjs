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

function main() {
  const dryRun = process.argv.includes("--dry-run")
  const raw = JSON.parse(fs.readFileSync(candidatesPath, "utf-8"))
  const rows = raw.entity_mapping_rows ?? []
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
    let srcName = base
    if (INTERIM_FROM_PRIMARY[base]) {
      srcName = INTERIM_FROM_PRIMARY[base]
    }
    const src = path.join(rawDir, srcName)
    const dest = path.join(staticOxfordDir, base)
    copies.push({ storageKey, src, dest, srcName })
  }

  let ok = true
  for (const { storageKey, src, dest, srcName } of copies) {
    if (!fs.existsSync(src)) {
      console.error(`Missing source for ${storageKey}: ${src}`)
      ok = false
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
