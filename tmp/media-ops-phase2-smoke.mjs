#!/usr/bin/env node
/**
 * Phase 2 smoke — Inbox orphan master-detail + redirects + bootstrap.
 */
const BASE = process.env.MEDIA_OPS_BASE || "http://localhost:3002"

async function main() {
  const results = []

  async function check(name, url, test, opts = {}) {
    try {
      const res = await fetch(url, {
        redirect: opts.followRedirect === false ? "manual" : "follow",
        signal: AbortSignal.timeout(20000),
      })
      const html = await res.text()
      const ok = test(html, res)
      results.push({ name, ok, status: res.status })
      console.log(ok ? "✓" : "✗", name, res.status)
    } catch (e) {
      results.push({ name, ok: false, error: String(e) })
      console.log("✗", name, String(e))
    }
  }

  await check("bootstrap 200", `${BASE}/qa/source-media-orphan-review/api/bootstrap`, (h, r) => {
    if (!r.ok) return false
    const j = JSON.parse(h)
    return Array.isArray(j.items) && j.items.length > 100
  })

  await check("inbox shell", `${BASE}/qa/media-ops/inbox?tab=orphan`, (h) =>
    h.includes("data-media-ops-inbox-tab") && h.includes("Woodright Media Ops")
  )

  await check(
    "orphan legacy redirect",
    `${BASE}/qa/source-media-orphan-review`,
    (h, r) => r.status === 307 || h.includes("/qa/media-ops/inbox"),
    { followRedirect: false }
  )

  await check("inbox orphan panel mount", `${BASE}/qa/media-ops/inbox`, (h) =>
    h.includes("data-media-ops-orphan-panel") || h.includes("Загрузка очереди") || h.includes("Очередь сирот")
  )

  const failed = results.filter((r) => !r.ok)
  if (failed.length) {
    console.error("\nFailed:", failed.length)
    process.exit(1)
  }
  console.log("\nAll checks passed:", results.length)
}

main()
