import Link from "next/link"
import { formatRub, getPrice } from "@/lib/format"
import {
  formatRequestQuotePriceLabel,
  isRequestQuoteProduct,
} from "@/lib/request-quote"
import type { DisplayGroup } from "@/lib/display-group"
import {
  getDimensions,
  formatDimensionsCompact,
} from "@/lib/product-metadata"
import { OliverCardMediaSwitcher } from "@/components/oliver-card-media-switcher"
import { ProductCardMediaSwitcher } from "@/components/product-card-media-switcher"
import {
  buildIntraProductExecutionSelectors,
  collectSameExecutionExtraImageUrls,
  enrichCardColorVariantsWithCatalogExtras,
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
  defaultGreenwichPaintSelection,
  resolveGreenwichPaintMedia,
} from "@/lib/greenwich-paint-media"
import {
  collectExtraProductImageUrls,
  mergeUniqueExtraUrls,
  normalizeImageEntryUrl,
  resolveCardHeroAndNearDuplicateExtras,
  resolvePdpMediaBundle,
  resolveStorefrontProductImageSrc,
} from "@/lib/product-images"
import { resolveCatalogCardHeroSrc } from "@/lib/catalog-card-image"
import { productTypeBadgeLabels } from "@/lib/woodright-copy"

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

const BADGE_LABELS = productTypeBadgeLabels

function cardThumbnailSrc(product: Product): string | null {
  const t = product.thumbnail
  if (typeof t === "string") {
    const s = t.trim()
    if (s.length > 0) {
      return resolveCatalogCardHeroSrc(s, resolveStorefrontProductImageSrc)
    }
  }
  const images = product.images
  if (Array.isArray(images) && images.length > 0) {
    const u = normalizeImageEntryUrl(images[0])
    if (u) {
      return resolveCatalogCardHeroSrc(u, resolveStorefrontProductImageSrc)
    }
  }
  return null
}

export function ProductCard({
  product,
  displayGroup,
  priorityHero = false,
}: {
  product: Product
  displayGroup?: DisplayGroup
  /** PERF-08: first above-fold card in the grid. */
  priorityHero?: boolean
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

  const dim = getDimensions(product as Record<string, unknown>)

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

  const productRecord = product as Record<string, unknown>
  const headboardVariants = executionSelectors.headboard
  const upholsteryVariants = enrichCardColorVariantsWithCatalogExtras(
    executionSelectors.upholstery,
    productRecord
  )
  const woodVariants = enrichCardColorVariantsWithCatalogExtras(
    executionSelectors.wood,
    productRecord
  )
  const finishVariants = enrichCardColorVariantsWithCatalogExtras(
    executionSelectors.finish,
    productRecord
  )
  const finishLabel = executionSelectors.finishLabel ?? "Цвет"
  const greenwichBedMatrix = executionSelectors.greenwichBedMatrix
  const greenwichPaintMatrix = executionSelectors.greenwichPaintMatrix

  const bedDefaults =
    greenwichBedMatrix && greenwichBedMatrix.length > 0
      ? defaultGreenwichBedSelection(greenwichBedMatrix)
      : null
  const paintDefaults =
    greenwichPaintMatrix && greenwichPaintMatrix.length > 0
      ? defaultGreenwichPaintSelection(greenwichPaintMatrix)
      : null
  const matrixMedia =
    bedDefaults && greenwichBedMatrix
      ? resolveGreenwichBedMedia(
          greenwichBedMatrix,
          bedDefaults.headboard,
          bedDefaults.frameMaterial,
          bedDefaults.fabric
        )
      : paintDefaults && greenwichPaintMatrix
        ? resolveGreenwichPaintMedia(
            greenwichPaintMatrix,
            paintDefaults.frameMaterial,
            paintDefaults.paintFinish
          )
        : null

  const separateFabricRows = executionSelectors.separateFabricRows
  const activeSeparateFabric = separateFabricRows?.[0]
  const activeHeadboard = headboardVariants?.[0]
  const activeUpholstery = upholsteryVariants?.[0]
  const activeWood = woodVariants?.[0]
  const activeFinish = finishVariants?.[0]
  const isProvencePaintWood = executionSelectors.provencePaintWood === true

  const pickMain = (...candidates: Array<string | null | undefined>) => {
    for (const c of candidates) {
      const t = typeof c === "string" ? c.trim() : ""
      if (t) return t
    }
    return ""
  }
  const mainSrc = matrixMedia?.mainSrc
    ? matrixMedia.mainSrc
    : isProvencePaintWood
      ? mainSrcForCard
      : pickMain(
          activeHeadboard?.mainSrc,
          activeSeparateFabric?.mainSrc,
          activeUpholstery?.mainSrc,
          activeWood?.mainSrc,
          activeFinish?.mainSrc,
          mainSrcForCard
        )
  /* Prefer execution/matrix extras. Catalog projection often keeps urls:[main] only —
     then fill same-token siblings from product.images (never other finishes). */
  const scopedExecutionExtras = matrixMedia
    ? matrixMedia.extraSrcs
    : isProvencePaintWood && activeFinish != null
      ? activeFinish.extraSrcs
      : activeHeadboard != null
        ? activeHeadboard.extraSrcs
        : activeSeparateFabric != null
          ? activeSeparateFabric.extraSrcs
          : activeUpholstery != null
            ? activeUpholstery.extraSrcs
            : activeWood != null
              ? activeWood.extraSrcs
              : activeFinish != null
                ? activeFinish.extraSrcs
                : null
  const extraSrcs =
    scopedExecutionExtras != null && scopedExecutionExtras.length > 0
      ? scopedExecutionExtras
      : scopedExecutionExtras != null
        ? collectSameExecutionExtraImageUrls(
            productRecord,
            mainSrc,
            activeFinish?.key ??
              activeUpholstery?.key ??
              activeSeparateFabric?.key ??
              null
          )
        : mergeUniqueExtraUrls(mainSrcForCard, [
            collectExtraProductImageUrls(productRecord, mainSrcForCard),
          ])

  const bundled = resolvePdpMediaBundle(mainSrc, extraSrcs)
  const { mainSrc: cardMainSrc, extraSrcs: cardExtraSrcs } =
    resolveCardHeroAndNearDuplicateExtras(
      bundled.mainSrc,
      bundled.extraSrcs,
      handle
    )

  const mediaBlock = isOliver ? (
    <OliverCardMediaSwitcher
      mainSrc={cardMainSrc}
      extraSrcs={cardExtraSrcs}
      headboardVariants={headboardVariants}
      upholsteryVariants={upholsteryVariants}
      woodVariants={woodVariants}
      finishVariants={finishVariants}
      finishLabel={finishLabel}
      separateFabricRows={separateFabricRows}
      href={productHref}
      title={product.title}
      priorityHero={priorityHero}
      productHandle={handle}
    />
  ) : (
    <ProductCardMediaSwitcher
      mainSrc={cardMainSrc}
      extraSrcs={cardExtraSrcs}
      headboardVariants={headboardVariants}
      upholsteryVariants={upholsteryVariants}
      woodVariants={woodVariants}
      finishVariants={finishVariants}
      finishLabel={finishLabel}
      productHandle={handle}
      greenwichBedMatrix={greenwichBedMatrix}
      greenwichPaintMatrix={greenwichPaintMatrix}
      href={productHref}
      alt={product.title}
      priorityHero={priorityHero}
    />
  )

  return (
    <div className="card product-card">
      {mediaBlock}
      <Link href={productHref} className="card-body card-link">
        <div className="card-text-stack">
          <h3>{product.title}</h3>
          {dim != null && (
            <span className="card-dimensions">{formatDimensionsCompact(dim)}</span>
          )}
          <div className="card-price-row">
            {requestQuotePrice != null ? (
              <p className="price">{requestQuotePrice}</p>
            ) : price != null ? (
              <p className="price">{pricePrefix}{formatRub(price)}</p>
            ) : null}
            {badgeLabel && <span className="badge">{badgeLabel}</span>}
          </div>
        </div>
      </Link>
    </div>
  )
}
