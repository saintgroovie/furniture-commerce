import type { Metadata } from "next"
import { getOxfordLocalMvpMediaReviewPayload } from "@/lib/qa/oxford-local-mvp-media-review"
import { OxfordLocalMvpMediaReviewClient } from "./OxfordLocalMvpMediaReviewClient"

export const metadata: Metadata = {
  title: "Oxford local MVP media — visual review",
  description:
    "Локальный визуальный разбор Oxford MVP media: inventory + SKU map + plan. Не production rollout; Oxford PAUSED.",
}

export default async function OxfordLocalMvpMediaReviewPage() {
  const payload = await getOxfordLocalMvpMediaReviewPayload()
  return <OxfordLocalMvpMediaReviewClient payload={payload} />
}
