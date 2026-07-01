import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

/**
 * Medusa v2 stores money in major currency units (rubles), not kopecks.
 * Legacy ingestion multiplied workbook rub prices by 100 — this script reverses that in DB.
 *
 *   PRICE_AMOUNT_DIVIDE_100_CONFIRM=1 npm run normalize-price-amounts
 *
 * Does not rewrite existing order snapshots; place new orders after normalization.
 */
export default async function normalizeMedusaPriceAmounts({ container }: ExecArgs) {
  if (process.env.PRICE_AMOUNT_DIVIDE_100_CONFIRM !== "1") {
    throw new Error(
      "Set PRICE_AMOUNT_DIVIDE_100_CONFIRM=1 to divide all RUB variant prices by 100."
    )
  }

  const logger = container.resolve("logger") as { info: (s: string) => void }
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const pricingModule = container.resolve(Modules.PRICING) as {
    upsertPriceSets: (
      data: Array<{
        id: string
        prices: Array<{ id: string; amount: number; currency_code: string }>
      }>
    ) => Promise<unknown>
  }

  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: [
      "id",
      "price_set.id",
      "price_set.prices.id",
      "price_set.prices.amount",
      "price_set.prices.currency_code",
    ],
  })

  const byPriceSet = new Map<
    string,
    Array<{ id: string; amount: number; currency_code: string }>
  >()

  for (const variant of variants ?? []) {
    const v = variant as {
      price_set?: {
        id?: string
        prices?: Array<{ id: string; amount: number; currency_code: string }>
      }
    }
    const priceSetId = v.price_set?.id
    if (!priceSetId) continue

    for (const price of v.price_set?.prices ?? []) {
      if (String(price.currency_code).toLowerCase() !== "rub") continue
      if (!Number(price.amount)) continue

      const list = byPriceSet.get(priceSetId) ?? []
      list.push({
        id: price.id,
        amount: Math.round(Number(price.amount) / 100),
        currency_code: "rub",
      })
      byPriceSet.set(priceSetId, list)
    }
  }

  const priceSets = [...byPriceSet.entries()].map(([id, prices]) => ({ id, prices }))
  if (!priceSets.length) {
    logger.info("No RUB variant prices to normalize.")
    return
  }

  const chunkSize = 50
  for (let i = 0; i < priceSets.length; i += chunkSize) {
    await pricingModule.upsertPriceSets(priceSets.slice(i, i + chunkSize))
  }

  const priceCount = priceSets.reduce((n, ps) => n + ps.prices.length, 0)
  logger.info(
    `Normalized ${priceCount} RUB prices across ${priceSets.length} price sets (÷100).`
  )
}
