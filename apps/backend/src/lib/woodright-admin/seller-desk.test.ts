import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  BESPOKE_STATUS_LABEL,
  buildDeskInbox,
  buildDeskPeople,
  hoursSince,
  REQUEST_SLA_HOURS,
} from "./seller-desk.ts"

describe("hoursSince", () => {
  it("returns elapsed hours", () => {
    const now = new Date("2026-09-16T12:00:00.000Z")
    assert.equal(hoursSince("2026-09-16T10:00:00.000Z", now), 2)
  })
  it("returns null for bad input", () => {
    assert.equal(hoursSince(null, new Date()), null)
    assert.equal(hoursSince("nope", new Date()), null)
  })
})

describe("buildDeskInbox", () => {
  const now = new Date("2026-09-16T12:00:00.000Z")

  it("marks new requests older than SLA as overdue", () => {
    const items = buildDeskInbox({
      now,
      products: [],
      processes: [],
      requests: [
        {
          id: "r1",
          lead_id: "l1",
          lead_name: "Марина К.",
          status: "new",
          comment: "Панель 4,2 м",
          created_at: "2026-09-16T09:00:00.000Z",
        },
      ],
    })
    assert.equal(items.length, 1)
    assert.equal(items[0].overdue, true)
    assert.equal(items[0].kind, "request")
    assert.match(items[0].href, /\/woodright\/requests/)
    assert.ok(REQUEST_SLA_HOURS === 2)
  })

  it("does not put completed requests in inbox", () => {
    const items = buildDeskInbox({
      now,
      products: [],
      processes: [],
      requests: [
        {
          id: "r2",
          lead_id: "l2",
          lead_name: "Анна",
          status: "completed",
          comment: null,
          created_at: "2026-09-01T00:00:00.000Z",
        },
      ],
    })
    assert.equal(items.length, 0)
  })

  it("lists catalog blockers and waiting production", () => {
    const items = buildDeskInbox({
      now,
      requests: [],
      products: [
        {
          id: "p1",
          title: "Полка в простенок",
          sku: "sh-03-2",
          missing_media: true,
          missing_price: false,
          published_invisible: false,
        },
        {
          id: "p2",
          title: "Скамья",
          sku: "bn-12-1",
          missing_media: false,
          missing_price: true,
          published_invisible: false,
        },
      ],
      processes: [
        {
          id: "op1",
          order_id: "ord_1",
          current_stage: "awaiting_customer_approval",
        },
      ],
    })
    assert.equal(items.some((i) => i.id === "cat-media:p1" && i.overdue), true)
    assert.equal(items.some((i) => i.id === "cat-price:p2" && !i.overdue), true)
    assert.equal(items.some((i) => i.kind === "production" && i.overdue), true)
  })
})

describe("buildDeskPeople", () => {
  it("joins requests onto leads", () => {
    const people = buildDeskPeople(
      [{ id: "l1", name: "Марина К.", source: "bespoke" }],
      [
        {
          id: "r1",
          lead_id: "l1",
          lead_name: "Марина К.",
          status: "new",
          comment: null,
          created_at: null,
        },
      ]
    )
    assert.equal(people.length, 1)
    assert.equal(people[0].request_count, 1)
    assert.equal(people[0].request_ids[0], "r1")
  })
})

describe("labels", () => {
  it("uses quote CTA language, not cart", () => {
    assert.equal(BESPOKE_STATUS_LABEL.quote_sent, "Расчёт отправлен")
    assert.equal(BESPOKE_STATUS_LABEL.new, "Новая")
  })
})
