import { buildLegalPage } from "./legal/legal-content"

/** Policy identifiers shared by the seller graph and individual offers. */
export function merchantPolicyIds(origin: string) {
  const base = new URL(origin).origin
  return {
    returns: `${base}/returns#return-policy`,
    shipping: `${base}/delivery#shipping-service`,
  }
}

/**
 * Reuse the published policy text. Delivery is individually quoted; do not
 * invent a rate, geography, handling time or transit time. A policy link
 * preserves the conditional return rules (distance sales, defects, custom work).
 */
export function buildMerchantPolicyJsonLd(origin: string) {
  const base = new URL(origin).origin
  const ids = merchantPolicyIds(base)
  const delivery = buildLegalPage("delivery")
  const returns = buildLegalPage("returns")
  return {
    hasMerchantReturnPolicy: {
      "@type": "MerchantReturnPolicy",
      "@id": ids.returns,
      merchantReturnLink: `${base}${returns.path}`,
      description: returns.lead.join(". "),
    },
    hasShippingService: {
      "@type": "ShippingService",
      "@id": ids.shipping,
      name: "Доставка по согласованию с менеджером",
      url: `${base}${delivery.path}`,
      description: [
        ...delivery.lead,
        ...delivery.sections.slice(0, 3).flatMap((section) => section.paragraphs),
      ].join(". "),
    },
  }
}
