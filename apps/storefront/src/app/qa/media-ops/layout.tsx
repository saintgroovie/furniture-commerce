import type { Metadata } from "next"
import { MediaOpsAssignBridgeProvider } from "./media-ops-assign-bridge"
import { MediaOpsShell } from "./MediaOpsShell"
import "./media-ops-shell.css"

export const metadata: Metadata = {
  title: "Woodright Media Ops (QA)",
  description:
    "Unified operator workspace: Inbox triage, media assignment, Launch A matrix. Dev-only. No catalog writes.",
}

export default function MediaOpsLayout({ children }: { children: React.ReactNode }) {
  return (
    <MediaOpsAssignBridgeProvider>
      <MediaOpsShell>{children}</MediaOpsShell>
    </MediaOpsAssignBridgeProvider>
  )
}
