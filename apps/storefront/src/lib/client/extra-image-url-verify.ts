"use client"

/** Catalog cards: cap parallel decode probes (plan phase F). */
export const CARD_STRIP_IMAGE_PROBE_LIMIT = 4

/** PDP / legacy default: previous ≤12 probe budget. */
export const DEFAULT_STRIP_IMAGE_PROBE_LIMIT = 12

/**
 * Normalize + cap URLs before Image() probes.
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

/**
 * Drops URLs that fail a browser decode/load check (avoids broken icons in the thumb strip).
 * Preserves input order. Parallel probes, capped by `maxProbes`.
 */
export function filterExtrasBySuccessfulImageLoad(
  urls: string[],
  maxProbes: number = DEFAULT_STRIP_IMAGE_PROBE_LIMIT
): Promise<string[]> {
  const trimmed = selectUrlsToProbe(urls, maxProbes)

  if (trimmed.length === 0) return Promise.resolve([])

  return Promise.all(
    trimmed.map(
      (url) =>
        new Promise<{ url: string; ok: boolean }>((resolve) => {
          const im = new Image()
          im.onload = () => resolve({ url, ok: true })
          im.onerror = () => resolve({ url, ok: false })
          im.src = url
        })
    )
  ).then((results) => results.filter((r) => r.ok).map((r) => r.url))
}
