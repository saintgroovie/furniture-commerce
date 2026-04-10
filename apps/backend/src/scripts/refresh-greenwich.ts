/**
 * Greenwich-only metadata backfill: aligns existing Medusa products with
 * data/normalized/greenwich-ingestion.json display contract.
 *
 * - Matches products by `handle` only (17 Greenwich pilot handles).
 * - Updates metadata only; does not touch thumbnail, images, variants, or prices.
 * - Idempotent: safe to re-run after ingestion JSON changes.
 *
 * Run from apps/backend: npx medusa exec ./src/scripts/refresh-greenwich.ts
 */

import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"

interface GreenwichIngestionRow {
  handle: string
  workbook_row_key: string
  workbook_row_index: number
  product_code_normalized: string
  canonical_name: string
  collection: string
  collection_label: string
  dimensions: { height_mm: number; width_mm: number; depth_mm: number } | null
  asset_tier: string
  asset_quality: string
  display_group?: string
  display_group_title?: string
  display_group_sort?: number
}

function loadIngestion(): GreenwichIngestionRow[] {
  const candidates = [
    path.join(process.cwd(), "data/greenwich/greenwich-ingestion.json"),
    path.resolve(process.cwd(), "../../data/normalized/greenwich-ingestion.json"),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return JSON.parse(fs.readFileSync(candidate, "utf-8"))
    }
  }
  throw new Error(
    `greenwich-ingestion.json not found. Tried:\n${candidates.join("\n")}`
  )
}

function buildMetadata(
  row: GreenwichIngestionRow,
  existing: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...existing }
      : {}

  base.collection = row.collection ?? "greenwich"
  base.collection_label = row.collection_label ?? "Greenwich"
  base.canonical_name = row.canonical_name
  base.workbook_row_key = row.workbook_row_key
  base.workbook_row_index = row.workbook_row_index
  base.product_code_normalized = row.product_code_normalized
  base.asset_tier = row.asset_tier
  base.asset_quality = row.asset_quality

  if (row.dimensions) {
    base.dimensions = row.dimensions
  } else {
    delete base.dimensions
  }

  if (row.display_group) {
    base.display_group = row.display_group
    base.display_group_title = row.display_group_title
    base.display_group_sort = row.display_group_sort
  } else {
    delete base.display_group
    delete base.display_group_title
    delete base.display_group_sort
  }

  return base
}

export default async function refreshGreenwich({ container }: ExecArgs) {
  const logger = container.resolve("logger") as { info: (s: string) => void }
  // Medusa Product module: updateProducts(id, data) per product — bulk selector form applies one payload to all matches.
  const productModule = container.resolve(Modules.PRODUCT) as {
    listProducts: (
      filters: Record<string, unknown>,
      config?: { take?: number; relations?: string[] }
    ) => Promise<Array<{ id: string; handle: string; metadata?: Record<string, unknown> | null }>>
    updateProducts: (
      idOrSelector: string | Record<string, unknown>,
      data: { metadata?: Record<string, unknown> }
    ) => Promise<unknown>
  }

  logger.info("=== Greenwich metadata refresh ===")

  const rows = loadIngestion()
  const expectedHandles = new Set(rows.map((r) => r.handle))
  const rowByHandle = new Map(rows.map((r) => [r.handle, r]))

  const handleList = Array.from(expectedHandles)
  let listed = await productModule.listProducts(
    { handle: handleList },
    { take: Math.max(32, handleList.length), relations: [] }
  )

  let products = (listed ?? []).filter((p) => expectedHandles.has(p.handle))
  if (products.length === 0 && handleList.length > 0) {
    logger.info(
      "No match via handle filter; falling back to scanning product list (compat)."
    )
    const all = await productModule.listProducts({}, { take: 1000, relations: [] })
    products = (all ?? []).filter((p) => expectedHandles.has(p.handle))
  }

  if (products.length === 0) {
    logger.info(
      "No Greenwich ingestion handles found in DB. Run seed-greenwich first for missing products."
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

  logger.info(`Updated metadata for ${updated} Greenwich products.`)
  if (missing > 0) {
    logger.info(`Handles in ingestion but not in DB: ${missing} (seed to create).`)
  }
  logger.info("=== Greenwich metadata refresh complete ===")
}
