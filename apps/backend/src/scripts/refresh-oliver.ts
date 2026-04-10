/**
 * Oliver-only metadata backfill: maps `data/normalized/seed-products.fixed2.json`
 * display contract fields into `product.metadata` for existing `ol-*` products.
 *
 * - Matches products by `medusa_product_handle` from JSON === Medusa `handle`.
 * - Updates metadata only; does not touch thumbnail, images, variants, or prices.
 * - Does not modify Greenwich or other collections.
 * - Idempotent: safe to re-run after JSON changes.
 *
 * Run from apps/backend: yarn refresh-oliver
 *   or: npx medusa exec ./src/scripts/refresh-oliver.ts
 */

import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"

type DimensionsMm = {
  width_mm: number
  depth_mm: number
  height_mm: number
}

interface SeedProductRow {
  medusa_product_handle: string
  canonical_name: string
  dimensions_normalized: DimensionsMm | null
}

const OLIVER_COLLECTION = "oliver" as const
const OLIVER_COLLECTION_LABEL = "Oliver" as const

function loadSeedProductsFixed2(): SeedProductRow[] {
  const candidates = [
    path.join(process.cwd(), "data/normalized/seed-products.fixed2.json"),
    path.resolve(process.cwd(), "../../data/normalized/seed-products.fixed2.json"),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const raw = JSON.parse(fs.readFileSync(candidate, "utf-8")) as SeedProductRow[]
      return Array.isArray(raw) ? raw : []
    }
  }
  throw new Error(
    `seed-products.fixed2.json not found. Tried:\n${candidates.join("\n")}`
  )
}

function oliverRows(rows: SeedProductRow[]): SeedProductRow[] {
  return rows.filter((r) => {
    const h = r.medusa_product_handle
    return typeof h === "string" && h.startsWith("ol-")
  })
}

function buildMetadata(
  row: SeedProductRow,
  existing: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...existing }
      : {}

  base.collection = OLIVER_COLLECTION
  base.collection_label = OLIVER_COLLECTION_LABEL
  base.canonical_name = row.canonical_name

  const d = row.dimensions_normalized
  if (
    d &&
    typeof d.width_mm === "number" &&
    typeof d.depth_mm === "number" &&
    typeof d.height_mm === "number"
  ) {
    base.dimensions = {
      width_mm: d.width_mm,
      depth_mm: d.depth_mm,
      height_mm: d.height_mm,
    }
  } else {
    delete base.dimensions
  }

  return base
}

export default async function refreshOliver({ container }: ExecArgs) {
  const logger = container.resolve("logger") as { info: (s: string) => void }
  const productModule = container.resolve(Modules.PRODUCT) as {
    listProducts: (
      filters: Record<string, unknown>,
      config?: { take?: number; relations?: string[] }
    ) => Promise<
      Array<{ id: string; handle: string; metadata?: Record<string, unknown> | null }>
    >
    updateProducts: (
      idOrSelector: string | Record<string, unknown>,
      data: { metadata?: Record<string, unknown> }
    ) => Promise<unknown>
  }

  logger.info("=== Oliver metadata refresh ===")

  const allRows = loadSeedProductsFixed2()
  const rows = oliverRows(allRows)
  if (rows.length === 0) {
    logger.info("No Oliver rows (ol-*) in seed-products.fixed2.json. Nothing to do.")
    return
  }

  const rowByHandle = new Map(rows.map((r) => [r.medusa_product_handle, r]))
  const expectedHandles = new Set(rowByHandle.keys())
  const handleList = Array.from(expectedHandles)

  let listed = await productModule.listProducts(
    { handle: handleList },
    { take: Math.max(64, handleList.length), relations: [] }
  )

  let products = (listed ?? []).filter((p) => expectedHandles.has(p.handle))
  if (products.length === 0 && handleList.length > 0) {
    logger.info(
      "No match via handle filter; falling back to scanning product list (compat)."
    )
    const all = await productModule.listProducts({}, { take: 2500, relations: [] })
    products = (all ?? []).filter((p) => expectedHandles.has(p.handle))
  }

  if (products.length === 0) {
    logger.info(
      "No Oliver (ol-*) products found in DB. Run real-data seed first for missing products."
    )
    return
  }

  let updated = 0
  let missing = 0

  for (const handle of expectedHandles) {
    const row = rowByHandle.get(handle)!
    const pr = products.find((p) => p.handle === handle)
    if (!pr) {
      missing++
      logger.info(`  SKIP (not in DB): ${handle}`)
      continue
    }
    const nextMeta = buildMetadata(row, pr.metadata ?? undefined)
    await productModule.updateProducts(pr.id, { metadata: nextMeta })
    updated++
  }

  if (updated === 0) {
    logger.info("Nothing to update.")
    return
  }

  logger.info(`Updated metadata for ${updated} Oliver products.`)
  if (missing > 0) {
    logger.info(
      `Handles in seed-products.fixed2.json but not in DB: ${missing} (seed to create).`
    )
  }
  logger.info("=== Oliver metadata refresh complete ===")
}
