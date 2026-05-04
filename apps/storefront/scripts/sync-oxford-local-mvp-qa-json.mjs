#!/usr/bin/env node
/**
 * Copies Oxford local MVP **JSON artifacts only** from repo `data/normalized/`
 * into `apps/storefront/qa-data/oxford-local-mvp/` for storefront runtimes that
 * cannot mount repo `data/` (e.g. some containers without compose volume overrides).
 *
 * Run from repo root:
 *   node apps/storefront/scripts/sync-oxford-local-mvp-qa-json.mjs
 *
 * Or from apps/storefront:
 *   node scripts/sync-oxford-local-mvp-qa-json.mjs
 *
 * Does not copy images, evidence, or assignment plans from other pipelines.
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const FILES = [
  "oxford-local-mvp-media-inventory.json",
  "oxford-local-mvp-sku-media-candidate-map.json",
  "oxford-local-mvp-media-assignment-plan.json",
]

function findRepoRoot(startAbs) {
  let cur = path.resolve(startAbs)
  for (let i = 0; i < 28; i++) {
    const code = path.join(cur, "docs", "project", "CODEMAP.md")
    const dn = path.join(cur, "data", "normalized")
    if (fs.existsSync(code) && fs.existsSync(dn)) return cur
    const parent = path.dirname(cur)
    if (parent === cur) break
    cur = parent
  }
  return null
}

const outDir = path.join(__dirname, "..", "qa-data", "oxford-local-mvp")
const repo =
  findRepoRoot(process.cwd()) ||
  findRepoRoot(__dirname) ||
  findRepoRoot(path.join(__dirname, "..", "..", ".."))

if (!repo) {
  console.error("sync-oxford-local-mvp-qa-json: could not find repo root (docs/project/CODEMAP.md + data/normalized).")
  process.exit(1)
}

fs.mkdirSync(outDir, { recursive: true })
let ok = 0
for (const f of FILES) {
  const src = path.join(repo, "data", "normalized", f)
  const dst = path.join(outDir, f)
  if (!fs.existsSync(src)) {
    console.warn("skip (missing source):", src)
    continue
  }
  fs.copyFileSync(src, dst)
  console.log("copied", f, "→", dst)
  ok += 1
}
if (ok === 0) {
  console.error("sync-oxford-local-mvp-qa-json: no files copied.")
  process.exit(1)
}
