import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { buildOrganizationJsonLd, sellerOrganizationId } from "./organization-json-ld"
import { buildOfferJsonLd } from "./product-json-ld"
import { jsonLdHtml } from "./json-ld"
import { woodrightSeller } from "./legal/woodright-seller"
import { showroomContacts } from "./showroom-contacts"

const org = buildOrganizationJsonLd("https://woodright.ru/product/example?variant=one")
assert.equal(org["@id"], "https://woodright.ru/#organization")
assert.equal(org.legalName, woodrightSeller.fullName)
assert.equal(org.taxID, woodrightSeller.inn)
assert.deepEqual(org.image, org.logo)
assert.equal(org.image.url, "https://woodright.ru/brand/woodright-wordmark.svg")
assert.equal(org.image.caption, "Логотип Woodright")
assert.equal(org.image.width * org.image.height >= 50000, true)
assert.equal(`${org.address.postalCode}, г. ${org.address.addressLocality}, ${org.address.streetAddress}`, woodrightSeller.legalAddress)
assert.deepEqual(org.location.address, { "@type": "PostalAddress", ...showroomContacts.postalAddress })
assert.notDeepEqual(org.address, org.location.address)
assert.equal(org.location.url, "https://woodright.ru/contacts")
assert.deepEqual(org.telephone, [showroomContacts.freeCall.tel, showroomContacts.writeOrCall.tel])
for (const url of ["https://woodright.ru/product/ol-65", "https://woodright.ru/product/table?material=solid"]) {
  const offer = buildOfferJsonLd({ url, priceRub: 65300, availability: "https://schema.org/BackOrder" })
  assert.deepEqual(offer.seller, { "@id": org["@id"] })
  assert.equal(offer.price, 65300)
  assert.equal(offer.availability, "https://schema.org/BackOrder")
}
assert.equal(sellerOrganizationId("https://example.test/path"), "https://example.test/#organization")
assert.doesNotMatch(JSON.stringify(org), /openingHours|latitude|longitude|aggregateRating|shippingRate|deliveryTime/)
const hostile = { name: 'Стол </script><script>alert("x")</script> & тумба', nested: { text: "<>&" } }
assert.equal(jsonLdHtml(hostile).includes("<"), false)
assert.deepEqual(JSON.parse(jsonLdHtml(hostile)), hostile)
const logo = readFileSync(new URL("../../public/brand/woodright-wordmark.svg", import.meta.url), "utf8")
const visibleLogo = readFileSync(new URL("../components/woodright-wordmark.tsx", import.meta.url), "utf8")
assert.equal(logo.match(/<path d="([^"]+)"/)?.[1], visibleLogo.match(/<path d="([^"]+)"/)?.[1])
assert.match(logo, /width="1092" height="140"/)
console.log("organization-json-ld.fidelity.test.ts: ok")
