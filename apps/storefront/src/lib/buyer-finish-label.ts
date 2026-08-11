/** Buyer-facing finish token label — codes stay lowercase internally. */
export function formatBuyerFacingFinishLabel(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return trimmed
  return trimmed.charAt(0).toLocaleUpperCase("ru-RU") + trimmed.slice(1)
}
