import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import {
  createRegionsWorkflow,
  createProductsWorkflow,
  batchLinkProductsToCategoryWorkflow,
} from "@medusajs/medusa/core-flows"
import { PRODUCT_EXTENSION_MODULE } from "../modules/product-extension"
import { ROOM_SET_MODULE } from "../modules/room-set"

const REGION_RUB = {
  name: "Россия",
  currency_code: "rub",
  countries: ["ru"],
  tax_rate: 20,
}

const CATEGORIES = [
  { name: "столы", handle: "stoly" },
  { name: "тумбы", handle: "tumby" },
  { name: "шкафы", handle: "shkafy" },
  { name: "стулья", handle: "stulya" },
] as const

// Явная структура: товар + категория (handle) + тип. CONFIGURABLE в MVP — один вариант-заглушка (временное упрощение, полноценные варианты позже).
const PRODUCTS: Array<{
  title: string
  sku: string
  category_handle: string
  product_type: "STANDARD" | "CONFIGURABLE" | "BESPOKE"
  description?: string
}> = [
  { title: "Стул Лофт", sku: "stul-loft", category_handle: "stulya", product_type: "STANDARD", description: "Стул в стиле лофт" },
  { title: "Тумба прикроватная", sku: "tumba-prikrovatnaya", category_handle: "tumby", product_type: "STANDARD" },
  { title: "Полка настенная", sku: "polka-nastennaya", category_handle: "shkafy", product_type: "STANDARD" },
  { title: "Стол обеденный Лофт", sku: "stol-obedennyj-loft", category_handle: "stoly", product_type: "CONFIGURABLE", description: "Материал: дуб, орех. Размеры: 120, 140 см" },
  { title: "Комод трёхдверный", sku: "komod-trehdvernyj", category_handle: "shkafy", product_type: "CONFIGURABLE" },
  { title: "Стол письменный", sku: "stol-pismennyj", category_handle: "stoly", product_type: "CONFIGURABLE" },
  { title: "Кухня на заказ", sku: "kuhnya-na-zakaz", category_handle: "shkafy", product_type: "BESPOKE" },
  { title: "Гардеробная", sku: "garderobnaya", category_handle: "shkafy", product_type: "BESPOKE" },
  { title: "Шкаф в нишу", sku: "shkaf-v-nishu", category_handle: "shkafy", product_type: "BESPOKE" },
  { title: "Стул офисный", sku: "stul-ofisnyj", category_handle: "stulya", product_type: "STANDARD" },
  { title: "Тумба ТВ", sku: "tumba-tv", category_handle: "tumby", product_type: "CONFIGURABLE" },
  { title: "Кровать детская", sku: "krovat-detskaya", category_handle: "shkafy", product_type: "STANDARD" },
  { title: "Письменный стол школьный", sku: "stol-shkolnyj", category_handle: "stoly", product_type: "CONFIGURABLE" },
  { title: "Стеллаж книжный", sku: "stellazh-knizhnyj", category_handle: "shkafy", product_type: "STANDARD" },
  { title: "Стол компьютерный", sku: "stol-kompyuternyj", category_handle: "stoly", product_type: "CONFIGURABLE" },
]

// Room Sets с явным списком товаров по sku. Состав логичный для типа комнаты.
const ROOM_SETS: Array<{
  title: string
  slug: string
  room_type: string
  style: string
  product_skus: string[]
}> = [
  { title: "Детская для первенца", slug: "detskaya-pervenets", room_type: "детская", style: "современный", product_skus: ["krovat-detskaya", "tumba-prikrovatnaya", "polka-nastennaya"] },
  { title: "Детская для школьника", slug: "detskaya-shkolnika", room_type: "детская", style: "минимализм", product_skus: ["stol-shkolnyj", "stellazh-knizhnyj", "stul-ofisnyj"] },
  { title: "Домашний кабинет", slug: "kabinet", room_type: "кабинет", style: "лофт", product_skus: ["stol-kompyuternyj", "stul-ofisnyj", "stellazh-knizhnyj", "tumba-tv"] },
  { title: "Спальня", slug: "spalnya", room_type: "спальня", style: "сканди", product_skus: ["tumba-prikrovatnaya", "komod-trehdvernyj", "polka-nastennaya"] },
  { title: "Гостиная", slug: "gostinaya", room_type: "гостиная", style: "лофт", product_skus: ["stol-obedennyj-loft", "stul-loft", "tumba-tv"] },
]

export default async function seed({ container }: ExecArgs) {
  const logger = container.resolve("logger") as { info: (s: string) => void }
  const link = container.resolve("link") as {
    create: (data: Record<string, Record<string, string>>) => Promise<unknown>
  }

  logger.info("Seeding region РФ / RUB...")
  await createRegionsWorkflow(container).run({
    input: { regions: [REGION_RUB] },
  })

  const productModule = container.resolve(Modules.PRODUCT)
  logger.info("Seeding categories...")
  const createdCategories: Array<{ id: string; handle: string }> = []
  for (const c of CATEGORIES) {
    const [created] = await productModule.createProductCategories({ name: c.name, handle: c.handle })
    createdCategories.push({ id: created.id, handle: c.handle })
  }
  const categoryIdByHandle = Object.fromEntries(createdCategories.map((c) => [c.handle, c.id]))

  let createdProducts: Array<{ id: string; title: string; sku: string }> = []
  try {
    const { result } = await createProductsWorkflow(container).run({
      input: {
        products: PRODUCTS.map((p) => ({
          title: p.title,
          description: p.description ?? "",
          status: "published",
          options: [{ title: "Default", values: ["Default"] }],
          variants: [{ title: p.title, sku: p.sku, options: { Default: "Default" } }],
        })),
      },
    })
    createdProducts = (result ?? []).map((pr: { id: string; title: string; variants?: Array<{ sku: string }> }) => ({
      id: pr.id,
      title: pr.title,
      sku: pr.variants?.[0]?.sku ?? "",
    }))
  } catch (e) {
    logger.info("createProductsWorkflow failed (ensure DB migrated and default shipping/sales channel exist). Skipping products. " + String(e))
  }

  if (createdProducts.length === 0) {
    logger.info("No products created. Skipping product_type links and room set item links.")
    return
  }

  const productIdBySku = Object.fromEntries(createdProducts.map((p) => [p.sku, p.id]))

  logger.info("Linking products to categories...")
  for (const c of CATEGORIES) {
    const categoryId = categoryIdByHandle[c.handle]
    const productIds = createdProducts.filter((_, i) => PRODUCTS[i].category_handle === c.handle).map((p) => p.id)
    if (categoryId && productIds.length) {
      await batchLinkProductsToCategoryWorkflow(container).run({
        input: { id: categoryId, add: productIds },
      })
    }
  }

  const productExtensionService = container.resolve(PRODUCT_EXTENSION_MODULE)
  logger.info("Linking product_type to products...")
  for (let i = 0; i < createdProducts.length; i++) {
    const product = createdProducts[i]
    const productTypeRow = await productExtensionService.createProductTypes({
      product_type: PRODUCTS[i].product_type,
    })
    const productType = Array.isArray(productTypeRow) ? productTypeRow[0] : productTypeRow
    await link.create({
      [Modules.PRODUCT]: { product_id: product.id },
      [PRODUCT_EXTENSION_MODULE]: { product_type_id: productType.id },
    })
  }

  const roomSetService = container.resolve(ROOM_SET_MODULE)
  logger.info("Seeding room sets...")
  const createdRoomSets: Array<{ id: string; slug: string }> = []
  for (const rs of ROOM_SETS) {
    const [created] = await roomSetService.createRoomSets({
      title: rs.title,
      slug: rs.slug,
      description: `${rs.title} — готовый комплект`,
      price_from: 50000,
      room_type: rs.room_type,
      style: rs.style,
      is_active: true,
    })
    createdRoomSets.push({ id: created.id, slug: rs.slug })
  }

  const createdRoomSetById = Object.fromEntries(createdRoomSets.map((c) => [c.slug, c.id]))
  for (const rs of ROOM_SETS) {
    const roomSetId = createdRoomSetById[rs.slug]
    if (!roomSetId) continue
    for (let idx = 0; idx < rs.product_skus.length; idx++) {
      const sku = rs.product_skus[idx]
      const productId = productIdBySku[sku]
      if (!productId) continue
      const [item] = await roomSetService.createRoomSetItems({
        room_set_id: roomSetId,
        quantity: 1,
        sort_order: idx,
      })
      await link.create({
        [Modules.PRODUCT]: { product_id: productId },
        [ROOM_SET_MODULE]: { room_set_item_id: item.id },
      })
    }
  }

  logger.info("Seed completed.")
}