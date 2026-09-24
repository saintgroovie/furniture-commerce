"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { CopyLines } from "@/components/copy-lines"
import { writeYmConsentToDocument } from "@/lib/analytics-consent"
import type { YmConsent } from "@/lib/analytics-config"
import { teardownYandexMetrika } from "@/lib/analytics-metrika"
import { analyticsConsentCopy } from "@/lib/woodright-copy"

type Props = {
  counterId: string
  initialConsent: YmConsent | null
}

type YmStub = ((id: number, method: string, ...args: unknown[]) => void) & {
  a?: unknown[][]
  l?: number
}

declare global {
  interface Window {
    ym?: YmStub
  }
}

function ensureMetrika(counterId: string): void {
  const id = Number(counterId)
  if (!Number.isInteger(id) || id <= 0) return
  if (typeof window === "undefined") return

  if (typeof window.ym !== "function") {
    const stub: YmStub = (...args: unknown[]) => {
      stub.a = stub.a || []
      stub.a.push(args)
    }
    stub.l = Date.now()
    window.ym = stub
    const script = document.createElement("script")
    script.async = true
    script.src = "https://mc.yandex.ru/metrika/tag.js"
    document.head.appendChild(script)
    window.ym(id, "init", {
      clickmap: false,
      trackLinks: true,
      accurateTrackBounce: true,
      webvisor: false,
      ecommerce: false,
    })
    return
  }

  window.ym(id, "hit", window.location.href)
}

export function StorefrontAnalytics({
  counterId,
  initialConsent,
}: Props) {
  const pathname = usePathname()
  const [consent, setConsent] = useState<YmConsent | null>(initialConsent)
  const loaded = useRef(false)
  const lastHit = useRef<string | null>(null)

  const enable = useCallback(() => {
    if (loaded.current) return
    loaded.current = true
    ensureMetrika(counterId)
    lastHit.current = pathname
  }, [counterId, pathname])

  useEffect(() => {
    if (consent !== "1") return
    enable()
  }, [consent, enable])

  useEffect(() => {
    if (consent !== "1") return
    if (!loaded.current) return
    if (lastHit.current === pathname) return
    lastHit.current = pathname
    const id = Number(counterId)
    if (!Number.isInteger(id) || id <= 0) return
    window.ym?.(id, "hit", window.location.href)
  }, [consent, counterId, pathname])

  function choose(next: YmConsent) {
    writeYmConsentToDocument(next)
    if (next === "0") {
      teardownYandexMetrika(counterId, window, document)
      loaded.current = false
      lastHit.current = null
    }
    setConsent(next)
  }

  if (consent === "0") return null

  if (consent === "1") {
    return (
      <p className="analytics-consent-revoke">
        <button
          type="button"
          className="analytics-consent-revoke-btn"
          onClick={() => choose("0")}
        >
          {analyticsConsentCopy.turnOff}
        </button>
      </p>
    )
  }

  return (
    <div
      className="analytics-consent"
      role="region"
      aria-label={analyticsConsentCopy.regionLabel}
    >
      <div className="analytics-consent-inner">
        <CopyLines
          className="analytics-consent-lead"
          lines={analyticsConsentCopy.lead}
        />
        <p className="analytics-consent-more">
          <Link href="/cookies">{analyticsConsentCopy.cookiesLink}</Link>
        </p>
        <div className="analytics-consent-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => choose("1")}
          >
            {analyticsConsentCopy.accept}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => choose("0")}
          >
            {analyticsConsentCopy.decline}
          </button>
        </div>
      </div>
    </div>
  )
}
