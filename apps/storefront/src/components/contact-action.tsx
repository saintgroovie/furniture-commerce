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
export type ContactActionLayout = "leadingIcon" | "trailingBubble"

type ContactActionBaseProps = {
  density?: ContactActionDensity
  tone?: ContactActionTone
  layout?: ContactActionLayout
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

function layoutClass(layout: ContactActionLayout) {
  return layout === "trailingBubble"
    ? "contact-action--layout-trailing-bubble"
    : "contact-action--layout-leading"
}

function actionClassName({
  density = "page",
  tone = "secondary",
  layout = "leadingIcon",
  className = "",
}: {
  density?: ContactActionDensity
  tone?: ContactActionTone
  layout?: ContactActionLayout
  className?: string
}) {
  return [
    "contact-action",
    densityClass(density),
    toneClass(tone),
    layoutClass(layout),
    className,
  ]
    .filter(Boolean)
    .join(" ")
}

function ActionChrome({
  layout,
  icon,
  children,
}: {
  layout: ContactActionLayout
  icon: ReactNode
  children: ReactNode
}) {
  const iconEl = (
    <span
      className={
        layout === "trailingBubble"
          ? "contact-action-icon contact-action-icon--bubble"
          : "contact-action-icon"
      }
      aria-hidden="true"
    >
      {icon}
    </span>
  )
  const bodyEl = <span className="contact-action-body">{children}</span>

  if (layout === "trailingBubble") {
    return (
      <>
        {bodyEl}
        {iconEl}
      </>
    )
  }

  return (
    <>
      {iconEl}
      {bodyEl}
    </>
  )
}

/**
 * Shared bordered contact action tile.
 * Page and dropdown share chrome; density/layout modifiers isolate size and icon placement.
 */
export function ContactActionLink({
  href,
  density = "page",
  tone = "secondary",
  layout = "leadingIcon",
  icon,
  className,
  children,
  external = false,
  "aria-label": ariaLabel,
}: ContactActionBaseProps & {
  href: string
  external?: boolean
  "aria-label"?: string
}) {
  return (
    <a
      className={actionClassName({ density, tone, layout, className })}
      href={href}
      aria-label={ariaLabel}
      {...(external
        ? { target: "_blank", rel: "noopener noreferrer" }
        : {})}
    >
      <ActionChrome layout={layout} icon={icon}>
        {children}
      </ActionChrome>
    </a>
  )
}

/** Non-interactive channel tile (MAX). */
export function ContactActionStatic({
  density = "page",
  layout = "leadingIcon",
  icon,
  className,
  children,
  "aria-label": ariaLabel,
}: ContactActionBaseProps & { "aria-label"?: string }) {
  return (
    <span
      className={actionClassName({ density, tone: "static", layout, className })}
      aria-label={ariaLabel}
    >
      <ActionChrome layout={layout} icon={icon}>
        {children}
      </ActionChrome>
    </span>
  )
}

type PhoneTileProps = {
  label: string
  display: string
  tel: string
  density?: ContactActionDensity
  tone?: "primary" | "secondary"
  layout?: ContactActionLayout
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
  layout,
  headline,
}: PhoneTileProps) {
  const resolvedLayout: ContactActionLayout =
    layout ?? (density === "dropdown" ? "trailingBubble" : "leadingIcon")
  const iconSize = density === "dropdown" ? 14 : 18
  return (
    <ContactActionLink
      href={`tel:${tel}`}
      density={density}
      tone={tone}
      layout={resolvedLayout}
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
  layout?: ContactActionLayout
  /** Page uses full CTA; dropdown uses short label. */
  label?: string
  "aria-label"?: string
}

export function ContactMapAction({
  density = "page",
  layout,
  label,
  "aria-label": ariaLabel,
}: MapActionProps) {
  const resolvedLayout: ContactActionLayout =
    layout ?? (density === "dropdown" ? "trailingBubble" : "leadingIcon")
  const iconSize = density === "dropdown" ? 14 : 18
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
      layout={resolvedLayout}
      className="contact-action--map"
      external
      aria-label={ariaLabel}
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
  size: 14 | 16 | 18
) {
  if (id === "telegram") return <ContactSendIcon size={size} />
  return <ContactMessageIcon size={size} />
}

type MessengerGridProps = {
  density?: ContactActionDensity
}

export function ContactMessengerActions({
  density = "page",
}: MessengerGridProps) {
  const iconSize = density === "dropdown" ? 14 : 18
  const maxAccessibleLabel = `MAX - связь по номеру ${showroomContacts.writeOrCall.display}`

  return (
    <div className="contact-messenger-block">
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
                layout="leadingIcon"
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
                layout="leadingIcon"
                className="contact-action--channel"
                aria-label={maxAccessibleLabel}
                icon={channelIcon(item.id, iconSize)}
              >
                <span className="contact-action-copy contact-action-copy--single">
                  <span className="contact-action-line" aria-hidden="true">
                    {item.label}
                  </span>
                  <span className="sr-only">
                    {`связь по номеру ${showroomContacts.writeOrCall.display}`}
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
