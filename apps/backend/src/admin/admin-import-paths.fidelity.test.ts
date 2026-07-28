/**
 *   yarn dlx tsx src/admin/admin-import-paths.fidelity.test.ts
 *
 * Guards Medusa Admin Vite resolve: production route must import admin-fetch
 * from src/admin/lib (three levels up), not from routes/lib.
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

const root = path.resolve(__dirname)
const page = path.join(root, "routes/woodright/production/page.tsx")
const source = fs.readFileSync(page, "utf8")
const m = source.match(/from\s+["']([^"']*admin-fetch)["']/)
assert.ok(m, "production page must import admin-fetch")
const importPath = m![1]
assert.equal(
  importPath,
  "../../../lib/admin-fetch",
  `unexpected import path: ${importPath}`
)
const resolved = path.resolve(path.dirname(page), importPath + ".ts")
assert.ok(fs.existsSync(resolved), `missing module at ${resolved}`)
console.log("admin-import-paths.fidelity.test.ts: ok")
