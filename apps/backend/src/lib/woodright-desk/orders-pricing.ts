/** Orders use exactly one unconditional RUB base price. Never treat a price-list,
 * quantity band or context rule as an approved custom quote for ordinary staff. */
export function orderBasePrice(prices: any[]) {
  const eligible = prices.filter(
    (p) =>
      p &&
      p.currency_code === "rub" &&
      Object.hasOwn(p, "price_list_id") &&
      p.price_list_id === null &&
      Object.hasOwn(p, "min_quantity") &&
      p.min_quantity === null &&
      Object.hasOwn(p, "max_quantity") &&
      p.max_quantity === null &&
      (p.rules_count === 0 || p.rules_count === null) &&
      Array.isArray(p.price_rules) &&
      p.price_rules.length === 0 &&
      typeof p.amount === "number" &&
      Number.isFinite(p.amount) &&
      p.amount > 0 &&
      Number.isSafeInteger(Math.round(p.amount * 100)) &&
      Math.abs(p.amount * 100 - Math.round(p.amount * 100)) < 0.0001,
  );
  if (eligible.length !== 1) return null;
  const p = eligible[0];
  return { id: p.id, amount: p.amount, currency_code: "rub" };
}
