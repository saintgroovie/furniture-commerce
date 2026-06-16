import type { Metadata } from "next"
import { LegacyMediaBoardV2Client } from "./LegacyMediaBoardV2Client"

export const metadata: Metadata = {
  title: "Legacy Media Assignment Board v2 (QA)",
  description:
    "Dev-only v2 triage board for legacy media assignment. Reads v1 QA API routes. No Medusa writes. No export or localStorage in Commit 1.",
}

type PageProps = {
  searchParams?: Promise<{ handle?: string; overlay?: string }> | { handle?: string; overlay?: string }
}

export default async function LegacyMediaBoardV2Page({ searchParams }: PageProps) {
  const resolved = searchParams ? await Promise.resolve(searchParams) : {}
  const initialHandle = (resolved.handle || "").trim().toLowerCase() || null
  const overlayMode = (resolved.overlay || "").trim() || null
  return <LegacyMediaBoardV2Client initialHandle={initialHandle} overlayMode={overlayMode} />
}
