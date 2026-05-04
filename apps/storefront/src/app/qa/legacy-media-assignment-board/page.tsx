import type { Metadata } from "next"
import { LegacyMediaAssignmentBoardClient } from "./LegacyMediaAssignmentBoardClient"

export const metadata: Metadata = {
  title: "Legacy media assignment board (QA)",
  description:
    "Dev-only draggable triage for legacy/front + local asset inventory vs seed products. Client-side decisions export only; no Medusa apply.",
}

export default function LegacyMediaAssignmentBoardPage() {
  return (
    <div className="legacy-media-assignment-board-root">
      <LegacyMediaAssignmentBoardClient />
    </div>
  )
}
