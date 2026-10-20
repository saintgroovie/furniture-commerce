// Presentation only. Medusa facts stay in Medusa; never seed or persist this snapshot.
const text = (value) => (typeof value === "string" ? value : "");
const array = (value) => (Array.isArray(value) ? value : []);
const initials = (value) =>
  value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((x) => x[0])
    .join("")
    .toUpperCase();
export const stageLabels = {
  new: "Новый",
  needs_confirmation: "Требует подтверждения",
  specification_in_progress: "Уточнение спецификации",
  awaiting_customer_approval: "Ждём согласования",
  confirmed: "Подтверждён",
  in_production: "Изготовление",
  quality_control: "Контроль качества",
  ready_for_delivery: "Готов к передаче",
  handed_over: "Передан",
  paused: "Приостановлен",
  canceled: "Отменён",
};
const paymentLabels = {
  not_paid: "Не оплачен",
  awaiting: "Ожидает оплаты",
  authorized: "Авторизован",
  partially_authorized: "Частично авторизован",
  captured: "Оплачен",
  partially_captured: "Частично оплачен",
  refunded: "Возвращён",
  partially_refunded: "Частичный возврат",
  canceled: "Отменён",
  requires_action: "Нужно действие",
};
const deliveryLabels = {
  not_fulfilled: "Не передан",
  partially_fulfilled: "Частично подготовлен",
  fulfilled: "Подготовлен",
  partially_shipped: "Частично отправлен",
  shipped: "Отправлен",
  partially_delivered: "Частично доставлен",
  delivered: "Доставлен",
  canceled: "Отменена",
};
const requestLabels = {
  new: "Новое",
  contacted: "Связались",
  quote_sent: "Расчёт отправлен",
  paid: "Оплачено",
  in_production: "В производстве",
  completed: "Завершено",
};
export function projectLive(sources, session, sourceStates, identity) {
  const people = array(sources.people?.leads).map((p) => ({
    id: text(p.id),
    name: text(p.name) || "Имя не указано",
    initials: initials(text(p.name)) || "?",
    email: text(p.email),
    phone: text(p.phone),
    source: text(p.source),
    role: "Лид",
    companyId: "",
    assignee: "Не назначен",
    history: [],
    comment: text(p.comment),
  }));
  const requests = array(sources.requests?.bespoke_requests).map((r) => ({
    id: text(r.id),
    title:
      text(r.comment).split("\n")[0].slice(0, 140) ||
      "Запрос индивидуального расчёта",
    personId: text(r.lead_id),
    status: text(r.status),
    statusLabel: requestLabels[r.status] || text(r.status),
    source: "Сайт",
    next: "",
    due: "",
    note: text(r.comment),
    internalNotes: text(r.internal_notes),
    updatedAt: text(r.updated_at),
    dimensions: text(r.dimensions),
    materials: text(r.materials),
    budget: text(r.budget),
    productId: text(r.product_id),
    roomId: text(r.room_set_id),
    history: r.internal_notes
      ? [
          {
            id: `${r.id}-notes`,
            text: text(r.internal_notes),
            at: text(r.updated_at),
            kind: "Внутренние заметки",
            author: "Команда",
          },
        ]
      : [],
  }));
  const processes = new Map(
    array(sources.processes?.order_processes).map((p) => [
      p.medusa_order_id || p.order_id,
      p,
    ]),
  );
  const orders = array(sources.orders?.orders).map((o) => {
    const process = processes.get(o.id);
    return {
      id: text(o.id),
      title: `№ ${o.display_id ?? o.id}`,
      displayId: o.display_id ?? o.id,
      personId: "",
      email: text(o.email),
      stage: process
        ? stageLabels[process.current_stage] || process.current_stage
        : "Не начато",
      stageCode: process?.current_stage ?? null,
      processVersion: process?.version ?? null,
      payment:
        paymentLabels[o.payment_status] ||
        text(o.payment_status) ||
        "Не указан",
      delivery:
        deliveryLabels[o.fulfillment_status] ||
        text(o.fulfillment_status) ||
        "Не указана",
      currency: text(o.currency_code).toUpperCase(),
      totalMinor: o.total == null ? null : Math.round(Number(o.total) * 100),
      requestId: "",
      estimate: text(process?.estimated_completion_date),
      due: "",
      next: "",
      note: text(process?.internal_note),
      history: [],
      lines: array(o.items).map((l) => ({
        id: l.id,
        name: text(l.title) || text(l.product_title) || "Позиция",
        qty: Number(l.quantity),
        price: String(l.unit_price ?? 0),
      })),
    };
  });
  const files = [];
  const products = array(sources.products?.products).map((p) => {
    const urls = [
      ...new Set(
        [p.thumbnail, ...array(p.image_urls)].filter(
          (x) => typeof x === "string" && x,
        ),
      ),
    ];
    const photos = urls.map((url, index) => ({
      id: `${p.id}:photo:${index}`,
      objectId: p.id,
      name: `${text(p.title) || "Товар"} · фото ${index + 1}.jpg`,
      originalName: "",
      mediaIndex: index,
      type: "image/jpeg",
      size: 0,
      category: "Фотография товара",
      at: text(p.updated_at),
      author: "Каталог Medusa",
      archived: false,
      remote: true,
    }));
    files.push(...photos);
    const prices = p.price_display || {};
    const price =
      prices.kind === "single"
        ? prices.amount
        : prices.kind === "range"
          ? prices.min
          : null;
    const priceLabel =
      prices.kind === "range"
        ? `${Number(prices.min).toLocaleString("ru-RU")} – ${Number(prices.max).toLocaleString("ru-RU")} ₽`
        : price == null
          ? "Цена не задана"
          : `${Number(price).toLocaleString("ru-RU")} ₽`;
    return {
      id: text(p.id),
      name: text(p.title),
      sku: array(p.skus).join(" · "),
      type: text(p.classification) || "UNKNOWN",
      collection: text(p.collection_label),
      price: price == null ? "" : String(price),
      priceLabel,
      variants: array(p.variants),
      status: text(p.status),
      description: text(p.description),
      issues: array(p.publish?.blockers)
        .filter(
          (x) => !(x.code === "missing_collection" && text(p.collection_label)),
        )
        .map((x) => text(x.message)),
      integrationWarnings: array(p.publish?.blockers)
        .filter(
          (x) => x.code === "missing_collection" && text(p.collection_label),
        )
        .map(
          () =>
            "Коллекция заполнена в карточке, но проверка публикации Medusa её не распознаёт. Требуется сверка подключения.",
        ),
      warnings: array(p.publish?.warnings).map((x) => text(x.message)),
      publishReady: p.publish?.ready === true,
      mainFileId: photos[0]?.id || "",
      photoOrder: photos.map((f) => f.id),
      width: p.dimensions?.width_mm ? String(p.dimensions.width_mm / 10) : "",
      height: p.dimensions?.height_mm
        ? String(p.dimensions.height_mm / 10)
        : "",
      depth: p.dimensions?.depth_mm ? String(p.dimensions.depth_mm / 10) : "",
      history: [],
      updatedAt: text(p.updated_at),
    };
  });
  const rooms = array(sources.rooms?.room_sets).map((r) => ({
    id: text(r.id),
    name: text(r.title),
    description: text(r.description),
    productIds: [],
    status: r.is_active ? "published" : "draft",
    history: [],
    compositionAvailable: false,
  }));
  return {
    version: 2,
    mode: "live",
    people,
    requests,
    orders,
    products,
    rooms,
    companies: [],
    invoices: [],
    files,
    reminders: [],
    activity: [],
    prefs: { density: "comfortable" },
    session: { email: session.email },
    sourceStates,
    identity,
    loadedAt: new Date().toISOString(),
    capabilities: {
      requestUpdate: false,
      manufacturingTransition: false,
      documents: false,
      attachments: false,
      crmCreate: false,
      companies: false,
      reminders: false,
      mail: false,
    },
  };
}
