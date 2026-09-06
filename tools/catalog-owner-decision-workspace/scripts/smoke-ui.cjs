#!/usr/bin/env node
/**
 * Lightweight UI smoke (no Playwright dependency): health, bootstrap, preview, tabs tokens.
 */
const http = require("http")

const HOST = process.env.OWNER_REVIEW_HOST || "127.0.0.1"
const PORT = Number(process.env.OWNER_REVIEW_PORT || 3051)

function get(path) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: HOST, port: PORT, path }, (res) => {
        let body = ""
        res.on("data", (c) => (body += c))
        res.on("end", () => resolve({ status: res.statusCode, body }))
      })
      .on("error", reject)
  })
}

async function main() {
  const health = await get("/api/health")
  if (health.status !== 200) throw new Error("health")
  const h = JSON.parse(health.body)
  if (h.write_api !== false) throw new Error("write_api must be false")

  const boot = await get("/api/bootstrap")
  if (boot.status !== 200) throw new Error("bootstrap")
  const b = JSON.parse(boot.body)
  if (!b.rows || !b.rows.length) throw new Error("rows missing")
  if (!b.engineering) throw new Error("engineering missing")

  const preview = await get("/api/preview")
  const p = JSON.parse(preview.body)
  if (p.result !== "no_approved_mutations" && !(p.approved_count >= 0)) {
    throw new Error("preview shape")
  }

  const html = await get("/")
  for (const token of [
    "Требуют решения",
    "Категория",
    "Коллекция",
    "Зеркала",
    "Отложено",
    "Решено",
    "Инженерные замечания",
  ]) {
    if (!html.body.includes(token)) throw new Error("missing tab " + token)
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        owner_rows: b.rows.length,
        engineering: b.engineering.length,
        preview: p.result,
        auto_deferred: b.summary && b.summary.auto_deferred_no_image,
      },
      null,
      2
    )
  )
}

main().catch((e) => {
  console.error("FAIL", e.message || e)
  process.exit(1)
})
