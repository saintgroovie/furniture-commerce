#!/usr/bin/env node
/**
 * Phase 1 smoke — Media Ops assign shell + export wrapper contract.
 * Requires dev server: http://localhost:3002
 */
const BASE = process.env.MEDIA_OPS_BASE || "http://localhost:3002"

async function main() {
  const results = []

  async function check(name, url, test) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
      const html = await res.text()
      const ok = res.ok && test(html)
      results.push({ name, ok, status: res.status })
      console.log(ok ? "✓" : "✗", name, res.status)
    } catch (e) {
      results.push({ name, ok: false, error: String(e) })
      console.log("✗", name, String(e))
    }
  }

  await check("media-ops assign", `${BASE}/qa/media-ops/assign`, (h) =>
    h.includes("Woodright Media Ops") && h.includes('data-v2-embedded-in-shell="true"')
  )

  await check("legacy v2 redirect", `${BASE}/qa/legacy-media-assignment-board-v2?handle=co-02-1`, (h) =>
    h.includes("/qa/media-ops/assign") || h.includes("co-02-1")
  )

  await check("no duplicate export toolbar", `${BASE}/qa/media-ops/assign`, (h) =>
    !h.includes("Reset v2") && !h.includes("Copy JSON</button>")
  )

  const failed = results.filter((r) => !r.ok)
  if (failed.length) {
    console.error("\nFailed:", failed.length)
    process.exit(1)
  }
  console.log("\nAll checks passed:", results.length)
}

main()
