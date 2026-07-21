import Link from "next/link"
import type { Metadata } from "next"
import { getSiteUrl } from "@/lib/api/base"
import { getProduct, getProducts, NOT_FOUND } from "@/lib/api/products"
import { formatRub, getPrice } from "@/lib/format"
import {
  formatRequestQuotePriceLabel,
  isRequestQuoteProduct,
} from "@/lib/request-quote"
import { ProductCta } from "@/components/product-cta"
import { PdpPriceBlock } from "@/components/pdp-price-block"
import { PdpMaterialTierSelect } from "@/components/pdp-material-tier-select"
import { PdpSizeChips } from "@/components/pdp-size-chips"
import { buildMaterialTierOptions } from "@/lib/material-tiers"
import { CopyLines } from "@/components/copy-lines"
import { OliverPdpMediaSwitcher } from "@/components/oliver-pdp-media-switcher"
import { GreenwichBedPdpMediaSwitcher } from "@/components/greenwich-bed-pdp-media-switcher"
import { ProductPdpExecutionMediaSwitcher } from "@/components/product-pdp-execution-media-switcher"
import { ProductPdpMediaSwitcher } from "@/components/product-pdp-media-switcher"
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
import { getDisplayGroupMembers } from "@/lib/display-group"
import {
  collectDisplayGroupExtraImageUrls,
  collectExtraProductImageUrls,
  mergeUniqueExtraUrls,
  resolveCardHeroAndNearDuplicateExtras,
  resolvePdpMediaBundle,
  resolveProductPrimaryImageForMeta,
  resolveStorefrontProductImageSrc,
} from "@/lib/product-images"
import { collectProductImageUrls } from "@/lib/oliver-buyer-gallery"
import { restoreEvidenceProtectedAngles } from "@/lib/media-near-dup-collapse"
import { filterProvenceSceneOnlyPdpExtras } from "@/lib/provence-scene-only-pdp"
import { buildPdpBuyerFacingGallery } from "@/lib/pdp-buyer-gallery.server"
import {
  getCollectionLabel,
  getSubcollectionLabel,
  getCanonicalName,
  getBuyerFacingProductTitle,
  getBuyerFacingProductTitleLayout,
  getArticle,
  getDimensions,
  getPdpHeroObjectPosition,
  orderedBuyerFacingDimensions,
} from "@/lib/product-metadata"
import { layoutBuyerFacingTitle } from "@/lib/en-name-ru"
import { formatRuInline } from "@/lib/format-ru-copy"
import {
  isPdpCollectionContextSentence,
  layoutPdpDescription,
  layoutPdpSubtitle,
} from "@/lib/pdp-copy-layout"
import { isKidsStorefrontProduct } from "@/lib/kids"
import { actions, labels, pdpCopy, productTypeBadgeLabels } from "@/lib/woodright-copy"
import { KidsProductSection } from "@/components/kids-product-section"

function pdpHeroThumbnail(product: Record<string, unknown>): string | undefined {
  const t = product.thumbnail
  if (typeof t !== "string") return undefined
  const s = t.trim()
  return s.length > 0 ? s : undefined
}

/** OG: PDP hero thumbnail only, normalized to same-origin `/product-static`. */
function primaryImageForMeta(product: Record<string, unknown>): string | undefined {
  return resolveProductPrimaryImageForMeta(pdpHeroThumbnail(product))
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str
  return str.slice(0, max - 3).trim() + "..."
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

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const base = getSiteUrl()
  try {
    const res = await getProduct(params.id)
    const product = res.product as Record<string, unknown> | undefined
    if (!product) return { title: "Товар", alternates: { canonical: `${base}/product/${params.id}` } }
    const title = getBuyerFacingProductTitle(product)
    const desc = product.description ? truncate(String(product.description), 160) : "Товар из каталога Woodright."
    const imageUrl = primaryImageForMeta(product)
    return {
      title,
      description: desc,
      openGraph: {
        title,
        description: desc,
        url: `/product/${params.id}`,
        ...(imageUrl && { images: [imageUrl] }),
      },
      alternates: { canonical: `${base}/product/${params.id}` },
    }
  } catch {
    return { title: "Товар", alternates: { canonical: `${base}/product/${params.id}` } }
  }
}

export default async function ProductPage({ params }: { params: { id: string } }) {
  let product: Record<string, unknown> | null = null
  try {
    const res = await getProduct(params.id)
    product = res.product ?? null
  } catch (e) {
    if (e instanceof Error && e.message === NOT_FOUND) {
      return (
        <div data-state="not_found" className="status-message">
          <h1>{pdpCopy.notFoundTitle}</h1>
          <div className="nav-links nav-links-center" style={{ marginTop: "1rem" }}>
            <Link href="/catalog">В каталог</Link>
          </div>
        </div>
      )
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
    return (
      <div data-state="not_found" className="status-message">
        <h1>{pdpCopy.notFoundTitle}</h1>
        <div className="nav-links nav-links-center" style={{ marginTop: "1rem" }}>
          <Link href="/catalog">В каталог</Link>
        </div>
      </div>
    )
  }

  const base = getSiteUrl()
  const handle = String(product.handle ?? "")
  const isOliver = handle.startsWith("ol-")
  const isGreenwichBed = isGreenwichBedProduct(product)
  const thumbSrc = cardThumbnailSrcFromProduct(product)
  const executionSelectors = buildIntraProductExecutionSelectors(product, thumbSrc)
  const greenwichBedMatrix = executionSelectors.greenwichBedMatrix
  const greenwichPaintMatrix = executionSelectors.greenwichPaintMatrix
  const bedInteriorSrcs = isGreenwichBed
    ? greenwichBedInteriorUrlsFromProduct(product)
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
    const activeFinish = finishVariants?.[0]
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
        : provencePaintWood && activeFinish != null
          ? activeFinish.extraSrcs
          : activeSeparateFabric != null
            ? activeSeparateFabric.extraSrcs
            : activeUpholstery != null
            ? activeUpholstery.extraSrcs
            : activeWood != null
              ? activeWood.extraSrcs
              : activeFinish != null
                ? activeFinish.extraSrcs
                : mergeUniqueExtraUrls(thumbSrc, [
                    collectExtraProductImageUrls(product, thumbSrc),
                  ])
    return { mainSrc, extraSrcs }
  })()

  const useExecutionPdp =
    isGreenwichBed || hasPdpExecutionControls(executionSelectors)
  const price = getPrice(product)
  /* Material execution options from metadata.material_tiers (backend SoT). */
  const materialTiers = buildMaterialTierOptions(product)
  const requestQuotePrice = isRequestQuoteProduct(product)
    ? formatRequestQuotePriceLabel(product)
    : null
  const productType = (product.product_classification as Record<string, string> | undefined)?.product_type
  const badgeLabel = productType ? BADGE_LABELS[productType] : undefined

  const meta = product.metadata as Record<string, unknown> | undefined
  let displayGroupMembers: Record<string, unknown>[] = []
  if (meta?.display_group && meta?.collection) {
    try {
      const plist = await getProducts()
      const list = (plist.products ?? []) as Record<string, unknown>[]
      displayGroupMembers = getDisplayGroupMembers(product, list)
    } catch {
      /* ignore — PDP still usable */
    }
  }

  const oliverBuyerGallery =
    isOliver && !useExecutionPdp && !bedMatrixMedia && !paintMatrixMedia
      ? buildPdpBuyerFacingGallery(product)
      : null

  const mainImage =
    (oliverBuyerGallery?.mainSrc ??
      executionPdpMedia?.mainSrc ??
      bedMatrixMedia?.mainSrc ??
      paintMatrixMedia?.mainSrc) ||
    pdpHeroThumbnail(product)
  const mainNorm = mainImage ?? ""
  const heroObjectPosition = getPdpHeroObjectPosition(product)
  const pdpExtraSrcs = oliverBuyerGallery
    ? oliverBuyerGallery.extraSrcs
    : executionPdpMedia
      ? executionPdpMedia.extraSrcs
      : bedMatrixMedia
        ? bedMatrixMedia.extraSrcs
        : paintMatrixMedia
          ? paintMatrixMedia.extraSrcs
          : collectDisplayGroupExtraImageUrls([product, ...displayGroupMembers], mainNorm)

  const { mainSrc: bundledMain, extraSrcs: bundledExtras } = resolvePdpMediaBundle(
    mainNorm,
    filterProvenceSceneOnlyPdpExtras(product, mainNorm, pdpExtraSrcs)
  )
  // Shared PDP boundary: restore evidence-protected angles, then drop true near-dups
  // (covers Oliver buyer gallery, execution selectors, and plain collect paths).
  const restoredOrder = restoreEvidenceProtectedAngles(
    handle,
    [bundledMain, ...bundledExtras],
    collectProductImageUrls(product as Record<string, unknown>)
  )
  const evidenced = resolveCardHeroAndNearDuplicateExtras(
    restoredOrder[0] ?? bundledMain,
    restoredOrder.slice(1),
    handle
  )
  // Normalize again so restored raw pool URLs get `/product-static/…` rewrite.
  const { mainSrc: pdpMainSrc, extraSrcs: pdpResolvedExtras } =
    resolvePdpMediaBundle(evidenced.mainSrc, evidenced.extraSrcs)

  const titleLayout = getBuyerFacingProductTitleLayout(product)
  const titleStr = titleLayout.text
  const canonicalName = getCanonicalName(product)
  const canonicalLayout = canonicalName
    ? layoutBuyerFacingTitle(canonicalName)
    : null
  /* Hide workbook line when it only differs by Latin vs transcribed model. */
  const showCanonicalLine =
    canonicalLayout != null &&
    canonicalLayout.text.toLowerCase() !== titleStr.trim().toLowerCase()

  const collectionLabel = getCollectionLabel(product)
  const subcollectionLabel = getSubcollectionLabel(product)
  const article = getArticle(product)
  const dim = getDimensions(product)
  const subtitle = getPdpSubtitle(product)
  const description =
    product.description != null && String(product.description).trim().length > 0
      ? String(product.description).trim()
      : null

  /* Buyer-facing order is fixed: height → width → depth (cm hero + mm specs). */
  const dimensionLabelByAxis = {
    height: pdpCopy.dimensionHeight,
    width: pdpCopy.dimensionWidth,
    depth: pdpCopy.dimensionDepth,
  } as const
  const dimensionCells = dim
    ? orderedBuyerFacingDimensions(dim).map(({ axis, mm }) => ({
        label: dimensionLabelByAxis[axis],
        mm,
      }))
    : []

  const specRows = [
    ...dimensionCells.map((c) => ({
      label: c.label,
      value: `${c.mm} ${pdpCopy.unitMm}`,
    })),
    ...(article ? [{ label: pdpCopy.specArticle, value: article }] : []),
    ...(collectionLabel
      ? [
          {
            label: pdpCopy.specCollection,
            value: [collectionLabel, subcollectionLabel].filter(Boolean).join(" · "),
          },
        ]
      : []),
  ]

  /* Chip prices carry the base (full solid) amount; the client component
     applies the selected material multiplier so chips and the main price
     block never show conflicting numbers. */
  const sizeChips =
    displayGroupMembers.length > 0
      ? [
          {
            id: product.id as string,
            label: titleStr,
            basePrice: price,
            sort: (meta?.display_group_sort as number | undefined) ?? 99,
            isCurrent: true,
          },
          ...displayGroupMembers.map((m) => {
            const mMeta = m.metadata as Record<string, unknown> | undefined
            return {
              id: m.id as string,
              label: String(m.title ?? "Вариант"),
              basePrice: getPrice(m),
              sort: (mMeta?.display_group_sort as number | undefined) ?? 99,
              isCurrent: false,
            }
          }),
        ].sort((a, b) => a.sort - b.sort)
      : []

  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: (product.title as string) ?? "Товар",
    description: description ?? undefined,
    url: `${base}/product/${params.id}`,
    ...(mainImage && { image: resolveStorefrontProductImageSrc(mainImage) }),
  }

  const isKidsProduct = isKidsStorefrontProduct(product)

  return (
    <div
      data-state="success"
      className="pdp"
      {...(isKidsProduct ? { "data-kids-product": "" } : {})}
    >
      <KidsProductSection active={isKidsProduct} />
      {isKidsProduct ? (
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){document.querySelectorAll('a.logo,a.footer-brand-logo').forEach(function(a){a.setAttribute('href','/kids');a.setAttribute('aria-label','Woodright Kids - на главную детской');});})();",
          }}
        />
      ) : null}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
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
                <CopyLines
                  as="h1"
                  className="pdp-title"
                  lines={titleLayout.lines}
                />
                {badgeLabel && <span className="badge">{badgeLabel}</span>}
              </div>
              {showCanonicalLine && canonicalLayout && (
                <CopyLines
                  as="span"
                  className="pdp-canonical-name"
                  lines={canonicalLayout.lines}
                />
              )}

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
                        {mmToCmLabel(c.mm)}&nbsp;{pdpCopy.unitCm}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}

              {/* 5. Configuration — material execution, then size + other
                  execution groups, all before price / CTA */}
              {materialTiers && (
                <PdpMaterialTierSelect
                  productKey={handle || (product.id as string)}
                  options={materialTiers}
                  requestQuote={isRequestQuoteProduct(product)}
                />
              )}
              {sizeChips.length > 0 && (
                <PdpSizeChips
                  productKey={handle || (product.id as string)}
                  chips={sizeChips}
                  materialTiers={materialTiers}
                  requestQuote={isRequestQuoteProduct(product)}
                />
              )}
              {/* Portal target for execution option groups (Дерево/Обивка/Цвет/…).
                  Always mounted so the media gallery core never renders into a
                  missing node; CSS collapses it when empty. */}
              <div id="pdp-color-options-slot" className="pdp-color-options-slot" />

              {/* 6. Price — after required options; gated when execution controls exist */}
              <PdpPriceBlock
                priceLabel={
                  requestQuotePrice != null
                    ? requestQuotePrice
                    : price != null
                      ? formatRub(price)
                      : isRequestQuoteProduct(product)
                        ? labels.requestQuotePrice
                        : null
                }
                basePrice={price}
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
                product={product}
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

      {/* Below the first screen: editorial description + full specs */}
      {(description || specRows.length > 0) && (
        <section className="pdp-below">
          {description && (
            <div className="pdp-description-block">
              <h2>{pdpCopy.descriptionHeading}</h2>
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
                  <div key={row.label} className="pdp-specs-row">
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
    </div>
  )
}
