/**
 * v2-local basename normalization for duplicate collapse — no v1 board imports.
 */

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|avif)$/i

/** Normalize basename for near-duplicate matching (not a display label). */
export function normalizeBasenameForDedupe(filename: string): string {
  let b = String(filename || "")
    .replace(/\\/g, "/")
    .split("/")
    .pop()!
    .toLowerCase()
  b = b.replace(IMAGE_EXT_RE, "")
  b = b.replace(/(\s*\(\d+\)|[-_\s]+(copy|копия)(?=$|[-_.\s])|[-_](\d+)(?=\.))/gi, "")
  b = b.replace(/[-_]+/g, "-").replace(/^-+|-+$/g, "")
  return b
}
