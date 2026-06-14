import * as fs from "fs"
import type { MatrixReadiness, MatrixRow } from "../../matrix-board-types"
import { computeReadiness } from "../../matrix-board-validation"

export function writeReadinessArtifacts(matrixDir: string, rows: MatrixRow[]): MatrixReadiness {
  const readiness = computeReadiness(rows)
  const jsonPath = `${matrixDir}/filled-readiness-check.json`
  const mdPath = `${matrixDir}/filled-readiness-check.md`

  fs.writeFileSync(jsonPath, JSON.stringify(readiness, null, 2))

  const md = `# Filled matrix readiness (UI save)

**Generated:** ${readiness.generated_at}  
**Readiness:** ${readiness.readiness}  
**Seed draft allowed later:** ${readiness.seed_draft_allowed_later}

| Metric | Value |
|--------|-------|
| Rows | ${readiness.total_rows} |
| approve / reject / hold / pending | ${readiness.approve_count} / ${readiness.reject_count} / ${readiness.hold_count} / ${readiness.pending_decision_count} |
| rows ready for approve | ${readiness.rows_ready_for_approve} |
| mandatory filled | ${readiness.mandatory_filled_cells} / ${readiness.mandatory_total_cells} |

${readiness.reason}
`
  fs.writeFileSync(mdPath, md)
  return readiness
}
