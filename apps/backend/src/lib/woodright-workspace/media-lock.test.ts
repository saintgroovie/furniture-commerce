import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { SqlClient, SqlRaw } from "./first-price"
import { withMediaWriteLock } from "./media-lock"

describe("withMediaWriteLock", () => {
  it("holds the lock around the write and refuses a connection that cannot lock", async () => {
    const steps: string[] = []
    const sql: SqlClient = {
      raw: async () => {
        throw new Error("raw outside the transaction")
      },
      transaction: async <T>(fn: (trx: SqlRaw) => Promise<T>) => {
        steps.push("begin")
        const value = await fn({
          raw: async (query: string) => {
            steps.push(query.includes("pg_advisory_xact_lock") ? "lock" : query)
            return { rows: [] }
          },
        })
        steps.push("end")
        return value
      },
    }
    const locked = await withMediaWriteLock(sql, "prod_1", async () => {
      steps.push("write")
      return "saved"
    })
    assert.deepEqual(locked, { ok: true, value: "saved" })
    assert.deepEqual(steps, ["begin", "lock", "write", "end"])
    const missing = await withMediaWriteLock({ raw: async () => ({ rows: [] }) }, "prod_1", async () => "saved")
    assert.deepEqual(missing, { ok: false })
  })
})
