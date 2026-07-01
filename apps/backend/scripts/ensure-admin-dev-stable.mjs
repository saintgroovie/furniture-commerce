#!/usr/bin/env node
/**
 * Единый bootstrap перед medusa develop: patch develop watch + финализация Vite cache.
 */
import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function runNodeScript(name) {
  const script = path.join(__dirname, name)
  const result = spawnSync(process.execPath, [script], {
    cwd: path.resolve(__dirname, ".."),
    env: process.env,
    stdio: "inherit",
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

runNodeScript("patch-medusa-develop-watch.mjs")
runNodeScript("finalize-admin-vite-cache.mjs")
