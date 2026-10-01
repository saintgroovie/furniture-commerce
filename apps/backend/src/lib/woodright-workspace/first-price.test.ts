import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createFirstRubPrice, type SqlRaw } from "./first-price.ts"

function scripted(rowsFor: (sql: string) => Array<Record<string, unknown>>) {
  const calls: string[] = []
  const sql = {
    async transaction<T>(fn: (trx: SqlRaw) => Promise<T>) {
      return fn({
        async raw(statement: string) {
          calls.push(statement)
          return { rows: rowsFor(statement) }
        },
      })
    },
  }
  return { sql, calls }
}

describe("createFirstRubPrice", () => {
  it("inserts one base RUB row and does not update other prices", async () => {
    const { sql, calls } = scripted((statement) => {
      if (statement.includes("for update")) return [{ price_set_id: "pset_1" }]
      if (statement.includes("select id")) return []
      return [{ id: "price_new" }]
    })
    const result = await createFirstRubPrice(sql, {
      variantId: "variant_1",
      amount: 76000,
      priceId: "price_new",
    })
    assert.deepEqual(result, { ok: true, id: "price_new" })
    assert.equal(calls.some((sql) => sql.includes("update price")), false)
    assert.match(calls.find((sql) => sql.includes("select id")) ?? "", /price_list_id is null/)
    assert.match(calls.at(-1) ?? "", /'rub'/)
  })

  it("returns conflict when a base RUB row already exists", async () => {
    const { sql, calls } = scripted((statement) => {
      if (statement.includes("for update")) return [{ price_set_id: "pset_1" }]
      if (statement.includes("select id")) return [{ id: "price_old" }]
      return []
    })
    const result = await createFirstRubPrice(sql, {
      variantId: "variant_1",
      amount: 76000,
      priceId: "price_new",
    })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.code, "base_exists")
    assert.equal(calls.some((sql) => sql.includes("insert into price")), false)
  })
})
