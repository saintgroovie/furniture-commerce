/**
 * Segment layout for the Legacy Media Public Crawl Board (read-only preview).
 * Isolated CSS import only — no shared state, no v2 board imports.
 */
import "./public-crawl-board.css"

export const metadata = {
  title: "Legacy Media — Public Crawl Board (QA preview)",
  description: "Read-only preview of the public-crawl candidate pack for woodright.ru / woodright-kids.ru.",
}

export default function PublicCrawlBoardLayout({ children }: { children: React.ReactNode }) {
  return <div className="pcb-layout-root">{children}</div>
}
