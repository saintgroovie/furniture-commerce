import { buildBuyerPurchaseContract } from "../../../lib/woodright-sales/buyer-purchase-contract"
import type {
  ProductClassificationType,
  SalesMode,
  SalesModifier,
} from "../../../lib/woodright-sales/sales-modes"

function readLaunchMode(product: Record<string, unknown>): string | null {
  const meta = product.metadata as Record<string, unknown> | undefined
  if (meta && typeof meta.launch_mode === "string") return meta.launch_mode
  return null
}

/**
 * Attach buyer-safe `purchase` contract from sales policy + classification.
 * Storefront should prefer `product.purchase` for CTAs.
 */
export function attachBuyerPurchaseContract(
  product: Record<string, unknown>
): Record<string, unknown> {
  const classification = (
    product.product_classification as { product_type?: string } | undefined
  )?.product_type as ProductClassificationType | undefined

  const rawPolicy = product.product_sales_policy as
    | {
        sales_mode?: SalesMode
        modifiers?: SalesModifier[] | null
        lead_time_text?: string | null
        buyer_message?: string | null
        manager_confirmation_required?: boolean
      }
    | Array<{
        sales_mode?: SalesMode
        modifiers?: SalesModifier[] | null
        lead_time_text?: string | null
        buyer_message?: string | null
        manager_confirmation_required?: boolean
      }>
    | null
    | undefined

  const policy = Array.isArray(rawPolicy) ? rawPolicy[0] : rawPolicy

  const purchase = buildBuyerPurchaseContract({
    sales_mode: policy?.sales_mode ?? null,
    modifiers: (policy?.modifiers as SalesModifier[] | undefined) ?? [],
    classification: classification ?? null,
    launch_mode: readLaunchMode(product),
    manager_confirmation_required: policy?.manager_confirmation_required,
    lead_time_text: policy?.lead_time_text ?? null,
    buyer_message: policy?.buyer_message ?? null,
  })

  return { ...product, purchase }
}
