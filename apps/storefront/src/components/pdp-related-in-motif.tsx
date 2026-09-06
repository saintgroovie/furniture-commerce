import Link from "next/link"
import type { MotifProductCard } from "@/lib/api/motif-themes"
import { WillieWinkieMotifProductCard } from "@/components/willie-winkie-motif-product-card"
import { willieWinkieMotifsCopy } from "@/lib/woodright-copy"

export function PdpRelatedInMotif({
  products,
  motifSlug,
  motifPagePath,
}: {
  products: MotifProductCard[]
  motifSlug: string
  motifPagePath: string | null
}) {
  if (products.length === 0) return null
  return (
    <section className="pdp-related-motif" aria-labelledby="pdp-related-motif-title">
      <div className="pdp-related-motif-head">
        <h2 id="pdp-related-motif-title">{willieWinkieMotifsCopy.relatedTitle}</h2>
        {motifPagePath && (
          <Link href={motifPagePath} className="pdp-motif-all-link">
            {willieWinkieMotifsCopy.viewAllInMotif}
          </Link>
        )}
      </div>
      <div className="ww-motif-product-grid ww-motif-product-grid--related ww-motif-product-grid--compact">
        {products.map((product) => (
          <WillieWinkieMotifProductCard
            key={product.handle}
            product={product}
            motifSlug={motifSlug}
          />
        ))}
      </div>
    </section>
  )
}
