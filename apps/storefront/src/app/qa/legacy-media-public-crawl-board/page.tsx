import type { Metadata } from "next"
import PublicCrawlBoardClient from "./PublicCrawlBoardClient"

export const metadata: Metadata = {
  title: "Legacy Media — Public Crawl Board (QA preview)",
}

/**
 * Legacy Media Public Crawl Board — READ-ONLY GROUPING/PREVIEW PROTOTYPE.
 *
 * Shows the public-crawl candidate pack (woodright.ru / woodright-kids.ru)
 * grouped and deduplicated for operator review. Does not persist operator
 * decisions, does not write a review output file, does not call Medusa or
 * touch any database. See:
 * woodright-legacy-private-export/2026-07-07/reports/legacy-media-assignment-board-public-crawl-plan.md
 */
export default function LegacyMediaPublicCrawlBoardPage() {
  return <PublicCrawlBoardClient />
}
