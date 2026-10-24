/** Bound expensive full-catalog reads, including body parsing, across SSR renders. */
export function createCatalogReadGate(limit = 3, maxPending = 24) {
  let active = 0
  const pending: Array<{ start: () => void; cancel: () => void }> = []
  function acquire(signal: AbortSignal): Promise<() => void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) { reject(signal.reason); return }
      if (active >= limit && pending.length >= maxPending) {
        reject(new Error("Catalog read capacity exceeded")); return
      }
      let released = false
      const waiter = {
        start() {
          signal.removeEventListener("abort", waiter.cancel)
          active++
          resolve(() => {
            if (released) return
            released = true; active--
            pending.shift()?.start()
          })
        },
        cancel() {
          const index = pending.indexOf(waiter)
          if (index >= 0) pending.splice(index, 1)
          signal.removeEventListener("abort", waiter.cancel)
          reject(signal.reason)
        },
      }
      if (active < limit) waiter.start()
      else { pending.push(waiter); signal.addEventListener("abort", waiter.cancel, { once: true }) }
    })
  }
  return async function run<T>(read: (signal: AbortSignal) => Promise<T>, signal: AbortSignal) {
    const release = await acquire(signal)
    try {
      signal.throwIfAborted()
      return await read(signal)
    } finally { release() }
  }
}

const gateKey = Symbol.for("woodright.fullCatalogReadGate.v1")
type Gate = ReturnType<typeof createCatalogReadGate>
const processState = globalThis as typeof globalThis & { [gateKey]?: Gate }
// Next route entries must share one process budget, never one budget per request.
const runCatalogRead = processState[gateKey] ??= createCatalogReadGate()

export async function withCatalogReadBudget<T>(read: (signal: AbortSignal) => Promise<T>,
  renderSignal: AbortSignal | null, timeoutMs: number): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error("Catalog read budget expired")), timeoutMs)
  const signal = renderSignal ? AbortSignal.any([renderSignal, controller.signal]) : controller.signal
  try { return await runCatalogRead(read, signal) }
  finally { clearTimeout(timer) }
}
