import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { PRODUCT_SALES_MODULE } from "../../../../../../modules/product-sales"
import { buildBuyerPurchaseContract } from "../../../../../../lib/woodright-sales/buyer-purchase-contract"
import { validateSalesPolicy } from "../../../../../../lib/woodright-sales/validate-sales-policy"
import type {
  ProductClassificationType,
  SalesMode,
  SalesModifier,
} from "../../../../../../lib/woodright-sales/sales-modes"

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

type ProductPreviewRow = {
  id: string
  classification: ProductClassificationType | null
  policy: SalesPolicyRow | null
  launch_mode: string | null
}

function readLaunchMode(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null
  const launch = (meta as Record<string, unknown>).launch_mode
  return typeof launch === "string" ? launch : null
}

function normalizeClassification(
  raw: unknown
): ProductClassificationType | null {
  if (raw === "STANDARD" || raw === "CONFIGURABLE" || raw === "BESPOKE") {
    return raw
  }
  return null
}

async function loadProductPreview(
  req: MedusaRequest,
  productId: string
): Promise<ProductPreviewRow | null> {
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
      fields: [
        "id",
        "metadata",
        "product_sales_policy.*",
        "product_classification.product_type",
      ],
      filters: { id: productId },
    })
    const product = data?.[0] as
      | {
          id?: string
          metadata?: unknown
          product_sales_policy?: SalesPolicyRow | SalesPolicyRow[] | null
          product_classification?: { product_type?: unknown } | null
        }
      | undefined
    if (!product?.id) return null
    const raw = product.product_sales_policy
    const policy = !raw ? null : Array.isArray(raw) ? raw[0] ?? null : raw
    return {
      id: String(product.id),
      classification: normalizeClassification(
        product.product_classification?.product_type
      ),
      policy,
      launch_mode: readLaunchMode(product.metadata),
    }
  } catch {
    return null
  }
}

async function loadLinkedPolicy(
  req: MedusaRequest,
  productId: string
): Promise<SalesPolicyRow | null> {
  const preview = await loadProductPreview(req, productId)
  return preview?.policy ?? null
}

function withPreview(
  policy: SalesPolicyRow | null,
  classification: ProductClassificationType | null,
  launch_mode: string | null = null
) {
  const purchase = buildBuyerPurchaseContract({
    sales_mode: policy?.sales_mode ?? null,
    modifiers: (policy?.modifiers as SalesModifier[] | undefined) ?? [],
    classification,
    launch_mode,
    manager_confirmation_required: policy?.manager_confirmation_required,
    lead_time_text: policy?.lead_time_text,
    buyer_message: policy?.buyer_message,
  })
  return { sales_policy: policy, purchase }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const productId = req.params.id as string
  const preview = await loadProductPreview(req, productId)
  if (!preview) {
    res.status(404).json({
      code: "PRODUCT_NOT_FOUND",
      message: "Товар не найден",
    })
    return
  }
  res.json(
    withPreview(preview.policy, preview.classification, preview.launch_mode)
  )
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

  const preview = await loadProductPreview(req, productId)
  if (!preview) {
    res.status(404).json({
      code: "PRODUCT_NOT_FOUND",
      message: "Товар не найден",
    })
    return
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

  const existing = preview.policy
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

  res.json(
    withPreview(policy, preview.classification, preview.launch_mode)
  )
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const productId = req.params.id as string
  const preview = await loadProductPreview(req, productId)
  if (!preview) {
    res.status(404).json({
      code: "PRODUCT_NOT_FOUND",
      message: "Товар не найден",
    })
    return
  }
  const existing = preview.policy
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
