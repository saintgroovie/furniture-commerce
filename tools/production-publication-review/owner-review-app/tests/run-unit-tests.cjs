"use strict";

const assert = require("node:assert/strict");
const {
  saleLabel,
  saleHeadline,
  saleExplain,
  saleSelectOptionLabel,
  saleInheritOptionLabel,
  correctionSummary,
  correctionAxisLabel,
  clampIndex,
  nextIndex,
  prevIndex,
} = require("../lib/ux-helpers.cjs");

// sale policy label mapping
assert.equal(saleLabel("MADE_TO_ORDER_WITHOUT_HARD_STOCK"), "Под заказ");
assert.equal(saleLabel("KEEP_DRAFT_UNTIL_REAL_STOCK_SOURCE"), "Не продавать");
assert.equal(saleLabel("NON_CART_REQUEST_ONLY"), "Только заявка");
assert.equal(saleHeadline("MADE_TO_ORDER_WITHOUT_HARD_STOCK"), "Продаётся под заказ");
assert.equal(saleHeadline("NON_CART_REQUEST_ONLY"), "Только заявка");
assert.match(
  saleExplain("MADE_TO_ORDER_WITHOUT_HARD_STOCK"),
  /изготавливается или заказывается после оформления/i
);
assert.match(
  saleExplain("KEEP_DRAFT_UNTIL_REAL_STOCK_SOURCE"),
  /нельзя заказать/i
);
assert.match(
  saleExplain("NON_CART_REQUEST_ONLY"),
  /нельзя добавить в корзину/i
);
assert.equal(saleSelectOptionLabel("KEEP_DRAFT_UNTIL_REAL_STOCK_SOURCE"), "Не продавать");
assert.equal(
  saleInheritOptionLabel("MADE_TO_ORDER_WITHOUT_HARD_STOCK"),
  "Использовать общее правило (Под заказ)"
);

// corrections summary
assert.equal(correctionAxisLabel("height"), "Высота");
assert.equal(
  correctionSummary([{ axis: "height", from: 0, to: 905 }]),
  "Высота: 0 → 905 мм"
);
assert.equal(
  correctionSummary([
    { axis: "height", from: "пусто/0", to: 905 },
    { axis: "width", from: 120, to: 1240 },
    { axis: "depth", from: 0, to: 450 },
  ]),
  "Высота: 0 → 905 мм · Ширина: 120 → 1240 мм · …"
);

// gallery index helpers
assert.equal(clampIndex(5, 3), 2);
assert.equal(clampIndex(-1, 3), 0);
assert.equal(nextIndex(2, 3), 0);
assert.equal(prevIndex(0, 3), 2);
assert.equal(nextIndex(0, 0), 0);

console.log("run-unit-tests.cjs: all passed");
