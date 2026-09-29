/**
 * Buyer publication gate. Must stay identical to
 * `apps/backend/src/lib/buyer-publication.ts`.
 *
 * Public only when Medusa `status` is exactly `published`.
 * Missing or any other value is not public (fail closed).
 */
export const BUYER_PUBLIC_PRODUCT_STATUS = "published" as const

export function isBuyerPublicProductStatus(status: unknown): boolean {
  return status === BUYER_PUBLIC_PRODUCT_STATUS
}
