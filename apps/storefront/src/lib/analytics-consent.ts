"use client"

import {
  YM_CONSENT_COOKIE,
  YM_CONSENT_MAX_AGE_SECONDS,
  parseYmConsent,
  type YmConsent,
} from "@/lib/analytics-config"

export function readYmConsentFromDocument(): YmConsent | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${YM_CONSENT_COOKIE}=([^;]*)`)
  )
  return parseYmConsent(match ? decodeURIComponent(match[1]) : null)
}

export function writeYmConsentToDocument(value: YmConsent): void {
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "; Secure"
      : ""
  document.cookie = `${YM_CONSENT_COOKIE}=${value}; path=/; max-age=${YM_CONSENT_MAX_AGE_SECONDS}; SameSite=Lax${secure}`
}
