import { a1System } from "@/lib/package-a1-copy"

export default function Loading() {
  return (
    <div
      className="system-state system-state-loading"
      data-state="loading"
      aria-busy="true"
      aria-live="polite"
    >
      <p className="system-state-loading-text">{a1System.loading.label}</p>
    </div>
  )
}
