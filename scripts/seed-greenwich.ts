/**
 * Greenwich collection pilot seed script for Medusa v2.
 *
 * Deployment:
 *   1. Copy processed assets to apps/backend/uploads/products/greenwich/
 *   2. Copy this file to apps/backend/src/scripts/seed-greenwich.ts
 *   3. Run: npx medusa exec ./src/scripts/seed-greenwich.ts
 *
 * Reads product data from data/normalized/greenwich-ingestion.json
 * Does NOT modify existing products, categories, or demo data.
 */

import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import {
  createProductsWorkflow,
  batchLinkProductsToCategoryWorkflow,
} from "@medusajs/medusa/core-flows"
import { PRODUCT_EXTENSION_MODULE } from "../modules/product-extension"
import * as fs from "fs"
import * as path from "path"

interface GreenwichProduct {
  handle: string
  sku: string
  title: string
  description: string
  category_handle: string
  category_name: string
  product_type: "STANDARD" | "CONFIGURABLE" | "BESPOKE"
  price_kopeks: number
  dimensions: { height_mm: number; width_mm: number; depth_mm: number } | null
  thumbnail_storage_key: string | null
  gallery_storage_keys: string[]
  asset_tier: string
  asset_quality: string
  collection_label?: string
  display_group?: string
  display_group_title?: string
  display_group_sort?: number
  canonical_name?: string
  workbook_row_key?: string
  workbook_row_index?: number
  product_code_normalized?: string
}

const NEW_CATEGORIES = [
  { name: "кровати", handle: "krovati" },
  { name: "зеркала", handle: "zerkala" },
  { name: "комоды", handle: "komody" },
  { name: "консоли", handle: "konsoli" },
] as const

function loadIngestionData(): GreenwichProduct[] {
  const candidates = [
    path.join(process.cwd(), "data/greenwich/greenwich-ingestion.json"),
    path.resolve(process.cwd(), "../../data/normalized/greenwich-ingestion.json"),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return JSON.parse(fs.readFileSync(candidate, "utf-8"))
    }
  }

  throw new Error(
    `Greenwich ingestion data not found. Tried:\n${candidates.join("\n")}\n` +
      `Copy greenwich-ingestion.json to one of these locations.`
  )
}

function buildImageUrl(storageKey: string): string {
  const base = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"
  return `${base}/static/${storageKey}`
}

export default async function seedGreenwich({ container }: ExecArgs) {
  const logger = container.resolve("logger") as { info: (s: string) => void }
  const link = container.resolve("link") as {
    create: (data: Record<string, Record<string, string>>) => Promise<unknown>
  }

  logger.info("=== Greenwich Pilot Seed ===")

  const greenwichProducts = loadIngestionData()
  logger.info(`Loaded ${greenwichProducts.length} Greenwich products from ingestion data`)

  // --- Ensure categories exist ---
  const productModule = container.resolve(Modules.PRODUCT) as any

  logger.info("Ensuring Greenwich categories exist...")
  const allCategoryHandles = new Set(greenwichProducts.map((p) => p.category_handle))
  const categoryIdByHandle: Record<string, string> = {}

  for (const handle of allCategoryHandles) {
    const existing = await productModule.listProductCategories(
      { handle },
      { take: 1 }
    )
    if (existing?.length) {
      categoryIdByHandle[handle] = existing[0].id
      logger.info(`  Category "${handle}" already exists (${existing[0].id})`)
      continue
    }

    const catDef = NEW_CATEGORIES.find((c) => c.handle === handle)
    if (!catDef) {
      logger.info(`  Category "${handle}" not found in NEW_CATEGORIES and not existing, skipping`)
      continue
    }

    const created = await productModule.createProductCategories({
      name: catDef.name,
      handle: catDef.handle,
    })
    const cat = Array.isArray(created) ? created[0] : created
    categoryIdByHandle[handle] = cat.id
    logger.info(`  Created category "${handle}" (${cat.id})`)
  }

  // --- Check for existing Greenwich products ---
  const existingProducts = await productModule.listProducts(
    {},
    { take: 500, relations: ["variants"] }
  )
  const existingHandles = new Set(
    (existingProducts ?? []).map((p: any) => p.handle)
  )

  const newProducts = greenwichProducts.filter(
    (p) => !existingHandles.has(p.handle)
  )

  if (newProducts.length === 0) {
    logger.info("All Greenwich products already exist. Skipping creation.")
    return
  }

  if (newProducts.length < greenwichProducts.length) {
    const skipped = greenwichProducts.length - newProducts.length
    logger.info(
      `${skipped} Greenwich products already exist, creating ${newProducts.length} new ones.`
    )
  }

  // --- Create products ---
  logger.info(`Creating ${newProducts.length} Greenwich products...`)

  const medusaProducts = newProducts.map((p) => {
    const thumbnail = p.thumbnail_storage_key
      ? buildImageUrl(p.thumbnail_storage_key)
      : undefined

    const images = p.gallery_storage_keys.map((key) => ({
      url: buildImageUrl(key),
    }))

    const metadata: Record<string, unknown> = {
      collection: "greenwich",
      collection_label: p.collection_label ?? "Greenwich",
      asset_tier: p.asset_tier,
      asset_quality: p.asset_quality,
    }
    if (p.dimensions) {
      metadata.dimensions = p.dimensions
    }
    if (p.display_group) {
      metadata.display_group = p.display_group
      metadata.display_group_title = p.display_group_title
      metadata.display_group_sort = p.display_group_sort
    }
    if (p.canonical_name) {
      metadata.canonical_name = p.canonical_name
    }
    if (p.workbook_row_key) {
      metadata.workbook_row_key = p.workbook_row_key
    }
    if (p.workbook_row_index != null) {
      metadata.workbook_row_index = p.workbook_row_index
    }
    if (p.product_code_normalized) {
      metadata.product_code_normalized = p.product_code_normalized
    }

    return {
      title: p.title,
      handle: p.handle,
      description: p.description,
      status: "published" as const,
      thumbnail,
      images,
      metadata,
      collection_id: undefined,
      options: [{ title: "Default", values: ["Default"] }],
      variants: [
        {
          title: p.title,
          sku: p.sku,
          options: { Default: "Default" },
          prices: [{ amount: p.price_kopeks, currency_code: "rub" }],
        },
      ],
    }
  })

  let createdProducts: Array<{ id: string; handle: string; sku: string }> = []

  try {
    const { result } = await createProductsWorkflow(container).run({
      input: { products: medusaProducts },
    })
    createdProducts = (result ?? []).map((pr: any) => ({
      id: pr.id,
      handle: pr.handle,
      sku: pr.variants?.[0]?.sku ?? "",
    }))
    logger.info(`Created ${createdProducts.length} products`)
  } catch (e: any) {
    const msg = e?.message ?? JSON.stringify(e, null, 2)
    logger.info("createProductsWorkflow failed: " + msg)
    return
  }

  // --- Link products to categories ---
  logger.info("Linking products to categories...")
  const productsByCategory: Record<string, string[]> = {}
  for (const cp of createdProducts) {
    const def = newProducts.find((p) => p.handle === cp.handle)
    if (!def) continue
    const catHandle = def.category_handle
    if (!productsByCategory[catHandle]) productsByCategory[catHandle] = []
    productsByCategory[catHandle].push(cp.id)
  }

  for (const [catHandle, productIds] of Object.entries(productsByCategory)) {
    const categoryId = categoryIdByHandle[catHandle]
    if (!categoryId) continue
    try {
      await batchLinkProductsToCategoryWorkflow(container).run({
        input: { id: categoryId, add: productIds },
      })
      logger.info(`  Linked ${productIds.length} products to ${catHandle}`)
    } catch {
      logger.info(`  Category link for ${catHandle} already exists or failed`)
    }
  }

  // --- Set product classifications ---
  const productExtensionService = container.resolve(PRODUCT_EXTENSION_MODULE) as any
  const query = container.resolve("query") as any

  logger.info("Setting product classifications...")
  for (const cp of createdProducts) {
    const def = newProducts.find((p) => p.handle === cp.handle)
    if (!def) continue

    try {
      const { data } = await query.graph({
        entity: "product",
        fields: ["id", "product_classification.*"],
        filters: { id: cp.id },
      })
      if (data?.[0]?.product_classification?.id) continue
    } catch {
      /* not linked yet */
    }

    const ptRow = await productExtensionService.createProductClassifications({
      product_type: def.product_type,
    })
    const pt = Array.isArray(ptRow) ? ptRow[0] : ptRow
    await link.create({
      [Modules.PRODUCT]: { product_id: cp.id },
      [PRODUCT_EXTENSION_MODULE]: { product_classification_id: pt.id },
    })
  }

  // --- Stock location + inventory ---
  logger.info("Setting up inventory for Greenwich products...")
  const stockLocationService = container.resolve(Modules.STOCK_LOCATION) as any
  const inventoryService = container.resolve(Modules.INVENTORY) as any
  const salesChannelService = container.resolve(Modules.SALES_CHANNEL) as any

  let stockLocationId: string
  const existingLocations = await stockLocationService.listStockLocations(
    { name: "Основной склад" },
    { take: 1 }
  )
  if (existingLocations?.length) {
    stockLocationId = existingLocations[0].id
  } else {
    const sl = await stockLocationService.createStockLocations({
      name: "Основной склад",
      address: { address_1: "Москва", country_code: "ru" },
    })
    stockLocationId = (Array.isArray(sl) ? sl[0] : sl).id
  }

  const [defaultSalesChannel] = await salesChannelService.listSalesChannels(
    {},
    { take: 1 }
  )
  if (defaultSalesChannel) {
    try {
      await link.create({
        [Modules.SALES_CHANNEL]: {
          sales_channel_id: defaultSalesChannel.id,
        },
        [Modules.STOCK_LOCATION]: { stock_location_id: stockLocationId },
      })
    } catch {
      /* already linked */
    }
  }

  const allInventoryItems = await inventoryService.listInventoryItems(
    {},
    { take: 500 }
  )
  for (const invItem of allInventoryItems ?? []) {
    const existingLevels = await inventoryService.listInventoryLevels(
      { inventory_item_id: invItem.id, location_id: stockLocationId },
      { take: 1 }
    )
    if (existingLevels?.length) continue
    await inventoryService.createInventoryLevels({
      inventory_item_id: invItem.id,
      location_id: stockLocationId,
      stocked_quantity: 100,
    })
  }

  logger.info("=== Greenwich Pilot Seed Complete ===")
  logger.info(`  Products created: ${createdProducts.length}`)
  logger.info(`  Categories ensured: ${Object.keys(categoryIdByHandle).length}`)
  logger.info(
    `  Assets: thumbnail + gallery referenced via storage keys`
  )
  logger.info(
    `  Note: ensure images are uploaded to /uploads/products/greenwich/ before accessing storefront`
  )
}
