import Link from "next/link"
import type { MotifProductCard } from "@/lib/api/motif-themes"
import { formatRub } from "@/lib/format"
import { resolveStorefrontProductImageSrc } from "@/lib/product-images"
import { willieWinkieMotifsCopy } from "@/lib/woodright-copy"
import { presentBuyerTitleParts } from "@/lib/product-title-presentation"

export function WillieWinkieMotifProductCard({
  product,
  motifSlug,
}: {
  product: MotifProductCard
  motifSlug: string
}) {
  const href = `/product/${encodeURIComponent(product.handle)}?motif=${encodeURIComponent(motifSlug)}`
  const img = product.thumbnail
    ? resolveStorefrontProductImageSrc(product.thumbnail)
    : null
  const presented = presentBuyerTitleParts({ title: product.title, handle: product.handle })
  const title = presented.base_title
  const familyTitle = product.family_title
    ? presentBuyerTitleParts({ title: product.family_title }).base_title
    : null

  return (
    <article className="ww-product-card">
      <Link href={href} className="ww-product-card-link">
        <span className="ww-product-card-well">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={img}
              alt={title}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span className="ww-product-card-empty">
              {willieWinkieMotifsCopy.imageMissing}
            </span>
          )}
        </span>
        <span className="ww-product-card-body">
          {familyTitle && familyTitle !== title ? (
            <span className="ww-product-card-family">{familyTitle}</span>
          ) : null}
          <h3 className="ww-product-card-title">{title}</h3>
          {presented.caption ? <span className="ww-product-card-choice">{presented.caption}</span> : null}
          <span
            className={
              product.price_amount != null
                ? "ww-product-card-price"
                : "ww-product-card-price ww-product-card-price--soft"
            }
          >
            {product.price_label ?? (product.price_amount != null
              ? `${product.price_prefix ?? ""}${formatRub(product.price_amount)}`
              : willieWinkieMotifsCopy.priceUnavailable)}
          </span>
        </span>
      </Link>
    </article>
  )
}
