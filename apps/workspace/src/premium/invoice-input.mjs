import { toMinor } from "./model.mjs";
export const linkedInvoices = (data, id) =>
  data.invoices.filter(
    (i) =>
      i.sourceId === id ||
      (i.sourceType === "request" &&
        data.requests.some((r) => r.id === i.sourceId && r.personId === id)),
  );
export function invoiceInputLines(lines) {
  let total = 0n;
  const prepared = lines.map((l) => {
    const quantity = String(l.quantity).trim().replace(",", ".");
    if (!l.name.trim() || !/^\d{1,9}(\.\d{1,3})?$/.test(quantity))
      throw Error("Заполните название и количество каждой позиции");
    const [whole, decimal = ""] = quantity.split(".");
    const q = BigInt(whole) * 1000n + BigInt(decimal.padEnd(3, "0"));
    if (q <= 0n) throw Error("Количество должно быть больше нуля");
    const unitPriceMinor = toMinor(l.price),
      amount = (BigInt(unitPriceMinor) * q + 500n) / 1000n;
    total += amount;
    if (total > 9000000000000n) throw Error("Сумма счёта слишком велика");
    return {
      name: l.name.trim(),
      quantity,
      unitPriceMinor,
      ...(l.variantId ? { variantId: l.variantId } : {}),
    };
  });
  if (!prepared.length) throw Error("Добавьте позиции счёта");
  return { lines: prepared, totalMinor: Number(total) };
}
