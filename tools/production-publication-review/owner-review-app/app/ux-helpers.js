/* synced from lib/ux-helpers.cjs */
(function () {
  const SALE_POLICY_LABELS = {
    MADE_TO_ORDER_WITHOUT_HARD_STOCK: "Под заказ",
    KEEP_DRAFT_UNTIL_REAL_STOCK_SOURCE: "Не продавать",
    NON_CART_REQUEST_ONLY: "Только заявка",
  };

  const SALE_POLICY_HEADLINES = {
    MADE_TO_ORDER_WITHOUT_HARD_STOCK: "Продаётся под заказ",
    KEEP_DRAFT_UNTIL_REAL_STOCK_SOURCE: "Не продаётся",
    NON_CART_REQUEST_ONLY: "Только заявка",
  };

  const SALE_POLICY_EXPLAIN = {
    MADE_TO_ORDER_WITHOUT_HARD_STOCK:
      "Товар не обязан находиться на складе. Заказ можно принять, после чего товар будет изготовлен или заказан у поставщика.",
    KEEP_DRAFT_UNTIL_REAL_STOCK_SOURCE:
      "Товар скрыт от покупателей, пока нет подтверждённого источника реальных остатков",
    NON_CART_REQUEST_ONLY:
      "Покупатель оформляет заявку или расчёт - товар не добавляется в корзину как обычный SKU",
  };

  const AXIS_RU = { height: "Высота", width: "Ширина", depth: "Глубина" };

  function saleLabel(code) {
    if (!code) return "не задано";
    return SALE_POLICY_LABELS[code] || code;
  }

  function saleHeadline(code) {
    if (!code) return "Правило не задано";
    return SALE_POLICY_HEADLINES[code] || saleLabel(code);
  }

  function saleExplain(code) {
    if (!code) return "";
    return SALE_POLICY_EXPLAIN[code] || "";
  }

  function saleSelectOptionLabel(code) {
    return saleLabel(code);
  }

  function saleInheritOptionLabel(defaultCode) {
    return `Использовать общее правило (${saleLabel(defaultCode)})`;
  }

  function correctionAxisLabel(axis) {
    return AXIS_RU[axis] || axis;
  }

  function formatCorrectionValue(v) {
    if (v == null || v === "" || v === "-" || v === "пусто/0") return "0";
    return String(v);
  }

  function correctionSummary(items) {
    if (!items || !items.length) return "";
    const unit = items[0].unit || "мм";
    const parts = items.map(
      (i) =>
        `${correctionAxisLabel(i.axis)}: ${formatCorrectionValue(i.from)} → ${formatCorrectionValue(i.to)} ${i.unit || unit}`
    );
    if (parts.length <= 2) return parts.join(" · ");
    return `${parts[0]} · ${parts[1]} · …`;
  }

  function clampIndex(index, length) {
    if (length <= 0) return 0;
    return Math.max(0, Math.min(index, length - 1));
  }

  function nextIndex(index, length) {
    if (length <= 0) return 0;
    return (index + 1) % length;
  }

  function prevIndex(index, length) {
    if (length <= 0) return 0;
    return (index - 1 + length) % length;
  }

  window.WRPubRevUX = {
    SALE_POLICY_LABELS,
    saleLabel,
    saleHeadline,
    saleExplain,
    saleSelectOptionLabel,
    saleInheritOptionLabel,
    correctionAxisLabel,
    correctionSummary,
    clampIndex,
    nextIndex,
    prevIndex,
  };
})();
