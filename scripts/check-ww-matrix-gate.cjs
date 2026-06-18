#!/usr/bin/env node
/**
 * Willie Winkie business gate: vv-painting-sku-matrix TODO_OPERATOR cells.
 * Output: tmp/media-ops-codex-review/ww-matrix-gate-status.json
 */
const fs = require("fs")
const path = require("path")

const csvPath = path.join(
  __dirname,
  "../tmp/willie-winkie-flow-a-matrix-template/vv-painting-sku-matrix-filled.csv"
)
const outPath = path.join(__dirname, "../tmp/media-ops-codex-review/ww-matrix-gate-status.json")

if (!fs.existsSync(csvPath)) {
  const payload = { gate_open: false, reason: "csv_missing", path: csvPath }
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2))
  console.log(JSON.stringify(payload))
  process.exit(0)
}

const text = fs.readFileSync(csvPath, "utf8")
const lines = text.trim().split("\n")
const header = lines[0].split(",")
let todoCells = 0
let rows = 0
for (let i = 1; i < lines.length; i++) {
  if (!lines[i].trim()) continue
  rows++
  if (lines[i].includes("TODO_OPERATOR")) todoCells++
}
const gateOpen = todoCells === 0 && rows > 0
const payload = {
  generated_at: new Date().toISOString(),
  csv_path: csvPath,
  rows,
  rows_with_todo_operator: todoCells,
  gate_open: gateOpen,
  message: gateOpen
    ? "Matrix has no TODO_OPERATOR markers"
    : `WW media/catalog blocked: ${todoCells} row(s) still contain TODO_OPERATOR`,
}
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2))
console.log(JSON.stringify(payload, null, 2))
