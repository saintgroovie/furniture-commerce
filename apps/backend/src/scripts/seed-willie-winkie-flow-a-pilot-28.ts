/**
 * Willie Winkie Flow A — isolated pilot seed (28 handles, Launch A request mode).
 *
 * Pattern: Oxford-4 pilot (seed-oxford-pilot-four.ts).
 * Input: tmp/launch-a-ingest-gate/flow-a-request-mode-product-draft.json
 * Whitelist: tmp/launch-a-ingest-gate/flow-a-ingest-whitelist.json
 *
 * Dry-run (no DB writes):
 *   WW_FLOW_A_PILOT_DRY_RUN=1 WW_FLOW_A_PILOT_CONFIRM=1 \
 *     npx medusa exec ./src/scripts/seed-willie-winkie-flow-a-pilot-28.ts
 *
 * Apply (operator-approved only):
 *   WW_FLOW_A_PILOT_CONFIRM=1 \
 *     npx medusa exec ./src/scripts/seed-willie-winkie-flow-a-pilot-28.ts
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import {
  batchLinkProductsToCategoryWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
} from "@medusajs/medusa/core-flows"
import * as fs from "fs"
import * as path from "path"
import { PRODUCT_EXTENSION_MODULE } from "../modules/product-extension"

const REGION_RUB = {
  name: "Россия",
  currency_code: "rub",
  countries: ["ru"],
  tax_rate: 20,
}

const EXCLUDED_HANDLES = new Set(["co-02-1", "am-02-1"])
const REQUIRED_COLLECTION = "willie-winkie"
const REQUIRED_KIDS_KEYS = ["storefront_section", "room_type", "cart_group"] as const

const PILOT_COLLECTIONS = [{ handle: "willie-winkie", title: "Willie Winkie" }]

const PILOT_CATEGORY_TITLES: Record<string, string> = {
  komody: "Комоды",
  stellazhi: "Стеллажи",
  "stoly-i-stoliki": "Столы и столики",
  shkafy: "Шкафы",
}

type SeedProductRow = {
  workbook_row_key: string
  product_code_normalized: string
  medusa_product_handle: string
  medusa_product_title: string
  medusa_collection_handle: string
  medusa_category_handle: string
  medusa_product_type: "CONFIGURABLE"
  variant_strategy: "configurable_tiers"
  launch_mode: "request_quote"
  status: "draft"
  medusa_variant_sku: string
  medusa_price_amount: number
  currency_code: string
  metadata: Record<string, unknown>
}

type WhitelistFile = {
  handles: string[]
}

type DraftFile = {
  products: SeedProductRow[]
}

function repoRoot(): string {
  const cwd = process.cwd()
  if (path.basename(cwd) === "backend" && path.basename(path.dirname(cwd)) === "apps") {
    return path.resolve(cwd, "../..")
  }
  return path.resolve(cwd, "../..")
}

function loadJson<T>(relativePath: string): T {
  const root = repoRoot()
  const candidate = path.join(root, relativePath)
  if (!fs.existsSync(candidate)) {
    throw new Error(`Missing ${relativePath} (resolved ${candidate})`)
  }
  return JSON.parse(fs.readFileSync(candidate, "utf-8")) as T
}

function normalizeCategoryName(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1)
}

function assertPilotPayload(
  whitelist: WhitelistFile,
  seedProducts: SeedProductRow[],
  logger: { info: (msg: string) => void }
): void {
  const whitelistSet = new Set(whitelist.handles)
  if (whitelist.handles.length !== 28) {
    throw new Error(`Whitelist must contain exactly 28 handles, got ${whitelist.handles.length}`)
  }
  if (whitelistSet.size !== 28) {
    throw new Error("Duplicate handles in whitelist")
  }
  if (seedProducts.length !== 28) {
    throw new Error(`Seed payload must contain exactly 28 products, got ${seedProducts.length}`)
  }

  const handles = new Set<string>()
  for (const row of seedProducts) {
    const handle = row.medusa_product_handle
    if (EXCLUDED_HANDLES.has(handle)) {
      throw new Error(`Excluded handle in payload: ${handle}`)
    }
    if (!whitelistSet.has(handle)) {
      throw new Error(`Handle outside whitelist: ${handle}`)
    }
    if (handles.has(handle)) {
      throw new Error(`Duplicate handle in payload: ${handle}`)
    }
    handles.add(handle)

    if (row.status !== "draft") {
      throw new Error(`${handle}: status must be draft`)
    }
    if (row.launch_mode !== "request_quote") {
      throw new Error(`${handle}: launch_mode must be request_quote`)
    }
    if (row.medusa_product_type !== "CONFIGURABLE") {
      throw new Error(`${handle}: medusa_product_type must be CONFIGURABLE`)
    }
    if (row.variant_strategy !== "configurable_tiers") {
      throw new Error(`${handle}: variant_strategy must be configurable_tiers`)
    }
    if (row.medusa_collection_handle !== REQUIRED_COLLECTION) {
      throw new Error(`${handle}: medusa_collection_handle must be ${REQUIRED_COLLECTION}`)
    }

    const meta = row.metadata ?? {}
    if (meta.collection !== REQUIRED_COLLECTION) {
      throw new Error(`${handle}: metadata.collection must be ${REQUIRED_COLLECTION}`)
    }
    for (const key of REQUIRED_KIDS_KEYS) {
      if (meta[key] == null || String(meta[key]).trim() === "") {
        throw new Error(`${handle}: missing Kids metadata ${key}`)
      }
    }
    if (meta.launch_mode !== "request_quote") {
      throw new Error(`${handle}: metadata.launch_mode must be request_quote`)
    }
    if (!meta.painting_name || !meta.motif) {
      throw new Error(`${handle}: painting_name and motif metadata required`)
    }

    const tiers = meta.material_tiers as Record<string, { price_known?: boolean; price_rub?: unknown }> | undefined
    if (tiers?.solid_full?.price_rub != null || tiers?.solid_front_ldsp_body?.price_rub != null) {
      throw new Error(`${handle}: invented tier prices forbidden`)
    }
  }

  for (const handle of whitelistSet) {
    if (!handles.has(handle)) {
      throw new Error(`Whitelist handle missing from payload: ${handle}`)
    }
  }

  logger.info(
    `Flow A pilot payload validated: 28 handles, collection=${REQUIRED_COLLECTION}, Kids metadata present`
  )
}

export default async function seedWillieWinkieFlowAPilot28({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve("logger")
  const dryRun = process.env.WW_FLOW_A_PILOT_DRY_RUN === "1"

  if (process.env.WW_FLOW_A_PILOT_CONFIRM !== "1") {
    logger.info(
      "Willie Winkie Flow A pilot seed skipped. Set WW_FLOW_A_PILOT_CONFIRM=1 (use WW_FLOW_A_PILOT_DRY_RUN=1 for dry-run)."
    )
    return
  }

  logger.info(`=== Willie Winkie Flow A pilot seed (28 handles)${dryRun ? " [DRY-RUN]" : ""} ===`)

  const whitelist = loadJson<WhitelistFile>("tmp/launch-a-ingest-gate/flow-a-ingest-whitelist.json")
  const draft = loadJson<DraftFile>("tmp/launch-a-ingest-gate/flow-a-request-mode-product-draft.json")
  const seedProducts = draft.products

  assertPilotPayload(whitelist, seedProducts, logger)

  const categoryHandles = [...new Set(seedProducts.map((p) => p.medusa_category_handle))]
  const pilotCategories = categoryHandles.map((handle) => ({
    handle,
    title: PILOT_CATEGORY_TITLES[handle] ?? normalizeCategoryName(handle),
  }))

  if (dryRun) {
    logger.info(`[DRY-RUN] Would ensure collection: ${PILOT_COLLECTIONS.map((c) => c.handle).join(", ")}`)
    logger.info(`[DRY-RUN] Would ensure categories: ${pilotCategories.map((c) => c.handle).join(", ")}`)
    const pilotHandles = seedProducts.map((p) => p.medusa_product_handle)
    logger.info(`[DRY-RUN] Pilot handles (${pilotHandles.length}): ${pilotHandles.sort().join(", ")}`)
    logger.info("[DRY-RUN] Would create missing products as draft/request_quote without images")
    logger.info("[DRY-RUN] Would link CONFIGURABLE product_classification + category links")
    logger.info("[DRY-RUN] No DB mutations performed")
    return
  }

  const link = container.resolve("link")
  const productModule = container.resolve(Modules.PRODUCT)

  logger.info("Ensuring region РФ / RUB (idempotent)...")
  try {
    await createRegionsWorkflow(container).run({ input: { regions: [REGION_RUB] } })
  } catch {
    logger.info("Region already exists, skipping.")
  }

  logger.info("Ensuring pilot collection willie-winkie only...")
  const collectionIdByHandle: Record<string, string> = {}
  for (const coll of PILOT_COLLECTIONS) {
    const existing = await productModule.listProductCollections({ handle: coll.handle }, { take: 1 })
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

  logger.info(`Ensuring pilot categories: ${pilotCategories.map((c) => c.handle).join(", ")}...`)
  const categoryIdByHandle: Record<string, string> = {}
  for (const cat of pilotCategories) {
    const existing = await productModule.listProductCategories({ handle: cat.handle }, { take: 1 })
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

  const pilotHandles = seedProducts.map((p) => p.medusa_product_handle)
  const expectedHandles = new Set(pilotHandles)

  let existingProducts = await productModule.listProducts({ handle: pilotHandles }, { take: 40, relations: ["variants"] })
  let existingFiltered = (existingProducts ?? []).filter((p) => expectedHandles.has(p.handle))
  if (existingFiltered.length === 0 && pilotHandles.length > 0) {
    const all = await productModule.listProducts({}, { take: 2500, relations: ["variants"] })
    existingFiltered = (all ?? []).filter((p) => expectedHandles.has(p.handle))
  }

  const existingByHandle = new Map(existingFiltered.map((p) => [p.handle, p]))
  const toCreate = seedProducts.filter((p) => !existingByHandle.has(p.medusa_product_handle))
  logger.info(`Flow A products to create=${toCreate.length}, already present=${seedProducts.length - toCreate.length}`)

  if (toCreate.length > 0) {
    const medusaProducts = toCreate.map((product) => ({
      title: product.medusa_product_title,
      handle: product.medusa_product_handle,
      description: "",
      status: "draft" as const,
      collection_id: collectionIdByHandle[product.medusa_collection_handle],
      metadata: {
        ...product.metadata,
        willie_winkie_flow_a_pilot: true,
      },
      options: [{ title: "Default", values: ["Default"] }],
      variants: [
        {
          title: product.medusa_product_title,
          sku: product.medusa_product_handle,
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
    logger.info(`Created Flow A pilot products=${(result ?? []).length}`)
  }

  let refreshedPilot = await productModule.listProducts({ handle: pilotHandles }, { take: 40, relations: ["variants"] })
  let targetProducts = (refreshedPilot ?? []).filter((p) => expectedHandles.has(p.handle))
  if (targetProducts.length === 0) {
    const all = await productModule.listProducts({}, { take: 2500, relations: ["variants"] })
    targetProducts = (all ?? []).filter((p) => expectedHandles.has(p.handle))
  }

  const productIdByHandle = Object.fromEntries(targetProducts.map((product) => [product.handle, product.id]))

  logger.info("Linking pilot products to categories...")
  const productsByCategory: Record<string, string[]> = {}
  for (const product of seedProducts) {
    const productId = productIdByHandle[product.medusa_product_handle]
    if (!productId) continue
    if (!productsByCategory[product.medusa_category_handle]) {
      productsByCategory[product.medusa_category_handle] = []
    }
    productsByCategory[product.medusa_category_handle].push(productId)
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

  const productExtensionService = container.resolve(PRODUCT_EXTENSION_MODULE) as {
    createProductTypes: (input: { product_type: string }) => Promise<unknown>
  }
  const query = container.resolve("query")
  const seedDefByHandle = Object.fromEntries(seedProducts.map((product) => [product.medusa_product_handle, product]))

  logger.info("Ensuring ProductClassification CONFIGURABLE for pilot products only...")
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
    const row = await productExtensionService.createProductTypes({
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
  const stockLocationService = container.resolve(Modules.STOCK_LOCATION)
  const inventoryService = container.resolve(Modules.INVENTORY)
  const salesChannelService = container.resolve(Modules.SALES_CHANNEL)

  let stockLocationId: string
  const existingLocations = await stockLocationService.listStockLocations({ name: "Основной склад" }, { take: 1 })
  if (existingLocations?.length) {
    stockLocationId = existingLocations[0].id
  } else {
    const created = await stockLocationService.createStockLocations({
      name: "Основной склад",
      address: { address_1: "Москва", country_code: "ru" },
    })
    stockLocationId = (Array.isArray(created) ? created[0] : created).id
  }

  const [defaultSalesChannel] = await salesChannelService.listSalesChannels({}, { take: 1 })
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

  const pilotSkus = new Set(seedProducts.map((p) => p.medusa_product_handle))
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

  logger.info("=== Willie Winkie Flow A pilot seed complete (28 handles, draft, no media) ===")
}
