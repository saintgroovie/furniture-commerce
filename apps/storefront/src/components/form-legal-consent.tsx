import Link from "next/link"
import { CopyLines } from "@/components/copy-lines"

export type LegalConsentLink = {
  label: string
  href: string
}

/**
 * Buyer form consent note + document links.
 * No pre-checked checkbox - submit implies agreement with linked documents.
 */
export function FormLegalConsent({
  note,
  links,
}: {
  note: string[]
  links: LegalConsentLink[]
}) {
  return (
    <div className="form-consent-block">
      <CopyLines className="form-consent-note" lines={note} />
      <p className="form-consent-links">
        {links.map((link, i) => (
          <span key={link.href}>
            {i > 0 ? " · " : null}
            <Link href={link.href}>{link.label}</Link>
          </span>
        ))}
      </p>
    </div>
  )
}
