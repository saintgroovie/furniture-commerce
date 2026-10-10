import type { Metadata } from "next"
import { ContactsPageLayout } from "@/components/contacts-page-layout"
import { canonicalAlternates } from "@/lib/page-canonical"
import { seo } from "@/lib/woodright-copy"
import { pageTitle } from "@/lib/page-title"

export const metadata: Metadata = {
  title: pageTitle(seo.contacts.title),
  description: seo.contacts.description,
  openGraph: {
    title: seo.contacts.title,
    url: "/contacts",
  },
  ...canonicalAlternates("/contacts"),
}

export default function ContactsPage() {
  return <ContactsPageLayout />
}
