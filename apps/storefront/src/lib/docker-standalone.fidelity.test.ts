/**
 * Guard: storefront production image must use Next standalone (slim runtime).
 *
 *   yarn exec tsx src/lib/docker-standalone.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "../..")
const cfg = readFileSync(join(root, "next.config.js"), "utf8")
const df = readFileSync(join(root, "Dockerfile"), "utf8")

assert.match(cfg, /output:\s*["']standalone["']/)
assert.match(cfg, /outputFileTracingRoot/)
assert.match(df, /standalone/)
assert.match(df, /CMD\s*\[\s*"node",\s*"server\.js"\s*\]/)
assert.doesNotMatch(df, /CMD\s*\[\s*"\.\/node_modules\/\.bin\/next"/)
// Runtime must not COPY full yarn node_modules into runner (standalone traces deps).
assert.doesNotMatch(
  df,
  /FROM node:20-bookworm-slim AS runner[\s\S]*COPY --from=build[^\n]*node_modules \.\/node_modules/
)
// Build validation chain must not be masked by a trailing `|| true`.
assert.doesNotMatch(
  df,
  /yarn build[\s\S]*\|\|\s*true(?!\s*;?\s*\})/
)

console.log("docker-standalone.fidelity.test.ts: ok")
