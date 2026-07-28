import { showroomContacts } from "@/lib/showroom-contacts"
import { formatRuInline } from "@/lib/format-ru-copy"

export type ShowroomContactsVariant = "showroom" | "contacts" | "page"

type Props = {
  variant: ShowroomContactsVariant
  /** Optional id prefix so multiple mounts keep unique aria ids. */
  idPrefix?: string
}

function PhoneLink({
  label,
  display,
  tel,
}: {
  label: string
  display: string
  tel: string
}) {
  return (
    <a className="showroom-contacts-phone" href={`tel:${tel}`}>
      <span className="showroom-contacts-phone-label">{formatRuInline(label)}</span>
      <span className="showroom-contacts-phone-number">{display}</span>
    </a>
  )
}

function MessengerList() {
  return (
    <ul className="showroom-contacts-messengers" aria-label="Мессенджеры">
      {showroomContacts.messengers.map((item) => (
        <li key={item.id} className="showroom-contacts-messenger-item">
          {item.href ? (
            <a
              className="showroom-contacts-messenger-link"
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {item.label}
            </a>
          ) : (
            <span
              className="showroom-contacts-messenger-text"
              title={`${item.label}: напишите или позвоните на ${showroomContacts.writeOrCall.display}`}
            >
              {item.label}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

/**
 * Shared contact body from `showroomContacts`.
 * Variants split IA: location preview vs contact channels vs full page.
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
          {formatRuInline(showroomContacts.showroomDropdownTitle)}
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
          <PhoneLink
            label={showroomContacts.showroomCallLabel}
            display={showroomContacts.writeOrCall.display}
            tel={showroomContacts.writeOrCall.tel}
          />
        </div>
      </div>
    )
  }

  if (variant === "contacts") {
    return (
      <div className={rootClass} role="group" aria-labelledby={titleId}>
        <p id={titleId} className="showroom-contacts-title">
          {formatRuInline(showroomContacts.contactsTitle)}
        </p>
        <div className="showroom-contacts-actions">
          <PhoneLink
            label={showroomContacts.freeCall.label}
            display={showroomContacts.freeCall.display}
            tel={showroomContacts.freeCall.tel}
          />
          <PhoneLink
            label={showroomContacts.writeOrCall.label}
            display={showroomContacts.writeOrCall.display}
            tel={showroomContacts.writeOrCall.tel}
          />
        </div>
        <div className="showroom-contacts-divider" aria-hidden="true" />
        <MessengerList />
      </div>
    )
  }

  // page - full information
  return (
    <div className={rootClass} role="group" aria-labelledby={titleId}>
      <p id={titleId} className="showroom-contacts-title">
        {formatRuInline(showroomContacts.title)}
      </p>
      <address id={addressId} className="showroom-contacts-address">
        {showroomContacts.addressLines.map((line) => (
          <span className="showroom-contacts-address-line" key={line}>
            {formatRuInline(line)}
          </span>
        ))}
      </address>
      <div className="showroom-contacts-divider" aria-hidden="true" />
      <div className="showroom-contacts-actions">
        <PhoneLink
          label={showroomContacts.freeCall.label}
          display={showroomContacts.freeCall.display}
          tel={showroomContacts.freeCall.tel}
        />
        <PhoneLink
          label={showroomContacts.writeOrCall.label}
          display={showroomContacts.writeOrCall.display}
          tel={showroomContacts.writeOrCall.tel}
        />
      </div>
      <MessengerList />
    </div>
  )
}
