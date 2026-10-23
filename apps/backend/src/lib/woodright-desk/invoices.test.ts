import assert from "node:assert/strict";
import { test } from "node:test";
import { invoiceFields } from "./invoices";
import {
  authorizeDeskCommand,
  roleCapabilities,
  routeAllowed,
  type StaffRole,
} from "./staff-access";
import type { Sql } from "./commands";
const input = () => ({
  sourceType: "request",
  sourceId: "request_1",
  companyId: null,
  payer: { type: "person", name: "Плательщик" },
  lines: [{ name: "Изделие", quantity: "1.005", unitPriceMinor: 1999 }],
  notes: "",
});
test("invoice decimal quantities round once per line in integer kopeks", () => {
  const i = input();
  i.lines.push({ name: "Деталь", quantity: "0.001", unitPriceMinor: 500 });
  const f = invoiceFields(i);
  assert.equal(f.lines[0].totalMinor, 2009);
  assert.equal(f.lines[1].totalMinor, 1);
  assert.equal(f.totalMinor, 2010);
});
test("invoice inputs refuse invented payment/tax facts, non-finite values and unsafe totals", () => {
  assert.throws(() => invoiceFields({ ...input(), paid: true }));
  assert.throws(() =>
    invoiceFields({
      ...input(),
      lines: [{ name: "Изделие", quantity: "1", unitPriceMinor: NaN }],
    }),
  );
  assert.throws(() =>
    invoiceFields({
      ...input(),
      lines: [
        {
          name: "Изделие",
          quantity: "999999999",
          unitPriceMinor: 9000000000000,
        },
      ],
    }),
  );
  assert.throws(() =>
    invoiceFields({
      ...input(),
      lines: [{ name: "Изделие", quantity: "0", unitPriceMinor: 10 }],
    }),
  );
  assert.throws(() =>
    invoiceFields({
      ...input(),
      payer: { type: "company", name: "Компания", inn: "" },
    }),
  );
});
test("only accounting and God can register documents, and production cannot read invoices", async () => {
  const sql = { raw: async () => ({ rows: [] }) } as unknown as Sql;
  for (const role of [
    "seller",
    "production",
    "accountant",
    "director",
    "god",
  ] as StaffRole[]) {
    const access = { actorId: "staff_1", role, version: 1, enabled: true };
    if (["accountant", "god"].includes(role))
      await authorizeDeskCommand(sql, access, {
        type: "invoice.register",
        id: "invoice_1",
      });
    else
      await assert.rejects(
        authorizeDeskCommand(sql, access, {
          type: "invoice.register",
          id: "invoice_1",
        }),
        { code: "ROLE_FORBIDDEN" },
      );
    assert.equal(
      routeAllowed(role, "GET", "/admin/woodright/desk/invoices"),
      role !== "production",
    );
    assert.equal(roleCapabilities(role).invoiceDraft, role !== "production");
  }
});
