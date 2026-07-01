#!/usr/bin/env node
/**
 * Guard before medusa start / develop — prevent "Cannot GET /app" from wrong runtime.
 */
import fs from "node:fs"
import http from "node:http"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")
const command = process.env.MEDUSA_RUNTIME_COMMAND || "unknown"
const port = Number(process.env.PORT || 9000)
const nodeEnv = process.env.NODE_ENV || "development"

const publicAdminHtml = path.join(root, "public/admin/index.html")
const distAdminHtml = path.join(root, "dist/public/admin/index.html")

function httpGet(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 3000 }, (res) => {
      let body = ""
      res.on("data", (chunk) => {
        body += chunk
      })
      res.on("end", () => {
        resolve({ status: res.statusCode ?? 0, body })
      })
    })
    req.on("error", () => resolve({ status: 0, body: "" }))
    req.on("timeout", () => {
      req.destroy()
      resolve({ status: 0, body: "" })
    })
  })
}

async function probePort() {
  const health = await httpGet(`http://127.0.0.1:${port}/health`)
  if (health.status === 200 && health.body.includes("OK")) {
    return "medusa_ok"
  }

  const app = await httpGet(`http://127.0.0.1:${port}/app`)
  if (app.status === 200 && app.body.includes("entry.jsx")) {
    return "admin_dev_ok"
  }

  if (app.body.includes("Cannot GET")) {
    return "broken_stub"
  }

  if (health.status > 0 || app.status > 0) {
    return "foreign"
  }

  return "free"
}

function ensurePublicAdminBuild() {
  if (fs.existsSync(publicAdminHtml)) return true

  if (fs.existsSync(distAdminHtml)) {
    const link = spawnSync(process.execPath, [path.join(__dirname, "link-admin-build.mjs")], {
      cwd: root,
      stdio: "inherit",
    })
    return link.status === 0 && fs.existsSync(publicAdminHtml)
  }

  return false
}

async function main() {
  if (command === "start") {
    if (nodeEnv !== "production" && process.env.MEDUSA_ALLOW_START_IN_DEV !== "1") {
      console.error(`
Woodright: blocked "npm run start" while NODE_ENV=${nodeEnv}.

Medusa Admin locally needs Vite dev server — use:
  cd apps/backend && npm run dev

If admin glitches (Cannot GET /app, white screen):
  npm run dev:reset
  then Cmd+Shift+R on http://localhost:9000/app

Production-style local (no Vite): npm run build && MEDUSA_ALLOW_START_IN_DEV=1 npm run start
`)
      process.exit(1)
    }

    if (!ensurePublicAdminBuild()) {
      console.error(`
Woodright: admin build missing for medusa start.

Run:
  cd apps/backend && npm run build

This creates dist/public/admin and links public/admin for medusa start.
`)
      process.exit(1)
    }
  }

  const portState = await probePort()
  if (portState === "broken_stub") {
    const pids = spawnSync("lsof", ["-ti", `:${port}`], { encoding: "utf8" })
      .stdout.trim()
      .split("\n")
      .filter(Boolean)
      .join(" ")
    console.error(`
Woodright: port ${port} is occupied by a broken HTTP stub (Cannot GET /app).
PIDs: ${pids || "(unknown)"}

Kill the stale process, then start dev:
  lsof -ti :${port} | xargs kill
  cd apps/backend && npm run dev:reset
`)
    process.exit(1)
  }

  if (command === "develop" && (portState === "medusa_ok" || portState === "admin_dev_ok")) {
    console.log(`[ensure-admin-runtime] port ${port} already serves Medusa — reusing`)
  }
}

main().catch((err) => {
  console.error("[ensure-admin-runtime] failed:", err)
  process.exit(1)
})
