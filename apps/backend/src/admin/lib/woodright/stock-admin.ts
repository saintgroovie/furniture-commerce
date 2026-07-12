/**
 * Canonical paths into stock Admin entity screens, plus a generic escape-hatch
 * label for cases without a more specific CTA. Prefer context-specific copy
 * ("Все акции", "Полная карточка товара") in primary UI.
 */

export const STOCK_ADMIN_LABEL = "Открыть полный раздел"

export function stockAdminHomePath(): string {
  return "/app"
}

export function stockAdminProductsPath(params?: { status?: string }): string {
  if (params?.status) {
    return `/app/products?status=${encodeURIComponent(params.status)}`
  }
  return "/app/products"
}

export function stockAdminProductPath(productId: string): string {
  return `/app/products/${productId}`
}

/**
 * Stock Admin renders product creation as a focus-modal route.
 * Verified in Medusa 2.13.3 (`/app/products/create`).
 */
export function stockAdminProductCreatePath(): string {
  return "/app/products/create"
}

export function stockAdminPromotionsPath(): string {
  return "/app/promotions"
}

export function stockAdminPromotionPath(promotionId: string): string {
  return `/app/promotions/${promotionId}`
}

export function stockAdminCampaignsPath(): string {
  return "/app/campaigns"
}
