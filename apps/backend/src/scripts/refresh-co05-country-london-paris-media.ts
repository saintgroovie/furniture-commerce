/**
 * CO-05-1 (Country London Paris) media URL backfill — uploads → static.
 *
 * Scope: product `prod_01KNTBXADA9TM4A89YEGTRVFDR` (handle `co-05-1`) only.
 * Rewrites `thumbnail` and `images[].url` from
 *   `/uploads/products/country-london-paris/` → `/static/products/country-london-paris/`
 * (handles absolute `http://localhost:9000/...` and relative paths).
 * Does not move/copy/delete files, reseed, or touch other products.
 *
 * Run from apps/backend:
 *   yarn refresh-co05-country-london-paris-media
 *   CO05_MEDIA_URL_APPLY_CONFIRM=1 yarn refresh-co05-country-london-paris-media -- --apply
 */

import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"

const TARGET_PRODUCT_ID = "prod_01KNTBXADA9TM4A89YEGTRVFDR"
const TARGET_HANDLE = "co-05-1"
const FROM_SEGMENT = "/uploads/products/country-london-paris/"
const TO_SEGMENT = "/static/products/country-london-paris/"

type ProductImage = { url?: string } | null | undefined
type ProductRow = {
  id: string
  handle: string
  thumbnail?: string | null
  images?: ProductImage[]
}

type UrlRewrite = {
  field: "thumbnail" | `image[${number}]`
  before: string
  after: string
  staticPath: string
  staticFileExists: boolean
}

function wantsApply(): boolean {
  return process.argv.includes("--apply")
}

function applyConfirmOk(): boolean {
  return process.env.CO05_MEDIA_URL_APPLY_CONFIRM === "1"
}

/** Medusa app root (contains `static/products/...` on disk). */
function backendAppRoot(): string {
  const cwd = process.cwd()
  if (fs.existsSync(path.join(cwd, "static", "products"))) {
    return cwd
  }
  if (path.basename(cwd) === "backend" && path.basename(path.dirname(cwd)) === "apps") {
    return cwd
  }
  const nested = path.join(cwd, "apps", "backend")
  if (fs.existsSync(path.join(nested, "static", "products"))) {
    return nested
  }
  return cwd
}

function toStaticPath(url: string): string | null {
  const idx = url.indexOf(TO_SEGMENT)
  if (idx >= 0) {
    return url.slice(idx)
  }
  const fromIdx = url.indexOf(FROM_SEGMENT)
  if (fromIdx >= 0) {
    return TO_SEGMENT + url.slice(fromIdx + FROM_SEGMENT.length)
  }
  return null
}

function normalizeCo05MediaUrl(url: string | null | undefined): string | null | undefined {
  if (!url || typeof url !== "string") return url
  if (!url.includes(FROM_SEGMENT)) return url
  return url.replaceAll(FROM_SEGMENT, TO_SEGMENT)
}

function staticFileExistsForUrl(appRoot: string, staticPath: string): boolean {
  const rel = staticPath.replace(/^\//, "")
  return fs.existsSync(path.join(appRoot, rel))
}

function collectRewrites(product: ProductRow, appRoot: string): UrlRewrite[] {
  const rewrites: UrlRewrite[] = []

  const thumb = product.thumbnail
  if (thumb && typeof thumb === "string" && thumb.includes(FROM_SEGMENT)) {
    const after = normalizeCo05MediaUrl(thumb) as string
    const staticPath = toStaticPath(after)
    rewrites.push({
      field: "thumbnail",
      before: thumb,
      after,
      staticPath: staticPath ?? "",
      staticFileExists: staticPath ? staticFileExistsForUrl(appRoot, staticPath) : false,
    })
  }

  for (let i = 0; i < (product.images ?? []).length; i++) {
    const url = product.images?.[i]?.url
    if (!url || typeof url !== "string" || !url.includes(FROM_SEGMENT)) continue
    const after = normalizeCo05MediaUrl(url) as string
    const staticPath = toStaticPath(after)
    rewrites.push({
      field: `image[${i}]`,
      before: url,
      after,
      staticPath: staticPath ?? "",
      staticFileExists: staticPath ? staticFileExistsForUrl(appRoot, staticPath) : false,
    })
  }

  return rewrites
}

function buildNextImages(images: ProductImage[] | undefined): { url: string }[] {
  const result: { url: string }[] = []
  for (const image of images ?? []) {
    const url = normalizeCo05MediaUrl(image?.url)
    if (url && typeof url === "string") {
      result.push({ url })
    }
  }
  return result
}

export default async function refreshCo05CountryLondonParisMedia({ container }: ExecArgs) {
  const logger = container.resolve("logger") as {
    info: (s: string) => void
    error: (s: string) => void
  }

  const apply = wantsApply()
  if (apply && !applyConfirmOk()) {
    logger.error(
      "Refusing --apply: set CO05_MEDIA_URL_APPLY_CONFIRM=1 " +
        "(e.g. CO05_MEDIA_URL_APPLY_CONFIRM=1 yarn refresh-co05-country-london-paris-media -- --apply)."
    )
    process.exit(1)
  }

  const productModule = container.resolve(Modules.PRODUCT) as {
    listProducts: (
      filters: Record<string, unknown>,
      config?: { take?: number; relations?: string[] }
    ) => Promise<ProductRow[]>
    updateProducts: (
      id: string,
      data: { thumbnail?: string | null; images?: Array<{ url: string }> }
    ) => Promise<unknown>
  }

  const appRoot = backendAppRoot()
  logger.info("=== CO-05-1 Country London Paris media URL refresh ===")
  logger.info(`Mode: ${apply ? "APPLY" : "DRY-RUN"}`)
  logger.info(`Target product id: ${TARGET_PRODUCT_ID}`)
  logger.info(`Backend app root: ${appRoot}`)

  const listed = await productModule.listProducts(
    { id: TARGET_PRODUCT_ID },
    { take: 1, relations: ["images"] }
  )
  const product = listed?.[0]

  if (!product) {
    logger.error(`Product not found: ${TARGET_PRODUCT_ID}`)
    process.exit(1)
  }

  if (product.handle !== TARGET_HANDLE) {
    logger.error(
      `Handle mismatch: expected ${TARGET_HANDLE}, got ${product.handle} for ${TARGET_PRODUCT_ID}`
    )
    process.exit(1)
  }

  const rewrites = collectRewrites(product, appRoot)
  const imageCount = (product.images ?? []).filter((img) => img?.url).length
  const uniqueStaticPaths = [...new Set(rewrites.map((r) => r.staticPath).filter(Boolean))]
  const missingFiles = rewrites.filter((r) => !r.staticFileExists)

  logger.info(`Image rows in DB: ${imageCount}`)
  logger.info(`Rows needing URL rewrite: ${rewrites.length}`)
  logger.info(`Unique /static paths to verify: ${uniqueStaticPaths.length}`)

  for (const row of rewrites) {
    logger.info(
      `[${row.field}] exists=${row.staticFileExists} ${row.staticPath}\n  before: ${row.before}\n  after:  ${row.after}`
    )
  }

  if (missingFiles.length > 0) {
    logger.error(`Abort: ${missingFiles.length} target static file(s) missing on disk.`)
    for (const row of missingFiles) {
      logger.error(`  missing: ${path.join(appRoot, row.staticPath.replace(/^\//, ""))}`)
    }
    process.exit(1)
  }

  if (rewrites.length === 0) {
    logger.info("No /uploads URLs to rewrite — already normalized or empty.")
    logger.info("=== CO-05-1 media URL refresh complete ===")
    return
  }

  const nextThumbnail = normalizeCo05MediaUrl(product.thumbnail)
  const nextImages = buildNextImages(product.images)

  if (!apply) {
    logger.info("Dry-run only — no DB writes. Pass --apply with CO05_MEDIA_URL_APPLY_CONFIRM=1 to apply.")
    logger.info("=== CO-05-1 media URL refresh complete ===")
    return
  }

  await productModule.updateProducts(product.id, {
    thumbnail: nextThumbnail ?? null,
    images: nextImages,
  })

  logger.info(`Applied ${rewrites.length} URL rewrite(s) for ${TARGET_HANDLE} (${product.id}).`)
  logger.info("=== CO-05-1 media URL refresh complete ===")
}
