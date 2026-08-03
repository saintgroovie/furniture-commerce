/**
 * Thin line icons for contact page + dropdown actions.
 * Matches local bespoke-help-icons style - no new icon dependency.
 */

type IconSize = 14 | 16 | 18

function baseProps(size: IconSize = 18) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
    focusable: false as const,
  }
}

/** Handset for phone actions. */
export function ContactPhoneIcon({ size = 18 }: { size?: IconSize }) {
  return (
    <svg {...baseProps(size)}>
      <path d="M6.2 4.8c.5-.5 1.3-.6 1.9-.2l2.1 1.3c.6.4.8 1.2.5 1.9l-.8 1.7c-.2.4-.1.9.2 1.2l3.2 3.2c.3.3.8.4 1.2.2l1.7-.8c.7-.3 1.5-.1 1.9.5l1.3 2.1c.4.6.3 1.4-.2 1.9l-1.1 1.1c-.6.6-1.5.9-2.4.7-2.2-.5-4.8-2.1-7.3-4.6S4.7 10.3 4.2 8.1c-.2-.9.1-1.8.7-2.4l1.3-1z" />
    </svg>
  )
}

/** Map pin for Yandex Maps CTA. */
export function ContactMapPinIcon({ size = 18 }: { size?: IconSize }) {
  return (
    <svg {...baseProps(size)}>
      <path d="M12 21s6.5-5.2 6.5-10.2A6.5 6.5 0 0 0 12 4.3a6.5 6.5 0 0 0-6.5 6.5C5.5 15.8 12 21 12 21z" />
      <circle cx="12" cy="10.8" r="2.1" />
    </svg>
  )
}

/** Paper-plane metaphor for Telegram. */
export function ContactSendIcon({ size = 18 }: { size?: IconSize }) {
  return (
    <svg {...baseProps(size)}>
      <path d="M4.2 11.4L19.5 4.6c.6-.3 1.2.3.9.9l-6.8 15.3c-.3.6-1.1.5-1.3-.2l-1.7-5.2-5.2-1.7c-.7-.2-.8-1-.2-1.3z" />
      <path d="M11.6 15.4L19.8 5.5" />
    </svg>
  )
}

/** Message bubble metaphor for WhatsApp / MAX / generic chat. */
export function ContactMessageIcon({ size = 18 }: { size?: IconSize }) {
  return (
    <svg {...baseProps(size)}>
      <path d="M5.5 18.2l1.4-2.6A7 7 0 1 1 9.2 18.8l-3.7.6c-.5.1-.9-.3-.8-.8l.8-2.4z" />
    </svg>
  )
}
