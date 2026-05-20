/**
 * CO-05-1 (Country London Paris) media URL backfill — uploads → static.
 *
 * Scope: product `prod_01KNTBXADA9TM4A89YEGTRVFDR` (handle `co-05-1`) only.
 * Delegates rewrite logic to lib/media-url-static-rewrite.ts.
 *
 * Run from apps/backend:
 *   yarn refresh-co05-country-london-paris-media
 *   CO05_MEDIA_URL_APPLY_CONFIRM=1 yarn refresh-co05-country-london-paris-media -- --apply
 */

import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import * as path from "path"
import {
  backendAppRoot,
  buildNextImages,
  buildNextThumbnail,
  buildProductMatrixRow,
  collectRewrites,
  type ProductRow,
} from "./lib/media-url-static-rewrite"

const TARGET_PRODUCT_ID = "prod_01KNTBXADA9TM4A89YEGTRVFDR"
const TARGET_HANDLE = "co-05-1"
const COLLECTION = "country-london-paris" as const

function wantsApply(): boolean {
  return process.argv.includes("--apply")
}

function applyConfirmOk(): boolean {
  return process.env.CO05_MEDIA_URL_APPLY_CONFIRM === "1"
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

  const scope = [COLLECTION]
  const rewrites = collectRewrites(product, appRoot, scope)
  const matrix = buildProductMatrixRow(product, rewrites)
  const imageCount = (product.images ?? []).filter((img) => img?.url).length
  const uniqueStaticPaths = [...new Set(rewrites.map((r) => r.staticPath).filter(Boolean))]
  const missingFiles = rewrites.filter((r) => !r.staticFileExists)

  logger.info(`Image rows in DB: ${imageCount}`)
  logger.info(`Rows needing URL rewrite: ${rewrites.length}`)
  logger.info(`Unique /static paths to verify: ${uniqueStaticPaths.length}`)
  logger.info(`Product matrix: ${JSON.stringify(matrix)}`)

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

  if (!apply) {
    logger.info("Dry-run only — no DB writes. Pass --apply with CO05_MEDIA_URL_APPLY_CONFIRM=1 to apply.")
    logger.info("=== CO-05-1 media URL refresh complete ===")
    return
  }

  await productModule.updateProducts(product.id, {
    thumbnail: buildNextThumbnail(product.thumbnail, rewrites) ?? null,
    images: buildNextImages(product.images),
  })

  logger.info(`Applied ${rewrites.length} URL rewrite(s) for ${TARGET_HANDLE} (${product.id}).`)
  logger.info("=== CO-05-1 media URL refresh complete ===")
}
