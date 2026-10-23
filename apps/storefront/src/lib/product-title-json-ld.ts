import type { BuyerTitleAttribute } from "./product-title-presentation"

/** Reuse the attributes printed below the title, preserving existing dimension properties. */
export function withBuyerTitleProperties(
  jsonLd: Record<string, unknown>, attributes: BuyerTitleAttribute[],
): Record<string, unknown> {
  const sleeping = [...new Set(attributes.filter((item) => item.source === "title_sleeping_place").map((item) => item.value))]
  const properties = [
    ...(Array.isArray(jsonLd.additionalProperty) ? jsonLd.additionalProperty : []),
    ...attributes.filter((item) => item.source !== "title_sleeping_place")
      .map((item) => ({ "@type": "PropertyValue", name: item.label, value: item.value })),
  ]
  const unique = [...new Map(properties.map((item) => [JSON.stringify(item), item])).values()]
  return {
    ...jsonLd,
    ...(sleeping.length === 1 ? { size: sleeping[0] } : {}),
    ...(unique.length ? { additionalProperty: unique } : {}),
  }
}
