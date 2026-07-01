import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createLocationFulfillmentSetWorkflow,
  createServiceZonesWorkflow,
  createShippingOptionsWorkflow,
  updateRegionsWorkflow,
} from "@medusajs/medusa/core-flows"

const SYSTEM_PAYMENT = "pp_system_default"
const MANUAL_FULFILLMENT = "manual_manual"
const SHIPPING_OPTION_NAME = "Доставка согласуется менеджером"

/**
 * Idempotent bootstrap for no-payment MVP checkout:
 * - pp_system_default on all regions
 * - fulfillment set + RU service zone + zero-price shipping option
 *
 * Run once per environment:
 *   npx medusa exec ./src/scripts/ensure-checkout-ready.ts
 */
export default async function ensureCheckoutReady({ container }: ExecArgs) {
  const logger = container.resolve("logger") as { info: (s: string) => void }
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const link = container.resolve(ContainerRegistrationKeys.LINK) as {
    create: (data: Record<string, Record<string, string>>) => Promise<unknown>
  }

  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "name", "payment_providers.id"],
  })

  for (const region of regions ?? []) {
    const hasSystem = (region.payment_providers ?? []).some(
      (p: { id?: string }) => p?.id === SYSTEM_PAYMENT
    )
    if (!hasSystem) {
      logger.info(`Linking ${SYSTEM_PAYMENT} to region ${region.id}`)
      await updateRegionsWorkflow(container).run({
        input: {
          selector: { id: region.id },
          update: { payment_providers: [SYSTEM_PAYMENT] },
        },
      })
    }
  }

  const { data: stockLocations } = await query.graph({
    entity: "stock_location",
    fields: [
      "id",
      "name",
      "fulfillment_sets.id",
      "fulfillment_sets.service_zones.id",
      "fulfillment_providers.id",
    ],
  })
  const stockLocation = stockLocations?.[0] as
    | {
        id: string
        fulfillment_sets?: Array<{
          id: string
          service_zones?: Array<{ id: string }>
        }>
        fulfillment_providers?: Array<{ id: string }>
      }
    | undefined

  if (!stockLocation) {
    throw new Error("No stock location found. Create one in Medusa Admin first.")
  }

  const { data: shippingProfiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id", "name", "type"],
  })
  const shippingProfile =
    shippingProfiles?.find((p: { type?: string }) => p.type === "default") ??
    shippingProfiles?.[0]

  if (!shippingProfile) {
    throw new Error("No shipping profile found.")
  }

  const hasFulfillmentProvider = (stockLocation.fulfillment_providers ?? []).some(
    (p) => p?.id === MANUAL_FULFILLMENT
  )
  if (!hasFulfillmentProvider) {
    logger.info(`Linking ${MANUAL_FULFILLMENT} to stock location ${stockLocation.id}`)
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
      [Modules.FULFILLMENT]: { fulfillment_provider_id: MANUAL_FULFILLMENT },
    })
  }

  let fulfillmentSet = stockLocation.fulfillment_sets?.[0]
  if (!fulfillmentSet) {
    logger.info("Creating fulfillment set for stock location")
    await createLocationFulfillmentSetWorkflow(container).run({
      input: {
        location_id: stockLocation.id,
        fulfillment_set_data: { name: "Доставка", type: "shipping" },
      },
    })
    const { data: refreshed } = await query.graph({
      entity: "stock_location",
      fields: ["id", "fulfillment_sets.id", "fulfillment_sets.service_zones.id"],
      filters: { id: stockLocation.id },
    })
    fulfillmentSet = refreshed?.[0]?.fulfillment_sets?.[0]
  }

  let serviceZoneId = fulfillmentSet?.service_zones?.[0]?.id
  if (!serviceZoneId && fulfillmentSet?.id) {
    logger.info("Creating RU service zone")
    const { result } = await createServiceZonesWorkflow(container).run({
      input: {
        data: [
          {
            name: "Россия",
            fulfillment_set_id: fulfillmentSet.id,
            geo_zones: [{ type: "country", country_code: "ru" }],
          },
        ],
      },
    })
    serviceZoneId = result?.[0]?.id
  }

  const { data: existingOptions } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name"],
  })
  const hasOption = existingOptions?.some(
    (o: { name?: string }) => o.name === SHIPPING_OPTION_NAME
  )

  if (!hasOption && serviceZoneId) {
    logger.info("Creating zero-price shipping option")
    await createShippingOptionsWorkflow(container).run({
      input: [
        {
          name: SHIPPING_OPTION_NAME,
          service_zone_id: serviceZoneId,
          shipping_profile_id: shippingProfile.id,
          provider_id: MANUAL_FULFILLMENT,
          type: {
            label: "Договорная",
            description: "Стоимость доставки согласуется с менеджером",
            code: "manager_delivery",
          },
          price_type: "flat",
          prices: [{ amount: 0, currency_code: "rub" }],
        },
      ],
    })
  }

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "shipping_profile.id"],
  })
  let linked = 0
  for (const product of products ?? []) {
    if (product.shipping_profile?.id) continue
    await link.create({
      [Modules.PRODUCT]: { product_id: product.id },
      [Modules.FULFILLMENT]: { shipping_profile_id: shippingProfile.id },
    })
    linked++
  }
  if (linked > 0) {
    logger.info(`Linked ${linked} products to default shipping profile`)
  }

  logger.info("Checkout prerequisites ready (payment provider + shipping option).")
}
