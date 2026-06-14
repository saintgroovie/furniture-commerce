import type { Metadata } from "next"
import { BusinessGateBoardClient } from "./BusinessGateBoardClient"

export const metadata: Metadata = {
  title: "Willie Winkie / Molly — Business Gate Board (QA)",
  description:
    "Dev-only operator UI for 28-handle catalog business gate. Review/export only — no seed, DB, or media apply.",
}

export default function WillieWinkieBusinessGateBoardPage() {
  return <BusinessGateBoardClient />
}
