"use client"

import { useId, useState } from "react"
import {
  ContactActionLink,
  type ContactActionDensity,
} from "@/components/contact-action"
import {
  ContactMessageIcon,
  ContactSendIcon,
} from "@/components/contact-action-icons"
import {
  MaxContactAction,
  type MaxCopyState,
} from "@/components/max-contact-action"
import { formatRuInline } from "@/lib/format-ru-copy"
import { contactsCopy } from "@/lib/woodright-copy"
import { showroomContacts } from "@/lib/showroom-contacts"

function channelIcon(id: "telegram" | "whatsapp", size: 14 | 16 | 18) {
  if (id === "telegram") return <ContactSendIcon size={size} />
  return <ContactMessageIcon size={size} />
}

function helperFor(state: MaxCopyState) {
  if (state === "copied") return contactsCopy.maxDropdownHelperCopied
  if (state === "error") return contactsCopy.maxCopyError
  return contactsCopy.maxDropdownHelper
}

type MessengerGridProps = {
  density?: ContactActionDensity
}

export function ContactMessengerActions({
  density = "page",
}: MessengerGridProps) {
  const iconSize = density === "dropdown" ? 14 : 18
  const helperId = useId()
  const [maxState, setMaxState] = useState<MaxCopyState>("idle")
  const linkChannels = showroomContacts.messengers.flatMap((item) => {
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

  return (
    <div className="contact-messenger-block">
      <ul
        className={`contact-action-grid contact-action-grid--channels contact-action-grid--${density}`}
        aria-label={contactsCopy.messengersLabel}
      >
        {linkChannels.map((item) => (
          <li key={item.id} className="contact-action-grid-item">
            <ContactActionLink
              href={item.href}
              density={density}
              tone="secondary"
              layout="leadingIcon"
              className="contact-action--channel"
              external
              icon={channelIcon(item.id, iconSize)}
            >
              {density === "page" ? (
                <span className="contact-action-copy">
                  <span className="contact-action-kicker">
                    {formatRuInline(item.label)}
                  </span>
                  <span className="contact-action-value">
                    {formatRuInline(contactsCopy.messengerWriteValue)}
                  </span>
                </span>
              ) : (
                <span className="contact-action-copy contact-action-copy--single">
                  <span className="contact-action-line">{item.label}</span>
                </span>
              )}
            </ContactActionLink>
          </li>
        ))}
        <li className="contact-action-grid-item contact-action-grid-item--max">
          <MaxContactAction density={density} onStateChange={setMaxState} />
        </li>
      </ul>
      {density === "dropdown" ? (
        <p
          id={helperId}
          className="contact-max-helper"
          aria-live="polite"
        >
          {formatRuInline(helperFor(maxState))}
        </p>
      ) : null}
    </div>
  )
}
