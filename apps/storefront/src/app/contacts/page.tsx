import type { Metadata } from "next"
import { ContactsPageLayout } from "@/components/contacts-page-layout"
import { seo } from "@/lib/woodright-copy"

export const metadata: Metadata = {
  title: seo.contacts.title,
  description: seo.contacts.description,
  openGraph: {
    title: seo.contacts.title,
    url: "/contacts",
  },
}

export default function ContactsPage() {
  return <ContactsPageLayout />
}
