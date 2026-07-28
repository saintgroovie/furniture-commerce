import { showroomContacts } from "@/lib/showroom-contacts"
import { formatRuInline } from "@/lib/format-ru-copy"

type PhoneLinkProps = {
  label: string
  display: string
  tel: string
  /** Root class; label/number suffixes `-label` / `-number`. */
  className?: string
}

/** Shared tel: action used by header previews and the contacts page. */
export function ContactPhoneLink({
  label,
  display,
  tel,
  className = "showroom-contacts-phone",
}: PhoneLinkProps) {
  return (
    <a className={className} href={`tel:${tel}`}>
      <span className={`${className}-label`}>{formatRuInline(label)}</span>
      <span className={`${className}-number`}>{display}</span>
    </a>
  )
}

type MessengerListProps = {
  ariaLabel?: string
  listClassName?: string
  itemClassName?: string
  linkClassName?: string
  textClassName?: string
}

/** Shared messenger row from SoT - MAX stays text-only when href is null. */
export function ContactMessengerList({
  ariaLabel = "Мессенджеры",
  listClassName = "showroom-contacts-messengers",
  itemClassName = "showroom-contacts-messenger-item",
  linkClassName = "showroom-contacts-messenger-link",
  textClassName = "showroom-contacts-messenger-text",
}: MessengerListProps) {
  return (
    <ul className={listClassName} aria-label={ariaLabel}>
      {showroomContacts.messengers.map((item) => (
        <li key={item.id} className={itemClassName}>
          {item.href ? (
            <a
              className={linkClassName}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {item.label}
            </a>
          ) : (
            <span
              className={textClassName}
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
