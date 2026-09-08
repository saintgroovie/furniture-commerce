import Link from "next/link"
import { partnersCopy } from "@/lib/woodright-copy"
import { formatRuInline } from "@/lib/format-ru-copy"
import type { StorePartner } from "@/lib/api/partners"

export function PartnerIndex({ partners }: { partners: StorePartner[] }) {
  return (
    <section className="ed-partner-index ed-wrap" aria-label={partnersCopy.h1}>
      <ul className="ed-logo-wall">
        {partners.map((partner, index) => {
          const scale = partner.featured ? "is-featured" : index % 5 === 2 ? "is-large" : "is-regular"
          return (
            <li key={partner.id} className={`ed-logo-cell ${scale}`}>
              <Link
                href={`/partners/${partner.slug}`}
                className="ed-logo-link"
                aria-label={partner.name}
              >
                {partner.logo_url ? (
                  <img src={partner.logo_url} alt="" />
                ) : (
                  <span className="ed-logo-name">{formatRuInline(partner.name)}</span>
                )}
                {partner.featured ? (
                  <span className="ed-logo-kicker">{partnersCopy.featuredLabel}</span>
                ) : null}
                {partner.logo_url ? (
                  <span className="ed-logo-caption">{formatRuInline(partner.name)}</span>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
