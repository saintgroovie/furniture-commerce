import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import {
  batchLinkProductsToCategoryWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
} from "@medusajs/medusa/core-flows"
import { PRODUCT_EXTENSION_MODULE } from "../modules/product-extension"
import * as fs from "fs"
import * as path from "path"

type ProductType = "STANDARD" | "CONFIGURABLE" | "BESPOKE"

type SeedCollection = {
  handle: string
  title: string
}

type SeedCategory = {
  handle: string
  title: string
}

type SeedProduct = {
  workbook_row_key: string
  product_code_normalized: string
  canonical_name: string
  medusa_product_handle: string
  medusa_product_title: string
  medusa_collection_handle: string
  medusa_collection_title: string
  medusa_category_handle: string
  medusa_category_title: string
  medusa_product_type: ProductType
  variant_strategy: "single_default"
  medusa_variant_sku: string
  medusa_price_amount: number
  currency_code: string
  readiness_status: "seed_ready" | "seed_ready_with_caveat"
  asset_quality_status: string
  mapping_notes: string
  dimensions_normalized: {
    height_mm: number
    width_mm: number
    depth_mm: number
  } | null
  image_urls: string[]
  main_image_url: string | null
}

const REGION_RUB = {
  name: "Россия",
  currency_code: "rub",
  countries: ["ru"],
  tax_rate: 20,
}

function loadJsonFile<T>(relativePath: string): T {
  const candidates = [
    path.join(process.cwd(), relativePath),
    path.resolve(process.cwd(), "../../", relativePath),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return JSON.parse(fs.readFileSync(candidate, "utf-8")) as T
    }
  }

  throw new Error(
    `Required file not found: ${relativePath}. Tried:\n${candidates.join("\n")}`
  )
}

function normalizeCategoryName(name: string): string {
  if (!name) return name
  return name.charAt(0).toUpperCase() + name.slice(1)
}

export default async function seedRealDataDraft({ container }: ExecArgs) {
  const logger = container.resolve("logger") as { info: (s: string) => void }
  const link = container.resolve("link") as {
    create: (data: Record<string, Record<string, string>>) => Promise<unknown>
  }

  if (process.env.REAL_DATA_SEED_CONFIRM !== "1") {
    logger.info(
      "Real-data draft seed skipped. Set REAL_DATA_SEED_CONFIRM=1 after reviewing data/normalized/seed-*.json and uploaded assets."
    )
    return
  }

  logger.info("=== Real Data Draft Seed ===")
  logger.info("Loading normalized seed input files...")

  const seedCollections = loadJsonFile<SeedCollection[]>(
    "data/normalized/seed-collections.json"
  )
  const seedCategories = loadJsonFile<SeedCategory[]>(
    "data/normalized/seed-categories.json"
  )
  const seedProducts = loadJsonFile<SeedProduct[]>(
    "data/normalized/seed-products.json"
  )

  logger.info(
    `Loaded products=${seedProducts.length}, collections=${seedCollections.length}, categories=${seedCategories.length}`
  )

  logger.info("Ensuring region РФ / RUB...")
  try {
    await createRegionsWorkflow(container).run({
      input: { regions: [REGION_RUB] },
    })
  } catch {
    logger.info("Region already exists, skipping.")
  }

  const productModule = container.resolve(Modules.PRODUCT) as any

  logger.info("Ensuring collections...")
  const collectionIdByHandle: Record<string, string> = {}
  for (const coll of seedCollections) {
    const existing = await productModule.listProductCollections(
      { handle: coll.handle },
      { take: 1 }
    )
    if (existing?.length) {
      collectionIdByHandle[coll.handle] = existing[0].id
      continue
    }

    const created = await productModule.createProductCollections({
      title: coll.title,
      handle: coll.handle,
    })
    const createdCollection = Array.isArray(created) ? created[0] : created
    collectionIdByHandle[coll.handle] = createdCollection.id
  }

  logger.info("Ensuring categories...")
  const categoryIdByHandle: Record<string, string> = {}
  for (const cat of seedCategories) {
    const existing = await productModule.listProductCategories(
      { handle: cat.handle },
      { take: 1 }
    )
    if (existing?.length) {
      categoryIdByHandle[cat.handle] = existing[0].id
      continue
    }

    const created = await productModule.createProductCategories({
      name: normalizeCategoryName(cat.title),
      handle: cat.handle,
    })
    const createdCategory = Array.isArray(created) ? created[0] : created
    categoryIdByHandle[cat.handle] = createdCategory.id
  }

  logger.info("Loading existing products for idempotent creation...")
  const existingProducts = await productModule.listProducts(
    {},
    { take: 2000, relations: ["variants"] }
  )
  const existingByHandle = new Map<string, any>(
    (existingProducts ?? []).map((p: any) => [p.handle, p])
  )

  const toCreate = seedProducts.filter(
    (product) => !existingByHandle.has(product.medusa_product_handle)
  )
  logger.info(
    `Products to create=${toCreate.length}, existing=${seedProducts.length - toCreate.length}`
  )

  let createdProducts: any[] = []
  if (toCreate.length > 0) {
    const medusaProducts = toCreate.map((product) => ({
      title: product.medusa_product_title,
      handle: product.medusa_product_handle,
      description: "",
      status: "published" as const,
      thumbnail: product.main_image_url ?? undefined,
      images: product.image_urls.map((url) => ({ url })),
      collection_id: collectionIdByHandle[product.medusa_collection_handle],
      metadata: {
        workbook_row_key: product.workbook_row_key,
        product_code_normalized: product.product_code_normalized,
        readiness_status: product.readiness_status,
        asset_quality_status: product.asset_quality_status,
        mapping_notes: product.mapping_notes,
        dimensions_normalized: product.dimensions_normalized,
      },
      options: [{ title: "Default", values: ["Default"] }],
      variants: [
        {
          title: product.medusa_product_title,
          sku: product.medusa_variant_sku,
          options: { Default: "Default" },
          prices: [
            {
              amount: product.medusa_price_amount,
              currency_code: product.currency_code,
            },
          ],
        },
      ],
    }))

    try {
      const { result } = await createProductsWorkflow(container).run({
        input: { products: medusaProducts },
      })
      createdProducts = result ?? []
      logger.info(`Created products=${createdProducts.length}`)
    } catch (e: any) {
      const msg = e?.message ?? JSON.stringify(e, null, 2)
      logger.info(`createProductsWorkflow failed: ${msg}`)
      throw e
    }
  }

  const refreshedProducts = await productModule.listProducts(
    {},
    { take: 2500, relations: ["variants"] }
  )
  const targetProducts = refreshedProducts.filter((product: any) =>
    seedProducts.some((item) => item.medusa_product_handle === product.handle)
  )
  const productIdByHandle = Object.fromEntries(
    targetProducts.map((product: any) => [product.handle, product.id])
  ) as Record<string, string>

  logger.info("Linking products to categories...")
  const productsByCategory: Record<string, string[]> = {}
  for (const product of seedProducts) {
    const productId = productIdByHandle[product.medusa_product_handle]
    if (!productId) continue
    const categoryHandle = product.medusa_category_handle
    if (!productsByCategory[categoryHandle]) {
      productsByCategory[categoryHandle] = []
    }
    productsByCategory[categoryHandle].push(productId)
  }

  for (const [categoryHandle, productIds] of Object.entries(productsByCategory)) {
    const categoryId = categoryIdByHandle[categoryHandle]
    if (!categoryId || productIds.length === 0) continue
    try {
      await batchLinkProductsToCategoryWorkflow(container).run({
        input: { id: categoryId, add: productIds },
      })
    } catch {
      // Category links may already exist on re-run.
    }
  }

  logger.info("Ensuring product_type links...")
  const productExtensionService = container.resolve(PRODUCT_EXTENSION_MODULE) as any
  const query = container.resolve("query") as any

  const seedDefByHandle = Object.fromEntries(
    seedProducts.map((product) => [product.medusa_product_handle, product])
  ) as Record<string, SeedProduct>

  for (const product of targetProducts) {
    const seedDef = seedDefByHandle[product.handle]
    if (!seedDef) continue

    try {
      const { data } = await query.graph({
        entity: "product",
        fields: ["id", "product_classification.*"],
        filters: { id: product.id },
      })
      if (data?.[0]?.product_classification?.id) continue
    } catch {
      // Link absent, create it.
    }

    const row = await productExtensionService.createProductClassifications({
      product_type: seedDef.medusa_product_type,
    })
    const classification = Array.isArray(row) ? row[0] : row
    await link.create({
      [Modules.PRODUCT]: { product_id: product.id },
      [PRODUCT_EXTENSION_MODULE]: {
        product_classification_id: classification.id,
      },
    })
  }

  logger.info("Ensuring stock location and inventory levels...")
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
    const created = await stockLocationService.createStockLocations({
      name: "Основной склад",
      address: { address_1: "Москва", country_code: "ru" },
    })
    stockLocationId = (Array.isArray(created) ? created[0] : created).id
  }

  const [defaultSalesChannel] = await salesChannelService.listSalesChannels(
    {},
    { take: 1 }
  )
  if (defaultSalesChannel) {
    try {
      await link.create({
        [Modules.SALES_CHANNEL]: { sales_channel_id: defaultSalesChannel.id },
        [Modules.STOCK_LOCATION]: { stock_location_id: stockLocationId },
      })
    } catch {
      // Link may already exist.
    }
  }

  const inventoryItems = await inventoryService.listInventoryItems(
    {},
    { take: 3000 }
  )
  for (const inventoryItem of inventoryItems ?? []) {
    const existingLevels = await inventoryService.listInventoryLevels(
      { inventory_item_id: inventoryItem.id, location_id: stockLocationId },
      { take: 1 }
    )
    if (existingLevels?.length) continue
    await inventoryService.createInventoryLevels({
      inventory_item_id: inventoryItem.id,
      location_id: stockLocationId,
      stocked_quantity: 100,
    })
  }

  logger.info("=== Real Data Draft Seed Complete ===")
  logger.info(`Target seed products: ${seedProducts.length}`)
  logger.info("Draft seed does not include unresolved/blocked/unconfirmed items.")
}
