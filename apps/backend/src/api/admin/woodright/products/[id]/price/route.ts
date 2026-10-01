import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { assessPriceSave } from "../../../../../../lib/woodright-admin/price-sanity"
import { appendDeskAudit } from "../../../../../../lib/woodright-workspace/desk-audit"
import { createFirstRubPrice, type SqlClient } from "../../../../../../lib/woodright-workspace/first-price"
import { loadSellerProductById, type QueryGraph } from "../../../../../../lib/woodright-admin/seller-product"
import { requireDeskWrite } from "../../../../../../lib/woodright-workspace/require-desk-write"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const gate = await requireDeskWrite(req, res, "catalog.price")
  if (!gate) return
  const id = req.params.id as string
  const body = (req.body ?? {}) as {
    variant_id?: unknown
    amount?: unknown
    expected_amount?: unknown
    confirm?: unknown
    create?: unknown
    currency?: unknown
  }
  if (typeof body.variant_id !== "string" || !body.variant_id) {
    res.status(400).json({ message: "Выберите вариант" })
    return
  }
  if (typeof body.amount !== "number" || !Number.isSafeInteger(body.amount)) {
    res.status(400).json({ message: "Укажите цену целым числом рублей" })
    return
  }
  if (body.currency != null && body.currency !== "rub") {
    res.status(400).json({ message: "Цена здесь задаётся только в рублях" })
    return
  }
  const creating = body.create === true
  if (!creating && typeof body.expected_amount !== "number") {
    res.status(400).json({ message: "Обновите страницу и повторите" })
    return
  }
  const query = req.scope.resolve("query") as QueryGraph
  const before = await loadSellerProductById(query, id)
  const variant = before?.variants.find((item) => item.id === body.variant_id)
  if (!before || !variant) {
    res.status(404).json({ message: "Вариант не найден" })
    return
  }
  if (before.classification === "BESPOKE") {
    res.status(400).json({ message: "У товара по проекту нет цены в корзине" })
    return
  }
  const current = variant.rub_price
  const sql = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as SqlClient
  if (!current?.id) {
    if (!creating) {
      res.status(409).json({
        code: "missing_base_price",
        message: "Цена не задана",
      })
      return
    }
    const assessment = assessPriceSave(body.amount, null)
    if (assessment.decision === "reject") {
      res.status(400).json({ message: assessment.message })
      return
    }
    if (assessment.decision === "confirm" && body.confirm !== true) {
      res.status(409).json({ code: "needs_confirm", message: assessment.message })
      return
    }
    const created = await createFirstRubPrice(sql, {
      variantId: variant.id,
      amount: body.amount,
      priceId: generateEntityId(undefined, "price"),
    })
    if (!created.ok) {
      const status = created.code === "not_atomic" ? 500 : 409
      res.status(status).json({ code: created.code, message: created.message })
      return
    }
    const product = await loadSellerProductById(query, id)
    const saved = product?.variants.find((item) => item.id === variant.id)?.rub_price ?? null
    const audit = await appendDeskAudit(req, {
      actorId: gate.actorId,
      actorEmail: gate.email,
      entityType: "price",
      entityId: created.id,
      action: "price.create",
      before: { variant_id: variant.id, amount: null, currency_code: "rub" },
      after: { variant_id: variant.id, amount: saved?.amount ?? null, currency_code: "rub" },
    })
    res.status(201).json({
      product,
      price: saved,
      amount: saved?.amount ?? null,
      created: true,
      audit,
    })
    return
  }
  if (creating) {
    res.status(409).json({
      code: "base_exists",
      message: "Обычная цена уже есть. Обновите страницу",
    })
    return
  }
  if (current.amount !== body.expected_amount) {
    res.status(409).json({
      code: "stale_price",
      message: "Цену уже изменили. Обновите страницу",
      current_amount: current.amount,
    })
    return
  }
  const assessment = assessPriceSave(body.amount, current.amount)
  if (assessment.decision === "reject") {
    res.status(400).json({ message: assessment.message })
    return
  }
  if (assessment.decision === "confirm" && body.confirm !== true) {
    res.status(409).json({ code: "needs_confirm", message: assessment.message })
    return
  }
  // One-row CAS. A partial prices[] through updateProductVariantsWorkflow deletes other base prices.
  const casResult = await sql.raw(
    `update price
        set amount = ?,
            raw_amount = cast(? as jsonb),
            updated_at = now()
      where id = ?
        and amount = ?
        and currency_code = 'rub'
        and price_list_id is null
        and deleted_at is null
      returning id`,
    [
      body.amount,
      JSON.stringify({ value: String(body.amount), precision: 20 }),
      current.id,
      body.expected_amount,
    ]
  )
  const casRows =
    casResult && typeof casResult === "object" && "rows" in casResult
      ? (casResult as { rows?: unknown[] }).rows
      : []
  if (!casRows?.length) {
    res.status(409).json({
      code: "stale_price",
      message: "Цену уже изменили. Обновите страницу",
    })
    return
  }
  const product = await loadSellerProductById(query, id)
  const saved = product?.variants.find((item) => item.id === variant.id)?.rub_price ?? null
  const audit = await appendDeskAudit(req, {
    actorId: gate.actorId,
    actorEmail: gate.email,
    entityType: "price",
    entityId: current.id,
    action: "price.update",
    before: { variant_id: variant.id, amount: current.amount, currency_code: "rub" },
    after: { variant_id: variant.id, amount: saved?.amount ?? null, currency_code: "rub" },
  })
  res.json({
    product,
    price: saved,
    previous_amount: current.amount,
    amount: saved?.amount ?? null,
    audit,
  })
}
