import type { Metadata } from "next"
import { LegalRoutePage, legalPageMetadata } from "@/lib/legal/legal-route"

export const metadata: Metadata = legalPageMetadata("cookies")

export default function Page() {
  return <LegalRoutePage id="cookies" />
}
