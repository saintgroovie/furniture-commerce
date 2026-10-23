import assert from "node:assert/strict"
import { createCatalogReadGate, withCatalogReadBudget } from "./catalog-read-budget"

async function main() {
  const run = createCatalogReadGate(3, 24)
  let active = 0, peak = 0, entered = 0
  const releases: Array<() => void> = []
  const read = async () => {
    active++; entered++; peak = Math.max(peak, active)
    await new Promise<void>(resolve => releases.push(resolve))
    active--; return entered
  }
  const requests = Array.from({ length: 27 }, () => run(read, new AbortController().signal))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(entered, 3)
  await assert.rejects(run(read, new AbortController().signal), /capacity exceeded/)
  const cancelled = new AbortController()
  cancelled.abort(new Error("Abandoned buyer"))
  await assert.rejects(run(read, cancelled.signal), /Abandoned buyer/)
  while (releases.length || active) {
    releases.splice(0).forEach(resolve => resolve())
    await new Promise(resolve => setImmediate(resolve))
  }
  await Promise.all(requests)
  assert.equal(entered, 27); assert.equal(peak, 3)

  const one = createCatalogReadGate(1, 1), first = new AbortController(), waiting = new AbortController()
  let done!: () => void
  const running = one(() => new Promise<void>(resolve => { done = resolve }), first.signal)
  await new Promise(resolve => setImmediate(resolve))
  let abandonedReadStarted = false
  const queued = one(async () => { abandonedReadStarted = true }, waiting.signal)
  waiting.abort(new Error("Disconnected while queued"))
  await assert.rejects(queued, /Disconnected/)
  done(); await running
  await one(async () => {}, new AbortController().signal)
  assert.equal(abandonedReadStarted, false)

  // The budget covers response-body work, not only receipt of HTTP headers.
  await assert.rejects(withCatalogReadBudget(signal => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true })
  }), null, 20), /budget expired/)
  let price = 100
  assert.equal(await withCatalogReadBudget(async () => price, null, 100), 100)
  price = 125
  assert.equal(await withCatalogReadBudget(async () => price, null, 100), 125, "Admission shares no stale response cache")
  console.log("Catalog read budget: concurrency/queue/cancellation/body deadline/freshness PASS")
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
