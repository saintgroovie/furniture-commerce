"use client"

import { useEffect, useMemo, useState } from "react"
import { filterExtrasBySuccessfulImageLoad } from "@/lib/client/extra-image-url-verify"

/**
 * Pre-validates strip URLs so broken `<img>` never appears in the thumb row.
 * Hero swap still uses preload as a second guard.
 */
export function useVerifiedStripExtras(
  extraSrcs: string[],
  failedExtras: Set<string>
): string[] {
  const [verified, setVerified] = useState<string[]>([])
  const key = extraSrcs.join("\u0000")

  useEffect(() => {
    let cancelled = false
    if (extraSrcs.length === 0) {
      setVerified([])
      return () => {
        cancelled = true
      }
    }
    setVerified([])
    filterExtrasBySuccessfulImageLoad(extraSrcs).then((ok) => {
      if (!cancelled) setVerified(ok)
    })
    return () => {
      cancelled = true
    }
    // `key` encodes `extraSrcs` content; avoid `[extraSrcs]` to prevent ref-noise re-probes.
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps -- keyed by joined extraSrcs

  return useMemo(
    () => verified.filter((u) => !failedExtras.has(u)),
    [verified, failedExtras]
  )
}
