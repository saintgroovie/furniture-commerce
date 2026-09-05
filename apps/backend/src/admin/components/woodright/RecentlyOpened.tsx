import { Text } from "@medusajs/ui"
import { Link } from "react-router-dom"
import { readRecentProductIds } from "../../lib/recent-products"
import type { SellerProduct } from "../../../lib/woodright-admin/seller-product-types"

export function RecentlyOpened({ products }: { products: SellerProduct[] }) {
  const ids = readRecentProductIds()
  if (ids.length === 0) return null
  const byId = new Map(products.map((product) => [product.id, product]))
  const rows = ids
    .map((id) => byId.get(id))
    .filter((product): product is SellerProduct => product != null)
  if (rows.length === 0) return null

  return (
    <div className="px-6 py-4">
      <Text weight="plus" className="mb-3">
        Недавно открытые
      </Text>
      <ul className="flex flex-col gap-2">
        {rows.map((product) => (
          <li key={product.id}>
            <Link to={`/woodright/products/${product.id}`} className="text-sm">
              {product.title}
              {product.skus[0] ? ` · ${product.skus[0]}` : ""}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
