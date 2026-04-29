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

const ALLOWED_WORKBOOK_KEYS = new Set([
  "oxford:OX-14-1",
  "oxford:OX-14-11",
  "oxford:OX-90-1",
  "oxford:S-OX-05",
])

/** Pilot-only collection + categories not guaranteed by shared seed-categories.json */
const PILOT_COLLECTIONS: { handle: string; title: string }[] = [
  { handle: "oxford", title: "Oxford" },
]

const PILOT_CATEGORIES: { handle: string; title: string }[] = [
  { handle: "complex", title: "Комплексы" },
  { handle: "toy-box", title: "Ступени и ящики" },
  { handle: "krovati", title: "Кровати" },
]

function loadPilotSeedJson(): SeedProduct[] {
  const relativePath = "data/normalized/seed-products.oxford-pilot-four.json"
  const candidates = [
    path.join(process.cwd(), relativePath),
    path.resolve(process.cwd(), "../../", relativePath),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const rows = JSON.parse(fs.readFileSync(candidate, "utf-8")) as SeedProduct[]
      return rows
    }
  }
  throw new Error(
    `Oxford pilot seed not found: ${relativePath}. Tried:\n${candidates.join("\n")}`
  )
}

function normalizeCategoryName(name: string): string {
  if (!name) return name
  return name.charAt(0).toUpperCase() + name.slice(1)
}

function assertPilotSubset(seedProducts: SeedProduct[], logger: { info: (s: string) => void }) {
  if (seedProducts.length !== 4) {
    throw new Error(`Oxford pilot seed must contain exactly 4 products, got ${seedProducts.length}`)
  }
  const handles = new Set<string>()
  for (const p of seedProducts) {
    if (!ALLOWED_WORKBOOK_KEYS.has(p.workbook_row_key)) {
      throw new Error(`Disallowed workbook_row_key in pilot seed: ${p.workbook_row_key}`)
    }
    if (p.medusa_collection_handle !== "oxford") {
      throw new Error(`Pilot product must use collection oxford, got ${p.medusa_collection_handle}`)
    }
    handles.add(p.medusa_product_handle)
  }
  if (handles.size !== 4) {
    throw new Error("Duplicate medusa_product_handle in pilot seed")
  }
  logger.info(
    `Pilot subset validated: handles=[${[...handles].sort().join(", ")}] (Oxford-4 only; no shared seed-products.fixed2.json loaded)`
  )
}

export default async function seedOxfordPilotFour({ container }: ExecArgs) {
  const logger = container.resolve("logger") as { info: (s: string) => void }
  const link = container.resolve("link") as {
    create: (data: Record<string, Record<string, string>>) => Promise<unknown>
  }

  if (process.env.OXFORD_PILOT_CONFIRM !== "1") {
    logger.info(
      "Oxford pilot seed skipped. Set OXFORD_PILOT_CONFIRM=1 after static materialize + smoke (yarn oxford-pilot-four:smoke)."
    )
    return
  }

  logger.info("=== Oxford-4 pilot seed (isolated exec) ===")

  const seedProducts = loadPilotSeedJson()
  assertPilotSubset(seedProducts, logger)

  const productModule = container.resolve(Modules.PRODUCT) as any

  logger.info("Ensuring region РФ / RUB (idempotent)...")
  try {
    await createRegionsWorkflow(container).run({
      input: { regions: [REGION_RUB] },
    })
  } catch {
    logger.info("Region already exists, skipping.")
  }

  logger.info("Ensuring pilot collection(s) only...")
  const collectionIdByHandle: Record<string, string> = {}
  for (const coll of PILOT_COLLECTIONS) {
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

  logger.info("Ensuring pilot categories (complex, toy-box, krovati)...")
  const categoryIdByHandle: Record<string, string> = {}
  for (const cat of PILOT_CATEGORIES) {
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

  logger.info("Loading existing products (pilot handles only)...")
  const pilotHandles = seedProducts.map((p) => p.medusa_product_handle)
  const expectedHandles = new Set(pilotHandles)
  let existingProducts = await productModule.listProducts(
    { handle: pilotHandles },
    { take: 20, relations: ["variants"] }
  )
  let existingFiltered = (existingProducts ?? []).filter((p: any) =>
    expectedHandles.has(p.handle)
  )
  if (existingFiltered.length === 0 && pilotHandles.length > 0) {
    const all = await productModule.listProducts({}, { take: 2500, relations: ["variants"] })
    existingFiltered = (all ?? []).filter((p: any) => expectedHandles.has(p.handle))
  }
  const existingByHandle = new Map<string, any>(
    existingFiltered.map((p: any) => [p.handle, p])
  )

  const toCreate = seedProducts.filter((p) => !existingByHandle.has(p.medusa_product_handle))
  logger.info(
    `Oxford pilot products to create=${toCreate.length}, already present=${seedProducts.length - toCreate.length}`
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
        collection: "oxford",
        readiness_status: product.readiness_status,
        entity_layer_readiness_status: "pdf_seed_interim",
        asset_quality_status: product.asset_quality_status,
        mapping_notes: product.mapping_notes,
        dimensions_normalized: product.dimensions_normalized,
        oxford_pilot_four: true,
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

    const { result } = await createProductsWorkflow(container).run({
      input: { products: medusaProducts },
    })
    createdProducts = result ?? []
    logger.info(`Created Oxford pilot products=${createdProducts.length}`)
  }

  let refreshedPilot = await productModule.listProducts(
    { handle: pilotHandles },
    { take: 20, relations: ["variants"] }
  )
  let targetProducts = (refreshedPilot ?? []).filter((p: any) => expectedHandles.has(p.handle))
  if (targetProducts.length === 0) {
    const all = await productModule.listProducts({}, { take: 2500, relations: ["variants"] })
    targetProducts = (all ?? []).filter((p: any) => expectedHandles.has(p.handle))
  }
  const productIdByHandle = Object.fromEntries(
    targetProducts.map((product: any) => [product.handle, product.id])
  ) as Record<string, string>

  logger.info("Aligning pilot product images from seed JSON...")
  for (const seedRow of seedProducts) {
    const pr = targetProducts.find((p: any) => p.handle === seedRow.medusa_product_handle)
    if (!pr?.id) continue
    try {
      await productModule.updateProducts(pr.id, {
        thumbnail: seedRow.main_image_url ?? null,
        images: seedRow.image_urls.map((url) => ({ url })),
      })
    } catch (e: any) {
      logger.info(
        `Image align failed handle=${seedRow.medusa_product_handle}: ${e?.message ?? e}`
      )
    }
  }

  logger.info("Linking pilot products to categories...")
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
    if (!categoryId || productIds.length === 0) {
      logger.info(`Skip category link: unknown category handle=${categoryHandle}`)
      continue
    }
    try {
      await batchLinkProductsToCategoryWorkflow(container).run({
        input: { id: categoryId, add: productIds },
      })
    } catch {
      // links may already exist
    }
  }

  const productExtensionService = container.resolve(PRODUCT_EXTENSION_MODULE) as any
  const query = container.resolve("query") as any
  const seedDefByHandle = Object.fromEntries(
    seedProducts.map((product) => [product.medusa_product_handle, product])
  ) as Record<string, SeedProduct>

  logger.info("Ensuring ProductClassification for pilot products only...")
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
      // absent
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

  logger.info("Ensuring stock location + inventory levels for pilot SKUs only...")
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
      // may exist
    }
  }

  const pilotSkus = new Set(seedProducts.map((p) => p.medusa_variant_sku))
  const inventoryItems = await inventoryService.listInventoryItems({}, { take: 8000 })
  for (const inventoryItem of inventoryItems ?? []) {
    const sku = inventoryItem?.sku
    if (!sku || !pilotSkus.has(sku)) continue
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

  logger.info("=== Oxford-4 pilot seed complete ===")
  logger.info(
    "Greenwich/Oliver/seed-products.fixed2.json were not read or modified. Storefront catalog-scope unchanged on disk."
  )
}
