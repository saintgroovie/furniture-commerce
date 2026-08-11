import Link from "next/link"
import { homeCopy } from "@/lib/woodright-copy"
import { CopyLines } from "@/components/copy-lines"
import type { HomeProduct } from "./home-data"
import { HomeDeferredCardLayers } from "./home-deferred-card-layers"
import { HomeImg } from "./home-img"

/** Kids scene: existing kids block copy + real Woodright Kids pieces. */
export function HomeKids({ products }: { products: HomeProduct[] }) {
  const { kidsBlock } = homeCopy
  return (
    <section className="hp-section hp-kids" aria-labelledby="hp-kids-title" data-reveal>
      <div className="hp-kids-inner hp-wrap">
        <div className="hp-kids-copy">
          <h2 id="hp-kids-title" className="hp-section-title">
            {kidsBlock.title}
          </h2>
          <CopyLines className="hp-section-lead" lines={kidsBlock.text} />
          <div className="hp-kids-cta">
            <Link href="/kids" className="btn btn-primary">
              {kidsBlock.cta}
            </Link>
          </div>
        </div>
        {products.length > 0 && (
          <div className="hp-kids-objects">
            {products.map((p, i) => (
              <Link
                href={p.href}
                className="hp-kids-object"
                key={p.id}
                style={{ "--reveal-i": i } as React.CSSProperties}
              >
                <span className="hp-kids-object-media">
                  <HomeImg
                    src={p.img}
                    alt={p.title}
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                  />
                  <HomeDeferredCardLayers hoverImg={p.hoverImg} />
                </span>
                <span className="hp-kids-object-title">{p.title}</span>
                {p.priceLabel && (
                  <span className="hp-kids-object-price">{p.priceLabel}</span>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
