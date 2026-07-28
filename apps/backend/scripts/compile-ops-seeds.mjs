#!/usr/bin/env node
/**
 * Compile owner-approved operational Medusa exec scripts into dist/src/scripts/.
 *
 * Why: apps/backend/tsconfig.json excludes src/scripts/**, and the production
 * Dockerfile copies only dist/ + scripts/ (ops shell helpers). Without this step,
 * seed-rooms-v1-* is absent from the immutable runtime image.
 *
 * transpileModule only — does not re-emit modules/API already produced by
 * `yarn medusa build`. Relative requires stay intact for /server/src/modules/*.
 *
 * Never invoked from container CMD/HEALTHCHECK.
 */
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const ts = require("typescript")

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const OUT_DIR = path.join(ROOT, "dist", "src", "scripts")

/** Allowlist only — do not widen without an explicit packaging review. */
const OPS_SEED_FILES = [
  "seed-rooms-v1-plan.ts",
  "seed-rooms-v1-owner-approved.ts",
]

fs.mkdirSync(OUT_DIR, { recursive: true })

for (const name of OPS_SEED_FILES) {
  const srcPath = path.join(ROOT, "src", "scripts", name)
  if (!fs.existsSync(srcPath)) {
    console.error(`compile-ops-seeds: missing ${srcPath}`)
    process.exit(1)
  }
  const source = fs.readFileSync(srcPath, "utf8")
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      skipLibCheck: true,
    },
    fileName: srcPath,
  })
  const outName = name.replace(/\.ts$/, ".js")
  const outPath = path.join(OUT_DIR, outName)
  fs.writeFileSync(outPath, outputText)
  console.log(`compile-ops-seeds: wrote ${path.relative(ROOT, outPath)}`)
}

for (const name of OPS_SEED_FILES) {
  const outPath = path.join(OUT_DIR, name.replace(/\.ts$/, ".js"))
  if (!fs.existsSync(outPath) || fs.statSync(outPath).size < 32) {
    console.error(`compile-ops-seeds: output missing/too small: ${outPath}`)
    process.exit(1)
  }
}

console.log("compile-ops-seeds: ok")
