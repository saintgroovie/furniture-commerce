import type { Metadata } from "next"
import { LegalRoutePage, legalPageMetadata } from "@/lib/legal/legal-route"

export const metadata: Metadata = legalPageMetadata("payment")

export default function Page() {
  return <LegalRoutePage id="payment" />
}
