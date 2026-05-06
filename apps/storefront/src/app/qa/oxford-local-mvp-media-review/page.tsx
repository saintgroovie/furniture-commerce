import type { Metadata } from "next"
import { getOxfordLocalMvpMediaReviewPayload } from "@/lib/qa/oxford-local-mvp-media-review"
import { OxfordLocalMvpMediaReviewClient } from "./OxfordLocalMvpMediaReviewClient"

export const metadata: Metadata = {
  title: "Oxford media review — local QA",
  description:
    "Desktop-first media board for sorting Oxford MVP images by SKU, unassigned pool, and source backlog. Local dev only; no DB writes; Oxford PAUSED.",
}

export default async function OxfordLocalMvpMediaReviewPage() {
  const payload = await getOxfordLocalMvpMediaReviewPayload()
  return <OxfordLocalMvpMediaReviewClient payload={payload} />
}
