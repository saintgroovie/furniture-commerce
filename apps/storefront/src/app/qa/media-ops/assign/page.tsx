import type { Metadata } from "next"
import { AssignModeClient } from "./AssignModeClient"

export const metadata: Metadata = {
  title: "Media Ops — Assign (QA)",
  description: "Legacy media assignment workspace (v2 embedded in Media Ops shell).",
}

type PageProps = {
  searchParams?:
    | Promise<{
        handle?: string
        overlay?: string
        highlight?: string
        from?: string
        legacy?: string
      }>
    | {
        handle?: string
        overlay?: string
        highlight?: string
        from?: string
        legacy?: string
      }
}

export default async function MediaOpsAssignPage({ searchParams }: PageProps) {
  const resolved = searchParams ? await Promise.resolve(searchParams) : {}
  const initialHandle = (resolved.handle || "").trim().toLowerCase() || null
  const overlayMode = (resolved.overlay || "").trim() || null
  const highlight = (resolved.highlight || "").trim() || null
  const from = (resolved.from || "").trim() || null
  const legacy = (resolved.legacy || "").trim() || null

  return (
    <AssignModeClient
      initialHandle={initialHandle}
      overlayMode={overlayMode}
      highlight={highlight}
      from={from}
      legacy={legacy}
    />
  )
}
