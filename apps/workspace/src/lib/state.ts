/** Five semantic states. Every state carries a word; colour is never the only signal. */
export type Tone = "neutral" | "positive" | "attention" | "waiting" | "critical"

export type StateView = { tone: Tone; label: string }

export const TONE_MARK: Record<Tone, string> = {
  neutral: "○",
  positive: "●",
  attention: "▲",
  waiting: "◐",
  critical: "✕",
}
