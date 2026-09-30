/**
 * Buyer-facing promo eyebrow. Empty, missing, and whitespace-only labels
 * stay blank. The storefront does not invent a campaign phrase.
 */
export function buyerPromotionLabel(label: string | null | undefined): string | null {
  if (typeof label !== "string") return null
  const trimmed = label.trim()
  return trimmed.length > 0 ? trimmed : null
}
