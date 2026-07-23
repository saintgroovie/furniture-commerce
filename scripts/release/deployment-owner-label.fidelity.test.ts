/**
 * Static fidelity: staging image workflow bakes Dokploy deployment-owner OCI label
 * on BOTH backend and storefront, and fail-closes via imagetools inspect.
 *
 * Invoked from PR checks release-governance job.
 *
 *   yarn dlx tsx scripts/release/deployment-owner-label.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd().endsWith("apps/storefront")
  ? join(process.cwd(), "../..")
  : process.cwd()
const wfPath = join(root, ".github/workflows/build-staging-images.yml")
const wf = readFileSync(wfPath, "utf8")

/** Label assignment lines only (exclude assert error echo text). */
const labelAssignments = wf
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l === "com.woodright.deployment-owner=Dokploy")

assert.equal(
  labelAssignments.length,
  2,
  `expected exactly 2 label assignment lines (backend+storefront), got ${labelAssignments.length}`
)

assert.match(
  wf,
  /BE_OWNER=\$\(docker buildx imagetools inspect[\s\S]*com\.woodright\.deployment-owner/
)
assert.match(
  wf,
  /SF_OWNER=\$\(docker buildx imagetools inspect[\s\S]*com\.woodright\.deployment-owner/
)
assert.match(
  wf,
  /if \[ "\$\{BE_OWNER\}" != "Dokploy" \] \|\| \[ "\$\{SF_OWNER\}" != "Dokploy" \]/
)

// Docs authority note present
const docs = readFileSync(
  join(root, "docs/operator/build-provenance.md"),
  "utf8"
)
assert.match(docs, /com\.woodright\.deployment-owner=Dokploy/)
assert.match(docs, /ACTIVE_OWNER\.json/)

console.log("deployment-owner-label.fidelity.test.ts: ok")
