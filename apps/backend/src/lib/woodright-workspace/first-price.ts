/**
 * First base RUB price for one variant.
 * One transaction locks the variant price-set link, then inserts only if no
 * base RUB row exists. Other currencies, price lists, and variants are not in
 * the statement. A partial prices[] workflow is not used: it deletes omitted
 * base prices.
 */

export type SqlRaw = {
  raw: (sql: string, bindings?: unknown[]) => Promise<unknown>
}

export type SqlClient = SqlRaw & {
  transaction?: <T>(fn: (trx: SqlRaw) => Promise<T>) => Promise<T>
}

export type FirstPriceResult =
  | { ok: true; id: string }
  | { ok: false; code: "no_price_set" | "base_exists" | "not_atomic"; message: string }

function rowsOf(result: unknown): Array<Record<string, unknown>> {
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows?: unknown }).rows
    if (Array.isArray(rows)) return rows as Array<Record<string, unknown>>
  }
  if (Array.isArray(result) && Array.isArray(result[0])) {
    return result[0] as Array<Record<string, unknown>>
  }
  return []
}

export async function createFirstRubPrice(
  sql: SqlClient,
  input: { variantId: string; amount: number; priceId: string }
): Promise<FirstPriceResult> {
  if (!sql.transaction) {
    return {
      ok: false,
      code: "not_atomic",
      message: "База не подтвердила запись цены",
    }
  }
  return sql.transaction(async (trx) => {
    const locked = rowsOf(
      await trx.raw(
        `select price_set_id
           from product_variant_price_set
          where variant_id = ?
            and deleted_at is null
          for update`,
        [input.variantId]
      )
    )
    const priceSetId = locked[0]?.price_set_id
    if (typeof priceSetId !== "string" || !priceSetId) {
      return {
        ok: false,
        code: "no_price_set",
        message: "У варианта нет набора цен",
      }
    }
    const existing = rowsOf(
      await trx.raw(
        `select id
           from price
          where price_set_id = ?
            and currency_code = 'rub'
            and price_list_id is null
            and deleted_at is null
          limit 1`,
        [priceSetId]
      )
    )
    if (existing.length > 0) {
      return {
        ok: false,
        code: "base_exists",
        message: "Обычная цена уже есть. Обновите страницу",
      }
    }
    const inserted = rowsOf(
      await trx.raw(
        `insert into price (
           id, price_set_id, currency_code, amount, raw_amount, rules_count, created_at, updated_at
         ) values (
           ?, ?, 'rub', ?, cast(? as jsonb), 0, now(), now()
         )
         returning id`,
        [
          input.priceId,
          priceSetId,
          input.amount,
          JSON.stringify({ value: String(input.amount), precision: 20 }),
        ]
      )
    )
    const id = inserted[0]?.id
    if (typeof id !== "string" || !id) {
      return {
        ok: false,
        code: "base_exists",
        message: "Обычная цена уже есть. Обновите страницу",
      }
    }
    return { ok: true, id }
  })
}
