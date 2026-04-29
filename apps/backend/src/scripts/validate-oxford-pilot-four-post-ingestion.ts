/**
 * Oxford-4 pilot post-ingestion validation (read-only).
 *
 * Run from apps/backend after pilot seed:
 *   OXFORD_PILOT_POST_INGESTION_VALIDATE=1 yarn oxford-pilot-four:validate-post-ingestion
 *
 * Optional: OXFORD_PILOT_VALIDATE_REFERENCE_HANDLES=gw-example,ol-00-1
 *   — comma-separated Medusa handles that must still exist (Greenwich/Oliver spot check; no writes).
 */

import { ExecArgs } from "@medusajs/framework/types"
import * as fs from "fs"
import * as path from "path"

type SeedProduct = {
  workbook_row_key: string
  product_code_normalized: string
  medusa_product_handle: string
  medusa_product_title: string
  medusa_collection_handle: string
  medusa_category_handle: string
  medusa_product_type: "STANDARD" | "CONFIGURABLE" | "BESPOKE"
  medusa_variant_sku: string
  medusa_price_amount: number
  currency_code: string
  readiness_status: string
  image_urls: string[]
  main_image_url: string | null
}

const PILOT_HANDLES = ["ox-14-1", "ox-14-11", "ox-90-1", "s-ox-05"] as const

function loadPilotSeedJson(): SeedProduct[] {
  const relativePath = "data/normalized/seed-products.oxford-pilot-four.json"
  const candidates = [
    path.join(process.cwd(), relativePath),
    path.resolve(process.cwd(), "../../", relativePath),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return JSON.parse(fs.readFileSync(candidate, "utf-8")) as SeedProduct[]
    }
  }
  throw new Error(`Missing ${relativePath}`)
}

function repoRoot(): string {
  const c = process.cwd()
  const base = path.basename(c)
  if (base === "backend" && path.basename(path.dirname(c)) === "apps") {
    return path.resolve(c, "../..")
  }
  return path.resolve(c, "../..")
}

function metaBool(v: unknown): boolean {
  return v === true || v === "true"
}

function metaStr(v: unknown): string | null {
  if (v === null || v === undefined) return null
  return String(v)
}

function assertOxfordPausedInCatalogScope(root: string): { ok: boolean; detail: string } {
  const scopePath = path.join(root, "apps/storefront/src/lib/catalog-scope.ts")
  if (!fs.existsSync(scopePath)) {
    return { ok: false, detail: `catalog-scope.ts not found at ${scopePath}` }
  }
  const txt = fs.readFileSync(scopePath, "utf-8")
  const pausedBlock = txt.split("const PAUSED_COLLECTION_KEYS")[1]?.split("]")[0] ?? ""
  if (!pausedBlock.includes('"oxford"') && !pausedBlock.includes("'oxford'")) {
    return {
      ok: false,
      detail: "PAUSED_COLLECTION_KEYS does not list oxford (storefront pause contract broken?)",
    }
  }
  const activeBlock = txt.split("const ACTIVE_COLLECTION_KEYS")[1]?.split("]")[0] ?? ""
  if (activeBlock.includes('"oxford"') || activeBlock.includes("'oxford'")) {
    return { ok: false, detail: "oxford must not appear in ACTIVE_COLLECTION_KEYS" }
  }
  return { ok: true, detail: "oxford remains in PAUSED_COLLECTION_KEYS only" }
}

export default async function validateOxfordPilotFourPostIngestion({ container }: ExecArgs) {
  const logger = container.resolve("logger") as { info: (s: string) => void }
  const root = repoRoot()
  const report: Record<string, unknown> = {
    audit_meta: {
      pass: "oxford-four-pilot-post-ingestion-validation",
      date: new Date().toISOString().slice(0, 10),
    },
    guard: { env_required: "OXFORD_PILOT_POST_INGESTION_VALIDATE=1" },
  }

  if (process.env.OXFORD_PILOT_POST_INGESTION_VALIDATE !== "1") {
    logger.info(
      "Oxford pilot post-ingestion validation skipped. Set OXFORD_PILOT_POST_INGESTION_VALIDATE=1 to run read-only DB checks."
    )
    report.skipped = true
    report.verdict = "skipped"
    if (process.env.OXFORD_PILOT_VALIDATION_WRITE_SKIPPED_REPORT === "1") {
      const outPath = path.join(root, "data/normalized/oxford-four-pilot-post-ingestion-validation.json")
      fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf-8")
      logger.info(`Wrote skipped report to ${outPath} (OXFORD_PILOT_VALIDATION_WRITE_SKIPPED_REPORT=1)`)
    } else {
      logger.info(
        "No validation JSON written (avoid committing skipped as canonical). Set OXFORD_PILOT_POST_INGESTION_VALIDATE=1 for DB evidence, or OXFORD_PILOT_VALIDATION_WRITE_SKIPPED_REPORT=1 to emit skipped JSON."
      )
    }
    return
  }

  const violations: string[] = []
  const seedRows = loadPilotSeedJson()
  if (seedRows.length !== 4) {
    violations.push(`pilot seed JSON must have 4 rows, got ${seedRows.length}`)
  }

  const scopeCheck = assertOxfordPausedInCatalogScope(root)
  report.storefront_pause_contract = scopeCheck
  if (!scopeCheck.ok) {
    violations.push(scopeCheck.detail)
  }

  const refHandlesRaw = process.env.OXFORD_PILOT_VALIDATE_REFERENCE_HANDLES?.trim() ?? ""
  const referenceHandles = refHandlesRaw
    ? refHandlesRaw.split(",").map((h) => h.trim()).filter(Boolean)
    : []
  const refFound = new Set<string>()

  const query = container.resolve("query") as any

  const pilotHandleList = [...PILOT_HANDLES]
  const { data: pilotProducts } = await query.graph({
    entity: "product",
    fields: ["*", "variants.*", "variants.prices.*", "images.*"],
    filters: { handle: pilotHandleList },
  })
  let list = (pilotProducts ?? []).filter((p: any) => pilotHandleList.includes(p.handle))
  if (list.length === 0) {
    const { data: allProducts } = await query.graph({
      entity: "product",
      fields: ["*", "variants.*", "variants.prices.*", "images.*"],
    })
    list = (allProducts ?? []).filter((p: any) => pilotHandleList.includes(p.handle))
  }

  report.pilot_products_in_db = { count: list.length, handles_found: list.map((p: any) => p.handle) }

  if (list.length !== 4) {
    violations.push(
      `expected 4 pilot products in DB, found ${list.length} (handles: ${list.map((p: any) => p.handle).join(", ") || "none"})`
    )
  }

  const seedByHandle = new Map(seedRows.map((r) => [r.medusa_product_handle, r]))

  for (const handle of pilotHandleList) {
    const seed = seedByHandle.get(handle)
    const pr = list.find((p: any) => p.handle === handle)
    if (!seed || !pr) {
      if (seed && !pr) violations.push(`missing product in DB: ${handle}`)
      continue
    }

    const meta = (pr.metadata ?? {}) as Record<string, unknown>

    if (metaStr(meta.collection) !== "oxford") {
      violations.push(`${handle}: metadata.collection must be "oxford" (got ${JSON.stringify(meta.collection)})`)
    }
    if (!metaBool(meta.oxford_pilot_four)) {
      violations.push(`${handle}: metadata.oxford_pilot_four must be true`)
    }
    if (metaStr(meta.workbook_row_key) !== seed.workbook_row_key) {
      violations.push(`${handle}: workbook_row_key mismatch`)
    }
    if (metaStr(meta.readiness_status) !== "seed_ready_with_caveat") {
      violations.push(`${handle}: metadata.readiness_status must be seed_ready_with_caveat`)
    }
    if (metaStr(meta.entity_layer_readiness_status) !== "pdf_seed_interim") {
      violations.push(`${handle}: entity_layer_readiness_status must be pdf_seed_interim`)
    }
    if (String(pr.title) !== seed.medusa_product_title) {
      violations.push(`${handle}: title mismatch vs pilot seed JSON`)
    }

    const thumb = pr.thumbnail
    if (typeof thumb !== "string" || thumb.length < 8) {
      violations.push(`${handle}: thumbnail missing or invalid`)
    } else if (!thumb.includes("static/products/oxford")) {
      violations.push(`${handle}: thumbnail URL must reference static/products/oxford`)
    }

    const imgs = pr.images ?? []
    if (!Array.isArray(imgs) || imgs.length < 1) {
      violations.push(`${handle}: images[] empty`)
    } else if (imgs.length < seed.image_urls.length) {
      violations.push(
        `${handle}: images count ${imgs.length} < seed image_urls ${seed.image_urls.length}`
      )
    }

    const variant = pr.variants?.[0]
    if (!variant) {
      violations.push(`${handle}: no default variant`)
    } else {
      if (variant.sku !== seed.medusa_variant_sku) {
        violations.push(`${handle}: variant sku mismatch`)
      }
      const price = variant.prices?.[0]
      const amt = price?.amount
      const n = typeof amt === "bigint" ? Number(amt) : Number(amt)
      if (!Number.isFinite(n) || n !== seed.medusa_price_amount) {
        violations.push(
          `${handle}: variant price amount expected ${seed.medusa_price_amount} got ${String(amt)}`
        )
      }
      const cur = price?.currency_code
      if (String(cur).toLowerCase() !== seed.currency_code.toLowerCase()) {
        violations.push(`${handle}: currency_code expected ${seed.currency_code} got ${String(cur)}`)
      }
    }

    try {
      const { data } = await query.graph({
        entity: "product",
        fields: ["id", "handle", "product_classification.product_type"],
        filters: { id: pr.id },
      })
      const pt = data?.[0]?.product_classification?.product_type
      if (pt !== seed.medusa_product_type) {
        violations.push(
          `${handle}: ProductClassification.product_type expected ${seed.medusa_product_type} got ${String(pt)}`
        )
      }
    } catch (e: any) {
      violations.push(`${handle}: classification query failed: ${e?.message ?? e}`)
    }
  }

  if (referenceHandles.length > 0) {
    const { data: refProducts } = await query.graph({
      entity: "product",
      fields: ["handle"],
      filters: { handle: referenceHandles },
    })
    for (const p of refProducts ?? []) {
      refFound.add(p.handle)
    }
    for (const h of referenceHandles) {
      if (!refFound.has(h)) {
        violations.push(`reference handle missing in DB (expected Greenwich/Oliver unchanged): ${h}`)
      }
    }
  }
  report.reference_handles = {
    configured: referenceHandles.length > 0,
    handles: referenceHandles,
    found: referenceHandles.length > 0 ? [...refFound] : undefined,
  }

  report.violations = violations
  report.verdict = violations.length === 0 ? "ok" : "fail"

  const outPath = path.join(root, "data/normalized/oxford-four-pilot-post-ingestion-validation.json")
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf-8")
  logger.info(`Wrote ${outPath}`)
  logger.info(`Oxford pilot post-ingestion verdict=${report.verdict} violations=${violations.length}`)

  if (violations.length > 0) {
    for (const v of violations) {
      logger.info(`  - ${v}`)
    }
    throw new Error(`Oxford pilot post-ingestion validation failed (${violations.length} violation(s))`)
  }
}
