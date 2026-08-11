import Link from "next/link"
import { homeCopy } from "@/lib/woodright-copy"
import { formatRuInline } from "@/lib/format-ru-copy"
import type { HomeProduct } from "./home-data"
import { HomeDeferredCardLayers } from "./home-deferred-card-layers"
import { HomeImg } from "./home-img"

export function FeaturedCard({
  product,
  large = false,
  index,
}: {
  product: HomeProduct
  large?: boolean
  index: number
}) {
  return (
    <Link
      href={product.href}
      className={large ? "hp-featured-card hp-featured-card-large" : "hp-featured-card"}
      style={{ "--reveal-i": index } as React.CSSProperties}
    >
      <span
        className="hp-featured-media"
        style={{ "--cycle-delay": `${index * 3.1}s` } as React.CSSProperties}
      >
        <HomeImg
          src={product.img}
          alt={product.title}
          loading="lazy"
          decoding="async"
          draggable={false}
        />
        <HomeDeferredCardLayers
          variants={product.variantImgs}
          hoverImg={product.hoverImg}
        />
        {product.article && (
          <span className="hp-featured-article" aria-hidden="true">
            {product.article}
          </span>
        )}
      </span>
      <span className="hp-featured-body">
        {product.collectionLabel && (
          <span className="hp-featured-collection">{product.collectionLabel}</span>
        )}
        <span className="hp-featured-title">{product.title}</span>
        {product.priceLabel && (
          <span className="hp-featured-price">{product.priceLabel}</span>
        )}
      </span>
    </Link>
  )
}

/**
 * «Классика, которой не нужно обновляться» — the existing wood block copy
 * now introduces real catalog products (data comes from the server page).
 */
export function HomeClassics({ featured }: { featured: HomeProduct[] }) {
  const { woodBlock } = homeCopy
  const [lead] = woodBlock.text
  const [first, ...rest] = featured
  return (
    <section className="hp-section hp-classics hp-wrap" aria-labelledby="hp-classics-title" data-reveal>
      <div className="hp-classics-head">
        <h2 id="hp-classics-title" className="hp-section-title">
          {woodBlock.title}
        </h2>
        <p className="hp-section-lead">{formatRuInline(lead)}</p>
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
    </section>
  )
}
