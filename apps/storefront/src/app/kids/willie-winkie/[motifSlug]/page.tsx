import type { Metadata } from "next"
import Link from "next/link"
import { CopyLines } from "@/components/copy-lines"
import { WillieWinkieMotifProductCard } from "@/components/willie-winkie-motif-product-card"
import { resolveMotifCoverSrc } from "@/components/willie-winkie-motif-directory"
import { getSiteUrl } from "@/lib/api/base"
import { getMotifTheme } from "@/lib/api/motif-themes"
import { indexingCanonical } from "@/lib/indexing-policy"
import { resolveStorefrontProductImageSrc } from "@/lib/product-images"
import { seo, willieWinkieMotifsCopy } from "@/lib/woodright-copy"

type PageProps = { params: Promise<{ motifSlug: string }> }

type MotifThemePayload = NonNullable<
  Awaited<ReturnType<typeof getMotifTheme>>["motif_theme"]
>

type MotifLoad =
  | { kind: "error" }
  | { kind: "not_found" }
  | { kind: "empty"; theme: MotifThemePayload }
  | {
      kind: "success"
      theme: MotifThemePayload
      cover: string | null
      families: string | null
      gridMod: string
    }

async function loadMotif(slug: string): Promise<MotifLoad> {
  try {
    const data = await getMotifTheme(slug)
    if (!data?.motif_theme) {
      return { kind: "not_found" }
    }
    const theme = data.motif_theme
    const coverRaw = resolveMotifCoverSrc(theme)
    const cover = coverRaw ? resolveStorefrontProductImageSrc(coverRaw) : null
    const families = willieWinkieMotifsCopy.familiesLine(
      theme.available_family_titles
    )
    const gridMod =
      theme.products.length <= 2
        ? "ww-motif-product-grid ww-motif-product-grid--compact"
        : "ww-motif-product-grid"
    if (theme.products.length === 0) {
      return { kind: "empty", theme }
    }
    return { kind: "success", theme, cover, families, gridMod }
  } catch (err) {
    console.error("[kids/willie-winkie/motif] load failed", err)
    return { kind: "error" }
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const base = getSiteUrl()
  const { motifSlug: slug } = await params
  try {
    const data = await getMotifTheme(slug)
    if (!data?.motif_theme) {
      const hub = indexingCanonical(`${base}/kids/willie-winkie`)
      return {
        title: willieWinkieMotifsCopy.motifNotFoundTitle,
        robots: { index: false, follow: false },
        ...(hub ? { alternates: hub } : {}),
      }
    }
    const theme = data.motif_theme
    const meta = seo.willieWinkieMotif(theme.motif_title)
    const imageRaw = resolveMotifCoverSrc(theme)
    const image = imageRaw
      ? resolveStorefrontProductImageSrc(imageRaw)
      : undefined
    const self = indexingCanonical(
      `${base}/kids/willie-winkie/${theme.motif_slug}`
    )
    return {
      title: meta.title,
      description: meta.description,
      ...(self ? { alternates: self } : {}),
      openGraph: {
        title: meta.title,
        description: meta.description,
        url: `/kids/willie-winkie/${theme.motif_slug}`,
        ...(image ? { images: [image] } : {}),
      },
    }
  } catch {
    return {
      title: willieWinkieMotifsCopy.motifLoadError[0],
      robots: { index: false, follow: false },
    }
  }
}

export default async function WillieWinkieMotifPage({ params }: PageProps) {
  const { motifSlug: slug } = await params
  const result = await loadMotif(slug)

  if (result.kind === "error") {
    return (
      <div data-state="empty" className="ww-motif-page">
        <div className="ww-state-plate">
          <h1>{willieWinkieMotifsCopy.directoryH1}</h1>
          <CopyLines lines={willieWinkieMotifsCopy.motifLoadError} />
          <Link href="/kids/willie-winkie">
            {willieWinkieMotifsCopy.backToDirectory}
          </Link>
        </div>
      </div>
    )
  }

  if (result.kind === "not_found") {
    return (
      <div data-state="not_found" className="ww-motif-page">
        <div className="ww-state-plate">
          <h1>{willieWinkieMotifsCopy.motifNotFoundTitle}</h1>
          <p>{willieWinkieMotifsCopy.motifNotFoundBody}</p>
          <Link href="/kids/willie-winkie">
            {willieWinkieMotifsCopy.backToDirectory}
          </Link>
        </div>
      </div>
    )
  }

  if (result.kind === "empty") {
    const { theme } = result
    return (
      <div data-state="empty" className="ww-motif-page">
        <div className="ww-state-plate">
          <h1>{theme.motif_title}</h1>
          <p>{willieWinkieMotifsCopy.motifEmptyTitle}</p>
          <p>{willieWinkieMotifsCopy.motifEmptyBody}</p>
          <Link href="/kids/willie-winkie">
            {willieWinkieMotifsCopy.backToDirectory}
          </Link>
        </div>
      </div>
    )
  }

  const { theme, cover, families, gridMod } = result

  return (
    <div data-state="success" className="ww-motif-page ww-motif-detail">
      <section
        className="ww-detail-hero"
        aria-labelledby="ww-motif-detail-title"
      >
        <div className="ww-detail-plate">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="ww-detail-still" src={cover} alt={theme.motif_title} />
          ) : (
            <div className="ww-detail-still ww-detail-still--empty" aria-hidden>
              <span>{willieWinkieMotifsCopy.imageMissing}</span>
            </div>
          )}
        </div>
        <div className="ww-detail-panel">
          <p className="ww-motif-detail-crumb ww-motif-detail-crumb--desktop">
            <Link href="/kids">{willieWinkieMotifsCopy.backToKids}</Link>
            <span aria-hidden="true"> / </span>
            <Link href="/kids/willie-winkie">
              {willieWinkieMotifsCopy.backToDirectoryShort}
            </Link>
            <span aria-hidden="true"> / </span>
            <span>{theme.motif_title}</span>
          </p>
          <p className="ww-motif-detail-crumb ww-motif-detail-crumb--mobile">
            <Link href="/kids/willie-winkie">
              ← {willieWinkieMotifsCopy.backToDirectoryShort}
            </Link>
          </p>
          <h1 id="ww-motif-detail-title">{theme.motif_title}</h1>
          <p className="ww-motif-detail-meta">
            {willieWinkieMotifsCopy.detailItemsMeta(
              theme.motif_available_product_count
            )}
          </p>
          {families ? (
            <p className="ww-motif-detail-types">
              {willieWinkieMotifsCopy.availableTypesPrefix} - {families}
            </p>
          ) : null}
          {theme.motif_description ? (
            <p className="ww-motif-detail-desc">{theme.motif_description}</p>
          ) : null}
          <div className="ww-motif-detail-actions">
            <a href="#ww-detail-products" className="btn btn-primary">
              {willieWinkieMotifsCopy.productsToAnchor}
            </a>
          </div>
        </div>
      </section>

      <section
        id="ww-detail-products"
        className="ww-detail-products"
        aria-labelledby="ww-motif-products-title"
      >
        <div className="ww-motif-section-head">
          <h2 id="ww-motif-products-title">
            {willieWinkieMotifsCopy.productsSectionTitle}
          </h2>
          <p className="ww-motif-section-lead">
            {willieWinkieMotifsCopy.productsOnlySubhead}
          </p>
        </div>
        <div className={gridMod}>
          {theme.products.map((product) => (
            <WillieWinkieMotifProductCard
              key={product.handle}
              product={product}
              motifSlug={theme.motif_slug}
            />
          ))}
        </div>
      </section>
    </div>
  )
}
