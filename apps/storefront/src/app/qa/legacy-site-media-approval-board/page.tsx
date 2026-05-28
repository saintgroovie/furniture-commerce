import type { Metadata } from "next"
import { LegacySiteMediaApprovalBoardClient } from "./LegacySiteMediaApprovalBoardClient"

export const metadata: Metadata = {
  title: "Legacy Site Media Supplement Triage (QA)",
  description:
    "Dev-only supplement triage: duplicate context, role assignment, export for normalized supplement pipeline.",
}

export default function LegacySiteMediaApprovalBoardPage() {
  return <LegacySiteMediaApprovalBoardClient />
}
