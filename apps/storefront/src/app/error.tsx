"use client"

import Link from "next/link"
import { useEffect } from "react"
import { systemCopy } from "@/lib/woodright-copy"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="system-state" data-state="error">
      <p className="system-state-label">{systemCopy.error.label}</p>
      <h1 className="system-state-title">{systemCopy.error.title}</h1>
      <p className="system-state-text">{systemCopy.error.body}</p>
      <div className="cta-group system-state-actions">
        <button type="button" className="btn btn-primary" onClick={() => reset()}>
          {systemCopy.error.ctaPrimary}
        </button>
        <Link href="/catalog" className="btn btn-secondary">
          {systemCopy.error.ctaSecondary}
        </Link>
      </div>
    </div>
  )
}
