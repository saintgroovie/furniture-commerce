import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { activeNavId, LEGACY_REDIRECTS, NAV } from "./nav.ts"
import {
  orderAxes,
  primaryStageAction,
  productionColumnFor,
  stageButtonLabel,
} from "./order-presentation.ts"
import {
  primaryProductAction,
  productProblem,
  readinessChecklist,
  readinessSummary,
} from "./product-presentation.ts"
import { discountPercent, parsePriceConflict, priceEditorState } from "./price-presentation.ts"
import { personMatchView } from "./person-presentation.ts"
import { ATTENTION_LINKS, groupInbox } from "./today-presentation.ts"

describe("navigation", () => {
  it("ships the approved five sections and keeps Входящие out until mail exists", () => {
    assert.deepEqual(
      NAV.map((item) => item.label),
      ["Сегодня", "Клиенты", "Заказы", "Товары", "Витрина"]
    )
    assert.equal(NAV.some((item) => /входящие|inbox|crm|medusa/i.test(item.label)), false)
  })
  it("lights the right section for legacy and detail routes", () => {
    assert.equal(activeNavId("/people/lead_1"), "clients")
    assert.equal(activeNavId("/requests/req_1"), "clients")
    assert.equal(activeNavId("/catalog/prod_1"), "products")
    assert.equal(activeNavId("/rooms"), "products")
    assert.equal(activeNavId("/orders/production"), "orders")
    assert.equal(activeNavId("/promo"), "storefront")
    assert.equal(activeNavId("/login"), null)
  })
  it("keeps the 390 bottom bar to at most four sections plus search", () => {
    const mobile = NAV.filter((item) => item.mobile)
    assert.ok(mobile.length <= 4)
    assert.deepEqual(mobile.map((item) => item.id), ["today", "clients", "orders", "products"])
  })
  it("redirects every replaced legacy route into the new IA", () => {
    for (const [from, to] of Object.entries(LEGACY_REDIRECTS)) {
      assert.notEqual(from, to)
      assert.ok(to.startsWith("/"))
      assert.ok(["/clients", "/catalog", "/promo"].some((prefix) => to.startsWith(prefix)), `${from} → ${to}`)
    }
  })
})

describe("order axes", () => {
  it("keeps money, delivery and manufacturing separate", () => {
    const axes = orderAxes({
      payment_status: "captured",
      fulfillment_status: "not_fulfilled",
      manufacturing_stage: "awaiting_customer_approval",
    })
    assert.equal(axes.money.label, "Оплачен")
    assert.equal(axes.money.tone, "positive")
    assert.equal(axes.delivery.label, "Не начата")
    assert.equal(axes.manufacturing.label, "Ждём клиента")
    assert.equal(axes.manufacturing.tone, "waiting")
    assert.notEqual(axes.money.tone, axes.manufacturing.tone)
  })
  it("derives the primary action only from backend-allowed transitions", () => {
    assert.equal(primaryStageAction([]), null)
    assert.equal(primaryStageAction(null), null)
    const first = primaryStageAction([
      { stage: "confirmed", label: "Подтверждён" },
      { stage: "on_hold", label: "Приостановлен" },
    ])
    assert.deepEqual(first, { stage: "confirmed", label: "Подтверждён" })
    assert.equal(stageButtonLabel(first!), "Перевести в «Подтверждён»")
  })
  it("maps every stage to one production column without a second state", () => {
    assert.equal(productionColumnFor(null), "new")
    assert.equal(productionColumnFor("in_production"), "production")
    assert.equal(productionColumnFor("ready_for_delivery"), "ready")
    assert.equal(productionColumnFor("canceled"), null)
  })
})

const baseProduct = {
  title: "Комод Скейл",
  status: "draft",
  classification: "STANDARD",
  readiness: { published: false, visible: false, has_price: false, has_media: false },
  publish: {
    ready: false,
    blockers: [
      { code: "missing_price", message: "Добавьте цену" },
      { code: "missing_media", message: "Добавьте фотографию" },
    ],
    warnings: [],
  },
}

describe("product readiness and primary action", () => {
  it("turns backend blockers into a checklist instead of ready=false", () => {
    const items = readinessChecklist(baseProduct)
    const byCode = Object.fromEntries(items.map((item) => [item.code, item.ok]))
    assert.equal(byCode.price, false)
    assert.equal(byCode.media, false)
    assert.equal(byCode.title, true)
    assert.deepEqual(readinessSummary(items), { done: 4, total: 6 })
  })
  it("walks price → image → publish and never offers publish twice", () => {
    assert.equal(primaryProductAction(baseProduct).kind, "price")
    const withPrice = { ...baseProduct, readiness: { ...baseProduct.readiness, has_price: true } }
    assert.equal(primaryProductAction(withPrice).kind, "media")
    const ready = {
      ...baseProduct,
      readiness: { ...baseProduct.readiness, has_price: true, has_media: true },
      publish: { ready: true, blockers: [], warnings: [] },
    }
    assert.equal(primaryProductAction(ready).kind, "publish")
    const published = { ...ready, status: "published", readiness: { ...ready.readiness, published: true, visible: true } }
    assert.equal(primaryProductAction(published).kind, "published")
    assert.notEqual(primaryProductAction(published).label, "Опубликовать")
  })
  it("never demands a cart price from a BESPOKE product", () => {
    const bespoke = {
      ...baseProduct,
      classification: "BESPOKE",
      publish: { ready: false, blockers: [{ code: "missing_media", message: "Добавьте фотографию" }], warnings: [] },
    }
    assert.equal(primaryProductAction(bespoke).kind, "media")
    assert.equal(productProblem(bespoke)?.label, "Нет фото")
    const price = readinessChecklist(bespoke).find((item) => item.code === "price")
    assert.equal(price?.ok, true)
    assert.match(price?.note ?? "", /по проекту/)
  })
  it("treats kids navigation as a flag, not a classification", () => {
    const kids = { ...baseProduct, kids_nav: true }
    assert.equal(readinessChecklist(kids).some((item) => /детск/i.test(item.label)), false)
  })
})

describe("price editor", () => {
  it("shows no price instead of zero and keeps promo beside base", () => {
    assert.deepEqual(priceEditorState({ classification: "STANDARD", base: null, promo: null }), { kind: "missing" })
    assert.deepEqual(priceEditorState({ classification: "STANDARD", base: 0, promo: null }), { kind: "missing" })
    const set = priceEditorState({ classification: "STANDARD", base: 84600, promo: 76140 })
    assert.equal(set.kind, "set")
    if (set.kind === "set") {
      assert.equal(set.base, 84600)
      assert.equal(set.promo, 76140)
      assert.equal(set.promoValid, true)
      assert.equal(set.percent, 10)
    }
  })
  it("keeps a stored promo that no longer undercuts the base so it can be removed", () => {
    const stale = priceEditorState({ classification: "STANDARD", base: 70000, promo: 80000 })
    assert.equal(stale.kind, "set")
    if (stale.kind === "set") {
      assert.equal(stale.promo, 80000)
      assert.equal(stale.promoValid, false)
      assert.equal(stale.percent, null)
    }
  })
  it("computes the percent only for display and ignores a promo above base", () => {
    assert.equal(discountPercent(84600, 76140), 10)
    assert.equal(discountPercent(84600, 90000), null)
    assert.equal(discountPercent(null, 100), null)
  })
  it("keeps the price conflict visible with both amounts", () => {
    const conflict = parsePriceConflict({ conflict: "price", server_amount: "89900", your_amount: "84600", variant_id: "var_1" })
    assert.deepEqual(conflict, { variant_id: "var_1", server_amount: 89900, your_amount: 84600 })
    assert.equal(parsePriceConflict({ saved: "1" }), null)
  })
})

describe("person match", () => {
  it("never auto-links an ambiguous match", () => {
    const view = personMatchView({
      linksAvailable: true,
      linkedCustomerId: null,
      suggestion: { status: "needs_review", customer_ids: ["c1", "c2"], candidates: [{ id: "c1", email: "a@x", phone: null }, { id: "c2", email: "b@x", phone: null }] },
    })
    assert.equal(view.kind, "ambiguous")
    if (view.kind === "ambiguous") assert.equal(view.candidates.length, 2)
  })
  it("offers a single candidate only as an explicit action and withholds incomplete lookups", () => {
    const single = personMatchView({ linksAvailable: true, linkedCustomerId: null, suggestion: { status: "candidate", customer_ids: ["c1"] } })
    assert.equal(single.kind, "candidate")
    const incomplete = personMatchView({ linksAvailable: true, linkedCustomerId: null, suggestion: { status: "candidate", customer_ids: ["c1"], lookup_incomplete: true } })
    assert.equal(incomplete.kind, "incomplete")
    const offline = personMatchView({ linksAvailable: false, linkedCustomerId: null, suggestion: { status: "candidate", customer_ids: ["c1"] } })
    assert.equal(offline.kind, "unavailable")
  })
})

describe("today queue", () => {
  it("groups backend inbox items without changing their hrefs", () => {
    const groups = groupInbox([
      { id: "req:1", kind: "request", title: "Анна", hint: "Нужен стол", action: "Открыть заявку", overdue: true, href: "/requests/1" },
      { id: "cat:1", kind: "catalog", title: "Комод", hint: "Нет цены", action: "Поставить цену", overdue: true, href: "/catalog/1#price" },
      { id: "ord:1", kind: "production", title: "Заказ 1042", hint: "Ждём клиента", action: "Открыть этап", overdue: false, href: "/orders/1" },
    ])
    assert.deepEqual(groups.map((group) => group.title), ["Требует ответа", "Заказы", "Каталог"])
    const withFollowUp = groupInbox([
      { id: "fu:1", kind: "follow_up", title: "Анна", hint: "Позвонить", action: "Открыть", overdue: false, href: "/people/1" },
      { id: "cat:1", kind: "catalog", title: "Комод", hint: "Нет цены", action: "Поставить цену", overdue: true, href: "/catalog/1#price" },
    ])
    assert.deepEqual(withFollowUp.map((group) => group.title), ["Напоминания", "Каталог"])
    assert.equal(groups[2]!.items[0]!.href, "/catalog/1#price")
  })
  it("links every counter to a real filtered list", () => {
    for (const link of ATTENTION_LINKS) assert.ok(link.href.includes("?"), link.href)
  })
})
