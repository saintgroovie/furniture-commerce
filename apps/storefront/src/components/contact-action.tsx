import type { ReactNode } from "react"
import {
  ContactMapPinIcon,
  ContactMessageIcon,
  ContactPhoneIcon,
  ContactSendIcon,
} from "@/components/contact-action-icons"
import { formatRuInline } from "@/lib/format-ru-copy"
import { contactsCopy } from "@/lib/woodright-copy"
import { showroomContacts } from "@/lib/showroom-contacts"

export type ContactActionDensity = "page" | "dropdown"
export type ContactActionTone = "primary" | "secondary" | "static"

type ContactActionBaseProps = {
  density?: ContactActionDensity
  tone?: ContactActionTone
  icon: ReactNode
  className?: string
  children: ReactNode
}

function densityClass(density: ContactActionDensity) {
  return density === "dropdown"
    ? "contact-action--density-dropdown"
    : "contact-action--density-page"
}

function toneClass(tone: ContactActionTone) {
  if (tone === "primary") return "contact-action--primary"
  if (tone === "static") return "contact-action--static"
  return "contact-action--secondary"
}

function actionClassName({
  density = "page",
  tone = "secondary",
  className = "",
}: {
  density?: ContactActionDensity
  tone?: ContactActionTone
  className?: string
}) {
  return [
    "contact-action",
    densityClass(density),
    toneClass(tone),
    className,
  ]
    .filter(Boolean)
    .join(" ")
}

/**
 * Shared bordered contact action tile.
 * Page and dropdown share chrome; density modifiers set size only.
 */
export function ContactActionLink({
  href,
  density = "page",
  tone = "secondary",
  icon,
  className,
  children,
  external = false,
}: ContactActionBaseProps & {
  href: string
  external?: boolean
}) {
  return (
    <a
      className={actionClassName({ density, tone, className })}
      href={href}
      {...(external
        ? { target: "_blank", rel: "noopener noreferrer" }
        : {})}
    >
      <span className="contact-action-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="contact-action-body">{children}</span>
    </a>
  )
}

/** Non-interactive channel tile (MAX). */
export function ContactActionStatic({
  density = "page",
  icon,
  className,
  children,
  title,
}: ContactActionBaseProps & { title?: string }) {
  return (
    <span
      className={actionClassName({ density, tone: "static", className })}
      title={title}
    >
      <span className="contact-action-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="contact-action-body">{children}</span>
    </span>
  )
}

type PhoneTileProps = {
  label: string
  display: string
  tel: string
  density?: ContactActionDensity
  tone?: "primary" | "secondary"
  /** Optional primary line above the number (dropdown showroom CTA). */
  headline?: string
}

/** Phone tile: label + number live inside one tel: link. */
export function ContactPhoneAction({
  label,
  display,
  tel,
  density = "page",
  tone = "secondary",
  headline,
}: PhoneTileProps) {
  const iconSize = density === "dropdown" ? 16 : 18
  return (
    <ContactActionLink
      href={`tel:${tel}`}
      density={density}
      tone={tone}
      className="contact-action--phone"
      icon={<ContactPhoneIcon size={iconSize} />}
    >
      <span className="contact-action-copy">
        {headline ? (
          <span className="contact-action-headline">
            {formatRuInline(headline)}
          </span>
        ) : null}
        <span className="contact-action-kicker">{formatRuInline(label)}</span>
        <span className="contact-action-value">{display}</span>
      </span>
    </ContactActionLink>
  )
}

type MapActionProps = {
  density?: ContactActionDensity
  /** Page uses full CTA; dropdown uses short label. */
  label?: string
}

export function ContactMapAction({
  density = "page",
  label,
}: MapActionProps) {
  const iconSize = density === "dropdown" ? 16 : 18
  const text =
    label ??
    (density === "dropdown"
      ? contactsCopy.mapCtaShort
      : contactsCopy.mapCta)
  return (
    <ContactActionLink
      href={showroomContacts.yandexMapsUrl}
      density={density}
      tone="secondary"
      className="contact-action--map"
      external
      icon={<ContactMapPinIcon size={iconSize} />}
    >
      <span className="contact-action-copy contact-action-copy--single">
        <span className="contact-action-line">{formatRuInline(text)}</span>
      </span>
    </ContactActionLink>
  )
}

function channelIcon(
  id: "telegram" | "whatsapp" | "max",
  size: 16 | 18
) {
  if (id === "telegram") return <ContactSendIcon size={size} />
  return <ContactMessageIcon size={size} />
}

type MessengerGridProps = {
  density?: ContactActionDensity
  /** Page shows `MAX · phone`; dropdown shows `MAX` only. */
  maxWithPhone?: boolean
}

export function ContactMessengerActions({
  density = "page",
  maxWithPhone = density === "page",
}: MessengerGridProps) {
  const iconSize = density === "dropdown" ? 16 : 18
  return (
    <div className="contact-messenger-block">
      {density === "page" ? (
        <p className="contact-messenger-label">
          {formatRuInline(contactsCopy.messengersLabel)}
        </p>
      ) : null}
      <ul
        className={`contact-action-grid contact-action-grid--channels contact-action-grid--${density}`}
        aria-label={contactsCopy.messengersLabel}
      >
        {showroomContacts.messengers.map((item) => (
          <li key={item.id} className="contact-action-grid-item">
            {item.href ? (
              <ContactActionLink
                href={item.href}
                density={density}
                tone="secondary"
                className="contact-action--channel"
                external
                icon={channelIcon(item.id, iconSize)}
              >
                <span className="contact-action-copy contact-action-copy--single">
                  <span className="contact-action-line">{item.label}</span>
                </span>
              </ContactActionLink>
            ) : (
              <ContactActionStatic
                density={density}
                className="contact-action--channel"
                title={`${item.label}: напишите или позвоните на ${showroomContacts.writeOrCall.display}`}
                icon={channelIcon(item.id, iconSize)}
              >
                <span className="contact-action-copy contact-action-copy--single">
                  <span className="contact-action-line">
                    {item.label}
                    {maxWithPhone ? (
                      <span className="contact-action-muted">
                        {" "}
                        · {showroomContacts.writeOrCall.display}
                      </span>
                    ) : null}
                  </span>
                </span>
              </ContactActionStatic>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Equal two-column action grid shared by showroom + contacts page columns. */
export function ContactActionGrid({
  density = "page",
  children,
  className = "",
}: {
  density?: ContactActionDensity
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`contact-action-grid contact-action-grid--pair contact-action-grid--${density} ${className}`.trim()}
    >
      {children}
    </div>
  )
}
