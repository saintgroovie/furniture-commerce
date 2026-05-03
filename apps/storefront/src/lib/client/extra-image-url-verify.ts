"use client"

/**
 * Drops URLs that fail a browser decode/load check (avoids broken icons in the thumb strip).
 * Preserves input order. Parallel probes per card.
 */
export function filterExtrasBySuccessfulImageLoad(urls: string[]): Promise<string[]> {
  const trimmed = urls
    .map((raw) => (typeof raw === "string" ? raw.trim() : ""))
    .filter((u) => u.length > 0)
    .slice(0, 12)

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
