import type { ReactNode } from "react"
import {
  ContactMapPinIcon,
  ContactPhoneIcon,
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
 * Shared bordered contact action tile (link).
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

/** Shared bordered contact action as a real button (MAX copy). */
export function ContactActionButton({
  density = "page",
  tone = "secondary",
  layout = "leadingIcon",
  icon,
  className,
  children,
  onClick,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  type = "button",
}: ContactActionBaseProps & {
  onClick?: () => void
  "aria-label"?: string
  "aria-describedby"?: string
  type?: "button" | "submit" | "reset"
}) {
  return (
    <button
      type={type}
      className={actionClassName({ density, tone, layout, className })}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      onClick={onClick}
    >
      <ActionChrome layout={layout} icon={icon}>
        {children}
      </ActionChrome>
    </button>
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
}

/**
 * Yandex Maps action.
 * Page density uses the same kicker/value contract as phone tiles.
 * Dropdown density stays compact single-line with trailing bubble.
 */
export function ContactMapAction({
  density = "page",
  layout,
}: MapActionProps) {
  const resolvedLayout: ContactActionLayout =
    layout ?? (density === "dropdown" ? "trailingBubble" : "leadingIcon")
  const iconSize = density === "dropdown" ? 14 : 18
  return (
    <ContactActionLink
      href={showroomContacts.yandexMapsUrl}
      density={density}
      tone="secondary"
      layout={resolvedLayout}
      className="contact-action--map"
      external
      aria-label={contactsCopy.mapCta}
      icon={<ContactMapPinIcon size={iconSize} />}
    >
      {density === "page" ? (
        <span className="contact-action-copy">
          <span className="contact-action-kicker">
            {formatRuInline(contactsCopy.mapKicker)}
          </span>
          <span className="contact-action-value">
            {formatRuInline(contactsCopy.mapValue)}
          </span>
        </span>
      ) : (
        <span className="contact-action-copy contact-action-copy--single">
          <span className="contact-action-line">
            {formatRuInline(contactsCopy.mapValue)}
          </span>
        </span>
      )}
    </ContactActionLink>
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
