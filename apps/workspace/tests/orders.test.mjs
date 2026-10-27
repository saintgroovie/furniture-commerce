import assert from "node:assert/strict";
import { test } from "node:test";
import { projectLive } from "../src/server/live-projection.mjs";
import { linkedInvoices } from "../src/premium/invoice-input.mjs";
import {
  changeOrderLine,
  invalidateOrderQuotes,
  orderBoardStages,
} from "../src/premium/order-input.mjs";
test("order relations and variant snapshots come from native persisted metadata, never matching contacts", () => {
  const d = projectLive(
    {
      orders: {
        orders: [
          {
            id: "order_1",
            status: "draft",
            is_draft_order: true,
            currency_code: "rub",
            total: 246.9,
            metadata: {
              woodright_os: {
                request_id: "request_1",
                person_id: "person_1",
                notes: "Спецификация",
              },
            },
            items: [
              {
                id: "li_1",
                title: "Стол",
                variant_id: "v_1",
                variant_title: "Дуб",
                variant_sku: "TABLE-OAK",
                quantity: 2,
                unit_price: 123.45,
              },
            ],
          },
        ],
      },
    },
    { email: "staff@example.test" },
    {},
    {},
    {},
  );
  assert.equal(d.orders[0].requestId, "request_1");
  assert.equal(d.orders[0].personId, "person_1");
  assert.equal(d.orders[0].draft, true);
  assert.equal(d.orders[0].totalMinor, 24690);
  assert.equal(d.orders[0].lines[0].variantId, "v_1");
  assert.equal(d.orders[0].lines[0].price, "123.45");
  assert.equal(d.orders[0].lines[0].sku, "TABLE-OAK");
});
test("changing agreed product, variant, specification or source invalidates bespoke confirmation", () => {
  const approved = {
    productId: "bespoke_1",
    variantId: "oak",
    price: "123,45",
    quoteConfirmed: true,
  };
  for (const change of [{ productId: "bespoke_2" }, { variantId: "walnut" }]) {
    const changed = changeOrderLine(approved, change);
    assert.equal(changed.quoteConfirmed, false);
    assert.equal(changed.price, "");
  }
  assert.equal(
    changeOrderLine(approved, { productId: "bespoke_2" }).variantId,
    "",
  );
  assert.equal(invalidateOrderQuotes([approved])[0].quoteConfirmed, false);
  assert.equal(changeOrderLine(approved, { quantity: "3" }).quoteConfirmed, false);
  assert.equal(changeOrderLine(approved, { price: "456,78" }).quoteConfirmed, false);
  assert.equal(
    approved.quoteConfirmed,
    true,
    "form transitions must not mutate the prior approved snapshot",
  );
});
test("orders without a manufacturing process remain visible on the production board", () => {
  assert.deepEqual(
    orderBoardStages(
      ["Подтверждение"],
      [{ stage: "Не начато" }, { stage: "Не начато" }, { stage: "Новый этап" }],
    ),
    ["Подтверждение", "Не начато", "Новый этап"],
  );
});
test("order includes invoices from its original request without moving or duplicating them", () => {
  const data = {
    orders: [{ id: "order_1", requestId: "request_1" }],
    requests: [],
    invoices: [
      { id: "i1", sourceType: "order", sourceId: "order_1" },
      { id: "i2", sourceType: "request", sourceId: "request_1" },
      { id: "i3", sourceType: "request", sourceId: "other" },
    ],
  };
  assert.deepEqual(
    linkedInvoices(data, "order_1").map((i) => i.id),
    ["i1", "i2"],
  );
});
test("order creation fails closed if catalog, source requests or installed backend capability is missing", () => {
  const features = {
    contract: "woodright-desk-v1",
    writesEnabled: true,
    orderCreate: true,
  };
  for (const missing of ["products", "requests", "orders"]) {
    const states = Object.fromEntries(
      ["products", "requests", "orders"].map((k) => [k, { ok: k !== missing }]),
    );
    assert.equal(
      projectLive({}, {}, states, {}, features).capabilities.orderCreate,
      false,
    );
  }
});
