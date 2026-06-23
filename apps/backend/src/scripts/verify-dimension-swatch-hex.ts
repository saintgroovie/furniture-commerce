/**
 * Verify swatch_hex coverage on published products with dimension execution metadata.
 *
 *   DIMENSION_SWATCH_VERIFY_CONFIRM=1 \
 *     npx medusa exec ./src/scripts/verify-dimension-swatch-hex.ts
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import {
  listPublishedProductsPaginated,
  SWATCH_EXECUTION_METADATA_KEYS,
  type SwatchExecutionMetadataKey,
} from "../lib/dimension-swatch-hex"

/** Legacy alias arrays — gaps ignored when canonical sibling has hex for the same key. */
const ALIAS_TO_CANONICAL: Partial<
  Record<SwatchExecutionMetadataKey, SwatchExecutionMetadataKey>
> = {
  finish_color_executions: "paint_finish_executions",
  upholstery_color_executions: "fabric_upholstery_executions",
  material_tier_executions: "construction_tier_executions",
}

function hexKeys(raw: unknown): Set<string> {
  const keys = new Set<string>()
  if (!Array.isArray(raw)) return keys
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue
    const o = entry as Record<string, unknown>
    const rowKey = typeof o.key === "string" ? o.key : null
    const hex = typeof o.swatch_hex === "string" ? o.swatch_hex.trim() : ""
    if (rowKey && hex) keys.add(rowKey)
  }
  return keys
}

function missingHexRows(meta: Record<string, unknown>): string[] {
  const missing: string[] = []
  for (const key of SWATCH_EXECUTION_METADATA_KEYS) {
    const raw = meta[key]
    if (!Array.isArray(raw) || raw.length < 2) continue
    const canonicalKey = ALIAS_TO_CANONICAL[key]
    const canonicalHexKeys = canonicalKey ? hexKeys(meta[canonicalKey]) : new Set<string>()
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue
      const o = entry as Record<string, unknown>
      const rowKey = typeof o.key === "string" ? o.key : "?"
      const hex = typeof o.swatch_hex === "string" ? o.swatch_hex.trim() : ""
      if (hex) continue
      if (canonicalKey && canonicalHexKeys.has(rowKey)) continue
      missing.push(`${key}.${rowKey}`)
    }
  }
  return missing
}

export default async function verifyDimensionSwatchHex({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve("logger")

  if (process.env.DIMENSION_SWATCH_VERIFY_CONFIRM !== "1") {
    logger.info("Skipped. Set DIMENSION_SWATCH_VERIFY_CONFIRM=1")
    return
  }

  const productModule = container.resolve(Modules.PRODUCT)
  const listed = await listPublishedProductsPaginated(
    (filters, config) => productModule.listProducts(filters, config),
    { status: "published" },
    ["images", "variants"]
  )

  let withExecutions = 0
  let complete = 0
  const gaps: string[] = []

  for (const product of listed ?? []) {
    const handle = product.handle ?? product.id
    const meta = (product.metadata ?? {}) as Record<string, unknown>
    const hasAny = SWATCH_EXECUTION_METADATA_KEYS.some((key: SwatchExecutionMetadataKey) => {
      const raw = meta[key]
      return Array.isArray(raw) && raw.length >= 2
    })
    if (!hasAny) continue
    withExecutions++
    const missing = missingHexRows(meta)
    if (missing.length === 0) {
      complete++
      continue
    }
    gaps.push(`${handle}: ${missing.join(", ")}`)
  }

  logger.info(
    `swatch_hex verify: ${complete}/${withExecutions} complete (${gaps.length} with gaps)`
  )
  for (const line of gaps.slice(0, 30)) {
    logger.warn(line)
  }
  if (gaps.length > 30) {
    logger.warn(`... and ${gaps.length - 30} more`)
  }
}
