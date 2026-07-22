/* global fetch, document, localStorage */
let state = null
let tab = "needs"

const CATEGORY_DECISIONS = [
  ["approve_proposed_category", "Принять предложенную категорию", "approved"],
  ["choose_other_category", "Другая категория…", "approved"],
  ["intentionally_uncategorized", "Намеренно без категории", "intentionally_unassigned"],
  ["defer", "Отложить", "deferred"],
  ["needs_more_evidence", "Нужно больше данных", "needs_more_evidence"],
  ["reject_proposal", "Отклонить предложение", "rejected"],
]

const COLLECTION_DECISIONS = [
  ["assign_proposed_collection", "Назначить предложенную коллекцию", "approved"],
  ["choose_other_collection", "Другая коллекция…", "approved"],
  ["intentionally_unassigned", "Намеренно без коллекции", "intentionally_unassigned"],
  ["legacy_or_paused", "Legacy / на паузе", "approved"],
  ["defer", "Отложить", "deferred"],
  ["needs_more_evidence", "Нужно больше данных", "needs_more_evidence"],
  ["reject_proposal", "Отклонить предложение", "rejected"],
]

const MIRROR_DECISIONS = [
  ["pure_mirror_accessory", "Чистое зеркало / аксессуар", "approved"],
  ["furniture_with_mirror", "Мебель с зеркалом", "approved"],
  ["other", "Другое", "approved"],
  ["defer", "Отложить", "deferred"],
  ["needs_more_evidence", "Нужно больше данных", "needs_more_evidence"],
]

async function bootstrap() {
  const res = await fetch("/api/bootstrap")
  state = await res.json()
  const savedReviewer = localStorage.getItem("woodright_owner_reviewer") || ""
  document.getElementById("reviewer").value = savedReviewer
  render()
}

function decisionFor(row, field) {
  const bucket = row.bucket
  return (state.decisions || {})[`${row.product_id}::${bucket}::${field}`] || null
}

function isPending(d) {
  return !d || !d.status || d.status === "pending" || d.status === "proposed"
}

function isDeferred(d) {
  return d && (d.status === "deferred" || d.status === "auto_deferred_no_image")
}

function isResolved(d) {
  return d && !isPending(d) && !isDeferred(d) && d.status !== "needs_more_evidence"
}

function fieldFor(row) {
  return (row.field_keys && row.field_keys[0]) || "category"
}

function filterRows() {
  const rows = state.rows || []
  if (tab === "engineering") return []
  if (tab === "preview") return []
  return rows.filter((row) => {
    const field = fieldFor(row)
    const d = decisionFor(row, field)
    if (tab === "category") return row.bucket === "category_gap" || row.bucket === "title_fallback"
    if (tab === "collection") return row.bucket === "collection_missing" || row.bucket === "collection_null"
    if (tab === "mirrors") return row.bucket === "ambiguous_mirror"
    if (tab === "deferred") return isDeferred(d)
    if (tab === "resolved") return isResolved(d)
    // needs decision: pending and not auto-deferred
    return isPending(d) && !isDeferred(d)
  })
}

function renderSummary() {
  const s = state.summary || {}
  document.getElementById("summary").innerHTML = `
    <div><strong>${s.owner_rows ?? 0}</strong>решений владельца</div>
    <div><strong>${s.pending ?? 0}</strong>ожидают</div>
    <div><strong>${s.deferred ?? 0}</strong>отложено</div>
    <div><strong>${s.approved ?? 0}</strong>одобрено</div>
    <div><strong>${s.rejected ?? 0}</strong>отклонено</div>
    <div><strong>${s.engineering_only ?? 0}</strong>инженерных</div>
  `
}

function proposalTaxonomy(row) {
  if (row.bucket === "collection_null") return "likely_intentionally_unassigned"
  if (row.bucket === "collection_missing") return "likely_missing_collection"
  if (row.confidence === "low") return "insufficient_evidence"
  return row.proposal_taxonomy || "insufficient_evidence"
}

function decisionButtons(row) {
  const field = fieldFor(row)
  let list = CATEGORY_DECISIONS
  if (field === "collection") list = COLLECTION_DECISIONS
  if (field === "mirror_classification") list = MIRROR_DECISIONS
  return list
    .map(
      ([decision, label, status]) =>
        `<button type="button" data-decision="${decision}" data-status="${status}" data-pid="${row.product_id}" data-field="${field}" data-bucket="${row.bucket}">${label}</button>`
    )
    .join("")
}

function cardHtml(row) {
  const field = fieldFor(row)
  const d = decisionFor(row, field)
  const media = row.media || {}
  const img = media.preview_url || row.image_url || row.thumbnail
  const status = (d && d.status) || "pending"
  const pdp = row.handle ? `https://woodright-demo.ru/products/${row.handle}` : "#"
  const current =
    field === "category"
      ? row.current_category
      : field === "collection"
        ? row.current_collection
        : row.current_value
  const proposed =
    field === "category"
      ? row.proposed_category
      : field === "collection"
        ? row.proposed_collection
        : row.proposed_value

  return `<article class="card" data-product-id="${row.product_id}">
    <div class="media" style="${img ? `background-image:url('${img}')` : ""}">
      <span class="badge">${media.status || "media_unknown"}</span>
    </div>
    <div class="body">
      <h2 class="title">${esc(row.title || "Без названия")}</h2>
      <div class="meta">
        <div>${esc(row.product_id)}</div>
        <div>handle: ${esc(row.handle || "—")}</div>
        <div><a href="${pdp}" target="_blank" rel="noreferrer">PDP</a></div>
        <div><span class="status-pill ${status}">${esc(status)}</span></div>
      </div>
      <div class="kv">
        <span>Коллекция</span><div>${esc(row.current_collection ?? "null")}</div>
        <span>Категория</span><div>${esc(row.current_category ?? "null")}</div>
        <span>Сейчас (${esc(field)})</span><div>${esc(current ?? "null")}</div>
        <span>Предложение</span><div>${esc(proposed ?? "—")}</div>
        <span>Уверенность</span><div>${esc(row.confidence ?? "—")}</div>
        ${
          field === "collection"
            ? `<span>Таксономия</span><div>${esc(proposalTaxonomy(row))} (proposal)</div>`
            : ""
        }
      </div>
      <div class="impact"><strong>Для покупателя:</strong> ${esc(buyerImpact(row, field))}</div>
      <label>Комментарий
        <textarea class="comment" data-comment-for="${row.product_id}::${row.bucket}::${field}" placeholder="Необязательно">${esc((d && d.owner_comment) || "")}</textarea>
      </label>
      <div class="actions">
        ${decisionButtons(row)}
      </div>
      <details>
        <summary>Почему товар попал сюда</summary>
        <pre>${esc(JSON.stringify(row.evidence || row.reason || row.bucket, null, 2))}</pre>
        <div>Проверки media: ${(media.checks || []).map(esc).join(", ") || "—"}</div>
      </details>
    </div>
  </article>`
}

function buyerImpact(row, field) {
  if (row.bucket === "title_fallback") {
    return "Сейчас категория для покупателя опирается на title fallback; после structured fix fallback не понадобится"
  }
  if (field === "category") return "Категория влияет на навигацию и фильтры каталога"
  if (field === "collection") return "Коллекция влияет на группировку и витрины; null может быть намеренным"
  if (field === "mirror_classification") {
    return "Риск перепутать чистое зеркало и мебель с зеркалом в мерчандайзинге"
  }
  return "Изменение будет видно покупателю после будущего apply"
}

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

async function render() {
  renderSummary()
  const main = document.getElementById("main")
  const preview = document.getElementById("preview-panel")
  if (tab === "preview") {
    main.classList.add("hidden")
    main.innerHTML = ""
    preview.classList.remove("hidden")
    const res = await fetch("/api/preview")
    const data = await res.json()
    preview.innerHTML = `<h2>Превью будущих мутаций</h2>
      <p>Apply не выполняется. Маркер: <code>not_authorized_for_apply</code></p>
      <pre>${esc(JSON.stringify(data, null, 2))}</pre>`
    return
  }
  preview.classList.add("hidden")
  main.classList.remove("hidden")

  if (tab === "engineering") {
    const eng = state.engineering || []
    main.innerHTML =
      eng
        .map(
          (e) => `<article class="card engineering"><div class="eng-note">
            <h2 class="title">${esc(e.title || e.product_id)}</h2>
            <div class="meta">${esc(e.product_id)} · ${esc(e.handle || "")}</div>
            <p>Инженерная задача DTO/projection. Кнопок owner approval нет. В mutation dry-run не входит.</p>
            <pre>${esc(e.note || `${e.category_state} / ${e.collection_state}`)}</pre>
          </div></article>`
        )
        .join("") || `<div class="empty">Инженерных замечаний нет</div>`
    return
  }

  const rows = filterRows()
  main.innerHTML = rows.map(cardHtml).join("") || `<div class="empty">В этой очереди пусто</div>`
}

async function postDecision(payload) {
  const res = await fetch("/api/decision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  const data = await res.json()
  if (!data.ok) {
    alert(data.error || "Ошибка решения")
    return
  }
  state.decisions = data.decisions
  state.summary = data.summary
  render()
}

document.getElementById("tabs").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-tab]")
  if (!btn) return
  tab = btn.dataset.tab
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b === btn))
  render()
})

document.getElementById("main").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-decision]")
  if (!btn) return
  const reviewer = document.getElementById("reviewer").value.trim()
  localStorage.setItem("woodright_owner_reviewer", reviewer)
  if (!reviewer && btn.dataset.status === "approved") {
    alert("Укажите имя рецензента перед одобрением")
    return
  }
  const field = btn.dataset.field
  const pid = btn.dataset.pid
  const bucket = btn.dataset.bucket
  const row = state.rows.find((r) => r.product_id === pid && r.bucket === bucket)
  if (!row) {
    alert("Строка не найдена в packet")
    return
  }
  let chosen = null
  if (String(btn.dataset.decision).startsWith("choose_other")) {
    chosen = prompt("Введите другое значение")
    if (!chosen) return
  }
  const commentEl = document.querySelector(`textarea[data-comment-for="${pid}::${bucket}::${field}"]`)
  await postDecision({
    product_id: pid,
    bucket,
    decision: btn.dataset.decision,
    reviewer: reviewer || "owner",
    owner_comment: commentEl ? commentEl.value : "",
    chosen_value: chosen,
  })
})

document.getElementById("btn-undo").addEventListener("click", async () => {
  const res = await fetch("/api/undo", { method: "POST" })
  const data = await res.json()
  state.decisions = data.decisions
  state.summary = data.summary
  render()
})

document.getElementById("btn-export").addEventListener("click", async () => {
  const res = await fetch("/api/export")
  const data = await res.json()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = `owner-decisions-export-${Date.now()}.json`
  a.click()
})

document.getElementById("btn-reload").addEventListener("click", () => bootstrap())

bootstrap()
