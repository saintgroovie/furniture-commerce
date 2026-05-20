/**
 * Batch media URL normalization: /uploads/products/{collection}/ → /static/products/{collection}/.
 *
 * Scope (default): country-london-paris + provence products with /uploads/ media URLs.
 * Does not copy/move/delete files. Preserves image order. Skips co-05-1 when already clean.
 *
 * Run from apps/backend:
 *   yarn refresh-media-urls-to-static
 *   MEDIA_URL_STATIC_REWRITE_APPLY_CONFIRM=1 yarn refresh-media-urls-to-static -- --apply
 *
 * Flags:
 *   --apply
 *   --collection country-london-paris | provence
 *   --product-id prod_...
 *   --handle co-02-1
 */

import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import * as path from "path"
import {
  MEDIA_COLLECTION_SLUGS,
  type MediaCollectionSlug,
  type ProductMatrixRow,
  type ProductRow,
  backendAppRoot,
  buildNextImages,
  buildNextThumbnail,
  buildProductMatrixRow,
  collectRewrites,
  isMediaCollectionSlug,
  productHasUploadsInScope,
} from "./lib/media-url-static-rewrite"

type CliArgs = {
  apply: boolean
  collection: MediaCollectionSlug | null
  productId: string | null
  handle: string | null
}

function parseCliArgs(): CliArgs {
  const argv = process.argv.slice(2)
  let collection: MediaCollectionSlug | null = null
  let productId: string | null = null
  let handle: string | null = null

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--collection") {
      const value = argv[++i]
      if (!value || !isMediaCollectionSlug(value)) {
        throw new Error(
          `Invalid --collection (expected: ${MEDIA_COLLECTION_SLUGS.join(" | ")})`
        )
      }
      collection = value
    } else if (arg === "--product-id") {
      productId = argv[++i] ?? null
    } else if (arg === "--handle") {
      handle = argv[++i] ?? null
    }
  }

  return {
    apply: argv.includes("--apply"),
    collection,
    productId,
    handle,
  }
}

function applyConfirmOk(): boolean {
  return process.env.MEDIA_URL_STATIC_REWRITE_APPLY_CONFIRM === "1"
}

function scopeCollections(cli: CliArgs): MediaCollectionSlug[] {
  return cli.collection ? [cli.collection] : [...MEDIA_COLLECTION_SLUGS]
}

export default async function refreshMediaUrlsToStatic({ container }: ExecArgs) {
  const logger = container.resolve("logger") as {
    info: (s: string) => void
    error: (s: string) => void
  }

  let cli: CliArgs
  try {
    cli = parseCliArgs()
  } catch (e) {
    logger.error(String(e))
    process.exit(1)
  }

  if (cli.apply && !applyConfirmOk()) {
    logger.error(
      "Refusing --apply: set MEDIA_URL_STATIC_REWRITE_APPLY_CONFIRM=1 " +
        "(e.g. MEDIA_URL_STATIC_REWRITE_APPLY_CONFIRM=1 yarn refresh-media-urls-to-static -- --apply)."
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
  const collections = scopeCollections(cli)

  logger.info("=== Media URL static rewrite (country-london-paris + provence) ===")
  logger.info(`Mode: ${cli.apply ? "APPLY" : "DRY-RUN"}`)
  logger.info(`Scope collections: ${collections.join(", ")}`)
  if (cli.productId) logger.info(`Filter product id: ${cli.productId}`)
  if (cli.handle) logger.info(`Filter handle: ${cli.handle}`)
  logger.info(`Backend app root: ${appRoot}`)

  const filters: Record<string, unknown> = {}
  if (cli.productId) filters.id = cli.productId
  if (cli.handle) filters.handle = cli.handle

  const listed = await productModule.listProducts(filters, {
    take: cli.productId || cli.handle ? 1 : 2500,
    relations: ["images"],
  })

  const candidates = (listed ?? []).filter((p) => productHasUploadsInScope(p, collections))

  if (cli.productId || cli.handle) {
    if (!listed?.length) {
      logger.error("Product not found for given --product-id / --handle filter.")
      process.exit(1)
    }
    if (!candidates.length) {
      const p = listed[0]
      const matrix = buildProductMatrixRow(p, collectRewrites(p, appRoot, collections))
      logger.info("Product matrix:")
      logger.info(JSON.stringify(matrix, null, 2))
      logger.info("No /uploads/ URLs in scope — nothing to rewrite.")
      logger.info("=== Media URL static rewrite complete ===")
      return
    }
  }

  const matrixRows: ProductMatrixRow[] = []
  let totalRewrites = 0
  let productsWithRewrites = 0
  let productsApplied = 0
  const missingAll: { handle: string; staticPath: string }[] = []

  for (const product of candidates) {
    const rewrites = collectRewrites(product, appRoot, collections)
    const matrix = buildProductMatrixRow(product, rewrites)
    matrixRows.push(matrix)
    totalRewrites += rewrites.length
    if (rewrites.length > 0) productsWithRewrites++

    for (const row of rewrites) {
      if (!row.staticFileExists) {
        missingAll.push({ handle: product.handle, staticPath: row.staticPath })
      }
    }

    logger.info(
      `[matrix] ${product.handle} (${product.id}) collection=${matrix.collection} ` +
        `thumb=${matrix.thumbRewrites} images=${matrix.imageRewrites} ` +
        `missing=${matrix.missingStatic} skipped=${matrix.skippedReasons.join("; ") || "-"}`
    )
  }

  const byCollection = {
    "country-london-paris": matrixRows.filter((r) => r.collection === "country-london-paris"),
    provence: matrixRows.filter((r) => r.collection === "provence"),
  }

  logger.info(`Candidates with /uploads/ in scope: ${candidates.length}`)
  logger.info(`Products needing rewrite: ${productsWithRewrites}`)
  logger.info(`Total URL rewrites: ${totalRewrites}`)
  logger.info(
    `Per-collection products: country-london-paris=${byCollection["country-london-paris"].length} provence=${byCollection.provence.length}`
  )
  logger.info(
    `Per-collection rewrites: country-london-paris=${byCollection["country-london-paris"].reduce((n, r) => n + r.thumbRewrites + r.imageRewrites, 0)} provence=${byCollection.provence.reduce((n, r) => n + r.thumbRewrites + r.imageRewrites, 0)}`
  )

  if (missingAll.length > 0) {
    logger.error(`Abort: ${missingAll.length} target static file(s) missing on disk.`)
    for (const row of missingAll.slice(0, 20)) {
      logger.error(`  ${row.handle}: ${path.join(appRoot, row.staticPath.replace(/^\//, ""))}`)
    }
    process.exit(1)
  }

  if (!cli.apply) {
    logger.info("Dry-run only — no DB writes. Pass --apply with MEDIA_URL_STATIC_REWRITE_APPLY_CONFIRM=1 to apply.")
    logger.info("=== Media URL static rewrite complete ===")
    return
  }

  for (const product of candidates) {
    const rewrites = collectRewrites(product, appRoot, collections)
    if (rewrites.length === 0) continue

    await productModule.updateProducts(product.id, {
      thumbnail: buildNextThumbnail(product.thumbnail, rewrites) ?? null,
      images: buildNextImages(product.images),
    })
    productsApplied++
  }

  logger.info(`Applied URL rewrites for ${productsApplied} product(s).`)
  logger.info("=== Media URL static rewrite complete ===")
}
