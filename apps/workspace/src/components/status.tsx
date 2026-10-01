import { TONE_MARK, type StateView, type Tone } from "@/lib/state"

/** Word + marker shape + colour. Colour is never the only signal. */
export function Status({ tone, children, size }: { tone: Tone; children: React.ReactNode; size?: "sm" | "lg" }) {
  return (
    <span className={`status ${tone}${size === "lg" ? " lg" : ""}`}>
      <span className="status-mark" aria-hidden="true">{TONE_MARK[tone]}</span>
      {children}
    </span>
  )
}

export function StateBadge({ state, size }: { state: StateView; size?: "sm" | "lg" }) {
  return <Status tone={state.tone} size={size}>{state.label}</Status>
}
