import Link from "next/link"
import type { Metadata } from "next"
import { contactsCopy, seo } from "@/lib/woodright-copy"
import { CopyLines } from "@/components/copy-lines"
import { ShowroomContactsContent } from "@/components/showroom-contacts-content"

export const metadata: Metadata = {
  title: seo.contacts.title,
  description: seo.contacts.description,
  openGraph: {
    title: seo.contacts.title,
    url: "/contacts",
  },
}

export default function ContactsPage() {
  return (
    <div className="service-page">
      <h1>{contactsCopy.h1}</h1>
      <CopyLines className="info-text" lines={contactsCopy.lead} />
      <div className="contacts-page-panel">
        <ShowroomContactsContent variant="desktop" idPrefix="contacts-page" />
      </div>
      <CopyLines className="info-text" lines={contactsCopy.formHelper} />
      <div className="nav-links">
        <Link href="/bespoke/request" className="btn btn-primary">{contactsCopy.ctaPrimary}</Link>
        <Link href="/catalog" className="btn btn-secondary">{contactsCopy.ctaSecondary}</Link>
      </div>
    </div>
  )
}
