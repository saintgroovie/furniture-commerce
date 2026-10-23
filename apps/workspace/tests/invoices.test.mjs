import assert from "node:assert/strict";
import { test } from "node:test";
import { invoiceInputLines } from "../src/premium/invoice-input.mjs";
import { projectLive } from "../src/server/live-projection.mjs";
test("invoice editor accepts Russian decimals without losing kopeks", () => {
  const r = invoiceInputLines([
    { name: "Изделие", quantity: "1,005", price: "19,99" },
    { name: "Деталь", quantity: "0,001", price: "5,00" },
  ]);
  assert.equal(r.totalMinor, 2010);
  assert.equal(r.lines[0].quantity, "1.005");
  assert.equal(r.lines[0].unitPriceMinor, 1999);
  assert.throws(() =>
    invoiceInputLines([{ name: "Изделие", quantity: "1", price: "" }]),
  );
});
test("invoice availability requires installed capabilities and a confirmed source snapshot", () => {
  const source = {
      invoices: {
        invoices: [
          {
            id: "invoice_1",
            payer: { name: "Компания" },
            lines: [],
            total_minor: "10005",
            status: "draft",
            version: 1,
          },
        ],
      },
    },
    features = {
      contract: "woodright-desk-v1",
      writesEnabled: true,
      invoiceRead: true,
      invoiceDraft: true,
      invoiceRegister: false,
    };
  const d = projectLive(
    source,
    { email: "staff@example.test" },
    { invoices: { ok: true } },
    {},
    features,
  );
  assert.equal(d.invoices[0].totalMinor, 10005);
  assert.equal(d.capabilities.invoiceDraft, true);
  assert.equal(d.capabilities.invoiceRegister, false);
  assert.equal(
    projectLive(
      source,
      { email: "staff@example.test" },
      { invoices: { ok: false } },
      {},
      features,
    ).capabilities.invoiceDraft,
    false,
  );
});
