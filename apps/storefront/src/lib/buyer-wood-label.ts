/**
 * Buyer-facing wood tone labels on PDP / cards.
 * Long catalog forms («Светлое дерево») compress to «светлое» / «тёмное»
 * under the «Дерево: …» heading — the group label already says «дерево».
 */

export function buyerFacingWoodToneLabel(label: string, key?: string): string {
  const k = (key ?? "").toLowerCase().trim()
  if (k === "natural") return "светлое"
  if (k === "dark") return "тёмное"

  const raw = label.trim()
  if (!raw) return raw
  const lower = raw.toLowerCase().replace(/ё/g, "е")
  if (lower === "светлое дерево" || lower === "светлое") return "светлое"
  if (lower === "темное дерево" || lower === "темное") return "тёмное"

  const stripped = raw.replace(/\s+дерево$/i, "").trim()
  if (stripped && stripped.length < raw.length) {
    const s = stripped.toLowerCase().replace(/ё/g, "е")
    if (s === "светлое") return "светлое"
    if (s === "темное") return "тёмное"
    return stripped
  }
  return raw
}
