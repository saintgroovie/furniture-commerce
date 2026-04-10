import Link from "next/link"
import { formatRub, getPrice } from "@/lib/format"
import type { DisplayGroup } from "@/lib/display-group"
import { formatGroupHint } from "@/lib/display-group"
import {
  getCollectionLabel,
  getSubcollectionLabel,
  getArticle,
  getDimensions,
  formatDimensionsCompact,
} from "@/lib/product-metadata"

type Product = {
  id: string
  title: string
  description?: string
  handle?: string
  thumbnail?: string
  metadata?: Record<string, unknown>
  variants?: Array<{
    id?: string
    sku?: string
    calculated_price?: { calculated_amount?: number }
    prices?: Array<{ amount?: number }>
  }>
  product_classification?: { product_type?: string }
}

const BADGE_LABELS: Record<string, string> = {
  BESPOKE: "На заказ",
}

export function ProductCard({
  product,
  displayGroup,
}: {
  product: Product
  displayGroup?: DisplayGroup
}) {
  const type = product.product_classification?.product_type
  const badgeLabel = type ? BADGE_LABELS[type] : undefined

  const price = displayGroup?.minPrice ?? getPrice(product)
  const pricePrefix = displayGroup ? "от " : ""

  const collectionLabel = getCollectionLabel(product as Record<string, unknown>)
  const subcollectionLabel = getSubcollectionLabel(product as Record<string, unknown>)
  const article = getArticle(product as Record<string, unknown>)
  const dim = getDimensions(product as Record<string, unknown>)

  const contextParts = [collectionLabel, subcollectionLabel, article].filter(Boolean)
  const contextLine = contextParts.length > 0 ? contextParts.join(" · ") : null

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
        {contextLine && (
          <span className="card-context">{contextLine}</span>
        )}
        <h3>{product.title}</h3>
        {dim != null && (
          <span className="card-dimensions">{formatDimensionsCompact(dim)}</span>
        )}
        {price != null && (
          <p className="price">{pricePrefix}{formatRub(price)}</p>
        )}
        {displayGroup && displayGroup.count > 1 && (
          <span className="variant-hint">{formatGroupHint(displayGroup.count)}</span>
        )}
        {badgeLabel && <span className="badge">{badgeLabel}</span>}
      </div>
    </Link>
  )
}
