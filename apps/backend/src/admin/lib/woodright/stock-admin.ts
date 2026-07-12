/**
 * Package F (F-01) — canonical paths into the stock Medusa Admin plus the
 * single Russian label for "escape hatch" buttons. New code must import from
 * here instead of hard-coding `/app/...` strings or inventing new wordings.
 */

export const STOCK_ADMIN_LABEL = "Стандартная админка Medusa"

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
