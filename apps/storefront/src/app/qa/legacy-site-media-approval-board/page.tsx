import type { Metadata } from "next"
import { LegacySiteMediaApprovalBoardClient } from "./LegacySiteMediaApprovalBoardClient"

export const metadata: Metadata = {
  robots: { index: false, follow: false, noarchive: true },
  title: "Legacy Site Media Supplement Triage (QA)",
  description:
    "Dev-only supplement triage: duplicate context, role assignment, export for normalized supplement pipeline.",
}

export default function LegacySiteMediaApprovalBoardPage() {
  return <LegacySiteMediaApprovalBoardClient />
}
