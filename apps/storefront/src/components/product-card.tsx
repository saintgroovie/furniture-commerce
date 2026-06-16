import Link from "next/link"
import { formatRub, getPrice } from "@/lib/format"
import {
  formatRequestQuotePriceLabel,
  isRequestQuoteProduct,
} from "@/lib/request-quote"
import type { DisplayGroup } from "@/lib/display-group"
import { formatGroupHint } from "@/lib/display-group"
import {
  getCollectionLabel,
  getSubcollectionLabel,
  getArticle,
  getDimensions,
  formatDimensionsCompact,
} from "@/lib/product-metadata"
import { OliverCardMediaSwitcher } from "@/components/oliver-card-media-switcher"
import { ProductCardMediaSwitcher } from "@/components/product-card-media-switcher"
import {
  collectExtraProductImageUrls,
  mergeUniqueExtraUrls,
} from "@/lib/product-images"

type Product = {
  id: string
  title: string
  description?: string
  handle?: string
  thumbnail?: string
  images?: unknown[]
  metadata?: Record<string, unknown>
  variants?: Array<{
    id?: string
    sku?: string
    calculated_price?: { calculated_amount?: number }
    prices?: Array<{ amount?: number }>
  }>
  product_classification?: { product_type?: string }
  /** UI-only: merged gallery URLs from display_group members (listing). */
  display_group_extra_image_urls?: string[]
}

const BADGE_LABELS: Record<string, string> = {
  BESPOKE: "На заказ",
}

function cardThumbnailSrc(product: Product): string | null {
  const t = product.thumbnail
  if (typeof t !== "string") return null
  const s = t.trim()
  return s.length > 0 ? s : null
}

export function ProductCard({
  product,
  displayGroup,
}: {
  product: Product
  displayGroup?: DisplayGroup
}) {
  const type =
    product.product_classification?.product_type ??
    (product as { custom_product_type?: { product_type?: string } }).custom_product_type?.product_type
  const badgeLabel = type ? BADGE_LABELS[type] : undefined

  const price = displayGroup?.minPrice ?? getPrice(product)
  const pricePrefix = displayGroup ? "от " : ""
  const requestQuotePrice = isRequestQuoteProduct(product as Record<string, unknown>)
    ? formatRequestQuotePriceLabel(product as Record<string, unknown>)
    : null

  const collectionLabel = getCollectionLabel(product as Record<string, unknown>)
  const subcollectionLabel = getSubcollectionLabel(product as Record<string, unknown>)
  const article = getArticle(product as Record<string, unknown>)
  const dim = getDimensions(product as Record<string, unknown>)

  const contextParts = [collectionLabel, subcollectionLabel, article].filter(Boolean)
  const contextLine = contextParts.length > 0 ? contextParts.join(" · ") : null

  const handle = product.handle ?? ""
  const isOliver = handle.startsWith("ol-")
  const productHref = `/product/${product.id}`
  const thumbSrc = cardThumbnailSrc(product)
  const mainSrcForCard = thumbSrc ?? ""
  const groupExtras = Array.isArray(product.display_group_extra_image_urls)
    ? product.display_group_extra_image_urls
    : []
  const extraSrcs = mergeUniqueExtraUrls(mainSrcForCard, [
    collectExtraProductImageUrls(
      product as Record<string, unknown>,
      mainSrcForCard
    ),
    groupExtras,
  ])

  const mediaBlock = isOliver ? (
    <OliverCardMediaSwitcher
      mainSrc={mainSrcForCard}
      extraSrcs={extraSrcs}
      href={productHref}
      title={product.title}
    />
  ) : (
    <ProductCardMediaSwitcher
      mainSrc={mainSrcForCard}
      extraSrcs={extraSrcs}
      href={productHref}
      alt={product.title}
    />
  )

  return (
    <div className="card product-card">
      {mediaBlock}
      <Link href={productHref} className="card-body card-link">
        {contextLine && (
          <span className="card-context">{contextLine}</span>
        )}
        <h3>{product.title}</h3>
        {dim != null && (
          <span className="card-dimensions">{formatDimensionsCompact(dim)}</span>
        )}
        {requestQuotePrice != null ? (
          <p className="price">{requestQuotePrice}</p>
        ) : price != null ? (
          <p className="price">{pricePrefix}{formatRub(price)}</p>
        ) : null}
        {displayGroup && displayGroup.count > 1 && (
          <span className="variant-hint">{formatGroupHint(displayGroup.count)}</span>
        )}
        {badgeLabel && <span className="badge">{badgeLabel}</span>}
      </Link>
    </div>
  )
}
