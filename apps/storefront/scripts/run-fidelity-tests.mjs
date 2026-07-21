#!/usr/bin/env node
/**
 * Run colocated storefront fidelity tests via tsx (downloaded by yarn dlx).
 * Does not add a permanent lockfile dependency.
 */
import { spawnSync } from "node:child_process"
import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"

function walk(dir, acc = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return acc
  }
  for (const name of entries) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, acc)
    else if (
      name.endsWith(".fidelity.test.ts") ||
      name.endsWith(".fidelity.test.mjs")
    ) {
      acc.push(p)
    }
  }
  return acc
}

const files = walk(join("src")).sort()
if (!files.length) {
  console.error("No fidelity tests found")
  process.exit(1)
}

let failed = 0
for (const file of files) {
  const r =
    file.endsWith(".mjs")
      ? spawnSync(process.execPath, [file], { stdio: "inherit" })
      : spawnSync("yarn", ["dlx", "tsx", file], { stdio: "inherit" })
  if (r.status !== 0) {
    failed += 1
    console.error(`FAIL ${file}`)
  }
}
if (failed) {
  console.error(`fidelity failures: ${failed}/${files.length}`)
  process.exit(1)
}
console.log(`fidelity ok: ${files.length} files`)
