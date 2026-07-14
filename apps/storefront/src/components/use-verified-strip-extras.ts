"use client"

import { useEffect, useMemo, useState } from "react"
import {
  DEFAULT_STRIP_IMAGE_PROBE_LIMIT,
  filterExtrasBySuccessfulImageLoad,
  selectUrlsToProbe,
} from "@/lib/client/extra-image-url-verify"

export type UseVerifiedStripExtrasOptions = {
  /** Cap Image() probes / optimistic strip length. Default 12 (PDP). Cards use 4. */
  maxProbes?: number
  /**
   * When false, hide strip candidates (catalog below-fold deferral).
   * Omit or true for PDP.
   */
  enabled?: boolean
  /**
   * `verify` (default): Image() preflight (PDP only).
   * `optimistic`: show capped candidates immediately; prune via onThumbError.
   * Catalog must use optimistic — verify mode stampedes the connection pool.
   */
  mode?: "verify" | "optimistic"
}

/**
 * Strip URL gate for thumbs.
 * Catalog: optimistic capped list (no Image() probes).
 * PDP: single-pass Image() verification (no retry, no global gate).
 */
export function useVerifiedStripExtras(
  extraSrcs: string[],
  failedExtras: Set<string>,
  options?: UseVerifiedStripExtrasOptions
): string[] {
  const maxProbes = options?.maxProbes ?? DEFAULT_STRIP_IMAGE_PROBE_LIMIT
  const enabled = options?.enabled !== false
  const mode = options?.mode ?? "verify"
  const [verified, setVerified] = useState<string[]>([])
  const [probeDone, setProbeDone] = useState(false)
  const key = extraSrcs.join("\u0000")

  useEffect(() => {
    if (mode === "optimistic") return
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
  }, [key, enabled, maxProbes, mode]) // eslint-disable-line react-hooks/exhaustive-deps -- keyed by joined extraSrcs

  return useMemo(() => {
    if (!enabled) return []
    if (mode === "optimistic") {
      return selectUrlsToProbe(extraSrcs, maxProbes).filter(
        (u) => !failedExtras.has(u)
      )
    }
    if (!probeDone) return []
    return verified.filter((u) => !failedExtras.has(u))
  }, [enabled, mode, maxProbes, extraSrcs, probeDone, verified, failedExtras])
}
