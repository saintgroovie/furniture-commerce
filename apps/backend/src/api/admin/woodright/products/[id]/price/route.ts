import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { assessPriceSave } from "../../../../../../lib/woodright-admin/price-sanity"
import { appendDeskAudit } from "../../../../../../lib/woodright-workspace/desk-audit"
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
  }
  if (typeof body.variant_id !== "string" || !body.variant_id) {
    res.status(400).json({ message: "Выберите вариант" })
    return
  }
  if (typeof body.amount !== "number" || !Number.isSafeInteger(body.amount)) {
    res.status(400).json({ message: "Укажите цену целым числом рублей" })
    return
  }
  if (typeof body.expected_amount !== "number") {
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
  if (!current?.id) {
    res.status(409).json({ message: "У варианта ещё нет рублёвой цены. Её задают в Medusa" })
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
  const sql = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as {
    raw: (query: string, bindings?: unknown[]) => Promise<{ rows?: Array<Record<string, unknown>> }>
  }
  const cas = await sql.raw(
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
  if (!cas.rows?.length) {
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
