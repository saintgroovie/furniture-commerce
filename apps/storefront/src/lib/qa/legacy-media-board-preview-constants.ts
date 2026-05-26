/** Client + server safe — no Node fs imports. */

export const LEGACY_MEDIA_QA_PREVIEW_ROUTE = "/qa/legacy-media-assignment-board/preview"

export function medusaStaticOrigin(): string {
  const u =
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL) ||
    (typeof process !== "undefined" && process.env.MEDUSA_BACKEND_URL) ||
    "http://localhost:9000"
  return String(u).replace(/\/$/, "")
}
