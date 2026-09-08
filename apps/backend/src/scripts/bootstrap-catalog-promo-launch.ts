/**
 * Catalog Promotion Window - launch bootstrap (idempotent, inspectable, fail-closed).
 *
 * Run:  npx medusa exec ./src/scripts/bootstrap-catalog-promo-launch.ts
 *
 * What it does (only for the 2 manifest products):
 *   1. verifies each product exists, is published, non-BESPOKE, variants[0]
 *      matches manifest variant/SKU and base RUB price == expected_base_price
 *   2. ensures the native sale price list "Промо в каталоге" (type=sale, active)
 *   3. upserts one RUB sale price per manifest variant (10% off)
 *   4. upserts the promotion slot `catalog_main` (enabled, label, ordered ids)
 *
 * NEVER touches other products / prices. NEVER deletes. Re-running is a no-op.
 * Gate: see catalog-promo-launch-gate.ts (target/mode/db/production tokens).
 */
import type { ExecArgs } from "@medusajs/framework/types"
import {
  ensureCatalogPromoPriceList,
  findCatalogPromoPriceList,
  listCatalogPromoPrices,
  priceAmount,
  resolvePricingModule,
  upsertCatalogPromoPrice,
} from "../lib/woodright-admin/catalog-promo-price-list"
import { PROMOTION_SLOT_MODULE } from "../modules/promotion-slot"
import type PromotionSlotModuleService from "../modules/promotion-slot/service"
import { normalizeProductIds } from "../modules/promotion-slot/slot-contract"
import {
  CATALOG_PROMO_LAUNCH_PRODUCTS,
  CATALOG_PROMO_LAUNCH_SLOT,
  type CatalogPromoLaunchProduct,
} from "./catalog-promo-launch-manifest"
import { assertCatalogPromoGate } from "./catalog-promo-launch-gate"

type Verified = CatalogPromoLaunchProduct & { price_set_id: string }

type PlanRow = {
  sku: string
  product_id: string
  base_price: number
  sale_price: number
  price_action: "create" | "update" | "noop"
  current_sale_price: number | null
}

export default async function bootstrapCatalogPromoLaunch({ container }: ExecArgs) {
  const gate = assertCatalogPromoGate()
  if (!gate.ok) {
    console.error(`[catalog-promo] ${gate.code}: ${gate.message}`)
    process.exitCode = 1
    return
  }
  console.log(
    `[catalog-promo] target=${gate.target} mode=${gate.mode} db=${gate.dbName}@${gate.hostname} manifest=${gate.manifestId} sha=${gate.manifestSha.slice(0, 12)}`
  )

  const query = container.resolve("query") as {
    graph: (args: {
      entity: string
      fields: string[]
      filters?: Record<string, unknown>
    }) => Promise<{ data: unknown[] }>
  }
  const pricing = resolvePricingModule(container)
  const slotService = container.resolve(PROMOTION_SLOT_MODULE) as PromotionSlotModuleService

  /* 1. Verify manifest products against the live DB (fail closed on any drift). */
  const { data } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "handle",
      "title",
      "status",
      "thumbnail",
      "variants.id",
      "variants.sku",
      "variants.price_set.id",
      "variants.price_set.prices.amount",
      "variants.price_set.prices.currency_code",
      "variants.price_set.prices.price_list_id",
      "product_classification.product_type",
    ],
    filters: { id: CATALOG_PROMO_LAUNCH_PRODUCTS.map((p) => p.product_id) },
  })
  const byId = new Map(
    ((data ?? []) as Array<Record<string, unknown>>).map((r) => [String(r.id), r])
  )
  const verified: Verified[] = []
  const problems: string[] = []
  for (const m of CATALOG_PROMO_LAUNCH_PRODUCTS) {
    const raw = byId.get(m.product_id)
    if (!raw) {
      problems.push(`${m.sku}: product ${m.product_id} not found`)
      continue
    }
    if (raw.handle !== m.handle) problems.push(`${m.sku}: handle ${raw.handle} != ${m.handle}`)
    if (raw.status !== "published") problems.push(`${m.sku}: status ${raw.status}`)
    const type = (raw.product_classification as { product_type?: unknown } | undefined)
      ?.product_type
    if (type === "BESPOKE") problems.push(`${m.sku}: BESPOKE`)
    if (typeof raw.thumbnail !== "string" || !raw.thumbnail) {
      problems.push(`${m.sku}: no thumbnail`)
    }
    const variants = Array.isArray(raw.variants)
      ? (raw.variants as Array<Record<string, unknown>>)
      : []
    const v0 = variants[0]
    if (!v0 || v0.id !== m.variant_id) {
      problems.push(`${m.sku}: variants[0] ${v0?.id ?? "none"} != ${m.variant_id}`)
      continue
    }
    if (v0.sku !== m.sku) problems.push(`${m.sku}: sku ${v0.sku}`)
    const ps = v0.price_set as
      | { id?: unknown; prices?: Array<Record<string, unknown>> }
      | undefined
    const priceSetId = typeof ps?.id === "string" ? ps.id : null
    if (!priceSetId) {
      problems.push(`${m.sku}: no price set`)
      continue
    }
    const base = (ps?.prices ?? []).find(
      (p) =>
        !p.price_list_id &&
        String(p.currency_code ?? "rub").toLowerCase() === "rub"
    )
    const baseAmount = base ? Number(base.amount) : NaN
    if (baseAmount !== m.expected_base_price) {
      problems.push(`${m.sku}: base price ${baseAmount} != expected ${m.expected_base_price}`)
      continue
    }
    verified.push({ ...m, price_set_id: priceSetId })
  }
  if (problems.length > 0) {
    for (const p of problems) console.error(`[catalog-promo] FAIL_CLOSED ${p}`)
    process.exitCode = 1
    return
  }

  /* 2-3. Price list + per-variant sale price plan. */
  const existingList = await findCatalogPromoPriceList(pricing)
  const currentPrices = existingList
    ? await listCatalogPromoPrices(
        pricing,
        existingList.id,
        verified.map((v) => v.price_set_id)
      )
    : new Map()
  const plan: PlanRow[] = verified.map((v) => {
    const current = priceAmount(currentPrices.get(v.price_set_id))
    return {
      sku: v.sku,
      product_id: v.product_id,
      base_price: v.expected_base_price,
      sale_price: v.sale_price,
      current_sale_price: current,
      price_action:
        current == null ? "create" : current === v.sale_price ? "noop" : "update",
    }
  })

  /* 4. Slot plan. */
  const slotBefore = await slotService.retrieveCatalogSlot()
  const desiredIds = verified.map((v) => v.product_id)
  const slotSame =
    !!slotBefore &&
    slotBefore.enabled === CATALOG_PROMO_LAUNCH_SLOT.enabled &&
    (slotBefore.label ?? null) === CATALOG_PROMO_LAUNCH_SLOT.label &&
    JSON.stringify(normalizeProductIds(slotBefore.product_ids)) === JSON.stringify(desiredIds) &&
    Number(slotBefore.rotation_interval_ms) === CATALOG_PROMO_LAUNCH_SLOT.rotation_interval_ms

  console.log(
    JSON.stringify(
      {
        price_list: existingList
          ? { id: existingList.id, status: existingList.status, action: "reuse" }
          : { action: "create" },
        prices: plan,
        slot: {
          before: slotBefore
            ? {
                enabled: slotBefore.enabled,
                label: slotBefore.label,
                product_ids: normalizeProductIds(slotBefore.product_ids),
              }
            : null,
          after: { ...CATALOG_PROMO_LAUNCH_SLOT, product_ids: desiredIds },
          action: slotSame ? "noop" : slotBefore ? "update" : "create",
        },
      },
      null,
      2
    )
  )

  if (!gate.apply) {
    console.log("[catalog-promo] dry-run complete - nothing written")
    return
  }

  const { priceList, created } = await ensureCatalogPromoPriceList(pricing)
  console.log(`[catalog-promo] price list ${priceList.id} ${created ? "created" : "reused"}`)
  for (const v of verified) {
    const result = await upsertCatalogPromoPrice(pricing, priceList.id, v.price_set_id, v.sale_price)
    console.log(`[catalog-promo] ${v.sku}: sale ${v.sale_price} ₽ - ${result.action} (${result.price_id})`)
  }
  if (!slotSame) {
    const slot = await slotService.upsertCatalogSlot({
      enabled: CATALOG_PROMO_LAUNCH_SLOT.enabled,
      label: CATALOG_PROMO_LAUNCH_SLOT.label,
      product_ids: desiredIds,
      rotation_interval_ms: CATALOG_PROMO_LAUNCH_SLOT.rotation_interval_ms,
    })
    console.log(`[catalog-promo] slot ${slot.id} upserted (enabled=${slot.enabled})`)
  } else {
    console.log(`[catalog-promo] slot ${slotBefore!.id} unchanged`)
  }

  /* Post-apply verification: re-read what the store would resolve. */
  const after = await listCatalogPromoPrices(
    pricing,
    priceList.id,
    verified.map((v) => v.price_set_id)
  )
  let ok = true
  for (const v of verified) {
    const amount = priceAmount(after.get(v.price_set_id))
    if (amount !== v.sale_price) {
      ok = false
      console.error(`[catalog-promo] VERIFY FAIL ${v.sku}: sale ${amount} != ${v.sale_price}`)
    }
  }
  const slotAfter = await slotService.retrieveCatalogSlot()
  if (!slotAfter?.enabled) {
    ok = false
    console.error("[catalog-promo] VERIFY FAIL slot not enabled")
  }
  console.log(ok ? "[catalog-promo] apply verified OK" : "[catalog-promo] apply verification FAILED")
  if (!ok) process.exitCode = 1
}
