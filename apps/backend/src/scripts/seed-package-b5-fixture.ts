/**
 * Package B.5 isolated-QA fixture. Safe anonymized sample data only.
 * Run only against medusa-admin-ux-b5 (never shared medusa-store).
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import {
  createProductsWorkflow,
  createRegionsWorkflow,
} from "@medusajs/medusa/core-flows"
import { PRODUCT_EXTENSION_MODULE } from "../modules/product-extension"

type ProductTypeCode = "STANDARD" | "CONFIGURABLE" | "BESPOKE"

type FixtureDef = {
  title: string
  handle: string
  sku: string
  status: "draft" | "published"
  product_type: ProductTypeCode | null
  price?: number
  thumbnail?: string
  image_count: number
}

const FIXTURES: FixtureDef[] = [
  {
    title: "B5 STANDARD Chair",
    handle: "b5-standard-chair",
    sku: "b5-standard-chair",
    status: "published",
    product_type: "STANDARD",
    price: 12500,
    thumbnail: "https://placehold.co/200x200/png?text=std",
    image_count: 2,
  },
  {
    title: "B5 CONFIGURABLE Table",
    handle: "b5-configurable-table",
    sku: "b5-configurable-table",
    status: "published",
    product_type: "CONFIGURABLE",
    price: 45900,
    thumbnail: "https://placehold.co/200x200/png?text=cfg",
    image_count: 3,
  },
  {
    title: "B5 BESPOKE Kitchen",
    handle: "b5-bespoke-kitchen",
    sku: "b5-bespoke-kitchen",
    status: "published",
    product_type: "BESPOKE",
    price: 250000,
    thumbnail: "https://placehold.co/200x200/png?text=bsp",
    image_count: 1,
  },
  {
    title: "B5 Missing Type",
    handle: "b5-missing-type",
    sku: "b5-missing-type",
    status: "published",
    product_type: null,
    price: 9900,
    thumbnail: "https://placehold.co/200x200/png?text=miss",
    image_count: 1,
  },
  {
    title: "B5 No Price",
    handle: "b5-no-price",
    sku: "b5-no-price",
    status: "published",
    product_type: "STANDARD",
    thumbnail: "https://placehold.co/200x200/png?text=noprice",
    image_count: 1,
  },
  {
    title: "B5 No Thumbnail",
    handle: "b5-no-thumbnail",
    sku: "b5-no-thumbnail",
    status: "published",
    product_type: "STANDARD",
    price: 15000,
    image_count: 2,
  },
  {
    title: "B5 Draft Product",
    handle: "b5-draft-product",
    sku: "b5-draft-product",
    status: "draft",
    product_type: "STANDARD",
    price: 8000,
    thumbnail: "https://placehold.co/200x200/png?text=draft",
    image_count: 1,
  },
  {
    title: "B5 Large Gallery",
    handle: "b5-large-gallery",
    sku: "b5-large-gallery",
    status: "published",
    product_type: "CONFIGURABLE",
    price: 109500,
    thumbnail: "https://placehold.co/200x200/png?text=gal0",
    image_count: 96,
  },
]

function asArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value]
}

export default async function seedPackageB5Fixture({ container }: ExecArgs) {
  const logger = container.resolve("logger") as { info: (s: string) => void }
  const link = container.resolve("link") as {
    create: (data: Record<string, Record<string, string>>) => Promise<unknown>
  }

  logger.info("[B5] Seeding region РФ / RUB (idempotent-ish)...")
  try {
    await createRegionsWorkflow(container).run({
      input: {
        regions: [
          {
            name: "Россия",
            currency_code: "rub",
            countries: ["ru"],
          },
        ],
      },
    })
  } catch (e) {
    logger.info("[B5] Region seed skipped/failed: " + String(e))
  }

  const productModule = container.resolve(Modules.PRODUCT) as {
    listProducts: (
      filters: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<Array<{ id: string; handle?: string | null }>>
    updateProducts: (
      id: string,
      data: Record<string, unknown>
    ) => Promise<unknown>
  }

  const extension = container.resolve(PRODUCT_EXTENSION_MODULE) as {
    createProductClassifications: (input: {
      product_type: string
    }) => Promise<{ id: string } | Array<{ id: string }>>
  }

  const pricing = container.resolve(Modules.PRICING) as {
    createPriceSets: (data: unknown) => Promise<unknown>
  }

  const createdIds: Array<{ handle: string; id: string; type: string }> = []

  for (const fixture of FIXTURES) {
    const existing = await productModule.listProducts(
      { handle: fixture.handle },
      { take: 1 }
    )
    if (existing[0]?.id) {
      logger.info(`[B5] skip existing ${fixture.handle} → ${existing[0].id}`)
      createdIds.push({
        handle: fixture.handle,
        id: existing[0].id,
        type: fixture.product_type ?? "missing",
      })
      continue
    }

    const images = Array.from({ length: fixture.image_count }, (_, i) => ({
      url: `https://placehold.co/120x120/png?text=g${i}`,
    }))

    const variant: Record<string, unknown> = {
      title: "Default",
      sku: fixture.sku,
      options: { Default: "Default" },
    }
    if (typeof fixture.price === "number") {
      variant.prices = [{ amount: fixture.price, currency_code: "rub" }]
    }

    const { result } = await createProductsWorkflow(container).run({
      input: {
        products: [
          {
            title: fixture.title,
            handle: fixture.handle,
            status: fixture.status,
            thumbnail: fixture.thumbnail,
            options: [{ title: "Default", values: ["Default"] }],
            variants: [variant],
            images,
          },
        ],
      },
    })

    const product = (result ?? [])[0] as { id: string } | undefined
    if (!product?.id) {
      logger.info(`[B5] failed to create ${fixture.handle}`)
      continue
    }

    if (fixture.product_type) {
      const row = await extension.createProductClassifications({
        product_type: fixture.product_type,
      })
      const classification = asArray(row)[0]
      await link.create({
        [Modules.PRODUCT]: { product_id: product.id },
        [PRODUCT_EXTENSION_MODULE]: {
          product_classification_id: classification.id,
        },
      })
    }

    createdIds.push({
      handle: fixture.handle,
      id: product.id,
      type: fixture.product_type ?? "missing",
    })
    logger.info(
      `[B5] created ${fixture.handle} id=${product.id} type=${fixture.product_type ?? "missing"} images=${fixture.image_count}`
    )
  }

  // Touch pricing module so unused import stays intentional if prices via workflow failed.
  void pricing

  logger.info("[B5] Fixture summary:\n" + JSON.stringify(createdIds, null, 2))
}
