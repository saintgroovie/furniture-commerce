import type { Metadata } from "next"
import { LegalRoutePage, legalPageMetadata } from "@/lib/legal/legal-route"

export const metadata: Metadata = legalPageMetadata("returns")

export default function Page() {
  return <LegalRoutePage id="returns" />
}
