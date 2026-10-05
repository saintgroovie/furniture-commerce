import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { deskExchange, READ_FAILURE, WRITE_UNCERTAIN, withDeskBound } from "./desk-bound.ts"

function hang(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => {
      const error = new Error("The operation was aborted due to timeout")
      error.name = "TimeoutError"
      reject(error)
    })
  })
}

describe("desk bound", () => {
  it("turns a never-resolving read into the load error without waiting the production bound", async () => {
    const started = Date.now()
    await assert.rejects(
      () => withDeskBound(hang, 20, () => new Error(READ_FAILURE)),
      (error: unknown) => error instanceof Error && error.message === READ_FAILURE
    )
    assert.ok(Date.now() - started < 1000)
  })

  it("uses a different message when a write is not confirmed", async () => {
    await assert.rejects(
      () => withDeskBound(hang, 20, () => new Error(WRITE_UNCERTAIN)),
      (error: unknown) => error instanceof Error && error.message === WRITE_UNCERTAIN
    )
  })

  it("stops when response headers arrived but the body never does", async () => {
    const started = Date.now()
    await assert.rejects(
      () => deskExchange((signal) => {
        const stream = new ReadableStream({
          start(controller) {
            signal.addEventListener("abort", () => {
              controller.error(Object.assign(new Error("aborted"), { name: "AbortError" }))
            })
          },
        })
        return Promise.resolve(new Response(stream, { status: 200 }))
      }, 20, () => new Error(READ_FAILURE)),
      (error: unknown) => error instanceof Error && error.message === READ_FAILURE
    )
    assert.ok(Date.now() - started < 1000)
  })

  it("maps a dropped write connection to the unconfirmed-save error", async () => {
    await assert.rejects(
      () => deskExchange(async () => {
        throw new TypeError("fetch failed")
      }, 1000, () => new Error(WRITE_UNCERTAIN)),
      (error: unknown) => error instanceof Error && error.message === WRITE_UNCERTAIN
    )
  })
})
