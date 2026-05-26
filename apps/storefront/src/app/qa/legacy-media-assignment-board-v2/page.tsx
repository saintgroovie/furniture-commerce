import type { Metadata } from "next"
import { LegacyMediaBoardV2Client } from "./LegacyMediaBoardV2Client"

export const metadata: Metadata = {
  title: "Legacy Media Assignment Board v2 (QA)",
  description:
    "Dev-only v2 triage board for legacy media assignment. Reads v1 QA API routes. No Medusa writes. No export or localStorage in Commit 1.",
}

export default function LegacyMediaBoardV2Page() {
  return <LegacyMediaBoardV2Client />
}
