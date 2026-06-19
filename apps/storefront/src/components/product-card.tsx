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
  buildIntraProductExecutionSelectors,
  finishLabelForProduct,
  isUpholsteredProduct,
  type CardColorVariant,
  type CardExecutionSelectors,
} from "@/lib/card-color-media"
import {
  defaultGreenwichBedSelection,
  resolveGreenwichBedMedia,
} from "@/lib/greenwich-bed-media"
import {
  collectExtraProductImageUrls,
  mergeUniqueExtraUrls,
  normalizeImageEntryUrl,
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
  /** UI-only: per-member color variants from display_group (listing). */
  display_group_color_variants?: CardColorVariant[]
}

const BADGE_LABELS: Record<string, string> = {
  BESPOKE: "На заказ",
}

function cardThumbnailSrc(product: Product): string | null {
  const t = product.thumbnail
  if (typeof t === "string") {
    const s = t.trim()
    if (s.length > 0) return s
  }
  const images = product.images
  if (Array.isArray(images) && images.length > 0) {
    const u = normalizeImageEntryUrl(images[0])
    if (u) return u
  }
  return null
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

  const displayGroupVariants = Array.isArray(product.display_group_color_variants)
    ? product.display_group_color_variants
    : undefined

  const executionSelectors: CardExecutionSelectors =
    displayGroupVariants && displayGroupVariants.length > 0
      ? isUpholsteredProduct(product as Record<string, unknown>)
        ? {
            upholstery: displayGroupVariants,
            confidence: "heuristic",
          }
        : {
            finish: displayGroupVariants,
            finishLabel: finishLabelForProduct(
              product as Record<string, unknown>
            ),
            confidence: "heuristic",
          }
      : buildIntraProductExecutionSelectors(
          product as Record<string, unknown>,
          mainSrcForCard
        )

  const headboardVariants = executionSelectors.headboard
  const upholsteryVariants = executionSelectors.upholstery
  const woodVariants = executionSelectors.wood
  const finishVariants = executionSelectors.finish
  const finishLabel = executionSelectors.finishLabel ?? "Цвет"
  const greenwichBedMatrix = executionSelectors.greenwichBedMatrix

  const defaults =
    greenwichBedMatrix && greenwichBedMatrix.length > 0
      ? defaultGreenwichBedSelection(greenwichBedMatrix)
      : null
  const matrixMedia =
    defaults && greenwichBedMatrix
      ? resolveGreenwichBedMedia(
          greenwichBedMatrix,
          defaults.headboard,
          defaults.frameMaterial,
          defaults.fabric
        )
      : null

  const activeHeadboard = headboardVariants?.[0]
  const activeUpholstery = upholsteryVariants?.[0]
  const activeWood = woodVariants?.[0]
  const activeFinish = finishVariants?.[0]

  const mainSrc = matrixMedia?.mainSrc
    ? matrixMedia.mainSrc
    : activeHeadboard?.mainSrc ??
      activeUpholstery?.mainSrc ??
      activeWood?.mainSrc ??
      activeFinish?.mainSrc ??
      mainSrcForCard
  const extraSrcs = matrixMedia
    ? matrixMedia.extraSrcs
    : activeHeadboard != null
      ? activeHeadboard.extraSrcs
      : activeUpholstery != null
        ? activeUpholstery.extraSrcs
        : activeWood != null
          ? activeWood.extraSrcs
          : activeFinish != null
            ? activeFinish.extraSrcs
            : mergeUniqueExtraUrls(mainSrcForCard, [
                collectExtraProductImageUrls(
                  product as Record<string, unknown>,
                  mainSrcForCard
                ),
              ])

  const mediaBlock = isOliver ? (
    <OliverCardMediaSwitcher
      mainSrc={mainSrc}
      extraSrcs={extraSrcs}
      headboardVariants={headboardVariants}
      upholsteryVariants={upholsteryVariants}
      woodVariants={woodVariants}
      finishVariants={finishVariants}
      finishLabel={finishLabel}
      href={productHref}
      title={product.title}
    />
  ) : (
    <ProductCardMediaSwitcher
      mainSrc={mainSrc}
      extraSrcs={extraSrcs}
      headboardVariants={headboardVariants}
      upholsteryVariants={upholsteryVariants}
      woodVariants={woodVariants}
      finishVariants={finishVariants}
      finishLabel={finishLabel}
      greenwichBedMatrix={greenwichBedMatrix}
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
