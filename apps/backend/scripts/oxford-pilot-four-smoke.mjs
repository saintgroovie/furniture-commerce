/**
 * Oxford-4 pilot smoke: validates subset isolation + static + seed JSON shape.
 * Writes data/normalized/oxford-four-pilot-ingestion-smoke.json (no Medusa).
 *
 * Run from apps/backend: yarn oxford-pilot-four:smoke
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const backendRoot = path.join(__dirname, "..")
const repoRoot = path.join(backendRoot, "..", "..")

const ALLOWED_WORKBOOK_KEYS = new Set([
  "oxford:OX-14-1",
  "oxford:OX-14-11",
  "oxford:OX-90-1",
  "oxford:S-OX-05",
])
const ALLOWED_HANDLES = new Set(["ox-14-1", "ox-14-11", "ox-90-1", "s-ox-05"])

const paths = {
  candidates: path.join(
    repoRoot,
    "data/normalized/oxford-four-pdf-seed-interim-candidates.json"
  ),
  pilotSeed: path.join(
    repoRoot,
    "data/normalized/seed-products.oxford-pilot-four.json"
  ),
  staticOxford: path.join(backendRoot, "static/products/oxford"),
  smokeOut: path.join(
    repoRoot,
    "data/normalized/oxford-four-pilot-ingestion-smoke.json"
  ),
  storefrontCatalogScope: path.join(
    repoRoot,
    "apps/storefront/src/lib/catalog-scope.ts"
  ),
}

function storageBasename(storageKey) {
  return storageKey.split("/").pop()
}

function main() {
  const report = {
    audit_meta: {
      pass: "oxford-four-pilot-ingestion-smoke",
      date: new Date().toISOString().slice(0, 10),
    },
    subset_isolation: { ok: true, violations: [] },
    static_files: { ok: true, missing: [] },
    pilot_seed_json: { ok: true, violations: [] },
    storefront_scope_file: { touched_check: "read_only", path: paths.storefrontCatalogScope },
  }

  const candidates = JSON.parse(fs.readFileSync(paths.candidates, "utf-8"))
  const include = new Set(candidates.seed_filter?.include_workbook_row_keys ?? [])
  if (include.size !== 4) {
    report.subset_isolation.ok = false
    report.subset_isolation.violations.push(
      `candidates include_workbook_row_keys count !== 4 (${include.size})`
    )
  }
  for (const k of ALLOWED_WORKBOOK_KEYS) {
    if (!include.has(k)) {
      report.subset_isolation.ok = false
      report.subset_isolation.violations.push(`candidates missing allowed key ${k}`)
    }
  }

  const seedRows = JSON.parse(fs.readFileSync(paths.pilotSeed, "utf-8"))
  if (!Array.isArray(seedRows) || seedRows.length !== 4) {
    report.pilot_seed_json.ok = false
    report.pilot_seed_json.violations.push(
      `seed-products.oxford-pilot-four.json must be array of length 4 (got ${Array.isArray(seedRows) ? seedRows.length : typeof seedRows})`
    )
  } else {
    const handles = new Set()
    for (const row of seedRows) {
      handles.add(row.medusa_product_handle)
      if (!ALLOWED_WORKBOOK_KEYS.has(row.workbook_row_key)) {
        report.pilot_seed_json.ok = false
        report.pilot_seed_json.violations.push(
          `unexpected workbook_row_key ${row.workbook_row_key}`
        )
      }
      if (row.medusa_collection_handle !== "oxford") {
        report.pilot_seed_json.ok = false
        report.pilot_seed_json.violations.push(
          `handle ${row.medusa_product_handle}: collection must be oxford`
        )
      }
      if (row.readiness_status !== "seed_ready_with_caveat") {
        report.pilot_seed_json.ok = false
        report.pilot_seed_json.violations.push(
          `${row.medusa_product_handle}: readiness_status must be seed_ready_with_caveat`
        )
      }
      if (row.currency_code !== "rub") {
        report.pilot_seed_json.ok = false
        report.pilot_seed_json.violations.push(`${row.medusa_product_handle}: currency_code must be rub`)
      }
      const wrk = String(row.workbook_row_key)
      if (wrk.startsWith("greenwich:") || wrk.startsWith("oliver:")) {
        report.pilot_seed_json.ok = false
        report.pilot_seed_json.violations.push(
          `non-Oxford pilot workbook_row_key must not appear: ${wrk}`
        )
      }
      if (!wrk.startsWith("oxford:")) {
        report.pilot_seed_json.ok = false
        report.pilot_seed_json.violations.push(`workbook_row_key must be oxford:* got ${wrk}`)
      }
    }
    if (handles.size !== 4) {
      report.pilot_seed_json.ok = false
      report.pilot_seed_json.violations.push("duplicate medusa_product_handle in pilot seed")
    }
    for (const h of ALLOWED_HANDLES) {
      if (!handles.has(h)) {
        report.pilot_seed_json.ok = false
        report.pilot_seed_json.violations.push(`missing handle ${h}`)
      }
    }
  }

  const keys = new Set()
  for (const row of candidates.entity_mapping_rows ?? []) {
    for (const k of row.upload_manifest_refs ?? []) keys.add(k)
  }
  for (const storageKey of keys) {
    const base = storageBasename(storageKey)
    const dest = path.join(paths.staticOxford, base)
    if (!fs.existsSync(dest)) {
      report.static_files.ok = false
      report.static_files.missing.push(storageKey)
    }
  }

  if (!fs.existsSync(paths.storefrontCatalogScope)) {
    report.subset_isolation.ok = false
    report.subset_isolation.violations.push("catalog-scope.ts missing (storefront check)")
  }

  report.verdict =
    report.subset_isolation.ok && report.static_files.ok && report.pilot_seed_json.ok
      ? "ok"
      : "fail"

  fs.mkdirSync(path.dirname(paths.smokeOut), { recursive: true })
  fs.writeFileSync(paths.smokeOut, JSON.stringify(report, null, 2) + "\n", "utf-8")
  console.log(`Wrote ${paths.smokeOut}`)
  console.log(JSON.stringify(report, null, 2))
  if (report.verdict !== "ok") {
    process.exit(1)
  }
}

main()
