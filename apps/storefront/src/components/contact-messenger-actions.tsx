import {
  ContactActionLink,
  type ContactActionDensity,
} from "@/components/contact-action"
import {
  ContactMessageIcon,
  ContactSendIcon,
} from "@/components/contact-action-icons"
import { formatRuInline } from "@/lib/format-ru-copy"
import { contactsCopy } from "@/lib/woodright-copy"
import { showroomContacts } from "@/lib/showroom-contacts"

function channelIcon(id: "telegram" | "whatsapp" | "max", size: 14 | 16) {
  if (id === "telegram") return <ContactSendIcon size={size} />
  return <ContactMessageIcon size={size} />
}

function channelAria(id: "telegram" | "whatsapp" | "max"): string {
  if (id === "telegram") return contactsCopy.messengerTelegramAria
  if (id === "whatsapp") return contactsCopy.messengerWhatsappAria
  return contactsCopy.messengerMaxAria
}

function channelValue(id: "telegram" | "whatsapp" | "max"): string {
  if (id === "max") return contactsCopy.maxWriteValue
  return contactsCopy.messengerWriteValue
}

type MessengerGridProps = {
  density?: ContactActionDensity
}

/**
 * Page + dropdown messenger channels from `showroomContacts.messengers`.
 * Every channel is a real external link - no copy-number utility.
 */
export function ContactMessengerActions({
  density = "page",
}: MessengerGridProps) {
  const channels = showroomContacts.messengers
  const iconSize = density === "dropdown" ? 14 : 16

  if (density === "dropdown") {
    return (
      <div className="contact-messenger-block contact-dropdown-channels">
        <ul
          className="contact-action-grid contact-dropdown-channel-trio"
          aria-label={contactsCopy.messengersLabel}
        >
          {channels.map((item) => (
            <li key={item.id} className="contact-action-grid-item">
              <ContactActionLink
                href={item.href}
                density="dropdown"
                tone="secondary"
                layout="leadingIcon"
                className="contact-action--channel contact-dropdown-channel-link"
                external
                aria-label={channelAria(item.id)}
                icon={channelIcon(item.id, iconSize)}
              >
                <span className="contact-action-copy contact-action-copy--single">
                  <span className="contact-action-line">
                    {formatRuInline(item.label)}
                  </span>
                </span>
              </ContactActionLink>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="contact-messenger-block">
      <ul
        className="contact-action-grid contact-action-grid--channels contact-action-grid--page"
        aria-label={contactsCopy.messengersLabel}
      >
        {channels.map((item) => (
          <li key={item.id} className="contact-action-grid-item">
            <ContactActionLink
              href={item.href}
              density="page"
              tone="secondary"
              layout="leadingIcon"
              className="contact-action--channel"
              external
              aria-label={channelAria(item.id)}
              icon={channelIcon(item.id, iconSize)}
            >
              <span className="contact-action-copy">
                <span className="contact-action-kicker">
                  {formatRuInline(item.label)}
                </span>
                <span className="contact-action-value">
                  {formatRuInline(channelValue(item.id))}
                </span>
              </span>
            </ContactActionLink>
          </li>
        ))}
      </ul>
    </div>
  )
}
