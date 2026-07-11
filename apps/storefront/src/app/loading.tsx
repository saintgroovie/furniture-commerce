import { systemCopy } from "@/lib/woodright-copy"

export default function Loading() {
  return (
    <div className="system-state system-state-loading" data-state="loading" aria-busy="true" aria-live="polite">
      <p className="system-state-loading-text">{systemCopy.loading.label}</p>
    </div>
  )
}
