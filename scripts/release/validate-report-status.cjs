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
