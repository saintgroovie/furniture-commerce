import Link from "next/link"
import {
  ContactActionGrid,
  ContactMapAction,
  ContactPhoneAction,
} from "@/components/contact-action"
import { ContactMessengerActions } from "@/components/contact-messenger-actions"
import { formatRuInline } from "@/lib/format-ru-copy"
import { contactsCopy } from "@/lib/woodright-copy"
import { showroomContacts } from "@/lib/showroom-contacts"

/**
 * Full `/contacts` page composition - independent from header dropdown shells.
 * Stage uses a shared three-row contract (header / primary / secondary) so
 * left and right columns start action bands on the same horizontal.
 * Contact values come from `showroomContacts`; chrome copy from `contactsCopy`.
 */
export function ContactsPageLayout() {
  return (
    <div className="contacts-page">
      <h1 className="contacts-page-title">{contactsCopy.h1}</h1>
      <p className="contacts-page-intro">{formatRuInline(contactsCopy.lead)}</p>

      <div className="contacts-page-stage">
        <section
          className="contacts-page-col contacts-page-col--showroom"
          aria-labelledby="contacts-showroom-heading"
        >
          <header className="contacts-page-row contacts-page-row--header">
            <p className="contacts-page-eyebrow">
              {formatRuInline(contactsCopy.showroomEyebrow)}
            </p>
            <h2
              id="contacts-showroom-heading"
              className="contacts-page-col-title"
            >
              {formatRuInline(contactsCopy.showroomHeading)}
            </h2>
          </header>
          <div className="contacts-page-row contacts-page-row--primary">
            <address className="contacts-page-address">
              {showroomContacts.addressLines.map((line) => (
                <span className="contacts-page-address-line" key={line}>
                  {formatRuInline(line)}
                </span>
              ))}
            </address>
          </div>
          <div className="contacts-page-row contacts-page-row--secondary">
            <ContactActionGrid density="page" className="contacts-page-action-grid">
              <ContactPhoneAction
                label={showroomContacts.showroomCallLabel}
                display={showroomContacts.writeOrCall.display}
                tel={showroomContacts.writeOrCall.tel}
                tone="primary"
              />
              <ContactMapAction density="page" />
            </ContactActionGrid>
          </div>
        </section>

        <section
          className="contacts-page-col contacts-page-col--channels"
          aria-labelledby="contacts-channels-heading"
        >
          <header className="contacts-page-row contacts-page-row--header">
            <p className="contacts-page-eyebrow">
              {formatRuInline(contactsCopy.channelsEyebrow)}
            </p>
            <h2
              id="contacts-channels-heading"
              className="contacts-page-col-title"
            >
              {formatRuInline(contactsCopy.channelsHeading)}
            </h2>
          </header>
          <div className="contacts-page-row contacts-page-row--primary contacts-page-row--primary-phones">
            <ContactActionGrid
              density="page"
              layout="pair"
              className="contacts-page-action-grid contacts-page-phone-pair"
            >
              <ContactPhoneAction
                label={showroomContacts.freeCall.label}
                display={showroomContacts.freeCall.display}
                tel={showroomContacts.freeCall.tel}
                tone="primary"
              />
              <ContactPhoneAction
                label={showroomContacts.writeOrCall.label}
                display={showroomContacts.writeOrCall.display}
                tel={showroomContacts.writeOrCall.tel}
                tone="secondary"
              />
            </ContactActionGrid>
          </div>
          <div className="contacts-page-row contacts-page-row--secondary">
            <ContactMessengerActions density="page" />
          </div>
        </section>
      </div>

      <section className="contacts-page-cta" aria-labelledby="contacts-cta-heading">
        <div className="contacts-page-cta-copy">
          <h2 id="contacts-cta-heading" className="contacts-page-cta-title">
            {formatRuInline(contactsCopy.ctaTitle)}
          </h2>
          <p className="contacts-page-cta-body">
            {formatRuInline(contactsCopy.ctaBody)}
          </p>
        </div>
        <div className="contacts-page-cta-actions">
          <Link
            href="/bespoke/request"
            className="btn btn-primary contacts-page-cta-btn"
          >
            {contactsCopy.ctaPrimary}
          </Link>
        </div>
      </section>
    </div>
  )
}
