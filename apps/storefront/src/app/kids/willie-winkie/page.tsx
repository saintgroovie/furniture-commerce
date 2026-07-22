import type { Metadata } from "next"
import Link from "next/link"
import { CopyLines } from "@/components/copy-lines"
import {
  WillieWinkieMotifDirectory,
  resolveMotifCoverSrc,
} from "@/components/willie-winkie-motif-directory"
import { getSiteUrl } from "@/lib/api/base"
import { getMotifThemes } from "@/lib/api/motif-themes"
import { indexingCanonical } from "@/lib/indexing-policy"
import { resolveStorefrontProductImageSrc } from "@/lib/product-images"
import { seo, willieWinkieMotifsCopy } from "@/lib/woodright-copy"

const willieCanonical = indexingCanonical(`${getSiteUrl()}/kids/willie-winkie`)

export const metadata: Metadata = {
  title: seo.willieWinkieMotifs.title,
  description: seo.willieWinkieMotifs.description,
  ...(willieCanonical ? { alternates: willieCanonical } : {}),
  openGraph: {
    title: seo.willieWinkieMotifs.title,
    description: seo.willieWinkieMotifs.description,
    url: "/kids/willie-winkie",
  },
}

export default async function WillieWinkieMotifDirectoryPage() {
  try {
    const data = await getMotifThemes()
    const themes = data.motif_themes ?? []

    if (themes.length === 0) {
      return (
        <div data-state="empty" className="ww-motif-page">
          <div className="ww-state-plate">
            <h1>{willieWinkieMotifsCopy.directoryEmptyTitle}</h1>
            <p>{willieWinkieMotifsCopy.directoryEmptyBody}</p>
            <Link href="/kids/catalog">{willieWinkieMotifsCopy.openCatalog}</Link>
          </div>
        </div>
      )
    }

    const productTotal = themes.reduce(
      (sum, theme) => sum + (theme.motif_available_product_count || 0),
      0
    )
    const shelfCovers = themes
      .map((theme) => {
        const raw = resolveMotifCoverSrc(theme)
        return raw ? resolveStorefrontProductImageSrc(raw) : null
      })
      .filter((src): src is string => Boolean(src))
      .slice(0, 3)

    return (
      <div data-state="success" className="ww-motif-page">
        <section className="ww-motif-hero" aria-labelledby="ww-motif-hero-title">
          <div className="ww-motif-hero-inner">
            <div className="ww-motif-hero-copy">
              <p className="ww-motif-eyebrow">{willieWinkieMotifsCopy.directoryCrumb}</p>
              <h1 id="ww-motif-hero-title">{willieWinkieMotifsCopy.directoryH1}</h1>
              <CopyLines
                className="ww-motif-hero-lead"
                lines={willieWinkieMotifsCopy.directoryLead}
              />
              <p className="ww-motif-hero-meta">
                {willieWinkieMotifsCopy.directoryMeta(themes.length, productTotal)}
              </p>
              <div className="ww-motif-hero-actions">
                <a href="#ww-motif-gallery" className="btn btn-primary">
                  {willieWinkieMotifsCopy.directoryHeroCta}
                </a>
                <Link href="/kids/catalog" className="btn btn-secondary">
                  {willieWinkieMotifsCopy.openCatalog}
                </Link>
              </div>
            </div>
            {shelfCovers.length > 0 ? (
              <div className="ww-motif-hero-shelf" aria-hidden="true">
                {shelfCovers.map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={`${src}-${i}`} src={src} alt="" />
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <section
          id="ww-motif-gallery"
          className="ww-motif-section"
          aria-labelledby="ww-motif-gallery-title"
        >
          <div className="ww-motif-section-head">
            <h2 id="ww-motif-gallery-title">
              {willieWinkieMotifsCopy.directorySectionTitle}
            </h2>
            <p className="ww-motif-section-lead">
              {willieWinkieMotifsCopy.directorySectionLead}
            </p>
          </div>
          <WillieWinkieMotifDirectory themes={themes} />
        </section>
      </div>
    )
  } catch (err) {
    console.error("[kids/willie-winkie] motif directory load failed", err)
    return (
      <div data-state="empty" className="ww-motif-page">
        <div className="ww-state-plate">
          <h1>{willieWinkieMotifsCopy.directoryH1}</h1>
          <CopyLines lines={willieWinkieMotifsCopy.directoryLoadError} />
          <Link href="/kids/catalog">
            {willieWinkieMotifsCopy.directoryEmptyBody}
          </Link>
        </div>
      </div>
    )
  }
}
