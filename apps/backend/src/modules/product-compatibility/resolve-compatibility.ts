export type CompatibilityLink = {
  accessory_product_id: string
  product_id: string
}

export type CompatibilityProduct = {
  id: string
  title: string
  handle: string
  status: string
}

export type CompatibilityCard = {
  id: string
  title: string
  handle: string
}

export type CompatibilityView = {
  accessories: CompatibilityCard[]
  compatible_with: CompatibilityCard[]
}

function card(product: CompatibilityProduct): CompatibilityCard {
  return { id: product.id, title: product.title, handle: product.handle }
}

/**
 * Both PDP directions come from the same link rows.
 * Collection, SKU, and title are not used. Draft products are omitted.
 */
export function resolveCompatibilityView(input: {
  productId: string
  links: CompatibilityLink[]
  products: CompatibilityProduct[]
}): CompatibilityView {
  const source = input.products.find((product) => product.id === input.productId)
  if (!source || source.status !== "published") {
    return { accessories: [], compatible_with: [] }
  }
  const published = new Map(
    input.products
      .filter((product) => product.status === "published" && product.id !== input.productId)
      .map((product) => [product.id, product])
  )
  const accessories: CompatibilityCard[] = []
  const compatible_with: CompatibilityCard[] = []
  const seenAccessory = new Set<string>()
  const seenHost = new Set<string>()

  for (const link of input.links) {
    if (link.accessory_product_id === link.product_id) continue
    if (link.product_id === input.productId) {
      const accessory = published.get(link.accessory_product_id)
      if (accessory && !seenAccessory.has(accessory.id)) {
        seenAccessory.add(accessory.id)
        accessories.push(card(accessory))
      }
    }
    if (link.accessory_product_id === input.productId) {
      const host = published.get(link.product_id)
      if (host && !seenHost.has(host.id)) {
        seenHost.add(host.id)
        compatible_with.push(card(host))
      }
    }
  }

  return { accessories, compatible_with }
}
