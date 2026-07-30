"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  ContactActionButton,
  type ContactActionDensity,
} from "@/components/contact-action"
import {
  ContactCheckIcon,
  ContactCopyIcon,
} from "@/components/contact-action-icons"
import { formatRuInline } from "@/lib/format-ru-copy"
import { contactsCopy } from "@/lib/woodright-copy"
import { showroomContacts } from "@/lib/showroom-contacts"

export type MaxCopyState = "idle" | "copied" | "error"

async function copyText(text: string): Promise<boolean> {
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to legacy path
  }

  try {
    const active = document.activeElement
    const textarea = document.createElement("textarea")
    textarea.value = text
    textarea.setAttribute("readonly", "")
    textarea.style.position = "fixed"
    textarea.style.left = "-9999px"
    textarea.style.top = "0"
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand("copy")
    document.body.removeChild(textarea)
    // Restore focus so header hover dropdowns are not closed by the
    // temporary off-screen textarea focus move.
    if (active instanceof HTMLElement) {
      active.focus({ preventScroll: true })
    }
    return ok
  } catch {
    return false
  }
}

type MaxContactActionProps = {
  density?: ContactActionDensity
  onStateChange?: (state: MaxCopyState) => void
}

/**
 * Honest MAX action: copies the Woodright direct phone number so the visitor
 * can find the brand inside the MAX app. No invented chat deeplink.
 *
 * Page: channel tile (leading copy icon + kicker/value).
 * Dropdown: full-width utility row (kicker/value + trailing copy bubble).
 */
export function MaxContactAction({
  density = "page",
  onStateChange,
}: MaxContactActionProps) {
  const [state, setState] = useState<MaxCopyState>("idle")
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tel = showroomContacts.writeOrCall.tel
  const display = showroomContacts.writeOrCall.display
  const iconSize = density === "dropdown" ? 14 : 16
  const isDropdown = density === "dropdown"

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current)
    }
  }, [])

  const publish = useCallback(
    (next: MaxCopyState) => {
      setState(next)
      onStateChange?.(next)
    },
    [onStateChange]
  )

  const scheduleReset = useCallback(() => {
    if (resetTimer.current) clearTimeout(resetTimer.current)
    resetTimer.current = setTimeout(() => publish("idle"), 2500)
  }, [publish])

  const onCopy = useCallback(async () => {
    const ok = await copyText(tel)
    publish(ok ? "copied" : "error")
    scheduleReset()
  }, [publish, scheduleReset, tel])

  const ariaLabel =
    state === "copied"
      ? contactsCopy.maxAriaCopied.replace("{display}", display)
      : state === "error"
        ? contactsCopy.maxAriaError
        : contactsCopy.maxAriaIdle.replace("{display}", display)

  const visibleValue = isDropdown
    ? state === "copied"
      ? contactsCopy.maxDropdownCopiedValue
      : state === "error"
        ? contactsCopy.maxDropdownErrorValue
        : contactsCopy.maxDropdownCopyValue
    : state === "copied"
      ? contactsCopy.maxCopiedValue
      : state === "error"
        ? contactsCopy.maxVisibleError
        : contactsCopy.maxCopyValue

  const liveStatus =
    state === "copied"
      ? contactsCopy.maxAriaCopied.replace("{display}", display)
      : state === "error"
        ? contactsCopy.maxAriaError
        : ""

  const icon =
    state === "copied" ? (
      <ContactCheckIcon size={iconSize} />
    ) : (
      <ContactCopyIcon size={iconSize} />
    )

  return (
    <div
      className={
        isDropdown
          ? "contact-action-max-wrap contact-dropdown-max-wrap"
          : "contact-action-max-wrap"
      }
    >
      <ContactActionButton
        density={density}
        tone="secondary"
        layout={isDropdown ? "trailingBubble" : "leadingIcon"}
        className={[
          isDropdown
            ? "contact-dropdown-max-action"
            : "contact-action--channel contact-action--max",
          state === "copied" ? "contact-action--copied" : "",
          state === "error" ? "contact-action--copy-error" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        icon={icon}
        iconClassName={isDropdown ? "contact-dropdown-max-bubble" : undefined}
        aria-label={ariaLabel}
        onClick={() => {
          void onCopy()
        }}
      >
        <span className="contact-action-copy">
          <span className="contact-action-kicker">
            {formatRuInline(contactsCopy.maxLabel)}
          </span>
          <span className="contact-action-value">
            {formatRuInline(visibleValue)}
          </span>
        </span>
      </ContactActionButton>
      <span className="sr-only" aria-live="polite">
        {liveStatus}
      </span>
    </div>
  )
}
