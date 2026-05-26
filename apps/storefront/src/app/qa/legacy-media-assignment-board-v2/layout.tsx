/**
 * Segment layout for the v2 media triage QA board.
 *
 * Wraps content in `.legacy-media-board-v2-root` so the co-located CSS can
 * use body:has() to hide the storefront header/footer/nav and break <main>
 * out of its max-width container — giving the operator a true fullscreen
 * workspace.  Does not affect any other route.
 */
import "./legacy-media-board-v2-page.css"
import { V2_BOARD_BUILD } from "./legacy-board-v2-build"

export default function LegacyMediaBoardV2Layout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="legacy-media-board-v2-root" data-v2-board-build={V2_BOARD_BUILD}>
      {children}
    </div>
  )
}
