import { sellerPostalAddress, woodrightSeller } from "./legal/woodright-seller"
import { buildMerchantPolicyJsonLd } from "./merchant-policy-json-ld"
import { getShowroomOrganizationContactLd, showroomContacts } from "./showroom-contacts"

/** One identity for the seller published on /requisites and every product Offer. */
export function sellerOrganizationId(siteUrl: string): string {
  return `${new URL(siteUrl).origin}/#organization`
}

export function buildOrganizationJsonLd(siteUrl: string) {
  const origin = new URL(siteUrl).origin
  const showroom = getShowroomOrganizationContactLd()
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": sellerOrganizationId(origin),
    name: "Woodright",
    legalName: woodrightSeller.fullName,
    taxID: woodrightSeller.inn,
    url: `${origin}/`,
    logo: {
      "@type": "ImageObject",
      url: `${origin}/brand/woodright-wordmark.svg`,
      width: 1092,
      height: 140,
    },
    telephone: showroom.telephone,
    address: { "@type": "PostalAddress", ...sellerPostalAddress },
    location: {
      "@type": "Place",
      name: showroomContacts.title,
      url: `${origin}/contacts`,
      address: showroom.address,
    },
    ...buildMerchantPolicyJsonLd(origin),
  }
}
