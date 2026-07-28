/**
 * Packaging fidelity: owner-approved RoomSet V1 seeds ship in the immutable
 * backend runtime image without startup side effects.
 *
 * Run: yarn dlx tsx scripts/ops-seeds-packaging.fidelity.test.ts
 * (from apps/backend)
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const dockerfile = fs.readFileSync(path.join(ROOT, "Dockerfile"), "utf8")
const dockerignore = fs.readFileSync(path.join(ROOT, ".dockerignore"), "utf8")
const compileScript = fs.readFileSync(
  path.join(ROOT, "scripts", "compile-ops-seeds.mjs"),
  "utf8"
)
const seedSrc = path.join(ROOT, "src", "scripts", "seed-rooms-v1-owner-approved.ts")
const planSrc = path.join(ROOT, "src", "scripts", "seed-rooms-v1-plan.ts")
const fidelitySrc = path.join(
  ROOT,
  "src",
  "scripts",
  "seed-rooms-v1-owner-approved.fidelity.test.ts"
)

assert.ok(fs.existsSync(seedSrc), "seed source must exist in build input")
assert.ok(fs.existsSync(planSrc), "plan source must exist in build input")
assert.ok(fs.existsSync(fidelitySrc), "fidelity test source exists locally")

assert.match(
  dockerignore,
  /\*\*\/\*\.test\.ts/,
  ".dockerignore must exclude *.test.ts from image build context"
)
assert.doesNotMatch(
  dockerignore,
  /seed-rooms-v1/,
  ".dockerignore must not exclude seed-rooms-v1 sources"
)

assert.match(
  dockerfile,
  /compile-ops-seeds\.mjs/,
  "Dockerfile must compile ops seeds after medusa build"
)
assert.match(
  dockerfile,
  /dist\/src\/scripts\/seed-rooms-v1-owner-approved\.js/,
  "Dockerfile must assert compiled seed artifact"
)
assert.match(
  dockerfile,
  /dist\/src\/scripts\/seed-rooms-v1-plan\.js/,
  "Dockerfile must assert compiled plan artifact"
)
assert.match(
  compileScript,
  /seed-rooms-v1-manifest\.ts/,
  "compile allowlist includes manifest"
)
assert.match(
  compileScript,
  /seed-rooms-v1-target-gate\.ts/,
  "compile allowlist includes target gate"
)
assert.match(
  dockerfile,
  /CMD\s*\[\s*"\.\/node_modules\/\.bin\/medusa",\s*"start"\s*\]/,
  "CMD must remain medusa start only"
)
assert.doesNotMatch(
  dockerfile,
  /CMD[^\n]*seed-rooms/,
  "seed must not be in CMD"
)
assert.doesNotMatch(
  dockerfile,
  /HEALTHCHECK[^\n]*seed-rooms/,
  "seed must not be in HEALTHCHECK"
)

assert.match(
  compileScript,
  /seed-rooms-v1-owner-approved\.ts/,
  "compile allowlist includes owner-approved seed"
)
assert.match(
  compileScript,
  /seed-rooms-v1-plan\.ts/,
  "compile allowlist includes plan"
)
assert.doesNotMatch(
  compileScript,
  /\.fidelity\.test/,
  "compile allowlist must not include fidelity tests"
)
assert.match(
  compileScript,
  /transpileModule/,
  "compile must use transpile-only (no module graph re-emit)"
)

// Compile into a temp dist subtree under apps/backend/tmp (gitignored via tmp/)
const tmpDist = path.join(ROOT, "tmp", "ops-seeds-fidelity-dist")
fs.rmSync(tmpDist, { recursive: true, force: true })
const env = {
  ...process.env,
}
const compile = spawnSync(
  process.execPath,
  [path.join(ROOT, "scripts", "compile-ops-seeds.mjs")],
  {
    cwd: ROOT,
    encoding: "utf8",
    env: {
      ...env,
    },
  }
)
// compile writes to dist/src/scripts — run against real dist path then check
assert.equal(compile.status, 0, `compile failed: ${compile.stderr || compile.stdout}`)
const seedJs = path.join(ROOT, "dist", "src", "scripts", "seed-rooms-v1-owner-approved.js")
const planJs = path.join(ROOT, "dist", "src", "scripts", "seed-rooms-v1-plan.js")
assert.ok(fs.existsSync(seedJs), "compiled seed js must exist after compile-ops-seeds")
assert.ok(fs.existsSync(planJs), "compiled plan js must exist after compile-ops-seeds")
assert.ok(fs.statSync(seedJs).size > 32, "compiled seed js non-empty")
assert.ok(fs.statSync(planJs).size > 32, "compiled plan js non-empty")

const seedJsText = fs.readFileSync(seedJs, "utf8")
assert.match(seedJsText, /ROOMSET_SEED_TARGET|assertRoomsetSeedGate/, "new target gate wired")
assert.match(seedJsText, /ROOMSET_SEED_MODE|assertRoomsetSeedGate/, "explicit mode gate wired")
const gateJs = path.join(ROOT, "dist", "src", "scripts", "seed-rooms-v1-target-gate.js")
const manifestJs = path.join(ROOT, "dist", "src", "scripts", "seed-rooms-v1-manifest.js")
assert.ok(fs.existsSync(gateJs), "compiled target-gate js must exist")
assert.ok(fs.existsSync(manifestJs), "compiled manifest js must exist")
const gateJsText = fs.readFileSync(gateJs, "utf8")
assert.match(gateJsText, /woodright_staging/, "staging DB name guard preserved")
assert.match(gateJsText, /woodright_production/, "production DB name guard present")
assert.match(gateJsText, /ROOMSET_V1_PRODUCTION_OWNER_APPROVED/)
assert.match(gateJsText, /I_UNDERSTAND_THIS_WRITES_PRODUCTION/)
assert.doesNotMatch(seedJsText, /medusa start/, "seed artifact is not a startup entry")

// Fidelity tests must not be compiled into dist/src/scripts
assert.equal(
  fs.existsSync(
    path.join(ROOT, "dist", "src", "scripts", "seed-rooms-v1-owner-approved.fidelity.test.js")
  ),
  false,
  "fidelity tests must not be packaged as runtime scripts"
)

console.log("ops-seeds-packaging.fidelity.test.ts: ok")
