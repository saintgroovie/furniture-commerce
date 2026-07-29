/**
 * Fidelity: promotions skip patch remains wired after Medusa upgrades.
 * Run: yarn dlx tsx src/scripts/patch-skip-cart-promotions.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const root = process.cwd()
const scriptPath = join(root, "scripts/patch-skip-cart-promotions.mjs")
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))

assert.equal(existsSync(scriptPath), true, "patch-skip-cart-promotions.mjs must exist")
const src = readFileSync(scriptPath, "utf8")
assert.match(src, /refuse silent skip/, "patch must refuse silent skip on pattern miss")
assert.match(
  src,
  /updateCartPromotionsWorkflow/,
  "patch must target updateCartPromotionsWorkflow"
)
assert.match(src, /Woodright: skip broken automatic promotion SQL/, "patch must use Woodright marker")
assert.match(
  src,
  /WOODRIGHT_PROMOTIONS_PATCH_DIR/,
  "patch must allow fixture override via WOODRIGHT_PROMOTIONS_PATCH_DIR"
)
assert.match(
  String(pkg.scripts?.postinstall || ""),
  /patch-skip-cart-promotions\.mjs/,
  "postinstall must invoke promotions patch"
)
assert.equal(pkg.packageManager, "yarn@4.17.1", "backend packageManager must stay on Yarn 4.17.1")

const SAMPLE_BLOCK = `    update_cart_promotions_1.updateCartPromotionsWorkflow.runAsStep({
      input: { cart_id: cart.id }
    });
`

function runPatch(dir: string) {
  return spawnSync(process.execPath, [scriptPath], {
    env: { ...process.env, WOODRIGHT_PROMOTIONS_PATCH_DIR: dir },
    encoding: "utf8",
  })
}

const fixtureRoot = mkdtempSync(join(tmpdir(), "wr-promotions-patch-"))
try {
  // matching files → patched
  const matchDir = join(fixtureRoot, "match")
  mkdirSync(matchDir)
  for (const file of ["create-carts.js", "refresh-cart-items.js"]) {
    writeFileSync(join(matchDir, file), `prelude\n${SAMPLE_BLOCK}epilogue\n`)
  }
  let r = runPatch(matchDir)
  assert.equal(r.status, 0, `match fixture exit: ${r.stderr}`)
  for (const file of ["create-carts.js", "refresh-cart-items.js"]) {
    const out = readFileSync(join(matchDir, file), "utf8")
    assert.match(out, /Woodright: skip broken automatic promotion SQL/)
    assert.doesNotMatch(out, /updateCartPromotionsWorkflow\.runAsStep/)
  }

  // already patched → idempotent success
  r = runPatch(matchDir)
  assert.equal(r.status, 0, `idempotent exit: ${r.stderr}`)

  // pattern miss → fail-fast
  const missDir = join(fixtureRoot, "miss")
  mkdirSync(missDir)
  writeFileSync(join(missDir, "create-carts.js"), "no promotion block\n")
  writeFileSync(join(missDir, "refresh-cart-items.js"), "no promotion block\n")
  r = runPatch(missDir)
  assert.notEqual(r.status, 0, "pattern miss must fail")
  assert.match(String(r.stderr), /refuse silent skip|pattern not found/)

  // missing file → fail-fast
  const missingDir = join(fixtureRoot, "missing")
  mkdirSync(missingDir)
  writeFileSync(join(missingDir, "create-carts.js"), `prelude\n${SAMPLE_BLOCK}epilogue\n`)
  r = runPatch(missingDir)
  assert.notEqual(r.status, 0, "missing workflow file must fail")
  assert.match(String(r.stderr), /missing/)
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true })
}

console.log("patch-skip-cart-promotions.fidelity: PASS")
