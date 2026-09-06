/**
 * Fidelity tests for Medusa order existence gate + ensureOrderProcess write ban.
 *
 *   cd apps/backend && yarn dlx tsx src/lib/woodright-order-process/ensure-process.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { assertMedusaOrderExists } from "./assert-medusa-order-exists"
import { ensureOrderProcess, type OrderProcessServiceLike } from "./ensure-process"

function makeService(state: {
  processes: Array<Record<string, unknown>>
  events: Array<Record<string, unknown>>
  createCalls: number
  eventCalls: number
}): OrderProcessServiceLike {
  return {
    listWoodrightOrderProcesses: async (filters?: Record<string, unknown>) => {
      const orderId = filters?.order_id
      return state.processes
        .filter((p) => !orderId || p.order_id === orderId)
        .map((p) => ({ ...p })) as never
    },
    createWoodrightOrderProcesses: async (data: Record<string, unknown>) => {
      state.createCalls += 1
      const row = {
        id: `proc_${state.createCalls}`,
        version: 1,
        previous_stage: null,
        ...data,
      }
      state.processes.push(row)
      return row as never
    },
    updateWoodrightOrderProcesses: async () => {
      throw new Error("unexpected update")
    },
    listWoodrightOrderProcessEvents: async () => state.events as never,
    createWoodrightOrderProcessEvents: async (data: Record<string, unknown>) => {
      state.eventCalls += 1
      state.events.push({ ...data })
      return data as never
    },
    createWoodrightNotificationDeliveries: async () => {
      throw new Error("unexpected notification")
    },
    updateWoodrightNotificationDeliveries: async () => undefined,
    listWoodrightOrderAccesses: async () => [],
    createWoodrightOrderAccesses: async () => ({}),
    updateWoodrightOrderAccesses: async () => undefined,
    deleteWoodrightOrderAccesses: async () => undefined,
  }
}

async function main() {
  {
    const ok = await assertMedusaOrderExists(
      {
        retrieveOrder: async (id) => ({ id }),
      },
      "order_real_1"
    )
    assert.equal(ok.ok, true)
    if (ok.ok) assert.equal(ok.order_id, "order_real_1")
  }

  {
    const missing = await assertMedusaOrderExists(
      {
        retrieveOrder: async () => {
          const err = new Error("Order not found")
          ;(err as { type?: string }).type = "not_found"
          throw err
        },
      },
      "order_DOES_NOT_EXIST"
    )
    assert.equal(missing.ok, false)
    if (!missing.ok) assert.equal(missing.kind, "not_found")
  }

  {
    const empty = await assertMedusaOrderExists(
      { retrieveOrder: async () => ({ id: "x" }) },
      "   "
    )
    assert.equal(empty.ok, false)
    if (!empty.ok) assert.equal(empty.kind, "not_found")
  }

  {
    const fail = await assertMedusaOrderExists(
      {
        retrieveOrder: async () => {
          throw new Error("connection refused")
        },
      },
      "order_real_1"
    )
    assert.equal(fail.ok, false)
    if (!fail.ok) assert.equal(fail.kind, "query_failed")
  }

  {
    const mismatch = await assertMedusaOrderExists(
      {
        retrieveOrder: async () => ({ id: "order_other" }),
      },
      "order_real_1"
    )
    assert.equal(mismatch.ok, false)
    if (!mismatch.ok) assert.equal(mismatch.kind, "not_found")
  }

  {
    const state = {
      processes: [] as Array<Record<string, unknown>>,
      events: [] as Array<Record<string, unknown>>,
      createCalls: 0,
      eventCalls: 0,
    }
    const service = makeService(state)
    const result = await ensureOrderProcess(
      service,
      {
        retrieveOrder: async () => {
          const err = new Error(
            "Order with id: order_DOES_NOT_EXIST was not found"
          )
          ;(err as { type?: string }).type = "not_found"
          throw err
        },
      },
      "order_DOES_NOT_EXIST",
      { source: "admin_ensure", actor_type: "admin" }
    )
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.kind, "not_found")
    assert.equal(state.createCalls, 0)
    assert.equal(state.eventCalls, 0)
    assert.equal(state.processes.length, 0)
    assert.equal(state.events.length, 0)
  }

  {
    const state = {
      processes: [] as Array<Record<string, unknown>>,
      events: [] as Array<Record<string, unknown>>,
      createCalls: 0,
      eventCalls: 0,
    }
    const service = makeService(state)
    const result = await ensureOrderProcess(
      service,
      {
        retrieveOrder: async () => {
          throw new Error("timeout")
        },
      },
      "order_real_1"
    )
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.kind, "query_failed")
    assert.equal(state.createCalls, 0)
    assert.equal(state.eventCalls, 0)
  }

  {
    const state = {
      processes: [] as Array<Record<string, unknown>>,
      events: [] as Array<Record<string, unknown>>,
      createCalls: 0,
      eventCalls: 0,
    }
    const service = makeService(state)
    const orderModule = {
      retrieveOrder: async (id: string) => ({ id }),
    }
    const first = await ensureOrderProcess(
      service,
      orderModule,
      "order_real_1",
      {
        source: "admin_ensure",
        actor_type: "admin",
      }
    )
    assert.equal(first.ok, true)
    if (first.ok) {
      assert.equal(first.created, true)
      assert.equal(first.process.order_id, "order_real_1")
      assert.equal(first.process.current_stage, "new")
    }
    assert.equal(state.createCalls, 1)
    assert.equal(state.eventCalls, 1)

    const second = await ensureOrderProcess(service, orderModule, "order_real_1")
    assert.equal(second.ok, true)
    if (second.ok) assert.equal(second.created, false)
    assert.equal(state.createCalls, 1)
    assert.equal(state.eventCalls, 1)
  }

  console.log("ensure-process.fidelity.test.ts: PASS")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
