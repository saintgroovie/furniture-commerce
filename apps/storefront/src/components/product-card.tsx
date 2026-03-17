import Link from "next/link"
import { formatRub, getPrice } from "@/lib/format"

type Product = {
  id: string
  title: string
  description?: string
  handle?: string
  thumbnail?: string
  variants?: Array<{
    id?: string
    calculated_price?: { calculated_amount?: number }
    prices?: Array<{ amount?: number }>
  }>
  product_classification?: { product_type?: string }
}

const BADGE_LABELS: Record<string, string> = {
  BESPOKE: "На заказ",
}

export function ProductCard({ product }: { product: Product }) {
  const type = product.product_classification?.product_type
  const price = getPrice(product)
  const badgeLabel = type ? BADGE_LABELS[type] : undefined

  return (
    <Link href={`/product/${product.id}`} className="card card-link product-card">
      {product.thumbnail ? (
        <img
          src={product.thumbnail}
          alt={product.title}
          className="card-img"
          loading="lazy"
        />
      ) : (
        <div className="card-img card-img-placeholder" aria-hidden="true" />
      )}
      <div className="card-body">
        <h3>{product.title}</h3>
        {price != null && (
          <p className="price">{formatRub(price)}</p>
        )}
        {badgeLabel && <span className="badge">{badgeLabel}</span>}
      </div>
    </Link>
  )
}
