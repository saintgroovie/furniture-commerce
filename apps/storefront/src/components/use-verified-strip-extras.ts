"use client"

import { useEffect, useMemo, useState } from "react"
import {
  DEFAULT_STRIP_IMAGE_PROBE_LIMIT,
  filterExtrasBySuccessfulImageLoad,
} from "@/lib/client/extra-image-url-verify"

export type UseVerifiedStripExtrasOptions = {
  /** Cap parallel Image() probes. Default 12 (PDP). Cards use 4. */
  maxProbes?: number
  /**
   * When false, skip probes and hide unverified extras (hero-only strip).
   * Catalog cards set this from IntersectionObserver / pointer enter.
   * Omit or true for PDP (immediate probe).
   */
  enabled?: boolean
}

/**
 * Pre-validates strip URLs so broken `<img>` never appears in the thumb row.
 * Hero swap still uses preload as a second guard.
 */
export function useVerifiedStripExtras(
  extraSrcs: string[],
  failedExtras: Set<string>,
  options?: UseVerifiedStripExtrasOptions
): string[] {
  const maxProbes = options?.maxProbes ?? DEFAULT_STRIP_IMAGE_PROBE_LIMIT
  const enabled = options?.enabled !== false
  const [verified, setVerified] = useState<string[]>([])
  const [probeDone, setProbeDone] = useState(false)
  const key = extraSrcs.join("\u0000")

  useEffect(() => {
    let cancelled = false
    if (!enabled) {
      setVerified([])
      setProbeDone(false)
      return () => {
        cancelled = true
      }
    }
    if (extraSrcs.length === 0) {
      setVerified([])
      setProbeDone(true)
      return () => {
        cancelled = true
      }
    }
    setVerified([])
    setProbeDone(false)
    filterExtrasBySuccessfulImageLoad(extraSrcs, maxProbes).then((ok) => {
      if (!cancelled) {
        setVerified(ok)
        setProbeDone(true)
      }
    })
    return () => {
      cancelled = true
    }
    // `key` encodes `extraSrcs` content; avoid `[extraSrcs]` to prevent ref-noise re-probes.
  }, [key, enabled, maxProbes]) // eslint-disable-line react-hooks/exhaustive-deps -- keyed by joined extraSrcs

  return useMemo(() => {
    if (!enabled) return []
    // Never expose unverified extras (broken thumbnails must not flash).
    if (!probeDone) return []
    return verified.filter((u) => !failedExtras.has(u))
  }, [enabled, probeDone, verified, failedExtras])
}
