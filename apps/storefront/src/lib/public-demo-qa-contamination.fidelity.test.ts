/**
 * Built-artifact + scanner regression for public_demo QA contamination.
 */
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const storefrontRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const repoRoot = path.resolve(storefrontRoot, "../..")
const scannerPath = path.join(repoRoot, "scripts/release/scan-storefront-contamination.cjs")
const { scanDirectory, filesystemForbiddenNeedles } = require(scannerPath) as {
  scanDirectory: (profile: string, dir: string) => { ok: boolean; forbiddenHits: unknown[] }
  filesystemForbiddenNeedles: (profile: string) => string[]
}

const FORBIDDEN_APEX = "https://" + "woodright.ru"

// 1. Scanner still forbids production apex for public_demo (not weakened).
const needles = filesystemForbiddenNeedles("public_demo")
assert.ok(needles.includes(FORBIDDEN_APEX), "public_demo forbidden needles must include production apex")
assert.ok(needles.includes("https://" + "www.woodright.ru"))
assert.ok(needles.includes("https://" + "api.woodright.ru"))

// 2. QA board shipped sources must not contain scheme-qualified production apex.
for (const rel of [
  "src/app/qa/legacy-site-media-approval-board/approval-board-preview.ts",
  "src/app/qa/legacy-site-media-approval-board/api/preview/route.ts",
]) {
  const text = fs.readFileSync(path.join(storefrontRoot, rel), "utf8")
  assert.ok(!text.includes(FORBIDDEN_APEX), `${rel} must not hardcode production apex`)
}

// 3. Clean public_demo synthetic artifact passes contamination gate.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wr-qa-contam-clean-"))
  try {
    const chunk = path.join(dir, "chunks/app.js")
    fs.mkdirSync(path.dirname(chunk), { recursive: true })
    fs.writeFileSync(
      chunk,
      'const SITE="https://woodright-demo.ru";const API="https://api.woodright-demo.ru";const MODE="private_noindex";const PAY="manual_invoice";const HOSTS=["woodright.ru"];',
      "utf8"
    )
    const r = scanDirectory("public_demo", dir)
    assert.equal(r.ok, true, "clean public_demo artifact with bare legacy hostname must PASS")
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

// 4. Injected production-domain fixture must FAIL_CLOSED.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wr-qa-contam-neg-"))
  try {
    const chunk = path.join(dir, "chunks/app.js")
    fs.mkdirSync(path.dirname(chunk), { recursive: true })
    fs.writeFileSync(
      chunk,
      'const SITE="https://woodright-demo.ru";const API="https://api.woodright-demo.ru";const MODE="private_noindex";const PAY="manual_invoice";const WRONG="' +
        FORBIDDEN_APEX +
        '";',
      "utf8"
    )
    const r = scanDirectory("public_demo", dir)
    assert.equal(r.ok, false, "injected production apex must FAIL contamination")
    assert.ok(r.forbiddenHits.length > 0)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

// 5. Scanner fidelity suite still green (workflow wiring + negative cases).
{
  const r = spawnSync("node", [path.join(repoRoot, "scripts/release/scan-storefront-contamination.fidelity.test.cjs")], {
    cwd: repoRoot,
    encoding: "utf8",
  })
  assert.equal(r.status, 0, `contamination fidelity suite must PASS\n${r.stdout}\n${r.stderr}`)
}

console.log("PASS public-demo-qa-contamination fidelity")
