/**
 * Phase F: migrate scene-only SKUs (gallery/iso filenames, no color executions)
 * to dimension v1 with shared_scene_media only — no invented swatches.
 *
 * Dry-run:
 *   SCENE_ONLY_GALLERY_DRY_RUN=1 SCENE_ONLY_GALLERY_CONFIRM=1 \
 *     npx medusa exec ./src/scripts/apply-scene-only-gallery-batch.ts
 *
 * Apply:
 *   SCENE_ONLY_GALLERY_CONFIRM=1 \
 *     npx medusa exec ./src/scripts/apply-scene-only-gallery-batch.ts
 *
 * Optional: SCENE_ONLY_GALLERY_HANDLE=co-62-3
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"
import { migrateProductDimensionMetadata } from "../lib/gallery-dimension-metadata"
import { listPublishedProductsPaginated } from "../lib/dimension-swatch-hex"

function repoRoot(): string {
  const cwd = process.cwd()
  if (path.basename(cwd) === "backend" && path.basename(path.dirname(cwd)) === "apps") {
    return path.resolve(cwd, "../..")
  }
  return path.resolve(cwd, "../..")
}

function normalizeUrls(product: {
  thumbnail?: string | null
  images?: Array<{ url?: string | null } | null> | null
}): string[] {
  const out: string[] = []
  const push = (u: unknown) => {
    if (typeof u !== "string") return
    const s = u.trim()
    if (!s || out.includes(s)) return
    out.push(s)
  }
  push(product.thumbnail)
  for (const img of product.images ?? []) push(img?.url)
  return out
}

function loadSceneOnlyAudit(root: string): Map<
  string,
  { gallery_only?: boolean; meta_exec?: number; url_color_tokens?: number }
> {
  const p = path.join(root, "tmp/missing-color-metadata-scan/scene-only-missing.json")
  if (!fs.existsSync(p)) return new Map()
  const data = JSON.parse(fs.readFileSync(p, "utf8")) as {
    issues?: Array<{
      handle: string
      gallery_only?: boolean
      meta_exec?: number
      url_color_tokens?: number
    }>
  }
  const map = new Map<
    string,
    { gallery_only?: boolean; meta_exec?: number; url_color_tokens?: number }
  >()
  for (const row of data.issues ?? []) {
    map.set(row.handle.toLowerCase(), row)
  }
  return map
}

function loadSceneOnlyHandles(
  audit: Map<string, { gallery_only?: boolean; meta_exec?: number; url_color_tokens?: number }>
): Set<string> {
  return new Set(
    [...audit.entries()]
      .filter(([, row]) => row.gallery_only !== false)
      .map(([h]) => h)
  )
}

export default async function applySceneOnlyGalleryBatch({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve("logger")
  const dryRun = process.env.SCENE_ONLY_GALLERY_DRY_RUN === "1"
  const scopeHandle = (process.env.SCENE_ONLY_GALLERY_HANDLE ?? "").trim().toLowerCase()

  if (process.env.SCENE_ONLY_GALLERY_CONFIRM !== "1") {
    logger.info("Skipped. Set SCENE_ONLY_GALLERY_CONFIRM=1")
    return
  }

  const root = repoRoot()
  const audit = loadSceneOnlyAudit(root)
  const sceneHandles = loadSceneOnlyHandles(audit)
  if (sceneHandles.size === 0) {
    logger.warn("No scene-only handles in tmp/missing-color-metadata-scan/scene-only-missing.json")
    return
  }

  const productModule = container.resolve(Modules.PRODUCT)
  const listed = await listPublishedProductsPaginated(
    (filters, config) => productModule.listProducts(filters, config),
    { status: "published" },
    ["images", "variants"]
  )

  let updated = 0
  let skipped = 0
  let alreadyOk = 0

  for (const product of listed) {
    const handle = (product.handle ?? "").toLowerCase()
    if (!product.id || !handle) continue
    if (scopeHandle && handle !== scopeHandle) continue
    if (!scopeHandle && !sceneHandles.has(handle)) continue

    const auditRow = audit.get(handle)
    if (
      auditRow &&
      ((auditRow.meta_exec ?? 0) >= 1 || (auditRow.url_color_tokens ?? 0) >= 1)
    ) {
      skipped++
      logger.info(`Skip ${handle}: audit meta_exec/url_color_tokens — needs manual review`)
      continue
    }

    const meta = (product.metadata ?? {}) as Record<string, unknown>
    const hasExecutions = [
      "paint_finish_executions",
      "finish_color_executions",
      "fabric_upholstery_executions",
    ].some((k) => Array.isArray(meta[k]) && (meta[k] as unknown[]).length >= 2)

    if (hasExecutions) {
      skipped++
      logger.info(`Skip ${handle}: already has execution rows`)
      continue
    }

    const allUrls = normalizeUrls(product)
    const p = { title: product.title, handle: product.handle, metadata: product.metadata }
    const { meta: next, changed } = migrateProductDimensionMetadata(p, allUrls)

    const shared = Array.isArray(next.shared_scene_media)
      ? (next.shared_scene_media as unknown[]).length
      : 0
    const dimV = next.dimension_metadata_version

    if (!changed && dimV && shared > 0) {
      alreadyOk++
      logger.info(`OK ${handle}: dimension v${dimV} shared=${shared} (no change)`)
      continue
    }

    if (dryRun) {
      logger.info(`[DRY-RUN] ${handle}: shared=${shared} dim_v=${dimV ?? "—"} changed=${changed}`)
      continue
    }

    await productModule.updateProducts(product.id, { metadata: next })
    updated++
    logger.info(`Scene-only gallery metadata: ${handle} shared=${shared}`)
  }

  if (dryRun) {
    logger.info(
      `[DRY-RUN] scene-only batch: ${sceneHandles.size} handles in audit; already_ok=${alreadyOk} skipped=${skipped}`
    )
    return
  }

  logger.info(
    `scene-only gallery batch: updated=${updated} already_ok=${alreadyOk} skipped=${skipped}`
  )
}
