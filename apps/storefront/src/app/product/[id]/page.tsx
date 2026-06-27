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
  resolvePdpMediaBundle,
} from "@/lib/product-images"
import { buildPdpBuyerFacingGallery } from "@/lib/pdp-buyer-gallery.server"
import {
  getCollectionLabel,
  getSubcollectionLabel,
  getCanonicalName,
  getBuyerFacingProductTitle,
  getArticle,
  getDimensions,
  formatDimensionsLabeled,
  getPdpHeroObjectPosition,
} from "@/lib/product-metadata"

function pdpHeroThumbnail(product: Record<string, unknown>): string | undefined {
  const t = product.thumbnail
  if (typeof t !== "string") return undefined
  const s = t.trim()
  return s.length > 0 ? s : undefined
}

/** OG / JSON-LD: same stable source as PDP hero — `thumbnail` only. */
function primaryImageForMeta(product: Record<string, unknown>): string | undefined {
  return pdpHeroThumbnail(product)
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str
  return str.slice(0, max - 3).trim() + "..."
}

const BADGE_LABELS: Record<string, string> = {
  BESPOKE: "На заказ",
}

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
          <h1>Товар не найден</h1>
          <div className="nav-links nav-links-center" style={{ marginTop: "1rem" }}>
            <Link href="/catalog">В каталог</Link>
          </div>
        </div>
      )
    }
    return (
      <div data-state="error" className="status-message">
        <h1>Ошибка</h1>
        <p>Не удалось загрузить товар.</p>
        <div className="nav-links nav-links-center" style={{ marginTop: "1rem" }}>
          <Link href="/catalog">В каталог</Link>
        </div>
      </div>
    )
  }
  if (!product) {
    return (
      <div data-state="not_found" className="status-message">
        <h1>Товар не найден</h1>
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
          bedDefaults.fabric
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
    const activeHeadboard = headboardVariants?.[0]
    const activeUpholstery = upholsteryVariants?.[0]
    const activeWood = woodVariants?.[0]
    const activeFinish = finishVariants?.[0]
    const provencePaintWood = executionSelectors.provencePaintWood === true
    const mainSrc = provencePaintWood
      ? (activeFinish?.mainSrc ?? activeWood?.mainSrc ?? thumbSrc)
      : (activeHeadboard?.mainSrc ??
        activeUpholstery?.mainSrc ??
        activeWood?.mainSrc ??
        activeFinish?.mainSrc ??
        thumbSrc)
    const extraSrcs =
      activeHeadboard != null
        ? activeHeadboard.extraSrcs
        : provencePaintWood && activeFinish != null
          ? activeFinish.extraSrcs
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

  const { mainSrc: pdpMainSrc, extraSrcs: pdpResolvedExtras } = resolvePdpMediaBundle(
    mainNorm,
    pdpExtraSrcs
  )

  const titleStr = getBuyerFacingProductTitle(product)
  const canonicalName = getCanonicalName(product)
  const showCanonicalLine =
    canonicalName != null &&
    canonicalName.toLowerCase() !== titleStr.trim().toLowerCase()

  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: (product.title as string) ?? "Товар",
    description: product.description ? String(product.description) : undefined,
    url: `${base}/product/${params.id}`,
    ...(mainImage && { image: mainImage }),
  }

  return (
    <div data-state="success">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <div className="product-detail">
        <div className="product-detail-media-col">
          {isGreenwichBed ? (
            <GreenwichBedPdpMediaSwitcher
              mainSrc={pdpMainSrc}
              extraSrcs={pdpResolvedExtras}
              headboardVariants={executionSelectors.headboard}
              upholsteryVariants={executionSelectors.upholstery}
              woodVariants={executionSelectors.wood}
              greenwichBedMatrix={greenwichBedMatrix}
              title={titleStr}
              heroObjectPosition={heroObjectPosition}
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
              heroObjectPosition={heroObjectPosition}
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
        <div className="product-detail-info">
          {(() => {
            const collectionLabel = getCollectionLabel(product)
            const subcollectionLabel = getSubcollectionLabel(product)
            const article = getArticle(product)
            const dim = getDimensions(product)
            return (
              <>
                {(collectionLabel || subcollectionLabel) && (
                  <span className="pdp-collection-label">
                    {[collectionLabel, subcollectionLabel].filter(Boolean).join(" · ")}
                  </span>
                )}
                <div className="product-detail-header">
                  <h1>{titleStr}</h1>
                  {badgeLabel && <span className="badge">{badgeLabel}</span>}
                </div>
                {showCanonicalLine && canonicalName && (
                  <span className="pdp-canonical-name">{canonicalName}</span>
                )}
                {article && (
                  <span className="pdp-article">Арт. {article}</span>
                )}
                {dim && (
                  <span className="pdp-dimensions">{formatDimensionsLabeled(dim)}</span>
                )}
              </>
            )
          })()}
          {requestQuotePrice != null ? (
            <p className="price product-detail-price">{requestQuotePrice}</p>
          ) : price != null ? (
            <p className="price product-detail-price">{formatRub(price)}</p>
          ) : null}
          <ProductCta product={product} />
          {displayGroupMembers.length > 0 && (
            <section className="pdp-related-sizes" aria-labelledby="pdp-sizes-heading">
              <h2 id="pdp-sizes-heading" className="pdp-related-sizes-title">
                Другие размеры
              </h2>
              <ul className="pdp-related-sizes-list">
                {displayGroupMembers.map((m) => {
                  const mid = m.id as string
                  const mt = String(m.title ?? "Вариант")
                  const mp = getPrice(m)
                  return (
                    <li key={mid}>
                      <Link href={`/product/${mid}`} className="pdp-related-sizes-link">
                        <span>{mt}</span>
                        {mp != null && (
                          <span className="pdp-related-sizes-price">{formatRub(mp)}</span>
                        )}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
