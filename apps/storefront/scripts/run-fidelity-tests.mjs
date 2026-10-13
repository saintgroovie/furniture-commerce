#!/usr/bin/env node
/**
 * Run colocated storefront fidelity tests via tsx.
 * tsx is resolved once. Per-file `yarn dlx` reinstalls it and the suite
 * dies with SIGHUP (exit 129) before the last file.
 * Does not add a permanent lockfile dependency.
 */
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
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

function tsxCli() {
  const candidates = [
    join(process.cwd(), "node_modules/tsx/dist/cli.mjs"),
    join(process.cwd(), "../backend/node_modules/tsx/dist/cli.mjs"),
  ]
  return candidates.find((path) => existsSync(path)) ?? null
}

function ensureTsxCli() {
  const ready = tsxCli()
  if (ready) return ready
  const dir = mkdtempSync(join(tmpdir(), "woodright-tsx-"))
  const init = spawnSync("yarn", ["init", "-2"], { cwd: dir, stdio: "inherit" })
  if (init.status !== 0) return null
  /* Yarn 4 defaults to Plug'n'Play outside the storefront .yarnrc.yml.
     The suite executes node_modules/tsx/dist/cli.mjs, so the temp project
     must materialize that file. */
  writeFileSync(join(dir, ".yarnrc.yml"), "nodeLinker: node-modules\n")
  const add = spawnSync("yarn", ["add", "tsx"], { cwd: dir, stdio: "inherit" })
  if (add.status !== 0) return null
  const installed = join(dir, "node_modules/tsx/dist/cli.mjs")
  return existsSync(installed) ? installed : null
}

const tsxBin = ensureTsxCli()
if (!tsxBin) {
  console.error("tsx is not available for fidelity tests")
  process.exit(1)
}

let failed = 0
for (const file of files) {
  const r = file.endsWith(".mjs")
    ? spawnSync(process.execPath, [file], { stdio: "inherit" })
    : spawnSync(process.execPath, [tsxBin, file], { stdio: "inherit" })
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
