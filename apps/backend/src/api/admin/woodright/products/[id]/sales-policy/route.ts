import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { PRODUCT_SALES_MODULE } from "../../../../../../modules/product-sales"
import { buildBuyerPurchaseContract } from "../../../../../../lib/woodright-sales/buyer-purchase-contract"
import { validateSalesPolicy } from "../../../../../../lib/woodright-sales/validate-sales-policy"
import type { SalesMode, SalesModifier } from "../../../../../../lib/woodright-sales/sales-modes"

type SalesPolicyRow = {
  id: string
  sales_mode: SalesMode
  modifiers?: SalesModifier[] | null
  lead_time_text?: string | null
  buyer_message?: string | null
  manager_confirmation_required?: boolean
  related_room_set_id?: string | null
  showroom_sample_available?: boolean
  unavailable_reason?: string | null
  policy_source?: string
}

type ProductSalesServiceLike = {
  createProductSalesPolicies: (
    data: Record<string, unknown>
  ) => Promise<SalesPolicyRow | SalesPolicyRow[]>
  updateProductSalesPolicies: (
    data: Record<string, unknown>
  ) => Promise<SalesPolicyRow | SalesPolicyRow[]>
  deleteProductSalesPolicies: (ids: string[]) => Promise<unknown>
}

async function loadLinkedPolicy(
  req: MedusaRequest,
  productId: string
): Promise<SalesPolicyRow | null> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as {
    graph: (args: {
      entity: string
      fields: string[]
      filters?: Record<string, unknown>
    }) => Promise<{ data: unknown[] }>
  }
  try {
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "product_sales_policy.*"],
      filters: { id: productId },
    })
    const product = data?.[0] as
      | { product_sales_policy?: SalesPolicyRow | SalesPolicyRow[] | null }
      | undefined
    const raw = product?.product_sales_policy
    if (!raw) return null
    return Array.isArray(raw) ? raw[0] ?? null : raw
  } catch {
    return null
  }
}

function withPreview(policy: SalesPolicyRow | null) {
  const purchase = buildBuyerPurchaseContract({
    sales_mode: policy?.sales_mode ?? null,
    modifiers: (policy?.modifiers as SalesModifier[] | undefined) ?? [],
    manager_confirmation_required: policy?.manager_confirmation_required,
    lead_time_text: policy?.lead_time_text,
    buyer_message: policy?.buyer_message,
  })
  return { sales_policy: policy, purchase }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const productId = req.params.id as string
  const policy = await loadLinkedPolicy(req, productId)
  res.json(withPreview(policy))
}

export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const productId = req.params.id as string
  const body = req.body as {
    sales_mode?: unknown
    modifiers?: unknown
    lead_time_text?: string | null
    buyer_message?: string | null
    manager_confirmation_required?: boolean
    related_room_set_id?: string | null
    showroom_sample_available?: boolean
    unavailable_reason?: string | null
  }

  const validated = validateSalesPolicy({
    sales_mode: body.sales_mode,
    modifiers: body.modifiers,
    related_room_set_id: body.related_room_set_id,
  })
  if (!validated.ok) {
    res.status(400).json({ code: validated.code, message: validated.message })
    return
  }

  const salesService = req.scope.resolve(
    PRODUCT_SALES_MODULE
  ) as unknown as ProductSalesServiceLike
  const link = req.scope.resolve(ContainerRegistrationKeys.LINK) as {
    create: (data: Record<string, unknown>) => Promise<unknown>
    dismiss?: (data: Record<string, unknown>) => Promise<unknown>
  }

  const existing = await loadLinkedPolicy(req, productId)
  const payload = {
    sales_mode: validated.sales_mode,
    modifiers: validated.modifiers,
    lead_time_text: body.lead_time_text ?? null,
    buyer_message: body.buyer_message ?? null,
    manager_confirmation_required: Boolean(
      body.manager_confirmation_required
    ),
    related_room_set_id: body.related_room_set_id ?? null,
    showroom_sample_available: Boolean(body.showroom_sample_available),
    unavailable_reason: body.unavailable_reason ?? null,
    policy_source: "override" as const,
  }

  let policy: SalesPolicyRow
  if (existing?.id) {
    const updated = await salesService.updateProductSalesPolicies({
      id: existing.id,
      ...payload,
    })
    policy = (Array.isArray(updated) ? updated[0] : updated) as SalesPolicyRow
  } else {
    const created = await salesService.createProductSalesPolicies(payload)
    policy = (Array.isArray(created) ? created[0] : created) as SalesPolicyRow
    await link.create({
      [Modules.PRODUCT]: { product_id: productId },
      [PRODUCT_SALES_MODULE]: { product_sales_policy_id: policy.id },
    })
  }

  res.json(withPreview(policy))
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const productId = req.params.id as string
  const existing = await loadLinkedPolicy(req, productId)
  if (!existing?.id) {
    res.json({ deleted: true, sales_policy: null })
    return
  }

  const salesService = req.scope.resolve(
    PRODUCT_SALES_MODULE
  ) as unknown as ProductSalesServiceLike
  const link = req.scope.resolve(ContainerRegistrationKeys.LINK) as {
    dismiss: (data: Record<string, unknown>) => Promise<unknown>
  }

  try {
    await link.dismiss({
      [Modules.PRODUCT]: { product_id: productId },
      [PRODUCT_SALES_MODULE]: { product_sales_policy_id: existing.id },
    })
  } catch {
    // Link may already be gone; still delete the policy row.
  }

  await salesService.deleteProductSalesPolicies([existing.id])
  res.json({ deleted: true, sales_policy: null })
}
