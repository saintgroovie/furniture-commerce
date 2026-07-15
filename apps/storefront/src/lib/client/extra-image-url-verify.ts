"use client"

/** Catalog cards: cap optimistic strip length / legacy probe budget name. */
export const CARD_STRIP_IMAGE_PROBE_LIMIT = 4

/** PDP / legacy default: previous ≤12 probe budget. */
export const DEFAULT_STRIP_IMAGE_PROBE_LIMIT = 12

/**
 * Per-URL Image() budget for PDP verification only.
 * Prevents a single hung decode from blocking the whole strip Promise.all.
 * Catalog must not call filterExtrasBySuccessfulImageLoad (optimistic mode).
 */
export const STRIP_IMAGE_PROBE_TIMEOUT_MS = 4000

/**
 * Normalize + cap URLs before Image() probes or optimistic display.
 * Pure helper (testable without DOM Image).
 */
export function selectUrlsToProbe(
  urls: string[],
  maxProbes: number = DEFAULT_STRIP_IMAGE_PROBE_LIMIT
): string[] {
  const limit = Number.isFinite(maxProbes)
    ? Math.max(0, Math.floor(maxProbes))
    : DEFAULT_STRIP_IMAGE_PROBE_LIMIT
  return urls
    .map((raw) => (typeof raw === "string" ? raw.trim() : ""))
    .filter((u) => u.length > 0)
    .slice(0, limit)
}

function probeOneImageUrl(
  url: string,
  timeoutMs: number = STRIP_IMAGE_PROBE_TIMEOUT_MS
): Promise<{ url: string; ok: boolean }> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ url, ok })
    }
    const timer = setTimeout(() => finish(false), timeoutMs)
    try {
      const im = new Image()
      im.onload = () => finish(true)
      im.onerror = () => finish(false)
      im.src = url
    } catch {
      finish(false)
    }
  })
}

/**
 * PDP-only: drop URLs that fail browser decode/load.
 * Stateless aside from local `new Image()` — no process-wide gate.
 * Catalog cards must use optimistic mode and must not call this.
 */
export function filterExtrasBySuccessfulImageLoad(
  urls: string[],
  maxProbes: number = DEFAULT_STRIP_IMAGE_PROBE_LIMIT
): Promise<string[]> {
  const trimmed = selectUrlsToProbe(urls, maxProbes)

  if (trimmed.length === 0) return Promise.resolve([])

  return Promise.all(trimmed.map((url) => probeOneImageUrl(url))).then(
    (results) => results.filter((r) => r.ok).map((r) => r.url)
  )
}
