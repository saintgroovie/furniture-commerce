export function changeOrderLine(line, change) {
  if (
    (Object.hasOwn(change, "productId") &&
      change.productId !== line.productId) ||
    (Object.hasOwn(change, "variantId") && change.variantId !== line.variantId)
  )
    return {
      ...line,
      ...change,
      ...(Object.hasOwn(change, "productId") ? { variantId: "" } : {}),
      price: "",
      quoteConfirmed: false,
    };
  const quoteChanged = ["quantity", "price"].some(
    (k) => Object.hasOwn(change, k) && change[k] !== line[k],
  );
  return {
    ...line,
    ...change,
    ...(quoteChanged ? { quoteConfirmed: false } : {}),
  };
}
export const invalidateOrderQuotes = (lines) =>
  lines.map((l) => ({ ...l, quoteConfirmed: false }));
export const orderBoardStages = (stages, orders) => [
  ...new Set([...stages, ...orders.map((o) => o.stage).filter(Boolean)]),
];
