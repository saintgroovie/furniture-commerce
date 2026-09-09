import Link from "next/link"
import { partnersCopy } from "@/lib/woodright-copy"
import { formatRuInline } from "@/lib/format-ru-copy"
import type { StorePartner } from "@/lib/api/partners"

function cellScale(partner: StorePartner, index: number): string {
  if (partner.featured) return "is-featured"
  if (index === 2 || index === 6) return "is-large"
  return "is-regular"
}

export function PartnerIndex({ partners }: { partners: StorePartner[] }) {
  return (
    <section className="ed-partner-index ed-wrap" data-reveal aria-label={partnersCopy.h1}>
      <ul className="ed-logo-wall">
        {partners.map((partner, index) => {
          const cover = partner.presentations[0]?.cover_url ?? partner.images[0] ?? null
          const deck = partner.presentations[0]
          return (
            <li
              key={partner.id}
              className={`ed-logo-cell ${cellScale(partner, index)}`}
              style={{ ["--reveal-i" as string]: String(index) }}
            >
              <article className="ed-logo-card">
                {cover ? (
                  <figure className="ed-logo-media">
                    <img src={cover} alt="" />
                  </figure>
                ) : null}
                <div className="ed-logo-copy">
                  {partner.featured ? (
                    <p className="ed-logo-kicker">{partnersCopy.featuredLabel}</p>
                  ) : null}
                  <h2 className="ed-logo-name">
                    <Link href={`/partners/${partner.slug}`}>{formatRuInline(partner.name)}</Link>
                  </h2>
                  {partner.description ? (
                    <p className="ed-logo-caption">{formatRuInline(partner.description)}</p>
                  ) : null}
                  <div className="ed-logo-actions">
                    {deck ? (
                      <Link
                        href={`/partners/${partner.slug}/presentations/${deck.id}`}
                        className="btn btn-primary"
                      >
                        {partnersCopy.viewPresentation}
                      </Link>
                    ) : (
                      <Link href={`/partners/${partner.slug}`} className="btn btn-secondary">
                        {partnersCopy.backToIndex}
                      </Link>
                    )}
                  </div>
                </div>
              </article>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
