"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import type { MotifOption } from "@/lib/api/motif-themes"
import { resolveStorefrontProductImageSrc } from "@/lib/product-images"
import { willieWinkieMotifsCopy } from "@/lib/woodright-copy"

export function PdpMotifSelector({
  options,
  motifPagePath,
}: {
  options: MotifOption[]
  motifPagePath: string | null
}) {
  const router = useRouter()
  if (options.length <= 1) {
    const only = options[0]
    const img = only?.motif_cover
      ? resolveStorefrontProductImageSrc(only.motif_cover)
      : null
    return (
      <div
        className="pdp-motif-selector"
        role="group"
        aria-label={willieWinkieMotifsCopy.motifSelectorLabel}
      >
        <div className="pdp-motif-current is-selected">
          <span className="pdp-motif-current-media">
            {img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img} alt="" />
            ) : (
              <span className="pdp-motif-current-empty" aria-hidden />
            )}
          </span>
          <span className="pdp-motif-current-copy">
            <span className="pdp-motif-current-eyebrow">
              {willieWinkieMotifsCopy.motifSelectorLabel}
            </span>
            {only ? (
              <span className="pdp-motif-current-title">{only.motif_title}</span>
            ) : null}
            <Link href="/kids/willie-winkie" className="pdp-motif-all-link">
              {willieWinkieMotifsCopy.motifChooseLink} →
            </Link>
          </span>
        </div>
        {motifPagePath ? (
          <Link href={motifPagePath} className="pdp-motif-all-link">
            {willieWinkieMotifsCopy.viewAllInMotif}
          </Link>
        ) : null}
      </div>
    )
  }

  return (
    <div className="pdp-motif-selector" role="group" aria-label={willieWinkieMotifsCopy.motifSelectorLabel}>
      <span className="pdp-motif-selector-label">{willieWinkieMotifsCopy.motifSelectorLabel}</span>
      <div className="pdp-motif-option-grid">
        {options.map((option) => {
          const img = option.motif_cover
            ? resolveStorefrontProductImageSrc(option.motif_cover)
            : null
          const href = `/product/${encodeURIComponent(option.product_handle)}?motif=${encodeURIComponent(option.motif_slug)}`
          const className = `pdp-motif-option${option.selected ? " is-selected" : ""}`
          if (option.selected) {
            return (
              <span
                key={option.motif_slug}
                className={className}
                aria-current="true"
              >
                <span className="pdp-motif-option-media">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} alt="" />
                  ) : (
                    <span className="pdp-motif-option-empty" />
                  )}
                </span>
                <span className="pdp-motif-option-title">{option.motif_title}</span>
              </span>
            )
          }
          return (
            <button
              key={option.motif_slug}
              type="button"
              className={className}
              onClick={() => router.push(href)}
            >
              <span className="pdp-motif-option-media">
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img} alt="" />
                ) : (
                  <span className="pdp-motif-option-empty" />
                )}
              </span>
              <span className="pdp-motif-option-title">{option.motif_title}</span>
            </button>
          )
        })}
      </div>
      {motifPagePath && (
        <Link href={motifPagePath} className="pdp-motif-all-link">
          {willieWinkieMotifsCopy.viewAllInMotif}
        </Link>
      )}
    </div>
  )
}
