/**
 * Closes governance field post_ingestion_db_evidence in
 * data/normalized/oxford-four-pilot-ingested-evidence.json
 * when data/normalized/oxford-four-pilot-post-ingestion-validation.json exists
 * and has verdict === "ok".
 *
 * Run from repo root or apps/backend (paths resolved from this file).
 * Does not connect to Medusa.
 *
 * Usage: yarn oxford-pilot-four:sync-ingested-evidence  (from apps/backend)
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
/** .../apps/backend/scripts -> repo root */
const repoRoot = path.resolve(__dirname, "../../..")
const validationPath = path.join(
  repoRoot,
  "data/normalized/oxford-four-pilot-post-ingestion-validation.json"
)
const evidencePath = path.join(
  repoRoot,
  "data/normalized/oxford-four-pilot-ingested-evidence.json"
)

function main() {
  if (!fs.existsSync(validationPath)) {
    console.error(
      `Missing ${path.relative(repoRoot, validationPath)}. Run:\n  OXFORD_PILOT_POST_INGESTION_VALIDATE=1 yarn oxford-pilot-four:validate-post-ingestion\n(from apps/backend), then commit the JSON, then re-run this sync.`
    )
    process.exit(1)
  }

  const validation = JSON.parse(fs.readFileSync(validationPath, "utf-8"))
  if (validation.verdict == null) {
    console.error("Refusing sync: validation report has no verdict field.")
    process.exit(1)
  }
  if (validation.verdict === "skipped" || validation.skipped === true) {
    console.error(
      "Refusing sync: report is skipped / not a real DB run (use OXFORD_PILOT_POST_INGESTION_VALIDATE=1, not skipped stub)."
    )
    process.exit(1)
  }
  if (validation.verdict !== "ok") {
    console.error(
      `Validation verdict is "${String(validation.verdict)}" (expected "ok" from a real DB run with OXFORD_PILOT_POST_INGESTION_VALIDATE=1). Fix DB/seed and re-validate before syncing evidence.`
    )
    process.exit(1)
  }

  if (!fs.existsSync(evidencePath)) {
    console.error(`Missing evidence bundle: ${evidencePath}`)
    process.exit(1)
  }

  const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf-8"))
  const vDate = validation.audit_meta?.date ?? null
  const violations = Array.isArray(validation.violations)
    ? validation.violations
    : []

  evidence.audit_meta = {
    ...evidence.audit_meta,
    evidence_closure_date: vDate ?? new Date().toISOString().slice(0, 10),
    post_ingestion_validation_source: path.relative(repoRoot, validationPath),
  }

  evidence.claims = evidence.claims ?? {}
  evidence.claims.post_ingestion_validation_result_committed = {
    value: true,
    committed_path: "data/normalized/oxford-four-pilot-post-ingestion-validation.json",
    basis: "committed_file_verdict_ok",
    snapshot_from_committed_report: {
      verdict: validation.verdict,
      audit_meta_date: vDate,
      violations_count: violations.length,
      pilot_products_in_db: validation.pilot_products_in_db ?? null,
      storefront_pause_contract: validation.storefront_pause_contract ?? null,
      reference_handles: validation.reference_handles ?? null,
    },
  }

  evidence.verdict = {
    governance_bundle: "ok",
    post_ingestion_db_evidence: "ok",
    explanation:
      "Post-ingestion validation JSON committed with verdict ok; pilot-level DB evidence closed. Oxford storefront pause and baseline isolation claims unchanged — see claims.*.",
  }

  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + "\n", "utf-8")
  console.log(`Updated ${path.relative(repoRoot, evidencePath)} from validation verdict=ok.`)
}

main()
