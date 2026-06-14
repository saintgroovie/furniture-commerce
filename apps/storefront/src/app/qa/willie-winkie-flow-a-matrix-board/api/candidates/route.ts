import * as fs from "fs"
import { NextResponse } from "next/server"
import {
  FILLED_CSV,
  getMatrixRepoResolution,
  matrixFile,
} from "../_lib/matrix-repo-root"
import { parseCsv } from "../_lib/matrix-csv"
import {
  buildAllCandidates,
  buildWorkbookSourceAudit,
  writeWorkbookSourceAudit,
} from "../_lib/matrix-workbook-candidates"
import { matrixBoardProdBlocked, matrixBoardProdBlockedResponse } from "../_lib/prod-guard"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  if (matrixBoardProdBlocked()) return matrixBoardProdBlockedResponse()

  const resolution = getMatrixRepoResolution()
  if (!resolution.repoRoot) {
    return NextResponse.json({ error: "matrix_template_not_found" }, { status: 404 })
  }

  const url = new URL(request.url)
  const writeAudit = url.searchParams.get("write_audit") === "1"

  try {
    const filledPath = matrixFile(resolution.repoRoot, FILLED_CSV)
    const rows = parseCsv(fs.readFileSync(filledPath, "utf8"))
    const built = buildAllCandidates(resolution.repoRoot, rows)

    if (writeAudit) {
      const audit = buildWorkbookSourceAudit(resolution.repoRoot, rows)
      writeWorkbookSourceAudit(resolution.repoRoot, audit)
    }

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      parsed_sheets_path: built.parsed_path,
      workbook_rows: built.workbook_rows,
      by_handle: built.by_handle,
    })
  } catch (e) {
    return NextResponse.json({ error: "candidates_failed", message: String(e) }, { status: 500 })
  }
}
