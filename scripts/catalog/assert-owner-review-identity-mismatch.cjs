#!/usr/bin/env node
/**
 * CI negative: inventory identity divergence must fail packet build.
 */
const fs = require("fs")
const os = require("os")
const path = require("path")
const { spawnSync } = require("child_process")

const root = path.resolve(__dirname, "../..")
const cmpPath = path.join(root, "scripts/catalog/fixtures/sample-endpoint-comparison.json")
const cmp = JSON.parse(fs.readFileSync(cmpPath, "utf8"))
const inv = {}
for (const [k, v] of Object.entries(cmp)) {
  if (k === "rows") continue
  inv[k] = v
}
inv.bundle_id = "wrb-TAMPERED"

const td = fs.mkdtempSync(path.join(os.tmpdir(), "wr-or-id-"))
const cmpFile = path.join(td, "cmp.json")
const invFile = path.join(td, "inv.json")
const outDir = path.join(td, "out")
fs.writeFileSync(cmpFile, JSON.stringify(cmp))
fs.writeFileSync(invFile, JSON.stringify(inv))

const r = spawnSync(
  process.execPath,
  [
    path.join(root, "scripts/catalog/build-owner-review-packet.cjs"),
    "--endpoint-comparison",
    cmpFile,
    "--inventory",
    invFile,
    "--out",
    outDir,
  ],
  { encoding: "utf8" }
)

if (r.status === 0) {
  console.error("FAIL identity mismatch must fail")
  process.exit(1)
}
console.log("PASS owner-review identity mismatch")
