#!/usr/bin/env node
/**
 * Static gate BX helper: owner-review workspace must not call production write APIs.
 */
const fs = require("fs")
const path = require("path")

const ROOT = path.join(__dirname, "..")
const ALLOW_EXT = new Set([".js", ".cjs", ".html", ".mjs", ".ts"])
const FORBIDDEN = [
  /fetch\(\s*['"`]https?:\/\/[^'"`]+\/admin\//i,
  /fetch\(\s*['"`]https?:\/\/[^'"`]+\/store\/[^'"`]+['"`]\s*,\s*\{[^}]*method\s*:\s*['"`](POST|PUT|PATCH|DELETE)/i,
  /axios\.(post|put|patch|delete)\(\s*['"`]https?:\/\/[^'"`]+\/(admin|store)\//i,
  /MEDUSA_BACKEND_URL.*\.(post|put|patch|delete)/i,
]

let failed = 0
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === "scripts") continue
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(p)
    else if (ALLOW_EXT.has(path.extname(ent.name))) {
      const text = fs.readFileSync(p, "utf8")
      for (const re of FORBIDDEN) {
        if (re.test(text)) {
          console.error("FAIL write API pattern in", p)
          failed++
        }
      }
      // local /api/decision is allowed (file-backed), production paths forbidden above
      if (/\/admin\/products/.test(text) && /\b(POST|PATCH|PUT|DELETE)\b/.test(text)) {
        console.error("FAIL admin products mutation reference in", p)
        failed++
      }
    }
  }
}

walk(ROOT)
if (failed) process.exit(1)
console.log("PASS assert-no-write-api")
