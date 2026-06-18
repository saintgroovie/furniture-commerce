/**
 * Assign mode — v2 operator styles (role grid, gallery) without v2 segment layout route.
 */
import { V2_BOARD_BUILD } from "../../legacy-media-assignment-board-v2/legacy-board-v2-build"
import "../../legacy-media-assignment-board-v2/legacy-media-board-v2-page.css"

export default function MediaOpsAssignLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="legacy-media-board-v2-root" data-v2-board-build={V2_BOARD_BUILD}>
      {children}
    </div>
  )
}
