import type { Metadata } from "next"
import { LegacySiteMediaApprovalBoardClient } from "./LegacySiteMediaApprovalBoardClient"

export const metadata: Metadata = {
  title: "Legacy Site Media Approval Board (QA)",
  description:
    "Dev-only visual board for legacy-site supplement candidate approval. localStorage + JSON export. No normalized writes.",
}

export default function LegacySiteMediaApprovalBoardPage() {
  return <LegacySiteMediaApprovalBoardClient />
}
