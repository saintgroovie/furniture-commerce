#!/usr/bin/env node
/**
 * Fail if storefront src embeds forbidden production origins.
 *
 *   node apps/storefront/scripts/scan-forbidden-origins.mjs
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const SRC = path.join(ROOT, "src")
const FORBIDDEN = [
  { re: /http:\/\/localhost\b/i, label: "http://localhost" },
  { re: /https:\/\/localhost\b/i, label: "https://localhost" },
  { re: /http:\/\/127\.0\.0\.1\b/i, label: "http://127.0.0.1" },
  { re: /https:\/\/127\.0\.0\.1\b/i, label: "https://127.0.0.1" },
  { re: /http:\/\/89\.169\.188\.29\b/i, label: "http://89.169.188.29" },
  { re: /https:\/\/89\.169\.188\.29\b/i, label: "https://89.169.188.29" },
  { re: /http:\/\/api\.woodright-demo\.ru\b/i, label: "http://api.woodright-demo.ru" },
  { re: /\bws:\/\//i, label: "ws://" },
]

const SKIP_DIR = new Set(["node_modules", ".next", ".next-build", "dist", "coverage"])

/** Narrow allowlist: proven non-production embeds only. */
function isAllowed(rel, line) {
  if (/\.(fidelity\.test|test|spec)\.(ts|tsx|js|mjs)$/.test(rel)) return true
  if (rel.includes("/qa/")) return true
  // WHATWG URL base for relative parsing — not a network request
  if (/new URL\([^)]*["']https?:\/\/localhost["']/.test(line)) return true
  // Documented local site fallback when NEXT_PUBLIC_SITE_URL unset (SSR tooling)
  if (
    rel.endsWith("src/lib/api/base.ts") &&
    /NEXT_PUBLIC_SITE_URL\s*\?\?\s*["']http:\/\/localhost:8000["']/.test(line)
  ) {
    return true
  }
  return false
}

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR.has(ent.name)) continue
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(ent.name)) out.push(p)
  }
  return out
}

const hits = []
for (const file of walk(SRC)) {
  const rel = path.relative(ROOT, file)
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/)
  lines.forEach((line, i) => {
    if (isAllowed(rel, line)) return
    for (const f of FORBIDDEN) {
      if (f.re.test(line)) {
        hits.push({
          file: rel,
          line: i + 1,
          label: f.label,
          fragment: line.trim().slice(0, 160),
        })
      }
    }
  })
}

if (hits.length) {
  console.error("forbidden-origin scan FAILED:")
  for (const h of hits.slice(0, 80)) {
    console.error(`  ${h.file}:${h.line} [${h.label}] ${h.fragment}`)
  }
  process.exit(1)
}
console.log("scan-forbidden-origins: ok")
