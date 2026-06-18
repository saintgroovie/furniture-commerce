import type { Metadata } from "next"
import { Suspense } from "react"
import { InboxModeClient } from "./InboxModeClient"
import "../../source-media-orphan-review/source-orphan-review-page.css"
import "./inbox-mode.css"

export const metadata: Metadata = {
  title: "Media Ops — Inbox (QA)",
  description: "Orphan queue and supplement gate.",
}

export default function MediaOpsInboxPage() {
  return (
    <Suspense fallback={<p>Загрузка Inbox…</p>}>
      <InboxModeClient />
    </Suspense>
  )
}
