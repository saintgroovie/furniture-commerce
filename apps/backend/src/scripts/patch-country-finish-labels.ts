/**
 * Metadata patch: Country finish labels + paint_finish sync (cream → Молочный).
 *
 * Dry-run:
 *   COUNTRY_FINISH_LABELS_DRY_RUN=1 COUNTRY_FINISH_LABELS_CONFIRM=1 \
 *     npx medusa exec ./src/scripts/patch-country-finish-labels.ts
 *
 * Apply:
 *   COUNTRY_FINISH_LABELS_CONFIRM=1 \
 *     npx medusa exec ./src/scripts/patch-country-finish-labels.ts
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import {
  COUNTRY_FINISH_LABELS,
  isRawFinishTokenLabel,
  isMilkLikeFinishKey,
  isStalePaintFinishMetadata,
  normalizeCountryFinishExecutions,
  normalizeCountryFinishLabelMap,
  sortCountryFinishExecutionsMilkFirst,
  syncCountryPaintFinishMetadata,
} from "../lib/country-finish-labels"

const WHITELIST = [
  "co-02-1",
  "co-05-1",
  "co-08-1",
  "co-14-2",
  "co-15-2",
  "co-61-1",
  "co-62-1",
  "co-62-2",
  "co-62-3",
  "co-65-1",
  "co-65-2",
  "co-66-1",
  "co-69-1",
]

type FinishExecution = { key: string; label: string; urls: string[] }

export default async function patchCountryFinishLabels({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve("logger")
  const dryRun = process.env.COUNTRY_FINISH_LABELS_DRY_RUN === "1"

  if (process.env.COUNTRY_FINISH_LABELS_CONFIRM !== "1") {
    logger.info("Skipped. Set COUNTRY_FINISH_LABELS_CONFIRM=1")
    return
  }

  const productModule = container.resolve(Modules.PRODUCT)
  let patched = 0
  let skipped = 0

  for (const handle of WHITELIST) {
    const listed = await productModule.listProducts(
      { handle },
      { take: 1, relations: ["images"] }
    )
    const product = listed?.[0]
    if (!product?.id) {
      logger.warn(`Skip missing: ${handle}`)
      skipped++
      continue
    }

    const meta = { ...(product.metadata ?? {}) } as Record<string, unknown>
    const rawExecs = meta.finish_color_executions
    if (!Array.isArray(rawExecs) || rawExecs.length < 2) {
      logger.info(`Skip ${handle}: no finish_color_executions`)
      skipped++
      continue
    }

    const executions = rawExecs as FinishExecution[]
    const rawLabels = (meta.finish_color_labels ?? {}) as Record<string, string>
    const needsExecLabelPatch = executions.some(
      (ex) =>
        isRawFinishTokenLabel(ex.label, ex.key) ||
        (isMilkLikeFinishKey(ex.key, ex.label) && ex.label.trim() !== COUNTRY_FINISH_LABELS.milk)
    )
    const needsLabelMapPatch = Object.entries(rawLabels).some(
      ([key, value]) =>
        isRawFinishTokenLabel(value, key) ||
        (isMilkLikeFinishKey(key, value) && value.trim() !== COUNTRY_FINISH_LABELS.milk)
    )
    const needsLabelPatch = needsExecLabelPatch || needsLabelMapPatch
    const needsPaintSync = isStalePaintFinishMetadata(meta)

    if (!needsLabelPatch && !needsPaintSync) {
      logger.info(`Skip ${handle}: labels and paint_finish already in sync`)
      skipped++
      continue
    }

    const nextLabels = normalizeCountryFinishLabelMap(handle, rawLabels)
    let nextExecs = normalizeCountryFinishExecutions(handle, executions, nextLabels)
    nextExecs = sortCountryFinishExecutionsMilkFirst(nextExecs)

    for (const ex of nextExecs) {
      nextLabels[ex.key] = ex.label
    }

    const milkKey = nextExecs.find((e) => e.key === "cream" || e.key === "milk")?.key

    if (dryRun) {
      logger.info(
        `[DRY-RUN] ${handle}: labels=${needsLabelPatch} paint_sync=${needsPaintSync} cream=${nextExecs.find((e) => e.key === "cream")?.label ?? "n/a"} default=${milkKey ?? "n/a"}`
      )
      patched++
      continue
    }

    meta.finish_color_labels = nextLabels
    meta.finish_color_executions = nextExecs
    if (milkKey) meta.default_finish_key = milkKey
    syncCountryPaintFinishMetadata(meta)
    meta.country_finish_labels_patched_at = new Date().toISOString()

    await productModule.updateProducts(product.id, { metadata: meta })
    patched++
    logger.info(
      `Patched ${handle}: paint_sync=${needsPaintSync} ${nextExecs.map((e) => `${e.key}=${e.label}`).join(", ")}`
    )
  }

  logger.info(
    dryRun
      ? `[DRY-RUN] would patch ${patched}, skipped ${skipped}`
      : `Patched ${patched} SKU(s), skipped ${skipped}`
  )
}
