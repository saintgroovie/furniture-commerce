import { PdpGreenwichBedJsonLd } from "@/components/pdp-greenwich-bed-json-ld"
import { greenwichBedJsonLdContext } from "@/lib/greenwich-bed-json-ld"
import Link from "next/link"
import { Fragment } from "react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { getSiteUrl } from "@/lib/api/base"
import { getCatalogProducts, getProduct, getProductCompatibility, NOT_FOUND } from "@/lib/api/products"
import { PdpCompatibility } from "@/components/pdp-compatibility"
import { getMotifContext } from "@/lib/api/motif-themes"
import {
  buyerDefaultConfiguration,
  formatRub,
  getPrice,
  pdpDisplayedPrice,
  pdpVariantPrice,
  priceOfVariant,
} from "@/lib/format"
import {
  buyerVariantAxis,
  resolveBuyerVariantId,
  variantChipTarget,
} from "@/lib/buyer-variant-axis"
import {
  resolveSparseVariantId,
  sparseAxisChoices,
  sparseVariantMap,
  withVariantCapabilities,
} from "@/lib/sparse-variant-map"
import { indexingCanonical } from "@/lib/indexing-policy"
import {
  buildBreadcrumbJsonLd,
  buildProductJsonLd,
  productCanonicalPath,
  jsonLdHtml,
  readUniformRubAmounts,
  singleOfferPriceRub,
  offerAvailabilityFromPurchase,
} from "@/lib/product-json-ld"
import { readProductPurchase } from "@/lib/woodright-order/purchase-contract"
import { supportsUpholsteryJsonLd } from "@/lib/product-upholstery-json-ld"
import { buildNativeVariantJsonLd } from "@/lib/native-variant-json-ld"
import { verifiedOliverFacadeConfigurations, oliverFacadeMaterialOptions, oliverFacadeVariantTarget, buildOliverFacadeJsonLd } from "@/lib/oliver-facade-json-ld"
import { PdpOliverFacadeJsonLd } from "@/components/pdp-oliver-facade-json-ld"
import { PdpUpholsteryJsonLd } from "@/components/pdp-upholstery-json-ld"
import {
  formatRequestQuotePriceLabel,
  isRequestQuoteProduct,
} from "@/lib/request-quote"
import { ProductCta } from "@/components/product-cta"
import { buildProvenceFinishJsonLd, verifiedProvenceFinishPrices } from "@/lib/provence-finish-json-ld"
import { PdpPriceBlock } from "@/components/pdp-price-block"
import { selectedBuyerVariantId } from "@/lib/opening-variant"
import {
  buildOliverDeskJsonLd, oliverDeskAxis, oliverDeskMedia,
  oliverDeskTextProduct, verifiedOliverDesk,
} from "@/lib/oliver-desk-variants"
import { resolveOriginalBasePriceOf } from "@/lib/sale-price"
import { PdpMaterialTierSelect } from "@/components/pdp-material-tier-select"
import { PdpSizeChips } from "@/components/pdp-size-chips"
import { PdpHingeSideSelect } from "@/components/pdp-hinge-side-select"
import { buildMaterialTierOptions } from "@/lib/material-tiers"
import {
  buildMaterialVariantJsonLd,
  buildSizeVariantJsonLd,
  materialOptionsForUrl,
  verifiedMaterialOptions,
} from "@/lib/product-variant-json-ld"
import { productHasHingeSideOption } from "@/lib/catalog-normalization"
import { CopyLines } from "@/components/copy-lines"
import { OliverPdpMediaSwitcher } from "@/components/oliver-pdp-media-switcher"
import { GreenwichBedPdpMediaSwitcher } from "@/components/greenwich-bed-pdp-media-switcher"
import { ProductPdpExecutionMediaSwitcher } from "@/components/product-pdp-execution-media-switcher"
import { PdpConfiguredPriceJsonLd } from "@/components/pdp-configured-price-json-ld"
import { PdpExecutionImageJsonLd } from "@/components/pdp-execution-image-json-ld"
import { configuredPriceJsonLdContext } from "@/lib/configured-price-json-ld"
import { OliverBedUpholsteryJsonLd } from "@/components/oliver-bed-upholstery-json-ld"
import { oliverBedUpholsteryJsonLdOptions } from "@/lib/oliver-bed-upholstery-json-ld"
import { ProductPdpMediaSwitcher } from "@/components/product-pdp-media-switcher"
import { PdpMotifSelector } from "@/components/pdp-motif-selector"
import { PdpRelatedInMotif } from "@/components/pdp-related-in-motif"
import {
  buildIntraProductExecutionSelectors,
  cardThumbnailSrcFromProduct,
  finishLabelForProduct,
  hasPdpExecutionControls,
} from "@/lib/card-color-media"
import {
  defaultGreenwichBedSelection,
  greenwichBedInteriorUrlsFromProduct,
  isGreenwichBedProduct,
  resolveGreenwichBedMedia,
} from "@/lib/greenwich-bed-media"
import {
  defaultGreenwichPaintSelection,
  resolveGreenwichPaintMedia,
} from "@/lib/greenwich-paint-media"
import {
  compactDisplayGroupChipLabels,
  displayGroupMemberLabel,
  displayGroupSelectorLabel,
  getDisplayGroupMembers,
  inferDisplayGroupAxis,
} from "@/lib/display-group"
import {
  collectDisplayGroupExtraImageUrls,
  collectExtraProductImageUrls,
  mergeUniqueExtraUrls,
  resolveCardHeroAndNearDuplicateExtras,
  resolvePdpMediaBundle,
  resolvePdpMediaSrc,
} from "@/lib/product-images"
import { collectProductImageUrls } from "@/lib/oliver-buyer-gallery"
import { restoreEvidenceProtectedAngles } from "@/lib/media-near-dup-collapse"
import { promoteClosedFrontHero } from "@/lib/catalog-closed-front-hero"
import { filterProvenceSceneOnlyPdpExtras } from "@/lib/provence-scene-only-pdp"
import { buildPdpBuyerFacingGallery } from "@/lib/pdp-buyer-gallery.server"
import {
  getCollectionLabel,
  getSubcollectionLabel,
  getBuyerFacingProductTitle,
  getBuyerFacingProductTitleLayout,
  getArticle,
  getDimensions,
  getMattressSize,
  getPdpMattressSize,
  getPdpHeroObjectPosition,
  pdpDimensionCells,
} from "@/lib/product-metadata"
import { withBuyerTitleProperties } from "@/lib/product-title-json-ld"
import {
  buildProductMetaDescription,
  getBuyerDescription,
  getProductSeoName,
  getSeoDescriptionSource,
} from "@/lib/product-seo"
import { formatRuInline } from "@/lib/format-ru-copy"
import {
  isPdpCollectionContextSentence,
  layoutPdpDescription,
  layoutPdpSubtitle,
} from "@/lib/pdp-copy-layout"
import { isKidsStorefrontProduct } from "@/lib/kids"
import { getCollectionFilterKey } from "@/lib/catalog-filters"
import { actions, labels, pdpCopy, productTypeBadgeLabels, willieWinkieMotifsCopy } from "@/lib/woodright-copy"
import { KidsProductSection } from "@/components/kids-product-section"

function pdpHeroThumbnail(product: Record<string, unknown>): string | undefined {
  const src = cardThumbnailSrcFromProduct(product)
  return src || undefined
}

/** OG / JSON-LD: same source as PDP hero (wardrobe closed front when `_main` is interior). */
function primaryImageForMeta(product: Record<string, unknown>): string | undefined {
  return pdpHeroThumbnail(product)
}

/** Short positioning line under the H1 — real Medusa `subtitle` only. */
function getPdpSubtitle(product: Record<string, unknown>): string | null {
  const s = product.subtitle
  return typeof s === "string" && s.trim() ? s.trim() : null
}

/** 1244 mm -> "124,4"; 630 mm -> "63" (ru decimal comma, buyer-facing cm). */
function mmToCmLabel(mm: number): string {
  const cm = mm / 10
  return Number.isInteger(cm) ? String(cm) : cm.toFixed(1).replace(".", ",")
}

const BADGE_LABELS = productTypeBadgeLabels

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const base = getSiteUrl()
  try {
    const res = await getProduct(id)
    const product = res.product as Record<string, unknown> | undefined
    if (!product) {
      notFound()
    }
    const canonicalPath = productCanonicalPath(product, id)
    const selfCanonical = indexingCanonical(`${base}${canonicalPath}`)
    const title = getProductSeoName(product)
    const desc = buildProductMetaDescription(product, {
      hasOptions: (buildMaterialTierOptions(product)?.length ?? 0) > 0,
      priceMode: isRequestQuoteProduct(product) ? "quote" : "price",
    })
    const imageUrl = primaryImageForMeta(product)
    return {
      title,
      description: desc,
      openGraph: {
        title,
        description: desc,
        url: canonicalPath,
        ...(imageUrl && { images: [imageUrl] }),
      },
      ...(selfCanonical ? { alternates: selfCanonical } : {}),
    }
  } catch (e) {
    if (e instanceof Error && e.message === NOT_FOUND) {
      notFound()
    }
    // Framework notFound() throws; rethrow. Operational failures must not become 404.
    throw e
  }
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  let product: Record<string, unknown> | null = null
  try {
    const res = await getProduct(id)
    product = res.product ?? null
  } catch (e) {
    if (e instanceof Error && e.message === NOT_FOUND) {
      notFound()
    }
    return (
      <div data-state="error" className="status-message">
        <h1>{pdpCopy.errorTitle}</h1>
        <CopyLines lines={pdpCopy.errorBody} />
        <div className="nav-links nav-links-center" style={{ marginTop: "1rem" }}>
          <Link href="/catalog">В каталог</Link>
        </div>
      </div>
    )
  }
  if (!product) {
    notFound()
  }

  const compatibility = product.id
    ? await getProductCompatibility(String(product.id))
    : { accessories: [], compatible_with: [] }

  const base = getSiteUrl()
  const handle = String(product.handle ?? "")
  const motifRaw = resolvedSearchParams?.motif
  const motifQuery =
    typeof motifRaw === "string"
      ? motifRaw.trim()
      : Array.isArray(motifRaw) && typeof motifRaw[0] === "string"
        ? motifRaw[0].trim()
        : ""

  let motifContext: Awaited<ReturnType<typeof getMotifContext>> = null
  if (handle) {
    try {
      motifContext = await getMotifContext({
        handle,
        motif: motifQuery || null,
      })
    } catch {
      motifContext = null
    }
  }

  if (
    motifContext?.motif_status === "redirect" &&
    motifContext.redirect_handle &&
    motifContext.selected_motif?.motif_slug
  ) {
    redirect(
      `/product/${encodeURIComponent(motifContext.redirect_handle)}?motif=${encodeURIComponent(motifContext.selected_motif.motif_slug)}`
    )
  }

  const sparseMap = sparseVariantMap(product)
  const oliverDesk = verifiedOliverDesk(product)
  const variantAxis = sparseMap ? null : buyerVariantAxis(product) ?? (oliverDesk ? oliverDeskAxis(oliverDesk) : null)
  const requestedVariant = resolvedSearchParams?.variant
  const requestedVariantId = Array.isArray(requestedVariant)
    ? requestedVariant[0]
    : requestedVariant
  const selectedVariantId =
    selectedBuyerVariantId(product as Record<string, unknown>, requestedVariantId) ??
    (sparseMap
      ? resolveSparseVariantId(sparseMap, undefined)
      : resolveBuyerVariantId(variantAxis, undefined))
  const selectedVariant =
    selectedVariantId == null
      ? null
      : ((product.variants as Array<Record<string, unknown>> | undefined) ?? []).find(
          (variant) => variant.id === selectedVariantId
        ) ?? null
  const viewProduct = withVariantCapabilities(product, selectedVariant) as Record<string, unknown>
  const provencePrices = verifiedProvenceFinishPrices(product)
  const initialProvenceFinish = provencePrices && resolvedSearchParams?.finish === "wood" ? "wood" : "cream"

  const isOliver = handle.startsWith("ol-")
  const isGreenwichBed = isGreenwichBedProduct(viewProduct)
  const thumbSrc = cardThumbnailSrcFromProduct(viewProduct)
  const executionSelectors = buildIntraProductExecutionSelectors(viewProduct, thumbSrc)
  const greenwichBedMatrix = executionSelectors.greenwichBedMatrix
  const greenwichPaintMatrix = executionSelectors.greenwichPaintMatrix
  const bedInteriorSrcs = isGreenwichBed
    ? greenwichBedInteriorUrlsFromProduct(viewProduct)
    : []
  const bedDefaults =
    greenwichBedMatrix && greenwichBedMatrix.length > 0
      ? defaultGreenwichBedSelection(greenwichBedMatrix)
      : null
  const paintDefaults =
    greenwichPaintMatrix && greenwichPaintMatrix.length > 0
      ? defaultGreenwichPaintSelection(greenwichPaintMatrix)
      : null
  const bedMatrixMedia =
    bedDefaults && greenwichBedMatrix
      ? resolveGreenwichBedMedia(
          greenwichBedMatrix,
          bedDefaults.headboard,
          bedDefaults.frameMaterial,
          bedDefaults.fabric,
          bedInteriorSrcs.length > 0 ? { interiorUrls: bedInteriorSrcs } : undefined
        )
      : null
  const paintMatrixMedia =
    paintDefaults && greenwichPaintMatrix
      ? resolveGreenwichPaintMedia(
          greenwichPaintMatrix,
          paintDefaults.frameMaterial,
          paintDefaults.paintFinish
        )
      : null

  const executionPdpMedia = (() => {
    if (bedMatrixMedia) return bedMatrixMedia
    if (paintMatrixMedia) return paintMatrixMedia
    if (!hasPdpExecutionControls(executionSelectors)) return null
    const headboardVariants = executionSelectors.headboard
    const upholsteryVariants = executionSelectors.upholstery
    const woodVariants = executionSelectors.wood
    const finishVariants = executionSelectors.finish
    const separateFabricRows = executionSelectors.separateFabricRows
    const activeSeparateFabric = separateFabricRows?.[0]
    const activeHeadboard = headboardVariants?.[0]
    const activeUpholstery = upholsteryVariants?.[0]
    const activeWood = woodVariants?.[0]
    const activeFinish = initialProvenceFinish === "wood" && executionSelectors.provencePaintWood ? undefined : finishVariants?.[0]
    const provencePaintWood = executionSelectors.provencePaintWood === true
    const mainSrc = provencePaintWood
      ? (activeFinish?.mainSrc ?? activeWood?.mainSrc ?? thumbSrc)
      : (activeHeadboard?.mainSrc ??
        activeSeparateFabric?.mainSrc ??
        activeUpholstery?.mainSrc ??
        activeWood?.mainSrc ??
        activeFinish?.mainSrc ??
        thumbSrc)
    const extraSrcs =
      activeHeadboard != null
        ? activeHeadboard.extraSrcs
        : provencePaintWood
          ? (activeFinish?.extraSrcs ?? activeWood?.extraSrcs ?? [])
          : activeSeparateFabric != null
            ? activeSeparateFabric.extraSrcs
            : activeUpholstery != null
            ? activeUpholstery.extraSrcs
            : activeWood != null
              ? activeWood.extraSrcs
              : activeFinish != null
                ? activeFinish.extraSrcs
                : mergeUniqueExtraUrls(thumbSrc, [
                    collectExtraProductImageUrls(viewProduct, thumbSrc),
                  ])
    return { mainSrc, extraSrcs }
  })()

  const useExecutionPdp =
    isGreenwichBed || hasPdpExecutionControls(executionSelectors)
  const price = pdpVariantPrice(product, selectedVariant)
  /* Material execution options from metadata.material_tiers (backend SoT). */
  const defaultMaterialTiers = buildMaterialTierOptions(viewProduct, price)
  const oliverFacade = verifiedOliverFacadeConfigurations(product)
  const addressableMaterialTiers = oliverFacadeMaterialOptions(oliverFacade, selectedVariantId) ?? oliverDesk?.materials ?? verifiedMaterialOptions(product, defaultMaterialTiers)
  const materialTiers = addressableMaterialTiers
    ? materialOptionsForUrl(addressableMaterialTiers, resolvedSearchParams?.material)
    : defaultMaterialTiers
  const opening = buyerDefaultConfiguration(product)
  const tierPrice =
    materialTiers?.[0]?.price != null && Number.isFinite(materialTiers[0].price)
      ? materialTiers[0].price
      : null
  /* Opening amount follows the backend SKU, not variants[0]. An unpriced selection stays empty. */
  const openingPrice = (provencePrices ? provencePrices[initialProvenceFinish] : null) ?? (addressableMaterialTiers ? tierPrice : null) ?? pdpDisplayedPrice({
    selectedVariantId:
      selectedVariant && typeof selectedVariant.id === "string" ? selectedVariant.id : null,
    selectedOwnPrice: price,
    openingVariantId: opening.variantId,
    openingConfiguredPrice: opening.minUnitPrice,
    selectedTierPrice: tierPrice,
  })
  const strikeVariant = ((): Record<string, unknown> | null => {
    if (selectedVariant) return selectedVariant
    const variants = product.variants as Array<Record<string, unknown>> | undefined
    if (opening.variantId) {
      return variants?.find((variant) => variant.id === opening.variantId) ?? null
    }
    return variants?.[0] ?? null
  })()
  const requestQuotePrice = isRequestQuoteProduct(product)
    ? formatRequestQuotePriceLabel(product)
    : null
  const productType = (product.product_classification as Record<string, string> | undefined)?.product_type
  const badgeLabel = productType ? BADGE_LABELS[productType] : undefined

  const meta = product.metadata as Record<string, unknown> | undefined
  let displayGroupMembers: Record<string, unknown>[] = []
  if (meta?.display_group) {
    try {
      // Lean browse projection keeps display_group* + collection + variant prices.
      // Avoid full `/store/products` list (~1.4MB) for sibling size chips only.
      const plist = await getCatalogProducts()
      const list = (plist.products ?? []) as Record<string, unknown>[]
      displayGroupMembers = getDisplayGroupMembers(product, list)
    } catch {
      /* ignore — PDP still usable */
    }
  }

  const selectedGallery = (selectedVariant?.metadata as Record<string, unknown> | undefined)?.gallery_urls
  const variantOwnedGallery = Array.isArray(selectedGallery) && selectedGallery.length > 0 &&
    selectedGallery.every((url): url is string => typeof url === "string" && url.trim().length > 0)
    ? { mainSrc: selectedGallery[0], extraSrcs: selectedGallery.slice(1) }
    : null

  // A merged SKU owns its approved angles. Legacy role slots can mistake two
  // different facades/handle sides for duplicate front views.
  const oliverBuyerGallery =
    isOliver && !useExecutionPdp && !bedMatrixMedia && !paintMatrixMedia
      ? variantOwnedGallery ?? buildPdpBuyerFacingGallery(viewProduct)
      : null

  const nativeVariantGallery = !useExecutionPdp ? variantOwnedGallery : null
  const mainImage =
    (nativeVariantGallery?.mainSrc ?? oliverBuyerGallery?.mainSrc ??
      executionPdpMedia?.mainSrc ??
      bedMatrixMedia?.mainSrc ??
      paintMatrixMedia?.mainSrc) ||
    pdpHeroThumbnail(viewProduct)
  const mainNorm = mainImage ?? ""
  const heroObjectPosition = getPdpHeroObjectPosition(product)
  const pdpExtraSrcs = nativeVariantGallery
    ? nativeVariantGallery.extraSrcs
    : oliverBuyerGallery
    ? oliverBuyerGallery.extraSrcs
    : executionPdpMedia
      ? executionPdpMedia.extraSrcs
      : bedMatrixMedia
        ? bedMatrixMedia.extraSrcs
        : paintMatrixMedia
          ? paintMatrixMedia.extraSrcs
          : collectDisplayGroupExtraImageUrls([viewProduct, ...displayGroupMembers], mainNorm)

  const { mainSrc: bundledMain, extraSrcs: bundledExtras } = resolvePdpMediaBundle(
    mainNorm,
    filterProvenceSceneOnlyPdpExtras(viewProduct, mainNorm, pdpExtraSrcs)
  )
  // Shared PDP boundary: restore evidence-protected angles, then drop true near-dups
  // (covers Oliver buyer gallery, execution selectors, and plain collect paths).
  const restoredOrder = promoteClosedFrontHero(
    viewProduct,
    restoreEvidenceProtectedAngles(
      handle,
      [bundledMain, ...bundledExtras],
      collectProductImageUrls(viewProduct)
    )
  )
  const evidenced = resolveCardHeroAndNearDuplicateExtras(
    restoredOrder[0] ?? bundledMain,
    restoredOrder.slice(1),
    handle
  )
  // Normalize again so restored raw pool URLs get `/product-static/…` rewrite.
  const resolvedMedia = resolvePdpMediaBundle(evidenced.mainSrc, evidenced.extraSrcs)
  const { mainSrc: pdpMainSrc, extraSrcs: pdpResolvedExtras } = oliverDeskMedia(
    oliverDesk, selectedVariantId, resolvedMedia.mainSrc, resolvedMedia.extraSrcs
  )

  const titleLayout = getBuyerFacingProductTitleLayout(
    product,
    selectedVariant
      ? {
          title: typeof selectedVariant.title === "string" ? selectedVariant.title : null,
          metadata: (selectedVariant.metadata as Record<string, unknown> | null | undefined) ?? null,
          options: Array.isArray(selectedVariant.options) ? selectedVariant.options : undefined,
        }
      : null,
  )
  const titleStr = getBuyerFacingProductTitle(product)
  const collectionLabel = getCollectionLabel(product)
  const subcollectionLabel = getSubcollectionLabel(product)
  const article =
    selectedVariant && typeof selectedVariant.sku === "string"
      ? selectedVariant.sku
      : getArticle(product)
  const dim = getDimensions(product, selectedVariant)
  const textProduct = oliverDeskTextProduct(viewProduct, oliverDesk, selectedVariantId)
  const subtitle = getPdpSubtitle(textProduct)
  const description = getBuyerDescription(textProduct)

  /* Buyer-facing order is fixed: height → width → depth (cm hero + mm specs). */
  const dimensionLabelByAxis = {
    height: pdpCopy.dimensionHeight,
    width: pdpCopy.dimensionWidth,
    depth: pdpCopy.dimensionDepth,
  } as const
  const dimensionCells = dim
    ? pdpDimensionCells(dim).map((cell) => ({
        label: dimensionLabelByAxis[cell.axis],
        mm: cell.mm,
        values_mm: cell.values_mm,
        labels: cell.labels,
        note: cell.note,
      }))
    : []

  const mattress = selectedVariant
    ? getMattressSize(product, selectedVariant)
    : getPdpMattressSize(product)

  const specRows = [
    ...(mattress
      ? [
          {
            label: pdpCopy.mattressSize,
            value: formatRuInline(mattress.display),
            spec: "mattress-size",
          },
        ]
      : []),
    ...dimensionCells.map((c) => ({
      label: c.label,
      value: formatRuInline(
        c.values_mm
          ? `${c.values_mm.join(" / ")} ${pdpCopy.unitMm}${
              c.labels?.length
                ? ` - ${c.labels.join(" / ")}`
                : c.note
                  ? ` - ${c.note}`
                  : ""
            }`
          : `${c.mm} ${pdpCopy.unitMm}`
      ),
      spec: `dimension-${c.label}`,
    })),
    ...(article
      ? [{ label: pdpCopy.specArticle, value: article, spec: "article" }]
      : []),
    ...(collectionLabel
      ? [
          {
            label: pdpCopy.specCollection,
            value: [collectionLabel, subcollectionLabel].filter(Boolean).join(" · "),
            spec: "collection",
          },
        ]
      : []),
  ]

  /* Chip prices carry the base (full solid) amount; the client component
     applies the selected material multiplier so chips and the main price
     block never show conflicting numbers. */
  const displayGroupAxis = inferDisplayGroupAxis([
    product,
    ...displayGroupMembers,
  ])
  const handleForVariant = typeof product.handle === "string" ? product.handle : id
  const variants = (product.variants as Array<Record<string, unknown>> | undefined) ?? []
  const sparseChipRows =
    sparseMap && selectedVariantId
      ? sparseAxisChoices(sparseMap, selectedVariantId).map((row) => ({
          label: row.label,
          chips: row.choices.map((choice) => {
            const variant = variants.find((item) => item.id === choice.variantId) ?? null
            const basePrice = priceOfVariant(variant)
            return {
              id: oliverFacade
                ? oliverFacadeVariantTarget(oliverFacade, handleForVariant, choice.variantId, resolvedSearchParams)
                : variantChipTarget(handleForVariant, choice.variantId, resolvedSearchParams),
              label: choice.label,
              basePrice,
              materialTiers: buildMaterialTierOptions(
                withVariantCapabilities(product, variant),
                basePrice
              ),
              sort: choice.sort,
              isCurrent: choice.isCurrent,
            }
          }),
        }))
      : []
  const displayGroupChipsFull =
    displayGroupMembers.length > 0
      ? [
          {
            id: product.id as string,
            // Size labels come from the native title, independently of heading cleanup.
            label: displayGroupMemberLabel(product, displayGroupAxis),
            basePrice: price,
            sort: (meta?.display_group_sort as number | undefined) ?? 99,
            isCurrent: true,
          },
          ...displayGroupMembers.map((m) => {
            const mMeta = m.metadata as Record<string, unknown> | undefined
            return {
              id: m.id as string,
              href: productCanonicalPath(m, String(m.id ?? "")),
              label: displayGroupMemberLabel(m, displayGroupAxis),
              basePrice: getPrice(m),
              sort: (mMeta?.display_group_sort as number | undefined) ?? 99,
              isCurrent: false,
            }
          }),
        ].sort((a, b) => a.sort - b.sort)
      : []
  const compactChipLabels =
    displayGroupAxis === "size"
      ? compactDisplayGroupChipLabels(displayGroupChipsFull.map((c) => c.label))
      : null
  const displayGroupChips = compactChipLabels
    ? displayGroupChipsFull.map((c, i) => ({ ...c, label: compactChipLabels[i]! }))
    : displayGroupChipsFull
  const sizeChips =
    sparseMap
      ? []
      : variantAxis && selectedVariantId
      ? variantAxis.choices.map((choice) => {
          const variant = (
            (product.variants as Array<Record<string, unknown>> | undefined) ?? []
          ).find((item) => item.id === choice.id)
          return {
            id: variantChipTarget(handleForVariant, choice.id, resolvedSearchParams),
            label: choice.label,
            basePrice: priceOfVariant(variant),
            sort: choice.sort,
            isCurrent: choice.id === selectedVariantId,
          }
        })
      : displayGroupChips
  const displayGroupSelector = variantAxis
    ? variantAxis.label
    : displayGroupSelectorLabel(displayGroupAxis)

  const isKidsProduct = isKidsStorefrontProduct(product)
  const collectionFilterKey = getCollectionFilterKey(product)
  const catalogHref = isKidsProduct ? "/kids/catalog" : "/catalog"
  const collectionHref = collectionFilterKey
    ? `${catalogHref}?collection=${encodeURIComponent(collectionFilterKey)}`
    : null

  const canonicalPath = productCanonicalPath(product, id)
  const canonicalUrl = `${base}${canonicalPath}`
  const offerPriceRub = singleOfferPriceRub({
    productType,
    requestQuote: isRequestQuoteProduct(product),
    materialTierCount: materialTiers?.length ?? 0,
    displayGroupCount: displayGroupMembers.length,
    variantAmounts: readUniformRubAmounts(product),
    displayedPriceRub: openingPrice,
  })
  const scalarProductJsonLd = withBuyerTitleProperties(buildProductJsonLd({
    name: getBuyerFacingProductTitle(product) || "Товар",
    description: getSeoDescriptionSource(textProduct),
    material: typeof (product.metadata as Record<string, unknown> | undefined)?.material === "string"
      ? (product.metadata as Record<string, unknown>).material as string : null,
    url: canonicalUrl,
    images: [pdpMainSrc, ...pdpResolvedExtras],
    dimensions: dim ? pdpDimensionCells(dim) : [],
    sku: article,
    offerPriceRub,
    offerAvailability: offerAvailabilityFromPurchase(readProductPurchase(product)),
  }), titleLayout.attributes)
  const sizeVariantInput = {
    product, siblings: displayGroupMembers, jsonLd: scalarProductJsonLd,
    displayedPriceRub: openingPrice, requestQuote: isRequestQuoteProduct(product),
  }
  let sizeVariantJsonLd = buildSizeVariantJsonLd(sizeVariantInput)
  if (sizeVariantJsonLd && scalarProductJsonLd.description && displayGroupMembers.length <= 4 &&
      !(sizeVariantJsonLd.isVariantOf as Record<string, unknown>)?.description) {
    // Browse DTOs intentionally omit prose. Read only this verified size
    // family's full PDPs, never the full catalog, and keep failures unshared.
    const sources = await Promise.all(displayGroupMembers.map(async (member) => {
      if (typeof member.id !== "string") return null
      try { return (await getProduct(member.id)).product as Record<string, unknown> }
      catch { return null }
    }))
    sizeVariantJsonLd = buildSizeVariantJsonLd({
      ...sizeVariantInput, descriptionMembers: [product, ...sources],
    })
  }
  const productJsonLd =
    (executionSelectors.provencePaintWood && buildProvenceFinishJsonLd(product, scalarProductJsonLd, [
      ...(executionSelectors.finish ?? []), ...(executionSelectors.wood ?? []),
    ])) ||
    buildOliverDeskJsonLd(product, oliverDesk, scalarProductJsonLd) ||
    buildOliverFacadeJsonLd(product, oliverFacade, scalarProductJsonLd) ||
    (addressableMaterialTiers && buildMaterialVariantJsonLd({
      product, options: addressableMaterialTiers, jsonLd: scalarProductJsonLd,
      requestQuote: isRequestQuoteProduct(product),
    })) ||
    sizeVariantJsonLd ||
    (!sparseMap && !useExecutionPdp && !materialTiers?.length && !displayGroupMembers.length &&
      buildNativeVariantJsonLd({
        product, jsonLd: scalarProductJsonLd, selectedVariantId, displayedPriceRub: openingPrice,
        axis: variantAxis,
        commonImages: (nativeVariantGallery
          ? collectProductImageUrls(product).map(resolvePdpMediaSrc)
          : [pdpMainSrc, ...pdpResolvedExtras]).filter(Boolean),
      })) || scalarProductJsonLd
  const sizeFamily = sizeVariantJsonLd?.isVariantOf as
    | { productGroupID?: string; description?: string }
    | undefined
  const visibleFamilyDescription =
    typeof sizeFamily?.description === "string" &&
    (sizeFamily.productGroupID === "ol-bed-15-16" ||
      sizeFamily.productGroupID === "ol-bed-15-16-open")
      ? sizeFamily.description
      : null
  const breadcrumbJsonLd = buildBreadcrumbJsonLd(base, [
    ...(isKidsProduct ? [{ name: "Детская", path: "/kids" }] : []),
    { name: "Каталог", path: catalogHref },
    ...(collectionLabel && collectionHref
      ? [{ name: collectionLabel, path: collectionHref }]
      : []),
    { name: titleStr || "Товар", path: canonicalPath },
  ])
  const oliverUpholsteryOptions = oliverBedUpholsteryJsonLdOptions(product, executionSelectors)

  const upholsteryJsonLdOptions = supportsUpholsteryJsonLd(product, executionSelectors)
    ? executionSelectors.upholstery!.map((option) => {
        // Same evidence-based gallery collapse as ProductCardMediaGalleryCore.
        const media = resolveCardHeroAndNearDuplicateExtras(option.mainSrc, option.extraSrcs, handle)
        const normalized = resolvePdpMediaBundle(media.mainSrc, media.extraSrcs)
        return { label: option.label, images: [normalized.mainSrc, ...normalized.extraSrcs] }
      })
    : null

  const configuredPriceContext = configuredPriceJsonLdContext({ product, selectors: executionSelectors, basePrice: price, materialTiers })

  const greenwichBedContext = greenwichBedJsonLdContext({ product: viewProduct, selectedVariant, selectors: executionSelectors, displayedPrice: openingPrice, materialTierCount: materialTiers?.length ?? 0, jsonLd: productJsonLd })

  const cspNonce = (await headers()).get("x-nonce") ?? undefined

  return (
    <div
      data-state="success"
      className="pdp"
      {...(isKidsProduct ? { "data-kids-product": "" } : {})}
    >
      <KidsProductSection active={isKidsProduct} />
      {isKidsProduct ? (
        <script
          nonce={cspNonce}
          dangerouslySetInnerHTML={{
            __html:
              "(function(){document.querySelectorAll('a.logo,a.footer-brand-logo').forEach(function(a){a.setAttribute('href','/kids');a.setAttribute('aria-label','Woodright Kids - на главную детской');});})();",
          }}
        />
      ) : null}
      {oliverFacade && selectedVariantId ? <PdpOliverFacadeJsonLd key={selectedVariantId}
        jsonLd={productJsonLd} variantId={selectedVariantId} productKey={handle}
        initialMaterialCode={materialTiers?.[0]?.code ?? oliverFacade.find(c => c.variantId === selectedVariantId)!.material.code} nonce={cspNonce}
      /> : greenwichBedContext ? <PdpGreenwichBedJsonLd key={selectedVariantId ?? handle} context={greenwichBedContext} nonce={cspNonce} /> : configuredPriceContext ? <PdpConfiguredPriceJsonLd
        key={handle}
        jsonLd={productJsonLd}
        context={configuredPriceContext}
        nonce={cspNonce}
      /> : upholsteryJsonLdOptions ? <PdpUpholsteryJsonLd
        key={handle}
        productKey={handle}
        options={upholsteryJsonLdOptions}
        jsonLd={productJsonLd}
        nonce={cspNonce}
      /> : oliverUpholsteryOptions ? <OliverBedUpholsteryJsonLd
        jsonLd={productJsonLd}
        productKey={handle}
        options={oliverUpholsteryOptions}
        nonce={cspNonce}
      /> : useExecutionPdp && productJsonLd["@type"] === "Product" ? <PdpExecutionImageJsonLd
        jsonLd={productJsonLd}
        productKey={handle}
        nonce={cspNonce}
      /> : <script
        type="application/ld+json"
        nonce={cspNonce}
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(productJsonLd) }}
      />}
      <script
        type="application/ld+json"
        nonce={cspNonce}
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(breadcrumbJsonLd) }}
      />

      {/* First screen: full-bleed media + sticky buy panel */}
      <section className="pdp-hero">
        <div className="pdp-hero-inner">
          <div className="pdp-media product-detail-media-col">
            {isGreenwichBed ? (
              <GreenwichBedPdpMediaSwitcher
                mainSrc={pdpMainSrc}
                extraSrcs={pdpResolvedExtras}
                headboardVariants={executionSelectors.headboard}
                upholsteryVariants={executionSelectors.upholstery}
                woodVariants={executionSelectors.wood}
                greenwichBedMatrix={greenwichBedMatrix}
                sharedInteriorSrcs={bedInteriorSrcs}
                title={titleStr}
                heroObjectPosition={heroObjectPosition}
                productHandle={handle}
              />
            ) : useExecutionPdp ? (
              <ProductPdpExecutionMediaSwitcher
                mainSrc={pdpMainSrc}
                extraSrcs={pdpResolvedExtras}
                headboardVariants={executionSelectors.headboard}
                upholsteryVariants={executionSelectors.upholstery}
                woodVariants={executionSelectors.wood}
                finishVariants={executionSelectors.finish}
                finishLabel={
                  executionSelectors.finishLabel ??
                  finishLabelForProduct(product)
                }
                greenwichPaintMatrix={greenwichPaintMatrix}
                title={titleStr}
                oliverMode={isOliver}
                separateFabricRows={executionSelectors.separateFabricRows}
                heroObjectPosition={heroObjectPosition}
                productHandle={handle}
                executionScopeKey={selectedVariantId ?? handle}
                initialProvenceFinish={initialProvenceFinish}
              />
            ) : isOliver ? (
              <OliverPdpMediaSwitcher
                mainSrc={pdpMainSrc}
                extraSrcs={pdpResolvedExtras}
                title={titleStr}
              />
            ) : (
              <ProductPdpMediaSwitcher
                mainSrc={pdpMainSrc}
                extraSrcs={pdpResolvedExtras}
                alt={titleStr}
                heroObjectPosition={heroObjectPosition}
              />
            )}
          </div>

          <div className="pdp-panel-col">
            <div className="pdp-panel">
              <nav className="pdp-breadcrumbs" aria-label="Навигация по разделам">
                {isKidsProduct && (
                  <>
                    <Link href="/kids">Детская</Link>
                    <span aria-hidden="true"> / </span>
                  </>
                )}
                <Link href={catalogHref}>Каталог</Link>
                {collectionLabel && collectionHref && (
                  <>
                    <span aria-hidden="true"> / </span>
                    {collectionHref ? (
                      <Link href={collectionHref}>{collectionLabel}</Link>
                    ) : (
                      <span>{collectionLabel}</span>
                    )}
                  </>
                )}
                <span aria-hidden="true"> / </span>
                <span aria-current="page">{titleStr}</span>
              </nav>

              {/* 1. Context: collection + article — secondary but present */}
              {(collectionLabel || subcollectionLabel || article) && (
                <div className="pdp-context-row">
                  {(collectionLabel || subcollectionLabel) && (
                    <span className="pdp-collection-label">
                      {[collectionLabel, subcollectionLabel].filter(Boolean).join(" · ")}
                    </span>
                  )}
                  {article && (
                    <span className="pdp-article">
                      {pdpCopy.articleLabel} {article}
                    </span>
                  )}
                </div>
              )}

              {/* 2. Title */}
              <div className="product-detail-header">
                <h1 className="pdp-title">
                  {titleLayout.lines.map((line, index) => (
                    <Fragment key={index}>
                      {index > 0 ? <> {"\n"}<br /></> : null}
                      {line}
                    </Fragment>
                  ))}
                </h1>
                {titleLayout.caption ? <p className="pdp-choice">{titleLayout.caption}</p> : null}
                {badgeLabel && <span className="badge">{badgeLabel}</span>}
              </div>
              {/* 3. Short positioning line (real `subtitle` field only).
                  Layout only: Woodright dashes + meaning breaks via CopyLines. */}
              {subtitle && (
                <CopyLines
                  className="pdp-subtitle"
                  lines={layoutPdpSubtitle(subtitle)}
                />
              )}

              {/* 4. Dimensions: height → width → depth */}
              {dimensionCells.length > 0 && (
                <dl className="pdp-dimensions-row">
                  {dimensionCells.map((c) => (
                    <div key={c.label} className="pdp-dimension-cell">
                      <dt>{c.label}</dt>
                      <dd>
                        {c.values_mm
                          ? c.values_mm.map((mm) => mmToCmLabel(mm)).join(" / ")
                          : mmToCmLabel(c.mm ?? 0)}
                        &nbsp;{pdpCopy.unitCm}
                        {c.labels?.length ? (
                          <span className="pdp-dimension-note">{c.labels.join(" / ")}</span>
                        ) : c.note ? (
                          <span className="pdp-dimension-note">{c.note}</span>
                        ) : null}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}

              {/* Motif selection (Willie Winkie) — before other configuration */}
              {motifContext &&
                (motifContext.motif_status === "unsupported" ||
                  motifContext.motif_status === "unknown") && (
                  <div className="pdp-motif-notice" role="status">
                    <p className="pdp-motif-notice-title">
                      {motifContext.motif_status === "unsupported"
                        ? willieWinkieMotifsCopy.motifUnavailableTitle
                        : willieWinkieMotifsCopy.motifUnknownTitle}
                    </p>
                    <p className="pdp-motif-notice-body">
                      {motifContext.motif_status === "unsupported"
                        ? willieWinkieMotifsCopy.motifUnavailableBody
                        : willieWinkieMotifsCopy.motifUnknownBody}
                    </p>
                  </div>
                )}
              {motifContext && motifContext.motif_options.length > 0 && (
                <PdpMotifSelector
                  options={motifContext.motif_options}
                  motifPagePath={motifContext.motif_page_path}
                />
              )}

              {/* 5. Configuration — material execution, then size + other
                  execution groups, all before price / CTA */}
              {materialTiers && (
                <PdpMaterialTierSelect
                  productKey={handle || (product.id as string)}
                  options={materialTiers}
                  defaultCode={(addressableMaterialTiers ?? defaultMaterialTiers)?.[0]?.code}
                  requestQuote={isRequestQuoteProduct(product)}
                />
              )}
              {sparseChipRows.map((row) => (
                <PdpSizeChips
                  key={row.label}
                  productKey={handle || (product.id as string)}
                  chips={row.chips}
                  materialTiers={materialTiers}
                  requestQuote={isRequestQuoteProduct(product)}
                  selectorLabel={row.label}
                  initialMaterialCode={oliverFacade && typeof resolvedSearchParams?.material === "string"
                    ? resolvedSearchParams.material : undefined}
                />
              ))}
              {sparseChipRows.length === 0 && sizeChips.length > 0 && (
                <PdpSizeChips
                  productKey={handle || (product.id as string)}
                  chips={sizeChips}
                  materialTiers={materialTiers}
                  preserveMaterialInHref={oliverDesk != null}
                  requestQuote={isRequestQuoteProduct(product)}
                  selectorLabel={displayGroupSelector}
                />
              )}
              {productHasHingeSideOption(viewProduct) && (
                <PdpHingeSideSelect
                  productKey={handle || (product.id as string)}
                />
              )}
              {/* Portal target for execution option groups (Дерево/Обивка/Цвет/…).
                  Always mounted so the media gallery core never renders into a
                  missing node; CSS collapses it when empty. */}
              <div id="pdp-color-options-slot" className="pdp-color-options-slot" />

              {/* 6. Price — after required options; gated when execution controls exist */}
              <PdpPriceBlock
                initialFinishKey={initialProvenceFinish}
                priceLabel={
                  requestQuotePrice != null
                    ? requestQuotePrice
                    : openingPrice != null
                      ? formatRub(openingPrice)
                      : isRequestQuoteProduct(product)
                        ? labels.requestQuotePrice
                        : null
                }
                basePrice={price}
                originalBasePrice={resolveOriginalBasePriceOf(strikeVariant)}
                requiresBuyerSelection={
                  useExecutionPdp &&
                  !isRequestQuoteProduct(product) &&
                  productType !== "BESPOKE"
                }
                productKey={handle || (product.id as string)}
                materialTiers={materialTiers}
                requestQuote={isRequestQuoteProduct(product)}
              />

              {/* 7. CTA */}
              <ProductCta
                initialFinishKey={provencePrices ? initialProvenceFinish : undefined}
                product={viewProduct}
                variantId={selectedVariantId ?? undefined}
                variantImage={oliverDesk || provencePrices ? pdpMainSrc : undefined}
                requiresBuyerSelection={
                  useExecutionPdp &&
                  !isRequestQuoteProduct(product) &&
                  productType !== "BESPOKE"
                }
                materialTiers={materialTiers}
              />

              {/* 8. Service block — real brand facts + real contact page only */}
              <div className="pdp-service-block">
                {pdpCopy.serviceLines.map((line) => (
                  <span className="pdp-service-line" key={line}>
                    {formatRuInline(line)}
                  </span>
                ))}
                <Link href="/contacts" className="pdp-service-link">
                  <span>{pdpCopy.serviceConsultLabel}</span>
                  <span aria-hidden="true" className="pdp-service-link-arrow">→</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <PdpCompatibility
        accessories={compatibility.accessories}
        compatibleWith={compatibility.compatible_with}
      />

      {/* Below the first screen: editorial description + full specs */}
      {(description || specRows.length > 0) && (
        <section className="pdp-below">
          {description && (
            <div className="pdp-description-block">
              <h2>{pdpCopy.descriptionHeading}</h2>
              {visibleFamilyDescription && (
                <div className="pdp-description-group">
                  <p className="pdp-description" data-family-description={sizeFamily?.productGroupID}>
                    {visibleFamilyDescription}
                  </p>
                </div>
              )}
              {layoutPdpDescription(description).map((blocks, pi) => {
                const collectionOnly = blocks.every((lines) =>
                  lines.every(isPdpCollectionContextSentence)
                )
                return (
                  <div
                    key={pi}
                    className={`pdp-description-group${collectionOnly ? " is-collection-group" : ""}`}
                  >
                    {blocks.map((lines, si) => {
                      const joined = lines.join(" ")
                      return (
                        <CopyLines
                          key={si}
                          className={`pdp-description${
                            isPdpCollectionContextSentence(joined) ? " is-collection" : ""
                          }`}
                          lines={lines}
                        />
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}
          {specRows.length > 0 && (
            <div className="pdp-specs-block">
              <h2>{pdpCopy.specsHeading}</h2>
              <dl className="pdp-specs-list">
                {specRows.map((row) => (
                  <div key={row.label} className="pdp-specs-row" data-spec={row.spec}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
              <Link href="/catalog" className="pdp-service-link pdp-specs-catalog-link">
                {actions.viewCatalog}
              </Link>
            </div>
          )}
        </section>
      )}
      {motifContext &&
        motifContext.selected_motif &&
        motifContext.related_products_in_motif.length > 0 && (
          <PdpRelatedInMotif
            products={motifContext.related_products_in_motif}
            motifSlug={motifContext.selected_motif.motif_slug}
            motifPagePath={motifContext.motif_page_path}
          />
        )}
    </div>
  )
}
