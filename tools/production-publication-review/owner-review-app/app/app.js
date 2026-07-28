/* Woodright publication review - owner UI */
/* build_id: PUBREV-20260724A */
const UX = window.WRPubRevUX;

let STATE = null;
let VIEW = "overview";
const selected = new Set();
const galleryIndexBySku = new Map();
const correctionsExpanded = new Set();

let lightboxState = { images: [], index: 0, returnFocus: null };

const CREATE_OPTS = [
  ["PENDING_OWNER_REVIEW", "Ожидает review"],
  ["APPROVE_FOR_FUTURE_PUBLICATION", "Одобрить к будущей публикации"],
  ["KEEP_DRAFT", "Оставить draft"],
  ["CONTENT_CORRECTION_REQUIRED", "Нужна правка контента"],
  ["MEDIA_CORRECTION_REQUIRED", "Нужна правка медиа"],
  ["INVENTORY_DECISION_REQUIRED", "Нужно правило продажи"],
  ["EXCLUDE_FROM_PUBLICATION_SCOPE", "Исключить из публикации"],
];
const UPDATE_OPTS = [
  ["PENDING_OWNER_CONFIRMATION", "Ожидает подтверждения"],
  ["APPROVE_CURRENT_RESULT", "Подтвердить текущий результат"],
  ["CORRECTION_REQUIRED", "Нужна правка"],
  ["ROLLBACK_REQUESTED", "Запросить откат"],
];
const NOOP_OPTS = [["NO_ACTION_REQUIRED", "Действие не требуется"]];
const OL65_OPTS = [
  ["PENDING_OWNER_CONFIRMATION", "Ожидает подтверждения"],
  ["APPROVE_OL65_CURRENT_RESULT", "Подтвердить OL-65 как есть"],
  ["KEEP_OL65_PRIVATE", "Оставить OL-65 приватным"],
  ["OL65_REPAIR_REQUIRED", "Нужен ремонт OL-65"],
];

const SALE_POLICY_OPTS = [
  ["MADE_TO_ORDER_WITHOUT_HARD_STOCK", UX.saleSelectOptionLabel("MADE_TO_ORDER_WITHOUT_HARD_STOCK")],
  ["KEEP_DRAFT_UNTIL_REAL_STOCK_SOURCE", UX.saleSelectOptionLabel("KEEP_DRAFT_UNTIL_REAL_STOCK_SOURCE")],
  ["NON_CART_REQUEST_ONLY", UX.saleSelectOptionLabel("NON_CART_REQUEST_ONLY")],
];

const MODE_RU = {
  UNIFORM: "Одинаково для всех новых",
  PRODUCT_SPECIFIC_POLICY: "Общее правило + отдельные исключения",
};

function invPolicy() {
  return (
    STATE.inventory_policy ||
    STATE.decisions?.inventory_policy || {
      global_mode: null,
      default_policy: null,
      sku_overrides: {},
    }
  );
}

function effectiveInv(sku) {
  const map = STATE.inventory_effective_per_sku || {};
  if (sku in map) return map[sku];
  const inv = invPolicy();
  if (!inv.default_policy) return null;
  if (inv.global_mode === "UNIFORM") return inv.default_policy;
  if (inv.global_mode === "PRODUCT_SPECIFIC_POLICY") {
    return (inv.sku_overrides || {})[sku] || inv.default_policy;
  }
  return null;
}

function isInvOverride(sku) {
  const inv = invPolicy();
  return inv.global_mode === "PRODUCT_SPECIFIC_POLICY" && !!(inv.sku_overrides || {})[sku];
}

const CLASS_RU = {
  READY_FOR_OWNER_PUBLICATION_REVIEW: "Готов к review",
  INVENTORY_DECISION_REQUIRED: "Нужно правило продажи",
  CONTENT_CORRECTION_REQUIRED: "Нужна правка контента",
  MEDIA_CORRECTION_REQUIRED: "Нужна правка медиа",
  TECHNICAL_REPAIR_REQUIRED: "Нужен техремонт",
  KEEP_DRAFT_RECOMMENDED: "Рекомендуется draft",
};

function money(v) {
  if (v === "" || v == null) return "н/д";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return new Intl.NumberFormat("ru-RU").format(n) + " ₽";
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function decisionOf(sku) {
  return STATE.decisions?.products?.[sku]?.decision || "";
}

function noteOf(sku) {
  return STATE.decisions?.products?.[sku]?.note || "";
}

function optsFor(p) {
  if (p.action === "CREATE") return CREATE_OPTS;
  if (p.action === "UPDATE") return UPDATE_OPTS;
  if (p.action === "NO_OP") return NOOP_OPTS;
  return OL65_OPTS;
}

function badgeClass(decision, completeness) {
  if (String(decision).startsWith("PENDING")) return "pending";
  if (completeness === "TECHNICAL_REPAIR_REQUIRED") return "danger";
  if (completeness.includes("CORRECTION") || completeness.includes("INVENTORY")) return "warn";
  return "ok";
}

async function api(path, opts) {
  const r = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  return r.json();
}

async function load() {
  STATE = await api("/api/data");
  render();
}

function autoRules() {
  return STATE.automatic_rules || STATE.decisions?.automatic_rules || {};
}

function autoCounts() {
  const c = STATE.counts_auto || STATE.decisions?.counts || {};
  const v = STATE.dimension_verification || STATE.decisions?.dimension_verification || {};
  return {
    ...c,
    auto_recovered_SKU: c.auto_recovered_SKU ?? c.auto_decisions_completed ?? 0,
    unique_target_fields_recovered: c.unique_target_fields_recovered ?? v.unique_canonical_fields_from_auto_csv ?? 0,
    evidence_records_generated: c.evidence_records_generated ?? 492,
    unique_production_mutations_planned: c.unique_production_mutations_planned ?? v.unique_production_mutations_in_plan ?? 0,
    ambiguous_SKU: c.ambiguous_SKU ?? c.ambiguous_dimensions ?? 0,
    approved_repairs_not_applied: c.approved_repairs_not_applied ?? 0,
  };
}

function isAutoResolved(sku) {
  const pd = STATE.decisions?.products?.[sku] || {};
  return pd.decision_origin === "OWNER_AUTOMATION_RULE";
}

function hasDimRecovery(sku) {
  const pd = STATE.decisions?.products?.[sku] || {};
  return pd.dimension_recovery_status === "AUTO_DIMENSION_REPAIR_APPROVED_NOT_APPLIED";
}

function isDimAmbig(sku) {
  const list = autoRules()?.dimensions?.ambiguous_sku || [];
  return list.includes(sku);
}

function isEmptyDim(v) {
  if (v == null || v === "" || v === "-" || v === "пусто/0") return true;
  const n = Number(v);
  return Number.isFinite(n) && n === 0;
}

function productsFiltered(action) {
  const q = (document.getElementById("search").value || "").trim().toLowerCase();
  const fc = document.getElementById("filterClass").value;
  const fd = document.getElementById("filterDecision").value;
  const onlyOverrides = document.getElementById("filterOverrides")?.checked;
  return STATE.products.filter((p) => {
    if (action && p.action !== action) return false;
    if (q && !(p.sku.toLowerCase().includes(q) || (p.product_title || "").toLowerCase().includes(q))) return false;
    if (fc && p.completeness_class !== fc) return false;
    const d = decisionOf(p.sku);
    const pd = STATE.decisions?.products?.[p.sku] || {};
    if (fd === "PENDING" && !String(d).startsWith("PENDING")) return false;
    if (fd === "DONE" && (String(d).startsWith("PENDING") || isAutoResolved(p.sku))) return false;
    if (fd === "AUTO" && !isAutoResolved(p.sku)) return false;
    if (fd === "DIM_RECOVERED" && !hasDimRecovery(p.sku)) return false;
    if (fd === "DIM_AMBIG" && !isDimAmbig(p.sku)) return false;
    if (fd === "NO_MEDIA" && pd.media_status !== "NO_VALID_MEDIA" && d !== "MEDIA_CORRECTION_REQUIRED")
      return false;
    if (fd === "MEDIA_MAP" && pd.media_status !== "MEDIA_MAPPING_REPAIR_REQUIRED") return false;
    if (fd === "REPAIRS" && !hasDimRecovery(p.sku)) return false;
    const planSt = pd.dimension_repair_plan_status || "";
    if (fd === "FULL_PLAN" && planSt !== "FULLY_VERIFIED_REPAIR_PLAN") return false;
    if (fd === "PARTIAL_PLAN" && planSt !== "PARTIALLY_VERIFIED_REPAIR_PLAN") return false;
    if (fd === "SOURCE_CONFLICT" && planSt !== "BLOCKED_SOURCE_CONFLICT" && pd.unresolved_reason !== "DIMENSION_SOURCE_AMBIGUOUS") {
      if (planSt !== "BLOCKED_SOURCE_CONFLICT") return false;
    }
    if (onlyOverrides && !isInvOverride(p.sku)) return false;
    return true;
  });
}

function targetBinding() {
  return STATE.target_binding || STATE.decisions?.target_binding || {};
}

function galleryItems(p) {
  const items = (p.gallery || []).map((g) => ({
    thumb: g.thumb,
    full: g.full || g.thumb,
  }));
  if (!items.length && p.main_media_file) {
    const t = `/media/review-thumbnails/${p.main_media_file}`;
    items.push({ thumb: t, full: t });
  }
  return items;
}

function galleryIndexFor(sku, count) {
  const cur = galleryIndexBySku.get(sku) ?? 0;
  return UX.clampIndex(cur, count);
}

function galleryHTML(p) {
  const items = galleryItems(p);
  const idx = galleryIndexFor(p.sku, items.length);
  const n = items.length;
  const hasMany = n > 1;
  const cur = items[idx] || { thumb: "", full: "" };
  const thumbs = items
    .map(
      (g, i) =>
        `<button type="button" class="gallery-thumb ${i === idx ? "active" : ""}" data-index="${i}" aria-label="Фото ${i + 1}">
          <img src="${esc(g.thumb)}" alt="" loading="lazy" />
        </button>`
    )
    .join("");
  return `
    <div class="card-gallery" data-sku="${esc(p.sku)}" tabindex="0" role="region" aria-label="Галерея фото товара">
      <div class="gallery-main" data-sku="${esc(p.sku)}">
        ${
          hasMany
            ? `<button type="button" class="gallery-arrow gallery-prev" data-sku="${esc(p.sku)}" aria-label="Предыдущее фото">‹</button>`
            : ""
        }
        <button type="button" class="gallery-main-btn" data-sku="${esc(p.sku)}" data-full="${esc(cur.full)}" aria-label="Открыть фото на весь экран">
          <img class="gallery-main-img" src="${esc(cur.thumb)}" alt="" />
        </button>
        ${
          hasMany
            ? `<button type="button" class="gallery-arrow gallery-next" data-sku="${esc(p.sku)}" aria-label="Следующее фото">›</button>`
            : ""
        }
        ${hasMany ? `<span class="gallery-counter">${idx + 1} / ${n}</span>` : n === 1 ? `<span class="gallery-counter">1 / 1</span>` : ""}
      </div>
      ${n ? `<div class="gallery-thumbs">${thumbs}</div>` : `<div class="gallery-empty meta">Нет фотографий</div>`}
    </div>`;
}

function buildDimCorrectionData(p, pd, dr) {
  const prev = dr.previous_fields || {};
  const rec = dr.recovered_fields || pd.recovered_dimensions || {};
  const live = dr.live_vm_fields || {};
  const axes = ["height", "width", "depth"];
  const rows = axes.map((axis) => {
    const liveV = live[`${axis}_mm`] ?? prev[`${axis}_mm`] ?? "пусто/0";
    const will = rec[`${axis}_mm`] ?? p[`${axis}_mm`] ?? "-";
    const guard = isEmptyDim(liveV) ? "current null/missing/zero" : `exact ${liveV}`;
    return {
      axis,
      from: liveV,
      to: will,
      unit: "мм",
      guard,
      source: dr.relation || pd.decision_rule || "exact_sku",
      confidence: "HIGH",
      planId: (pd.repair_plan_SHA || "").slice(0, 12) || "н/д",
      reasonCode: pd.dimension_recovery_status || dr.status || "",
    };
  });
  const summaryItems = rows.map((r) => ({ axis: r.axis, from: r.from, to: r.to, unit: r.unit }));
  return { rows, summary: UX.correctionSummary(summaryItems), count: rows.length };
}

function correctionsHTML(p, pd, dr) {
  const showDim =
    hasDimRecovery(p.sku) ||
    dr.status === "AUTO_DIMENSION_REPAIR_APPROVED_NOT_APPLIED" ||
    pd.dimension_repair_plan_status === "VM_BOUND_PLAN_READY_PENDING_OWNER_APPROVAL" ||
    pd.repair_status === "ALREADY_MATCHES_VM_PRODUCTION";

  const blocks = [];
  let dimBlock = "";

  if (showDim) {
    const { rows, summary, count } = buildDimCorrectionData(p, pd, dr);
    const expanded = correctionsExpanded.has(p.sku);
    const statusLine =
      pd.repair_status === "ALREADY_MATCHES_VM_PRODUCTION"
        ? "Совпадает с production - исправление не требуется"
        : "✓ Решение сохранено · ожидает применения";
    const badge =
      pd.repair_status === "ALREADY_MATCHES_VM_PRODUCTION"
        ? `<span class="badge ok">Совпадает</span>`
        : `<span class="badge warn">Не применено</span>`;
    const detailRows = rows
      .map(
        (r) => `<tr>
          <td>${esc(UX.correctionAxisLabel(r.axis))}</td>
          <td>${esc(r.from)}</td>
          <td>${esc(r.to)}</td>
          <td>${esc(r.unit)}</td>
          <td>${esc(r.confidence)}</td>
          <td>${esc(r.source)}</td>
          <td>${esc(r.guard)}</td>
          <td>${esc(r.planId)}</td>
          <td>${esc(r.reasonCode)}</td>
        </tr>`
      )
      .join("");
    dimBlock = `
      <div class="corrections-block" data-sku="${esc(p.sku)}">
        <div class="corrections-head">
          <span class="corrections-title">Предлагаемые исправления · ${count}</span>
          <span class="corrections-summary">${esc(summary)}</span>
        </div>
        <div class="corrections-status">${statusLine} ${badge}</div>
        <button type="button" class="corrections-toggle" data-sku="${esc(p.sku)}" aria-expanded="${expanded ? "true" : "false"}">
          ${expanded ? "Скрыть детали" : "Показать детали"}
        </button>
        <div class="corrections-details ${expanded ? "" : "hidden"}" id="corr-${esc(p.sku)}">
          <table class="corrections-table">
            <thead><tr>
              <th>Поле</th><th>Сейчас</th><th>Предлагается</th><th>Ед.</th>
              <th>Уверенность</th><th>Источник</th><th>Guard</th><th>Plan</th><th>Причина</th>
            </tr></thead>
            <tbody>${detailRows}</tbody>
          </table>
        </div>
      </div>`;
    blocks.push(dimBlock);
  }

  if (isDimAmbig(p.sku)) {
    blocks.push(`<div class="notice-compact warn">Неоднозначные габариты - нужно решение владельца</div>`);
  }

  const ms = pd.media_status || p.media_status?.status || "";
  const d = decisionOf(p.sku);
  if (ms === "NO_VALID_MEDIA" || d === "MEDIA_CORRECTION_REQUIRED") {
    blocks.push(`<div class="notice-compact warn">Нет пригодных фотографий - оставить draft</div>`);
  }
  if (ms === "MEDIA_MAPPING_REPAIR_REQUIRED") {
    blocks.push(`<div class="notice-compact warn">Нужен media mapping repair</div>`);
  }

  return blocks.length ? blocks.join("") : "";
}

function saleAvailabilityHTML(p) {
  if (p.action !== "CREATE") return "";
  const eff = effectiveInv(p.sku);
  const ov = isInvOverride(p.sku);
  const inv = invPolicy();
  const canOverride = inv.global_mode === "PRODUCT_SPECIFIC_POLICY" && inv.default_policy;
  const headline = eff ? UX.saleHeadline(eff) : "Правило не задано";
  const explain = eff ? UX.saleExplain(eff) : "";
  const inheritBadge = ov
    ? `<span class="badge warn">Индивидуально</span><span class="sale-secondary">Для товара задано отдельное правило</span>`
    : eff
      ? `<span class="badge ok">Общее правило</span><span class="sale-secondary">Используется общее правило магазина</span>`
      : `<span class="badge pending">Не задано</span>`;

  const defaultExplain = inv.default_policy
    ? `Общее правило магазина сейчас: ${UX.saleHeadline(inv.default_policy)} (${UX.saleLabel(inv.default_policy)})`
    : "Общее правило магазина ещё не выбрано на вкладке «Продажа и наличие»";

  return `
    <div class="sale-box">
      <div class="sale-box-title">Продажа и наличие</div>
      <div class="sale-headline">${esc(headline)}</div>
      ${explain ? `<div class="sale-explain">${esc(explain)}</div>` : ""}
      <div class="sale-inherit">${inheritBadge}</div>
      <details class="sale-what">
        <summary>Что это значит?</summary>
        <p>${esc(defaultExplain)}</p>
        <p class="meta">Отдельное правило для товара перекрывает общее только при режиме «общее правило + отдельные исключения»</p>
      </details>
      ${
        canOverride
          ? `<div class="sale-override">
          <select class="inv-select" data-sku="${esc(p.sku)}">
            <option value="">${esc(UX.saleInheritOptionLabel(inv.default_policy))}</option>
            ${SALE_POLICY_OPTS.map(
              ([v]) =>
                `<option value="${v}" ${ov && (inv.sku_overrides || {})[p.sku] === v ? "selected" : ""}>${esc(UX.saleSelectOptionLabel(v))}</option>`
            ).join("")}
          </select>
          <button type="button" class="btn ghost save-inv-ov" data-sku="${esc(p.sku)}">Задать отдельно для товара</button>
        </div>`
          : ""
      }
    </div>`;
}

function renderTop() {
  const s = STATE.summary || {};
  const c = STATE.counts || {};
  const ac = autoCounts();
  const inv = invPolicy();
  const tb = targetBinding();
  const v = STATE.dimension_verification || STATE.decisions?.dimension_verification || {};
  const invLabel = inv.default_policy
    ? `${MODE_RU[inv.global_mode] || inv.global_mode}: ${UX.saleLabel(inv.default_policy)}`
    : "правило продажи не выбрано";
  const prod = tb.products ?? s.production_products ?? 238;
  const vars = tb.variants ?? s.production_variants ?? 239;
  document.getElementById("topStats").innerHTML = `
    <span class="binding-badge">${esc(tb.label || "Production-candidate VM")} · ${esc(tb.ssh_host || "89.169.188.29")}</span>
    <span>VM <strong>${prod}</strong>/<strong>${vars}</strong></span>
    <span><strong>${c.sku}</strong> SKU</span>
    <span>repair SKU: <strong>${ac.vm_repair_required_sku ?? v.repair_required_sku ?? ac.approved_repairs_not_applied ?? 0}</strong></span>
    <span>fields: <strong>${ac.vm_repair_mutation_fields ?? ac.unique_production_mutations_planned ?? 0}</strong></span>
    <span>match: <strong>${ac.already_matching_sku ?? v.already_matching_sku ?? 0}</strong></span>
    <span>ambig: <strong>${ac.ambiguous_SKU ?? 0}</strong></span>
    <span>plan≠applied: <strong>${ac.approved_repairs_not_applied ?? 0}</strong></span>
    <span>${esc(invLabel)}</span>
  `;
}

function overviewHTML() {
  const c = STATE.counts;
  const ac = autoCounts();
  const classes = STATE.completeness_classes || {};
  const token = STATE.approval_token || {};
  return `
    <div class="panel">
      <h2>Обзор import-кандидата</h2>
      <p>Пакет <strong>${esc(STATE.package_id)}</strong></p>
      <p>Import run <strong>${esc(STATE.import_run_id)}</strong></p>
      <p><span class="binding-badge">${esc((STATE.target_binding || {}).label || "Production-candidate VM")}</span>
        · probe_scope <strong>VM_PRODUCTION_CANDIDATE_ONLY</strong>
        · counts <strong>${esc(String((STATE.target_binding || {}).products || 238))}</strong>/<strong>${esc(String((STATE.target_binding || {}).variants || 239))}</strong>
        (локальный Mac Docker probe запрещён как production evidence)</p>
      <p>Reaffirmed fingerprint: <code>${esc(((STATE.target_binding || {}).combined_target_fingerprint || STATE.decisions?.target_fingerprint || "").slice(0, 16))}…</code>
        · old plan superseded</p>
      <p>Публикация не выполнялась · Cutover запрещён · Approval token: <strong>${esc(
        token.status || "OWNER_REVIEW_PENDING"
      )}</strong></p>
      <div class="grid-stats">
        <div class="stat"><div class="n">${c.sku}</div><div class="l">SKU в пакете</div></div>
        <div class="stat"><div class="n">${c.create}</div><div class="l">Новые draft</div></div>
        <div class="stat"><div class="n">${c.update}</div><div class="l">Обновления</div></div>
        <div class="stat"><div class="n">${c.noop}</div><div class="l">Без изменений</div></div>
        <div class="stat"><div class="n">${ac.vm_repair_required_sku ?? ac.approved_repairs_not_applied ?? 0}</div><div class="l">VM repair SKU</div></div>
        <div class="stat"><div class="n">${ac.vm_repair_mutation_fields ?? ac.unique_production_mutations_planned ?? 0}</div><div class="l">Repair fields</div></div>
        <div class="stat"><div class="n">${ac.already_matching_sku ?? 0}</div><div class="l">Already matches</div></div>
        <div class="stat"><div class="n">${ac.ambiguous_dimensions ?? ac.ambiguous_SKU ?? 0}</div><div class="l">Ambiguous dims</div></div>
      </div>
    </div>
    <div class="panel">
      <h2>Классы готовности</h2>
      <table class="table">
        <thead><tr><th>Класс</th><th>Кол-во</th></tr></thead>
        <tbody>
          ${Object.entries(classes)
            .map(([k, v]) => `<tr><td>${esc(CLASS_RU[k] || k)}</td><td>${v}</td></tr>`)
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function cardHTML(p) {
  const d = decisionOf(p.sku);
  const note = noteOf(p.sku);
  const opts = optsFor(p);
  // 0 / empty are unknown - never render as a real size (no "0 × 0 × 0").
  const axisCm = [p.height_cm, p.width_cm, p.depth_cm];
  const knownAxes = [
    ["В", p.height_cm],
    ["Ш", p.width_cm],
    ["Г", p.depth_cm],
  ].filter(([, v]) => !isEmptyDim(v));
  const dims =
    knownAxes.length === 3
      ? `${axisCm.join(" × ")} см (В → Ш → Г)`
      : knownAxes.length > 0
        ? `${knownAxes.map(([label, v]) => `${label}: ${v}`).join(" · ")} см`
        : "Размеры не указаны";
  const pd = STATE.decisions?.products?.[p.sku] || {};
  const dr = p.dimension_recovery || {};

  let extra = "";
  if (p.action === "UPDATE" && p.meaningful_diff) {
    const md = p.meaningful_diff;
    extra = `
      <div class="diff">
        <div><div class="lbl">Было</div><div>цена ${esc(money(md.price_before))}</div></div>
        <div><div class="lbl">Стало</div><div>цена ${esc(money(md.price_after))}</div></div>
        <div class="chg">${
          md.price_changed
            ? `Изменение цены: ${esc(money(md.price_before))} → ${esc(money(md.price_after))}`
            : "Цена семантически совпадает с до-import (или уже приведена пакетом)"
        }</div>
        <div class="chg">Статус публикации: ${esc(md.status)} · медиа: ${esc(md.media_count)}</div>
      </div>`;
  }
  if (p.action === "NO_OP") {
    extra = `<div class="notice-compact ok">Контрольная группа: значимых изменений пакета нет</div>`;
  }
  if (p.action === "CREATE") {
    extra = `<div class="notice-compact">Новый production-candidate · draft · в публичный канал не выведен</div>${extra}`;
  }

  const corrections = correctionsHTML(p, pd, dr);
  const saleBlock = saleAvailabilityHTML(p);

  return `
    <article class="card ${selected.has(p.sku) ? "selected" : ""}" data-sku="${esc(p.sku)}">
      ${galleryHTML(p)}
      <div class="card-body">
        <label class="pick"><input type="checkbox" class="sel" data-sku="${esc(p.sku)}" ${
          selected.has(p.sku) ? "checked" : ""
        } /> выбрать</label>
        <div><span class="badge">${esc(p.sku)}</span>
          <span class="badge ${badgeClass(d, p.completeness_class)}">${esc(CLASS_RU[p.completeness_class] || p.completeness_class)}</span>
          <span class="badge pending">${esc(d)}</span>
        </div>
        <h3>${esc(p.product_title)}</h3>
        ${p.variant_title && p.variant_title !== p.product_title ? `<div class="meta">${esc(p.variant_title)}</div>` : ""}
        <div class="meta">${esc(p.collection || "коллекция не указана")} · ${esc(p.classification || "—")} · ${esc(p.status)}</div>
        <div class="price">${esc(money(p.price_live_rub))}</div>
        <div class="dims meta">${esc(dims)}</div>
        <div class="desc">${esc(p.description || "описание отсутствует")}</div>
        ${p.material ? `<div class="meta">Материал: ${esc(p.material)}</div>` : ""}
        ${corrections}
        ${saleBlock}
        ${extra}
        <div class="card-actions">
          <select class="dec-select" data-sku="${esc(p.sku)}">
            ${opts
              .map(([v, l]) => `<option value="${v}" ${v === d ? "selected" : ""}>${esc(l)}</option>`)
              .join("")}
          </select>
          <input type="text" class="dec-note" data-sku="${esc(p.sku)}" placeholder="Заметка" value="${esc(note)}" />
          <button type="button" class="btn save-dec" data-sku="${esc(p.sku)}">Сохранить</button>
        </div>
      </div>
    </article>`;
}

function cardsHTML(list) {
  if (!list.length) return `<div class="panel"><p>Нет товаров по фильтру</p></div>`;
  return `<div class="cards">${list.map(cardHTML).join("")}</div>`;
}

function ol65HTML() {
  const o = STATE.ol65 || {};
  const variants = (STATE.products || []).filter((p) => p.action === "TOPOLOGY");
  const d = STATE.decisions?.ol65_decision || "PENDING_OWNER_CONFIRMATION";
  return `
    <div class="panel">
      <h2>OL-65 - отдельный разбор</h2>
      <p>Родитель: <strong>ol-65</strong> · статус <strong>${esc(o.canonical_parent_status)}</strong></p>
      <p>Ожидаемая опция: <strong>${esc(o.option_title_expected)}</strong></p>
      <p>Фактическая опция: <strong>${esc(o.option_title_actual)}</strong></p>
      <div class="notice-compact warn">Option-field soft failure: заголовок опции и связи значений не дописаны. Варианты, цены, raw codes и variant titles корректны. Ремонт в production в этом pass не выполнялся.</div>
      <p>Решение OL-65:</p>
      <select id="ol65Decision">
        ${OL65_OPTS.map(([v, l]) => `<option value="${v}" ${v === d ? "selected" : ""}>${esc(l)}</option>`).join("")}
      </select>
      <button type="button" class="btn" id="saveOl65">Сохранить OL-65</button>
    </div>
    ${cardsHTML(variants)}
  `;
}

function inventoryHTML() {
  const inv = invPolicy();
  const mode = inv.global_mode;
  const def = inv.default_policy;
  const overrides = Object.entries(inv.sku_overrides || {}).sort(([a], [b]) => a.localeCompare(b));
  const createCount = (STATE.products || []).filter((p) => p.action === "CREATE").length;
  const inherited = mode && def ? createCount - overrides.length : "н/д";
  const ovKeep = overrides.filter(([, v]) => v === "KEEP_DRAFT_UNTIL_REAL_STOCK_SOURCE").length;
  const ovNonCart = overrides.filter(([, v]) => v === "NON_CART_REQUEST_ONLY").length;
  return `
    <div class="panel">
      <h2>Продажа и наличие</h2>
      <p>Как новые товары будут доступны покупателям после публикации</p>
      <p class="meta">Режим «общее правило + отдельные исключения» - наследование общего правила с точечными настройками по SKU</p>

      <h3 style="margin-top:1rem">1. Режим работы</h3>
      <div class="grid-stats">
        <label class="stat" style="cursor:pointer">
          <input type="radio" name="invMode" value="UNIFORM" ${mode === "UNIFORM" ? "checked" : ""} />
          <div class="n" style="font-size:1rem">Одинаково для всех</div>
          <div class="l">Одно правило на все ${createCount} новых товаров</div>
        </label>
        <label class="stat" style="cursor:pointer">
          <input type="radio" name="invMode" value="PRODUCT_SPECIFIC_POLICY" ${
            mode === "PRODUCT_SPECIFIC_POLICY" ? "checked" : ""
          } />
          <div class="n" style="font-size:1rem">Общее правило + исключения</div>
          <div class="l">Общее правило магазина и отдельные настройки по SKU</div>
        </label>
      </div>

      <h3 style="margin-top:1rem">2. Общее правило магазина</h3>
      <p class="meta">Обязательный шаг. Новые товары без отдельной настройки используют это правило</p>
      <details class="sale-what" style="margin-bottom:0.75rem">
        <summary>Что это значит?</summary>
        <p>Общее правило действует для всех новых товаров, пока для конкретного SKU не задано отдельное</p>
      </details>
      <div class="grid-stats" id="defaultPolicyBlock">
        ${SALE_POLICY_OPTS.map(
          ([code]) => `
          <label class="stat" style="cursor:pointer">
            <input type="radio" name="invDefault" value="${esc(code)}" ${def === code ? "checked" : ""} />
            <div class="n" style="font-size:1rem">${esc(UX.saleHeadline(code))}</div>
            <div class="l">${esc(UX.saleExplain(code))}</div>
          </label>`
        ).join("")}
      </div>

      <p style="margin-top:1rem">
        <button type="button" class="btn" id="saveInv">Сохранить настройки</button>
      </p>

      <div class="panel panel-sub" style="margin-top:1rem">
        <h3>Сводка</h3>
        <p>Режим: <strong>${esc(MODE_RU[mode] || "не выбран")}</strong></p>
        <p>Общее правило: <strong>${esc(def ? UX.saleHeadline(def) : "не выбрано")}</strong>
          ${def ? `<span class="meta">(${esc(UX.saleLabel(def))})</span>` : ""}</p>
        <p>По общему правилу: <strong>${inherited}</strong> товаров</p>
        <p>Отдельные настройки: <strong>${overrides.length}</strong></p>
        <p>Не продавать (отдельно): <strong>${ovKeep}</strong></p>
        <p>Только заявка (отдельно): <strong>${ovNonCart}</strong></p>
      </div>

      ${
        overrides.length
          ? `<div class="panel panel-sub" style="margin-top:1rem">
        <h3>Отдельные настройки по SKU</h3>
        <table class="table">
          <thead><tr><th>SKU</th><th>Правило</th><th></th></tr></thead>
          <tbody>
            ${overrides
              .map(
                ([sku, pol]) => `<tr>
              <td>${esc(sku)}</td>
              <td>${esc(UX.saleHeadline(pol))} <span class="meta">(${esc(UX.saleLabel(pol))})</span></td>
              <td><button type="button" class="btn ghost clear-inv-ov" data-sku="${esc(sku)}">Сбросить</button></td>
            </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>`
          : ""
      }
    </div>
  `;
}

function autoHTML() {
  const ac = autoCounts();
  const rules = autoRules();
  const dims = rules.dimensions || {};
  const media = rules.media || {};
  const v = STATE.dimension_verification || STATE.decisions?.dimension_verification || {};
  const list = (arr) =>
    (arr || []).length
      ? `<div class="meta">${esc((arr || []).slice(0, 40).join(", "))}${(arr || []).length > 40 ? "…" : ""}</div>`
      : `<div class="meta">нет</div>`;
  return `
    <div class="panel">
      <h2>Автоматические решения по правилам владельца</h2>
      <p class="meta">Источник данных: Production-candidate VM · production не изменялся · порядок: Высота → Ширина → Глубина</p>
      <div class="notice-compact">492 - evidence records (82×6), не mutations. Уникальных осей: ${
        ac.unique_target_fields_recovered
      }. VM repair mutations: ${ac.vm_repair_mutation_fields ?? ac.unique_production_mutations_planned}.</div>
      ${
        v.previous_plan_status
          ? `<div class="notice-compact warn">Предыдущий plan <code>${esc((v.previous_plan_sha || "").slice(0, 12))}…</code> - ${esc(v.previous_plan_status)}</div>`
          : ""
      }
      ${
        v.hard_stop_for_production_apply
          ? `<div class="notice-compact warn">HARD STOP: repair не применён - нужен exact owner approval нового plan SHA</div>`
          : ""
      }
      <div class="grid-stats">
        <div class="stat"><div class="n">${ac.auto_recovered_SKU ?? 0}</div><div class="l">Auto-recovered SKU</div></div>
        <div class="stat"><div class="n">${ac.vm_repair_required_sku ?? v.repair_required_sku ?? 0}</div><div class="l">VM repair-required SKU</div></div>
        <div class="stat"><div class="n">${ac.vm_repair_mutation_fields ?? ac.unique_production_mutations_planned ?? 0}</div><div class="l">Unique fields к repair</div></div>
        <div class="stat"><div class="n">${ac.already_matching_sku ?? v.already_matching_sku ?? 0}</div><div class="l">Already matches VM</div></div>
        <div class="stat"><div class="n">${(dims.ambiguous_sku || []).length}</div><div class="l">Ambiguous SKU</div></div>
        <div class="stat"><div class="n">${ac.source_conflict_sku ?? v.source_conflict_sku ?? 0}</div><div class="l">Source conflicts</div></div>
      </div>
      <h3 style="margin-top:1rem">Восстановлены габариты</h3>
      ${list(dims.applied_sku)}
      <h3 style="margin-top:1rem">Неоднозначные габариты</h3>
      ${list(dims.ambiguous_sku)}
      <h3 style="margin-top:1rem">Нет пригодных фото</h3>
      ${list(media.no_valid_media_sku)}
      <h3 style="margin-top:1rem">Media mapping repair</h3>
      ${list(media.mapping_repair_sku)}
      <p class="meta" style="margin-top:1rem">Новый repair plan SHA: <code>${esc(v.repair_plan_sha || "н/д")}</code></p>
      <p class="meta">Reaffirmed fingerprint: <code>${esc(v.combined_target_fingerprint || (STATE.target_binding || {}).combined_target_fingerprint || "н/д")}</code></p>
    </div>`;
}

function decisionsHTML() {
  const s = STATE.summary || {};
  const inv = invPolicy();
  const rows = Object.entries(STATE.decisions?.products || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sku, p]) => {
      const eff = p.action_type === "CREATE" ? effectiveInv(sku) : "";
      const ov = isInvOverride(sku);
      return `<tr>
        <td>${esc(sku)}</td>
        <td>${esc(p.action_type)}</td>
        <td>${esc(p.decision)}</td>
        <td>${esc(eff ? UX.saleHeadline(eff) : "")}${ov ? " · отдельно" : ""}</td>
        <td>${esc(p.note || "")}</td>
      </tr>`;
    })
    .join("");
  return `
    <div class="panel">
      <h2>Сводка решений</h2>
      <p>Всего SKU: <strong>${s.total}</strong> · pending: <strong>${s.pending}</strong> · нерешённых с учётом inventory/OL-65: <strong>${s.unresolved}</strong></p>
      <p>Одобрений по умолчанию: <strong>0</strong></p>
      <p>Продажа: режим <strong>${esc(MODE_RU[inv.global_mode] || "не выбран")}</strong>,
         общее правило <strong>${esc(inv.default_policy ? UX.saleHeadline(inv.default_policy) : "не выбрано")}</strong>,
         отдельных настроек <strong>${Object.keys(inv.sku_overrides || {}).length}</strong></p>
      <p>OL-65: ${esc(s.ol65_decision)}</p>
      <table class="table">
        <thead><tr><th>SKU</th><th>Тип</th><th>Решение</th><th>Продажа</th><th>Заметка</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function notesHTML() {
  const notes = STATE.technical_notes || [];
  return `
    <div class="panel">
      <h2>Технические notes</h2>
      ${notes
        .map(
          (n) => `
        <div style="margin:0.8rem 0;padding:0.7rem;border:1px solid var(--line);border-radius:10px">
          <strong>${esc(n.title)}</strong>
          <div class="meta">${esc(n.classification)}</div>
          <div class="meta">Блокирует публикацию: ${n.blocking_for_publication ? "да" : "нет"} · блокирует owner review: ${
            n.blocking_for_owner_review ? "да" : "нет"
          }</div>
        </div>`
        )
        .join("")}
      <p>Production adapter не изменялся. Локальный proposal для идемпотентности цен лежит в workspace.</p>
    </div>`;
}

function fillBatchSelect() {
  const sel = document.getElementById("batchDecision");
  const map = {
    create: CREATE_OPTS,
    update: UPDATE_OPTS,
    noop: NOOP_OPTS,
    ol65: OL65_OPTS,
    decisions: CREATE_OPTS,
    overview: CREATE_OPTS,
    inventory: CREATE_OPTS,
    auto: CREATE_OPTS,
    notes: CREATE_OPTS,
  };
  const opts = map[VIEW] || CREATE_OPTS;
  sel.innerHTML = opts.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("");
}

function productBySku(sku) {
  return (STATE.products || []).find((p) => p.sku === sku);
}

function setGalleryIndex(sku, index) {
  const p = productBySku(sku);
  if (!p) return;
  const n = galleryItems(p).length;
  if (!n) return;
  galleryIndexBySku.set(sku, UX.clampIndex(index, n));
  updateGalleryDom(sku);
}

function updateGalleryDom(sku) {
  const p = productBySku(sku);
  if (!p) return;
  const items = galleryItems(p);
  const n = items.length;
  const idx = galleryIndexFor(sku, n);
  const root = document.querySelector(`.card-gallery[data-sku="${sku}"]`);
  if (!root) return;
  const cur = items[idx];
  const img = root.querySelector(".gallery-main-img");
  const btn = root.querySelector(".gallery-main-btn");
  const counter = root.querySelector(".gallery-counter");
  if (img && cur) img.src = cur.thumb;
  if (btn && cur) btn.dataset.full = cur.full;
  if (counter) counter.textContent = n ? `${idx + 1} / ${n}` : "";
  root.querySelectorAll(".gallery-thumb").forEach((t, i) => {
    t.classList.toggle("active", i === idx);
  });
  preloadGalleryNeighbors(items, idx);
}

function preloadGalleryNeighbors(items, idx) {
  const prev = items[UX.prevIndex(idx, items.length)];
  const next = items[UX.nextIndex(idx, items.length)];
  [prev, next].forEach((item) => {
    if (!item) return;
    const im = new Image();
    im.src = item.full || item.thumb;
  });
}

function openLightbox(images, index, returnFocus) {
  if (!images.length) return;
  lightboxState = {
    images,
    index: UX.clampIndex(index, images.length),
    returnFocus: returnFocus || null,
  };
  const lb = document.getElementById("lightbox");
  lb.classList.remove("hidden");
  updateLightboxImage();
  const closeBtn = document.getElementById("lightboxClose");
  if (closeBtn) closeBtn.focus();
}

function closeLightbox() {
  const lb = document.getElementById("lightbox");
  lb.classList.add("hidden");
  if (lightboxState.returnFocus && typeof lightboxState.returnFocus.focus === "function") {
    lightboxState.returnFocus.focus();
  }
  lightboxState = { images: [], index: 0, returnFocus: null };
}

function updateLightboxImage() {
  const { images, index } = lightboxState;
  const n = images.length;
  if (!n) return;
  const cur = images[index];
  const img = document.getElementById("lightboxImg");
  const counter = document.getElementById("lightboxCounter");
  const prev = document.getElementById("lightboxPrev");
  const next = document.getElementById("lightboxNext");
  img.src = cur.full || cur.thumb;
  if (counter) counter.textContent = `${index + 1} / ${n}`;
  const showNav = n > 1;
  if (prev) {
    prev.disabled = !showNav;
    prev.classList.toggle("hidden", !showNav);
  }
  if (next) {
    next.disabled = !showNav;
    next.classList.toggle("hidden", !showNav);
  }
  preloadGalleryNeighbors(images, index);
}

function lightboxStep(delta) {
  const n = lightboxState.images.length;
  if (n <= 1) return;
  lightboxState.index =
    delta > 0 ? UX.nextIndex(lightboxState.index, n) : UX.prevIndex(lightboxState.index, n);
  updateLightboxImage();
}

function bindGallery() {
  document.querySelectorAll(".card-gallery").forEach((root) => {
    const sku = root.dataset.sku;
    const p = productBySku(sku);
    if (!p) return;
    const items = galleryItems(p);
    const idx = galleryIndexFor(sku, items.length);
    preloadGalleryNeighbors(items, idx);

    root.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setGalleryIndex(sku, UX.prevIndex(galleryIndexFor(sku, items.length), items.length));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setGalleryIndex(sku, UX.nextIndex(galleryIndexFor(sku, items.length), items.length));
      }
    });

    let touchX = null;
    root.addEventListener(
      "touchstart",
      (e) => {
        touchX = e.changedTouches[0]?.clientX ?? null;
      },
      { passive: true }
    );
    root.addEventListener(
      "touchend",
      (e) => {
        if (touchX == null || items.length <= 1) return;
        const endX = e.changedTouches[0]?.clientX ?? touchX;
        const dx = endX - touchX;
        touchX = null;
        if (Math.abs(dx) < 40) return;
        if (dx < 0) setGalleryIndex(sku, UX.nextIndex(galleryIndexFor(sku, items.length), items.length));
        else setGalleryIndex(sku, UX.prevIndex(galleryIndexFor(sku, items.length), items.length));
      },
      { passive: true }
    );
  });

  document.querySelectorAll(".gallery-prev").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const sku = btn.dataset.sku;
      const p = productBySku(sku);
      const n = galleryItems(p).length;
      setGalleryIndex(sku, UX.prevIndex(galleryIndexFor(sku, n), n));
    });
  });

  document.querySelectorAll(".gallery-next").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const sku = btn.dataset.sku;
      const p = productBySku(sku);
      const n = galleryItems(p).length;
      setGalleryIndex(sku, UX.nextIndex(galleryIndexFor(sku, n), n));
    });
  });

  document.querySelectorAll(".gallery-thumb").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const root = btn.closest(".card-gallery");
      const sku = root?.dataset.sku;
      if (!sku) return;
      setGalleryIndex(sku, Number(btn.dataset.index) || 0);
    });
  });

  document.querySelectorAll(".gallery-main-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const sku = btn.dataset.sku;
      const p = productBySku(sku);
      const items = galleryItems(p);
      if (!items.length) return;
      openLightbox(items, galleryIndexFor(sku, items.length), btn);
    });
  });

  document.querySelectorAll(".corrections-toggle").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const sku = btn.dataset.sku;
      if (correctionsExpanded.has(sku)) correctionsExpanded.delete(sku);
      else correctionsExpanded.add(sku);
      const details = document.getElementById(`corr-${sku}`);
      const open = correctionsExpanded.has(sku);
      if (details) details.classList.toggle("hidden", !open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.textContent = open ? "Скрыть детали" : "Показать детали";
    });
  });
}

function bindLightbox() {
  const lb = document.getElementById("lightbox");
  document.getElementById("lightboxClose")?.addEventListener("click", closeLightbox);
  document.getElementById("lightboxPrev")?.addEventListener("click", () => lightboxStep(-1));
  document.getElementById("lightboxNext")?.addEventListener("click", () => lightboxStep(1));

  lb?.addEventListener("click", (e) => {
    if (e.target === lb) closeLightbox();
  });

  document.addEventListener("keydown", (e) => {
    if (lb?.classList.contains("hidden")) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeLightbox();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      lightboxStep(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      lightboxStep(1);
    } else if (e.key === "Tab") {
      const focusable = lb.querySelectorAll(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const list = [...focusable].filter((el) => !el.classList.contains("hidden"));
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  let touchX = null;
  lb?.addEventListener(
    "touchstart",
    (e) => {
      touchX = e.changedTouches[0]?.clientX ?? null;
    },
    { passive: true }
  );
  lb?.addEventListener(
    "touchend",
    (e) => {
      if (touchX == null || lightboxState.images.length <= 1) return;
      const endX = e.changedTouches[0]?.clientX ?? touchX;
      const dx = endX - touchX;
      touchX = null;
      if (Math.abs(dx) < 40) return;
      lightboxStep(dx < 0 ? 1 : -1);
    },
    { passive: true }
  );
}

let lightboxBound = false;

function render() {
  renderTop();
  fillBatchSelect();
  const main = document.getElementById("main");
  if (VIEW === "overview") main.innerHTML = overviewHTML();
  else if (VIEW === "create") main.innerHTML = cardsHTML(productsFiltered("CREATE"));
  else if (VIEW === "update") main.innerHTML = cardsHTML(productsFiltered("UPDATE"));
  else if (VIEW === "noop") main.innerHTML = cardsHTML(productsFiltered("NO_OP"));
  else if (VIEW === "ol65") main.innerHTML = ol65HTML();
  else if (VIEW === "inventory") main.innerHTML = inventoryHTML();
  else if (VIEW === "auto") main.innerHTML = autoHTML();
  else if (VIEW === "decisions") main.innerHTML = decisionsHTML();
  else if (VIEW === "notes") main.innerHTML = notesHTML();
  bindDynamic();
}

function bindDynamic() {
  document.querySelectorAll(".save-dec").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const sku = btn.dataset.sku;
      const decision = document.querySelector(`.dec-select[data-sku="${sku}"]`).value;
      const note = document.querySelector(`.dec-note[data-sku="${sku}"]`).value;
      const res = await api("/api/decision", {
        method: "POST",
        body: JSON.stringify({ sku, decision, note }),
      });
      STATE.summary = res.summary;
      STATE.decisions.products[sku].decision = decision;
      STATE.decisions.products[sku].note = note;
      renderTop();
      btn.textContent = "Сохранено";
      setTimeout(() => (btn.textContent = "Сохранить"), 800);
    });
  });
  document.querySelectorAll(".sel").forEach((cb) => {
    cb.addEventListener("change", (e) => {
      e.stopPropagation();
      if (cb.checked) selected.add(cb.dataset.sku);
      else selected.delete(cb.dataset.sku);
    });
  });
  bindGallery();
  const saveOl65 = document.getElementById("saveOl65");
  if (saveOl65) {
    saveOl65.addEventListener("click", async () => {
      const decision = document.getElementById("ol65Decision").value;
      const res = await api("/api/ol65", { method: "POST", body: JSON.stringify({ decision }) });
      STATE.summary = res.summary;
      STATE.decisions.ol65_decision = decision;
      await load();
    });
  }
  const saveInv = document.getElementById("saveInv");
  if (saveInv) {
    saveInv.addEventListener("click", async () => {
      const modeEl = document.querySelector('input[name="invMode"]:checked');
      const defEl = document.querySelector('input[name="invDefault"]:checked');
      if (!modeEl) return alert("Выберите режим работы");
      if (!defEl) return alert("Выберите общее правило продажи");
      const body = {
        global_mode: modeEl.value,
        default_policy: defEl.value,
      };
      if (modeEl.value === "UNIFORM") body.sku_overrides = {};
      const res = await api("/api/inventory", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) return alert(res.error || "Не удалось сохранить");
      STATE.summary = res.summary;
      STATE.inventory_policy = res.inventory_policy;
      STATE.inventory_effective_per_sku = res.inventory_effective_per_sku;
      STATE.decisions.inventory_policy = res.inventory_policy;
      await load();
      alert("Настройки продажи сохранены локально");
    });
  }
  document.querySelectorAll(".save-inv-ov").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const sku = btn.dataset.sku;
      const sel = document.querySelector(`.inv-select[data-sku="${sku}"]`);
      const policy = sel?.value || "";
      const res = await api("/api/inventory", {
        method: "POST",
        body: JSON.stringify({ set_override: { sku, policy: policy || null } }),
      });
      if (!res.ok) return alert(res.error || "Ошибка override");
      STATE.summary = res.summary;
      STATE.inventory_policy = res.inventory_policy;
      STATE.inventory_effective_per_sku = res.inventory_effective_per_sku;
      STATE.decisions.inventory_policy = res.inventory_policy;
      render();
    });
  });
  document.querySelectorAll(".clear-inv-ov").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const sku = btn.dataset.sku;
      const res = await api("/api/inventory", {
        method: "POST",
        body: JSON.stringify({ clear_override: sku }),
      });
      if (!res.ok) return alert(res.error || "Ошибка");
      STATE.summary = res.summary;
      STATE.inventory_policy = res.inventory_policy;
      STATE.inventory_effective_per_sku = res.inventory_effective_per_sku;
      STATE.decisions.inventory_policy = res.inventory_policy;
      render();
    });
  });
}

document.getElementById("nav").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-view]");
  if (!btn) return;
  VIEW = btn.dataset.view;
  document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("active", b === btn));
  render();
});

["search", "filterClass", "filterDecision", "filterOverrides"].forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("input", () => {
    if (["create", "update", "noop"].includes(VIEW)) render();
  });
  el.addEventListener("change", () => {
    if (["create", "update", "noop", "inventory"].includes(VIEW)) render();
  });
});

document.getElementById("selectAllVisible").addEventListener("change", (e) => {
  const list =
    VIEW === "create"
      ? productsFiltered("CREATE")
      : VIEW === "update"
        ? productsFiltered("UPDATE")
        : VIEW === "noop"
          ? productsFiltered("NO_OP")
          : VIEW === "ol65"
            ? productsFiltered("TOPOLOGY")
            : [];
  list.forEach((p) => {
    if (e.target.checked) selected.add(p.sku);
    else selected.delete(p.sku);
  });
  render();
});

document.getElementById("btnBatch").addEventListener("click", async () => {
  const skus = [...selected];
  if (!skus.length) return alert("Ничего не выбрано");
  const decision = document.getElementById("batchDecision").value;
  const res = await api("/api/batch", {
    method: "POST",
    body: JSON.stringify({ skus, decision, note: "" }),
  });
  STATE.summary = res.summary;
  await load();
});

document.getElementById("btnUndo").addEventListener("click", async () => {
  const res = await api("/api/undo", { method: "POST", body: "{}" });
  if (!res.ok) return alert("Нечего отменять");
  await load();
});

document.getElementById("btnExport").addEventListener("click", async () => {
  const payload = await api("/api/export");
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "OWNER-PUBLICATION-DECISIONS.export.json";
  a.click();
});

bindLightbox();
lightboxBound = true;

load();
