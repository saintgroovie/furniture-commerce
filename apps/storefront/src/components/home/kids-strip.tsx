import Link from "next/link"
import { kidsCatalogCopy, kidsHome } from "@/lib/woodright-copy"
import { formatRuInline } from "@/lib/format-ru-copy"
import { FeaturedCard } from "./home-classics"
import type { HomeProduct } from "./home-data"

/** Real Oliver Kids pieces in the same editorial layout as the main page. */
export function KidsStrip({ products }: { products: HomeProduct[] }) {
  const [first, ...rest] = products
  return (
    <section className="hp-section hp-classics hp-wrap" aria-labelledby="hp-kstrip-title" data-reveal>
      <div className="hp-classics-head">
        <h2 id="hp-kstrip-title" className="hp-section-title">
          {kidsCatalogCopy.h1}
        </h2>
        <p className="hp-section-lead">{formatRuInline(kidsCatalogCopy.lead[0])}</p>
      </div>

      {first && (
        <div className="hp-featured">
          <FeaturedCard product={first} large index={0} />
          <div className="hp-featured-grid">
            {rest.map((p, i) => (
              <FeaturedCard product={p} key={p.id} index={i + 1} />
            ))}
          </div>
        </div>
      )}

      <div className="hp-kstrip-cta">
        <Link href="/kids/catalog" className="btn btn-primary">
          {kidsHome.ctaCatalog}
        </Link>
      </div>
    </section>
  )
}
