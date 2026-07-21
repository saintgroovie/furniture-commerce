#!/usr/bin/env node
/**
 * Validate Woodright report packet task status claims (static text scan).
 * Fails if `done_deployed_and_verified` appears without required tokens,
 * or if bare status `done` is used.
 */
const fs = require("fs")
const path = require("path")

const REQUIRED_FOR_DEPLOYED_VERIFIED = [
  /https?:\/\/[^\s)]+/i,
  /sha256:[0-9a-f]{64}/i,
  /five|5\s+sample|race sample/i,
  /rollback/i,
  /DOM|hydrated|product-card|первая карточка|first card/i,
]

function validate(text, errors) {
  if (/(?:^|\n)##\s*Task status\s*\n+\s*done\s*(?:\n|$)/i.test(text)) {
    errors.push("ambiguous bare status `done` is forbidden")
  }
  if (/(?:^|\n)\s*done\s*(?:\n|$)/.test(text) && !/done_/.test(text)) {
    errors.push("bare `done` token without taxonomy suffix is forbidden")
  }

  // GATE Z: metadata reconciliation must not claim deploy
  const deployYes = /deploy\s+performed:\s*yes/i.test(text)
  const onlyReconciliation =
    /reconciled_external_cutover|metadata\s+reconciliation/i.test(text) &&
    !/cutover\s+transaction\s+id\s*:\s*ctx-/i.test(text)
  if (deployYes && onlyReconciliation) {
    errors.push("deploy performed: yes forbidden for metadata-only reconciliation")
  }
  if (/done_deployed_and_verified/.test(text) && !/transaction_id|cutover transaction/i.test(text)) {
    errors.push("done_deployed_and_verified requires cutover transaction evidence")
  }
  if (/external\s+unproven\s+cutover/i.test(text) && /task status[\s\S]{0,80}\bdone_/i.test(text)) {
    errors.push("status done* forbidden while external cutover unproven")
  }

  // GATE AQ — report correctness for split / DQ / reconciliation language
  const claimsSplit =
    /split\s+pair|backend\s+revision|storefront\s+revision|be\s+digest|sf\s+digest/i.test(text)
  if (
    claimsSplit &&
    /single\s+release\s+sha|one\s+release\s+sha|entire\s+pair.*\b[0-9a-f]{7,40}\b/i.test(text) &&
    /identity\s+of\s+(the\s+)?(whole\s+)?pair|pair\s+identity\s+is\s+[0-9a-f]{7}/i.test(text)
  ) {
    errors.push("split pair described by one SHA")
  }
  if (
    /split\s+pair/i.test(text) &&
    /active_release_sha\s*[:=]\s*[0-9a-f]{7,40}/i.test(text) &&
    !/bundle_id|not\s+a\s+pair\s+identity|must\s+not\s+describe/i.test(text)
  ) {
    errors.push("split pair described by one SHA")
  }
  if (/metadata\s+reconciliation/i.test(text) && /(?:^|\n).*called\s+deploy|reconciliation\s+is\s+a\s+deploy/i.test(text)) {
    errors.push("reconciliation called deploy")
  }
  if (
    /dto\s+gap|not_exposed_by_endpoint/i.test(text) &&
    /dto\s+gaps?\s+(are|is|=)\s+catalog\s+data\s+gaps?/i.test(text)
  ) {
    errors.push("DTO gaps called catalog data gaps")
  }
  if (/metadata\s+migration/i.test(text) && /metadata\s+migration\s+(is|=)\s+(a\s+)?cutover/i.test(text)) {
    errors.push("metadata migration called cutover")
  }

  if (!/done_deployed_and_verified/.test(text)) return
  for (const re of REQUIRED_FOR_DEPLOYED_VERIFIED) {
    if (!re.test(text)) errors.push(`done_deployed_and_verified missing evidence matching ${re}`)
  }
}

function runOne(file) {
  const errors = []
  const text = fs.readFileSync(file, "utf8")
  validate(text, errors)
  return { file, ok: errors.length === 0, errors }
}

function main() {
  const args = process.argv.slice(2)
  if (args[0] === "--fixture-dir") {
    const dir = args[1]
    let failed = 0
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".md"))) {
      const r = runOne(path.join(dir, f))
      const shouldFail = f.startsWith("neg-")
      const pass = shouldFail ? !r.ok : r.ok
      console.log(`${pass ? "PASS" : "FAIL"} ${f} ${r.errors.join("; ")}`)
      if (!pass) failed++
    }
    process.exit(failed ? 1 : 0)
  }
  if (!args[0]) {
    console.error("usage: validate-report-status.cjs <packet.md> | --fixture-dir <dir>")
    process.exit(2)
  }
  const r = runOne(args[0])
  if (!r.ok) {
    console.error("FAIL", r.errors.join("\n"))
    process.exit(1)
  }
  console.log("OK report status")
}

main()
