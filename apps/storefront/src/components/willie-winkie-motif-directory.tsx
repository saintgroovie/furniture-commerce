import Link from "next/link"
import type { MotifTheme } from "@/lib/api/motif-themes"
import { resolveStorefrontProductImageSrc } from "@/lib/product-images"
import { willieWinkieMotifsCopy } from "@/lib/woodright-copy"

/** Prefer motif cover; fall back to first preview thumbnail so tiles are never empty shells. */
export function resolveMotifCoverSrc(theme: {
  motif_cover: string | null
  preview_products?: Array<{ thumbnail: string | null }>
  products?: Array<{ thumbnail: string | null }>
}): string | null {
  if (theme.motif_cover) return theme.motif_cover
  const fromPreview = theme.preview_products?.find((p) => p.thumbnail)?.thumbnail
  if (fromPreview) return fromPreview
  const fromProducts = theme.products?.find((p) => p.thumbnail)?.thumbnail
  return fromProducts ?? null
}

export type MotifCardVariant = "l" | "m" | "s" | "row"

/**
 * Editorial desktop pattern from Fable:
 * [L+M] → [S+S+S] → [M+L] → [S+S+S] …
 * Remainders: 1 → row, 2 → m+m (6+6 feel).
 */
export function assignMotifCardVariants(count: number): MotifCardVariant[] {
  const out: MotifCardVariant[] = []
  let i = 0
  let cycle = 0
  while (i < count) {
    const remaining = count - i
    const phase = cycle % 4
    const pairRow = phase === 0 || phase === 2
    if (pairRow) {
      if (remaining === 1) {
        out.push("row")
        i += 1
      } else if (remaining === 2) {
        out.push("m", "m")
        i += 2
      } else {
        if (phase === 0) out.push("l", "m")
        else out.push("m", "l")
        i += 2
        cycle += 1
      }
    } else if (remaining === 1) {
      out.push("row")
      i += 1
    } else if (remaining === 2) {
      out.push("m", "m")
      i += 2
    } else {
      out.push("s", "s", "s")
      i += 3
      cycle += 1
    }
  }
  return out
}

function MotifWell({
  src,
  priority,
}: {
  src: string | null
  priority?: boolean
}) {
  if (!src) {
    return (
      <div className="ww-motif-well ww-motif-well--empty" aria-hidden>
        <span>{willieWinkieMotifsCopy.imageMissing}</span>
      </div>
    )
  }
  return (
    <div className="ww-motif-well">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={resolveStorefrontProductImageSrc(src)}
        alt=""
        loading={priority ? "eager" : "lazy"}
        decoding="async"
      />
    </div>
  )
}

export function WillieWinkieMotifDirectory({ themes }: { themes: MotifTheme[] }) {
  const variants = assignMotifCardVariants(themes.length)
  return (
    <ul className="ww-motif-gallery">
      {themes.map((theme, index) => {
        const href = `/kids/willie-winkie/${theme.motif_slug}`
        const cover = resolveMotifCoverSrc(theme)
        const variant = variants[index] ?? "s"
        const families = willieWinkieMotifsCopy.familiesLine(
          theme.available_family_titles
        )
        return (
          <li
            key={theme.motif_slug}
            className={`ww-motif-gallery-item ww-motif-gallery-item--${variant}`}
          >
            <Link
              href={href}
              className={`ww-motif-card ww-motif-card--${variant}`}
            >
              <MotifWell
                src={cover}
                priority={index < 4}
              />
              <div className="ww-motif-caption">
                <h2 className="ww-motif-title">{theme.motif_title}</h2>
                <p className="ww-motif-meta">
                  {willieWinkieMotifsCopy.tileMeta(
                    theme.available_family_titles.length,
                    theme.motif_available_product_count
                  )}
                </p>
                {families ? (
                  <p className="ww-motif-families">{families}</p>
                ) : null}
                <span className="ww-motif-cta">
                  {willieWinkieMotifsCopy.cardCta}{" "}
                  <span aria-hidden="true">→</span>
                </span>
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
