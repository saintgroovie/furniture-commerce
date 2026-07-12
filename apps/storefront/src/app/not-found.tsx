import Link from "next/link"
import type { Metadata } from "next"
import { systemCopy } from "@/lib/woodright-copy"
import { CopyLines } from "@/components/copy-lines"

export const metadata: Metadata = {
  title: systemCopy.notFound.title,
  robots: { index: false, follow: false },
}

export default function NotFound() {
  return (
    <div className="system-state" data-state="not_found">
      <p className="system-state-label">{systemCopy.notFound.label}</p>
      <h1 className="system-state-title">{systemCopy.notFound.title}</h1>
      <CopyLines className="system-state-text" lines={systemCopy.notFound.body} />
      <div className="cta-group system-state-actions">
        <Link href="/catalog" className="btn btn-primary">
          {systemCopy.notFound.ctaPrimary}
        </Link>
        <Link href="/" className="btn btn-secondary">
          {systemCopy.notFound.ctaSecondary}
        </Link>
      </div>
    </div>
  )
}
