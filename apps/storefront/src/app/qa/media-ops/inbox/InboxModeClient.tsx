"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback } from "react"
import { OrphanQueuePanel } from "../inbox-orphan/OrphanQueuePanel"

export function InboxModeClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab = (searchParams.get("tab") || "orphan").toLowerCase()
  const sourceId = searchParams.get("source_id")

  const setSourceId = useCallback(
    (id: string) => {
      const q = new URLSearchParams(searchParams.toString())
      q.set("tab", "orphan")
      q.set("source_id", id)
      router.replace(`/qa/media-ops/inbox?${q.toString()}`)
    },
    [router, searchParams]
  )

  return (
    <div className="media-ops-inbox-mode" data-media-ops-inbox-tab={tab}>
      <nav className="media-ops-inbox-tabs" aria-label="Inbox tabs">
        <Link
          href="/qa/media-ops/inbox?tab=orphan"
          className="media-ops-inbox-tab"
          data-active={tab === "orphan" ? "true" : "false"}
        >
          Очередь сирот
        </Link>
        <Link
          href="/qa/media-ops/inbox?tab=supplement"
          className="media-ops-inbox-tab"
          data-active={tab === "supplement" ? "true" : "false"}
        >
          Supplement gate
        </Link>
      </nav>

      {tab === "supplement" ? (
        <div className="media-ops-mode-placeholder" data-media-ops-mode="inbox-supplement">
          Supplement gate — Phase 3.
        </div>
      ) : (
        <OrphanQueuePanel
          embeddedInShell
          selectedSourceId={sourceId}
          onSelectSourceId={setSourceId}
        />
      )}
    </div>
  )
}
