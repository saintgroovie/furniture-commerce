import {
  ContactActionGrid,
  ContactMapAction,
  ContactMessengerActions,
  ContactPhoneAction,
} from "@/components/contact-action"
import { formatRuInline } from "@/lib/format-ru-copy"
import { contactsCopy } from "@/lib/woodright-copy"
import { showroomContacts } from "@/lib/showroom-contacts"

export type ShowroomContactsVariant = "showroom" | "contacts"

type Props = {
  variant: ShowroomContactsVariant
  /** Optional id prefix so multiple mounts keep unique aria ids. */
  idPrefix?: string
}

/**
 * Header preview bodies from `showroomContacts`.
 * Uses compact `ContactAction` density - not page-sized tiles.
 * Full `/contacts` page uses `ContactsPageLayout`.
 */
export function ShowroomContactsContent({
  variant,
  idPrefix = "showroom",
}: Props) {
  const titleId = `${idPrefix}-title`
  const addressId = `${idPrefix}-address`
  const rootClass = `showroom-contacts showroom-contacts--${variant}`

  if (variant === "showroom") {
    return (
      <div className={rootClass} role="group" aria-labelledby={titleId}>
        <p id={titleId} className="showroom-contacts-title">
          {formatRuInline(showroomContacts.title)}
        </p>
        <address id={addressId} className="showroom-contacts-address">
          {showroomContacts.addressLinesCompact.map((line) => (
            <span className="showroom-contacts-address-line" key={line}>
              {formatRuInline(line)}
            </span>
          ))}
        </address>
        <div className="showroom-contacts-divider" aria-hidden="true" />
        <ContactActionGrid
          density="dropdown"
          className="showroom-contacts-action-grid"
        >
          <ContactPhoneAction
            density="dropdown"
            tone="primary"
            label={contactsCopy.showroomCallCta}
            display={showroomContacts.writeOrCall.display}
            tel={showroomContacts.writeOrCall.tel}
          />
          <ContactMapAction density="dropdown" />
        </ContactActionGrid>
      </div>
    )
  }

  return (
    <div className={rootClass} role="group" aria-labelledby={titleId}>
      <p id={titleId} className="showroom-contacts-title">
        {formatRuInline(showroomContacts.contactsTitle)}
      </p>
      <div className="showroom-contacts-phone-stack">
        <ContactPhoneAction
          density="dropdown"
          label={showroomContacts.freeCall.label}
          display={showroomContacts.freeCall.display}
          tel={showroomContacts.freeCall.tel}
        />
        <ContactPhoneAction
          density="dropdown"
          label={showroomContacts.writeOrCall.label}
          display={showroomContacts.writeOrCall.display}
          tel={showroomContacts.writeOrCall.tel}
        />
      </div>
      <div className="showroom-contacts-divider" aria-hidden="true" />
      <ContactMessengerActions density="dropdown" />
    </div>
  )
}
