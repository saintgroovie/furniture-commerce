#!/usr/bin/env node
/**
 * Phase 2 Task 2.1 smoke — orphan panel in Media Ops inbox.
 * Requires dev server: http://localhost:3002
 */
const BASE = process.env.MEDIA_OPS_BASE || "http://localhost:3002"

async function main() {
  const results = []

  async function check(name, url, test, { allowNotOk = false } = {}) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
      const html = await res.text()
      const ok = (res.ok || allowNotOk) && test(html, res.status)
      results.push({ name, ok, status: res.status })
      console.log(ok ? "✓" : "✗", name, res.status)
    } catch (e) {
      results.push({ name, ok: false, error: String(e) })
      console.log("✗", name, String(e))
    }
  }

  await check("inbox 200 + shell", `${BASE}/qa/media-ops/inbox`, (h) =>
    h.includes("Woodright Media Ops") && h.includes('data-media-ops-tab="inbox"')
  )

  await check("orphan panel embedded", `${BASE}/qa/media-ops/inbox`, (h) =>
    h.includes('data-media-ops-orphan-panel') || h.includes("Загрузка очереди сирот")
  )

  await check("legacy orphan still works", `${BASE}/qa/source-media-orphan-review`, (h) =>
    h.includes("orphan") || h.includes("sor-root") || h.includes("Загрузка")
  )

  await check(
    "bootstrap API route",
    `${BASE}/qa/source-media-orphan-review/api/bootstrap`,
    (h) => {
      try {
        const j = JSON.parse(h)
        return Array.isArray(j.items) || typeof j.error === "string"
      } catch {
        return false
      }
    },
    { allowNotOk: true }
  )

  const failed = results.filter((r) => !r.ok)
  if (failed.length) {
    console.error("\nFailed:", failed.length)
    process.exit(1)
  }
  console.log("\nAll checks passed:", results.length)
}

main()
