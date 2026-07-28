import {
  ContactMapPinIcon,
  ContactMessageIcon,
  ContactPhoneIcon,
  ContactSendIcon,
} from "@/components/contact-action-icons"
import { formatRuInline } from "@/lib/format-ru-copy"
import { contactsCopy } from "@/lib/woodright-copy"
import { showroomContacts } from "@/lib/showroom-contacts"

type PhoneActionProps = {
  label: string
  display: string
  tel: string
  /** Stronger filled treatment for the primary showroom call. */
  tone?: "primary" | "secondary"
}

/**
 * Page-only tel action - bordered button with thin icon.
 * Header dropdown keeps `ContactPhoneLink` text presentation.
 */
export function ContactsPagePhoneAction({
  label,
  display,
  tel,
  tone = "secondary",
}: PhoneActionProps) {
  const toneClass =
    tone === "primary"
      ? "contacts-action contacts-action--phone contacts-action--primary"
      : "contacts-action contacts-action--phone contacts-action--secondary"

  return (
    <div className="contacts-action-stack">
      <p className="contacts-action-label">{formatRuInline(label)}</p>
      <a className={toneClass} href={`tel:${tel}`}>
        <span className="contacts-action-icon" aria-hidden="true">
          <ContactPhoneIcon />
        </span>
        <span className="contacts-action-text">
          <span className="contacts-action-number">{display}</span>
        </span>
      </a>
    </div>
  )
}

/** External Yandex Maps CTA for the showroom venue. */
export function ContactsPageMapAction() {
  return (
    <a
      className="contacts-action contacts-action--map contacts-action--secondary"
      href={showroomContacts.yandexMapsUrl}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className="contacts-action-icon" aria-hidden="true">
        <ContactMapPinIcon />
      </span>
      <span className="contacts-action-text">
        {formatRuInline(contactsCopy.mapCta)}
      </span>
    </a>
  )
}

function messengerIcon(id: "telegram" | "whatsapp" | "max") {
  if (id === "telegram") return <ContactSendIcon />
  return <ContactMessageIcon />
}

/**
 * Page messenger actions from SoT.
 * Telegram/WhatsApp are real external links; MAX stays non-link when href is null.
 */
export function ContactsPageMessengerActions() {
  return (
    <div className="contacts-page-messengers-block">
      <p className="contacts-action-label contacts-page-messengers-label">
        {formatRuInline(contactsCopy.messengersLabel)}
      </p>
      <ul className="contacts-channel-grid" aria-label={contactsCopy.messengersLabel}>
        {showroomContacts.messengers.map((item) => (
          <li key={item.id} className="contacts-channel-grid-item">
            {item.href ? (
              <a
                className="contacts-action contacts-action--channel contacts-action--secondary"
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="contacts-action-icon" aria-hidden="true">
                  {messengerIcon(item.id)}
                </span>
                <span className="contacts-action-text">{item.label}</span>
              </a>
            ) : (
              <span
                className="contacts-action contacts-action--channel contacts-action--static"
                title={`${item.label}: напишите или позвоните на ${showroomContacts.writeOrCall.display}`}
              >
                <span className="contacts-action-icon" aria-hidden="true">
                  {messengerIcon(item.id)}
                </span>
                <span className="contacts-action-text">
                  {item.label}
                  <span className="contacts-action-muted">
                    {" "}
                    · {showroomContacts.writeOrCall.display}
                  </span>
                </span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
