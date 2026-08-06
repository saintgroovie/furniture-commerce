import { showroomContacts } from "@/lib/showroom-contacts"
import { formatRuInline } from "@/lib/format-ru-copy"

type Props = {
  /** Visual density for desktop panel vs mobile accordion body. */
  variant: "desktop" | "mobile"
  /** Optional id prefix so desktop/mobile aria ids stay unique if both mount. */
  idPrefix?: string
}

/**
 * Shared showroom contact body for header dropdown and mobile accordion.
 * Data comes only from `showroomContacts`.
 */
export function ShowroomContactsContent({ variant, idPrefix = "showroom" }: Props) {
  const titleId = `${idPrefix}-title`
  const addressId = `${idPrefix}-address`
  const isMobile = variant === "mobile"
  const rootClass = isMobile
    ? "showroom-contacts showroom-contacts--mobile"
    : "showroom-contacts showroom-contacts--desktop"

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

      <div className="showroom-contacts-actions">
        <a
          className="showroom-contacts-phone"
          href={`tel:${showroomContacts.freeCall.tel}`}
        >
          <span className="showroom-contacts-phone-label">
            {formatRuInline(showroomContacts.freeCall.label)}
          </span>
          <span className="showroom-contacts-phone-number">
            {showroomContacts.freeCall.display}
          </span>
        </a>

        <a
          className="showroom-contacts-phone"
          href={`tel:${showroomContacts.writeOrCall.tel}`}
        >
          <span className="showroom-contacts-phone-label">
            {formatRuInline(showroomContacts.writeOrCall.label)}
          </span>
          <span className="showroom-contacts-phone-number">
            {showroomContacts.writeOrCall.display}
          </span>
        </a>
      </div>

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
    </div>
  )
}
