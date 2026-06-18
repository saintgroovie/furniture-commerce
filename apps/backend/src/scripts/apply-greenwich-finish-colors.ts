/**
 * Apply woodright.ru Greenwich finish-color media from tmp manifest (scoped per handle).
 *
 * Dry-run:
 *   GW_FINISH_COLORS_DRY_RUN=1 GW_FINISH_COLORS_CONFIRM=1 GW_FINISH_COLORS_HANDLE=greenwich-gr-05-1 \
 *     npx medusa exec ./src/scripts/apply-greenwich-finish-colors.ts
 *
 * Apply:
 *   GW_FINISH_COLORS_CONFIRM=1 GW_FINISH_COLORS_HANDLE=greenwich-gr-05-1 \
 *     npx medusa exec ./src/scripts/apply-greenwich-finish-colors.ts
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"

type Manifest = {
  handle: string
  canonical_name: string
  finish_color_labels: Record<string, string>
  finish_color_executions: Array<{ key: string; label: string; urls: string[] }>
  thumbnail_url: string
  gallery_urls: string[]
  source_url?: string
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

export default async function applyGreenwichFinishColors({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve("logger")
  const dryRun = process.env.GW_FINISH_COLORS_DRY_RUN === "1"
  const handle = (process.env.GW_FINISH_COLORS_HANDLE ?? "").trim()

  if (process.env.GW_FINISH_COLORS_CONFIRM !== "1") {
    logger.info("Skipped. Set GW_FINISH_COLORS_CONFIRM=1 and GW_FINISH_COLORS_HANDLE=<handle>")
    return
  }
  if (!handle) {
    throw new Error("GW_FINISH_COLORS_HANDLE is required")
  }

  const root = repoRoot()
  const manifestPath = path.join(
    root,
    "tmp/greenwich-finish-color-import/manifests",
    `${handle}.json`
  )
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing manifest: ${manifestPath}. Run fetch-greenwich-finish-colors.mjs first.`)
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Manifest
  if (manifest.handle !== handle) {
    throw new Error(`Manifest handle mismatch: ${manifest.handle} != ${handle}`)
  }

  for (const rel of manifest.gallery_urls) {
    const disk = path.join(root, "apps/backend", rel.replace(/^\//, ""))
    if (!fs.existsSync(disk)) {
      throw new Error(`Missing static file: ${rel}`)
    }
  }

  const base = backendBaseUrl(root)
  const thumbnailUrl = absUrl(base, manifest.thumbnail_url)
  const galleryUrls = manifest.gallery_urls.map((u) => absUrl(base, u))

  const productModule = container.resolve(Modules.PRODUCT)
  const listed = await productModule.listProducts(
    { handle },
    { take: 1, relations: ["images", "variants"] }
  )
  const product = listed?.[0]
  if (!product?.id) throw new Error(`Product not found: ${handle}`)

  const meta = { ...(product.metadata ?? {}) } as Record<string, unknown>
  meta.canonical_name = manifest.canonical_name
  meta.finish_color_labels = manifest.finish_color_labels
  meta.finish_color_executions = manifest.finish_color_executions
  if (manifest.source_url) meta.woodright_source_url = manifest.source_url

  if (dryRun) {
    logger.info(
      `[DRY-RUN] Would update ${handle}: ${galleryUrls.length} images, ${manifest.finish_color_executions.length} colors`
    )
    return
  }

  await productModule.updateProducts(product.id, {
    thumbnail: thumbnailUrl,
    images: galleryUrls.map((url) => ({ url })),
    metadata: meta,
  })

  logger.info(
    `Updated ${handle}: thumbnail + ${galleryUrls.length} images, ${manifest.finish_color_executions.length} labeled colors`
  )
}
