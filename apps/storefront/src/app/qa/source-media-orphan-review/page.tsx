import type { Metadata } from "next"
import { SourceMediaOrphanReviewClient } from "./SourceMediaOrphanReviewClient"

export const metadata: Metadata = {
  title: "Source Media Orphan Review (QA)",
  description:
    "Dev-only review queue for unmapped_orphan and needs_manual_mapping source rows from full-cache audit.",
}

export default function SourceMediaOrphanReviewPage() {
  return <SourceMediaOrphanReviewClient />
}
