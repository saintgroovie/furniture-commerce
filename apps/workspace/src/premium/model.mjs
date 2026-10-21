export const TODAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Moscow",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
export const uid = (prefix = "id") => `${prefix}-${crypto.randomUUID()}`;
export const money = (minor = 0) =>
  new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 2,
  }).format(minor / 100);
export const date = (value, long = false) =>
  value
    ? new Intl.DateTimeFormat("ru-RU", {
        day: "numeric",
        month: long ? "long" : "short",
        timeZone: "Europe/Moscow",
      }).format(
        new Date(value.length === 10 ? `${value}T12:00:00+03:00` : value),
      )
    : "Не указана";
export const timestamp = () => new Date().toISOString();
export function toMinor(value) {
  const str = String(value).trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(str))
    throw new Error("Укажите сумму с точностью до копеек");
  const [r, k = ""] = str.split(".");
  const n = Number(r) * 100 + Number(k.padEnd(2, "0"));
  if (!Number.isSafeInteger(n) || n > 100000000000)
    throw new Error("Сумма слишком велика");
  return n;
}
export function invoiceTotal(lines, discount = 0, vat = "none") {
  if (!lines.length) throw new Error("Добавьте хотя бы одну позицию");
  const percentage = Number(discount);
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100)
    throw new Error("Скидка должна быть от 0 до 100%");
  const subtotal = lines.reduce((sum, line) => {
    const qty = Number(line.qty),
      price = toMinor(line.price);
    if (!line.name.trim() || !Number.isFinite(qty) || qty <= 0 || qty > 100000)
      throw new Error(
        "У каждой позиции нужны название и положительное количество",
      );
    return sum + Math.round(price * qty);
  }, 0);
  const reduction = Math.round((subtotal * percentage) / 100),
    total = subtotal - reduction;
  if (!Number.isSafeInteger(total)) throw new Error("Сумма слишком велика");
  const rate = vat === "none" ? 0 : Number(vat);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100)
    throw new Error("Некорректная ставка НДС");
  return {
    subtotal,
    discount: reduction,
    total,
    tax: Math.round((total * rate) / (100 + rate)),
  };
}
export function paymentStatus(invoice) {
  if (invoice.status === "canceled") return "Аннулирован";
  const paid = (invoice.payments || []).reduce((s, p) => s + p.amount, 0),
    total = invoiceTotal(invoice.lines, invoice.discount, invoice.vat).total;
  return paid >= total && total > 0
    ? "Оплачен"
    : paid > 0
      ? "Частично оплачен"
      : invoice.status === "ready"
        ? "Подготовлен"
        : "Черновик";
}
export function validatePayment(invoice, amount) {
  const minor = toMinor(amount),
    paid = (invoice.payments || []).reduce((s, p) => s + p.amount, 0);
  const due =
    invoiceTotal(invoice.lines, invoice.discount, invoice.vat).total - paid;
  if (invoice.status === "canceled")
    throw new Error("Нельзя добавить оплату к аннулированному счёту");
  if (minor <= 0 || minor > due)
    throw new Error(
      `Сумма должна быть больше нуля и не превышать остаток ${money(due)}`,
    );
  return minor;
}
export const STATUS = {
  new: "Новое",
  working: "В работе",
  waiting: "Ждём клиента",
  done: "Завершено",
  draft: "Черновик",
  published: "На витрине",
  blocked: "Нужны данные",
};
export const STAGES = [
  "Подтверждение",
  "Изготовление",
  "Контроль качества",
  "Готов к передаче",
  "Приостановлен",
];
export const FILE_LIMIT = 20 * 1024 * 1024;
export const FILE_EXT = [
  "pdf",
  "jpg",
  "jpeg",
  "png",
  "webp",
  "txt",
  "csv",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "zip",
];
export function validateFile(file, existing = []) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (!FILE_EXT.includes(ext))
    throw new Error(
      `«${file.name}»: формат не поддерживается. Подойдут PDF, изображения, Office, TXT, CSV или ZIP.`,
    );
  if (file.size === 0) throw new Error(`«${file.name}»: файл пустой`);
  if (file.size > FILE_LIMIT)
    throw new Error(`«${file.name}»: размер больше 20 МБ`);
  if (
    existing.some(
      (f) =>
        !f.archived &&
        f.originalName === file.name &&
        f.size === file.size &&
        f.lastModified === file.lastModified,
    )
  )
    throw new Error(`«${file.name}» уже прикреплён к этому объекту`);
}
export const fileSize = (n) =>
  n > 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} МБ`
    : `${Math.max(1, Math.round(n / 1024))} КБ`;
export const plural = (n, one, few, many) =>
  `${n} ${n % 100 >= 11 && n % 100 <= 14 ? many : n % 10 === 1 ? one : n % 10 >= 2 && n % 10 <= 4 ? few : many}`;
export function reconcileCatalog(data) {
  if (data.mode === "live") return data;
  return {
    ...data,
    products: data.products.map((p) => {
      const hasPhoto = data.files.some(
        (f) =>
          !f.archived &&
          f.objectId === p.id &&
          /\.(jpg|jpeg|png|webp)$/i.test(f.name),
      );
      const issues = (p.issues || []).filter(
        (x) =>
          ![
            "Нет фото",
            "Нет главного фото",
            "Нет цены",
            "Нет описания",
          ].includes(x) &&
          !(x === "Не указаны размеры" && p.width && p.height && p.depth),
      );
      if (!hasPhoto) issues.push("Нет фото");
      else if (!data.files.some((f) => f.id === p.mainFileId && !f.archived))
        issues.push("Нет главного фото");
      if (p.type !== "BESPOKE" && !(Number(p.price) > 0))
        issues.push("Нет цены");
      if (!p.description.trim()) issues.push("Нет описания");
      return { ...p, issues };
    }),
  };
}
export const event = (text, kind = "Изменение") => ({
  id: uid("event"),
  at: timestamp(),
  text,
  kind,
  author: "Вы",
});
export function withObjectEvent(data, objectId, item) {
  const result = { ...data };
  for (const key of [
    "requests",
    "orders",
    "people",
    "companies",
    "products",
    "rooms",
  ])
    result[key] = data[key].map((x) =>
      x.id === objectId ? { ...x, history: [item, ...(x.history || [])] } : x,
    );
  return result;
}
export function todayGroups(data) {
  if (data.mode === "live") {
    const requests = data.requests.filter((r) => r.status !== "completed");
    const row = (r) => ({
      id: r.id,
      title: r.title,
      sub: `${r.statusLabel} · Обращение ${r.id}`,
      kind: "request",
      due: "",
    });
    return [
      {
        title: "Новые обращения",
        tone: "attention",
        items: requests.filter((r) => r.status === "new").map(row),
      },
      {
        title: "Обращения в работе",
        tone: "positive",
        items: requests
          .filter((r) => !["new", "quote_sent"].includes(r.status))
          .map(row),
      },
      {
        title: "Расчёт отправлен",
        tone: "waiting",
        items: requests.filter((r) => r.status === "quote_sent").map(row),
      },
      {
        title: "Заказы, требующие внимания",
        tone: "attention",
        items: data.orders
          .filter((o) =>
            [
              "new",
              "needs_confirmation",
              "specification_in_progress",
              "quality_control",
              "ready_for_delivery",
            ].includes(o.stageCode),
          )
          .map((o) => ({
            id: o.id,
            title: `Заказ ${o.displayId}`,
            sub: o.stage,
            kind: "order",
            due: "",
          })),
      },
      {
        title: "Проверки каталога",
        tone: "waiting",
        items: data.products
          .filter((p) => p.issues.length)
          .map((p) => ({
            id: p.id,
            title: p.name,
            sub: p.issues.join(" · "),
            kind: "product",
            due: "",
          })),
      },
      {
        title: "Сверка подключения каталога",
        tone: "waiting",
        items: data.products
          .filter((p) => p.integrationWarnings?.length)
          .map((p) => ({
            id: p.id,
            title: p.name,
            sub: "Коллекция заполнена, но проверка Medusa её не распознаёт",
            kind: "product",
            systemReview: true,
            due: "",
          })),
      },
    ].filter((g) => g.items.length);
  }
  const active = data.requests.filter(
    (r) => !["done", "completed"].includes(r.status),
  );
  const rows = active.map((r) => ({
    id: r.id,
    title: r.title,
    sub: `${r.next} · Обращение ${r.id}`,
    kind: "request",
    due: r.due,
    waiting: r.status === "waiting",
  }));
  rows.push(
    ...data.orders
      .filter((o) => o.due === TODAY)
      .map((o) => ({
        id: o.id,
        title: `Заказ ${o.id}`,
        sub: o.next,
        kind: "order",
        due: o.due,
      })),
  );
  rows.push(
    ...data.reminders
      .filter((r) => !r.completed && r.due <= TODAY)
      .map((r) => ({
        id: r.id,
        title: r.title,
        sub: "Напоминание",
        kind: "reminder",
        due: r.due,
        objectId: r.objectId,
      })),
  );
  return [
    {
      title: "Просрочено",
      tone: "critical",
      items: rows.filter((r) => !r.waiting && r.due && r.due < TODAY),
    },
    {
      title: "На сегодня",
      tone: "positive",
      items: rows.filter((r) => !r.waiting && r.due === TODAY),
    },
    {
      title: "Ждём клиента",
      tone: "attention",
      items: rows.filter((r) => r.waiting),
    },
    {
      title: "Данные каталога",
      tone: "waiting",
      items: data.products
        .filter((p) => p.issues.length)
        .map((p) => ({
          id: p.id,
          title: "Обновить карточку товара",
          sub: `${p.name} · ${p.issues.join(", ").toLowerCase()}`,
          kind: "product",
          due: TODAY,
        })),
    },
  ].filter((g) => g.items.length);
}
