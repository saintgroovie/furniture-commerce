import Link from "next/link"
import { CopyLines } from "@/components/copy-lines"
import {
  ContactMessengerList,
  ContactPhoneLink,
} from "@/components/contact-channel-primitives"
import { formatRuInline } from "@/lib/format-ru-copy"
import { contactsCopy } from "@/lib/woodright-copy"
import { showroomContacts } from "@/lib/showroom-contacts"

/**
 * Full `/contacts` page composition - independent from header dropdown shells.
 * Contact values come from `showroomContacts`; chrome copy from `contactsCopy`.
 */
export function ContactsPageLayout() {
  return (
    <div className="contacts-page">
      <header className="contacts-page-header">
        <h1 className="contacts-page-title">{contactsCopy.h1}</h1>
        <p className="contacts-page-intro">{formatRuInline(contactsCopy.lead)}</p>
      </header>

      <div className="contacts-page-grid">
        <section
          className="contacts-page-col contacts-page-col--showroom"
          aria-labelledby="contacts-showroom-heading"
        >
          <p className="contacts-page-eyebrow">
            {formatRuInline(contactsCopy.showroomEyebrow)}
          </p>
          <h2 id="contacts-showroom-heading" className="contacts-page-col-title">
            {formatRuInline(showroomContacts.pageShowroomHeading)}
          </h2>
          <address className="contacts-page-address">
            {showroomContacts.addressLines.map((line) => (
              <span className="contacts-page-address-line" key={line}>
                {formatRuInline(line)}
              </span>
            ))}
          </address>
          <ContactPhoneLink
            className="contacts-page-phone"
            label={showroomContacts.showroomCallLabel}
            display={showroomContacts.writeOrCall.display}
            tel={showroomContacts.writeOrCall.tel}
          />
        </section>

        <section
          className="contacts-page-col contacts-page-col--channels"
          aria-labelledby="contacts-channels-heading"
        >
          <p className="contacts-page-eyebrow">
            {formatRuInline(contactsCopy.channelsEyebrow)}
          </p>
          <h2 id="contacts-channels-heading" className="contacts-page-col-title">
            {formatRuInline(contactsCopy.channelsHeading)}
          </h2>
          <div className="contacts-page-phones">
            <ContactPhoneLink
              className="contacts-page-phone"
              label={showroomContacts.freeCall.label}
              display={showroomContacts.freeCall.display}
              tel={showroomContacts.freeCall.tel}
            />
            <ContactPhoneLink
              className="contacts-page-phone"
              label={showroomContacts.writeOrCall.label}
              display={showroomContacts.writeOrCall.display}
              tel={showroomContacts.writeOrCall.tel}
            />
          </div>
          <div className="contacts-page-messengers-block">
            <p className="contacts-page-messengers-label">
              {formatRuInline(contactsCopy.messengersLabel)}
            </p>
            <ContactMessengerList
              listClassName="contacts-page-messengers"
              itemClassName="contacts-page-messenger-item"
              linkClassName="contacts-page-messenger-link"
              textClassName="contacts-page-messenger-text"
            />
          </div>
        </section>
      </div>

      <section className="contacts-page-cta" aria-labelledby="contacts-cta-heading">
        <div className="contacts-page-cta-copy">
          <h2 id="contacts-cta-heading" className="contacts-page-cta-title">
            <CopyLines as="span" lines={contactsCopy.ctaTitle} />
          </h2>
          <CopyLines className="contacts-page-cta-body" lines={contactsCopy.ctaBody} />
        </div>
        <div className="contacts-page-cta-actions">
          <Link href="/bespoke/request" className="btn btn-primary">
            {contactsCopy.ctaPrimary}
          </Link>
          <Link href="/catalog" className="contacts-page-cta-secondary">
            {contactsCopy.ctaSecondary}
          </Link>
        </div>
      </section>
    </div>
  )
}
