import assert from "node:assert/strict";
import { test } from "node:test";
import { orderInput } from "./orders";
import { orderBasePrice } from "./orders-pricing";
import {
  authorizeDeskCommand,
  roleCapabilities,
  type StaffRole,
} from "./staff-access";
const input = () => ({
  requestId: "req_1",
  expectedUpdatedAt: "2026-10-27T10:00:00Z",
  notes: "",
  lines: [
    {
      productId: "prod_1",
      variantId: "variant_1",
      quantity: 2,
      unitPriceMinor: 12345,
    },
  ],
});
test("order input preserves kopeks and only accepts explicit positive quantities and variants", () => {
  assert.equal(orderInput(input()).lines[0].unitPriceMinor, 12345);
  for (const patch of [
    { quantity: 0 },
    { quantity: 1.5 },
    { unitPriceMinor: -1 },
    { unitPriceMinor: 1.1 },
    { productId: "bad/id" },
  ])
    assert.throws(() =>
      orderInput({ ...input(), lines: [{ ...input().lines[0], ...patch }] }),
    );
  assert.throws(() =>
    orderInput({ ...input(), lines: [input().lines[0], input().lines[0]] }),
  );
  assert.throws(() => orderInput({ ...input(), paid: true }));
  assert.throws(() => orderInput({ ...input(), expectedUpdatedAt: "" }));
});
test("only seller, director and god create orders; accountant and production cannot bypass UI", async () => {
  const sql = {
    raw: async () => {
      throw Error("No database access expected for role rejection");
    },
  } as any;
  for (const role of [
    "seller",
    "production",
    "accountant",
    "director",
    "god",
  ] as StaffRole[]) {
    const allowed = ["seller", "director", "god"].includes(role);
    assert.equal(roleCapabilities(role).orderCreate, allowed);
    const action = () =>
      authorizeDeskCommand(
        sql,
        { actorId: "staff_1", role, enabled: true, version: 1 },
        { type: "order.create", order: input() },
      );
    if (allowed) await action();
    else await assert.rejects(action, { status: 403 });
  }
});
test("orders ignore restricted RUB prices and fail closed on missing eligibility or ambiguous base prices", () => {
  const base = {
    id: "base",
    currency_code: "rub",
    amount: 123.45,
    price_list_id: null,
    min_quantity: null,
    max_quantity: null,
    rules_count: 0,
    price_rules: [],
  };
  const restricted = [
    { ...base, id: "bulk", amount: 12.34, min_quantity: 10 },
    { ...base, id: "limited", amount: 1, max_quantity: 1 },
    { ...base, id: "promo", amount: 2, price_list_id: "plist_1" },
    {
      ...base,
      id: "context",
      amount: 3,
      rules_count: 1,
      price_rules: [{ id: "rule_1" }],
    },
  ];
  assert.equal(orderBasePrice([...restricted, base])?.amount, 123.45);
  assert.equal(orderBasePrice(restricted), null);
  assert.equal(orderBasePrice([base, { ...base, id: "other" }]), null);
  assert.equal(
    orderBasePrice([{ id: "unloaded", currency_code: "rub", amount: 1 }]),
    null,
  );
});
