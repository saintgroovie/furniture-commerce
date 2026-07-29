"use client"

import {
  ContactActionLink,
  type ContactActionDensity,
} from "@/components/contact-action"
import {
  ContactMessageIcon,
  ContactSendIcon,
} from "@/components/contact-action-icons"
import { MaxContactAction } from "@/components/max-contact-action"
import { formatRuInline } from "@/lib/format-ru-copy"
import { contactsCopy } from "@/lib/woodright-copy"
import { showroomContacts } from "@/lib/showroom-contacts"

function channelIcon(id: "telegram" | "whatsapp", size: 14 | 16 | 18) {
  if (id === "telegram") return <ContactSendIcon size={size} />
  return <ContactMessageIcon size={size} />
}

type MessengerGridProps = {
  density?: ContactActionDensity
}

function linkChannels() {
  return showroomContacts.messengers.flatMap((item) => {
    if (item.id === "telegram" || item.id === "whatsapp") {
      if (!item.href) return []
      return [
        {
          id: item.id,
          label: item.label,
          href: item.href,
        } as const,
      ]
    }
    return []
  })
}

/**
 * Page: three equal channel tiles (Telegram / WhatsApp / MAX).
 * Dropdown: real messenger pair + separate full-width MAX copy utility.
 * MAX purpose lives inside the action - no external helper caption.
 */
export function ContactMessengerActions({
  density = "page",
}: MessengerGridProps) {
  const channels = linkChannels()

  if (density === "dropdown") {
    return (
      <div className="contact-messenger-block contact-dropdown-channels">
        <ul
          className="contact-action-grid contact-dropdown-channel-pair"
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
                aria-label={
                  item.id === "telegram"
                    ? contactsCopy.messengerTelegramAria
                    : contactsCopy.messengerWhatsappAria
                }
                icon={channelIcon(item.id, 14)}
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
        <MaxContactAction density="dropdown" />
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
              icon={channelIcon(item.id, 16)}
            >
              <span className="contact-action-copy">
                <span className="contact-action-kicker">
                  {formatRuInline(item.label)}
                </span>
                <span className="contact-action-value">
                  {formatRuInline(contactsCopy.messengerWriteValue)}
                </span>
              </span>
            </ContactActionLink>
          </li>
        ))}
        <li className="contact-action-grid-item contact-action-grid-item--max">
          <MaxContactAction density="page" />
        </li>
      </ul>
    </div>
  )
}
