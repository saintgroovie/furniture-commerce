/**
 * Behavioral fidelity: the fetch budget cancels underlying work as well as waiting.
 *
 *   cd apps/storefront && yarn dlx tsx src/lib/medusa-fetch-timeout.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { medusaFetch } from "./api/base"

async function main() {
  {
    const prev = globalThis.fetch
    const prevTimeout = process.env.MEDUSA_FETCH_TIMEOUT_MS
    let requestSignal: AbortSignal | null = null
    process.env.MEDUSA_FETCH_TIMEOUT_MS = "80"
    globalThis.fetch = ((_url, init) => {
      requestSignal = init?.signal ?? null
      return (
      new Promise(() => {
        /* never resolves */
      }))
    }) as typeof fetch

    const started = Date.now()
    let rejected = false
    try {
      await medusaFetch("http://127.0.0.1:9/never")
    } catch (err) {
      rejected = /timed out after 80ms/i.test(String(err))
    } finally {
      globalThis.fetch = prev
      if (prevTimeout === undefined) delete process.env.MEDUSA_FETCH_TIMEOUT_MS
      else process.env.MEDUSA_FETCH_TIMEOUT_MS = prevTimeout
    }

    assert.equal(rejected, true)
    assert.equal((requestSignal as AbortSignal | null)?.aborted, true, "Timed out work must be cancelled")
    assert.ok(Date.now() - started < 2_000, "timeout must reject promptly")
  }

  {
    const prev = globalThis.fetch
    let sawSignal = false
    globalThis.fetch = ((url, init) => {
      sawSignal = Boolean(init?.signal)
      return Promise.resolve(new Response("ok", { status: 200 }))
    }) as typeof fetch

    const ac = new AbortController()
    const res = await medusaFetch("http://127.0.0.1:9/with-signal", {
      signal: ac.signal,
    })
    globalThis.fetch = prev

    assert.equal(res.status, 200)
    assert.equal(sawSignal, true)
  }

  console.log("medusa-fetch-timeout.fidelity.test.ts: ok")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
