/**
 * Segment layout for the v2 media triage QA board.
 *
 * Wraps content in `.legacy-media-board-v2-root` so the co-located CSS can
 * use body:has() to hide the storefront header/footer/nav and break <main>
 * out of its max-width container — giving the operator a true fullscreen
 * workspace.  Does not affect any other route.
 */
import "./legacy-media-board-v2-page.css"

export default function LegacyMediaBoardV2Layout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="legacy-media-board-v2-root">
      {children}
    </div>
  )
}
