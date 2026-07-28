import { showroomContacts } from "@/lib/showroom-contacts"
import { formatRuInline } from "@/lib/format-ru-copy"
import {
  ContactMessengerList,
  ContactPhoneLink,
} from "@/components/contact-channel-primitives"

export type ShowroomContactsVariant = "showroom" | "contacts"

type Props = {
  variant: ShowroomContactsVariant
  /** Optional id prefix so multiple mounts keep unique aria ids. */
  idPrefix?: string
}

/**
 * Header preview bodies from `showroomContacts`.
 * Full `/contacts` page uses `ContactsPageLayout` - not this component.
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
        <div className="showroom-contacts-actions">
          <ContactPhoneLink
            label={showroomContacts.showroomCallLabel}
            display={showroomContacts.writeOrCall.display}
            tel={showroomContacts.writeOrCall.tel}
          />
        </div>
      </div>
    )
  }

  return (
    <div className={rootClass} role="group" aria-labelledby={titleId}>
      <p id={titleId} className="showroom-contacts-title">
        {formatRuInline(showroomContacts.contactsTitle)}
      </p>
      <div className="showroom-contacts-actions">
        <ContactPhoneLink
          label={showroomContacts.freeCall.label}
          display={showroomContacts.freeCall.display}
          tel={showroomContacts.freeCall.tel}
        />
        <ContactPhoneLink
          label={showroomContacts.writeOrCall.label}
          display={showroomContacts.writeOrCall.display}
          tel={showroomContacts.writeOrCall.tel}
        />
      </div>
      <div className="showroom-contacts-divider" aria-hidden="true" />
      <ContactMessengerList />
    </div>
  )
}
