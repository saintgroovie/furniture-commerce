import Link from "next/link"
import type { MotifProductCard } from "@/lib/api/motif-themes"
import { formatRub } from "@/lib/format"
import { resolveStorefrontProductImageSrc } from "@/lib/product-images"
import { willieWinkieMotifsCopy } from "@/lib/woodright-copy"

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

  return (
    <article className="ww-product-card">
      <Link href={href} className="ww-product-card-link">
        <span className="ww-product-card-well">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt="" loading="lazy" decoding="async" />
          ) : (
            <span className="ww-product-card-empty">
              {willieWinkieMotifsCopy.imageMissing}
            </span>
          )}
        </span>
        <span className="ww-product-card-body">
          {product.family_title &&
          product.family_title.trim() !== product.title.trim() ? (
            <span className="ww-product-card-family">{product.family_title}</span>
          ) : null}
          <h3 className="ww-product-card-title">{product.title}</h3>
          <span
            className={
              product.price_amount != null
                ? "ww-product-card-price"
                : "ww-product-card-price ww-product-card-price--soft"
            }
          >
            {product.price_amount != null
              ? formatRub(product.price_amount)
              : willieWinkieMotifsCopy.priceUnavailable}
          </span>
        </span>
      </Link>
    </article>
  )
}
