import type { SqlClient, SqlRaw } from "./first-price"

/**
 * One product media write at a time. The lock is held until the caller
 * finishes the read-modify-write, including the product update.
 */
export async function withMediaWriteLock<T>(
  sql: SqlClient,
  productId: string,
  fn: () => Promise<T>
): Promise<{ ok: true; value: T } | { ok: false }> {
  if (!sql.transaction) return { ok: false }
  const value = await sql.transaction(async (trx: SqlRaw) => {
    await trx.raw("select pg_advisory_xact_lock(hashtext(?)::bigint)", [productId])
    return fn()
  })
  return { ok: true, value }
}
