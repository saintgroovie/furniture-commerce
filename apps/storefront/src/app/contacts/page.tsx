import Link from "next/link"
import type { Metadata } from "next"
import { contactsCopy, seo } from "@/lib/woodright-copy"

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
      <p className="info-text">{contactsCopy.lead}</p>
      <p className="page-caption">{contactsCopy.showroomNote}</p>
      <p className="info-text">{contactsCopy.formHelper}</p>
      <div className="nav-links">
        <Link href="/bespoke/request" className="btn btn-primary">{contactsCopy.ctaPrimary}</Link>
        <Link href="/catalog" className="btn btn-secondary">{contactsCopy.ctaSecondary}</Link>
      </div>
    </div>
  )
}
