/**
 * Apply Greenwich bed GR-BED-POOL + headboard_model_executions to all greenwich-bed SKUs.
 *
 * Dry-run:
 *   GW_BED_MEDIA_DRY_RUN=1 GW_BED_MEDIA_CONFIRM=1 \
 *     npx medusa exec ./src/scripts/apply-greenwich-bed-media.ts
 *
 * Apply:
 *   GW_BED_MEDIA_CONFIRM=1 \
 *     npx medusa exec ./src/scripts/apply-greenwich-bed-media.ts
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"

const MANIFEST_REL = "tmp/greenwich-bed-headboard-import/manifests/greenwich-bed-pool.json"

type HeadboardExecution = { key: string; label: string; urls: string[] }

type Manifest = {
  display_group?: string
  handles: string[]
  headboard_model_executions: HeadboardExecution[]
  thumbnail_url: string
  gallery_urls: string[]
}

function repoRoot(): string {
  const cwd = process.cwd()
  if (path.basename(cwd) === "backend" && path.basename(path.dirname(cwd)) === "apps") {
    return path.resolve(cwd, "../..")
  }
  return path.resolve(cwd, "../..")
}

function backendBaseUrl(root: string): string {
  const envPath = path.join(root, "apps/backend/.env")
  if (fs.existsSync(envPath)) {
    const env = fs.readFileSync(envPath, "utf8")
    const m = env.match(/^MEDUSA_BACKEND_URL=(.+)$/m)
    if (m) return m[1].trim().replace(/^["']|["']$/g, "").replace(/\/$/, "")
  }
  return "http://localhost:9000"
}

function absUrl(base: string, publicUrl: string): string {
  const p = publicUrl.startsWith("/") ? publicUrl : `/${publicUrl}`
  return `${base}${p}`
}

function loadAndValidateManifest(root: string): { manifestPath: string; manifest: Manifest } {
  const manifestPath = path.join(root, MANIFEST_REL)
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `Missing manifest: ${MANIFEST_REL}. Run fetch-greenwich-bed-headboard.mjs first.`
    )
  }

  let raw: unknown
  try {
    raw = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  } catch {
    throw new Error(`Invalid JSON in manifest: ${MANIFEST_REL}`)
  }

  const manifest = raw as Manifest
  if (!Array.isArray(manifest.handles) || manifest.handles.length === 0) {
    throw new Error(`Manifest ${MANIFEST_REL}: handles[] must be non-empty`)
  }
  if (
    !Array.isArray(manifest.headboard_model_executions) ||
    manifest.headboard_model_executions.length < 2
  ) {
    throw new Error(
      `Manifest ${MANIFEST_REL}: headboard_model_executions must have at least 2 entries`
    )
  }
  for (const entry of manifest.headboard_model_executions) {
    if (!entry?.key?.trim() || !entry?.label?.trim()) {
      throw new Error(`Manifest ${MANIFEST_REL}: each headboard execution needs key + label`)
    }
    if (!Array.isArray(entry.urls) || entry.urls.length === 0) {
      throw new Error(
        `Manifest ${MANIFEST_REL}: headboard "${entry.key}" must have at least one url`
      )
    }
  }
  if (typeof manifest.thumbnail_url !== "string" || !manifest.thumbnail_url.trim()) {
    throw new Error(`Manifest ${MANIFEST_REL}: thumbnail_url is required`)
  }
  if (!Array.isArray(manifest.gallery_urls) || manifest.gallery_urls.length === 0) {
    throw new Error(`Manifest ${MANIFEST_REL}: gallery_urls[] must be non-empty`)
  }

  for (const rel of manifest.gallery_urls) {
    const disk = path.join(root, "apps/backend", rel.replace(/^\//, ""))
    if (!fs.existsSync(disk)) {
      throw new Error(`Missing static file: ${rel}`)
    }
  }

  return { manifestPath, manifest }
}

export default async function applyGreenwichBedMedia({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve("logger")
  const dryRun = process.env.GW_BED_MEDIA_DRY_RUN === "1"

  if (process.env.GW_BED_MEDIA_CONFIRM !== "1") {
    logger.info("Skipped. Set GW_BED_MEDIA_CONFIRM=1")
    return
  }

  const root = repoRoot()
  const { manifestPath, manifest } = loadAndValidateManifest(root)

  const base = backendBaseUrl(root)
  const thumbnailUrl = absUrl(base, manifest.thumbnail_url)
  const galleryUrls = manifest.gallery_urls.map((u) => absUrl(base, u))
  const headboardLabels = Object.fromEntries(
    manifest.headboard_model_executions.map((e) => [e.key, e.label])
  )

  const productModule = container.resolve(Modules.PRODUCT)
  const planned: string[] = []

  for (const handle of manifest.handles) {
    const listed = await productModule.listProducts(
      { handle },
      { take: 1, relations: ["images", "variants"] }
    )
    const product = listed?.[0]
    if (!product?.id) {
      logger.warn(`Skip missing product: ${handle}`)
      continue
    }
    planned.push(handle)

    if (dryRun) continue

    const meta = { ...(product.metadata ?? {}) } as Record<string, unknown>
    meta.display_group = manifest.display_group ?? "greenwich-bed"
    meta.headboard_model_labels = headboardLabels
    meta.headboard_model_executions = manifest.headboard_model_executions

    await productModule.updateProducts(product.id, {
      thumbnail: thumbnailUrl,
      images: galleryUrls.map((url) => ({ url })),
      metadata: meta,
    })
    logger.info(`Updated ${handle}: ${galleryUrls.length} pool images, 3 headboard models`)
  }

  if (dryRun) {
    logger.info(
      `[DRY-RUN] Would update ${planned.length} bed SKU(s) from ${manifestPath}: ${galleryUrls.length} images, ${manifest.headboard_model_executions.length} headboard models — ${planned.join(", ")}`
    )
    return
  }

  if (planned.length === 0) {
    throw new Error(`No products found for handles in ${MANIFEST_REL}`)
  }
}
