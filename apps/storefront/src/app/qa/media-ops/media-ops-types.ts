import type { PersistedRow as OrphanPersistedRow } from "../source-media-orphan-review/source-orphan-review-persistence"

export type MediaOpsSessionV1 = {
  version: 1
  savedAt: string
  lastMode?: "inbox" | "assign" | "launch"
  lastHandle?: string | null
  inbox: {
    orphan: Record<string, OrphanPersistedRow>
    supplement: Record<string, unknown>
  }
  migration?: {
    importedFrom: string[]
    importedAt: string | null
  }
}

export type { OrphanPersistedRow }
