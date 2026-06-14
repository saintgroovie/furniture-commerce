import type { Metadata } from "next"
import { MatrixBoardClient } from "./MatrixBoardClient"

export const metadata: Metadata = {
  title: "Willie Winkie Flow A — Matrix Board (QA)",
  description: "Dev-only business/catalog matrix fill for 28-handle pilot. Not seed, not import, not media apply.",
}

export default function WillieWinkieFlowAMatrixBoardPage() {
  return <MatrixBoardClient />
}
