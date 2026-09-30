/**
 * Buyer publication gate.
 *
 * A product is public only when Medusa `status` is exactly `published`.
 * Missing, draft, proposed, rejected, or any other value is not public.
 * Fail closed. Admin and internal queries must not use this helper.
 */
export const BUYER_PUBLIC_PRODUCT_STATUS = "published" as const

export function isBuyerPublicProductStatus(status: unknown): boolean {
  return status === BUYER_PUBLIC_PRODUCT_STATUS
}
