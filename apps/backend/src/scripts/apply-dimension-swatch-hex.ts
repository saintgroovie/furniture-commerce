/**
 * Backfill swatch_hex on all published products with dimension execution metadata.
 *
 * Dry-run:
 *   DIMENSION_SWATCH_DRY_RUN=1 DIMENSION_SWATCH_CONFIRM=1 \
 *     npx medusa exec ./src/scripts/apply-dimension-swatch-hex.ts
 *
 * Apply:
 *   DIMENSION_SWATCH_CONFIRM=1 \
 *     npx medusa exec ./src/scripts/apply-dimension-swatch-hex.ts
 *
 * Optional: DIMENSION_SWATCH_HANDLE=co-65-1
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import {
  enrichProductSwatchMetadata,
  listPublishedProductsPaginated,
  SWATCH_EXECUTION_METADATA_KEYS,
} from "../lib/dimension-swatch-hex"

function hasSwatchExecutions(meta: Record<string, unknown>): boolean {
  return SWATCH_EXECUTION_METADATA_KEYS.some((key) => {
    const raw = meta[key]
    return Array.isArray(raw) && raw.length >= 2
  })
}

export default async function applyDimensionSwatchHex({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve("logger")
  const dryRun = process.env.DIMENSION_SWATCH_DRY_RUN === "1"
  const scopeHandle = (process.env.DIMENSION_SWATCH_HANDLE ?? "").trim().toLowerCase()

  if (process.env.DIMENSION_SWATCH_CONFIRM !== "1") {
    logger.info("Skipped. Set DIMENSION_SWATCH_CONFIRM=1")
    return
  }

  const productModule = container.resolve(Modules.PRODUCT)
  const listed = scopeHandle
    ? await productModule.listProducts(
        { handle: scopeHandle, status: "published" },
        { take: 1, relations: ["images", "variants"] }
      )
    : await listPublishedProductsPaginated(
        (filters, config) =>
          productModule.listProducts(filters, config),
        { status: "published" },
        ["images", "variants"]
      )

  let updated = 0
  let skipped = 0

  for (const product of listed ?? []) {
    const handle = (product.handle ?? "").toLowerCase()
    if (!product.id || !handle) continue

    const meta = { ...(product.metadata ?? {}) } as Record<string, unknown>
    if (!hasSwatchExecutions(meta)) {
      skipped++
      continue
    }

    const { meta: enriched, changed } = enrichProductSwatchMetadata(meta)
    if (!changed) {
      skipped++
      continue
    }

    if (dryRun) {
      const summary = SWATCH_EXECUTION_METADATA_KEYS.filter((key) => {
        const rows = enriched[key]
        return Array.isArray(rows) && rows.length >= 2
      })
        .map((key) => {
          const rows = enriched[key] as Array<{ key: string; swatch_hex?: string }>
          return `${key}=${rows.map((r) => `${r.key}:${r.swatch_hex ?? "?"}`).join(",")}`
        })
        .join(" | ")
      logger.info(`[DRY-RUN] ${handle}: ${summary}`)
      continue
    }

    await productModule.updateProducts(product.id, { metadata: enriched })
    updated++
    logger.info(`Backfilled swatch_hex: ${handle}`)
  }

  if (dryRun) {
    const candidates = (listed ?? []).filter((p) =>
      hasSwatchExecutions((p.metadata ?? {}) as Record<string, unknown>)
    ).length
    logger.info(`[DRY-RUN] ${candidates} SKU(s) with swatch execution metadata`)
    return
  }

  logger.info(`swatch_hex backfill: updated ${updated}, skipped ${skipped}`)
}
