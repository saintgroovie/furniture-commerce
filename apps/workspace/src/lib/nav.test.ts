import assert from "node:assert/strict"
import { test } from "node:test"
import { activeNavId, LEGACY_REDIRECTS, NAV } from "./nav.ts"

test("working navigation has exactly five sections and no Inbox", () => {
  assert.deepEqual(
    NAV.map((item) => item.label),
    ["Сегодня", "Клиенты", "Заказы", "Товары", "Витрина"]
  )
  assert.ok(!NAV.some((item) => /входящ/i.test(item.label)))
  assert.ok(!NAV.some((item) => item.href === "/inbox"))
})

test("mobile navigation keeps four sections, Витрина stays reachable by link", () => {
  assert.deepEqual(
    NAV.filter((item) => item.mobile).map((item) => item.id),
    ["today", "clients", "orders", "products"]
  )
})

test("deep links resolve to their section", () => {
  assert.equal(activeNavId("/people/lead_1"), "clients")
  assert.equal(activeNavId("/requests/req_1"), "clients")
  assert.equal(activeNavId("/companies/comp_1"), "clients")
  assert.equal(activeNavId("/orders/production"), "orders")
  assert.equal(activeNavId("/catalog/prod_1"), "products")
  assert.equal(activeNavId("/rooms"), "products")
  assert.equal(activeNavId("/promo"), "storefront")
  assert.equal(activeNavId("/today"), "today")
})

test("legacy routes redirect into the new sections", () => {
  assert.equal(LEGACY_REDIRECTS["/people"], "/clients?mode=people")
  assert.equal(LEGACY_REDIRECTS["/requests"], "/clients?mode=requests")
  assert.equal(LEGACY_REDIRECTS["/media"], "/catalog?filter=missing_media")
  assert.equal(LEGACY_REDIRECTS["/site"], "/promo")
})
