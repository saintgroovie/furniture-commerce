import { createHash } from "node:crypto";
// This is the Woodright exchange contract, NOT a claim about a stock 1C endpoint.
// The exact 1C configuration, mapping and transport must be confirmed first.
export function buildInvoiceIntent(input) {
  if (
    !["order", "request"].includes(input?.source?.type) ||
    !/^[\w-]{1,160}$/.test(input.source.id)
  )
    throw new Error("Укажите существующий заказ или обращение");
  if (!/^[\w-]{16,100}$/.test(input.operationId || ""))
    throw new Error("Не указан постоянный идентификатор операции");
  if (
    !input.payer?.name?.trim() ||
    !["person", "company", "entrepreneur"].includes(input.payer.type)
  )
    throw new Error("Укажите плательщика");
  if (
    input.payer.type !== "person" &&
    !/^\d{10}(\d{2})?$/.test(input.payer.inn || "")
  )
    throw new Error("Укажите ИНН плательщика");
  if (
    !Array.isArray(input.lines) ||
    !input.lines.length ||
    input.lines.length > 200
  )
    throw new Error("Добавьте позиции счёта");
  const lines = input.lines.map((l) => {
    if (
      !l.name?.trim() ||
      !/^\d+(\.\d{1,3})?$/.test(String(l.quantity)) ||
      Number(l.quantity) <= 0 ||
      !Number.isSafeInteger(l.unitPriceMinor) ||
      l.unitPriceMinor < 0
    )
      throw new Error("Проверьте наименование, количество и цену");
    if (!l.accountingItemId)
      throw new Error("Позиция не сопоставлена номенклатуре 1С");
    if (typeof l.accountingVatCode !== "string" || !l.accountingVatCode.trim())
      throw new Error("Налоговый режим позиции не подтверждён в 1С");
    return {
      name: l.name.trim(),
      quantity: String(l.quantity),
      unitPriceMinor: l.unitPriceMinor,
      accountingItemId: l.accountingItemId,
      variantId: l.variantId || null,
      accountingVatCode: l.accountingVatCode,
    };
  });
  const document = {
    schema: "woodright.accounting.invoice-intent.v1",
    externalId: `woodright:${input.operationId}`,
    source: { type: input.source.type, id: input.source.id },
    seller: { inn: "3702111074" },
    payer: {
      type: input.payer.type,
      name: input.payer.name.trim(),
      inn: input.payer.inn || null,
    },
    currency: "RUB",
    lines,
  };
  // Number, bank requisites, issue date and paid status are deliberately absent:
  // only the confirmed accounting system may return those financial facts.
  return {
    ...document,
    fingerprint: createHash("sha256")
      .update(JSON.stringify(document))
      .digest("hex"),
  };
}
export function validateInvoiceReceipt(receipt, externalId) {
  if (
    receipt?.externalId !== externalId ||
    typeof receipt.accountingId !== "string" ||
    !receipt.accountingId ||
    typeof receipt.number !== "string" ||
    !receipt.number
  )
    throw new Error("1С не подтвердила документ");
  if (
    !Number.isSafeInteger(receipt.totalMinor) ||
    receipt.totalMinor < 0 ||
    receipt.currency !== "RUB"
  )
    throw new Error("Некорректная сумма из 1С");
  return {
    externalId,
    accountingId: receipt.accountingId,
    number: receipt.number,
    totalMinor: receipt.totalMinor,
    currency: "RUB",
    status: "registered",
  };
}
