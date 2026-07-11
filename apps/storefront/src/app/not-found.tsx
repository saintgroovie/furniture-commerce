import Link from "next/link"
import type { Metadata } from "next"
import { a1System } from "@/lib/package-a1-copy"

export const metadata: Metadata = {
  title: a1System.notFound.title,
  robots: { index: false, follow: false },
}

export default function NotFound() {
  return (
    <div className="system-state" data-state="not_found">
      <p className="system-state-label">{a1System.notFound.label}</p>
      <h1 className="system-state-title">{a1System.notFound.title}</h1>
      <p className="system-state-text">{a1System.notFound.body}</p>
      <div className="cta-group system-state-actions">
        <Link href="/catalog" className="btn btn-primary">
          {a1System.notFound.ctaPrimary}
        </Link>
        <Link href="/" className="btn btn-secondary">
          {a1System.notFound.ctaSecondary}
        </Link>
      </div>
    </div>
  )
}
