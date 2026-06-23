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
import {
  buildBuyerGallery,
  pickBuyerThumbnail,
  sortFinishExecutions,
  toMedusaImages,
} from "../lib/gallery-buyer-sort"
import { withSwatchHexArray } from "../lib/dimension-swatch-hex"

type Manifest = {
  handle: string
  canonical_name: string
  finish_color_labels: Record<string, string>
  finish_color_executions: Array<{ key: string; label: string; urls: string[] }>
  thumbnail_url: string
  gallery_urls: string[]
  source_url?: string
}

function tokenFromFilename(filename: string): string | null {
  const hay = filename.toLowerCase()
  const darkCompound = hay.match(
    /greenwich[_-]dark[_-](grey-blue|darkblue|white|cacao|powder|cream|terracote|graphite|green|olive|capuchino|grey)(?:\d{2}|[_\-.])/i
  )
  if (darkCompound?.[1]) return darkCompound[1].toLowerCase()
  const numbered = hay.match(
    /greenwich[_-](grey-blue|darkblue|white|cacao|powder|cream|terracote|graphite|green|olive|capuchino|grey)(?:\d{2}|07|08|09|04|05|06|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27)(?:[_\-.]|$)/i
  )
  if (numbered?.[1]) return numbered[1].toLowerCase()
  const legacy07 = hay.match(/greenwich[_-]([a-z0-9-]+?)07(?:[_-]|\.)/i)
  if (legacy07?.[1]) {
    const raw = legacy07[1].toLowerCase()
    if (raw.startsWith("dark_")) return raw.slice(5)
    return raw
  }
  if (/\d{4}-\d{2}-\d{2}/.test(hay)) return null
  return null
}

function isNeutralAsset(url: string): boolean {
  const base = url.split("/").pop() ?? ""
  if (/\d{4}-\d{2}-\d{2}/.test(base)) return true
  return tokenFromFilename(base) === null
}

function sanitizeFinishExecutions(
  executions: Manifest["finish_color_executions"]
): { executions: Manifest["finish_color_executions"]; gallery_urls: string[] } {
  const basenameOwner = new Map<string, string>()
  const cleaned: Manifest["finish_color_executions"] = []
  const gallery_urls: string[] = []

  for (const ex of executions) {
    const urls: string[] = []
    for (const url of ex.urls ?? []) {
      if (isNeutralAsset(url)) continue
      const tok = tokenFromFilename(url.split("/").pop() ?? "")
      if (tok && tok !== ex.key) continue
      const base = url.split("/").pop() ?? url
      const owner = basenameOwner.get(base)
      if (owner && owner !== ex.key) continue
      basenameOwner.set(base, ex.key)
      urls.push(url)
      if (!gallery_urls.includes(url)) gallery_urls.push(url)
    }
    if (urls.length > 0) cleaned.push({ key: ex.key, label: ex.label, urls })
  }
  return { executions: cleaned, gallery_urls }
}

function validateNoCrossColorDupes(executions: Manifest["finish_color_executions"]): string[] {
  const errors: string[] = []
  const owner = new Map<string, string>()
  for (const ex of executions) {
    for (const url of ex.urls) {
      const base = url.split("/").pop() ?? url
      const prev = owner.get(base)
      if (prev && prev !== ex.key) {
        errors.push(`duplicate ${base} in "${prev}" and "${ex.key}"`)
      } else {
        owner.set(base, ex.key)
      }
    }
  }
  return errors
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

  const sanitized = sanitizeFinishExecutions(manifest.finish_color_executions)
  manifest.finish_color_executions = sanitized.executions
  manifest.gallery_urls = sanitized.gallery_urls
  const dupErrors = validateNoCrossColorDupes(manifest.finish_color_executions)
  if (dupErrors.length > 0) {
    throw new Error(`Manifest validation failed for ${handle}:\n${dupErrors.slice(0, 8).join("\n")}`)
  }

  const base = backendBaseUrl(root)
  const { executions: sortedExecs, sharedTailUrls } = sortFinishExecutions(
    manifest.finish_color_executions,
    handle
  )
  manifest.finish_color_executions = withSwatchHexArray(sortedExecs)

  const colorUrlSet: string[] = []
  for (const ex of sortedExecs) {
    for (const u of ex.urls ?? []) {
      if (!colorUrlSet.includes(u)) colorUrlSet.push(u)
    }
  }
  const galleryRel = buildBuyerGallery(colorUrlSet, sharedTailUrls, { handle })

  for (const rel of galleryRel) {
    const disk = path.join(root, "apps/backend", rel.replace(/^\//, ""))
    if (!fs.existsSync(disk)) {
      throw new Error(`Missing static file: ${rel}`)
    }
  }

  const galleryUrls = galleryRel.map((u) => absUrl(base, u))
  const thumbnailUrl = pickBuyerThumbnail(galleryUrls, handle) || galleryUrls[0]!

  const productModule = container.resolve(Modules.PRODUCT)
  const listed = await productModule.listProducts(
    { handle },
    { take: 1, relations: ["images", "variants"] }
  )
  const product = listed?.[0]
  if (!product?.id) throw new Error(`Product not found: ${handle}`)

  const meta = { ...(product.metadata ?? {}) } as Record<string, unknown>
  meta.canonical_name = manifest.canonical_name
  meta.paint_finish_labels = manifest.finish_color_labels
  meta.paint_finish_executions = manifest.finish_color_executions
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
    images: toMedusaImages(galleryUrls, handle),
    metadata: meta,
  })

  logger.info(
    `Updated ${handle}: thumbnail + ${galleryUrls.length} images, ${manifest.finish_color_executions.length} labeled colors`
  )
}
