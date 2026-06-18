/**
 * Apply woodright.ru Консоль Step color media to greenwich-gr-44-1 (scoped single SKU).
 *
 * Manifest: prefers tmp/greenwich-finish-color-import/manifests/greenwich-gr-44-1.json
 * (unified pipeline); falls back to legacy tmp/greenwich-gr-44-1-step-color-import/manifest.json.
 * Equivalent apply: GW_FINISH_COLORS_HANDLE=greenwich-gr-44-1 apply-greenwich-finish-colors.ts
 *
 * Dry-run:
 *   GW_GR44_STEP_COLORS_DRY_RUN=1 GW_GR44_STEP_COLORS_CONFIRM=1 \
 *     npx medusa exec ./src/scripts/apply-greenwich-gr-44-1-step-colors.ts
 *
 * Apply:
 *   GW_GR44_STEP_COLORS_CONFIRM=1 \
 *     npx medusa exec ./src/scripts/apply-greenwich-gr-44-1-step-colors.ts
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"

const HANDLE = "greenwich-gr-44-1"
const UNIFIED_MANIFEST = `tmp/greenwich-finish-color-import/manifests/${HANDLE}.json`
const LEGACY_MANIFEST = "tmp/greenwich-gr-44-1-step-color-import/manifest.json"

type Manifest = {
  handle: string
  canonical_name: string
  finish_color_labels: Record<string, string>
  finish_color_executions: Array<{ key: string; label: string; urls: string[] }>
  thumbnail_url: string
  gallery_urls: string[]
  source_url?: string
}

function resolveManifestPath(root: string): string {
  const unified = path.join(root, UNIFIED_MANIFEST)
  if (fs.existsSync(unified)) return unified
  const legacy = path.join(root, LEGACY_MANIFEST)
  if (fs.existsSync(legacy)) return legacy
  throw new Error(
    `Missing manifest for ${HANDLE}. Run fetch-greenwich-finish-colors.mjs or legacy fetch-woodright-colors.mjs first. Expected: ${UNIFIED_MANIFEST}`
  )
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

export default async function applyGreenwichGr44StepColors({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve("logger")
  const dryRun = process.env.GW_GR44_STEP_COLORS_DRY_RUN === "1"

  if (process.env.GW_GR44_STEP_COLORS_CONFIRM !== "1") {
    logger.info("Skipped. Set GW_GR44_STEP_COLORS_CONFIRM=1")
    return
  }

  const root = repoRoot()
  const manifestPath = resolveManifestPath(root)
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Manifest
  if (manifest.handle !== HANDLE) {
    throw new Error(`Manifest handle mismatch: ${manifest.handle}`)
  }

  const base = backendBaseUrl(root)
  for (const rel of manifest.gallery_urls) {
    const disk = path.join(root, "apps/backend", rel.replace(/^\//, ""))
    if (!fs.existsSync(disk)) {
      throw new Error(`Missing static file: ${rel}`)
    }
  }

  const thumbnailUrl = absUrl(base, manifest.thumbnail_url)
  const galleryUrls = manifest.gallery_urls.map((u) => absUrl(base, u))

  const productModule = container.resolve(Modules.PRODUCT)
  const listed = await productModule.listProducts(
    { handle: HANDLE },
    { take: 1, relations: ["images", "variants"] }
  )
  const product = listed?.[0]
  if (!product?.id) throw new Error(`Product not found: ${HANDLE}`)

  const meta = { ...(product.metadata ?? {}) } as Record<string, unknown>
  meta.canonical_name = manifest.canonical_name
  meta.finish_color_labels = manifest.finish_color_labels
  meta.finish_color_executions = manifest.finish_color_executions
  meta.woodright_source_url =
    manifest.source_url ?? "https://woodright.ru/kollekcii/greenwich/konsol-step/"

  if (dryRun) {
    logger.info(
      `[DRY-RUN] Would update ${HANDLE}: ${galleryUrls.length} images, ${manifest.finish_color_executions.length} colors`
    )
    return
  }

  await productModule.updateProducts(product.id, {
    thumbnail: thumbnailUrl,
    images: galleryUrls.map((url) => ({ url })),
    metadata: meta,
  })

  logger.info(
    `Updated ${HANDLE}: thumbnail + ${galleryUrls.length} images, ${manifest.finish_color_executions.length} labeled colors`
  )
}
