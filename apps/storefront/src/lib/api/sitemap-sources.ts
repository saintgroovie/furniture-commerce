import { getBaseUrl, medusaFetch, medusaFetchTimeoutMs } from "./base"
import { withCatalogReadBudget } from "../catalog-read-budget"

/** Same public directories as the UI, without price/preview hydration. */
export const SITEMAP_SOURCE_LIMITS = {
  catalog: { path: "/store/catalog-products", bytes: 4 * 1024 * 1024, rows: 5000 },
  rooms: { path: "/store/room-sets", bytes: 256 * 1024, rows: 256 },
  motifs: { path: "/store/motif-themes", bytes: 512 * 1024, rows: 256 },
} as const
export const SITEMAP_READ_BUDGET_MS = 8000

type Row = Record<string, unknown>
type Read = (path: string, signal: AbortSignal) => Promise<Response>

function readChunk(reader: ReadableStreamDefaultReader<Uint8Array>, signal: AbortSignal) {
  signal.throwIfAborted()
  return new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new Error("Sitemap read aborted"))
    signal.addEventListener("abort", abort, { once: true })
    reader.read().then(value => {
      signal.removeEventListener("abort", abort); resolve(value)
    }, error => {
      signal.removeEventListener("abort", abort); reject(error)
    })
  })
}

async function boundedJson(response: Response, byteLimit: number, signal: AbortSignal): Promise<unknown> {
  const declared = Number(response.headers.get("content-length"))
  if (!response.ok || declared > byteLimit || !response.body) {
    void response.body?.cancel().catch(() => {})
    throw new Error("Sitemap source unavailable or oversized")
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder("utf-8", { fatal: true })
  let bytes = 0, text = "", complete = false
  try {
    for (;;) {
      const chunk = await readChunk(reader, signal)
      signal.throwIfAborted()
      if (chunk.done) { complete = true; break }
      bytes += chunk.value.byteLength
      if (bytes > byteLimit) throw new Error("Sitemap source byte limit exceeded")
      text += decoder.decode(chunk.value, { stream: true })
    }
    text += decoder.decode()
    return JSON.parse(text)
  } finally {
    if (!complete) void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

function arrayRows(value: unknown, key: string, maxRows: number): Row[] {
  const rows = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)[key] : null
  if (!Array.isArray(rows) || rows.length > maxRows || rows.some(row => !row || typeof row !== "object" || Array.isArray(row))) {
    throw new Error("Invalid or oversized sitemap source array")
  }
  return rows as Row[]
}

/** One sequential batch: exactly three GETs at most, no per-product reads.
 * Existing backend motif aggregation still performs its own product/price
 * graph reads. These client caps do not claim a backend DB cardinality cap. */
export async function readSitemapSources(read: Read, signal: AbortSignal) {
  const c = SITEMAP_SOURCE_LIMITS
  signal.throwIfAborted()
  const products = arrayRows(await boundedJson(await read(c.catalog.path, signal), c.catalog.bytes, signal), "products", c.catalog.rows)
    .map(row => ({ handle: row.handle, id: row.id, status: row.status }))
  signal.throwIfAborted()
  const rooms = arrayRows(await boundedJson(await read(c.rooms.path, signal), c.rooms.bytes, signal), "room_sets", c.rooms.rows)
    .map(row => ({ slug: row.slug, is_active: row.is_active, room_type: row.room_type }))
  signal.throwIfAborted()
  const motifs = arrayRows(await boundedJson(await read(c.motifs.path, signal), c.motifs.bytes, signal), "motif_themes", c.motifs.rows)
    .map(row => ({ motif_slug: row.motif_slug, motif_available_product_count: row.motif_available_product_count }))
  signal.throwIfAborted()
  return { products, rooms, motifs }
}

/** Shared existing process gate; eight seconds includes queue, headers and body. */
export function getSitemapSources(signal?: AbortSignal) {
  const base = getBaseUrl()
  return withCatalogReadBudget(shared => readSitemapSources(
    (path, requestSignal) => medusaFetch(`${base}${path}`, { signal: requestSignal }), shared
  ), signal ?? null, Math.min(SITEMAP_READ_BUDGET_MS, medusaFetchTimeoutMs()))
}
