import Link from "next/link"
import { formatRub } from "@/lib/format"
import { resolveCatalogCardPrice } from "@/lib/catalog-card-price"
import type { DisplayGroup } from "@/lib/display-group"
import { formatGroupHint } from "@/lib/display-group"
import {
  getCollectionLabel,
  getSubcollectionLabel,
  getArticle,
  getDimensions,
  formatDimensionsCompactLabeled,
  getBuyerFacingProductTitle,
} from "@/lib/product-metadata"
import { OliverCardMediaSwitcher } from "@/components/oliver-card-media-switcher"
import { ProductCardMediaSwitcher } from "@/components/product-card-media-switcher"
import {
  buildIntraProductExecutionSelectors,
  collectSameExecutionExtraImageUrls,
  containCatalogCardExecutionSelectors,
  enrichCardColorVariantsWithCatalogExtras,
  finishLabelForProduct,
  hasPdpExecutionControls,
  isFabricFamilyOnlyUpholstery,
  isFabricFamilyUpholsteryKey,
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
import {
  resolveCatalogCardHeroSrc,
  resolveCatalogCardMediaBundle,
} from "@/lib/catalog-card-image"
import { productTypeBadgeLabels, pdpCopy } from "@/lib/woodright-copy"

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

  const cardPrice = resolveCatalogCardPrice(product as Record<string, unknown>, displayGroup)

  const collectionLabel = getCollectionLabel(product as Record<string, unknown>)
  const subcollectionLabel = getSubcollectionLabel(product as Record<string, unknown>)
  const article = getArticle(product as Record<string, unknown>)
  const dim = getDimensions(product as Record<string, unknown>)
  /* PASS A: never render axis-caption span (`В × Ш × Г, см`). Values only.
     Partial axes keep abbreviated labels inside `values` (e.g. `В 90 · Ш 120`). */
  const dimLabeled = dim != null ? formatDimensionsCompactLabeled(dim) : null
  const dimDisplay =
    dimLabeled && dimLabeled.values.length > 0 ? dimLabeled.values : null
  const dimAria =
    dimDisplay == null
      ? null
      : dimLabeled!.caption === "В × Ш × Г, см"
        ? `${dimDisplay}, ${dimLabeled!.caption}`
        : `${dimDisplay} ${dimLabeled!.caption}`

  const contextParts = [collectionLabel, subcollectionLabel, article].filter(Boolean)
  const contextLine = contextParts.length > 0 ? contextParts.join(" · ") : null

  const handle = product.handle ?? ""
  const isOliver = handle.startsWith("ol-")
  const productHref = `/product/${product.id}`
  const displayTitle =
    displayGroup && typeof product.title === "string" && product.title.trim()
      ? product.title.trim()
      : getBuyerFacingProductTitle(product as Record<string, unknown>)
  const thumbSrc = cardThumbnailSrc(product)
  const mainSrcForCard = thumbSrc ?? ""

  const displayGroupVariants = Array.isArray(product.display_group_color_variants)
    ? product.display_group_color_variants
    : undefined

  const intraProductSelectors = buildIntraProductExecutionSelectors(
    product as Record<string, unknown>,
    mainSrcForCard
  )
  const hasCanonicalSelectors = hasPdpExecutionControls(intraProductSelectors)
  const mergedSelectors: CardExecutionSelectors =
    displayGroupVariants && displayGroupVariants.length > 0
      ? isUpholsteredProduct(product as Record<string, unknown>)
        ? {
            ...intraProductSelectors,
            ...(intraProductSelectors.upholstery ||
            intraProductSelectors.separateFabricRows
              ? {}
              : { upholstery: displayGroupVariants }),
            confidence: hasCanonicalSelectors
              ? intraProductSelectors.confidence
              : "heuristic",
          }
        : {
            ...intraProductSelectors,
            ...(intraProductSelectors.finish
              ? {}
              : {
                  finish: displayGroupVariants,
                  finishLabel: finishLabelForProduct(
                    product as Record<string, unknown>
                  ),
                }),
            confidence: hasCanonicalSelectors
              ? intraProductSelectors.confidence
              : "heuristic",
          }
      : intraProductSelectors
  /* PASS A: keep first fabric-family execution for hero/gallery scoping only.
     Selector UI uses contained selectors (no vertical fabric-family rows). */
  const mediaFabricDefault =
    mergedSelectors.separateFabricRows?.[0] ??
    (isFabricFamilyOnlyUpholstery(mergedSelectors.upholstery)
      ? mergedSelectors.upholstery?.[0]
      : mergedSelectors.upholstery?.find((v) => isFabricFamilyUpholsteryKey(v.key))) ??
    (isFabricFamilyOnlyUpholstery(mergedSelectors.finish)
      ? mergedSelectors.finish?.[0]
      : mergedSelectors.finish?.find((v) => isFabricFamilyUpholsteryKey(v.key)))
  const executionSelectors = containCatalogCardExecutionSelectors(
    mergedSelectors,
    product as Record<string, unknown>
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
          activeUpholstery?.mainSrc,
          mediaFabricDefault?.mainSrc,
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
        : activeUpholstery != null
          ? activeUpholstery.extraSrcs
          : mediaFabricDefault != null
            ? mediaFabricDefault.extraSrcs
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
              mediaFabricDefault?.key ??
              null
          )
        : mergeUniqueExtraUrls(mainSrcForCard, [
            collectExtraProductImageUrls(productRecord, mainSrcForCard),
          ])

  const storefrontBundle = resolvePdpMediaBundle(mainSrc, extraSrcs)
  const bundled = resolveCatalogCardMediaBundle(
    storefrontBundle.mainSrc,
    storefrontBundle.extraSrcs,
    resolveStorefrontProductImageSrc
  )
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
      href={productHref}
      title={displayTitle}
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
      alt={displayTitle}
      priorityHero={priorityHero}
    />
  )

  return (
    <div className="card product-card">
      {mediaBlock}
      <div className="card-body">
      <Link href={productHref} className="card-link">
        <div className="card-text-stack">
          {(contextLine || (displayGroup && displayGroup.count > 1)) && (
            <div className="card-context-row">
              {contextLine && <span className="card-context">{contextLine}</span>}
              {displayGroup &&
                displayGroup.count > 1 &&
                !(displayGroup.memberChips && displayGroup.memberChips.length > 1) && (
                <span className="variant-hint">
                  {displayGroup.hint ?? formatGroupHint(displayGroup.count)}
                </span>
              )}
            </div>
          )}
          <h3>{displayTitle}</h3>
          {dimDisplay != null && (
            <span className="card-dimensions" aria-label={dimAria ?? undefined}>
              {dimDisplay}
            </span>
          )}
          <div className="card-price-row">
            {cardPrice.requestQuoteLabel != null ? (
              <p className="price">{cardPrice.requestQuoteLabel}</p>
            ) : cardPrice.amount != null ? (
              <p className="price">{cardPrice.prefix}{formatRub(cardPrice.amount)}</p>
            ) : null}
            {badgeLabel && <span className="badge">{badgeLabel}</span>}
          </div>
        </div>
      </Link>
      {displayGroup?.memberChips && displayGroup.memberChips.length > 1 && (
        <div
          className="product-card-member-chips"
          role="group"
          aria-label={
            displayGroup.axis === "execution"
              ? pdpCopy.fabricSelectorLabel
              : pdpCopy.sizeSelectorLabel
          }
        >
          {displayGroup.memberChips.map((chip) =>
            chip.isRepresentative ? (
              <span
                key={chip.id}
                className="product-card-member-chip is-active"
                aria-current="true"
              >
                {chip.label}
              </span>
            ) : (
              <Link
                key={chip.id}
                href={chip.href}
                className="product-card-member-chip"
              >
                {chip.label}
              </Link>
            )
          )}
        </div>
      )}
      </div>
    </div>
  )
}
